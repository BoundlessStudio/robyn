import "server-only";
import {getRun,start} from "workflow/api";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {campaignWorkflow} from "@/workflows/campaign";
import {assignmentRpc} from "./assignment-server";
import {ownedCampaign,campaignRpcArgs} from "./campaign-server";
import {campaignIsActive,type CampaignIdentity} from "./campaigns";

export async function launchCampaign(db:DB,identity:CampaignIdentity){
  const campaign=await ownedCampaign(db,identity);
  if(!campaignIsActive(campaign))return;
  try{
    if(campaign.workflow_id){
      const run=getRun(campaign.workflow_id);
      if(await run.exists&&["pending","running"].includes(await run.status)){await run.wakeUp();return;}
    }
    const run=await start(campaignWorkflow,[identity,campaign.workflow_id]);
    await assignmentRpc(db,"bind_studio_campaign_workflow",{...campaignRpcArgs(identity),p_previous:campaign.workflow_id,p_workflow:run.runId});
  }catch{throw new ApiError(503,"campaign_launch_pending","The production plan is saved. Reconnect it to continue.");}
}
