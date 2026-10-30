import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sharedBudgetFixture} from './helpers/shared-budget.mjs';

test('saving zero switches the helper off despite one-time credit and can be re-enabled',async()=>{
  const f=await sharedBudgetFixture({credit:50});
  try{
    const snapshot=await f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:0,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id});
    assert.equal(snapshot.summary.monthlyLimitMicros,0);assert.equal(snapshot.summary.availableMicros,0);
    assert.equal(f.state.credit,50);assert.deepEqual(f.state.capWrites,[0]);
    f.state.providerCalls.length=0;
    const capacity=await f.paidCapacity(f.db,f.employee);
    assert.equal(capacity.availableMicros,0);assert.equal(capacity.code,'ai_helper_disabled');
    assert.deepEqual(f.state.providerCalls,[],'disabled AI does not contact the provider');
    await f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:20_000_000,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id});
    assert.ok((await f.paidCapacity(f.db,f.employee)).availableMicros>0);
  }finally{f.close();}
});

test('out-of-range owner budgets are rejected before any provider or policy writes',async()=>{
  const f=await sharedBudgetFixture();
  try{
    for(const limit of [-1,100_000_001])await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:limit,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id}),error=>error.status===400&&error.code==='invalid_studio_budget');
    assert.deepEqual(f.state.capWrites,[]);assert.deepEqual(f.state.rpcCalls,[]);assert.deepEqual(f.state.providerCalls,[]);
  }finally{f.close();}
});

test('zero allowance can reconcile its existing provider receipt without enabling AI or replaying a write',async()=>{
  const f=await sharedBudgetFixture({limit:0,cap:0,spent:0,consumed:0,retired:0,credit:50});
  try{
    f.state.policy.cap_sync={employeeId:f.employee.id,instanceId:f.employee.instance_id,period:f.period,monthlyLimitMicros:0,observedCapMicros:100,targetCapMicros:0,leaseId:randomUUID()};
    const result=await f.paidCapacity(f.db,f.employee);
    assert.equal(result.availableMicros,0);assert.equal(result.code,'ai_helper_disabled');
    assert.equal(f.state.policy.cap_sync,null);assert.deepEqual(f.state.capWrites,[]);
  }finally{f.close();}
});

test('one budget includes deleted workstation spending and every unsettled media hold without retired provider reads',async()=>{
  const f=await sharedBudgetFixture();
  try{
    f.state.holds=[{id:randomUUID(),workspace_id:f.workspace,instance_id:'deleted-old',billing_settled:false,reserved_micros:45},{id:randomUUID(),workspace_id:f.workspace,instance_id:'shared-current',billing_settled:false,reserved_micros:30},{id:randomUUID(),workspace_id:f.workspace,billing_settled:true,reserved_micros:900}];
    const snapshot=await f.studioBudgets(f.db,f.workspace);
    assert.equal(snapshot.employees.length,1);assert.equal(snapshot.summary.spentMicros,100);assert.equal(snapshot.summary.reservedMicros,75);assert.equal(snapshot.summary.availableMicros,825);
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,825);
    assert.equal((await f.paidCapacity(f.db,f.employee,f.state.holds[0].id)).availableMicros,870);
    const before=f.state.providerCalls.length;
    assert.equal((await f.paidCapacity(f.db,f.state.employees[1])).availableMicros,0);
    assert.equal(f.state.providerCalls.length,before,'retired workers never reach the provider');
    const unprovisioned={...f.employee,instance_id:null};
    assert.equal(await f.initialWorkstationCap(f.db,unprovisioned),920);
  }finally{f.close();}
});

test('UTC rollover restores only a matching managed cap and respects an external reduction',async()=>{
  const f=await sharedBudgetFixture({cap:800,consumed:0,spent:0,retired:0});
  try{
    f.employee.budget_cap_period='2000-01';f.employee.budget_cap_micros=800;
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,1000);
    assert.deepEqual(f.state.capWrites,[1000]);assert.equal(f.employee.budget_cap_period,f.period);
    f.employee.budget_cap_period='2000-01';f.employee.budget_cap_micros=800;f.state.cap=700;
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,700);
    assert.deepEqual(f.state.capWrites,[1000],'an externally reduced cap is never restored automatically');
  }finally{f.close();}
});

test('an acknowledged target reconciles a lost rollover response while unknown source cap stays fenced',async()=>{
  const f=await sharedBudgetFixture({cap:800,consumed:0,spent:0,retired:0});
  try{
    f.employee.budget_cap_period='2000-01';f.employee.budget_cap_micros=800;f.state.loseAck=true;
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,0);
    assert.ok(f.state.policy.cap_sync);assert.equal(await f.budgetChangePending(f.db,f.workspace),true);
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:500,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id}),error=>error.code==='budget_update_in_progress');
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,1000);
    assert.deepEqual(f.state.capWrites,[1000]);assert.equal(f.state.policy.cap_sync,null);
    f.employee.budget_cap_period='2000-01';f.employee.budget_cap_micros=800;f.state.cap=800;f.state.failBeforeWrite=true;
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,0);
    const writes=f.state.capWrites.length;
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,0);
    assert.equal(f.state.capWrites.length,writes,'no timer or source-cap read authorizes a duplicate unknown PATCH');
    assert.ok(f.state.policy.cap_sync);
  }finally{f.close();}
});

test('a budget instance requires matching employee, provider metadata and the private agents mirror',async()=>{
  const f=await sharedBudgetFixture();
  try{
    f.state.mirrors[0].workspace_id=randomUUID();
    await assert.rejects(f.verifyBudgetInstance(f.db,f.employee),error=>error.code==='employee_instance_mismatch');
    assert.equal(f.state.providerCalls.length,0,'foreign mirror is rejected before any provider call');
    f.state.mirrors[0].workspace_id=f.workspace;
    f.employee.instance_id='rebound-instance';
    await assert.rejects(f.verifyBudgetInstance(f.db,{...f.employee,instance_id:'shared-current'}),error=>error.code==='employee_instance_mismatch');
  }finally{f.close();}
});

test('a known cap target can reconcile its original intent after UTC rollover without replay',async()=>{
  const f=await sharedBudgetFixture({cap:900,consumed:0,spent:0,retired:0});
  try{
    f.employee.budget_cap_period='2000-01';f.employee.budget_cap_micros=800;
    f.state.policy.cap_sync={employeeId:f.employee.id,instanceId:f.employee.instance_id,period:'2000-01',monthlyLimitMicros:1000,observedCapMicros:800,targetCapMicros:900,leaseId:randomUUID()};
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,900);
    assert.deepEqual(f.state.capWrites,[],'recovery observes the exact old target without writing it again');
    assert.equal(f.state.policy.cap_sync,null);assert.equal(f.employee.budget_cap_period,'2000-01');
    assert.equal((await f.paidCapacity(f.db,f.employee)).availableMicros,1000);
    assert.deepEqual(f.state.capWrites,[1000],'only a new current-period intent restores the owner ceiling');
  }finally{f.close();}
});

test('lowering a shared allowance below spent money leaves no inflated future cap',async()=>{
  const f=await sharedBudgetFixture({cap:920,consumed:600,spent:650});
  try{
    const snapshot=await f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:100,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id});
    assert.equal(f.state.cap,100);assert.equal(f.employee.budget_cap_micros,100);
    assert.equal(snapshot.summary.spentMicros,730);assert.equal(snapshot.summary.availableMicros,0);
    assert.deepEqual(f.state.policy.allocations,{[f.employee.id]:100});
  }finally{f.close();}
});

test('initial cap receipt recovery observes the exact created cap and never adopts an external reduction',async()=>{
  const f=await sharedBudgetFixture();
  try{
    f.employee.budget_cap_period=null;f.employee.budget_cap_micros=null;
    assert.equal(await f.confirmInitialWorkstationCap(f.db,f.employee),true);
    assert.equal(f.employee.budget_cap_micros,920);assert.equal(f.employee.budget_cap_period,f.period);
    assert.deepEqual(f.state.capWrites,[]);
    f.employee.budget_cap_period=null;f.employee.budget_cap_micros=null;f.state.cap=900;
    assert.equal(await f.confirmInitialWorkstationCap(f.db,f.employee),false);
    assert.equal(f.employee.budget_cap_period,null);assert.equal(f.employee.budget_cap_micros,null);
    assert.deepEqual(f.state.capWrites,[]);
  }finally{f.close();}
});
