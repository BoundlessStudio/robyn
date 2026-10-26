import { json, handleError } from "@/lib/http";
import { requireStudio, ownedAsset } from "@/studio/server";
export async function GET(_request: Request, context: {params:Promise<{id:string}>}) {
  try {
    const {db,workspaceId} = await requireStudio();
    return json({asset:await ownedAsset(db,workspaceId,(await context.params).id)});
  } catch(error) { return handleError(error); }
}
