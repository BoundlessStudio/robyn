import {json,handleError,ApiError} from "@/lib/http";
import {requireStudio,readStudioBody,ownedProject,id,dbFailure,appFor} from "@/studio/server";
import {validateRevisionPackage} from "@/studio/assets";
import catalog from "@/studio/generated/blank-starters.json";
import type {BlankStarter} from "@/studio/blank-starters";

export async function POST(request:Request){
  try{
    const {db,user,workspaceId}=await requireStudio();
    const input=await readStudioBody(request),projectId=id(input.projectId),creationId=id(input.creationId);
    const project=await ownedProject(db,workspaceId,projectId);
    if(project.status!=="active")throw new ApiError(409,"project_archived","Reactivate this project before starting new work.");
    const starter=(catalog as BlankStarter[]).find(item=>item.id===input.templateId);
    if(!starter)throw new ApiError(400,"invalid_starter","This blank document is unavailable. Reload the studio.");
    appFor(starter.appId);
    let pkg;
    try{pkg=validateRevisionPackage(input.package);}catch{throw new ApiError(400,"invalid_starter","The blank document could not be verified.");}
    if(pkg.files.length!==starter.files.length||pkg.files.some((file,index)=>{
      const expected=starter.files[index];return file.path!==expected.path||file.role!==expected.role||file.mimeType!==expected.mimeType||file.bytes!==expected.bytes||file.sha256!==expected.sha256;
    })||pkg.dependencies.length)throw new ApiError(400,"invalid_starter","The blank document does not match this Craft’s starter.");
    const {data,error}=await db.rpc("begin_studio_blank",{p_workspace:workspaceId,p_user:user.id,p_project:projectId,p_creation:creationId,p_app:starter.appId,p_name:starter.name,p_template:starter.id,p_package:pkg});
    if(error?.message.includes("blank identity reused"))throw new ApiError(409,"starter_reused","This document start already belongs to different work.");
    dbFailure(error);return json({revisionId:data},201);
  }catch(error){return handleError(error);}
}
