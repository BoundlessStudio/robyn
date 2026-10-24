import { requireUuid, type AssetRef } from "./assets";

export interface CampaignStep { key:string; appId:string; brief:string; dependsOn:string[]; inputs:AssetRef[]; final:boolean }
export interface CampaignIdentity { workspaceId:string; userId:string; campaignId:string }
export type CampaignState="planning"|"running"|"cancelling"|"awaiting_review"|"completed"|"cancelled"|"failed";
export interface Campaign {id:string;workspace_id:string;project_id:string;root_assignment_id:string;final_assignment_id:string|null;workflow_id:string|null;state:CampaignState;error_code:string|null}
export const campaignIsActive=(campaign:Pick<Campaign,"state">)=>["planning","running","cancelling"].includes(campaign.state);

export function parseCampaignSteps(value:unknown):CampaignStep[]{
  if(!Array.isArray(value)||value.length<1||value.length>20)throw Error("Plan 1–20 specialist tasks.");
  const seen=new Set<string>();
  const steps=value.map(raw=>{
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Supply a complete task.");
    const {key,appId,brief,dependsOn,inputs,final}=raw;
    if(typeof key!=="string"||!/^[a-z][a-z0-9-]{0,39}$/.test(key)||seen.has(key))throw Error("Use a distinct short key for every task.");
    if(typeof appId!=="string"||!/^[a-z][a-z0-9-]{0,49}$/.test(appId)||typeof brief!=="string"||!brief.trim()||brief.trim().length>10000)throw Error("Each task needs an application and a brief of up to 10,000 characters.");
    if(!Array.isArray(dependsOn)||dependsOn.length>20||dependsOn.some(dep=>typeof dep!=="string"||!seen.has(dep))||new Set(dependsOn).size!==dependsOn.length)throw Error("List each prerequisite once, before its dependent task.");
    if(!Array.isArray(inputs)||inputs.length>100||typeof final!=="boolean")throw Error("Supply exact input revisions and mark final deliverables.");
    const refs=inputs.map(ref=>({assetId:requireUuid(ref?.assetId),revisionId:requireUuid(ref?.revisionId)}));
    if(new Set(refs.map(ref=>ref.revisionId)).size!==refs.length)throw Error("Use each input revision once per task.");
    seen.add(key);
    return {key,appId,brief:brief.trim(),dependsOn:dependsOn as string[],inputs:refs,final};
  });
  if(!steps.some(step=>step.final))throw Error("Mark at least one task as a final deliverable.");
  return steps;
}
