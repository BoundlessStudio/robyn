import { ApiError, handleError } from "@/lib/http";
import { requireStudio, ownedRevision, dbFailure } from "@/studio/server";
import { validatePackagePath } from "@/studio/assets";
import { signSavedFile } from "@/studio/package-store";

/** Authorize the exact file on every open/seek; bytes stay in private Storage. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio();
    const { id } = await context.params;
    const revision = await ownedRevision(db, workspaceId, id);
    if (!["committed", "conflict"].includes(revision.state)) throw new ApiError(409, "revision_not_saved", "This revision is not saved yet.");
    const url = new URL(request.url);
    let path: string;
    try { path = validatePackagePath(url.searchParams.get("path")); }
    catch { throw new ApiError(400, "invalid_path", "Choose a file from this saved revision."); }
    const { data: file, error } = await db.from("studio_package_files").select("storage_key,path,mime_type").eq("workspace_id", workspaceId).eq("revision_id", id).eq("path", path).maybeSingle();
    dbFailure(error);
    if (!file) throw new ApiError(404, "not_found", "Saved file not found.");
    const signedUrl = await signSavedFile(db, file, url.searchParams.get("inline") === "1");
    return new Response(null, { status: 307, headers: { Location: signedUrl, "Cache-Control": "private, no-store" } });
  } catch (error) { return handleError(error); }
}
