import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule,httpMock} from './helpers/module.mjs';

async function mediaBoundary(surface,run){
  const identity={workspaceId:'studio',projectId:'project',userId:'owner'};
  const employee={id:'robyn',workspace_id:'studio',instance_id:'persistent',kind:'director',employee_key:'robyn',app_id:null,retired_at:null};
  const instance={id:'persistent',status:'running',metadata:{app_workspace:'studio',studio_employee:'robyn'}};
  const mirror={agent37_id:'persistent',workspace_id:'studio',template:'robyn-studio@1'};
  const job={id:'media-one',workspace_id:'studio',project_id:'project',created_by:'owner',workflow_id:'workflow-one',assignment_id:null,employee_id:'robyn',budget_employee_id:'robyn',instance_id:'persistent',operation:'generate',provider:'perflo',kind:'image',state:surface==='active'?'running':surface==='settle'?'failed':'completed',billing_settled:surface==='cleanup',actual_micros:null,reserved_micros:5000,provider_job_id:'provider-job',revision_id:surface==='cleanup'?'revision-one':null,request:{inputs:[]}};
  const state={identity,employee,instance,mirror,job,retired:null,providerMissing:false,calls:[],updates:[],queries:[],rpc:[],observation:surface==='active'?{phase:'processing'}:surface==='settle'?{phase:'settled',actualMicros:1000,receipt:{id:'receipt'}}:{phase:'cleaned'}};
  const db={from(table){
    const query={table,filters:[]};state.queries.push(query);
    return {select(){return this;},eq(key,value){query.filters.push([key,value]);return this;},is(){return this;},not(){return this;},
      update(value){state.updates.push(value);return this;},
      async maybeSingle(){return {data:table==='workspaces'?{id:'studio'}:table==='studio_projects'?{status:'active'}:table==='studio_employees'?state.employee:table==='agents'?state.mirror:table==='studio_retired_workstations'?state.retired:null,error:null};},
      then(resolve){return Promise.resolve({data:null,error:null}).then(resolve);},
    };
  },async rpc(name,args){state.rpc.push({name,args});assert.ok(['claim_media_job','settle_media_charge'].includes(name));return {data:true,error:null};}};
  state.db=db;globalThis.__mediaWorkstationBoundary=state;
  try{
    const {processMediaJob}=await loadModule('../../src/workflows/media/steps.ts',{
      'server-only':'','@/lib/http':httpMock,
      '@/lib/supabase/admin':"export const createAdminClient=()=>globalThis.__mediaWorkstationBoundary.db;",
      '@/lib/agent37':`export const agent37={getAgent:async id=>{const s=globalThis.__mediaWorkstationBoundary;s.calls.push({method:'get',id});if(s.providerMissing)throw Error('Missing preserved workstation');return s.instance;},start:async id=>{globalThis.__mediaWorkstationBoundary.calls.push({method:'start',id});},exec:async id=>{const s=globalThis.__mediaWorkstationBoundary;s.calls.push({method:'exec',id});return {exit_code:0,stdout:JSON.stringify(s.observation)};}};`,
      '@/studio/workstation':"export const ensureEmployeeInstance=()=>{throw Error('Unexpected workstation creation or rebind');};",
      '@/studio/media-providers':"export const acquireStock=()=>{throw Error('Unexpected media acquisition');};",
      '@/studio/media-server':`export const mediaDbFailure=e=>{if(e)throw Error(e.message);};export const ownedMediaJob=async(_db,identity,id)=>{const s=globalThis.__mediaWorkstationBoundary;if(identity.workspaceId!=='studio'||identity.projectId!=='project'||identity.userId!=='owner'||id!==s.job.id)throw Error('Unexpected media ownership');return s.job;};`,
      '@/studio/paid-capacity':"export const paidCapacity=()=>{throw Error('Unexpected budget allocation');};",
      '@/studio/employee-budgets':"export const managedHeadroom=()=>{throw Error('Unexpected budget mutation');};export const verifyBudgetInstance=()=>{throw Error('Unexpected budget mutation');};",
      '@/studio/package-store':"export const preparePackageTransfers=()=>{throw Error('Unexpected transfer');};export const readSavedPackage=()=>{throw Error('Unexpected saved package read');};",
      '@/studio/server':"export const dbFailure=e=>{if(e)throw Error(e.message);};export const revisionFiles=()=>{throw Error('Unexpected files');};export const verifyStoredFiles=()=>{throw Error('Unexpected publication');};export const ownedAsset=()=>{throw Error('Unexpected asset');};",
    });
    await run({state,process:()=>processMediaJob(identity,job.id,'workflow-one')});
  }finally{delete globalThis.__mediaWorkstationBoundary;}
}

test('active media, settlement and cleanup all require the bound employee and owned mirror',async()=>{
  for(const surface of ['active','settle','cleanup'])await mediaBoundary(surface,async({state,process})=>{
    await process();assert.deepEqual(state.calls.map(call=>call.method),['get','exec']);
    const binding=state.queries.find(query=>query.table==='studio_employees'),mirror=state.queries.find(query=>query.table==='agents');
    assert.deepEqual(binding.filters,[['workspace_id','studio'],['instance_id','persistent']]);assert.deepEqual(mirror.filters,[['workspace_id','studio'],['agent37_id','persistent']]);
  });
});

test('another same-workspace instance or altered ownership never receives media start or exec',async()=>{
  for(const surface of ['active','settle','cleanup'])for(const tamper of [
    state=>state.employee=null,
    state=>state.employee.id='other-employee',
    state=>state.employee.instance_id='other-instance',
    state=>state.instance.id='other-instance',
    state=>state.instance.metadata.app_workspace='other-workspace',
    state=>state.instance.metadata.studio_employee='other-employee',
    state=>state.mirror.workspace_id='other-workspace',
    state=>state.mirror.agent37_id='other-instance',
  ])await mediaBoundary(surface,async({state,process})=>{
    tamper(state);state.instance.status='sleeping';await process().catch(()=>{});
    assert.equal(state.calls.some(call=>['start','exec'].includes(call.method)),false);
    assert.equal(state.rpc.some(call=>call.name==='settle_media_charge'),false);
    assert.equal(state.updates.some(value=>value.billing_settled===true||value.actual_micros===0),false,'an ownership failure cannot release an unknown paid hold');
  });
});

test('confirmed deletion skips only completed settled housekeeping without contacting the old workstation',async()=>{
  await mediaBoundary('cleanup',async({state,process})=>{
    state.retired={deleted_at:'2026-10-30T00:00:00Z'};state.providerMissing=true;
    assert.equal(await process(),'done');assert.deepEqual(state.calls,[]);assert.deepEqual(state.rpc,[]);
    const retired=state.queries.find(query=>query.table==='studio_retired_workstations');assert.deepEqual(retired.filters,[['workspace_id','studio'],['instance_id','persistent']]);
  });
});

test('a retirement receipt never bypasses unsettled reconciliation or releases its reservation',async()=>{
  await mediaBoundary('settle',async({state,process})=>{
    state.retired={deleted_at:'2026-10-30T00:00:00Z'};state.providerMissing=true;
    await assert.rejects(process(),/Missing preserved workstation/);
    assert.deepEqual(state.calls,[{method:'get',id:'persistent'}]);assert.equal(state.queries.some(query=>query.table==='studio_retired_workstations'),false);
    assert.equal(state.job.billing_settled,false);assert.equal(state.job.reserved_micros,5000);assert.deepEqual(state.updates,[]);
  });
});

test('retired legacy paid jobs can reconcile through their exact preserved employee binding',async()=>{
  await mediaBoundary('settle',async({state,process})=>{
    state.employee={...state.employee,id:'old-research',employee_key:'research',kind:'specialist',app_id:'research',retired_at:'2026-10-30T00:00:00Z'};
    state.job.employee_id='old-research';state.job.budget_employee_id=null;state.instance.metadata.studio_employee='old-research';
    assert.equal(await process(),'done');assert.deepEqual(state.calls.map(call=>call.method),['get','exec']);
    assert.equal(state.rpc.filter(call=>call.name==='settle_media_charge').length,1);
  });
});
