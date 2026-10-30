import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readMigrations, migrationQuery } from "../scripts/migrations.mjs";
import { studioDatabase } from "./helpers/database.mjs";

test("budget waits release media slots for Commons and reacquire capacity atomically without losing holds", async () => {
  const db = await studioDatabase();
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.result;
  try {
    // Historical three-worker admission. Current one-workstation serialization
    // and same-assignment media children are covered by robyn-workstation-database.
    const migrations=await readMigrations(fileURLToPath(new URL("../supabase/migrations", import.meta.url)));
    await db.exec(migrationQuery(migrations.filter(m=>m.filename<="0027_workstation_release_upgrades.sql")));
    const owner = randomUUID(), outsider = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [owner, outsider]);
    await db.exec("set role service_role");
    const workspace = await scalar("select initialize_studio($1,$2) as result", [owner, JSON.stringify([{key:"director",kind:"director",appId:null,role:"Director",version:"1",instructions:"Direct"}])]);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Capacity') returning id as result", [workspace, owner]);
    await db.query("insert into agents(workspace_id,agent37_id) values($1,'media-director')", [workspace]);
    const director = await scalar("update studio_employees set instance_id='media-director',provision_state='ready' where workspace_id=$1 returning id as result", [workspace]);
    const discovery = await scalar("insert into studio_media_discoveries(workspace_id,project_id,provider,source_id,kind,metadata,expires_at) values($1,$2,'commons','123','image','{}',now()+interval '1 hour') returning id as result", [workspace, project]);
    const generation = {operation:"generate",provider:"perflo",kind:"image",name:"Waiting image",service:"blockrun-image-gen",prompt:"Ocean",inputs:[]};
    const stock = {operation:"import",provider:"commons",kind:"image",name:"Free image",discoveryId:discovery,inputs:[]};
    const create = (request, operation = randomUUID()) => scalar("select to_jsonb(create_media_job($1,$2,$3,$4,$5)) as result", [workspace, owner, project, operation, JSON.stringify(request)]);
    const reserve = (job, available = 1000000, user = owner, workflow = job.id) => scalar("select reserve_media_charge($1,$2,$3,$4,$5,60000) as result", [workspace, user, job.id, workflow, available]);
    const read = job => scalar("select to_jsonb(j) as result from studio_media_jobs j where id=$1", [job.id]);
    const waiters = [];
    for (let i = 0; i < 3; i++) {
      const job = await create(generation);
      await scalar("select claim_media_job($1,$2,$3,$4) as result", [workspace, owner, job.id, job.id]);
      await db.query("update studio_media_jobs set instance_id='media-director',budget_employee_id=$2 where id=$1", [job.id, director]);
      assert.equal(await reserve(job, 0), 0);
      assert.equal((await read(job)).state, "waiting_budget");
      waiters.push(job);
    }
    const operation = randomUUID(), imported = await create(stock, operation);
    assert.equal((await create(stock, operation)).id, imported.id);
    assert.equal(await scalar("select claim_media_job($1,$2,$3,'commons-workflow') as result", [workspace, owner, imported.id]), true);
    // Two generation jobs can resume alongside the free import; the third waits.
    assert.deepEqual(await Promise.all(waiters.map(job => reserve(job))), [60000,60000,0]);
    assert.equal((await read(waiters[2])).state, "waiting_capacity");
    await assert.rejects(create(stock), /media capacity reached/);
    await assert.rejects(reserve(waiters[2], 1000000, outsider), /not found/);
    await assert.rejects(reserve(waiters[2], 1000000, owner, "stale-workflow"), /not found/);
    assert.equal((await read(waiters[2])).reserved_micros, 0);
    // An uncertain paid outcome frees an execution slot but retains its hold,
    // including across a billing period boundary.
    await db.query("update studio_media_jobs set state='uncertain',created_at=now()-interval '40 days',provider_job_id='same-paid-task' where id=$1", [waiters[0].id]);
    assert.equal(await reserve(waiters[2], 170000), 0, "two unsettled holds still reduce available allowance");
    assert.equal((await read(waiters[2])).state, "waiting_budget");
    assert.equal(await reserve(waiters[2], 180000), 60000);
    assert.equal((await read(waiters[0])).provider_job_id, "same-paid-task");
    assert.equal((await read(waiters[0])).reserved_micros, 60000);
    assert.equal((await read(waiters[0])).billing_settled, false);
    assert.equal((await create(generation, waiters[2].operation_id)).id, waiters[2].id);
    // Publishing the free acquisition follows the real package/commit path.
    await db.query("update studio_media_jobs set state='processing',actual_micros=0,billing_settled=true where id=$1", [imported.id]);
    const pkg = {files:[{path:"original/source.png",role:"master",mimeType:"image/png",bytes:20,sha256:"a".repeat(64)}]};
    const ref = await scalar("select prepare_media_package($1,$2,$3,$4,$5) as result", [workspace, owner, imported.id, JSON.stringify(pkg), JSON.stringify({provider:"commons",license:"CC0"})]);
    const verified = (await db.query("select id,bytes from studio_package_files where revision_id=$1", [ref.revisionId])).rows;
    await scalar("select complete_media_job($1,$2,$3,$4) as result", [workspace, owner, imported.id, JSON.stringify(verified)]);
    assert.equal((await read(imported)).state, "completed");
  } finally { await db.close(); }
});
