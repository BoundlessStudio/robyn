import {json, handleError, ApiError} from "@/lib/http";
import {requireStudio, readStudioBody, ownedProject, id, textField, dbFailure} from "@/studio/server";
import {validateRevisionPackage} from "@/studio/assets";
import {validateSourcePackage} from "@/studio/source-import";

export async function POST(request:Request) {
  try {
    const {db,user,workspaceId}=await requireStudio();
    const input=await readStudioBody(request), projectId=id(input.projectId), creationId=id(input.creationId);
    await ownedProject(db,workspaceId,projectId);
    const name=textField(input.name,160,"Source name");
    let pkg,kind;
    try {pkg=validateRevisionPackage(input.package);kind=validateSourcePackage(pkg);}
    catch(error){throw new ApiError(400,"invalid_source",(error as Error).message);}
    const {data,error}=await db.rpc("begin_local_source_import",{p_workspace:workspaceId,p_user:user.id,p_project:projectId,p_creation:creationId,p_name:name,p_kind:kind,p_package:pkg});
    if(error?.message.includes("source import identity"))throw new ApiError(409,"source_import_reused","This import has already been used for different files. Start a new import.");
    dbFailure(error);return json({revisionId:data},201);
  }catch(error){return handleError(error);}
}
