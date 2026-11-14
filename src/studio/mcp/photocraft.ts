import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { validateRevisionPackage } from "@/studio/assets";
import { preparePackageTransfers, readSavedPackage } from "@/studio/package-store";
import { finishPage, pageFilter } from "@/studio/pagination";
import { dbFailure, ownedAsset, ownedProject, ownedRevision, revisionFiles, verifyStoredFiles, withAssetPreviews } from "@/studio/server";
import type { ChatCraft } from "./chat-crafts";
import { hash, mcpConfig, tokenPart } from "./config";
import { readAssetRef } from "./library";
import type { McpIdentity } from "./oauth";
import { pageFor } from "./pagination";
import { assetRef, uuid } from "./schemas";

export const photoCraftResourceUri = "ui://robyn/photocraft/v1.html";
export const photoCraftRequestTool = "photocraft_editor_request";
export const openPhotoCraftInput = z.strictObject({ projectId: uuid, ...assetRef.shape });
export const craftRequestTool = "craft_editor_request";
export const chatCraftId = z.string().regex(/^[a-z]+craft$/).max(50);
type Binding = z.output<typeof openPhotoCraftInput>;
export const photoCraftRequest = z.strictObject({
  binding: openPhotoCraftInput,
  session: z.string().regex(tokenPart),
  path: z.string().max(800).regex(/^\/api\/studio\//),
  method: z.enum(["GET", "POST"]),
  body: z.record(z.string(), z.unknown()).optional(),
});
export const chatCraftRequest = photoCraftRequest.extend({ appId: chatCraftId });
const beginSaveInput = z.strictObject({
  requestId: uuid, expectedBaseRevisionId: uuid.nullable(), package: z.unknown(),
  newAsset: z.strictObject({ name: z.string().trim().min(1).max(160), source: assetRef }).optional(),
});
const photoCraft = { id: "photocraft", name: "PhotoCraft", nativeFormats: [".pcraft"], readOnly: false };
type Editor = Omit<ChatCraft, "editorUrl">;
const unavailable = (app: Editor) => new ApiError(404, "not_found", `This ${app.name} file or revision is unavailable.`);
const operationCrafts = new Set(["plancraft", "ledgercraft", "mailcraft"]);

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

function editorSession(identity: McpIdentity, binding: Binding, app: Editor) {
  return createHmac("sha256", Buffer.from(process.env.ROBYN_MCP_RUNTIME_SECRET!, "base64url"))
    .update(JSON.stringify([app.id, mcpConfig().resource, identity.grantId, identity.workspaceId,
      identity.userId, binding.projectId, binding.assetId, binding.revisionId])).digest("base64url");
}

export async function openCraftEditor(identity: McpIdentity, binding: Binding, app: Editor) {
  const project = await ownedProject(identity.db, identity.workspaceId, binding.projectId);
  if (!app.readOnly && project.status !== "active") throw new ApiError(409, "project_archived", `Reactivate this project to edit it in ${app.name}.`);
  const { asset, revision } = await readAssetRef(identity, binding.projectId, binding);
  if (asset.app_id !== app.id || asset.asset_kind !== "native" || revision.state !== "committed") throw unavailable(app);
  const { issuer } = mcpConfig();
  const url = new URL("/dashboard/projects/" + binding.projectId, issuer);
  url.search = new URLSearchParams({ asset: binding.assetId, revision: binding.revisionId }).toString();
  return {
    output: { name: asset.name, projectId: binding.projectId, ref: { assetId: binding.assetId, revisionId: binding.revisionId }, studioUrl: url.href },
    session: editorSession(identity, binding, app),
  };
}

export function openPhotoCraft(identity: McpIdentity, binding: Binding) {
  return openCraftEditor(identity, binding, photoCraft);
}

function saveError(error: { message: string; code?: string } | null, app: Editor) {
  if (error?.message === "photo save identity reused" || error?.message === "craft save identity reused") {
    throw new ApiError(409, "save_id_reused", "This save already refers to a different snapshot.");
  }
  if (error?.message === "project unavailable") {
    throw new ApiError(409, "project_archived", `Reactivate this project to save your ${app.name} changes.`);
  }
  dbFailure(error);
}

export function photoCraftEditorRequest(identity: McpIdentity, input: z.output<typeof photoCraftRequest>) {
  return requestCraftEditor(identity, input, photoCraft);
}

export async function requestCraftEditor(identity: McpIdentity, input: z.output<typeof photoCraftRequest>, app: Editor): Promise<unknown> {
  const { db, workspaceId, userId, grantId } = identity;
  const { binding, method } = input;
  if (!timingSafeEqual(Buffer.from(input.session), Buffer.from(editorSession(identity, binding, app)))) {
    throw new ApiError(403, "invalid_editor_session", `Open the saved ${app.name} revision again from this conversation.`);
  }
  const legacy = app.id === photoCraft.id;
  const sessionKey = legacy ? "photoCraftSession" : "craftEditorSession";
  const rpc = legacy ? "studio_mcp_photocraft_save" : "studio_mcp_craft_save";
  const rpcScope = { p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: binding.projectId,
    ...(!legacy && { p_app: app.id }) };
  const session = hash(input.session);
  const url = new URL("https://robyn.invalid" + input.path);
  const project = await ownedProject(db, workspaceId, binding.projectId);
  if (!app.readOnly && project.status !== "active") throw new ApiError(409, "project_archived", `Reactivate this project to edit it in ${app.name}.`);
  const notFound = () => unavailable(app);
  if (app.readOnly && (method !== "GET" || url.pathname !== `/api/studio/revisions/${binding.revisionId}`)) throw notFound();

  if (method === "GET" && url.pathname === "/api/studio/assets") {
    const page = pageFor({ cursor: url.searchParams.get("cursor") ?? undefined });
    const placeable = legacy ? "app_id.is.null,app_id.neq.mailcraft" : `app_id.is.null,app_id.not.in.(${[...operationCrafts].join(",")})`;
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
    if (!revisionId.success) throw notFound();
    const revision = await ownedRevision(db, workspaceId, revisionId.data);
    const asset = await ownedAsset(db, workspaceId, revision.asset_id);
    if (asset.project_id !== project.id || (legacy ? asset.app_id === "mailcraft" : operationCrafts.has(asset.app_id))) throw notFound();
    const action = revisionPath[2];
    if (method === "GET" && !action) {
      const { ref, files, dependencies } = await readSavedPackage(db, workspaceId, revision.id);
      return { ref, files, dependencies };
    }
    if (method === "POST" && action && asset.app_id === app.id && revision.provenance?.[sessionKey] === session) {
      if (action === "transfers") {
        const { bucket, resumableEndpoint, transfers } = await preparePackageTransfers(db, workspaceId, revision.id);
        return { bucket, resumableEndpoint, transfers };
      }
      if (revision.state === "committed" || revision.state === "conflict") {
        return { assetId: asset.id, revisionId: revision.id, status: revision.state };
      }
      if (revision.state !== "uploading") throw notFound();
      const verified = await verifyStoredFiles(db, await revisionFiles(db, workspaceId, revision.id));
      const { data, error } = await db.rpc("commit_" + rpc, {
        ...rpcScope,
        p_revision: revision.id, p_session: session, p_verified: verified,
      });
      saveError(error, app);
      return data;
    }
    throw notFound();
  }

  const savePath = /^\/api\/studio\/assets\/([^/]+)\/revisions$/.exec(url.pathname);
  if (method === "POST" && savePath) {
    const assetId = uuid.safeParse(savePath[1]), parsed = beginSaveInput.safeParse(input.body);
    if (!assetId.success || !parsed.success) throw new ApiError(400, "invalid_save", `${app.name} did not provide a valid save request.`);
    const { requestId, expectedBaseRevisionId, newAsset } = parsed.data;
    let pkg;
    try {
      pkg = validateRevisionPackage(parsed.data.package);
      const master = pkg.files.find(file => file.role === "master");
      if (!master || !app.nativeFormats.some(extension => master.path.toLowerCase().endsWith(extension.toLowerCase()))) {
        throw Error(`Choose a native ${app.name} master (${app.nativeFormats.join(", ")}).`);
      }
    } catch (error) { throw new ApiError(400, "invalid_package", (error as Error).message); }
    const source = newAsset?.source ?? { assetId: assetId.data, revisionId: expectedBaseRevisionId };
    if (!source.revisionId) throw notFound();
    const { asset, revision } = await readAssetRef(identity, project.id, { assetId: source.assetId, revisionId: source.revisionId });
    const original = asset.id === binding.assetId && revision.id === binding.revisionId;
    if (asset.app_id !== app.id || asset.asset_kind !== "native" || revision.state !== "committed"
      || (!original && revision.provenance?.[sessionKey] !== session)) throw notFound();

    const { data, error } = await db.rpc("begin_" + rpc, {
      ...rpcScope, p_asset: assetId.data,
      p_base: expectedBaseRevisionId, p_new_asset: newAsset ?? null, p_request: requestId,
      p_session: session, p_fingerprint: hash(JSON.stringify([expectedBaseRevisionId, newAsset, pkg])), p_package: pkg,
    });
    saveError(error, app);
    return data;
  }
  throw notFound();
}
