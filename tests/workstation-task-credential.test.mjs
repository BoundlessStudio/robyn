import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {loadModule} from './helpers/module.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function credentialBoundary(run){
  const assignment={id:randomUUID(),execution_model:'robyn',employee_generation:7,workstation_profile:'robyn-job-one-7',allowed_app_ids:['wordcraft'],app_id:'wordcraft'};
  const employee={id:randomUUID(),employee_key:'robyn',kind:'director',app_id:null,retired_at:null};
  const instance={id:'persistent'};
  const token='rbs_'+'a'.repeat(43);
  const files={'studio-mcp.cjs':Buffer.from('fixture client'),'configure-hermes.py':Buffer.from('fixture configuration'),'wordcraft.md':Buffer.from('fixture application instructions')};
  const release={version:'0.2.0',directory:'vendor/robyn-workstation/fixture',files:Object.fromEntries(['studio-mcp.cjs','configure-hermes.py','skills/wordcraft.md'].map(name=>{const bytes=files[path.basename(name)];return [name,{bytes:bytes.length,sha256:hash(bytes)}];}))};
  const state={assignment,employee,instance,token,files,release,reused:false,installedHash:hash(token),uploads:[],exec:[],revocations:[],issued:[],scopeCalls:[],ready:0,scopeError:null,scope:{kind:'robyn',assignmentId:assignment.id,generation:7,profile:assignment.workstation_profile,instanceId:instance.id}};
  const db={from(table){assert.equal(table,'studio_employee_tokens');const revoked={filters:[]};state.revocations.push(revoked);return {update(value){revoked.value=value;return this;},eq(key,value){revoked.filters.push([key,value]);return this;},then(resolve){return Promise.resolve({error:null}).then(resolve);}};},async rpc(name,args){assert.equal(name,'studio_employee_scope');state.scopeCalls.push(args);return {data:state.scope,error:state.scopeError};}};
  globalThis.__taskCredentialBoundary=state;
  const previousSite=process.env.NEXT_PUBLIC_SITE_URL,previousStorage=process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SITE_URL='https://studio.example';process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';
  try{
    const {prepareEmployeeAssignment}=await loadModule('../../src/studio/workstation.ts',{
      'server-only':'',
      'node:fs/promises':"import path from 'node:path';export const readFile=async file=>{const bytes=globalThis.__taskCredentialBoundary.files[path.basename(file)];if(!bytes)throw Error('Unexpected artifact');return bytes;};",
      './workstation-release.json':'export default globalThis.__taskCredentialBoundary.release;',
      './workstation-image.json':`export default {template:'robyn-studio-0-1-0@1',release:'sha256:${'a'.repeat(64)}'};`,
      './employee-auth':`import {createHash} from 'node:crypto';export const hashEmployeeToken=value=>createHash('sha256').update(value).digest('hex');export const issueEmployeeToken=async(_db,assignmentId,instanceId,binding)=>{const s=globalThis.__taskCredentialBoundary;s.issued.push({assignmentId,instanceId,binding});return s.token;};`,
      './paid-capacity':"export const initialWorkstationCap=()=>{throw Error('Unexpected provisioning');};export const confirmInitialWorkstationCap=()=>{throw Error('Unexpected provisioning');};",
      './assignment-server':"export const assignmentRpc=async(_db,name)=>{if(name!=='ready_studio_employee')throw Error('Unexpected assignment mutation');globalThis.__taskCredentialBoundary.ready++;return true;};",
      '@/lib/agent37':`export const agent37={exec:async(id,command)=>{const s=globalThis.__taskCredentialBoundary;s.exec.push({id,command});return command.startsWith('python3')?{exit_code:0,stdout:JSON.stringify({profile:s.assignment.workstation_profile,generation:s.assignment.employee_generation,reusedConfig:s.reused,credentialHash:s.installedHash})}:{exit_code:0,stdout:''};},writeWorkstationFile:async(id,file,bytes)=>{globalThis.__taskCredentialBoundary.uploads.push({id,file,bytes});}};`,
    });
    await run({state,prepare:()=>prepareEmployeeAssignment(db,{workspaceId:'studio',userId:'owner',assignmentId:assignment.id},assignment,employee,instance)});
  }finally{
    delete globalThis.__taskCredentialBoundary;
    if(previousSite===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=previousSite;
    if(previousStorage===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previousStorage;
  }
}

test('new task readiness rechecks its exact installed credential hash and immutable identity',async()=>{
  await credentialBoundary(async({state,prepare})=>{
    assert.equal(await prepare(),true);assert.equal(state.ready,1);
    assert.deepEqual(state.scopeCalls,[{p_hash:hash(state.token)}]);assert.deepEqual(state.revocations,[]);
    assert.deepEqual(state.issued,[{assignmentId:state.assignment.id,instanceId:'persistent',binding:{generation:7,profile:'robyn-job-one-7'}}]);
    const config=JSON.parse(state.uploads.find(item=>item.file.endsWith('/assignment.json')).bytes.toString());
    assert.equal(config.assignmentId,state.assignment.id);assert.equal(config.generation,7);assert.equal(config.profile,'robyn-job-one-7');
    assert.equal(config.workRoot,`/home/node/.robyn/work/${state.assignment.id}`);assert.equal(config.stateRoot,`/home/node/.robyn/state/${state.assignment.id}/7`);
    assert.ok(state.exec.every(call=>!call.command.includes(state.token)),'credential bytes never enter shell commands');
  });
});

test('retrying immutable task configuration validates the old token and revokes only the unused fresh token',async()=>{
  await credentialBoundary(async({state,prepare})=>{
    state.reused=true;state.installedHash='b'.repeat(64);
    assert.equal(await prepare(),true);assert.deepEqual(state.scopeCalls,[{p_hash:'b'.repeat(64)}]);assert.equal(state.ready,1);
    assert.equal(state.revocations.length,1);assert.deepEqual(state.revocations[0].filters,[['assignment_id',state.assignment.id],['token_hash',hash(state.token)]]);
  });
});

test('expired or revoked immutable credentials never mark the workstation ready or bind a replacement token',async()=>{
  await credentialBoundary(async({state,prepare})=>{
    state.reused=true;state.installedHash='b'.repeat(64);state.scope=null;state.scopeError={message:'employee access denied'};
    await assert.rejects(prepare(),/assignment_credential_expired/);assert.equal(state.ready,0);
    assert.deepEqual(state.scopeCalls,[{p_hash:'b'.repeat(64)}]);assert.equal(state.revocations.length,1);
    assert.deepEqual(state.revocations[0].filters,[['assignment_id',state.assignment.id],['token_hash',hash(state.token)]]);
  });
});

test('an installed credential for another task, generation, profile or instance cannot authorize readiness',async()=>{
  for(const replacement of [{assignmentId:randomUUID()},{generation:8},{profile:'robyn-job-two-8'},{instanceId:'other-instance'},{kind:'specialist'}])await credentialBoundary(async({state,prepare})=>{
    Object.assign(state.scope,replacement);await assert.rejects(prepare(),/assignment_credential_expired/);assert.equal(state.ready,0);
  });
  await credentialBoundary(async({state,prepare})=>{
    state.installedHash='b'.repeat(64);await assert.rejects(prepare(),/credential changed/);assert.deepEqual(state.scopeCalls,[]);assert.equal(state.ready,0);
  });
});
