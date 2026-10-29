import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadModule} from './helpers/module.mjs';

test('legacy project-tool URLs preserve known project context or return to projects',async()=>{
  const projectId=randomUUID(),asset=randomUUID(),revision=randomUUID();
  const mocks={'next/navigation':'export function redirect(location){throw Object.assign(new Error("Redirect"),{location})}'};
  for(const section of ['library','employees','research','applications','settings']){
    const {default:page}=await loadModule(`../../src/app/dashboard/(fleet)/${section}/page.tsx`,mocks);
    await assert.rejects(page({searchParams:Promise.resolve({})}),{location:'/dashboard'});
    const searchParams=Promise.resolve({projectId,asset,revision,view:'review'});
    await assert.rejects(page({searchParams}),error=>{
      const url=new URL(error.location,'https://studio.test');assert.equal(url.pathname,`/dashboard/projects/${projectId}${section==='applications'?'':`/${section}`}`);
      if(section==='employees'){assert.equal(url.searchParams.get('asset'),asset);assert.equal(url.searchParams.get('revision'),revision);assert.equal(url.searchParams.get('view'),'review');}
      return true;
    });
  }
  const {default:applications}=await loadModule('../../src/app/dashboard/(fleet)/projects/[id]/applications/page.tsx',mocks);
  await assert.rejects(applications({params:Promise.resolve({id:projectId})}),{location:`/dashboard/projects/${projectId}`});
});

test('Research verifies project ownership before providing a browser connection or changing control',async()=>{
  const user=randomUUID(),workspace=randomUUID(),project=randomUUID(),foreign=randomUUID(),employee=randomUUID();
  const records={workspaces:[{id:workspace,owner_id:user}],studio_projects:[{id:project,workspace_id:workspace},{id:foreign,workspace_id:randomUUID()}],studio_employees:[{id:employee,workspace_id:workspace,employee_key:'research',app_id:'research',instance_id:'research-test',provision_state:'ready',browser_control:'agent',browser_control_id:null}]};
  const provider=[];
  const db={rpc:async()=>({data:workspace,error:null}),from(table){
    const filters=[];const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},async single(){return {data:records[table]?.find(row=>filters.every(([key,value])=>row[key]===value))??null,error:null};},async maybeSingle(){return query.single();}};return query;
  }};
  globalThis.__projectResearchAuth={db,user:{id:user}};
  globalThis.__projectResearchProvider={getAgent:async id=>{provider.push(id);return {id,metadata:{app_workspace:workspace,studio_employee:employee}};},signedUrl:async(...args)=>{provider.push(args);return {url:'https://research-test.agent37.app/?test=connection'};}};
  try{
    const {GET,POST}=await loadModule('../../src/app/api/studio/research/browser/route.ts',{
      'server-only':'','@/lib/auth':'export const requireUser=async()=>globalThis.__projectResearchAuth;',
      '@/lib/agent37':'export class Agent37Error extends Error {} export const agent37=globalThis.__projectResearchProvider;',
      './assignment-launch':'export const launchAssignment=async()=>{throw Error("Unexpected launch")};',
    });
    const address=id=>`https://studio.test/api/studio/research/browser${id===null?'':`?projectId=${id}`}`;
    const post=(id,action,origin='https://studio.test')=>POST(new Request(address(id),{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action,controlId:randomUUID()})}));
    for(const [id,status] of [[null,400],['invalid',400],[foreign,404],[randomUUID(),404]]){
      assert.equal((await GET(new Request(address(id)))).status,status);
      for(const action of ['connect','take','return'])assert.equal((await post(id,action)).status,status);
    }
    assert.equal((await post(project,'connect','https://other.test')).status,403);assert.deepEqual(provider,[]);
    const status=await GET(new Request(address(project)));assert.equal(status.status,200);assert.equal(status.headers.get('cache-control'),'no-store');
    const connection=await post(project,'connect');assert.equal(connection.status,200);assert.equal((await connection.json()).ws,'wss://research-test.agent37.app/websockify?test=connection');
    assert.deepEqual(provider,['research-test','research-test',['research-test',6901,60]]);
  }finally{delete globalThis.__projectResearchAuth;delete globalThis.__projectResearchProvider;}
});
