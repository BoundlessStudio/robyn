import { json, handleError, ApiError } from "@/lib/http";
import { validateRevisionPackage } from "@/studio/assets";
import { requireStudio, readStudioBody, ownedAsset, id, dbFailure } from "@/studio/server";
import { readPage, pageFilter, finishPage } from "@/studio/pagination";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio(); const { id: assetId } = await context.params;
    const asset = await ownedAsset(db, workspaceId, assetId);
    const page = readPage(request.url);
    let query = db.from("studio_revisions").select("*").eq("workspace_id", workspaceId).eq("asset_id", assetId);
    const known = new URL(request.url).searchParams.get("revisionId");
    if (known) query = query.eq("id",id(known));
    else if (page.after) query = query.or(pageFilter(page.after));
    const { data, error } = await query.order("created_at", { ascending: false }).order("id",{ascending:false}).limit(page.size+1);
    dbFailure(error);
    const result = finishPage(data??[],page.size);
    return json({ asset, revisions:result.items,nextCursor:result.nextCursor });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio(); const { id: assetId } = await context.params;
    const asset = await ownedAsset(db, workspaceId, assetId);
    if (asset.asset_kind && asset.asset_kind !== "native") throw new ApiError(409, "source_media_immutable", "Acquire a new media source through the media panel. Saved source versions remain immutable.");
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
