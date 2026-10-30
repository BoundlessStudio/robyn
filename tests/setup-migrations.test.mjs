import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readMigrations, migrationQuery, runMigrations } from "../scripts/migrations.mjs";
import { studioDatabase } from "./helpers/database.mjs";

const directory = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
const migration = (filename, sql) => ({ filename, sql, checksum: createHash("sha256").update(sql).digest("hex") });
const functions = async db => (await db.query(`select oid::regprocedure::text as name, pg_get_functiondef(oid) as definition, proacl::text as grants
  from pg_proc where pronamespace='public'::regnamespace order by 1`)).rows;
const snapshot = async db => ({
  functions: await functions(db),
  grants: (await db.query(`select relname,relacl::text,relrowsecurity from pg_class where relnamespace='public'::regnamespace order by relname`)).rows,
  employees: (await db.query("select * from studio_employees order by id")).rows,
  budgets: (await db.query("select * from studio_managed_budgets order by workspace_id")).rows,
  projects: (await db.query("select * from studio_projects order by id")).rows,
});
function retainedRows(before,after) {
  for(const row of before){
    const retained=after.find(next=>next.id?next.id===row.id:next.workspace_id===row.workspace_id);
    assert.ok(retained,"A historical row must remain present");
    assert.deepEqual(Object.fromEntries(Object.keys(row).map(key=>[key,retained[key]])),row);
  }
}
function canonicalCutover(before,after) {
  retainedRows(before,after);
  for(const old of before)assert.ok(after.find(row=>row.id===old.id).retired_at);
  const current=after.filter(row=>!row.retired_at);
  assert.equal(current.length,1);assert.equal(current[0].employee_key,"robyn");assert.equal(current[0].monthly_cap_micros,0);
  assert.ok(!before.some(old=>old.id===current[0].id));
}
async function seed(db) {
  const owner = randomUUID();
  await db.query("insert into auth.users(id) values($1)", [owner]);
  const workspace = (await db.query("select initialize_studio($1,$2) as id", [owner, JSON.stringify([{ key: "director", kind: "director", appId: null, role: "Director", version: "1", instructions: "Direct" }])])).rows[0].id;
  await db.query("update studio_employees set monthly_cap_micros=1234567 where workspace_id=$1", [workspace]);
  await db.query("insert into studio_managed_budgets(workspace_id,monthly_limit_micros,allocation_mode,sync_state,operation_id,pending_request) values($1,1234567,'custom','synced',$2,'{}')", [workspace, randomUUID()]);
  await db.query("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Retained project')", [workspace, owner]);
}

test("setup applies only a checked suffix, preserves upgraded functions/data/grants, and rolls back failed upgrades", async () => {
  const db = await studioDatabase();
  try {
    const migrations = await readMigrations(directory);
    const prefix = migrations.filter(m => m.filename <= "0017_budget_queue_slots.sql");
    await db.exec(migrationQuery(prefix));
    await seed(db);
    const beforeUpgrade = await snapshot(db);
    await db.exec(migrationQuery(migrations));
    canonicalCutover(beforeUpgrade.employees,(await snapshot(db)).employees);
    const beforeReplay = await snapshot(db);
    await db.exec(migrationQuery(migrations));
    assert.deepEqual(await snapshot(db), beforeReplay);
    assert.match(beforeReplay.functions.find(f => f.name === "claim_studio_assignment(uuid,uuid,uuid)").definition, /execution_model/);
    const ledger = (await db.query("select * from robyn_setup.migrations order by filename")).rows;
    assert.equal(ledger.length, migrations.length);
    assert.equal(ledger.filter(row => row.filename.startsWith("0007_")).length, 2);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from robyn_setup.migrations"), /permission denied/);
      await db.exec("reset role");
    }
    await assert.rejects(db.exec(migrationQuery([{ ...migrations[0], checksum: "changed" }, ...migrations.slice(1)])), /Checksum mismatch/);
    await assert.rejects(db.exec(migrationQuery(migrations.slice(1))), /missing from this checkout/);
    await assert.rejects(db.exec(migrationQuery([migrations[0], migration("0001_late.sql", "select 1;"), ...migrations.slice(1)])), /out-of-order/);
    const badUpgrade = [...migrations,
      migration("9000_regression.sql", "create or replace function public.claim_studio_assignment(p_workspace uuid,p_user uuid,p_assignment uuid) returns jsonb language sql as 'select null::jsonb';"),
      migration("9001_failure.sql", "select nonexistent_migration_function();")];
    await assert.rejects(db.exec(migrationQuery(badUpgrade)), /Migration 9001_failure.sql failed/);
    assert.deepEqual(await snapshot(db), beforeReplay, "no partial function downgrade or data change survives");
    assert.deepEqual((await db.query("select * from robyn_setup.migrations order by filename")).rows, ledger);
  } finally { await db.close(); }
});

test("legacy baselining never replays SQL and a committed setup with a lost acknowledgement is safe to retry", async () => {
  const db = await studioDatabase();
  try {
    const migrations = await readMigrations(directory);
    const baseline = "0017_budget_queue_slots.sql";
    const prefix = migrations.filter(m => m.filename <= baseline);
    for (const file of prefix) await db.exec(file.sql);
    await seed(db);
    const before = await snapshot(db);
    await assert.rejects(db.exec(migrationQuery(migrations)), /Existing database has no migration history/);
    assert.deepEqual(await snapshot(db), before, "legacy preflight fails before older SQL runs");
    assert.throws(() => migrationQuery(migrations, "0007"), /exact migration file/);
    await db.exec(migrationQuery(prefix, baseline));
    assert.deepEqual(await snapshot(db), before, "baseline changes only the private ledger");
    let calls = 0;
    await runMigrations(async (method, endpoint, { query }) => {
      assert.equal(method, "POST"); assert.equal(endpoint, "/v1/projects/test/database/query");
      await db.exec(query);
      if (++calls === 1) throw Object.assign(new Error("Acknowledgement lost after commit"), { status: 503 });
    }, "test", { directory, baseline, sleep: async () => {} });
    assert.equal(calls, 2);
    const after = await snapshot(db);
    retainedRows(before.budgets,after.budgets);
    assert.deepEqual(after.projects, before.projects);
    canonicalCutover(before.employees,after.employees);
    assert.match(after.functions.find(f => f.name === "claim_studio_assignment(uuid,uuid,uuid)").definition,/execution_model/);
    const ledger = (await db.query("select filename,baselined from robyn_setup.migrations order by filename")).rows;
    assert.equal(ledger.filter(row => row.baselined).length, prefix.length);
    assert.equal(ledger.length, migrations.length);
    await db.exec(migrationQuery(migrations));
    assert.deepEqual(await snapshot(db), after);
  } finally { await db.close(); }
});
