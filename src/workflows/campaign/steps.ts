import {createAdminClient} from "@/lib/supabase/admin";
import {ApiError} from "@/lib/http";
import {assignmentRpc,ownedAssignment} from "@/studio/assignment-server";
import {launchAssignment} from "@/studio/assignment-launch";
import {campaignRpcArgs,ownedCampaign} from "@/studio/campaign-server";
import type {CampaignIdentity} from "@/studio/campaigns";

export async function advanceCampaign(identity:CampaignIdentity,workflowId:string,previousWorkflowId:string|null){
  "use step";
  const db=createAdminClient();
  try{await ownedCampaign(db,identity);}catch(error){if(error instanceof ApiError&&error.status===404)return true;throw error;}
  const args={...campaignRpcArgs(identity),p_workflow:workflowId};
  if(!await assignmentRpc<boolean>(db,"bind_studio_campaign_workflow",{...args,p_previous:previousWorkflowId}))return true;
  const next=await assignmentRpc<{done:boolean;assignments:string[]}>(db,"advance_studio_campaign",args);
  for(const assignmentId of next.assignments){
    const assignment=await ownedAssignment(db,identity.workspaceId,assignmentId);
    await launchAssignment(db,{workspaceId:identity.workspaceId,userId:identity.userId,assignmentId},assignment);
  }
  return next.done;
}
