import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { readMigrations, migrationQuery } from "../scripts/migrations.mjs";
import { fileURLToPath } from "node:url";

test("cancelled paid jobs settle once without publication, while unpaid cancellation fences dispatch", async () => {
  const db = await studioDatabase();
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.value;
  try {
    await db.exec(migrationQuery(await readMigrations(fileURLToPath(new URL("../supabase/migrations", import.meta.url)))));
    const owner = randomUUID(), outsider = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [owner, outsider]);
    const workspace = await scalar("select initialize_studio($1,'[]') as value", [owner]);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Settlement') returning id as value", [workspace, owner]);
    const make = async state => scalar(`insert into studio_media_jobs(workspace_id,project_id,created_by,operation_id,operation,provider,kind,name,request,state,reserved_micros,workflow_id)
      values($1,$2,$3,$4,'generate','perflo','image','Test','{}',$5,420000,'worker') returning id as value`, [workspace, project, owner, randomUUID(), state]);
    const claim = (job, who = owner, run = "worker") => scalar("select claim_media_job($1,$2,$3,$4) as value", [workspace, who, job, run]);
    const settle = (job, amount, who = owner, run = "worker") => scalar("select settle_media_charge($1,$2,$3,$4,$5,$6) as value", [workspace, who, job, run, amount, JSON.stringify({runId:"run_known",chargeIsFinal:true})]);
    const dispatch = job => scalar("select begin_media_dispatch($1,$2,$3,'worker') as value", [workspace, owner, job]);
    const cancel = job => scalar("select to_jsonb(cancel_unpaid_media_job($1,$2,$3)) as value", [workspace, owner, job]);
    const cancelled = await make("cancelled");
    const health = error => scalar("select record_studio_workflow_health($1,$2,'media',$3,'worker',$4,30) as value",[workspace,owner,cancelled,error]);
    assert.equal(await health("platform_unavailable"),1);
    assert.equal(await health("platform_unavailable"),2);
    await assert.rejects(health("private-provider-detail"),/invalid diagnostic/);
    assert.equal(await health(null),0);
    await db.query("update studio_projects set status='archived' where id=$1", [project]);
    assert.equal(await claim(cancelled), true, "publication revocation does not block settlement");
    assert.equal(await claim(cancelled, owner, "competing-worker"), false);
    await assert.rejects(claim(cancelled, outsider), /not found/);
    await assert.rejects(settle(cancelled, 420000, owner, "stale-worker"), /not found/);
    assert.equal(await settle(cancelled, 420000), true);
    assert.equal(await settle(cancelled, 420000), true);
    await assert.rejects(settle(cancelled, 0), /settlement already recorded/);
    assert.deepEqual((await db.query("select state,billing_settled,actual_micros,asset_id from studio_media_jobs where id=$1", [cancelled])).rows[0], {state:"cancelled",billing_settled:true,actual_micros:420000,asset_id:null});
    assert.equal(await dispatch(cancelled), false);
    await assert.rejects(scalar("select prepare_media_package($1,$2,$3,'{}','{}') as value", [workspace, owner, cancelled]), /not ready/);
    await db.query("update studio_projects set status='active' where id=$1", [project]);
    const unpaid = await make("waiting_budget");
    assert.equal((await cancel(unpaid)).actual_micros, 0);
    assert.equal((await cancel(unpaid)).state, "cancelled");
    assert.equal(await dispatch(unpaid), false);
    const race = await make("preparing");
    assert.equal(await dispatch(race), true);
    await assert.rejects(cancel(race), /already dispatched/);
    assert.equal(await dispatch(race), false, "a second dispatcher cannot pay");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(settle(cancelled,420000), /permission denied/);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});
