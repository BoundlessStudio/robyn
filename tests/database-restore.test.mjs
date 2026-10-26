import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {studioDatabase} from './helpers/database.mjs';
import {readMigrations,migrationQuery} from '../scripts/migrations.mjs';

test('isolated database restore preserves exact references, ownership and uncertain external-action fences',async()=>{
  let db=await studioDatabase();const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  try{
    const migrations=await readMigrations(fileURLToPath(new URL('../supabase/migrations',import.meta.url)));
    await db.exec(migrationQuery(migrations));
    const owner=randomUUID(),outsider=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,outsider]);
    const workspace=await scalar('select initialize_studio($1,$2) as value',[owner,JSON.stringify([{key:'research',kind:'specialist',appId:'research',role:'Researcher',version:'1',instructions:'Research'}])]);
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Isolated restore') returning id as value",[workspace,owner]);
    const research=await scalar("insert into studio_assets(workspace_id,project_id,app_id,name,created_by) values($1,$2,'research','Cited notebook',$3) returning id as value",[workspace,project,owner]);
    const native=await scalar("insert into studio_assets(workspace_id,project_id,app_id,name,created_by) values($1,$2,'vectorcraft','Native fixture',$3) returning id as value",[workspace,project,owner]);
    const bytes=Buffer.from('# Research\n\nSource: https://example.org/\n'),digest=createHash('sha256').update(bytes).digest('hex');
    const packageFor=(path,dependencies=[])=>JSON.stringify({files:[{path,role:'master',mimeType:'text/plain',bytes:bytes.length,sha256:digest}],dependencies,message:'Restore fixture'});
    const begin=(asset,pkg)=>scalar('select begin_studio_revision($1,$2,$3,null,$4) as value',[workspace,owner,asset,pkg]);
    const commit=async revision=>scalar('select commit_studio_revision($1,$2,$3,$4) as value',[workspace,owner,revision,JSON.stringify((await db.query('select id,bytes from studio_package_files where revision_id=$1',[revision])).rows)]);
    const notebook=await begin(research,packageFor('notebook.md'));await commit(notebook);
    const exact={assetId:research,revisionId:notebook};
    const revision=await begin(native,packageFor('master.vectorcraft',[exact]));
    const conflict=await begin(native,packageFor('master.vectorcraft',[exact]));
    await commit(revision);assert.equal((await commit(conflict)).status,'conflict');
    await db.query("insert into agents(workspace_id,agent37_id) values($1,'restore-instance')",[workspace]);
    const employee=await scalar("update studio_employees set instance_id='restore-instance',provision_state='ready' where workspace_id=$1 returning id as value",[workspace]);
    const assignment=await scalar("select to_jsonb(create_studio_assignment($1,$2,$3,$4,$5,'Continue the exact notebook',$6)) as value",[workspace,owner,project,employee,randomUUID(),JSON.stringify([exact])]);
    await scalar("select bind_studio_assignment_workflow($1,$2,$3,'restore-workflow') as value",[workspace,owner,assignment.id]);
    const claimed=await scalar('select claim_studio_assignment($1,$2,$3) as value',[workspace,owner,assignment.id]);
    const fence=[workspace,owner,assignment.id,'restore-workflow',claimed.assignment.run_attempt];
    assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as value',fence),true);
    await db.query("update studio_assignments set dispatch_state='uncertain' where id=$1",[assignment.id]);
    for(const [state,settled] of [['completed',true],['cancelled',false]])await db.query(`insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,state,reserved_micros,actual_micros,billing_settled,provider_job_id,provider_metadata)
      values($1,$2,$3,$4,'generate','perflo','image','Receipt fixture','{}',$5,420000,$6,$7,'known-task',$8)`,[workspace,project,owner,randomUUID(),state,settled?420000:null,settled,JSON.stringify({runId:'known-task',chargeIsFinal:settled})]);
    const tables=['studio_assets','studio_revisions','studio_package_files','studio_revision_dependencies','studio_assignments','studio_assignment_inputs','studio_media_jobs'];
    const snapshotRows=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`select to_jsonb(t) as value from ${table} t order by to_jsonb(t)::text`)).rows])));
    const before=await snapshotRows();const snapshot=await db.dumpDataDir();await db.close();db=new PGlite({loadDataDir:snapshot});
    assert.deepEqual(await snapshotRows(),before);await db.exec(migrationQuery(migrations));assert.deepEqual(await snapshotRows(),before,'setup is unchanged after restore');
    const file=(await db.query('select * from studio_package_files where revision_id=$1',[notebook])).rows[0];assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(file.bytes,bytes.length);
    assert.equal(await scalar('select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as value',fence),false,'restoring a pending dispatch never authorizes another turn');
    await assert.rejects(scalar('select claim_studio_assignment($1,$2,$3) as value',[workspace,outsider,assignment.id]),/not found/);
    for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from studio_package_files'),/permission denied/);await db.exec('reset role');}
    const held=(await db.query("select state,billing_settled,reserved_micros,provider_job_id from studio_media_jobs where state='cancelled'")).rows[0];assert.deepEqual(held,{state:'cancelled',billing_settled:false,reserved_micros:420000,provider_job_id:'known-task'});
  }finally{await db.close();}
});
