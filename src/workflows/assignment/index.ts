import {recordWorkflowHealth} from "../health";
import {retryDelay,workflowFailure} from "@/studio/workflow-health";
import { getWorkflowMetadata, sleep } from "workflow";
import type { AssignmentIdentity } from "@/studio/assignments";
import { claimAssignment, dispatchAssignment, observeAssignment, prepareAssignment, launchAssignmentCampaign } from "./steps";

export async function assignmentWorkflow(identity: AssignmentIdentity, previousWorkflowId: string | null = null) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  let failures=0;
  while (true) {
    try {
    const claim = await claimAssignment(identity, workflowRunId, previousWorkflowId);
    if(!failures)await recordWorkflowHealth(identity,"assignment",identity.assignmentId,workflowRunId);
    if (claim.done) { await launchAssignmentCampaign(identity); return; }
    if (!claim.fence) { await sleep("15s"); continue; }
    while (true) {
      const preparation = await prepareAssignment(claim.fence);
      if(!failures||preparation==="done")await recordWorkflowHealth(identity,"assignment",identity.assignmentId,workflowRunId);
      if (preparation === "done") return;
      if (preparation === "ready") break;
      await sleep("30s");
    }
    while(await dispatchAssignment(claim.fence)==="wait"){if(!failures)await recordWorkflowHealth(identity,"assignment",identity.assignmentId,workflowRunId);await sleep("30s");}
    let outcome;
    do{outcome=await observeAssignment(claim.fence);failures=0;await recordWorkflowHealth(identity,"assignment",identity.assignmentId,workflowRunId);if(outcome==="wait")await sleep("10s");}while(outcome==="wait");
    if(outcome==="resume")continue;
    await launchAssignmentCampaign(identity);
    return;
    } catch (error) {
      // A platform/database interruption must not orphan an owned assignment.
      // Re-enter through persisted fences; completed steps need no secret state.
      const delay=retryDelay(++failures);
      try{await recordWorkflowHealth(identity,"assignment",identity.assignmentId,workflowRunId,workflowFailure(error),delay);}catch{/* Database outages cannot release the dispatch fence. */}
      await sleep(`${delay}s`);
    }
  }
}
