import "server-only";
import { ApiError } from "@/lib/api-error";
import { dbFailure, ownedAsset, ownedProject, ownedRevision, revisionFiles } from "@/studio/server";
import { finishPage, literalSearch, pageFilter, readPage } from "@/studio/pagination";
import { readSavedPackage } from "@/studio/package-store";
import type { McpIdentity } from "./oauth";

type Page = { query?: string; cursor?: string };
function pageFor({ query, cursor }: Page) {
  const url = new URL("https://robyn.invalid");
  if (query) url.searchParams.set("q", query);
  if (cursor) url.searchParams.set("cursor", cursor);
  return readPage(url.href, 50);
}

export async function listProjects({ db, workspaceId }: McpIdentity, input: Page & { status?: "active" | "archived" }) {
  const page = pageFor(input);
  let query = db.from("studio_projects").select("id,name,status,updated_at").eq("workspace_id", workspaceId);
  if (input.status) query = query.eq("status", input.status);
  if (page.search) query = query.ilike("name", literalSearch(page.search));
  if (page.after) query = query.or(pageFilter(page.after, "updated_at"));
  const { data, error } = await query.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size, "updated_at");
  return { projects: items.map(row => ({ projectId: row.id, name: row.name, status: row.status, updatedAt: row.updated_at })), nextCursor };
}

export async function listAssets(
  { db, workspaceId }: McpIdentity,
  input: Page & { projectId: string; appId?: string; kind?: string },
) {
  const page = pageFor(input);
  await ownedProject(db, workspaceId, input.projectId);
  let query = db.from("studio_assets").select("id,name,app_id,asset_kind,current_revision_id,created_at")
    .eq("workspace_id", workspaceId).eq("project_id", input.projectId).not("current_revision_id", "is", null);
  if (input.appId) query = query.eq("app_id", input.appId);
  if (input.kind) query = query.eq("asset_kind", input.kind);
  if (page.search) query = query.ilike("name", literalSearch(page.search));
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size);
  return {
    assets: items.map(row => ({ name: row.name, appId: row.asset_kind === "native" ? row.app_id : null,
      kind: row.asset_kind, ref: { assetId: row.id, revisionId: row.current_revision_id } })),
    nextCursor,
  };
}

export async function listRevisions({ db, workspaceId }: McpIdentity, input: { projectId: string; assetId: string; cursor?: string }) {
  const page = pageFor(input);
  const asset = await ownedAsset(db, workspaceId, input.assetId);
  if (asset.project_id !== input.projectId) throw new ApiError(404, "not_found", "Asset not found in this project.");
  let query = db.from("studio_revisions").select("id,state,revision_number,created_at,message")
    .eq("workspace_id", workspaceId).eq("asset_id", asset.id).in("state", ["committed", "conflict"]);
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size);
  return { name: asset.name, revisions: items.map(row => ({ ref: { assetId: asset.id, revisionId: row.id },
    current: asset.current_revision_id === row.id, status: row.state, number: row.revision_number,
    createdAt: row.created_at, message: row.message })), nextCursor };
}

export async function readAssetRef(
  { db, workspaceId }: Pick<McpIdentity, "db" | "workspaceId">,
  projectId: string,
  ref: { assetId: string; revisionId: string },
) {
  const asset = await ownedAsset(db, workspaceId, ref.assetId);
  if (asset.project_id !== projectId) throw new ApiError(404, "not_found", "Asset not found in this project.");
  const revision = await ownedRevision(db, workspaceId, ref.revisionId);
  if (revision.asset_id !== asset.id) throw new ApiError(404, "not_found", "Saved revision not found for this asset.");
  return { asset, revision };
}

export async function openAsset(identity: McpIdentity, input: { projectId: string; assetId: string; revisionId: string; includeDownloads: boolean }) {
  const { db, workspaceId } = identity;
  const { asset, revision } = await readAssetRef(identity, input.projectId, input);
  if (!["committed", "conflict"].includes(revision.state)) throw new ApiError(409, "revision_not_saved", "This revision has no confirmed library save.");
  const saved = input.includeDownloads ? await readSavedPackage(db, workspaceId, revision.id) : null;
  const files = saved?.files ?? (await revisionFiles(db, workspaceId, revision.id)).map(file => ({
    path: file.path, role: file.role, bytes: Number(file.bytes), sha256: file.sha256, mimeType: file.mime_type,
  }));
  const dependencies = saved ? { data: null, error: null } : await db.from("studio_revision_dependencies")
    .select("dependency_asset_id,dependency_revision_id").eq("workspace_id", workspaceId).eq("revision_id", revision.id);
  dbFailure(dependencies.error);
  return { ref: { assetId: asset.id, revisionId: revision.id }, name: asset.name,
    appId: asset.asset_kind === "native" ? asset.app_id : null, kind: asset.asset_kind, status: revision.state,
    provenance: revision.provenance ?? {}, files,
    dependencies: saved?.dependencies ?? dependencies.data?.map(row => ({ assetId: row.dependency_asset_id, revisionId: row.dependency_revision_id })) ?? [],
    ...(saved ? { sourceCredits: saved.sourceCredits, downloadsExpireInSeconds: 300 } : {}),
  };
}
