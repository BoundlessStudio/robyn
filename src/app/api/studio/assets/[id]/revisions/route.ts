import { json, handleError, ApiError } from "@/lib/http";
import { validateRevisionPackage } from "@/studio/assets";
import { requireStudio, readStudioBody, ownedAsset, id, dbFailure } from "@/studio/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id: assetId } = await context.params;
    const asset = await ownedAsset(db, workspaceId, assetId);
    const { data, error } = await db.from("studio_revisions").select("*").eq("workspace_id", workspaceId).eq("asset_id", assetId).order("created_at", { ascending: false }).limit(100);
    dbFailure(error); return json({ asset, revisions: data });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio(); const { id: assetId } = await context.params;
    await ownedAsset(db, workspaceId, assetId);
    const input = await readStudioBody(request);
    if (input.expectedBaseRevisionId === undefined) throw new ApiError(400, "base_required", "Supply the exact base revision, or null for the first save.");
    const baseId = input.expectedBaseRevisionId === null ? null : id(input.expectedBaseRevisionId);
    let pkg;
    try { pkg = validateRevisionPackage(input.package); }
    catch (error) { throw new ApiError(400, "invalid_package", (error as Error).message); }
    const { data, error } = await db.rpc("begin_studio_revision", { p_workspace: workspaceId, p_user: user.id, p_asset: assetId, p_base: baseId, p_package: pkg });
    dbFailure(error); return json({ revisionId: data, status: "uploading" }, 201);
  } catch (error) { return handleError(error); }
}
