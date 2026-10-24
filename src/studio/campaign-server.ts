import "server-only";
import type {DB} from "@/lib/auth";
import {ApiError} from "@/lib/http";
import {dbFailure} from "./server";
import type {Campaign,CampaignIdentity} from "./campaigns";

export const campaignRpcArgs=(identity:CampaignIdentity)=>({p_workspace:identity.workspaceId,p_user:identity.userId,p_campaign:identity.campaignId});
export async function ownedCampaign(db:DB,identity:CampaignIdentity):Promise<Campaign>{
  const {data:owner,error:ownerError}=await db.from("workspaces").select("id").eq("id",identity.workspaceId).eq("owner_id",identity.userId).maybeSingle();dbFailure(ownerError);
  if(!owner)throw new ApiError(404,"not_found","Studio not found.");
  const {data,error}=await db.from("studio_campaigns").select("*").eq("workspace_id",identity.workspaceId).eq("id",identity.campaignId).maybeSingle();dbFailure(error);
  if(!data)throw new ApiError(404,"not_found","Production plan not found.");
  return data as Campaign;
}
