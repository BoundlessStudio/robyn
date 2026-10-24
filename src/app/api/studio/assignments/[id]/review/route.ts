import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, id, textField } from "@/studio/server";
import { assignmentRpcArgs, ownedAssignment } from "@/studio/assignment-server";
import { launchAssignment } from "@/studio/assignment-launch";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const assignmentId = id((await context.params).id, "assignment ID");
    const input = await readStudioBody(request);
    const decision = input.decision;
    if (decision !== "approved" && decision !== "changes_requested") throw new ApiError(400, "invalid_review", "Approve the work or request changes.");
    const identity = { workspaceId, userId: user.id, assignmentId };
    const { data, error } = await db.rpc("review_studio_assignment", { ...assignmentRpcArgs(identity), p_request: id(input.requestId, "request ID"), p_decision: decision, p_feedback: textField(input.feedback, 10000, "Feedback", decision === "approved") });
    if (error) {
      if (/not found/.test(error.message)) throw new ApiError(404, "not_found", "Assignment not found.");
      throw new ApiError(409, "review_unavailable", "This assignment has already been reviewed or is not ready for review.");
    }
    if (data.followup_assignment_id) {
      const assignment = await ownedAssignment(db, workspaceId, data.followup_assignment_id);
      await launchAssignment(db, { ...identity, assignmentId: assignment.id }, assignment);
    }
    return json({ decision: data.decision, followupAssignmentId: data.followup_assignment_id });
  } catch (error) { return handleError(error); }
}
