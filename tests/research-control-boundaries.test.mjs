import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule,httpMock} from './helpers/module.mjs';

async function browserBoundary(run){
  const employee={id:'robyn',employee_key:'robyn',workspace_id:'studio',kind:'director',app_id:null,retired_at:null,instance_id:'persistent',provision_state:'ready',browser_control:'agent'};
  const instance={id:'persistent',metadata:{app_workspace:'studio',studio_employee:'robyn'}};
  const mirror={agent37_id:'persistent',workspace_id:'studio',template:'robyn-studio@1'};
  const job={id:'job-one',workspace_id:'studio',employee_id:'robyn',dispatch_state:'uncertain',session_id:'session-one',response_id:null,workstation_profile:'robyn-job-one',workflow_id:'workflow-one',run_attempt:'attempt-one'};
  const state={employee,instance,mirror,job,controls:[],records:[],cancelled:[],sessionCalls:[],session:{id:'session-one',profile:'robyn-job-one',active_response_id:'response-one',history:[]}};
  const db={from(table){return {select(){return this;},eq(){return this;},is(){return this;},in(){return this;},order(){return this;},limit(){return this;},
    async maybeSingle(){return {data:table==='agents'?state.mirror:state.employee,error:null};},
    then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);},
  };},async rpc(name,args){
    assert.equal(name,'control_studio_research');assert.equal(args.p_workspace,'studio');assert.equal(args.p_employee,'robyn');
    state.controls.push(args.p_action);
    return {data:{...employee,browser_control:args.p_action==='confirm'?'human':args.p_action==='return'?'agent':'requesting',browser_assignment_id:job.id},error:null};
  }};
  state.db=db;globalThis.__robynBrowserBoundary=state;
  try{
    const module=await loadModule('../../src/studio/research-browser.ts',{
      'server-only':'','@/lib/http':httpMock,
      './server':`export const requireStudio=async()=>({db:globalThis.__robynBrowserBoundary.db,workspaceId:'studio',user:{id:'owner'}});export const ownedProject=async(_db,w,p)=>{if(w!=='studio'||p!=='project')throw Error('Unexpected project scope');};export const id=v=>v;export const dbFailure=e=>{if(e)throw Error(e.message);};`,
      './assignment-server':`export const ownedAssignment=async(_db,w,a)=>{const s=globalThis.__robynBrowserBoundary;if(w!=='studio'||a!==s.job.id)throw Error('Unexpected assignment scope');return s.job;};export const assignmentFenceArgs=f=>f;export const assignmentRpc=async(_db,name,args)=>{globalThis.__robynBrowserBoundary.records.push({name,args});return true;};`,
      './assignment-launch':"export const launchAssignment=()=>{throw Error('Unexpected workflow launch');};",
      '@/lib/agent37':`export const agent37={getAgent:async()=>globalThis.__robynBrowserBoundary.instance,assignmentSession:async(...args)=>{const s=globalThis.__robynBrowserBoundary;s.sessionCalls.push(args);return s.session;},cancelResponse:async(_id,response)=>{globalThis.__robynBrowserBoundary.cancelled.push(response);}};`,
    });
    await run({...module,state,owner:{db,workspaceId:'studio',user:{id:'owner'},employee,instance}});
  }finally{delete globalThis.__robynBrowserBoundary;}
}

test('browser ownership requires canonical workstation metadata and its owned mirror',async()=>{
  await browserBoundary(async({researchBrowserOwner,state})=>{
    assert.equal((await researchBrowserOwner('project')).instance,state.instance);
    state.mirror.workspace_id='other';await assert.rejects(researchBrowserOwner('project'),/workstation_mirror_mismatch/);
    state.mirror.workspace_id='studio';state.instance.metadata.studio_employee='other';await assert.rejects(researchBrowserOwner('project'),/workstation_ownership_mismatch/);
    assert.deepEqual(state.cancelled,[]);assert.deepEqual(state.controls,[]);
  });
});

test('browser takeover records and cancels only the active response of the exact task profile',async()=>{
  for(const echoProfile of ['robyn-job-one',undefined])await browserBoundary(async({changeResearchControl,state,owner})=>{
    if(echoProfile===undefined)delete state.session.profile;
    const result=await changeResearchControl(owner,'control-one','take');assert.equal(result.browser_control,'requesting');
    assert.deepEqual(state.sessionCalls,[['persistent','session-one','robyn-job-one']]);
    assert.deepEqual(state.cancelled,['response-one']);assert.deepEqual(state.controls,['request']);
    assert.equal(state.records.length,1);assert.equal(state.records[0].name,'record_studio_assignment_response');
    assert.equal(state.records[0].args.p_session,'session-one');assert.equal(state.records[0].args.p_response,'response-one');
  });
});

test('a mismatching session, profile or known response cannot be adopted, cancelled or confirmed',async()=>{
  for(const tamper of [
    state=>state.session.id='session-other',
    state=>state.session.profile='robyn-job-other',
    state=>state.session.profile=null,
    state=>{state.job.response_id='response-known';state.session.active_response_id='response-other';},
    state=>{state.job.response_id='response-known';state.session.active_response_id=null;state.session.profile='robyn-job-other';},
  ])await browserBoundary(async({changeResearchControl,state,owner})=>{
    tamper(state);await changeResearchControl(owner,'control-one','take').catch(()=>{});
    assert.deepEqual(state.cancelled,[]);assert.deepEqual(state.records,[]);assert.deepEqual(state.controls,['request']);
  });
});

test('an idle exact session confirms takeover only when the original response or transcript is known',async()=>{
  await browserBoundary(async({changeResearchControl,state,owner})=>{
    state.session.active_response_id=null;
    await changeResearchControl(owner,'control-one','take');assert.deepEqual(state.controls,['request']);
    state.job.response_id='response-known';
    const result=await changeResearchControl(owner,'control-one','take');assert.equal(result.browser_control,'human');assert.deepEqual(state.controls,['request','request','confirm']);
    assert.deepEqual(state.cancelled,[]);
  });
});
