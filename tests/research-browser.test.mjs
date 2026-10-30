import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('historical Research takeover holds its queue and resumes the same assignment behind new fences',async()=>{
 const db=new PGlite();const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
 try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,confirmation_sent_at timestamptz,recovery_sent_at timestamptz);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role; grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
      grant all on storage.objects to anon,authenticated,service_role;`);
    // This fixture preserves the Research employee protocol before consolidation.
    // Current Robyn takeover/profile rotation is covered by the complete0028 fixture.
    const migrations=(await fs.readdir(new URL('../supabase/migrations',import.meta.url))).filter(x=>x.endsWith('.sql')&&x<='0027_workstation_release_upgrades.sql').sort();
    for(const name of migrations)await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));

 const owner=randomUUID(),outsider=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,outsider]);
 const profiles=[{key:'research',kind:'specialist',appId:'research',role:'Research',version:'0.1.0',instructions:'Research carefully.'}];
 const workspace=await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify(profiles)]);
 const employee=await scalar('select id as result from studio_employees where workspace_id=$1',[workspace]);
 await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify(profiles)]);
 assert.equal(await scalar('select count(*)::int as result from studio_employees where workspace_id=$1',[workspace]),1);
 await db.query("insert into agents(workspace_id,agent37_id) values($1,'research-test')",[workspace]);
 await db.query("update studio_employees set instance_id='research-test',provision_state='ready' where id=$1",[employee]);
 const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Research proof') returning id as result",[workspace,owner]);
 const create=()=>scalar('select create_studio_assignment($1,$2,$3,$4,$5,$6,$7) as result',[workspace,owner,project,employee,randomUUID(),'Research a reference.','[]']);
 const job=await create(),next=await create(),controlId=randomUUID();
 const bind=(id,w)=>scalar('select bind_studio_assignment_workflow($1,$2,$3,$4) as result',[workspace,owner,id,w]);
 await bind(job.id,'before-takeover');
 const running=(await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,job.id])).assignment;
 const fence=[workspace,owner,job.id,'before-takeover',running.run_attempt];
 assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',fence),true);
 await scalar('select record_studio_assignment_response($1,$2,$3,$4,$5,$6,$7) as result',[...fence,running.session_id,'old-response']);
 const token=createHash('sha256').update(randomUUID()).digest('hex');
 await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at) values($1,'research-test',$2,now()+interval '1 hour')",[job.id,token]);
 const control=(action,user=owner,id=controlId)=>scalar('select control_studio_research($1,$2,$3,$4,$5) as result',[workspace,user,employee,id,action]);
 await assert.rejects(control('request',outsider),/not found/);
 assert.equal((await control('request')).browser_control,'requesting');
 await assert.rejects(scalar('select studio_employee_scope($1) as result',[token]),/access denied/);
 assert.equal(await scalar('select finish_studio_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[...fence,'old-response','failed','Stopped for creator',null]),null,'cancelling the browser turn must not fail the held assignment');
 assert.equal((await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,next.id])).claimed,false);
 await assert.rejects(control('return'),/browser control changed/,'return requires confirmed stop');
 assert.equal((await control('confirm')).browser_control,'human');
 await assert.rejects(control('request',owner,randomUUID()),/already controlled/);
 assert.equal((await control('return')).browser_control,'agent');
 assert.equal((await control('return')).browser_control,'agent','a lost return acknowledgement is idempotent');
 let resumed=await scalar('select to_jsonb(a) as result from studio_assignments a where id=$1',[job.id]);
 assert.equal(resumed.id,job.id);assert.equal(resumed.state,'queued');assert.equal(resumed.browser_turns.length,1);assert.equal(resumed.browser_turns[0].sessionId,running.session_id);
 assert.equal(await scalar('select record_studio_assignment_response($1,$2,$3,$4,$5,$6,$7) as result',[...fence,running.session_id,'old-response']),false);
 assert.equal(await scalar('select finish_studio_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[...fence,'old-response','completed','Late result',null]),null);
 await bind(job.id,'after-takeover');resumed=(await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,job.id])).assignment;
 assert.notEqual(resumed.session_id,running.session_id);assert.notEqual(resumed.run_attempt,running.run_attempt);assert.equal(resumed.employee_generation,running.employee_generation+1);
 const newFence=[workspace,owner,job.id,'after-takeover',resumed.run_attempt];
 assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',newFence),true);
 assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',newFence),false);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(control('request'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
