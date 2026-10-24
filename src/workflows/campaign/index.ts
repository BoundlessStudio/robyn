import {getWorkflowMetadata,sleep} from "workflow";
import type {CampaignIdentity} from "@/studio/campaigns";
import {advanceCampaign} from "./steps";

export async function campaignWorkflow(identity:CampaignIdentity,previousWorkflowId:string|null=null){
  "use workflow";
  const {workflowRunId}=getWorkflowMetadata();
  while(true){
    try{if(await advanceCampaign(identity,workflowRunId,previousWorkflowId))return;}
    catch{/* Persisted ownership, workflow and step identities make retries safe. */}
    await sleep("15s");
  }
}
