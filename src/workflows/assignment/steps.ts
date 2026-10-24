import { agent37 } from "@/lib/agent37";
import { ApiError } from "@/lib/http";
import { assignmentFenceArgs, assignmentRpc, assignmentRpcArgs, ownsAssignmentFence, readAssignmentContext } from "@/studio/assignment-server";
import { assignmentIsActive, assignmentMarker, type Assignment, type AssignmentFence, type AssignmentIdentity } from "@/studio/assignments";
import { finishedAssignmentHistory, readTurnStream } from "@/studio/assignment-protocol";
import { ensureEmployeeInstance, prepareEmployeeAssignment, WorkstationConfigurationError } from "@/studio/workstation";
import { launchCampaign } from "@/studio/campaign-launch";
import { dbFailure } from "@/studio/server";

export async function launchAssignmentCampaign(identity:AssignmentIdentity){
  "use step";
  let context;
  try{context=await readAssignmentContext(identity);}catch(error){if(error instanceof ApiError&&error.status===404)return;throw error;}
  const {data,error}=await context.db.from("studio_campaigns").select("id").eq("workspace_id",identity.workspaceId).eq("root_assignment_id",identity.assignmentId).maybeSingle();dbFailure(error);
  if(data)await launchCampaign(context.db,{workspaceId:identity.workspaceId,userId:identity.userId,campaignId:data.id});
}

export async function claimAssignment(identity: AssignmentIdentity, workflowId: string, previousWorkflowId: string | null = null): Promise<{ done: true } | { done: false; fence: AssignmentFence | null }> {
  "use step";
  let context;
  try { context = await readAssignmentContext(identity); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return { done: true }; throw error; }
  if (!await assignmentRpc<boolean>(context.db, previousWorkflowId ? "replace_studio_assignment_workflow" : "bind_studio_assignment_workflow", {
    ...assignmentRpcArgs(identity), p_workflow: workflowId, ...(previousWorkflowId ? { p_previous: previousWorkflowId } : {}),
  })) return { done: true };
  if (!assignmentIsActive(context.assignment)) return { done: true };
  const { assignment } = await assignmentRpc<{ claimed: boolean; assignment: Assignment }>(context.db, "claim_studio_assignment", assignmentRpcArgs(identity));
  return assignment.run_attempt && ["running", "cancelling"].includes(assignment.state)
    ? { done: false, fence: { ...identity, workflowId, attemptId: assignment.run_attempt } }
    : { done: false, fence: null };
}

async function finish(fence: AssignmentFence, outcome: "completed" | "failed" | "cancelled", text: string, error: string | null = null) {
  const { db, assignment } = await readAssignmentContext(fence);
  return assignmentRpc<Assignment | null>(db, "finish_studio_assignment", {
    ...assignmentFenceArgs(fence), p_response: assignment.response_id, p_outcome: outcome, p_text: text, p_error: error,
  });
}

export async function prepareAssignment(fence: AssignmentFence): Promise<"ready" | "wait" | "done"> {
  "use step";
  const { db, assignment, employee, project } = await readAssignmentContext(fence);
  if (!ownsAssignmentFence(assignment, fence) || !assignmentIsActive(assignment)) return "done";
  if (assignment.browser_paused || employee.browser_control && employee.browser_control !== "agent") return "wait";
  if (assignment.dispatch_state !== "idle") return "ready";
  if (assignment.state === "cancelling" || project.status !== "active") {
    await finish(fence, "cancelled", "The assignment was cancelled before work started.");
    return "done";
  }
  try {
    const instance = await ensureEmployeeInstance(db, fence, employee);
    if (!instance) return "wait";
    if (!await prepareEmployeeAssignment(db, fence, assignment, employee, instance)) return "wait";
    await db.from("studio_assignments").update({ error_code: null }).eq("id", fence.assignmentId).eq("workspace_id", fence.workspaceId).eq("workflow_id", fence.workflowId).eq("run_attempt", fence.attemptId).eq("state", "running");
    return "ready";
  } catch (error) {
    if (error instanceof WorkstationConfigurationError) {
      await finish(fence, "failed", "The employee's workstation needs attention before it can start.", error.message);
      return "done";
    }
    // Only a stable code is stored. Upstream errors can contain private paths.
    await db.from("studio_assignments").update({ error_code: "workstation_recovering" }).eq("id", fence.assignmentId).eq("workspace_id", fence.workspaceId).eq("workflow_id", fence.workflowId).eq("run_attempt", fence.attemptId).eq("state", "running");
    return "wait";
  }
}

export async function dispatchAssignment(fence: AssignmentFence) {
  "use step";
  const { db, assignment, employee } = await readAssignmentContext(fence);
  if (!ownsAssignmentFence(assignment, fence) || !employee.instance_id || !assignment.session_id) return;
  const args = assignmentFenceArgs(fence);
  if (!await assignmentRpc<boolean>(db, "claim_studio_assignment_dispatch", args)) return;
  try {
    const browserReturn = assignment.browser_turns?.length ? "\nThe creator has returned control after using your browser. Inspect the CURRENT browser state and existing files in this assignment's workRoot before acting. Continue this same brief from what is already done. Do not repeat completed external actions; verify their outcome and ask if uncertain.\n" : "";
    const prompt = `${assignmentMarker(assignment.id)}\nYou are ${employee.role}.\n${employee.instructions}\nAssignment purpose: ${assignment.purpose}.\n\nRead studio_context first. The assigned brief and exact input revisions there are authoritative. Complete only this assignment. Preserve native editability and use confirmed library saves. Never read credential files.${browserReturn}\n\nCreator's brief:\n${assignment.brief}`;
    const response = await agent37.submitAssignmentTurn(employee.instance_id, prompt, assignment.session_id, AbortSignal.timeout(185_000));
    const observed = await readTurnStream(response, true, { sessionId: assignment.session_id });
    if (observed?.kind === "created") {
      await assignmentRpc<boolean>(db, "record_studio_assignment_response", { ...args, p_session: observed.sessionId, p_response: observed.responseId });
      return;
    }
  } catch { /* The session, never another POST, resolves an unknown outcome. */ }
  await assignmentRpc<boolean>(db, "mark_studio_dispatch_uncertain", args);
}

export async function observeAssignment(fence: AssignmentFence): Promise<"wait" | "done"> {
  "use step";
  const { db, assignment, employee, project } = await readAssignmentContext(fence);
  if (!ownsAssignmentFence(assignment, fence) || !assignmentIsActive(assignment)) return "done";
  if (assignment.browser_paused && assignment.state === "running") return "wait";
  if (project.status !== "active" && assignment.state === "running") {
    await assignmentRpc(db, "cancel_studio_assignment", assignmentRpcArgs(fence));
    assignment.state = "cancelling";
  }
  if (assignment.state === "cancelling" && assignment.dispatch_state === "idle") {
    await finish(fence, "cancelled", "The assignment was cancelled before work started."); return "done";
  }
  if (!employee.instance_id || !assignment.session_id) return "wait";
  try {
    const session = await agent37.assignmentSession(employee.instance_id, assignment.session_id);
    let responseId = assignment.response_id;
    if (!responseId && session.active_response_id) {
      responseId = session.active_response_id;
      if (!await assignmentRpc<boolean>(db, "record_studio_assignment_response", { ...assignmentFenceArgs(fence), p_session: session.id, p_response: responseId })) return "wait";
    }
    if (responseId) {
      if (assignment.state === "cancelling" && session.active_response_id === responseId) {
        await agent37.cancelResponse(employee.instance_id, responseId);
      }
      const response = await agent37.assignmentResponseStream(employee.instance_id, responseId, AbortSignal.timeout(25_000));
      const observed = await readTurnStream(response, false, { sessionId: assignment.session_id, responseId });
      if (observed?.kind === "completed" || observed?.kind === "failed") {
        const ended = await finish(fence, observed.kind === "completed" ? "completed" : "failed", observed.kind === "completed" ? observed.text : "The employee could not finish this assignment.", observed.kind === "failed" ? observed.code : null);
        return ended ? "done" : "wait";
      }
    }
    const text = finishedAssignmentHistory(session, assignment.id, assignment.session_id);
    if (text !== null) {
      if (!await assignmentRpc<boolean>(db, "record_studio_assignment_terminal_history", { ...assignmentFenceArgs(fence), p_session: session.id })) return "wait";
      const ended = await finish(fence, "completed", text);
      return ended ? "done" : "wait";
    }
    return "wait";
  } catch {
    // Disconnected/restarting gateways are recoverable. In particular, an empty
    // history with no response ID never releases this employee's serial queue.
    return "wait";
  }
}
