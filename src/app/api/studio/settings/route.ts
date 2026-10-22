import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, textField, dbFailure } from "@/studio/server";
export async function PATCH(request:Request){
  try{const {db,workspaceId}=await requireStudio();const body=await readStudioBody(request);const name=textField(body.name,120,"Studio name");const {error}=await db.from("workspaces").update({name}).eq("id",workspaceId);dbFailure(error);return json({saved:true});}catch(error){return handleError(error);}
}
