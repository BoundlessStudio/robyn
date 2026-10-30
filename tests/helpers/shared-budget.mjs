import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule,httpMock} from './module.mjs';

export async function sharedBudgetFixture(options={}){
  const workspace=randomUUID(),owner=randomUUID(),period=new Date().toISOString().slice(0,7),employeeId=randomUUID();
  const employee={id:employeeId,workspace_id:workspace,employee_key:'robyn',retired_at:null,kind:'director',app_id:null,role:'Robyn',instance_id:'shared-current',monthly_cap_micros:options.limit??1000,budget_cap_period:period,budget_cap_micros:options.cap??920};
  const retired={...employee,id:randomUUID(),employee_key:'old-director',retired_at:new Date().toISOString(),instance_id:'deleted-old',monthly_cap_micros:0};
  const state={period,employee,employees:[employee,retired],mirrors:[{agent37_id:employee.instance_id,workspace_id:workspace}],
    archives:[{workspace_id:workspace,instance_id:retired.instance_id,period,usage:{period,total_micros:options.retired??80},deleted_at:new Date().toISOString()}],
    holds:[],cap:options.cap??920,consumed:options.consumed??20,spent:options.spent??20,credit:options.credit??0,providerCalls:[],rpcCalls:[],capWrites:[],loseAck:false,failBeforeWrite:false,
    policy:{workspace_id:workspace,monthly_limit_micros:options.limit??1000,allocation_mode:'automatic',allocations:{[employeeId]:options.limit??1000},sync_state:'synced',operation_id:randomUUID(),pending_request:{monthlyLimitMicros:options.limit??1000,mode:'automatic'},cap_sync:null}};
  const rows=table=>table==='studio_employees'?state.employees:table==='agents'?state.mirrors:table==='studio_retired_workstations'?state.archives:table==='studio_media_jobs'?state.holds:table==='studio_managed_budgets'?(state.policy?[state.policy]:[]):[];
  const db={from(table){const filters=[];let update;const execute=()=>{
    const selected=rows(table).filter(row=>filters.every(([op,key,value])=>op==='neq'?row[key]!==value:row[key]===value));
    if(update)selected.forEach(row=>Object.assign(row,update));
    return selected;
  };return {select(){return this;},update(value){update=value;return this;},eq(key,value){filters.push(['eq',key,value]);return this;},is(key,value){filters.push(['is',key,value]);return this;},neq(key,value){filters.push(['neq',key,value]);return this;},then(done){return Promise.resolve({data:execute(),error:null}).then(done);},async maybeSingle(){return {data:execute()[0]??null,error:null};},async single(){return this.maybeSingle();}};},async rpc(name,args){
    state.rpcCalls.push({name,args});
    if(name==='claim_studio_budget_change'){
      if(state.beforeOwnerClaim)state.beforeOwnerClaim();
      if(state.policy.cap_sync&&state.policy.cap_sync.ownerOperationId!==args.p_operation)return {error:{message:'cap sync in progress'}};
      if(state.policy.sync_state!=='synced'&&state.policy.operation_id!==args.p_operation)return {error:{message:'unresolved studio budget update'}};
      if(state.policy.operation_id===args.p_operation&&state.policy.sync_state==='synced')return {data:{claimed:false,saved:true},error:null};
      if(state.policy.operation_id!==args.p_operation&&args.p_expected_operation!==state.policy.operation_id)return {error:{message:'studio budget request stale'}};
      Object.assign(state.policy,{operation_id:args.p_operation,pending_request:args.p_request,sync_state:'applying',lease_id:args.p_lease});
      return {data:{claimed:true},error:null};
    }
    if(name==='stage_studio_budget_change'){
      if(state.policy.lease_id!==args.p_lease||state.policy.cap_sync&&!state.policy.cap_sync.confirmed)return {error:{message:'studio budget lease lost'}};
      Object.assign(state.policy,{monthly_limit_micros:args.p_limit,allocation_mode:args.p_mode,allocations:args.p_allocations});
    }
    else if(name==='finish_studio_budget_change'){
      if(state.policy.lease_id!==args.p_lease)return {error:{message:'studio budget lease lost'}};
      if(!args.p_error&&state.policy.cap_sync&&!state.policy.cap_sync.confirmed)return {error:{message:'unresolved provider write'}};
      state.policy.sync_state=args.p_error?'failed':'synced';
      if(!args.p_error){employee.monthly_cap_micros=state.policy.allocations[employee.id];state.policy.cap_sync=null;}
    }else if(name==='claim_studio_budget_provider_write'){
      if(state.policy.lease_id!==args.p_lease||state.policy.operation_id!==args.p_operation)return {error:{message:'studio budget lease lost'}};
      if(state.policy.cap_sync)return {data:{claimed:false,intent:state.policy.cap_sync},error:null};
      state.policy.cap_sync={ownerOperationId:args.p_operation,employeeId:args.p_employee,instanceId:args.p_instance,period:args.p_period,monthlyLimitMicros:state.policy.pending_request.monthlyLimitMicros,observedCapMicros:args.p_observed_cap,targetCapMicros:args.p_target_cap,leaseId:args.p_lease,confirmed:false};
      return {data:{claimed:true,intent:state.policy.cap_sync},error:null};
    }else if(name==='finish_studio_budget_provider_write'){
      if(state.policy.lease_id!==args.p_lease||state.policy.cap_sync?.leaseId!==args.p_write_lease)return {error:{message:'studio budget provider lease lost'}};
      if(args.p_error)state.policy.cap_sync.error=args.p_error;
      else{
        state.policy.cap_sync.confirmed=true;employee.budget_cap_period=args.p_period;employee.budget_cap_micros=args.p_target_cap;
        if(state.loseProviderFinishAck){state.loseProviderFinishAck=false;return {error:{message:'provider receipt acknowledgement lost'}};}
      }
    }else if(name==='claim_studio_budget_cap_sync'){
      if(state.policy.sync_state!=='synced'||args.p_limit!==state.policy.monthly_limit_micros)return {error:{message:'studio budget update in progress'}};
      if(state.policy.cap_sync)return {data:{claimed:false,intent:state.policy.cap_sync},error:null};
      state.policy.cap_sync={employeeId:args.p_employee,instanceId:args.p_instance,period:args.p_period,monthlyLimitMicros:args.p_limit,observedCapMicros:args.p_observed_cap,targetCapMicros:args.p_target_cap,leaseId:args.p_lease};
      return {data:{claimed:true,intent:state.policy.cap_sync},error:null};
    }else if(name==='finish_studio_budget_cap_sync'){
      assert.equal(args.p_lease,state.policy.cap_sync.leaseId);
      if(args.p_error)state.policy.cap_sync.error=args.p_error;
      else{employee.budget_cap_period=args.p_period;employee.budget_cap_micros=args.p_target_cap;state.policy.cap_sync=null;}
    }else if(!['stage_studio_budget_change','finish_studio_budget_change'].includes(name))throw Error(`Unexpected budget RPC ${name}`);
    return {data:true,error:null};
  }};
  const getBudget=async id=>{assert.equal(id,employee.instance_id,'never read a deleted workstation');state.providerCalls.push({name:'getBudget',id});return {monthly_period:period,monthly_cap_micros:state.cap,monthly_remaining_micros:Math.max(0,state.cap-state.consumed),monthly_consumed_micros:state.consumed,credit_remaining_micros:state.credit};};
  const provider={getAgent:async id=>{assert.equal(id,employee.instance_id,'never read a deleted workstation');state.providerCalls.push({name:'getAgent',id});return {id,metadata:{app_workspace:workspace,studio_employee:employee.id}};},getBudget,getUsage:async id=>{assert.equal(id,employee.instance_id);return {period,total_micros:state.spent};},getBilling:async()=>({balance_usd:1}),setBudget:async(id,{monthly_cap_micros})=>{
    assert.equal(id,employee.instance_id);state.capWrites.push(monthly_cap_micros);
    if(state.delayWrite){const delayed=state.delayWrite;state.delayWrite=null;delayed.entered();await delayed.release;}
    if(state.failBeforeWrite)throw Error('Unknown budget write result');
    state.cap=monthly_cap_micros;
    if(state.loseAck){state.loseAck=false;throw Error('Lost budget acknowledgement');}
    return getBudget(id);
  }};
  const key='__sharedBudget'+randomUUID().replaceAll('-','');globalThis[key]=provider;
  const mocks={'server-only':'','@/lib/http':httpMock,'@/lib/agent37':`export const agent37=globalThis.${key};`,'./server':`export const dbFailure=e=>{if(e)throw Error(e.message)};export const id=v=>v;`};
  const [budgets,paid,employees]=await Promise.all([loadModule('../../src/studio/studio-budgets.ts',mocks),loadModule('../../src/studio/paid-capacity.ts',mocks),loadModule('../../src/studio/employee-budgets.ts',mocks)]);
  return {workspace,owner,period,employee,state,db,...budgets,...paid,...employees,close:()=>{delete globalThis[key];}};
}
