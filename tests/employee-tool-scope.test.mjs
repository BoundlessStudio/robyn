import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule,httpMock} from './helpers/module.mjs';

async function toolBoundary(run){
  const scope={workspaceId:randomUUID(),projectId:randomUUID(),assignmentId:randomUUID(),employeeId:randomUUID(),userId:randomUUID(),instanceId:'persistent',kind:'robyn',appId:null,appIdHint:'solidcraft',allowedAppIds:['wordcraft','solidcraft'],generation:2,profile:'robyn-job-two',brief:'Continue the saved work.',role:'Robyn'};
  const asset={id:randomUUID(),workspace_id:scope.workspaceId,project_id:scope.projectId,app_id:'wordcraft',asset_kind:'native'};
  const revision={id:randomUUID(),workspace_id:scope.workspaceId,asset_id:asset.id,assignment_id:scope.assignmentId,author_employee_id:scope.employeeId,state:'uploading'};
  const state={scope,asset,revision,calls:[],revoked:false,revokeDuringVerify:false,committed:false};
  const db={from(){throw Error('Unexpected unfenced database query');},async rpc(name,args){
    state.calls.push({name,args});
    if(state.revoked)return {data:null,error:{message:'employee access denied'}};
    if(name==='employee_commit_revision')state.committed=true;
    return {data:{assetId:asset.id,revisionId:revision.id},error:null};
  }};
  const auth={db,tokenHash:'task-two-token-hash',scope};state.auth=auth;globalThis.__employeeToolBoundary=state;
  try{
    const module=await loadModule('../../src/studio/employee-tools.ts',{
      'server-only':'','@/lib/http':httpMock,
      '@/lib/supabase/admin':"export const createAdminClient=()=>{throw Error('Unexpected credential resolution');};",
      './server':`import {ApiError} from '@/lib/http';export const dbFailure=e=>{if(e)throw new ApiError(500,'database_error','Database failure');};export const id=v=>v;export const textField=v=>v;
        export const ownedAsset=async(_db,w,id)=>{const s=globalThis.__employeeToolBoundary;if(w!==s.scope.workspaceId||s.asset.workspace_id!==w||s.asset.id!==id)throw new ApiError(404,'not_found','Asset unavailable');return s.asset;};
        export const ownedRevision=async(_db,w,id)=>{const s=globalThis.__employeeToolBoundary;if(w!==s.scope.workspaceId||s.revision.workspace_id!==w||s.revision.id!==id)throw new ApiError(404,'not_found','Revision unavailable');return s.revision;};
        export const revisionFiles=async()=>[{id:'file',path:'Draft.docx',bytes:32}];export const verifyStoredFiles=async()=>{const s=globalThis.__employeeToolBoundary;s.calls.push({name:'verify'});if(s.revokeDuringVerify)s.revoked=true;return [{id:'file',bytes:32}];};`,
      './package-store':`export const preparePackageTransfers=async(_db,w,r)=>{const s=globalThis.__employeeToolBoundary;s.calls.push({name:'transfers',workspaceId:w,revisionId:r});return {revisionId:r};};export const readSavedPackage=async(_db,w,r)=>{const s=globalThis.__employeeToolBoundary;s.calls.push({name:'read',workspaceId:w,revisionId:r});return {ref:{assetId:s.asset.id,revisionId:r},files:[],dependencies:[]};};`,
      './campaign-launch':"export const launchCampaign=()=>{throw Error('Unexpected delegation');};",
      './media-server':"export const searchMedia=()=>{throw Error('Unexpected media');};export const createMediaJob=()=>{throw Error('Unexpected media');};export const ownedMediaJob=()=>{throw Error('Unexpected media');};",
      './media-launch':"export const launchMediaJob=()=>{throw Error('Unexpected media');};",
    });
    await run({...module,state,scope,asset,revision,auth});
  }finally{delete globalThis.__employeeToolBoundary;}
}

test('Robyn tool discovery removes delegation and requires an explicit application for new assets',async()=>{
  await toolBoundary(async({employeeToolsFor,employeeToolCall,auth,scope,state})=>{
    const tools=employeeToolsFor(scope);
    assert.equal(tools.some(tool=>['studio_team','studio_plan'].includes(tool.name)),false);
    assert.equal(tools.find(tool=>tool.name==='studio_create_asset').inputSchema.required.includes('appId'),true);
    for(const name of ['studio_team','studio_plan'])await assert.rejects(employeeToolCall(auth,name,{}),error=>error.status===403);
    assert.deepEqual(state.calls,[]);
  });
});

test('one job can create allowed Craft and Notes assets but cannot add tools through caller arguments',async()=>{
  await toolBoundary(async({employeeToolCall,auth,state})=>{
    for(const appId of ['wordcraft','solidcraft','research'])await employeeToolCall(auth,'studio_create_asset',{operationId:randomUUID(),name:'Saved work',appId});
    assert.deepEqual(state.calls.map(call=>call.args.p_app),['wordcraft','solidcraft','research']);
    assert.ok(state.calls.every(call=>call.args.p_hash==='task-two-token-hash'));
    const count=state.calls.length;
    for(const appId of [undefined,'gridcraft','unknown'])await assert.rejects(employeeToolCall(auth,'studio_create_asset',{operationId:randomUUID(),name:'Forbidden',appId,kind:'robyn',allowedAppIds:['gridcraft']}),error=>error.code==='application_not_allowed');
    assert.equal(state.calls.length,count);
  });
});

test('legacy specialist credentials never inherit multi-app permissions from new caller fields',async()=>{
  await toolBoundary(async({employeeToolCall,auth,scope,asset,state})=>{
    scope.kind='specialist';scope.appId='wordcraft';scope.allowedAppIds=['wordcraft','solidcraft'];asset.app_id='solidcraft';
    await assert.rejects(employeeToolCall(auth,'studio_begin_revision',{operationId:randomUUID(),assetId:asset.id,expectedBaseRevisionId:null,package:{},kind:'robyn',appId:'solidcraft'}),error=>error.code==='application_not_allowed');
    assert.deepEqual(state.calls,[]);
  });
});

test('the same Robyn employee cannot upload or commit another assignment’s revision',async()=>{
  for(const tamper of [
    state=>state.revision.assignment_id=randomUUID(),
    state=>state.revision.author_employee_id=randomUUID(),
    state=>state.asset.project_id=randomUUID(),
    state=>state.asset.workspace_id=randomUUID(),
    state=>state.revision.workspace_id=randomUUID(),
    state=>state.asset.app_id='gridcraft',
  ])await toolBoundary(async({employeeToolCall,auth,revision,state})=>{
    tamper(state);
    for(const name of ['studio_upload_transfers','studio_commit_revision'])await assert.rejects(employeeToolCall(auth,name,{revisionId:revision.id,assignmentId:state.scope.assignmentId,allowedAppIds:['gridcraft']}),error=>error.status===404);
    assert.deepEqual(state.calls,[]);assert.equal(state.committed,false);
  });
});

test('reading a project asset does not make a different asset or project revision writable',async()=>{
  await toolBoundary(async({employeeToolCall,auth,asset,revision,state})=>{
    await employeeToolCall(auth,'studio_open_asset',{assetId:asset.id,revisionId:revision.id});assert.equal(state.calls[0].name,'read');
    state.calls.length=0;revision.asset_id=randomUUID();
    await assert.rejects(employeeToolCall(auth,'studio_open_asset',{assetId:asset.id,revisionId:revision.id}),error=>error.status===404);assert.deepEqual(state.calls,[]);
    asset.project_id=randomUUID();
    await assert.rejects(employeeToolCall(auth,'studio_begin_revision',{operationId:randomUUID(),assetId:asset.id,expectedBaseRevisionId:null,package:{}}),error=>error.status===404);assert.deepEqual(state.calls,[]);
  });
});

test('a revocation during Storage verification is checked again before committing',async()=>{
  await toolBoundary(async({employeeToolCall,auth,revision,state})=>{
    state.revokeDuringVerify=true;
    await assert.rejects(employeeToolCall(auth,'studio_commit_revision',{revisionId:revision.id}),error=>error.code==='employee_access_denied');
    assert.deepEqual(state.calls.map(call=>call.name),['verify','employee_commit_revision']);
    assert.equal(state.calls[1].args.p_hash,'task-two-token-hash');assert.equal(state.calls[1].args.p_revision,revision.id);assert.equal(state.committed,false);
  });
});
