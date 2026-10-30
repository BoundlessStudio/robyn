import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {studioDatabase} from './helpers/database.mjs';
import {applyStudioMigrations,craftIds} from './helpers/robyn-database.mjs';

test('0028 preserves historical evidence and enforces one scoped Robyn workstation',async t=>{
  const db=await studioDatabase();
  const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
  const row=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const owner=randomUUID(),outsider=randomUUID();let workspace,project,employee,legacy,legacyTask;
  const apps=JSON.stringify(craftIds);
  const create=(hint=null,mode='work',request=randomUUID(),brief='Create useful work')=>scalar(
    'select create_robyn_assignment($1,$2,$3,$4,$5,$6,\'[]\',$7,$8,$9) as result',
    [workspace,owner,project,employee,request,brief,hint,apps,mode]);
  const claim=async id=>{
    if(!(await row('select workflow_id from studio_assignments where id=$1',[id])).workflow_id)
      await scalar('select bind_studio_assignment_workflow($1,$2,$3,$4) as result',[workspace,owner,id,'flow-'+randomUUID()]);
    return scalar('select claim_studio_assignment($1,$2,$3) as result',[workspace,owner,id]);
  };
  const clean=async()=>{
    await db.query("update studio_assignments set state='cancelled',dispatch_state='finished' where workspace_id=$1",[workspace]);
    await db.query("update studio_media_jobs set state='cancelled',billing_settled=true,actual_micros=0 where workspace_id=$1",[workspace]);
  };
  const tokenFor=async(a,hash='a'.repeat(64))=>{
    await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at,employee_generation,workstation_profile) values($1,'robyn-instance',$2,now()+interval '1 hour',$3,$4)",
      [a.id,hash,a.employee_generation,a.workstation_profile]);return hash;
  };
  const packageFor=app=>({files:[{path:app==='research'?'notebook.md':'master.'+app,role:'master',mimeType:'application/octet-stream',bytes:32,sha256:'1'.repeat(64)}],dependencies:[],message:'Scoped output'});
  const writeNative=async(hash,app)=>{
    const asset=await scalar('select employee_create_asset($1,$2,$3,$4) as result',[hash,randomUUID(),'Scoped '+app,app]);
    const operation=randomUUID(),pkg=JSON.stringify(packageFor(app));
    const begin=()=>scalar('select employee_begin_revision($1,$2,$3,null,$4) as result',[hash,operation,asset.assetId,pkg]);
    const revision=await begin();assert.equal((await begin()).revisionId,revision.revisionId);
    const verified=(await db.query('select id,bytes from studio_package_files where revision_id=$1',[revision.revisionId])).rows;
    assert.equal((await scalar('select employee_commit_revision($1,$2,$3) as result',[hash,revision.revisionId,JSON.stringify(verified)])).status,'committed');
    return {...asset,...revision};
  };
  const dispatch=async a=>{
    const fence=[workspace,owner,a.id,a.workflow_id,a.run_attempt];
    assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result',fence),true);
    assert.equal(await scalar('select record_studio_assignment_response($1,$2,$3,$4,$5,$6,\'response\') as result',[...fence,a.session_id]),true);
    return fence;
  };
  try{
    await applyStudioMigrations(db,'0027_workstation_release_upgrades.sql');
    await db.query('insert into auth.users(id) values($1),($2)',[owner,outsider]);
    workspace=await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify([
      {key:'director',kind:'director',role:'Director',version:'1',instructions:'Direct'},
      {key:'wordcraft',kind:'specialist',appId:'wordcraft',role:'Writer',version:'1',instructions:'Write'},
      {key:'research',kind:'specialist',appId:'research',role:'Researcher',version:'1',instructions:'Research'}])]);
    project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Canonical fixture') returning id as result",[workspace,owner]);
    legacy=(await db.query('select * from studio_employees where workspace_id=$1 order by employee_key',[workspace])).rows;
    await db.query("insert into agents(workspace_id,agent37_id,template) values($1,'historical-instance','robyn-wordcraft@1')",[workspace]);
    await db.query("update studio_employees set instance_id='historical-instance',provision_state='ready',monthly_cap_micros=4000000 where id=$1",[legacy.find(e=>e.app_id==='wordcraft').id]);
    legacyTask=await scalar("select create_studio_assignment($1,$2,$3,$4,$5,'Historical request','[]') as result",[workspace,owner,project,legacy.find(e=>e.app_id==='wordcraft').id,randomUUID()]);

    await t.test('cutover rejects queued work and every uncertain external action atomically',async()=>{
      await assert.rejects(applyStudioMigrations(db),/reconciled idle/);
      assert.equal(await scalar("select count(*)::int as result from information_schema.columns where table_name='studio_employees' and column_name='retired_at'"),0);
      await db.query("update studio_assignments set state='cancelled',dispatch_state='uncertain' where id=$1",[legacyTask.id]);
      await assert.rejects(applyStudioMigrations(db),/reconciled idle/);
      await db.query("update studio_assignments set dispatch_state='idle' where id=$1",[legacyTask.id]);
      await db.query("insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,state,reserved_micros,provider_job_id) values($1,$2,$3,$4,'generate','perflo','image','Old paid task','{}','cancelled',100,'old-paid')",[workspace,project,owner,randomUUID()]);
      await assert.rejects(applyStudioMigrations(db),/reconciled idle/);
      await db.query('update studio_media_jobs set billing_settled=true,actual_micros=100 where workspace_id=$1',[workspace]);
      await db.query("update studio_employees set provision_state='provisioning',provision_attempt=$2,provision_create_started_at=now() where id=$1",[legacy[0].id,randomUUID()]);
      await assert.rejects(applyStudioMigrations(db),/reconciled idle/);
      await db.query("update studio_employees set provision_state='unprovisioned',provision_attempt=null,provision_create_started_at=null where id=$1",[legacy[0].id]);
      await applyStudioMigrations(db);
    });

    await t.test('canonical identity is new and zero-funded while history and native authority stay intact',async()=>{
      const rows=(await db.query('select * from studio_employees where workspace_id=$1',[workspace])).rows;
      const current=rows.filter(e=>!e.retired_at);assert.equal(current.length,1);employee=current[0].id;
      assert.equal(current[0].employee_key,'robyn');assert.equal(current[0].kind,'director');assert.equal(current[0].app_id,null);
      assert.equal(current[0].monthly_cap_micros,0);assert.ok(!legacy.some(e=>e.id===employee));
      assert.ok(rows.filter(e=>e.id!==employee).every(e=>e.retired_at));
      assert.deepEqual(await row("select instance_id,monthly_cap_micros from studio_employees where instance_id='historical-instance'"),{instance_id:'historical-instance',monthly_cap_micros:4000000});
      const old=await row('select execution_model,app_id,allowed_app_ids from studio_assignments where id=$1',[legacyTask.id]);
      assert.deepEqual(old,{execution_model:'legacy',app_id:'wordcraft',allowed_app_ids:['wordcraft']});
      await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify([{key:'research',kind:'specialist',appId:'research',role:'Researcher',version:'2',instructions:'Old server'}])]);
      assert.equal(await scalar('select count(*)::int as result from studio_employees where workspace_id=$1',[workspace]),4);
      assert.equal(await scalar("select create_studio_assignment($1,$2,$3,$4,$5,'Historical request','[]') as result",[workspace,owner,project,legacyTask.employee_id,legacyTask.request_key]).then(a=>a.id),legacyTask.id);
      await assert.rejects(scalar("select create_studio_assignment($1,$2,$3,$4,$5,'Fresh legacy','[]') as result",[workspace,owner,project,legacy[0].id,randomUUID()]),/legacy assignment creation unavailable/);
      await assert.rejects(db.query("update studio_assignments set execution_model='robyn',allowed_app_ids=$2 where id=$1",[legacyTask.id,craftIds]),/scope immutable/);
      for(const role of ['anon','authenticated']){
        await db.exec('set role '+role);
        await assert.rejects(db.query('select * from studio_retired_workstations'),/permission denied/);
        await assert.rejects(db.query('select create_robyn_assignment(null,null,null,null,null,null,null,null,null,null)'),/permission denied/);
        await assert.rejects(db.query('select claim_studio_budget_cap_sync(null,null,null,null,null,null,null,null)'),/permission denied/);
        await db.exec('reset role');
      }
    });

    await t.test('provisioning preserves exact create attempts and refuses every retired identity',async()=>{
      await assert.rejects(scalar('select claim_studio_employee_provision($1,$2,$3) as result',[workspace,owner,legacy[0].id]),/not found/);
      assert.equal(await scalar('select claim_studio_employee_creation($1,$2,$3,$4) as result',[workspace,owner,legacy[0].id,randomUUID()]),false);
      assert.equal(await scalar("select ready_studio_employee($1,$2,$3,'historical-instance') as result",[workspace,owner,legacyTask.employee_id]),false);
      const provision=()=>scalar('select claim_studio_employee_provision($1,$2,$3) as result',[workspace,owner,employee]);
      const first=await provision();assert.equal((await provision()).provision_attempt,first.provision_attempt);
      const args=[workspace,owner,employee,first.provision_attempt];
      assert.equal(await scalar('select claim_studio_employee_creation($1,$2,$3,$4) as result',args),true);
      assert.equal(await scalar('select claim_studio_employee_creation($1,$2,$3,$4) as result',args),false);
      assert.equal(await scalar("select bind_studio_employee_instance($1,$2,$3,$4,'robyn-instance','robyn-shared@1','{\"cpu\":2,\"memory\":4,\"disk\":10}') as result",args),true);
      assert.equal(await scalar("select ready_studio_employee($1,$2,$3,'robyn-instance') as result",[workspace,owner,employee]),true);
    });

    await t.test('task identity is immutable and generation/profile grants cover many Crafts plus notebook only',async()=>{
      const id=randomUUID();const task=await create('wordcraft','work',id);
      assert.equal((await create('wordcraft','work',id)).id,task.id);
      await assert.rejects(create('solidcraft','work',id),/operation key reused/);
      await assert.rejects(create('wordcraft','plan',id),/operation key reused/);
      await assert.rejects(scalar("select create_robyn_assignment($1,$2,$3,$4,$5,'Other owner','[]',null,$6,'work') as result",[workspace,outsider,project,employee,randomUUID(),apps]),/not found/);
      const running=(await claim(task.id)).assignment;const token=await tokenFor(running);
      const scope=await scalar('select studio_employee_scope($1) as result',[token]);
      assert.equal(scope.kind,'robyn');assert.equal(scope.appIdHint,'wordcraft');assert.deepEqual(scope.allowedAppIds,craftIds);
      assert.equal(scope.profile,'robyn-'+task.id.replaceAll('-','')+'-'+running.employee_generation);
      assert.equal(scope.generation,running.employee_generation);
      for(const app of ['wordcraft','solidcraft','research']){
        const operation=randomUUID();const asset=await scalar('select employee_create_asset($1,$2,$3,$4) as result',[token,operation,app+' result',app]);
        assert.equal(asset.appId,app);assert.equal((await scalar('select employee_create_asset($1,$2,$3,$4) as result',[token,operation,app+' result',app])).assetId,asset.assetId);
        await assert.rejects(scalar('select employee_create_asset($1,$2,$3,$4) as result',[token,operation,'changed',app]),/operation key reused/);
      }
      await assert.rejects(scalar("select employee_create_asset($1,$2,'Bad','unregistered') as result",[token,randomUUID()]),/access denied/);
      await assert.rejects(scalar("select employee_create_asset($1,$2,'Missing app') as result",[token,randomUUID()]),/access denied/);
      for(const app of ['wordcraft','solidcraft','research'])await writeNative(token,app);
      const foreignProject=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Another project') returning id as result",[workspace,owner]);
      const foreignAsset=await scalar("insert into studio_assets(workspace_id,project_id,created_by,app_id,name) values($1,$2,$3,'wordcraft','Other private document') returning id as result",[workspace,foreignProject,owner]);
      await assert.rejects(scalar('select employee_begin_revision($1,$2,$3,null,$4) as result',[token,randomUUID(),foreignAsset,JSON.stringify(packageFor('wordcraft'))]),/not found/);
      await db.query('update studio_employee_tokens set employee_generation=employee_generation-1 where token_hash=$1',[token]);
      await assert.rejects(scalar('select studio_employee_scope($1) as result',[token]),/access denied/);
      await clean();
    });

    await t.test('one workspace job keeps uncertain runs fenced and permits only its own serial media child',async()=>{
      const first=await create(),second=await create();assert.equal((await claim(second.id)).claimed,false);
      const running=(await claim(first.id)).assignment;assert.equal((await claim(second.id)).claimed,false);
      const hash=await tokenFor(running,'b'.repeat(64));
      const request={operation:'generate',provider:'perflo',kind:'image',name:'Child image',inputs:[]};
      const makeMedia=(token=null)=>scalar('select to_jsonb(create_media_job($1,$2,$3,$4,$5,$6)) as result',[workspace,owner,project,randomUUID(),JSON.stringify(request),token]);
      const manual=await makeMedia(),child=await makeMedia(hash),otherChild=await makeMedia(hash);
      const mediaClaim=job=>scalar('select claim_media_job($1,$2,$3,$4) as result',[workspace,owner,job.id,'media-'+job.id]);
      assert.equal(await mediaClaim(manual),true);assert.equal((await row('select state from studio_media_jobs where id=$1',[manual.id])).state,'waiting_capacity');
      assert.equal(await mediaClaim(child),true);assert.equal((await row('select state from studio_media_jobs where id=$1',[child.id])).state,'preparing');
      await mediaClaim(otherChild);assert.equal((await row('select state from studio_media_jobs where id=$1',[otherChild.id])).state,'waiting_capacity');
      await db.query("update studio_media_jobs set instance_id='robyn-instance',budget_employee_id=$2 where id=$1",[child.id,employee]);
      assert.equal(await scalar('select reserve_media_charge($1,$2,$3,$4,1000000,100) as result',[workspace,owner,child.id,'media-'+child.id]),100);
      assert.equal(await scalar('select begin_media_dispatch($1,$2,$3,$4) as result',[workspace,owner,child.id,'media-'+child.id]),true);
      assert.equal(await mediaClaim(child),true,'parent lease does not block child polling');
      await db.query("update studio_assignments set state='failed',dispatch_state='uncertain' where id=$1",[first.id]);
      assert.equal((await claim(second.id)).claimed,false,'unknown old dispatch remains globally fenced');
      await db.query("update studio_media_jobs set state='uncertain',provider_job_id='known-child' where id=$1",[child.id]);
      assert.equal(await scalar('select settle_media_charge($1,$2,$3,$4,90,\'{"final":true}\') as result',[workspace,owner,child.id,'media-'+child.id]),true,'settlement remains independent of queue admission and token revocation');
      await clean();
      const manualImport=await scalar("insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,reserved_micros) values($1,$2,$3,$4,'import','commons','image','Free source','{}',0) returning to_jsonb(studio_media_jobs) as result",[workspace,project,owner,randomUUID()]);
      await mediaClaim(manualImport);assert.equal((await claim(second.id)).claimed,false,'free source imports occupy the same execution fence');
      await clean();
    });

    await t.test('browser return and budget continuation archive the old profile and rotate credentials',async()=>{
      const running=(await claim((await create()).id)).assignment;const hash=await tokenFor(running,'c'.repeat(64));
      const fence=await dispatch(running);const control=randomUUID();
      const browser=action=>scalar('select control_studio_research($1,$2,$3,$4,$5) as result',[workspace,owner,employee,control,action]);
      await browser('request');await assert.rejects(scalar('select studio_employee_scope($1) as result',[hash]),/access denied/);
      await browser('confirm');await browser('return');
      const queued=await row('select * from studio_assignments where id=$1',[running.id]);
      assert.equal(queued.workstation_profile,null);assert.equal(queued.browser_turns[0].profile,running.workstation_profile);
      const next=(await claim(running.id)).assignment;assert.notEqual(next.workstation_profile,running.workstation_profile);
      assert.equal(await scalar("select finish_studio_assignment($1,$2,$3,$4,$5,'response','completed','late',null) as result",fence),null);
      const nextFence=await dispatch(next);await tokenFor(next,'d'.repeat(64));
      assert.equal(await scalar("select pause_studio_assignment_budget($1,$2,$3,$4,$5,'response') as result",nextFence),true);
      assert.equal(await scalar('select resume_studio_assignment_budget($1,$2,$3,$4,$5) as result',nextFence),true);
      const resumed=await row('select * from studio_assignments where id=$1',[next.id]);
      assert.equal(resumed.budget_turns[0].profile,next.workstation_profile);assert.notEqual(resumed.workstation_profile,next.workstation_profile);
      await assert.rejects(scalar('select studio_employee_scope($1) as result',['d'.repeat(64)]),/access denied/);
      await clean();
    });

    await t.test('finish requires exact terminal evidence and native delivery while plans and unhinted answers stay text-capable',async()=>{
      for(const [hint,mode,expected] of [['wordcraft','work','failed'],[null,'draft','failed'],[null,'plan','awaiting_review'],[null,'work','awaiting_review']]){
        const task=await create(hint,mode),running=(await claim(task.id)).assignment;const fence=await dispatch(running);
        assert.equal(await scalar("select finish_studio_assignment($1,$2,$3,$4,$5,null,'completed','Unknown response',null) as result",fence),null);
        const finished=await scalar("select finish_studio_assignment($1,$2,$3,$4,$5,'response','completed','Useful answer',null) as result",fence);
        assert.equal(finished.state,expected);
        if(mode==='plan'){
          await db.query("update studio_assignments set state='running',dispatch_state='idle' where id=$1",[running.id]);
          const token=await tokenFor(running,'e'.repeat(64));
          await assert.rejects(scalar("select employee_create_asset($1,$2,'Plan must not produce','wordcraft') as result",[token,randomUUID()]),/planning only/);
          const existing=await scalar("select id as result from studio_assets where workspace_id=$1 and project_id=$2 and app_id='wordcraft' limit 1",[workspace,project]);
          await assert.rejects(scalar('select employee_begin_revision($1,$2,$3,null,$4) as result',[token,randomUUID(),existing,JSON.stringify(packageFor('wordcraft'))]),/planning only/);
          await db.query("update studio_assignments set state='awaiting_review' where id=$1",[running.id]);
          const review=await scalar("select review_studio_assignment($1,$2,$3,$4,'changes_requested','Make the outline clearer') as result",[workspace,owner,running.id,randomUUID()]);
          const follow=await row('select * from studio_assignments where id=$1',[review.followup_assignment_id]);
          assert.equal(follow.employee_id,employee);assert.equal(follow.execution_model,'robyn');assert.equal(follow.start_mode,'plan');assert.deepEqual(follow.allowed_app_ids,craftIds);
        }
        await clean();
      }
      for(const [delivered,expected] of [['wordcraft','failed'],['solidcraft','awaiting_review']]){
        const task=await create('solidcraft'),running=(await claim(task.id)).assignment,hash=await tokenFor(running,(delivered==='wordcraft'?'2':'3').repeat(64));
        await writeNative(hash,delivered);const fence=await dispatch(running);
        const finished=await scalar("select finish_studio_assignment($1,$2,$3,$4,$5,'response','completed','Saved editable result',null) as result",fence);
        assert.equal(finished.state,expected,'requested Craft requires its own native output');await clean();
      }
    });

    await t.test('owner budget recovery cannot retarget unknown operations or race a fixed managed-cap intent',async()=>{
      const operation=randomUUID(),lease=randomUUID(),request={monthlyLimitMicros:1000000,mode:'automatic'};
      const allocation=JSON.stringify({[employee]:1000000});
      const budgetClaim=(op=operation,key=lease,body=request)=>scalar('select claim_studio_budget_change($1,$2,$3,$4,$5,0,\'{}\') as result',[workspace,owner,op,JSON.stringify(body),key]);
      assert.equal((await budgetClaim()).claimed,true);
      await db.query("update studio_managed_budgets set lease_expires_at=now()-interval '1 hour' where workspace_id=$1",[workspace]);
      await assert.rejects(budgetClaim(randomUUID(),randomUUID()),/exact pending operation/);
      await assert.rejects(budgetClaim(operation,randomUUID(),{...request,monthlyLimitMicros:1}),/operation key reused/);
      const retry=randomUUID();assert.equal((await budgetClaim(operation,retry)).claimed,true);
      await assert.rejects(scalar("select stage_studio_budget_change($1,$2,$3,$4,1000000,'automatic',$5) as result",[workspace,owner,operation,retry,JSON.stringify({[employee]:500000})]),/invalid studio allocations/);
      await scalar("select stage_studio_budget_change($1,$2,$3,$4,1000000,'automatic',$5) as result",[workspace,owner,operation,retry,allocation]);
      await scalar("select finish_studio_budget_change($1,$2,$3,$4,'Lost provider reply') as result",[workspace,owner,operation,retry]);
      await assert.rejects(budgetClaim(randomUUID(),randomUUID()),/exact pending operation/);
      const recovered=randomUUID();await budgetClaim(operation,recovered);await scalar("select stage_studio_budget_change($1,$2,$3,$4,1000000,'automatic',$5) as result",[workspace,owner,operation,recovered,allocation]);
      await scalar('select finish_studio_budget_change($1,$2,$3,$4,null) as result',[workspace,owner,operation,recovered]);
      assert.equal((await budgetClaim()).saved,true);
      const nextOperation=randomUUID(),nextLease=randomUUID(),nextRequest={...request,expectedPolicyOperationId:operation};
      await assert.rejects(scalar("select claim_studio_budget_change($1,$2,$3,$4,$5,1000000,$6,null) as result",[workspace,owner,nextOperation,JSON.stringify(nextRequest),nextLease,allocation]),/request stale/);
      assert.equal((await scalar("select claim_studio_budget_change($1,$2,$3,$4,$5,1000000,$6,$7) as result",[workspace,owner,nextOperation,JSON.stringify(nextRequest),nextLease,allocation,operation])).claimed,true);
      const period=await scalar("select to_char(now() at time zone 'UTC','YYYY-MM') as result");const capLease=randomUUID();
      const capArgs=[workspace,employee,'robyn-instance',period,1000000,400000,1000000,capLease];
      const capClaim=values=>scalar('select claim_studio_budget_cap_sync($1,$2,$3,$4,$5,$6,$7,$8) as result',values);
      await assert.rejects(capClaim(capArgs),/update in progress/,'an owner update blocks rollover restoration');
      await scalar("select stage_studio_budget_change($1,$2,$3,$4,1000000,'automatic',$5) as result",[workspace,owner,nextOperation,nextLease,allocation]);
      await scalar('select finish_studio_budget_change($1,$2,$3,$4,null) as result',[workspace,owner,nextOperation,nextLease]);
      assert.equal(await scalar('select monthly_cap_micros as result from studio_employees where id=$1',[employee]),1000000);
      assert.equal(await scalar('select monthly_cap_micros as result from studio_employees where id=$1',[legacyTask.employee_id]),4000000);
      await assert.rejects(capClaim([...capArgs.slice(0,3),'2000-01',...capArgs.slice(4)]),/period or target/,'an expired period never authorizes a new PATCH');
      assert.equal((await capClaim(capArgs)).claimed,true);
      const again=await capClaim([...capArgs.slice(0,7),randomUUID()]);assert.equal(again.claimed,false);assert.equal(again.intent.leaseId,capLease);
      await assert.rejects(budgetClaim(randomUUID(),randomUUID()),/cap synchronization/);
      await assert.rejects(capClaim([...capArgs.slice(0,6),900000,randomUUID()]),/exact pending recovery/);
      assert.equal(await scalar("select finish_studio_budget_cap_sync($1,$2,$3,$4,$5,$6,$7,$8,'Network unknown') as result",capArgs),false);
      assert.ok((await row('select cap_sync from studio_managed_budgets where workspace_id=$1',[workspace])).cap_sync);
      assert.equal(await scalar('select finish_studio_budget_cap_sync($1,$2,$3,$4,$5,$6,$7,$8,null) as result',capArgs),true);
      assert.deepEqual(await row('select budget_cap_period,budget_cap_micros from studio_employees where id=$1',[employee]),{budget_cap_period:period,budget_cap_micros:1000000});
      // Simulate an exact persisted intent recovered after a later UTC month.
      const oldIntent={employeeId:employee,instanceId:'robyn-instance',period:'2000-01',monthlyLimitMicros:1000000,observedCapMicros:400000,targetCapMicros:1000000,leaseId:capLease};
      await db.query('update studio_managed_budgets set cap_sync=$2 where workspace_id=$1',[workspace,JSON.stringify(oldIntent)]);
      const oldArgs=[...capArgs.slice(0,3),'2000-01',...capArgs.slice(4)];
      assert.equal((await capClaim(oldArgs)).claimed,false,'old fixed intent is observation-only recovery');
      assert.equal(await scalar('select finish_studio_budget_cap_sync($1,$2,$3,$4,$5,$6,$7,$8,null) as result',oldArgs),true);
    });

    await t.test('owner provider writes remain at-most-once across expired leases and lost acknowledgements',async()=>{
      const prior=await scalar('select operation_id as result from studio_managed_budgets where workspace_id=$1',[workspace]);
      const period=await scalar("select to_char(now() at time zone 'UTC','YYYY-MM') as result");
      const operation=randomUUID(),firstLease=randomUUID(),request={monthlyLimitMicros:500000,mode:'automatic',expectedPolicyOperationId:prior};
      const ownerClaim=(op,lease,body,expected)=>scalar('select claim_studio_budget_change($1,$2,$3,$4,$5,1000000,$6,$7) as result',
        [workspace,owner,op,JSON.stringify(body),lease,JSON.stringify({[employee]:1000000}),expected]);
      assert.equal((await ownerClaim(operation,firstLease,request,prior)).claimed,true);
      const writeArgs=lease=>[workspace,owner,operation,lease,employee,'robyn-instance',period,1000000,500000];
      const writeClaim=args=>scalar('select claim_studio_budget_provider_write($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',args);
      const writeFinish=(lease,writeLease,error=null)=>scalar('select finish_studio_budget_provider_write($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',[...writeArgs(lease),writeLease,error]);
      const stage=lease=>scalar("select stage_studio_budget_change($1,$2,$3,$4,500000,'automatic',$5) as result",[workspace,owner,operation,lease,JSON.stringify({[employee]:500000})]);
      const finish=(lease,error=null)=>scalar('select finish_studio_budget_change($1,$2,$3,$4,$5) as result',[workspace,owner,operation,lease,error]);
      const intent=await writeClaim(writeArgs(firstLease));assert.equal(intent.claimed,true);assert.equal(intent.intent.monthlyLimitMicros,500000,'the target is bounded by the new frozen request before policy stage');
      await assert.rejects(stage(firstLease),/lease lost/,'policy cannot stage while its provider write is unresolved');
      await assert.rejects(finish(firstLease),/provider write unresolved/);
      assert.equal(await writeFinish(firstLease,firstLease,'Provider write acknowledgement lost'),false);
      assert.equal(await finish(firstLease,'Provider write acknowledgement lost'),true);
      await db.query("update studio_managed_budgets set lease_expires_at=now()-interval '1 hour' where workspace_id=$1",[workspace]);
      const newerOperation=randomUUID(),newerLease=randomUUID(),newerRequest={monthlyLimitMicros:300000,mode:'automatic',expectedPolicyOperationId:operation};
      await assert.rejects(ownerClaim(newerOperation,newerLease,newerRequest,operation),/cap synchronization/);
      const recoveredLease=randomUUID();assert.equal((await ownerClaim(operation,recoveredLease,request,prior)).claimed,true);
      const recovered=await writeClaim(writeArgs(recoveredLease));assert.equal(recovered.claimed,false);assert.equal(recovered.intent.leaseId,firstLease,'recovery can only observe the first write');
      await assert.rejects(writeClaim([...writeArgs(recoveredLease).slice(0,8),400000]),/exact pending recovery/);
      await assert.rejects(writeFinish(firstLease,firstLease),/lease lost/,'late first worker cannot settle a replacement owner lease');
      assert.equal(await writeFinish(recoveredLease,firstLease),true,'only positive target observation confirms the frozen write');
      const confirmed=await writeClaim(writeArgs(recoveredLease));assert.equal(confirmed.claimed,false);assert.equal(confirmed.intent.confirmed,true,'a lost provider-finish acknowledgement never grants another dispatch');
      await assert.rejects(ownerClaim(newerOperation,newerLease,newerRequest,operation),/cap synchronization/);
      await stage(recoveredLease);assert.equal(await finish(recoveredLease),true);
      assert.equal((await row('select cap_sync from studio_managed_budgets where workspace_id=$1',[workspace])).cap_sync,null);
      assert.equal((await ownerClaim(operation,randomUUID(),request,prior)).saved,true,'a lost owner-finish acknowledgement returns saved');
      assert.equal((await ownerClaim(newerOperation,newerLease,newerRequest,operation)).claimed,true);
      await assert.rejects(writeClaim(writeArgs(firstLease)),/lease lost/,'an older operation cannot authorize another write after a newer owner request');
      await assert.rejects(writeFinish(recoveredLease,firstLease),/lease lost/);
      const nextWrite=[workspace,owner,newerOperation,newerLease,employee,'robyn-instance',period,500000,300000];
      assert.equal((await writeClaim(nextWrite)).claimed,true);
      await scalar('select finish_studio_budget_provider_write($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null) as result',[...nextWrite,newerLease]);
      await scalar("select stage_studio_budget_change($1,$2,$3,$4,300000,'automatic',$5) as result",[workspace,owner,newerOperation,newerLease,JSON.stringify({[employee]:300000})]);
      await scalar('select finish_studio_budget_change($1,$2,$3,$4,null) as result',[workspace,owner,newerOperation,newerLease]);
    });

    await t.test('retirement snapshots retain ownership and become immutable before deletion',async()=>{
      const values=['historical-instance',workspace,legacyTask.employee_id,randomUUID(),{app_workspace:workspace,studio_employee:legacyTask.employee_id},{workspace_id:workspace,agent37_id:'historical-instance'}];
      await db.query("insert into studio_retired_workstations(instance_id,workspace_id,employee_id,operation_id,period,budget,usage,metadata,mirror,archive_sha256,archive_bytes) values($1,$2,$3,$4,'2026-10','{\"spent\":100}','{\"total\":100}',$5,$6,$7,32)",[...values,'f'.repeat(64)]);
      await assert.rejects(db.query("update studio_retired_workstations set usage='{}' where instance_id=$1",[values[0]]),/checkpoint immutable/);
      await db.query('update studio_retired_workstations set delete_started_at=now() where instance_id=$1',[values[0]]);
      await assert.rejects(db.query('update studio_retired_workstations set deleted_at=now() where instance_id=$1',[values[0]]),/check constraint/);
      await assert.rejects(db.query('update studio_retired_workstations set delete_started_at=null where instance_id=$1',[values[0]]),/deletion fenced/);
      await db.query("update studio_retired_workstations set deleted_at=now(),deletion_receipt='{\"confirmed\":true}' where instance_id=$1",[values[0]]);
      await assert.rejects(db.query("update studio_retired_workstations set deletion_receipt='{}' where instance_id=$1",[values[0]]),/receipt immutable/);
      await db.exec('set role service_role');await assert.rejects(db.query('delete from studio_retired_workstations'),/permission denied/);await db.exec('reset role');
    });
  }finally{await db.close();}
});
