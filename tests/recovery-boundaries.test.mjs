import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule,httpMock} from './helpers/module.mjs';

test('a saved revision beyond the first history page is recovered directly without another upload',async()=>{
  const prior=globalThis.localStorage,revisionId=randomUUID(),assetId=randomUUID(),calls=[];
  globalThis.localStorage={getItem:()=>revisionId,removeItem:key=>calls.push({removed:key})};
  globalThis.revisionRecovery=async(url,options)=>{calls.push({url,options});assert.equal(options,undefined);assert.equal(new URL(url,'https://local.test').searchParams.get('revisionId'),revisionId);return{revisions:[{id:revisionId,state:'committed'}]};};
  try{
    const {savePackage}=await loadModule('../../src/studio/transfer-client.ts',{'@/lib/api':`export const apiFetch=(...args)=>globalThis.revisionRecovery(...args);export const readApiError=()=>'';`});
    const result=await savePackage({assetId,expectedBaseRevisionId:null,files:[{path:'notebook.md',role:'master',file:new Blob(['saved research'],{type:'text/markdown'})}],dependencies:[],message:'Continue'});
    assert.deepEqual(result,{assetId,revisionId,status:'committed'});assert.equal(calls.filter(call=>call.url).length,1);
  }finally{if(prior===undefined)delete globalThis.localStorage;else globalThis.localStorage=prior;delete globalThis.revisionRecovery;}
});

test('unaccepted providers and options cannot start new work but exact saved operations can recover',async()=>{
  const previousKey=process.env.AGENT37_API_KEY;process.env.AGENT37_API_KEY='isolated-test';
  let existing=false;const rpcCalls=[],filters=[];
  const identity={workspaceId:randomUUID(),userId:randomUUID(),projectId:randomUUID()};
  const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){return{data:existing?{id:'saved-job'}:null,error:null};}};
  const db={from:()=>query,rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:{id:'saved-job'},error:null};}};
  try{
    const {createMediaJob}=await loadModule('../../src/studio/media-server.ts',{'server-only':'','@/lib/http':httpMock,'./server':`export const dbFailure=e=>{if(e)throw Error()};export const id=v=>v;export const ownedProject=()=>{};`,'./media-providers':`export const searchStock=()=>[];`,'./employee-budgets':`export const ownedBudgetEmployee=()=>{};`,'./paid-capacity':`export const paidCapacity=()=>{};`});
    const options=[
      {service:'paysponge-gemini-image'},
      {service:'blockrun-image-gen',settings:{model:'google/nano-banana'}},
      {service:'blockrun-image-gen',settings:{size:'1440x1440'}},
      {service:'treza-video',settings:{seconds:10}},
      {service:'blockrun-tts',settings:{response_format:'wav'}},
    ];
    for(const option of options){
      const request={operationId:randomUUID(),operation:'generate',name:'Preview source',prompt:'A robin',...option};
      existing=false;const before=rpcCalls.length;
      await assert.rejects(createMediaJob(db,identity,request),error=>error.code==='media_acceptance_pending');assert.equal(rpcCalls.length,before);
      existing=true;assert.equal((await createMediaJob(db,identity,request)).id,'saved-job');assert.equal(rpcCalls.length,before+1);
      assert.equal(rpcCalls.at(-1).args.p_operation,request.operationId);
    }
    for(const [field,value] of [['workspace_id',identity.workspaceId],['created_by',identity.userId],['project_id',identity.projectId]])assert.ok(filters.some(pair=>pair[0]===field&&pair[1]===value));
  }finally{if(previousKey===undefined)delete process.env.AGENT37_API_KEY;else process.env.AGENT37_API_KEY=previousKey;}
});
