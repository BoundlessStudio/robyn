import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule,httpMock} from './helpers/module.mjs';

test('Asset Bridge BFF checks ownership and every file before reserving a private upload',async()=>{
  const workspaceId=randomUUID(),projectId=randomUUID(),userId=randomUUID(),creationId=randomUUID(),revisionId=randomUUID();
  const state={workspaceId,projectId,userId,revisionId,calls:[],status:'active',denied:false,reused:false};globalThis.__bridgeRoute=state;
  try{
    const {POST}=await loadModule('../../src/app/api/studio/imports/route.ts',{
      '@/lib/http':httpMock,
      '@/studio/server':`import {ApiError} from '@/lib/http';
        export const requireStudio=async()=>{const s=globalThis.__bridgeRoute;if(s.denied)throw new ApiError(401,'unauthorized','Sign in');return {workspaceId:s.workspaceId,user:{id:s.userId},db:{rpc:async(name,args)=>{s.calls.push({name,args});return {data:s.revisionId,error:s.reused?{message:'bridge import identity reused'}:null};}}};};
        export const ownedProject=async(_db,workspaceId,projectId)=>{const s=globalThis.__bridgeRoute;if(workspaceId!==s.workspaceId||projectId!==s.projectId)throw new ApiError(404,'not_found','Project unavailable');return {status:s.status};};
        export const readStudioBody=request=>request.json();export const id=value=>value;export const textField=value=>value;export const dbFailure=error=>{if(error)throw error;};`,
    });
    const pkg={files:[{path:'Inputs/calculate.m',role:'master',mimeType:'application/octet-stream',bytes:32,sha256:'a'.repeat(64)},{path:'Inputs/empty.txt',role:'dependency',mimeType:'application/octet-stream',bytes:0,sha256:'b'.repeat(64)}],dependencies:[],message:'Uploaded with Asset Bridge'};
    const input={projectId,creationId,name:'Inputs',package:pkg};
    const send=body=>POST(new Request('https://robyn.example/api/studio/imports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    assert.equal((await send(input)).status,200);
    assert.deepEqual(state.calls[0],{name:'begin_asset_bridge_import',args:{p_workspace:workspaceId,p_user:userId,p_project:projectId,p_creation:creationId,p_name:'Inputs',p_package:pkg}});
    for(const path of ['Inputs/setup.EXE','App.app/Contents/info','Inputs/lib.so.2','../escape']){
      assert.equal((await send({...input,package:{...pkg,files:[{...pkg.files[0],path}]}})).status,400);
    }
    assert.equal((await send({...input,projectId:randomUUID()})).status,404);
    state.status='archived';assert.equal((await send(input)).status,409);state.status='active';
    state.denied=true;assert.equal((await send(input)).status,401);state.denied=false;
    assert.equal(state.calls.length,1,'no rejected selection starts an upload');
    state.reused=true;assert.equal((await send(input)).status,409);
  }finally{delete globalThis.__bridgeRoute;}
});
