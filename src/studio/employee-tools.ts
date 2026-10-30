import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { validateRevisionPackage } from "./assets";
import { type EmployeeScope, employeeDbFailure } from "./employee-auth";
import { ownedAsset, ownedRevision, revisionFiles, verifyStoredFiles, textField, id, dbFailure } from "./server";
import { readSavedPackage, preparePackageTransfers } from "./package-store";
import { studioTools as studioApps } from "./tools";
import { studioApps as craftApps } from "./apps/registry";
import { isEmployeeReady } from "./manifest";
import { parseCampaignSteps } from "./campaigns";
import { launchCampaign } from "./campaign-launch";
import { createMediaJob, ownedMediaJob, searchMedia } from "./media-server";
import { launchMediaJob } from "./media-launch";
import { publicMediaJob } from "./media";

const uuid={type:"string",format:"uuid"};
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({name,description,inputSchema:{type:"object",properties,required,additionalProperties:false}});
export const employeeTools=[
  tool("search_media","Search Wikimedia Commons within this project. Only CC0 and CC BY results are shown. A search preview is not an acquired source asset.",{kind:{type:"string",enum:["image","video","music","sound_effect"]},query:{type:"string",minLength:1,maxLength:100},page:{type:"integer",minimum:1,maximum:25}},["kind","query"]),
  tool("import_media","Acquire one search result as an immutable source-media asset. Keep the operationId on retries; poll get_media_job before using the result.",{operationId:uuid,discoveryId:uuid,kind:{type:"string",enum:["image","audio","video"]},name:{type:"string",minLength:1,maxLength:160}},["operationId","discoveryId","kind","name"]),
  tool("generate_media","Start a budgeted Perflo job. New work accepts only blockrun-image-gen (CogView-4, 1024x1024), blockrun-tts (Flash v2.5, Sarah, MP3, speed 1), or treza-video (MiniMax H3, 5 seconds, 16:9). Empty settings choose those defaults. Other listed services/options remain readable only to retry an existing operation; do not create new preview requests. Robyn estimates cost against the Studio allowance. Poll get_media_job. Keep the original operationId and exact request after an uncertain response. Image-edit recovery needs its original saved source-image input.",{operationId:uuid,service:{type:"string",enum:["blockrun-image-gen","paysponge-gemini-image","blockrun-image-edit","blockrun-tts","blockrun-ai-api-v1-audio-sound-effects","treza-video"]},name:{type:"string",minLength:1,maxLength:160},prompt:{type:"string",minLength:1,maxLength:10000},settings:{type:"object"},inputs:{type:"array",maxItems:1,items:{type:"object",properties:{assetId:uuid,revisionId:uuid},required:["assetId","revisionId"],additionalProperties:false}}},["operationId","service","name","prompt"]),
  tool("get_media_job","Read/reconnect the same media job. Use its exact output AssetRef only once completed. Uncertain payments retain their spend reservation; never replace them with a new operationId.",{jobId:uuid},["jobId"]),
  tool("studio_context","Read your assignment, its exact input revisions, and the project brief.",{}),
  tool("studio_team","Director only: discover the studio's available specialists and their capabilities.",{}),
  tool("studio_plan","Director only: save one immutable production plan. Prerequisites must precede their consumers; their exact output revisions are handed onward automatically.",{operationId:uuid,steps:{type:"array",minItems:1,maxItems:20,items:{type:"object",properties:{key:{type:"string"},appId:{type:"string"},brief:{type:"string",maxLength:10000},dependsOn:{type:"array",items:{type:"string"}},inputs:{type:"array",items:{type:"object",properties:{assetId:uuid,revisionId:uuid},required:["assetId","revisionId"]}},final:{type:"boolean"}},required:["key","appId","brief","dependsOn","inputs","final"],additionalProperties:false}}},["operationId","steps"]),
  tool("studio_list_assets","List saved assets in this assigned project. Always open an exact assetId + revisionId.",{}),
  tool("studio_open_asset","Get short-lived private downloads and provenance for one exact saved native or source-media package. Verify every file's size and SHA-256 before opening.",{assetId:uuid,revisionId:uuid},["assetId","revisionId"]),
  tool("studio_create_asset","Create a library entry in an allowed application. Include appId; retry the same operationId, appId and name after a lost reply.",{operationId:uuid,appId:{type:"string"},name:{type:"string",minLength:1,maxLength:160}},["operationId","name"]),
  tool("studio_begin_revision","Reserve an immutable native package. Supply the exact expected base, or null for a new asset. File bytes upload directly to Storage.",{operationId:uuid,assetId:uuid,expectedBaseRevisionId:{anyOf:[uuid,{type:"null"}]},package:{type:"object"}},["operationId","assetId","expectedBaseRevisionId","package"]),
  tool("studio_upload_transfers","Get resumable upload tickets for your reserved revision; never send media bytes to this endpoint.",{revisionId:uuid},["revisionId"]),
  tool("studio_commit_revision","Confirm a fully uploaded package. A conflict preserves your save without replacing another revision. Stop and report conflicts.",{revisionId:uuid},["revisionId"]),
];

export function employeeToolsFor(scope:EmployeeScope) {
  if(scope.kind!=="robyn")return employeeTools;
  return employeeTools.filter(t=>!["studio_team","studio_plan"].includes(t.name)).map(t=>t.name==="studio_create_asset"?{...t,inputSchema:{...t.inputSchema,required:[...t.inputSchema.required,"appId"]}}:t);
}

function writableApp(scope:EmployeeScope, appId:string|null) {
  return scope.kind==="robyn" ? appId==="research"||Boolean(appId&&scope.allowedAppIds?.includes(appId)&&craftApps.some(app=>app.id===appId)) : appId===scope.appId;
}

export async function employeeToolCall(auth:{db:DB;tokenHash:string;scope:EmployeeScope},name:string,args:Record<string,unknown>) {
  const {db,tokenHash,scope:s}=auth;
  if(s.startMode==="plan"&&["studio_plan","import_media","generate_media","studio_create_asset","studio_begin_revision","studio_upload_transfers","studio_commit_revision"].includes(name))
    throw new ApiError(409,"planning_only","This request is for planning. Return your advice to the creator; production needs a new Make a first draft request.");
  const mediaIdentity={workspaceId:s.workspaceId,userId:s.userId,projectId:s.projectId};
  if(name==="search_media")return searchMedia(db,mediaIdentity,args);
  if(name==="import_media"||name==="generate_media"){
    const job=await createMediaJob(db,mediaIdentity,{...args,operation:name==="import_media"?"import":"generate",...(name==="import_media"?{provider:"commons"}:{})},tokenHash);
    await launchMediaJob(db,mediaIdentity,job);
    return {job:publicMediaJob(job)};
  }
  if(name==="get_media_job"){
    const job=await ownedMediaJob(db,mediaIdentity,id(args.jobId,"media job ID"));
    if(s.startMode!=="plan")await launchMediaJob(db,mediaIdentity,job);
    return {job:publicMediaJob(job)};
  }
  const ownedProjectAsset=async(value:unknown)=>{
    const asset=await ownedAsset(db,s.workspaceId,id(value,"asset ID"));
    if(asset.project_id!==s.projectId)throw new ApiError(404,"not_found","Asset not found in this project.");
    return asset;
  };
  const writableRevision=async(value:unknown)=>{
    const revision=await ownedRevision(db,s.workspaceId,id(value,"revision ID"));
    if(revision.assignment_id!==s.assignmentId||revision.author_employee_id!==s.employeeId)throw new ApiError(404,"not_found","Revision not found in this assignment.");
    const asset=await ownedProjectAsset(revision.asset_id);
    if(!writableApp(s,asset.app_id))throw new ApiError(404,"not_found","Revision not found in this assignment.");
    return revision;
  };
  if(name==="studio_context"){
    const {data:project,error}=await db.from("studio_projects").select("id,name,brief").eq("workspace_id",s.workspaceId).eq("id",s.projectId).single();dbFailure(error);
    const {data:inputs,error:inputError}=await db.from("studio_assignment_inputs").select("asset_id,revision_id").eq("workspace_id",s.workspaceId).eq("assignment_id",s.assignmentId);dbFailure(inputError);
    const {data:assignment,error:assignmentError}=await db.from("studio_assignments").select("purpose").eq("workspace_id",s.workspaceId).eq("id",s.assignmentId).single();dbFailure(assignmentError);
    if(!assignment)throw new ApiError(404,"not_found","Assignment not found.");
    const {data:campaign,error:campaignError}=await db.from("studio_campaigns").select("id,state,specification").eq("workspace_id",s.workspaceId).eq("root_assignment_id",s.assignmentId).maybeSingle();dbFailure(campaignError);
    return {assignmentId:s.assignmentId,role:s.role,kind:s.kind,appId:s.appId,appIdHint:s.appIdHint??s.appId,allowedAppIds:s.allowedAppIds??(s.appId?[s.appId]:[]),generation:s.generation,profile:s.profile,purpose:assignment.purpose,startMode:s.startMode??"work",brief:s.brief,project,campaign,inputs:(inputs??[]).map(row=>({assetId:row.asset_id,revisionId:row.revision_id}))};
  }
  if(name==="studio_team"){
    if(s.kind!=="director")throw new ApiError(403,"director_only","Only the Director can coordinate the studio.");
    return {specialists:studioApps.map(app=>({appId:app.id,role:app.employee.role,capabilities:app.capabilities,ready:isEmployeeReady(app)})),maxConcurrentSpecialists:3};
  }
  if(name==="studio_plan"){
    if(s.kind!=="director")throw new ApiError(403,"director_only","Only the Director can create a production plan.");
    let steps;try{steps=parseCampaignSteps(args.steps);}catch(error){throw new ApiError(400,"invalid_campaign",(error as Error).message);}
    if(steps.some(step=>!studioApps.some(app=>app.id===step.appId&&isEmployeeReady(app))))throw new ApiError(409,"integration_pending","The plan includes an application that is still being verified. Use studio_team to check availability.");
    const {data,error}=await db.rpc("director_create_campaign",{p_hash:tokenHash,p_operation:id(args.operationId,"operation ID"),p_steps:steps});employeeDbFailure(error);
    const campaign=data as {campaignId:string;state:string;steps:number};
    await launchCampaign(db,{workspaceId:s.workspaceId,userId:s.userId,campaignId:campaign.campaignId});
    return campaign;
  }
  if(name==="studio_list_assets"){
    const {data,error}=await db.from("studio_assets").select("id,name,app_id,asset_kind,current_revision_id").eq("workspace_id",s.workspaceId).eq("project_id",s.projectId).not("current_revision_id","is",null).order("created_at",{ascending:false}).limit(300);dbFailure(error);
    return {assets:(data??[]).map(row=>({name:row.name,appId:row.app_id,kind:row.asset_kind,ref:{assetId:row.id,revisionId:row.current_revision_id}}))};
  }
  if(name==="studio_open_asset"){
    const asset=await ownedProjectAsset(args.assetId);
    const revision=await ownedRevision(db,s.workspaceId,id(args.revisionId,"revision ID"));
    if(revision.asset_id!==asset.id)throw new ApiError(404,"not_found","Saved asset reference not found.");
    return {...await readSavedPackage(db,s.workspaceId,revision.id),appId:asset.asset_kind&&asset.asset_kind!=="native"?null:asset.app_id};
  }
  if(name==="studio_create_asset"){
    if(s.kind==="robyn"&&(typeof args.appId!=="string"||!writableApp(s,args.appId)))throw new ApiError(403,"application_not_allowed","Choose an application allowed for this job.");
    const {data,error}=await db.rpc("employee_create_asset",{p_hash:tokenHash,p_operation:id(args.operationId,"operation ID"),p_name:textField(args.name,160,"Asset name"),...(s.kind==="robyn"?{p_app:args.appId}:{})});employeeDbFailure(error);return data;
  }
  if(name==="studio_begin_revision"){
    if(args.expectedBaseRevisionId===undefined)throw new ApiError(400,"base_required","Supply the exact base revision or null for the first save.");
    const asset=await ownedProjectAsset(args.assetId);
    if(!writableApp(s,asset.app_id))throw new ApiError(403,"application_not_allowed","Choose an application allowed for this job.");
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
