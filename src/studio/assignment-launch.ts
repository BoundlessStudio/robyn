import "server-only";
import { getRun, start } from "workflow/api";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { assignmentWorkflow } from "@/workflows/assignment";
import { assignmentRpc, assignmentRpcArgs } from "./assignment-server";
import { assignmentIsActive, type Assignment, type AssignmentIdentity } from "./assignments";

export async function launchAssignment(db: DB, identity: AssignmentIdentity, assignment: Assignment) {
  if (!assignmentIsActive(assignment)) return;
  try {
    const previous = assignment.workflow_id;
    if (previous) {
      const run = getRun(previous);
      if (await run.exists && ["pending", "running"].includes(await run.status)) {
        await run.wakeUp();
        return;
      }
    } else if (assignment.state !== "queued") return;
    const run = await start(assignmentWorkflow, [identity, previous]);
    // Either the route or the worker may arrive first. Duplicate starts exit
    // at this same database fence before claiming a workstation or a turn.
    await assignmentRpc(db, previous ? "replace_studio_assignment_workflow" : "bind_studio_assignment_workflow", {
      ...assignmentRpcArgs(identity), p_workflow: run.runId, ...(previous ? { p_previous: previous } : {}),
    });
  } catch {
    throw new ApiError(503, "assignment_launch_pending", "Your assignment is saved. Retry this request to reconnect it.");
  }
}
