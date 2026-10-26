import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule,httpMock} from './helpers/module.mjs';

test('a lost budget-increase response recovers the same change without allocating twice',async()=>{
  const workspace=randomUUID(),owner=randomUUID(),operation=randomUUID(),ids=[randomUUID(),randomUUID()];
  const employees=ids.map((id,i)=>({id,workspace_id:workspace,kind:i?'specialist':'director',app_id:i?'research':null,role:'Employee',instance_id:'instance-'+i,monthly_cap_micros:5000000}));
  const caps=new Map(employees.map(e=>[e.instance_id,5000000])),calls=[];let loseAck=true,policy=null;
  const db={from(table){const filters=[];const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},then(resolve){return Promise.resolve({data:table==='studio_employees'?employees.filter(e=>filters.every(([k,v])=>e[k]===v)):[],error:null}).then(resolve);},async maybeSingle(){return{data:table==='studio_managed_budgets'?policy:employees.find(e=>filters.every(([k,v])=>e[k]===v)),error:null};}};return query;},async rpc(name,args){
    assert.equal(args.p_operation,operation);
    if(name==='claim_studio_budget_change'){
      if(policy?.sync_state==='synced')return{data:{claimed:false,saved:true},error:null};
      if(policy)assert.deepEqual(policy.pending_request,args.p_request);
      policy={monthly_limit_micros:10000000,allocation_mode:'custom',sync_state:'applying',operation_id:operation,pending_request:args.p_request};return{data:{claimed:true},error:null};
    }
    if(name==='stage_studio_budget_change')employees.forEach(e=>{e.monthly_cap_micros=args.p_allocations[e.id];});
    if(name==='finish_studio_budget_change')policy.sync_state=args.p_error?'failed':'synced';
    return{data:true,error:null};
  }};
  const period=new Date().toISOString().slice(0,7);
  globalThis.budgetRecovery={getAgent:async id=>({id,metadata:{app_workspace:workspace,studio_employee:employees.find(e=>e.instance_id===id).id}}),getBudget:async id=>({monthly_period:period,monthly_cap_micros:caps.get(id),monthly_remaining_micros:caps.get(id),monthly_consumed_micros:0,credit_remaining_micros:0}),getUsage:async()=>({period,total_micros:0}),setBudget:async(id,body)=>{calls.push({id,...body});caps.set(id,body.monthly_cap_micros);if(loseAck&&id===employees[1].instance_id){loseAck=false;throw Error('acknowledgement lost after provider saved the cap');}}};
  try{
    const {updateStudioBudget,budgetChangePending}=await loadModule('../../src/studio/studio-budgets.ts',{'server-only':'','@/lib/http':httpMock,'@/lib/agent37':`export const agent37=globalThis.budgetRecovery;`,'./server':`export const dbFailure=e=>{if(e)throw Error()};export const id=v=>v;`});
    const request={operationId:operation,monthlyLimitMicros:10000000,mode:'custom',allocations:{[ids[0]]:3000000,[ids[1]]:7000000}};
    await assert.rejects(updateStudioBudget(db,workspace,owner,request),e=>e.code==='budget_sync_incomplete');assert.equal(await budgetChangePending(db,workspace),true);
    assert.deepEqual(calls.map(call=>call.monthly_cap_micros),[3000000,7000000],'reduction happens before increase');
    await updateStudioBudget(db,workspace,owner,request);assert.equal(await budgetChangePending(db,workspace),false);assert.equal(calls.length,2,'read-back of the applied caps prevents a second increase');
    await updateStudioBudget(db,workspace,owner,request);assert.equal(calls.length,2);assert.equal([...caps.values()].reduce((a,b)=>a+b),10000000);
  }finally{delete globalThis.budgetRecovery;}
});
