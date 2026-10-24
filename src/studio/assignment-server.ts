import "server-only";
import type { DB } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/http";
import { dbFailure } from "./server";
import type { Assignment, AssignmentFence, AssignmentIdentity, StudioEmployee } from "./assignments";

export function assignmentRpcArgs(identity: AssignmentIdentity) {
  return { p_workspace: identity.workspaceId, p_user: identity.userId, p_assignment: identity.assignmentId };
}
export function assignmentFenceArgs(fence: AssignmentFence) {
  return { ...assignmentRpcArgs(fence), p_workflow: fence.workflowId, p_attempt: fence.attemptId };
}
export async function assignmentRpc<T>(db: DB, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error?.message.includes("operation key reused")) throw new ApiError(409, "operation_key_reused", "This request was already used for a different assignment.");
  dbFailure(error);
  return data as T;
}
export async function ownedAssignment(db: DB, workspaceId: string, assignmentId: string): Promise<Assignment> {
  const { data, error } = await db.from("studio_assignments").select("*").eq("workspace_id", workspaceId).eq("id", assignmentId).maybeSingle();
  dbFailure(error);
  if (!data) throw new ApiError(404, "not_found", "Assignment not found.");
  return data as Assignment;
}
/** Workflows have no browser cookies. Recheck the persisted owner on every step. */
export async function readAssignmentContext(identity: AssignmentIdentity) {
  const db = createAdminClient();
  const { data: workspace, error } = await db.from("workspaces").select("id").eq("id", identity.workspaceId).eq("owner_id", identity.userId).maybeSingle();
  dbFailure(error);
  if (!workspace) throw new ApiError(404, "not_found", "Studio not found.");
  const assignment = await ownedAssignment(db, identity.workspaceId, identity.assignmentId);
  const { data: employee, error: employeeError } = await db.from("studio_employees").select("*").eq("workspace_id", identity.workspaceId).eq("id", assignment.employee_id).single();
  dbFailure(employeeError);
  const { data: project, error: projectError } = await db.from("studio_projects").select("id,name,brief,status").eq("workspace_id", identity.workspaceId).eq("id", assignment.project_id).single();
  dbFailure(projectError);
  return { db, assignment, employee: employee as StudioEmployee, project: project as { id: string; name: string; brief: string; status: string } };
}
export function ownsAssignmentFence(assignment: Assignment, fence: AssignmentFence) {
  return assignment.workflow_id === fence.workflowId && assignment.run_attempt === fence.attemptId;
}
