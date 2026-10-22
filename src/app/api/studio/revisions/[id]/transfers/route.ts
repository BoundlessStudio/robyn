import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedRevision, revisionFiles, mapInBatches, STUDIO_BUCKET } from "@/studio/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id } = await context.params;
    await readStudioBody(request);
    const revision = await ownedRevision(db, workspaceId, id);
    if (revision.state !== "uploading") throw new ApiError(409, "revision_closed", "This package is already finalized. Start a new revision to make changes.");
    const files = await revisionFiles(db, workspaceId, id);
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
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
    return json({ bucket: STUDIO_BUCKET, resumableEndpoint: `${url.origin}/storage/v1/upload/resumable/sign`, chunkSize: 6 * 1024 * 1024, transfers });
  } catch (error) { return handleError(error); }
}
