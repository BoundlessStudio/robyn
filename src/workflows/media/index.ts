import {recordWorkflowHealth} from "../health";
import {retryDelay,workflowFailure} from "@/studio/workflow-health";
import { getWorkflowMetadata, sleep } from "workflow";
import type { MediaIdentity } from "@/studio/media";
import { processMediaJob } from "./steps";

export async function mediaWorkflow(identity: MediaIdentity, jobId: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  let failures=0;
  while (true) {
    try { const done=await processMediaJob(identity, jobId, workflowRunId)==="done";await recordWorkflowHealth(identity,"media",jobId,workflowRunId);failures=0;if(done)return; }
    catch(error){const delay=retryDelay(++failures);try{await recordWorkflowHealth(identity,"media",jobId,workflowRunId,workflowFailure(error),delay);}catch{}await sleep(`${delay}s`);continue;}
    await sleep("15s");
  }
}
