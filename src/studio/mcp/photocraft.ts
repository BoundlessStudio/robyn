import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { validateRevisionPackage } from "@/studio/assets";
import { preparePackageTransfers, readSavedPackage } from "@/studio/package-store";
import { finishPage, pageFilter } from "@/studio/pagination";
import { dbFailure, ownedAsset, ownedProject, ownedRevision, revisionFiles, verifyStoredFiles, withAssetPreviews } from "@/studio/server";
import { hash, mcpConfig, tokenPart } from "./config";
import { readAssetRef } from "./library";
import type { McpIdentity } from "./oauth";
import { pageFor } from "./pagination";
import { assetRef, uuid } from "./schemas";

export const photoCraftResourceUri = "ui://robyn/photocraft/v1.html";
export const photoCraftRequestTool = "photocraft_editor_request";
export const openPhotoCraftInput = z.strictObject({ projectId: uuid, ...assetRef.shape });
type Binding = z.output<typeof openPhotoCraftInput>;
export const photoCraftRequest = z.strictObject({
  binding: openPhotoCraftInput,
  session: z.string().regex(tokenPart),
  path: z.string().max(800).regex(/^\/api\/studio\//),
  method: z.enum(["GET", "POST"]),
  body: z.record(z.string(), z.unknown()).optional(),
});
const beginSaveInput = z.strictObject({
  requestId: uuid, expectedBaseRevisionId: uuid.nullable(), package: z.unknown(),
  newAsset: z.strictObject({ name: z.string().trim().min(1).max(160), source: assetRef }).optional(),
});
const invalidSession = () => new ApiError(403, "invalid_editor_session", "Open the saved PhotoCraft revision again from this conversation.");
const unavailable = () => new ApiError(404, "not_found", "This PhotoCraft file or revision is unavailable.");

export function photoCraftEditorUrl() {
  const value = process.env.ROBYN_MCP_PHOTOCRAFT_URL;
  if (!value || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!["https:", "http:"].includes(storage.protocol)) return null;
    const url = new URL(value);
    const local = process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    const path = "/mcp/photocraft/v0.17.0-0.3.2/";
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.hash
      || url.search || url.pathname !== path || url.origin === mcpConfig().issuer) return null;
    url.search = "?robyn";
    return url;
  } catch { return null; }
}

function editorSession(identity: McpIdentity, binding: Binding) {
  return createHmac("sha256", Buffer.from(process.env.ROBYN_MCP_RUNTIME_SECRET!, "base64url"))
    .update(JSON.stringify(["photocraft", mcpConfig().resource, identity.grantId, identity.workspaceId,
      identity.userId, binding.projectId, binding.assetId, binding.revisionId])).digest("base64url");
}

export async function openPhotoCraft(identity: McpIdentity, binding: Binding) {
  const project = await ownedProject(identity.db, identity.workspaceId, binding.projectId);
  if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate this project to edit it in PhotoCraft.");
  const { asset, revision } = await readAssetRef(identity, binding.projectId, binding);
  if (asset.app_id !== "photocraft" || asset.asset_kind !== "native" || revision.state !== "committed") throw unavailable();
  const { issuer } = mcpConfig();
  const url = new URL("/dashboard/projects/" + binding.projectId, issuer);
  url.search = new URLSearchParams({ asset: binding.assetId, revision: binding.revisionId }).toString();
  return {
    output: { name: asset.name, projectId: binding.projectId, ref: { assetId: binding.assetId, revisionId: binding.revisionId }, studioUrl: url.href },
    session: editorSession(identity, binding),
  };
}

function saveError(error: { message: string; code?: string } | null) {
  if (error?.message === "photo save identity reused") {
    throw new ApiError(409, "save_id_reused", "This save already refers to a different snapshot.");
  }
  if (error?.message === "project unavailable") {
    throw new ApiError(409, "project_archived", "Reactivate this project to save your PhotoCraft changes.");
  }
  dbFailure(error);
}

export async function photoCraftEditorRequest(identity: McpIdentity, input: z.output<typeof photoCraftRequest>): Promise<unknown> {
  const { db, workspaceId, userId, grantId } = identity;
  const { binding, method } = input;
  if (!timingSafeEqual(Buffer.from(input.session), Buffer.from(editorSession(identity, binding)))) throw invalidSession();
  const session = hash(input.session);
  const url = new URL("https://robyn.invalid" + input.path);
  const project = await ownedProject(db, workspaceId, binding.projectId);
  if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate this project to edit it in PhotoCraft.");

  if (method === "GET" && url.pathname === "/api/studio/assets") {
    const page = pageFor({ cursor: url.searchParams.get("cursor") ?? undefined });
    const placeable = "app_id.is.null,app_id.neq.mailcraft";
    const query = db.from("studio_assets").select("id,project_id,app_id,asset_kind,name,current_revision_id,created_at")
      .eq("workspace_id", workspaceId).eq("project_id", project.id).not("current_revision_id", "is", null)
      .or(page.after ? `and(or(${placeable}),or(${pageFilter(page.after)}))` : placeable);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
    dbFailure(error);
    const result = finishPage(data ?? [], page.size);
    return { assets: await withAssetPreviews(db, workspaceId, result.items), nextCursor: result.nextCursor };
  }

  const revisionPath = /^\/api\/studio\/revisions\/([^/]+)(?:\/(transfers|commit))?$/.exec(url.pathname);
  if (revisionPath) {
    const revisionId = uuid.safeParse(revisionPath[1]);
    if (!revisionId.success) throw unavailable();
    const revision = await ownedRevision(db, workspaceId, revisionId.data);
    const asset = await ownedAsset(db, workspaceId, revision.asset_id);
    if (asset.project_id !== project.id || asset.app_id === "mailcraft") throw unavailable();
    const action = revisionPath[2];
    if (method === "GET" && !action) {
      const { ref, files, dependencies } = await readSavedPackage(db, workspaceId, revision.id);
      return { ref, files, dependencies };
    }
    if (method === "POST" && action && asset.app_id === "photocraft" && revision.provenance?.photoCraftSession === session) {
      if (action === "transfers") {
        const { bucket, resumableEndpoint, transfers } = await preparePackageTransfers(db, workspaceId, revision.id);
        return { bucket, resumableEndpoint, transfers };
      }
      if (revision.state === "committed" || revision.state === "conflict") {
        return { assetId: asset.id, revisionId: revision.id, status: revision.state };
      }
      if (revision.state !== "uploading") throw unavailable();
      const verified = await verifyStoredFiles(db, await revisionFiles(db, workspaceId, revision.id));
      const { data, error } = await db.rpc("commit_studio_mcp_photocraft_save", {
        p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: project.id,
        p_revision: revision.id, p_session: session, p_verified: verified,
      });
      saveError(error);
      return data;
    }
    throw unavailable();
  }

  const savePath = /^\/api\/studio\/assets\/([^/]+)\/revisions$/.exec(url.pathname);
  if (method === "POST" && savePath) {
    const assetId = uuid.safeParse(savePath[1]), parsed = beginSaveInput.safeParse(input.body);
    if (!assetId.success || !parsed.success) throw new ApiError(400, "invalid_save", "PhotoCraft did not provide a valid save request.");
    const { requestId, expectedBaseRevisionId, newAsset } = parsed.data;
    let pkg;
    try {
      pkg = validateRevisionPackage(parsed.data.package);
      if (!pkg.files.some(file => file.role === "master" && /\.pcraft$/i.test(file.path))) throw Error("PhotoCraft requires a .pcraft master.");
    } catch (error) { throw new ApiError(400, "invalid_package", (error as Error).message); }
    const source = newAsset?.source ?? { assetId: assetId.data, revisionId: expectedBaseRevisionId };
    if (!source.revisionId) throw unavailable();
    const { asset, revision } = await readAssetRef(identity, project.id, { assetId: source.assetId, revisionId: source.revisionId });
    const original = asset.id === binding.assetId && revision.id === binding.revisionId;
    if (asset.app_id !== "photocraft" || asset.asset_kind !== "native" || revision.state !== "committed"
      || (!original && revision.provenance?.photoCraftSession !== session)) throw unavailable();

    const { data, error } = await db.rpc("begin_studio_mcp_photocraft_save", {
      p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: project.id, p_asset: assetId.data,
      p_base: expectedBaseRevisionId, p_new_asset: newAsset ?? null, p_request: requestId,
      p_session: session, p_fingerprint: hash(JSON.stringify([expectedBaseRevisionId, newAsset, pkg])), p_package: pkg,
    });
    saveError(error);
    return data;
  }
  throw unavailable();
}
