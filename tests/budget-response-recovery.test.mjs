import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sharedBudgetFixture} from './helpers/shared-budget.mjs';

test('a lost shared-workstation budget increase is recovered without replay or forgetting retired spend',async()=>{
  const f=await sharedBudgetFixture({limit:100,cap:100});
  try{
    const operation=randomUUID(),request={operationId:operation,monthlyLimitMicros:1000,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id};f.state.loseAck=true;
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,request),error=>error.code==='budget_sync_incomplete');
    assert.equal(await f.budgetChangePending(f.db,f.workspace),true);
    assert.deepEqual(f.state.capWrites,[920]);assert.equal(f.state.policy.sync_state,'failed');
    await f.updateStudioBudget(f.db,f.workspace,f.owner,request);
    assert.equal(await f.budgetChangePending(f.db,f.workspace),false);
    assert.deepEqual(f.state.capWrites,[920],'known read-back prevents another provider write');
    assert.deepEqual(f.state.policy.allocations,{[f.employee.id]:1000});
    assert.equal(f.employee.budget_cap_micros,920);assert.equal(f.employee.budget_cap_period,f.period);
    const snapshot=await f.updateStudioBudget(f.db,f.workspace,f.owner,request);
    assert.equal(snapshot.summary.spentMicros,100);assert.equal(snapshot.summary.retiredSpentMicros,80);
    assert.equal(snapshot.employees.length,1);assert.deepEqual(f.state.capWrites,[920]);
  }finally{f.close();}
});

test('unresolved historical allowance changes cannot be retargeted while settled old receipts are read-only',async()=>{
  const f=await sharedBudgetFixture();
  try{
    const oldOperation=f.state.policy.operation_id,legacy={monthlyLimitMicros:1000,mode:'custom',allocations:{retired:1000}};
    Object.assign(f.state.policy,{pending_request:legacy,sync_state:'failed'});
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:randomUUID(),monthlyLimitMicros:500,mode:'automatic'}),error=>error.code==='budget_update_in_progress');
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:oldOperation,monthlyLimitMicros:500,mode:'automatic'}),error=>error.code==='budget_request_changed');
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:oldOperation,...legacy}),error=>error.code==='invalid_studio_budget');
    assert.equal(f.state.policy.sync_state,'failed');assert.equal(f.state.rpcCalls.length,0);assert.equal(f.state.capWrites.length,0);
    f.state.policy.sync_state='synced';
    const snapshot=await f.updateStudioBudget(f.db,f.workspace,f.owner,{operationId:oldOperation,...legacy});
    assert.equal(snapshot.employees[0].name,'Robyn');assert.equal(f.state.rpcCalls.length,0);assert.equal(f.state.capWrites.length,0);
  }finally{f.close();}
});

test('new allowance requests reject stale or missing policy expectations before retargeting saved work',async()=>{
  const f=await sharedBudgetFixture();
  try{
    const draft={operationId:randomUUID(),monthlyLimitMicros:800,mode:'automatic'};
    for(const expected of [undefined,null,randomUUID(),'invalid']){
      await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{...draft,...(expected!==undefined?{expectedPolicyOperationId:expected}:{})}),error=>error.code==='budget_request_stale');
    }
    assert.equal(f.state.rpcCalls.length,0);assert.deepEqual(f.state.capWrites,[]);
    const current=f.state.policy.operation_id;
    f.state.beforeOwnerClaim=()=>{f.state.policy.operation_id=randomUUID();};
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,{...draft,expectedPolicyOperationId:current}),error=>error.code==='budget_request_stale');
    assert.deepEqual(f.state.capWrites,[],'a raced owner change is rejected atomically before provider writes');
  }finally{f.close();}
});

test('a delayed first owner PATCH fences retries and later lower limits until its target is observed',async()=>{
  const f=await sharedBudgetFixture({limit:100,cap:100});
  try{
    let entered,release;
    const dispatched=new Promise(done=>{entered=done;}),settled=new Promise(done=>{release=done;});
    f.state.delayWrite={entered,release:settled};
    const request={operationId:randomUUID(),monthlyLimitMicros:1000,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id};
    const original=f.updateStudioBudget(f.db,f.workspace,f.owner,request);original.catch(()=>{});
    await dispatched;
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,request),error=>error.code==='budget_sync_incomplete');
    assert.deepEqual(f.state.capWrites,[920],'an expired/reclaimed owner lease cannot repeat the unknown PATCH');
    const lower={operationId:randomUUID(),monthlyLimitMicros:500,mode:'automatic',expectedPolicyOperationId:request.operationId};
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,lower),error=>error.code==='budget_update_in_progress');
    assert.equal(f.state.cap,100,'the first write remains genuinely in flight');
    release();await assert.rejects(original,error=>error.code==='budget_sync_incomplete');
    assert.equal(f.state.cap,920);assert.ok(f.state.policy.cap_sync);
    await f.updateStudioBudget(f.db,f.workspace,f.owner,request);
    assert.equal(f.state.policy.cap_sync,null);assert.deepEqual(f.state.capWrites,[920]);
    await f.updateStudioBudget(f.db,f.workspace,f.owner,lower);
    assert.deepEqual(f.state.capWrites,[920,420]);assert.equal(f.state.cap,420);
    assert.equal(f.state.policy.monthly_limit_micros,500,'the later lower policy has no older write left to overtake it');
  }finally{f.close();}
});

test('a lost confirmed provider-write receipt cannot create a second target for the same owner operation',async()=>{
  const f=await sharedBudgetFixture({limit:100,cap:100});
  try{
    f.state.loseProviderFinishAck=true;
    const request={operationId:randomUUID(),monthlyLimitMicros:1000,mode:'automatic',expectedPolicyOperationId:f.state.policy.operation_id};
    await assert.rejects(f.updateStudioBudget(f.db,f.workspace,f.owner,request),error=>error.code==='budget_sync_incomplete');
    assert.equal(f.state.policy.cap_sync.confirmed,true);assert.deepEqual(f.state.capWrites,[920]);
    await f.updateStudioBudget(f.db,f.workspace,f.owner,request);
    assert.deepEqual(f.state.capWrites,[920]);assert.equal(f.state.policy.cap_sync,null);
  }finally{f.close();}
});
