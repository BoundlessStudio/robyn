import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedAsset, ownedRevision, revisionFiles, verifyStoredFiles, dbFailure, id } from "@/studio/server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio(); const { id: assetId } = await context.params;
    await ownedAsset(db, workspaceId, assetId);
    const input = await readStudioBody(request);
    if (input.expectedBaseRevisionId === undefined) throw new ApiError(400, "base_required", "Supply the current saved revision.");
    const sourceId = id(input.revisionId);
    const source = await ownedRevision(db, workspaceId, sourceId);
    if (source.asset_id !== assetId || source.state !== "committed") throw new ApiError(404, "not_found", "Saved revision not found.");
    await verifyStoredFiles(db, await revisionFiles(db, workspaceId, sourceId));
    const { data, error } = await db.rpc("restore_studio_revision", { p_workspace: workspaceId, p_user: user.id, p_asset: assetId, p_source: sourceId, p_expected_base: input.expectedBaseRevisionId === null ? null : id(input.expectedBaseRevisionId) });
    dbFailure(error); return json(data, data?.status === "conflict" ? 409 : 201);
  } catch (error) { return handleError(error); }
}
