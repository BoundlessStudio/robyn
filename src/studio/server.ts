import "server-only";
import { requireUser, type DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { hasSameOrigin } from "@/lib/request-origin";
import { studioApps } from "./apps/registry";
import { creativeDirector } from "./director";
import { isAppReady } from "./manifest";
import { requireUuid } from "./assets";

export const STUDIO_BUCKET = "studio-assets";
export const profiles = [
  { key: creativeDirector.id, kind: "director", appId: null, role: creativeDirector.role, version: "0.1.0", instructions: creativeDirector.instructions },
  ...studioApps.map(app => ({ key: app.id, kind: "specialist", appId: app.id, role: app.employee.role, version: app.version, instructions: app.employee.instructions })),
];

export async function requireStudio() {
  const { db, user } = await requireUser();
  const { data: workspaceId, error } = await db.rpc("initialize_studio", { p_owner: user.id, p_profiles: profiles });
  if (error || !workspaceId) throw new ApiError(503, "studio_unavailable", "The studio could not be initialized. Please try again.");
  const { data: workspace, error: readError } = await db.from("workspaces").select("*").eq("id", workspaceId).eq("owner_id", user.id).single();
  if (readError || !workspace) throw new ApiError(404, "not_found", "Studio not found.");
  return { db, user, workspace, workspaceId: workspaceId as string };
}

export function id(value: unknown, label?: string) {
  try { return requireUuid(value, label); }
  catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }
}

export function appFor(id: unknown) {
  const app = studioApps.find(app => app.id === id);
  if (!app) throw new ApiError(400, "invalid_application", "Choose an application in this studio.");
  return app;
}

export function publicApps() {
  return studioApps.map(app => ({ id: app.id, name: app.name, role: app.employee.role, color: app.color, monogram: app.monogram, category: app.category, tagline: app.tagline, capabilities: app.capabilities, ready: isAppReady(app), editorStatus: app.editor.status, workstationStatus: app.workstation.status }));
}

export async function readStudioBody(request: Request): Promise<Record<string, unknown>> {
  if (!hasSameOrigin(request)) throw new ApiError(403, "origin_mismatch", "Submit this request from your studio.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "invalid_content_type", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_request", "A request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) { await reader.cancel(); throw new ApiError(413, "request_too_large", "Transfer media directly to private Storage. This endpoint accepts metadata only."); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, "invalid_request", "Invalid JSON request."); }
}

export function textField(value: unknown, max: number, label: string, optional = false): string {
  const text = typeof value === "string" ? value.trim() : "";
  if ((!optional && !text) || text.length > max) throw new ApiError(400, "invalid_request", `${label} must be ${optional ? "at most" : "between 1 and"} ${max} characters.`);
  return text;
}

export function dbFailure(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (/not found|dependency unavailable|source revision unavailable/.test(error.message)) throw new ApiError(404, "not_found", "The asset or one of its dependencies is unavailable.");
  if (/incomplete upload|native master required/.test(error.message)) throw new ApiError(409, "incomplete_upload", "Finish uploading the complete native package before saving.");
  if (/immutable|not open|invalid base/.test(error.message)) throw new ApiError(409, "revision_closed", "This revision cannot be changed. Start a new revision from the current saved version.");
  console.error("[studio] database operation failed", error.code);
  throw new ApiError(500, "database_error", "The studio could not complete this operation.");
}

export async function ownedProject(db: DB, workspaceId: string, projectId: string) {
  const { data, error } = await db.from("studio_projects").select("*").eq("workspace_id", workspaceId).eq("id", id(projectId)).maybeSingle();
  dbFailure(error);
  if (!data) throw new ApiError(404, "not_found", "Project not found.");
  return data;
}

export async function ownedAsset(db: DB, workspaceId: string, assetId: string) {
  const { data, error } = await db.from("studio_assets").select("*").eq("workspace_id", workspaceId).eq("id", id(assetId)).maybeSingle();
  dbFailure(error);
  if (!data) throw new ApiError(404, "not_found", "Asset not found.");
  return data;
}

export async function ownedRevision(db: DB, workspaceId: string, revisionId: string) {
  const { data, error } = await db.from("studio_revisions").select("*").eq("workspace_id", workspaceId).eq("id", id(revisionId)).maybeSingle();
  dbFailure(error);
  if (!data) throw new ApiError(404, "not_found", "Revision not found.");
  return data;
}

export interface StoredFile { id: string; path: string; role: string; mime_type: string; bytes: number; sha256: string; storage_key: string }
export async function revisionFiles(db: DB, workspaceId: string, revisionId: string): Promise<StoredFile[]> {
  const { data, error } = await db.from("studio_package_files").select("*").eq("workspace_id", workspaceId).eq("revision_id", revisionId).order("path");
  dbFailure(error);
  return (data ?? []) as StoredFile[];
}

export async function mapInBatches<T, R>(items: T[], action: (item: T) => Promise<R>, size = 8): Promise<R[]> {
  const output: R[] = [];
  for (let i = 0; i < items.length; i += size) output.push(...await Promise.all(items.slice(i, i + size).map(action)));
  return output;
}

/** Only committed current revisions from this owned studio can supply a cover.
 * Signed URLs send image bytes directly from private Storage to the browser. */
export async function withAssetPreviews<T extends {current_revision_id:string|null}>(db: DB, workspaceId:string, assets:T[]) {
  const ids=assets.flatMap(asset=>asset.current_revision_id?[asset.current_revision_id]:[]);
  if(!ids.length)return assets.map(asset=>({...asset,preview_url:null as string|null}));
  const covers=new Map<string,string>();
  for(let offset=0;offset<ids.length;offset+=100){
    const {data,error}=await db.from("studio_package_files").select("revision_id,storage_key").eq("workspace_id",workspaceId).in("revision_id",ids.slice(offset,offset+100)).eq("role","preview").in("mime_type",["image/png","image/jpeg","image/webp","image/gif","image/avif"]).order("path");
    dbFailure(error);
    for(const row of data??[])if(!covers.has(row.revision_id))covers.set(row.revision_id,row.storage_key);
  }
  const paths=[...new Set(covers.values())];
  const urls=new Map<string,string>();
  if(paths.length){
    const {data:signed}=await db.storage.from(STUDIO_BUCKET).createSignedUrls(paths,1800);
    for(const item of signed??[])if(item.path&&item.signedUrl&&!item.error)urls.set(item.path,item.signedUrl);
  }
  return assets.map(asset=>({...asset,preview_url:urls.get(covers.get(asset.current_revision_id??"")??"")??null}));
}

/** Verify Storage completion/size without proxying media bytes through Vercel.
 * sha256 is an uploader-supplied digest; consumers must verify on download.
 * Storage's multipart ETag is not falsely treated as a SHA-256 attestation. */
export async function verifyStoredFiles(db: DB, files: StoredFile[]) {
  if (!files.length) throw new ApiError(409, "incomplete_upload", "The native package is empty.");
  return mapInBatches(files, async file => {
    const { data, error } = await db.storage.from(STUDIO_BUCKET).info(file.storage_key);
    if (error || !data || Number(data.size) !== Number(file.bytes)) throw new ApiError(409, "incomplete_upload", `The upload for “${file.path}” is missing or incomplete. Resume the upload before saving.`);
    return { id: file.id, bytes: Number(data.size) };
  });
}
