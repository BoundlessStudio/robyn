import { getWorkflowMetadata, sleep } from "workflow";
import type { AssignmentIdentity } from "@/studio/assignments";
import { claimAssignment, dispatchAssignment, observeAssignment, prepareAssignment, launchAssignmentCampaign } from "./steps";

export async function assignmentWorkflow(identity: AssignmentIdentity, previousWorkflowId: string | null = null) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  while (true) {
    try {
    const claim = await claimAssignment(identity, workflowRunId, previousWorkflowId);
    if (claim.done) { await launchAssignmentCampaign(identity); return; }
    if (!claim.fence) { await sleep("15s"); continue; }
    while (true) {
      const preparation = await prepareAssignment(claim.fence);
      if (preparation === "done") return;
      if (preparation === "ready") break;
      await sleep("30s");
    }
    await dispatchAssignment(claim.fence);
    while (await observeAssignment(claim.fence) !== "done") await sleep("10s");
    await launchAssignmentCampaign(identity);
    return;
    } catch {
      // A platform/database interruption must not orphan an owned assignment.
      // Re-enter through persisted fences; completed steps need no secret state.
      await sleep("1m");
    }
  }
}
