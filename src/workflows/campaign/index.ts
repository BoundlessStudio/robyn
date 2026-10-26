import {recordWorkflowHealth} from "../health";
import {retryDelay,workflowFailure} from "@/studio/workflow-health";
import {getWorkflowMetadata,sleep} from "workflow";
import type {CampaignIdentity} from "@/studio/campaigns";
import {advanceCampaign} from "./steps";

export async function campaignWorkflow(identity:CampaignIdentity,previousWorkflowId:string|null=null){
  "use workflow";
  const {workflowRunId}=getWorkflowMetadata();
  let failures=0;
  while(true){
    try{const done=await advanceCampaign(identity,workflowRunId,previousWorkflowId);await recordWorkflowHealth(identity,"campaign",identity.campaignId,workflowRunId);failures=0;if(done)return;}
    catch(error){const delay=retryDelay(++failures);try{await recordWorkflowHealth(identity,"campaign",identity.campaignId,workflowRunId,workflowFailure(error),delay);}catch{}await sleep(`${delay}s`);continue;}
    await sleep("15s");
  }
}
