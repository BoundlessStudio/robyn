import test from "node:test";
import assert from "node:assert/strict";
import {settlementEvidence} from "../scripts/settle-media.mjs";
test("operator settlement requires final provider evidence and excludes unrelated private fields",()=>{
  const receipt={chargeIsFinal:true,charged:{currency:'USD',amount:'0.420001'},caseReference:'provider-case-123',runId:'run_known',secret:'never-copy'};
  assert.equal(settlementEvidence(receipt).micros,420001);assert.equal('secret' in settlementEvidence(receipt).receipt,false);
  for(const change of [{chargeIsFinal:false},{caseReference:''},{charged:{currency:'EUR',amount:'0.42'}},{charged:{currency:'USD',amount:'0.0000001'}}])assert.throws(()=>settlementEvidence({...receipt,...change}));
  assert.equal(settlementEvidence({...receipt,charged:{currency:'USD',amount:'0'}}).micros,0,'zero is accepted only with an explicit final provider record');
});
