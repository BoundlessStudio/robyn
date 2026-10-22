import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, ownedRevision, revisionFiles, mapInBatches, verifyStoredFiles, dbFailure, STUDIO_BUCKET } from "@/studio/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id } = await context.params;
    const revision = await ownedRevision(db, workspaceId, id);
    if (revision.state !== "committed" && revision.state !== "conflict") throw new ApiError(409, "revision_not_saved", "This revision is not saved yet. Finish or resume its upload.");
    const files = await revisionFiles(db, workspaceId, id);
    await verifyStoredFiles(db, files);
    const { data: dependencies, error } = await db.from("studio_revision_dependencies").select("dependency_asset_id,dependency_revision_id").eq("workspace_id", workspaceId).eq("revision_id", id);
    dbFailure(error);
    const downloads = await mapInBatches(files, async file => {
      const { data, error } = await db.storage.from(STUDIO_BUCKET).createSignedUrl(file.storage_key, 300, file.role === "preview" ? undefined : { download: file.path.split("/").pop() });
      if (error || !data) throw new ApiError(503, "storage_unavailable", "The package could not be opened. Please retry.");
      return { path: file.path, role: file.role, bytes: Number(file.bytes), sha256: file.sha256, mimeType: file.mime_type, downloadUrl: data.signedUrl };
    });
    return json({ ref: { assetId: revision.asset_id, revisionId: id }, revision, files: downloads, dependencies: (dependencies ?? []).map(ref => ({ assetId: ref.dependency_asset_id, revisionId: ref.dependency_revision_id })) });
  } catch (error) { return handleError(error); }
}
