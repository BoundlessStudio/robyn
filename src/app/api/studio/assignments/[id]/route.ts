import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, id, dbFailure } from "@/studio/server";
import { assignmentRpc, assignmentRpcArgs, ownedAssignment } from "@/studio/assignment-server";
import { launchAssignment } from "@/studio/assignment-launch";
import type { Assignment } from "@/studio/assignments";
import { launchCampaign } from "@/studio/campaign-launch";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const assignmentId = id((await context.params).id, "assignment ID");
    const input = await readStudioBody(request);
    let assignment = await ownedAssignment(db, workspaceId, assignmentId);
    const identity = { workspaceId, userId: user.id, assignmentId };
    if (input.action === "cancel") assignment = await assignmentRpc<Assignment>(db, "cancel_studio_assignment", assignmentRpcArgs(identity));
    else if (input.action !== "reconnect") throw new ApiError(400, "invalid_action", "Choose cancel or reconnect.");
    const {data:campaign,error}=await db.from("studio_campaigns").select("id").eq("workspace_id",workspaceId).eq("root_assignment_id",assignmentId).maybeSingle();dbFailure(error);
    if(campaign){
      if(input.action==="cancel")await assignmentRpc(db,"cancel_studio_campaign",{p_workspace:workspaceId,p_user:user.id,p_campaign:campaign.id});
      await launchCampaign(db,{workspaceId,userId:user.id,campaignId:campaign.id});
    }
    await launchAssignment(db, identity, assignment);
    return json({ assignmentId, state: assignment.state });
  } catch (error) { return handleError(error); }
}
