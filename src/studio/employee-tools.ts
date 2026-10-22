import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { validateRevisionPackage } from "./assets";
import { type EmployeeScope, employeeDbFailure } from "./employee-auth";
import { ownedAsset, ownedRevision, revisionFiles, verifyStoredFiles, textField, id, dbFailure } from "./server";
import { readSavedPackage, preparePackageTransfers } from "./package-store";

const uuid={type:"string",format:"uuid"};
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({name,description,inputSchema:{type:"object",properties,required,additionalProperties:false}});
export const employeeTools=[
  tool("studio_context","Read your assignment, its exact input revisions, and the project brief.",{}),
  tool("studio_list_assets","List saved assets in this assigned project. Always open an exact assetId + revisionId.",{}),
  tool("studio_open_asset","Get short-lived private downloads for one exact saved native package. Verify every file's size and SHA-256 before opening.",{assetId:uuid,revisionId:uuid},["assetId","revisionId"]),
  tool("studio_create_asset","Create a library entry for your specialist application. Retrying the same operationId and name returns the same asset.",{operationId:uuid,name:{type:"string",minLength:1,maxLength:160}},["operationId","name"]),
  tool("studio_begin_revision","Reserve an immutable native package. Supply the exact expected base, or null for a new asset. File bytes upload directly to Storage.",{operationId:uuid,assetId:uuid,expectedBaseRevisionId:{anyOf:[uuid,{type:"null"}]},package:{type:"object"}},["operationId","assetId","expectedBaseRevisionId","package"]),
  tool("studio_upload_transfers","Get resumable upload tickets for your reserved revision; never send media bytes to this endpoint.",{revisionId:uuid},["revisionId"]),
  tool("studio_commit_revision","Confirm a fully uploaded package. A conflict preserves your save without replacing another revision. Stop and report conflicts.",{revisionId:uuid},["revisionId"]),
];

export async function employeeToolCall(auth:{db:DB;tokenHash:string;scope:EmployeeScope},name:string,args:Record<string,unknown>) {
  const {db,tokenHash,scope:s}=auth;
  const ownedProjectAsset=async(value:unknown)=>{
    const asset=await ownedAsset(db,s.workspaceId,id(value,"asset ID"));
    if(asset.project_id!==s.projectId)throw new ApiError(404,"not_found","Asset not found in this project.");
    return asset;
  };
  const writableRevision=async(value:unknown)=>{
    const revision=await ownedRevision(db,s.workspaceId,id(value,"revision ID"));
    if(revision.assignment_id!==s.assignmentId||revision.author_employee_id!==s.employeeId)throw new ApiError(404,"not_found","Revision not found in this assignment.");
    const asset=await ownedProjectAsset(revision.asset_id);
    if(asset.app_id!==s.appId)throw new ApiError(404,"not_found","Revision not found in this assignment.");
    return revision;
  };
  if(name==="studio_context"){
    const {data:project,error}=await db.from("studio_projects").select("id,name,brief").eq("workspace_id",s.workspaceId).eq("id",s.projectId).single();dbFailure(error);
    const {data:inputs,error:inputError}=await db.from("studio_assignment_inputs").select("asset_id,revision_id").eq("workspace_id",s.workspaceId).eq("assignment_id",s.assignmentId);dbFailure(inputError);
    return {assignmentId:s.assignmentId,role:s.role,appId:s.appId,brief:s.brief,project,inputs:(inputs??[]).map(row=>({assetId:row.asset_id,revisionId:row.revision_id}))};
  }
  if(name==="studio_list_assets"){
    const {data,error}=await db.from("studio_assets").select("id,name,app_id,current_revision_id").eq("workspace_id",s.workspaceId).eq("project_id",s.projectId).not("current_revision_id","is",null).order("created_at",{ascending:false}).limit(300);dbFailure(error);
    return {assets:(data??[]).map(row=>({name:row.name,appId:row.app_id,ref:{assetId:row.id,revisionId:row.current_revision_id}}))};
  }
  if(name==="studio_open_asset"){
    const asset=await ownedProjectAsset(args.assetId);
    const revision=await ownedRevision(db,s.workspaceId,id(args.revisionId,"revision ID"));
    if(revision.asset_id!==asset.id)throw new ApiError(404,"not_found","Saved asset reference not found.");
    return readSavedPackage(db,s.workspaceId,revision.id);
  }
  if(name==="studio_create_asset"){
    const {data,error}=await db.rpc("employee_create_asset",{p_hash:tokenHash,p_operation:id(args.operationId,"operation ID"),p_name:textField(args.name,160,"Asset name")});employeeDbFailure(error);return data;
  }
  if(name==="studio_begin_revision"){
    if(args.expectedBaseRevisionId===undefined)throw new ApiError(400,"base_required","Supply the exact base revision or null for the first save.");
    let pkg;try{pkg=validateRevisionPackage(args.package);}catch(error){throw new ApiError(400,"invalid_package",(error as Error).message);}
    const {data,error}=await db.rpc("employee_begin_revision",{p_hash:tokenHash,p_operation:id(args.operationId,"operation ID"),p_asset:id(args.assetId,"asset ID"),p_base:args.expectedBaseRevisionId===null?null:id(args.expectedBaseRevisionId,"base revision ID"),p_package:pkg});employeeDbFailure(error);return data;
  }
  if(name==="studio_upload_transfers"){
    const revision=await writableRevision(args.revisionId);
    return {...await preparePackageTransfers(db,s.workspaceId,revision.id),publicApiKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
  }
  if(name==="studio_commit_revision"){
    const revision=await writableRevision(args.revisionId);
    const verified=revision.state==="committed"||revision.state==="conflict"?[]:await verifyStoredFiles(db,await revisionFiles(db,s.workspaceId,revision.id));
    // Recheck capability inside the transaction, including cancellation that
    // happened while Storage completion was being verified.
    const {data,error}=await db.rpc("employee_commit_revision",{p_hash:tokenHash,p_revision:revision.id,p_verified_files:verified});employeeDbFailure(error);return data;
  }
  throw new ApiError(400,"unknown_tool","Unknown studio tool.");
}
