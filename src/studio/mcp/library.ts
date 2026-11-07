import "server-only";
import { ApiError } from "@/lib/api-error";
import { validatePackagePath, type AssetSummary, type ProjectSummary } from "@/studio/assets";
import { dbFailure, ownedAsset, ownedProject, ownedRevision, revisionFiles, verifyStoredFiles } from "@/studio/server";
import { finishPage, literalSearch, pageFilter } from "@/studio/pagination";
import { readSavedPackage, savedDownloadSeconds, signSavedFile } from "@/studio/package-store";
import type { McpIdentity } from "./oauth";
import { pageFor, type Page } from "./pagination";

type AssetFilters = { appId?: string; kind?: string };
type AssetRow = Pick<AssetSummary, "id" | "name" | "app_id" | "asset_kind" | "current_revision_id" | "created_at">;
type LibrarySearchRow = AssetRow & { project_id: string; project: Pick<ProjectSummary, "name" | "status"> };
const assetFields = "id,name,app_id,asset_kind,current_revision_id,created_at";

function savedAsset(row: AssetRow) {
  return { name: row.name, appId: row.asset_kind === "native" ? row.app_id : null,
    kind: row.asset_kind, ref: { assetId: row.id, revisionId: row.current_revision_id } };
}

function projectDetails(project: ProjectSummary) {
  return { projectId: project.id, name: project.name, brief: project.brief, status: project.status,
    createdAt: project.created_at, updatedAt: project.updated_at };
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

export async function getProject({ db, workspaceId }: McpIdentity, { projectId }: { projectId: string }) {
  return projectDetails(await ownedProject(db, workspaceId, projectId));
}

export async function createProject(
  { db, workspaceId, userId, grantId }: McpIdentity,
  input: { creationId: string; name: string; brief: string },
) {
  const { data, error } = await db.rpc("create_studio_mcp_project", {
    p_workspace: workspaceId, p_user: userId, p_grant: grantId,
    p_creation: input.creationId, p_name: input.name, p_brief: input.brief,
  });
  if (error?.message === "creation id reused") {
    throw new ApiError(409, "creation_id_reused", "This project creation ID is already in use. Use a new UUID for a new project.");
  }
  dbFailure(error);
  return projectDetails(data);
}

export async function updateProject(
  { db, workspaceId, userId, grantId }: McpIdentity,
  input: { projectId: string; expectedUpdatedAt: string; name?: string; brief?: string },
) {
  await ownedProject(db, workspaceId, input.projectId);
  const { data, error } = await db.rpc("update_studio_mcp_project", {
    p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: input.projectId,
    p_expected_updated_at: input.expectedUpdatedAt, p_name: input.name ?? null, p_brief: input.brief ?? null,
  });
  if (error?.message === "project changed") {
    throw new ApiError(409, "project_changed", "The project changed. Read it with get_project before retrying the edit.");
  }
  dbFailure(error);
  return projectDetails(data);
}

export async function listAssets(
  { db, workspaceId }: McpIdentity,
  input: Page & AssetFilters & { projectId: string },
) {
  const page = pageFor(input);
  await ownedProject(db, workspaceId, input.projectId);
  let query = db.from("studio_assets").select(assetFields)
    .eq("workspace_id", workspaceId).eq("project_id", input.projectId).not("current_revision_id", "is", null);
  if (input.appId) query = query.eq("app_id", input.appId);
  if (input.kind) query = query.eq("asset_kind", input.kind);
  if (page.search) query = query.ilike("name", literalSearch(page.search));
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size);
  return { assets: items.map(savedAsset), nextCursor };
}

export async function searchLibrary({ db, workspaceId }: McpIdentity, input: Page & AssetFilters & { query: string }) {
  const page = pageFor(input);
  // PostgREST treats * as a wildcard in ilike, so escape the name for imatch.
  const pattern = page.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let query = db.from("studio_assets")
    .select(`${assetFields},project_id,project:studio_projects!inner(name,status),revision:studio_revisions!studio_assets_current_revision_fk!inner()`)
    .eq("workspace_id", workspaceId).eq("revision.state", "committed").filter("name", "imatch", pattern);
  if (input.appId) query = query.eq("app_id", input.appId);
  if (input.kind) query = query.eq("asset_kind", input.kind);
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(page.size + 1).overrideTypes<LibrarySearchRow[], { merge: false }>();
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size);
  return {
    assets: items.map(row => ({ ...savedAsset(row), projectId: row.project_id,
      projectName: row.project.name, projectStatus: row.project.status })),
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
    ...(saved ? { sourceCredits: saved.sourceCredits, downloadsExpireInSeconds: savedDownloadSeconds } : {}),
  };
}

export async function renameAsset(
  { db, workspaceId, userId, grantId }: McpIdentity,
  input: { projectId: string; assetId: string; name: string },
) {
  const asset = await ownedAsset(db, workspaceId, input.assetId);
  if (asset.project_id !== input.projectId || !asset.current_revision_id) {
    throw new ApiError(404, "not_found", "Saved asset not found in this project.");
  }
  const { data, error } = await db.rpc("rename_studio_mcp_asset", {
    p_workspace: workspaceId, p_user: userId, p_grant: grantId,
    p_project: input.projectId, p_asset: asset.id, p_name: input.name,
  });
  dbFailure(error);
  return { projectId: input.projectId, ...savedAsset(data) };
}

export async function downloadAsset(identity: McpIdentity, input: { projectId: string; assetId: string; revisionId: string; path?: string }) {
  const { db, workspaceId } = identity;
  const { asset, revision } = await readAssetRef(identity, input.projectId, input);
  if (!["committed", "conflict"].includes(revision.state)) {
    throw new ApiError(409, "revision_not_saved", "This revision has no confirmed library save.");
  }
  let path: string | undefined;
  if (input.path !== undefined) {
    try { path = validatePackagePath(input.path); }
    catch { throw new ApiError(400, "invalid_path", "Choose a file path from open_asset_revision."); }
  }
  const files = await revisionFiles(db, workspaceId, revision.id);
  if (!path && asset.asset_kind === "file" && files.length > 1) {
    throw new ApiError(400, "file_path_required", "Choose a file path from open_asset_revision to download from this collection.");
  }
  const file = path ? files.find(file => file.path === path) : files.find(file => file.role === "master");
  if (!file) throw new ApiError(404, "not_found", "Saved file not found in this revision.");
  await verifyStoredFiles(db, [file]);
  const downloadUrl = await signSavedFile(db, file);
  return {
    projectId: input.projectId, ref: { assetId: asset.id, revisionId: revision.id },
    path: file.path, mimeType: file.mime_type, bytes: Number(file.bytes), sha256: file.sha256,
    downloadUrl, expiresInSeconds: savedDownloadSeconds,
  };
}
