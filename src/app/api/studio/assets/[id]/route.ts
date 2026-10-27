import { json, handleError } from "@/lib/http";
import { requireStudio, ownedAsset, readStudioBody, textField, dbFailure } from "@/studio/server";
export async function GET(_request: Request, context: {params:Promise<{id:string}>}) {
  try {
    const {db,workspaceId} = await requireStudio();
    return json({asset:await ownedAsset(db,workspaceId,(await context.params).id)});
  } catch(error) { return handleError(error); }
}

export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  try {
    const {db,workspaceId} = await requireStudio();
    const asset = await ownedAsset(db,workspaceId,(await context.params).id);
    const input = await readStudioBody(request);
    const name = textField(input.name,160,"File name");
    const {data,error} = await db.from("studio_assets").update({name}).eq("workspace_id",workspaceId).eq("id",asset.id).select("*").single();
    dbFailure(error);
    return json({asset:data});
  } catch(error) { return handleError(error); }
}
