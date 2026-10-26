import test from 'node:test';
import assert from 'node:assert/strict';
import {planStudioBudget} from '../src/studio/budget-plan';
const slots=[{id:'director',monthlyCapMicros:5000000,monthlyConsumedMicros:800000,spentMicros:800000,creditMicros:0},{id:'research',monthlyCapMicros:5000000,monthlyConsumedMicros:100000,spentMicros:200000,creditMicros:100000}];
test('one Studio allowance bounds spent money, monthly headroom and one-time headroom across employees',()=>{
  const plan=planStudioBudget({monthlyLimitMicros:2000000,mode:'automatic'},slots);
  assert.deepEqual(plan.allocations,{director:1250000,research:550000});assert.equal(plan.unallocatedMicros,0);
  assert.equal(plan.spentMicros+plan.creditMicros+plan.allocatedHeadroomMicros,2000000);
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:2000000,mode:'custom',allocations:{director:1000000,research:1000000}},slots),/exceed/);
  const custom=planStudioBudget({monthlyLimitMicros:2000000,mode:'custom',allocations:{director:1000000,research:100000}},slots);
  assert.equal(custom.unallocatedMicros,700000);
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:2000000,mode:'custom',allocations:{director:1000000,foreign:0}},slots),/every employee/);
});
test('lowering an allowance below past spending pauses future monthly calls without pretending to undo charges',()=>{
  const noCredit=slots.map(s=>({...s,creditMicros:0}));
  assert.deepEqual(planStudioBudget({monthlyLimitMicros:0,mode:'automatic'},noCredit).allocations,{director:0,research:0});
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:0,mode:'automatic'},slots),/one-time/);
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:500000,mode:'custom',allocations:{director:800000,research:0}},noCredit),/Recurring/,'caps below consumed money become spendable next month');
  for(const n of [-1,0.1,Number.NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>planStudioBudget({monthlyLimitMicros:n,mode:'automatic'},slots));
});
