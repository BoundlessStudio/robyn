import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule,httpMock} from './helpers/module.mjs';

async function assignmentBoundary(run){
  const fence={workspaceId:'studio',userId:'owner',assignmentId:'job-one',workflowId:'workflow-one',attemptId:'attempt-one'};
  const assignment={id:'job-one',workspace_id:'studio',project_id:'project',employee_id:'robyn',workflow_id:'workflow-one',run_attempt:'attempt-one',state:'running',dispatch_state:'uncertain',session_id:'session-one',response_id:null,workstation_profile:'robyn-job-one',execution_model:'robyn',brief:'Use the saved work.',purpose:'independent',start_mode:'draft'};
  const state={assignment,fence,calls:[],dispatchClaimed:false,session:{id:'session-one',active_response_id:'response-one',profile:'robyn-job-one',history:[]},streamProfile:'robyn-job-one'};
  const db={from(){throw Error('Unexpected direct state mutation');}};
  state.context={db,assignment,employee:{id:'robyn',instance_id:'persistent',role:'Robyn',instructions:'Use the tools yourself.'},project:{status:'active'}};
  globalThis.__assignmentProfileBoundary=state;
  try{
    const module=await loadModule('../../src/workflows/assignment/steps.ts',{
      'server-only':'','@/lib/http':httpMock,
      '@/studio/assignment-server':`export const readAssignmentContext=async()=>globalThis.__assignmentProfileBoundary.context;export const ownsAssignmentFence=(a,f)=>a.workflow_id===f.workflowId&&a.run_attempt===f.attemptId;export const assignmentFenceArgs=f=>({p_workspace:f.workspaceId,p_user:f.userId,p_assignment:f.assignmentId,p_workflow:f.workflowId,p_attempt:f.attemptId});export const assignmentRpcArgs=f=>({p_workspace:f.workspaceId,p_user:f.userId,p_assignment:f.assignmentId});export const assignmentRpc=async(_db,name,args)=>{const s=globalThis.__assignmentProfileBoundary;s.calls.push({name,args});if(name==='claim_studio_assignment_dispatch'){if(s.dispatchClaimed)return false;s.dispatchClaimed=true;}return true;};`,
      '@/studio/workstation':"export class WorkstationConfigurationError extends Error{};export const ensureEmployeeInstance=()=>{throw Error('Unexpected workstation operation');};export const prepareEmployeeAssignment=()=>{throw Error('Unexpected workstation preparation');};",
      '@/studio/campaign-launch':"export const launchCampaign=()=>{throw Error('Unexpected campaign');};",
      '@/studio/server':"export const dbFailure=e=>{if(e)throw Error(e.message);};",
      '@/studio/paid-capacity':"export const paidCapacity=async()=>({availableMicros:5000000});",
      '@/lib/agent37':`export const agent37={assignmentSession:async(...args)=>{const s=globalThis.__assignmentProfileBoundary;s.calls.push({name:'session',args});return s.session;},cancelResponse:async(...args)=>{globalThis.__assignmentProfileBoundary.calls.push({name:'cancel',args});},assignmentResponseStream:async(...args)=>{const s=globalThis.__assignmentProfileBoundary;s.calls.push({name:'stream',args});return new Response('event: response.created\\ndata: '+JSON.stringify({id:'response-one',session_id:'session-one',profile:s.streamProfile})+'\\n\\nevent: response.completed\\ndata: {"output_text":"Saved work is ready."}\\n\\n');},submitAssignmentTurn:async(...args)=>{const s=globalThis.__assignmentProfileBoundary;s.calls.push({name:'submit',args});return new Response('event: response.created\\ndata: '+JSON.stringify({id:'response-one',session_id:'session-one',profile:s.streamProfile})+'\\n\\n');}};`,
    });
    await run({...module,state,fence});
  }finally{delete globalThis.__assignmentProfileBoundary;}
}

test('observer cannot adopt or cancel a mismatched task session, profile or active response',async()=>{
  for(const tamper of [state=>state.session.id='session-other',state=>state.session.profile='robyn-other-job',state=>{state.assignment.response_id='response-known';state.session.active_response_id='response-other';}])await assignmentBoundary(async({observeAssignment,state,fence})=>{
    state.assignment.state='cancelling';tamper(state);
    assert.equal(await observeAssignment(fence),'wait');assert.deepEqual(state.calls.map(call=>call.name),['session']);
    assert.deepEqual(state.calls[0].args,['persistent','session-one','robyn-job-one']);
  });
});

test('observer rejects a replay with the wrong profile without accepting terminal text',async()=>{
  await assignmentBoundary(async({observeAssignment,state,fence})=>{
    state.assignment.response_id='response-one';state.streamProfile='robyn-other-job';
    assert.equal(await observeAssignment(fence),'wait');assert.deepEqual(state.calls.map(call=>call.name),['session','stream']);
  });
});

test('dispatch accepts omitted or matching profile echoes and never retries an uncertain POST',async()=>{
  for(const profile of ['robyn-job-one','robyn-other-job',null,undefined])await assignmentBoundary(async({dispatchAssignment,state,fence})=>{
    state.assignment.dispatch_state='idle';state.streamProfile=profile;
    assert.equal(await dispatchAssignment(fence),'sent');
    assert.equal(await dispatchAssignment(fence),'sent');
    assert.equal(state.calls.filter(call=>call.name==='submit').length,1);
    const sent=state.calls.find(call=>call.name==='submit');assert.equal(sent.args[4],'robyn-job-one');
    const matches=profile===undefined||profile==='robyn-job-one';
    assert.equal(state.calls.some(call=>call.name==='record_studio_assignment_response'),matches);
    assert.equal(state.calls.some(call=>call.name==='mark_studio_dispatch_uncertain'),!matches);
  });
});

test('observer finishes the exact recorded response when created omits its optional profile echo',async()=>{
  await assignmentBoundary(async({observeAssignment,state,fence})=>{
    state.assignment.response_id='response-one';state.session.active_response_id=null;delete state.session.profile;state.streamProfile=undefined;
    assert.equal(await observeAssignment(fence),'done');
    const finish=state.calls.find(call=>call.name==='finish_studio_assignment');assert.equal(finish.args.p_response,'response-one');assert.equal(finish.args.p_text,'Saved work is ready.');
    assert.equal(state.calls.some(call=>call.name==='submit'||call.name==='cancel'),false);
  });
});

test('a superseded workflow fence cannot submit or observe a turn',async()=>{
  await assignmentBoundary(async({dispatchAssignment,observeAssignment,state,fence})=>{
    state.assignment.run_attempt='attempt-two';
    assert.equal(await dispatchAssignment(fence),'sent');assert.equal(await observeAssignment(fence),'done');assert.deepEqual(state.calls,[]);
  });
});
