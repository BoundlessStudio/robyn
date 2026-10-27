import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadModule} from './helpers/module.mjs';

test('file rename and starter routes enforce owner, origin, catalogue and archived-project boundaries',async()=>{
  const user=randomUUID(),workspace=randomUUID(),project=randomUUID(),asset=randomUUID(),foreign=randomUUID();
  const records={workspaces:[{id:workspace,owner_id:user}],studio_projects:[{id:project,workspace_id:workspace,status:'active'}],studio_assets:[{id:asset,workspace_id:workspace,project_id:project,name:'Untitled',app_id:'wordcraft',current_revision_id:randomUUID()},{id:foreign,workspace_id:randomUUID(),name:'Foreign'}]};
  const writes=[],rpcs=[];
  const db={rpc:async(name,args)=>{rpcs.push({name,args});return {data:name==='initialize_studio'?workspace:randomUUID(),error:null};},from(table){
    const filters=[];let update;
    const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},update(value){update=value;return query;},async maybeSingle(){return query.single();},async single(){
      const row=records[table]?.find(row=>filters.every(([key,value])=>row[key]===value));
      if(row&&update){writes.push({table,filters,update});Object.assign(row,update);}
      return {data:row??null,error:null};
    }};return query;
  }};
  globalThis.__applicationRouteAuth={db,user:{id:user}};
  try{
    const mocks={'server-only':'','@/lib/auth':'export const requireUser=async()=>globalThis.__applicationRouteAuth;'};
    const {PATCH}=await loadModule('../../src/app/api/studio/assets/[id]/route.ts',mocks);
    const request=(body,origin='https://studio.example')=>new Request('https://studio.example/api/studio/assets/'+asset,{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
    const context=id=>({params:Promise.resolve({id})});
    const base=records.studio_assets[0].current_revision_id;
    assert.equal((await PATCH(request({name:'Changed'}),context(foreign))).status,404);assert.equal(writes.length,0);
    assert.equal((await PATCH(request({name:'Changed'},'https://foreign.example'),context(asset))).status,403);assert.equal(writes.length,0);
    for(const name of ['', '   ', 'a'.repeat(161)])assert.equal((await PATCH(request({name}),context(asset))).status,400);
    const renamed=await PATCH(request({name:'  A named document  ',project_id:foreign,current_revision_id:foreign,app_id:'gridcraft'}),context(asset));
    assert.equal(renamed.status,200);assert.equal((await renamed.json()).asset.name,'A named document');
    assert.deepEqual(writes[0].update,{name:'A named document'});assert.deepEqual(writes[0].filters,[['workspace_id',workspace],['id',asset]]);
    assert.equal(records.studio_assets[0].current_revision_id,base);assert.equal(records.studio_assets[0].project_id,project);

    const {POST}=await loadModule('../../src/app/api/studio/starters/route.ts',mocks);
    const catalog=JSON.parse(await readFile(new URL('../src/studio/generated/blank-starters.json',import.meta.url),'utf8'));
    const starter=catalog.find(item=>item.appId==='wordcraft');
    const input={projectId:project,creationId:randomUUID(),templateId:starter.id,package:{files:starter.files.map(({url,...file})=>file),dependencies:[],message:'Started a blank document'}};
    const start=body=>POST(request(body));
    assert.equal((await start({...input,projectId:foreign})).status,404);
    records.studio_projects[0].status='archived';assert.equal((await start(input)).status,409);records.studio_projects[0].status='active';
    assert.equal((await start({...input,templateId:'unrecognised:1'})).status,400);
    assert.equal((await start({...input,package:{...input.package,files:[{...input.package.files[0],sha256:'0'.repeat(64)}]}})).status,400);
    assert.equal(rpcs.filter(row=>row.name==='begin_studio_blank').length,0);
    assert.equal((await start(input)).status,201);
    const call=rpcs.find(row=>row.name==='begin_studio_blank');assert.equal(call.args.p_workspace,workspace);assert.equal(call.args.p_user,user);assert.equal(call.args.p_app,'wordcraft');
  }finally{delete globalThis.__applicationRouteAuth;}
});
