import test from 'node:test';
import assert from 'node:assert/strict';
import {planStudioBudget,planSharedStudioBudget,retiredBudgetSpend} from '../src/studio/budget-plan';
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

test('one recurring allowance deducts retired spending and current credit from the actual provider cap',()=>{
  const slot={id:'robyn',monthlyCapMicros:1000,monthlyConsumedMicros:150,spentMicros:200,creditMicros:50};
  const plan=planSharedStudioBudget({monthlyLimitMicros:1000,mode:'automatic'},slot,300);
  assert.deepEqual(plan.allocations,{robyn:1000});
  assert.equal(plan.providerCapMicros,600);
  assert.equal(300+200+50+Math.max(0,plan.providerCapMicros-150),1000);
  assert.equal(plan.spentMicros,500);
  assert.equal(plan.allocatedHeadroomMicros,450);
  const exhausted=planSharedStudioBudget({monthlyLimitMicros:100,mode:'automatic'},{...slot,creditMicros:0},300);
  assert.equal(exhausted.providerCapMicros,100,'an exhausted cap never creates a larger recurring ceiling next month');
  assert.equal(exhausted.allocatedHeadroomMicros,0);
  assert.deepEqual(exhausted.allocations,{robyn:100});
  assert.throws(()=>planSharedStudioBudget({monthlyLimitMicros:500,mode:'automatic'},slot,300),/one-time/);
  assert.throws(()=>planSharedStudioBudget({monthlyLimitMicros:1000,mode:'custom',allocations:{robyn:1000}},slot),/one monthly/);
  assert.throws(()=>planSharedStudioBudget({monthlyLimitMicros:1000,mode:'automatic',allocations:{retired:1}},slot),/one monthly/);
});

test('retired spending comes only from exact, distinct current-period immutable snapshots',()=>{
  const rows=[{instance_id:'deleted-a',period:'2026-10',usage:{period:'2026-10',total_micros:30}},{instance_id:'deleted-b',period:'2026-10',usage:{period:'2026-10',total_micros:70}},{instance_id:'old-month',period:'2026-09',usage:{period:'2026-09',total_micros:500}}];
  assert.equal(retiredBudgetSpend(rows,'2026-10','new-robyn'),100);
  assert.throws(()=>retiredBudgetSpend([...rows,rows[0]],'2026-10'),/verified/);
  assert.throws(()=>retiredBudgetSpend(rows,'2026-10','deleted-a'),/verified/);
  assert.throws(()=>retiredBudgetSpend([{...rows[0],usage:{period:'2026-09',total_micros:30}}],'2026-10'),/verified/);
  for(const total_micros of [null,undefined,-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>retiredBudgetSpend([{...rows[0],usage:{period:'2026-10',total_micros}}],'2026-10'));
});
test('lowering an allowance below past spending pauses future monthly calls without pretending to undo charges',()=>{
  const noCredit=slots.map(s=>({...s,creditMicros:0}));
  assert.deepEqual(planStudioBudget({monthlyLimitMicros:0,mode:'automatic'},noCredit).allocations,{director:0,research:0});
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:0,mode:'automatic'},slots),/one-time/);
  assert.throws(()=>planStudioBudget({monthlyLimitMicros:500000,mode:'custom',allocations:{director:800000,research:0}},noCredit),/Recurring/,'caps below consumed money become spendable next month');
  for(const n of [-1,0.1,Number.NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>planStudioBudget({monthlyLimitMicros:n,mode:'automatic'},slots));
});
