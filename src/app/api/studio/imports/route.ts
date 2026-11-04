import {json, handleError, ApiError} from "@/lib/http";
import {requireStudio, readStudioBody, ownedProject, id, textField, dbFailure} from "@/studio/server";
import {validateBridgePackage} from "@/studio/asset-bridge";

export async function POST(request:Request) {
  try {
    const {db,user,workspaceId}=await requireStudio();
    const input=await readStudioBody(request),projectId=id(input.projectId),creationId=id(input.creationId);
    const project=await ownedProject(db,workspaceId,projectId);
    if(project.status!=="active")throw new ApiError(409,"project_archived","Reactivate this project before uploading files.");
    const name=textField(input.name,160,"Upload name");
    let pkg;
    try{pkg=validateBridgePackage(input.package);}catch(error){throw new ApiError(400,"invalid_import",(error as Error).message);}
    const {data,error}=await db.rpc("begin_asset_bridge_import",{p_workspace:workspaceId,p_user:user.id,p_project:projectId,p_creation:creationId,p_name:name,p_package:pkg});
    if(error?.message.includes("bridge import identity"))throw new ApiError(409,"import_reused","This import identity belongs to different files. Start a new import.");
    dbFailure(error);
    return json({revisionId:data},201);
  }catch(error){return handleError(error);}
}
