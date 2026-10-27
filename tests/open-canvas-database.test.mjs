import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {studioDatabase} from './helpers/database.mjs';

test('starting intent is owned, immutable on retry, planning cannot produce, and feedback preserves the boundary',async()=>{
  const db=await studioDatabase();
  const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
  try{
    for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const owner=randomUUID(),other=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);await db.exec('set role service_role');
    const profiles=[{key:'director',kind:'director',role:'Director',version:'1',instructions:'Plan.'},{key:'wordcraft',kind:'specialist',appId:'wordcraft',role:'Writer',version:'1',instructions:'Write.'}];
    const workspace=await scalar('select initialize_studio($1,$2) as result',[owner,JSON.stringify(profiles)]);
    const employees=(await db.query('select * from studio_employees where workspace_id=$1',[workspace])).rows;
    const director=employees.find(e=>e.kind==='director'),specialist=employees.find(e=>e.kind==='specialist');
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Untitled project') returning id as result",[workspace,owner]);
    const key=randomUUID(),brief='A guide for a community garden.';
    const args=[workspace,owner,project,director.id,key,brief,'[]'];
    const create=(mode,values=args)=>scalar('select create_studio_start_assignment($1,$2,$3,$4,$5,$6,$7,$8) as result',[...values,mode]);
    const plan=await create('plan');assert.equal(plan.start_mode,'plan');assert.equal((await create('plan')).id,plan.id);
    for(const mode of ['draft','work'])await assert.rejects(create(mode),/operation key reused/);
    await assert.rejects(create('plan',[workspace,other,project,director.id,randomUUID(),brief,'[]']),/not found/);
    await assert.rejects(create('draft',[workspace,owner,project,specialist.id,randomUUID(),brief,'[]']),/requires Director/);
    assert.equal(await scalar('select brief as result from studio_projects where id=$1',[project]),brief);
    await db.query("update studio_projects set brief='' where id=$1",[project]);
    await create('plan');
    assert.equal(await scalar('select brief as result from studio_projects where id=$1',[project]),'','reconnecting a brief must not overwrite a later project edit');
    await db.query('insert into agents(workspace_id,agent37_id) values($1,$2)',[workspace,director.id]);
    await db.query("update studio_employees set instance_id=id,provision_state='ready' where id=$1",[director.id]);
    await db.query("update studio_assignments set state='running' where id=$1",[plan.id]);
    const token='a'.repeat(64);await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')",[plan.id,director.id,token]);
    assert.equal((await scalar('select studio_employee_scope($1) as result',[token])).startMode,'plan');
    const steps=[{key:'draft',appId:'wordcraft',brief:'Make the guide',dependsOn:[],inputs:[],final:true}];
    await assert.rejects(scalar('select director_create_campaign($1,$2,$3) as result',[token,randomUUID(),JSON.stringify(steps)]),/planning only/);
    await assert.rejects(db.query("insert into studio_media_jobs(workspace_id,project_id,created_by,assignment_id,employee_id,operation_id,operation,provider,kind,name,request,reserved_micros) values($1,$2,$3,$4,$5,$6,'generate','perflo','image','Image','{}',1)",[workspace,project,owner,plan.id,director.id,randomUUID()]),/planning only/);
    await db.query("update studio_assignments set state='awaiting_review' where id=$1",[plan.id]);
    const review=await scalar("select review_studio_assignment($1,$2,$3,$4,'changes_requested','Consider a younger audience') as result",[workspace,owner,plan.id,randomUUID()]);
    assert.equal(await scalar('select start_mode as result from studio_assignments where id=$1',[review.followup_assignment_id]),'plan');
    const draft=await create('draft',[workspace,owner,project,director.id,randomUUID(),brief,'[]']);assert.equal(draft.start_mode,'draft');
    for(const role of ['anon','authenticated'])for(const signature of ['create_studio_start_assignment(uuid,uuid,uuid,uuid,uuid,text,jsonb,text)','begin_studio_blank(uuid,uuid,uuid,uuid,text,text,text,jsonb)'])assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') as result",[role,signature]),false);

    const asset=randomUUID(),pkg={files:[{path:'Untitled.docx',role:'master',mimeType:'application/octet-stream',bytes:32,sha256:'b'.repeat(64)}],dependencies:[],message:'Started a blank document'};
    const blank=(app='wordcraft',template='wordcraft:1',value=pkg,user=owner)=>scalar('select begin_studio_blank($1,$2,$3,$4,$5,$6,$7,$8) as result',[workspace,user,project,asset,app,'Untitled document',template,JSON.stringify(value)]);
    const revision=await blank();assert.equal(await blank(),revision,'lost creation reply reuses the initial revision');
    await assert.rejects(blank('wordcraft','wordcraft:1',pkg,other),/not found/);
    await assert.rejects(blank('gridcraft'),/identity reused/);
    await assert.rejects(blank('wordcraft','wordcraft:2'),/identity reused/);
    await assert.rejects(blank('wordcraft','wordcraft:1',{...pkg,files:[{...pkg.files[0],sha256:'c'.repeat(64)}]}),/identity reused/);
    const verified=await scalar("select jsonb_agg(jsonb_build_object('id',id,'bytes',bytes)) as result from studio_package_files where revision_id=$1",[revision]);
    const committed=await scalar('select commit_studio_revision($1,$2,$3,$4) as result',[workspace,owner,revision,JSON.stringify(verified)]);assert.equal(committed.status,'committed');
    await db.query("update studio_assets set name='Renamed work' where id=$1",[asset]);
    assert.equal(await blank(),revision,'a lost commit acknowledgement preserves a renamed document');
    assert.equal(await scalar('select count(*)::int as result from studio_revisions where asset_id=$1',[asset]),1);
    await assert.rejects(db.query("insert into studio_revisions(workspace_id,asset_id,assignment_id,author_employee_id) values($1,$2,$3,$4)",[workspace,asset,plan.id,director.id]),/planning only/);
  }finally{await db.close();}
});
