import "server-only";
import { ApiError } from "@/lib/api-error";
import { launchAssignment } from "@/studio/assignment-launch";
import { assignmentRpc, assignmentRpcArgs, ownedAssignment } from "@/studio/assignment-server";
import type { Assignment, AssignmentState } from "@/studio/assignments";
import { finishPage, pageFilter } from "@/studio/pagination";
import { dbFailure, ownedProject } from "@/studio/server";
import type { McpIdentity } from "./oauth";
import { pageFor } from "./pagination";

type JobRef = { projectId: string; assignmentId: string };

async function jobInProject({ db, workspaceId }: McpIdentity, { projectId, assignmentId }: JobRef) {
  await ownedProject(db, workspaceId, projectId);
  const job = await ownedAssignment(db, workspaceId, assignmentId);
  if (job.project_id !== projectId) throw new ApiError(404, "not_found", "Job not found in this project.");
  return job;
}

export async function listRobynJobs(
  { db, workspaceId }: McpIdentity,
  input: { projectId?: string; state?: AssignmentState; cursor?: string },
) {
  const page = pageFor(input);
  let query = db.from("studio_assignments").select("id,project_id,app_id,state,brief,created_at,started_at,finished_at")
    .eq("workspace_id", workspaceId).eq("execution_model", "robyn");
  if (input.projectId) {
    await ownedProject(db, workspaceId, input.projectId);
    query = query.eq("project_id", input.projectId);
  }
  if (input.state) query = query.eq("state", input.state);
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(page.size + 1);
  dbFailure(error);
  const { items, nextCursor } = finishPage(data ?? [], page.size);
  return {
    jobs: items.map(row => ({ assignmentId: row.id, projectId: row.project_id, appId: row.app_id,
      state: row.state, briefExcerpt: row.brief.slice(0, 240), createdAt: row.created_at,
      startedAt: row.started_at, finishedAt: row.finished_at })),
    nextCursor,
  };
}

export async function getRobynJob(identity: McpIdentity, input: JobRef) {
  const { db, workspaceId } = identity;
  const job = await jobInProject(identity, input);
  const [revisions, shared] = await Promise.all([
    db.from("studio_revisions").select("id,asset_id,state").eq("workspace_id", workspaceId).eq("assignment_id", job.id).in("state", ["committed", "conflict"]),
    db.from("studio_assignment_deliverables").select("asset_id,revision_id").eq("workspace_id", workspaceId).eq("assignment_id", job.id),
  ]);
  dbFailure(revisions.error);
  dbFailure(shared.error);
  const deliverables = [...(revisions.data ?? []).map(row => ({ assetId: row.asset_id, revisionId: row.id, status: row.state })),
    ...(shared.data ?? []).map(row => ({ assetId: row.asset_id, revisionId: row.revision_id, status: "committed" }))];
  return { assignmentId: job.id, projectId: job.project_id, state: job.state, result: job.result_text, errorCode: job.error_code,
    deliverables: [...new Map(deliverables.map(row => [row.revisionId, row])).values()] };
}

export async function cancelRobynJob(identity: McpIdentity, input: JobRef) {
  const { db, workspaceId, userId, grantId } = identity;
  const job = await jobInProject(identity, input);
  if (job.execution_model !== "robyn") throw new ApiError(404, "not_found", "Job not found in this project.");
  const assignment = { workspaceId, userId, assignmentId: job.id };
  const saved = await assignmentRpc<Assignment>(db, "cancel_studio_mcp_job", {
    ...assignmentRpcArgs(assignment), p_grant: grantId, p_project: job.project_id,
  });
  await launchAssignment(db, assignment, saved);
  return { assignmentId: saved.id, state: saved.state };
}
