// Historical multi-employee regression fixture: the forward migration 0028 and
// current canonical contracts are covered in robyn-workstation-database.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('Director plans isolate tenants, freeze handoffs, recover ownership, and stop dependent production safely',async()=>{
  const db=new PGlite();
  const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
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
    for(const name of (await fs.readdir(new URL('../supabase/migrations',import.meta.url))).filter(x=>x.endsWith('.sql') && x<'0028_').sort())await db.exec(await fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    for(const role of ['anon','authenticated']){
      for(const table of ['studio_campaigns','studio_campaign_steps','studio_assignment_deliverables'])assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT') as result",[role,table]),false);
      const functions=['director_create_campaign','bind_studio_campaign_workflow','cancel_studio_campaign','advance_studio_campaign','studio_assignment_output_refs'];
      const privileges=(await db.query("select has_function_privilege($1,oid,'EXECUTE') as allowed from pg_proc where proname=any($2)",[role,functions])).rows;
      assert.equal(privileges.length,functions.length);assert.ok(privileges.every(row=>!row.allowed));
    }
    const owner=randomUUID(),outsider=randomUUID();
    await db.query('insert into auth.users(id) values($1),($2)',[owner,outsider]);
    await db.exec('set role service_role');
    const profiles=[{key:'director',kind:'director',role:'Director',version:'1',instructions:'Plan.'},...['art','photo','deck'].map(key=>({key,kind:'specialist',appId:key,role:key,version:'1',instructions:'Make editable work.'}))];
    const workspace=await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify(profiles)]);
    const foreign=await scalar('select initialize_studio($1,$2) as result',[outsider,JSON.stringify(profiles)]);
    const employees=(await db.query('select * from studio_employees')).rows;
    for(const employee of employees){
      await db.query('insert into agents(workspace_id,agent37_id) values($1,$2)',[employee.workspace_id,employee.id]);
      await db.query("update studio_employees set instance_id=$1,provision_state='ready' where id=$1",[employee.id]);
    }
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Campaign proof') returning id as result",[workspace,owner]);
    const foreignProject=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Private') returning id as result",[foreign,outsider]);
    const getEmployee=(key,ws=workspace)=>employees.find(e=>e.workspace_id===ws&&e.employee_key===key).id;
    const create=(key='director',ws=workspace,user=owner,proj=project)=>scalar('select create_studio_assignment($1,$2,$3,$4,$5,$6,$7) as result',[ws,user,proj,getEmployee(key,ws),randomUUID(),'Create a coherent campaign.','[]']);
    const read=id=>scalar('select to_jsonb(a) as result from studio_assignments a where id=$1',[id]);
    async function start(job,user=owner,acknowledged=true){
      const workflow=randomUUID();
      await scalar('select bind_studio_assignment_workflow($1,$2,$3,$4) as result',[job.workspace_id,user,job.id,workflow]);
      const claimed=await scalar('select claim_studio_assignment($1,$2,$3) as result',[job.workspace_id,user,job.id]);
      assert.equal(claimed.claimed,true,JSON.stringify({assignment:job.id,claim:claimed}));
      const running=claimed.assignment;
      const fence=[job.workspace_id,user,job.id,workflow,running.run_attempt];
      assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',fence),true);
      const response=acknowledged?randomUUID():null;
      if(acknowledged)assert.equal(await scalar('select record_studio_assignment_response($1,$2,$3,$4,$5,$6,$7) as result',[...fence,running.session_id,response]),true);
      const token=createHash('sha256').update(randomUUID()).digest('hex');
      await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')",[job.id,job.employee_id,token]);
      return {...running,fence,response,token};
    }
    const finish=(job,outcome='completed')=>scalar('select finish_studio_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[...job.fence,job.response,outcome,'Production notes',outcome==='failed'?'test_failure':null]);
    const pkg={files:[{path:'editable.native',role:'master',mimeType:'application/octet-stream',bytes:32,sha256:'a'.repeat(64)}],dependencies:[],message:'Native deliverable'};
    const files=revision=>scalar("select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) as result from studio_package_files where revision_id=$1",[revision]);
    async function save(job,assetId,base=null){
      assetId??=(await scalar('select employee_create_asset($1,$2,$3) as result',[job.token,randomUUID(),'Editable work'])).assetId;
      const revision=await scalar('select employee_begin_revision($1,$2,$3,$4,$5) as result',[job.token,randomUUID(),assetId,base,JSON.stringify(pkg)]);
      await scalar('select employee_commit_revision($1,$2,$3) as result',[job.token,revision.revisionId,JSON.stringify(await files(revision.revisionId))]);
      return {assetId,revisionId:revision.revisionId};
    }
    async function humanEdit(ref){
      const revision=await scalar('select begin_studio_revision($1,$2,$3,$4,$5) as result',[workspace,owner,ref.assetId,ref.revisionId,JSON.stringify(pkg)]);
      await scalar('select commit_studio_revision($1,$2,$3,$4) as result',[workspace,owner,revision,JSON.stringify(await files(revision))]);
      return {assetId:ref.assetId,revisionId:revision};
    }
    const step=(key,appId,dependsOn=[],final=false,inputs=[])=>({key,appId,dependsOn,final,inputs,brief:`Make ${key} using exact supplied revisions.`});
    const plan=(job,steps,operation=randomUUID())=>scalar('select director_create_campaign($1,$2,$3) as result',[job.token,operation,JSON.stringify(steps)]);
    const bind=(campaign,next,previous=null,user=owner)=>scalar('select bind_studio_campaign_workflow($1,$2,$3,$4,$5) as result',[workspace,user,campaign,previous,next]);
    const advance=(campaign,workflow,user=owner)=>scalar('select advance_studio_campaign($1,$2,$3,$4) as result',[workspace,user,campaign,workflow]);
    const tasks=campaign=>db.query('select * from studio_campaign_steps where campaign_id=$1 order by position',[campaign]).then(r=>r.rows);
    const campaign=id=>scalar('select to_jsonb(c) as result from studio_campaigns c where id=$1',[id]);

    const privateJob=await start(await create('art',foreign,outsider,foreignProject),outsider);
    const privateRef=await save(privateJob);await finish(privateJob);
    const otherProject=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Other project') returning id as result",[workspace,owner]);
    const otherJob=await start(await create('art',workspace,owner,otherProject));
    const otherRef=await save(otherJob);await finish(otherJob);
    const root=await start(await create());
    await assert.rejects(plan(root,[step('bad','art',[],true,[privateRef])]),/dependency unavailable/);
    await assert.rejects(plan(root,[step('other-project','art',[],true,[otherRef])]),/dependency unavailable/);
    await assert.rejects(plan(root,[step('consumer','deck',['later'],true),step('later','art')]),/dependency/);
    await assert.rejects(plan(root,[step('unfinished','art')]),/final deliverables/);
    const specification=[step('identity','art'),step('texture','photo'),step('variant','art'),step('presentation','deck',['identity','texture'],true)];
    const operation=randomUUID(),saved=await plan(root,specification,operation),cid=saved.campaignId;
    assert.deepEqual(await plan(root,specification,operation),saved);
    await assert.rejects(plan(root,[step('different','art',[],true)],operation),/operation key reused/);
    await assert.rejects(plan(root,specification),/already planned/);
    await assert.rejects(bind(cid,'intruder',null,outsider),/not found/);
    assert.equal(await bind(cid,'original'),true);assert.equal(await bind(cid,'duplicate'),false);
    assert.equal((await advance(cid,'original')).assignments.length,0,'production waits for the Director to finish planning');
    assert.equal(await bind(cid,'recovered','original'),true);
    assert.equal((await advance(cid,'original')).done,true,'the old workflow cannot create tasks');
    await assert.rejects(advance(cid,'recovered',outsider),/not found/);
    assert.equal((await finish(root)).state,'completed');
    assert.equal((await advance(cid,'recovered')).assignments.length,3);
    const initial=await tasks(cid);
    assert.deepEqual((await tasks(cid)).map(x=>x.assignment_id),initial.map(x=>x.assignment_id));
    await advance(cid,'recovered');
    assert.deepEqual((await tasks(cid)).map(x=>x.assignment_id),initial.map(x=>x.assignment_id),'coordinator retry keeps task identities');
    const artist=await start(await read(initial[0].assignment_id));
    const photo=await start(await read(initial[1].assignment_id));
    assert.equal((await scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,initial[2].assignment_id])).claimed,false,'one employee cannot run two campaign tasks');
    await assert.rejects(plan(artist,[step('not-a-director','art',[],true)]),/employee access denied/);
    const identity=await save(artist);assert.equal((await finish(artist)).state,'completed');
    const humanIdentity=await humanEdit(identity);assert.notEqual(humanIdentity.revisionId,identity.revisionId);
    await advance(cid,'recovered');assert.equal((await tasks(cid))[3].assignment_id,null,'every prerequisite must finish');
    const variant=await start(await read(initial[2].assignment_id));await save(variant);await finish(variant);
    const texture=await save(photo);await finish(photo);await advance(cid,'recovered');
    const presentation=await start(await read((await tasks(cid))[3].assignment_id));
    const inputs=(await db.query('select asset_id,revision_id from studio_assignment_inputs where assignment_id=$1',[presentation.id])).rows;
    assert.deepEqual(new Set(inputs.map(ref=>ref.revision_id)),new Set([identity.revisionId,texture.revisionId]),'handoffs keep employee outputs even after a human advances the asset head');
    const finalRef=await save(presentation);await finish(presentation);await advance(cid,'recovered');
    const reviewId=(await campaign(cid)).final_assignment_id;
    assert.ok(reviewId);await advance(cid,'recovered');assert.equal((await campaign(cid)).final_assignment_id,reviewId);
    const final=await start(await read(reviewId));assert.equal(final.purpose,'campaign_final');
    await assert.rejects(plan(final,[step('recursive','art',[],true)]),/employee access denied/);
    assert.equal((await finish(final)).state,'awaiting_review');
    assert.equal((await advance(cid,'recovered')).state,'awaiting_review');
    const deliverables=(await db.query('select asset_id,revision_id from studio_assignment_deliverables where assignment_id=$1',[final.id])).rows;
    assert.deepEqual(deliverables,[{asset_id:finalRef.assetId,revision_id:finalRef.revisionId}]);
    await humanEdit(finalRef);
    const review=await scalar('select review_studio_assignment($1,$2,$3,$4,$5,$6) as result',[workspace,owner,final.id,randomUUID(),'changes_requested','Make the cover calmer.']);
    assert.equal((await campaign(cid)).state,'completed');
    const nextInputs=(await db.query('select revision_id from studio_assignment_inputs where assignment_id=$1',[review.followup_assignment_id])).rows;
    assert.deepEqual(nextInputs,[{revision_id:finalRef.revisionId}],'feedback refers to the reviewed version, not a later head');
    const followup=await start(await read(review.followup_assignment_id));assert.equal(followup.purpose,'independent');await finish(followup);
    await scalar('select review_studio_assignment($1,$2,$3,$4,$5,$6) as result',[workspace,owner,followup.id,randomUUID(),'approved','']);

    const cancelRoot=await start(await create());
    const cancelled=(await plan(cancelRoot,[step('running','art'),step('queued','photo'),step('dependent','deck',['running','queued'],true)])).campaignId;
    await bind(cancelled,'cancel-workflow');await finish(cancelRoot);await advance(cancelled,'cancel-workflow');
    const cancelTasks=await tasks(cancelled),uncertain=await start(await read(cancelTasks[0].assignment_id),owner,false);
    assert.equal(await scalar('select mark_studio_dispatch_uncertain($1,$2,$3,$4,$5) as result',uncertain.fence),true);
    await assert.rejects(scalar('select cancel_studio_campaign($1,$2,$3) as result',[workspace,outsider,cancelled]),/not found/);
    await scalar('select cancel_studio_campaign($1,$2,$3) as result',[workspace,owner,cancelled]);
    assert.equal((await read(uncertain.id)).state,'cancelling');
    assert.equal((await read(cancelTasks[1].assignment_id)).state,'cancelled');
    assert.equal((await advance(cancelled,'cancel-workflow')).done,false,'uncertain work retains its slot until confirmed stopped');
    await assert.rejects(scalar('select studio_employee_scope($1) as result',[uncertain.token]),/access denied/);
    assert.equal(await finish(uncertain),null,'a missing response acknowledgement cannot prove termination');
    assert.equal(await scalar('select record_studio_assignment_terminal_history($1,$2,$3,$4,$5,$6) as result',[...uncertain.fence,uncertain.session_id]),true);
    assert.equal((await finish(uncertain)).state,'cancelled');
    assert.equal((await advance(cancelled,'cancel-workflow')).state,'cancelled');
    assert.equal((await tasks(cancelled))[2].assignment_id,null);

    const failedRoot=await start(await create());
    const failed=(await plan(failedRoot,[step('conflict','art'),step('sibling','photo'),step('blocked','deck',['conflict'],true)])).campaignId;
    await bind(failed,'failure-workflow');await finish(failedRoot);await advance(failed,'failure-workflow');
    const failedTasks=await tasks(failed),conflicting=await start(await read(failedTasks[0].assignment_id));
    const committed=await save(conflicting);await save(conflicting,committed.assetId,null);
    const failure=await finish(conflicting);assert.equal(failure.state,'failed');assert.equal(failure.error_code,'deliverable_conflict');
    assert.equal((await advance(failed,'failure-workflow')).state,'failed');
    assert.equal((await read(failedTasks[1].assignment_id)).state,'cancelled');
    assert.equal((await tasks(failed))[2].assignment_id,null,'failed work never starts its dependent task');

    const archivedRoot=await start(await create());
    const archived=(await plan(archivedRoot,[step('never-start','art',[],true)])).campaignId;
    await bind(archived,'archive-workflow');await finish(archivedRoot);
    await db.query("update studio_projects set status='archived' where id=$1",[project]);
    assert.equal((await advance(archived,'archive-workflow')).state,'cancelled');
    assert.equal((await tasks(archived))[0].assignment_id,null);
  }finally{await db.close();}
});
