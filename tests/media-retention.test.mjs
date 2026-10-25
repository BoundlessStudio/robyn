import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {studioDatabase} from "./helpers/database.mjs";
import {readMigrations,migrationQuery} from "../scripts/migrations.mjs";

test("search cleanup removes expired unreferenced records and preserves acquisition dependencies",async()=>{
  const db=await studioDatabase();
  const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  try{
    await db.exec(migrationQuery(await readMigrations(fileURLToPath(new URL('../supabase/migrations',import.meta.url)))));
    const owner=randomUUID(),outsider=randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[owner,outsider]);
    const workspace=await scalar("select initialize_studio($1,'[]') as value",[owner]);
    const project=await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Cleanup') returning id as value",[workspace,owner]);
    const discovery=async(expired)=>scalar("insert into studio_media_discoveries(workspace_id,project_id,provider,source_id,kind,metadata,expires_at) values($1,$2,'commons','123','image','{}',now()+$3::interval) returning id as value",[workspace,project,expired?'-1 day':'1 day']);
    const unused=await discovery(true),used=await discovery(true),fresh=await discovery(false);
    await db.query("insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,discovery_id,state,reserved_micros) values($1,$2,$3,$4,'import','commons','image','Keep','{}',$5,'uncertain',0)",[workspace,project,owner,randomUUID(),used]);
    await db.query("insert into studio_media_search_cache(workspace_id,provider,cache_key,results,expires_at) values($1,'commons','expired','[]',now()-interval '1 day')",[workspace]);
    const prune=who=>scalar("select prune_studio_media_search($1,$2) as value",[workspace,who]);
    await assert.rejects(prune(outsider),/not found/);
    assert.equal(await prune(owner),2);assert.equal(await prune(owner),0);
    const rows=(await db.query('select id from studio_media_discoveries order by id')).rows.map(r=>r.id);
    assert.deepEqual(rows,[used,fresh].sort());assert.ok(!rows.includes(unused));
    await db.exec('set role authenticated');await assert.rejects(prune(owner),/permission denied/);await db.exec('reset role');
  }finally{await db.close();}
});
