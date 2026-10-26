import test from "node:test";
import assert from "node:assert/strict";
import {retryDelay,workflowFailure,workflowNeedsAttention} from "../src/studio/workflow-health";
test("workflow diagnostics redact arbitrary failures, back off, and distinguish intentional budget waits from stalled work",()=>{
  assert.equal(workflowFailure({status:503,message:"credential or provider body",code:"private-value"}),"platform_unavailable");
  assert.equal(workflowFailure(new Error("private data")),"workflow_step_failed");
  assert.equal(retryDelay(1),15);assert.equal(retryDelay(6),480);assert.equal(retryDelay(100),900);
  const now=Date.now(),row={consecutive_failures:0,last_state:"running",last_progress_at:new Date(now-31*60000).toISOString()};
  assert.equal(workflowNeedsAttention(row,now),true);
  assert.equal(workflowNeedsAttention({...row,last_state:"waiting_budget"},now),false);
  assert.equal(workflowNeedsAttention({...row,fingerprint:{budgetPaused:true}},now),false);
  assert.equal(workflowNeedsAttention({...row,last_state:"completed"},now),false);
  assert.equal(workflowNeedsAttention({...row,last_state:"uncertain"},now),true);
});
