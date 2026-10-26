import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { ownedRevision, revisionFiles, mapInBatches, verifyStoredFiles, dbFailure, STUDIO_BUCKET } from "./server";

/** Callers authorize the revision before issuing these exact-file tickets.
 * Media bytes never pass through the application server. */
export async function readSavedPackage(db: DB, workspaceId: string, revisionId: string) {
  const revision = await ownedRevision(db, workspaceId, revisionId);
  if (revision.state !== "committed" && revision.state !== "conflict") throw new ApiError(409, "revision_not_saved", "This revision is not saved yet. Finish or resume its upload.");
  const files = await revisionFiles(db, workspaceId, revisionId);
  await verifyStoredFiles(db, files);
  const { data: dependencies, error } = await db.from("studio_revision_dependencies").select("dependency_asset_id,dependency_revision_id").eq("workspace_id", workspaceId).eq("revision_id", revisionId);
  dbFailure(error);
  const { data: sourceCredits, error: creditsError } = dependencies?.length ? await db.rpc("read_source_credits", { p_workspace: workspaceId, p_revision: revisionId }) : { data: [], error: null };
  dbFailure(creditsError);
  const downloads = await mapInBatches(files, async file => {
    const { data, error } = await db.storage.from(STUDIO_BUCKET).createSignedUrl(file.storage_key, 300, file.role === "preview" ? undefined : { download: file.path.split("/").pop() });
    if (error || !data) throw new ApiError(503, "storage_unavailable", "The package could not be opened. Please retry.");
    return { path: file.path, role: file.role, bytes: Number(file.bytes), sha256: file.sha256, mimeType: file.mime_type, downloadUrl: data.signedUrl };
  });
  return { ref: { assetId: revision.asset_id, revisionId }, revision, provenance: revision.provenance ?? {}, sourceCredits, files: downloads, dependencies: (dependencies ?? []).map(ref => ({ assetId: ref.dependency_asset_id, revisionId: ref.dependency_revision_id })) };
}

export async function preparePackageTransfers(db: DB, workspaceId: string, revisionId: string) {
  const revision = await ownedRevision(db, workspaceId, revisionId);
  if (revision.state !== "uploading") throw new ApiError(409, "revision_closed", "This package is already finalized. Start a new revision to make changes.");
  const files = await revisionFiles(db, workspaceId, revisionId);
  const transfers = await mapInBatches(files, async file => {
    const { data: existing } = await db.storage.from(STUDIO_BUCKET).info(file.storage_key);
    if (existing) {
      if (Number(existing.size) !== Number(file.bytes)) throw new ApiError(409, "size_mismatch", `“${file.path}” has an unexpected size. Preserve this upload and start a new revision.`);
      return { id: file.id, path: file.path, uploaded: true, bytes: Number(file.bytes) };
    }
    const { data, error } = await db.storage.from(STUDIO_BUCKET).createSignedUploadUrl(file.storage_key, { upsert: false });
    if (error || !data) throw new ApiError(503, "storage_unavailable", "Private Storage could not prepare the upload. Please retry.");
    return { id: file.id, path: file.path, uploaded: false, bytes: Number(file.bytes), mimeType: file.mime_type, sha256: file.sha256, storageKey: file.storage_key, token: data.token, signedUrl: data.signedUrl };
  });
  // An operator may have abandoned this upload while Storage was signing it.
  // Never return freshly signed tickets after that terminal decision.
  const { error: openError } = await db.rpc("assert_studio_upload_open", { p_workspace: workspaceId, p_revision: revisionId });
  dbFailure(openError);
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  return { bucket: STUDIO_BUCKET, resumableEndpoint: `${url.origin}/storage/v1/upload/resumable/sign`, chunkSize: 6 * 1024 * 1024, transfers };
}
