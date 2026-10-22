import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, ownedRevision, revisionFiles, verifyStoredFiles, textField, dbFailure } from "@/studio/server";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  try {
    const {db,user,workspaceId}=await requireStudio();const {id}=await context.params;const body=await readStudioBody(request);
    const revision=await ownedRevision(db,workspaceId,id);
    if(!["committed","conflict"].includes(revision.state))throw new ApiError(409,"revision_not_saved","Finish this upload before saving it as a new asset.");
    await verifyStoredFiles(db,await revisionFiles(db,workspaceId,id));
    const {data,error}=await db.rpc("fork_studio_revision",{p_workspace:workspaceId,p_user:user.id,p_source:id,p_name:textField(body.name,160,"Asset name")});dbFailure(error);return json(data,201);
  }catch(error){return handleError(error);}
}
