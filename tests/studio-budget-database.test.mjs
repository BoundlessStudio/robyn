import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('Studio budget synchronization is private, fenced, recoverable and cannot race workstation provisioning',async()=>{
  const db=new PGlite();const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,confirmation_sent_at timestamptz,recovery_sent_at timestamptz);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role;grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant all on storage.objects to anon,authenticated,service_role;`);
    for(const name of (await fs.readdir(new URL('../supabase/migrations',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await db.exec(await fs.readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from studio_managed_budgets'),/permission denied/);
      await assert.rejects(scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',[randomUUID(),randomUUID(),randomUUID(),'workflow',randomUUID()]),/permission denied/);await db.exec('reset role');
    }
    const owner=randomUUID(),foreign=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,foreign]);await db.exec('set role service_role');
    const profiles=JSON.stringify([{key:'director',kind:'director',appId:null,role:'Director',instructions:'Direct',version:'1'},{key:'research',kind:'specialist',appId:'research',role:'Researcher',instructions:'Research',version:'1'}]);
    const workspace=await scalar('select initialize_studio($1,$2) as result',[owner,profiles]);
    const employees=(await db.query('select id,monthly_cap_micros from studio_employees where workspace_id=$1 order by employee_key',[workspace])).rows;
    assert.ok(employees.every(e=>e.monthly_cap_micros===0),'new employees receive no implicit unallocated spend');
    const allocations=Object.fromEntries(employees.map(e=>[e.id,5000000]));const operation=randomUUID(),lease=randomUUID(),request={monthlyLimitMicros:10000000,mode:'custom',allocations};
    const claim=(user=owner,op=operation,body=request,l=lease)=>scalar('select claim_studio_budget_change($1,$2,$3,$4,$5,10000000,$6) as result',[workspace,user,op,JSON.stringify(body),l,JSON.stringify(allocations)]);
    const stage=(l=lease,a=allocations)=>scalar('select stage_studio_budget_change($1,$2,$3,$4,10000000,\'custom\',$5) as result',[workspace,owner,operation,l,JSON.stringify(a)]);
    const finish=(l=lease,error=null)=>scalar('select finish_studio_budget_change($1,$2,$3,$4,$5) as result',[workspace,owner,operation,l,error]);
    await assert.rejects(claim(foreign),/not found/);assert.equal((await claim()).claimed,true);
    await assert.rejects(claim(),/update in progress/);
    await assert.rejects(claim(owner,operation,{...request,monthlyLimitMicros:1}),/operation key reused/);
    await assert.rejects(stage(randomUUID()),/lease lost/);
    await assert.rejects(stage(lease,{...allocations,[employees[0].id]:9000000}),/exceed/);
    await assert.rejects(db.query("update studio_employees set provision_state='provisioning' where id=$1",[employees[0].id]),/update in progress/);
    assert.equal(await stage(),true);assert.equal(await finish(lease,'Network interrupted'),true);
    await assert.rejects(db.query("update studio_employees set provision_state='provisioning' where id=$1",[employees[0].id]),/update in progress/);
    const retryLease=randomUUID();assert.equal((await claim(owner,operation,request,retryLease)).claimed,true);
    await assert.rejects(finish(),/lease lost/);await stage(retryLease);await finish(retryLease);
    assert.equal((await claim()).saved,true);assert.equal(await scalar('select sum(monthly_cap_micros)::bigint as result from studio_employees where workspace_id=$1',[workspace]),10000000);
    await db.query("update studio_employees set provision_state='provisioning' where id=$1",[employees[0].id]);
    await assert.rejects(claim(owner,randomUUID()),/setup in progress/);
    await db.query("update studio_employees set provision_state='ready',instance_id='budget-test' where id=$1",[employees[0].id]).catch(async()=>{await db.query("insert into agents(workspace_id,agent37_id) values($1,'budget-test')",[workspace]);await db.query("update studio_employees set provision_state='ready',instance_id='budget-test' where id=$1",[employees[0].id]);});
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Budget pause') returning id as result",[workspace,owner]);
    const assignment=await scalar("select to_jsonb(create_studio_assignment($1,$2,$3,$4,$5,'Keep progress','[]')) as result",[workspace,owner,project,employees[0].id,randomUUID()]);
    await scalar("select bind_studio_assignment_workflow($1,$2,$3,'budget-flow') as result",[workspace,owner,assignment.id]);
    const {assignment:running}=await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,assignment.id]);
    const fence=[workspace,owner,assignment.id,'budget-flow',running.run_attempt];
    assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',fence),false,'unknown dispatch cannot restart');
    await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',fence);
    assert.equal(await scalar("select pause_studio_assignment_budget($1,$2,$3,$4,$5,'missing') as result",fence),false);
    await scalar('select record_studio_assignment_response($1,$2,$3,$4,$5,$6,\'response-one\') as result',[...fence,running.session_id]);
    assert.equal(await scalar("select pause_studio_assignment_budget($1,$2,$3,$4,$5,'response-one') as result",fence),true);
    assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',fence),true);
    const resumed=(await db.query('select * from studio_assignments where id=$1',[assignment.id])).rows[0];
    assert.equal(resumed.state,'running');assert.equal(resumed.dispatch_state,'idle');assert.notEqual(resumed.session_id,running.session_id);assert.equal(resumed.budget_turns[0].responseId,'response-one');assert.equal(resumed.brief,'Keep progress');
    assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',fence),false,'resumption is idempotent');
    const extra=[];
    for(let n=0;n<4;n++){
      const key='slot-'+n;
      await db.query('insert into agents(workspace_id,agent37_id) values($1,$2)',[workspace,key]);
      const e=await scalar("insert into studio_employees(workspace_id,employee_key,kind,app_id,role,instructions,manifest_version,instance_id,provision_state) values($1,$2,'specialist',$2,'Craft','Create','1',$2,'ready') returning id as result",[workspace,key]);
      const job=await scalar("select to_jsonb(create_studio_assignment($1,$2,$3,$4,$5,'Slot test','[]')) as result",[workspace,owner,project,e,randomUUID()]);
      extra.push(job);
      if(n<3)assert.equal((await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,job.id])).claimed,true);
    }
    assert.equal((await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,extra[3].id])).claimed,false);
    const held=await scalar('select to_jsonb(a) as result from studio_assignments a where id=$1',[extra[0].id]);
    await scalar("select bind_studio_assignment_workflow($1,$2,$3,'slot-flow') as result",[workspace,owner,held.id]);
    // Simulate an already-identified, definitively failed terminal response.
    await db.query("update studio_assignments set workflow_id='slot-flow',dispatch_state='dispatched',response_id='slot-response',budget_paused=true where id=$1",[held.id]);
    assert.equal((await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,extra[3].id])).claimed,true,'paused budget work frees a slot for a funded employee');
    const slotFence=[workspace,owner,held.id,'slot-flow',held.run_attempt];
    assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',slotFence),false,'resumption cannot exceed three active specialists');
    await db.query("update studio_assignments set state='cancelled' where id=$1",[extra[1].id]);
    assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',slotFence),true);
  }finally{await db.close();}
});
