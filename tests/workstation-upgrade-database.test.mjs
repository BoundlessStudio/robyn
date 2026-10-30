// Historical multi-employee regression fixture: the forward migration 0028 and
// current canonical contracts are covered in robyn-workstation-database.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("workstation upgrades enforce ownership, idle generations, once-only dispatch, and uncertain outcome fences", async () => {
  const db = new PGlite();
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0]?.result;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,invited_at timestamptz,confirmation_sent_at timestamptz,recovery_sent_at timestamptz);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      grant usage on schema auth to service_role; grant select on auth.users to service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
      grant all on storage.objects to anon,authenticated,service_role;`);
    for (const name of (await fs.readdir(new URL("../supabase/migrations", import.meta.url))).filter(name=>name.endsWith(".sql") && name<"0028_").sort()) {
      await db.exec(await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from studio_workstation_upgrades"), /permission denied/);
      await assert.rejects(db.query("select claim_studio_workstation_upgrade(null,null,null,null,null,null,null,null,null,null)"), /permission denied/);
      await assert.rejects(db.query("select dispatch_studio_workstation_upgrade(null,null,null,null,null,null,null,null)"), /permission denied/);
      await assert.rejects(db.query("select finish_studio_workstation_upgrade(null,null,null,null,null,null)"), /permission denied/);
      await db.exec("reset role");
    }
    const users = [randomUUID(), randomUUID()]; await db.query("insert into auth.users(id) values($1),($2)", users);
    await db.exec("set role service_role");
    const profiles = [
      { key: "cadcraft", kind: "specialist", appId: "cadcraft", role: "CAD designer", version: "1", instructions: "Create editable work." },
      { key: "director", kind: "director", appId: null, role: "Director", version: "1", instructions: "Coordinate." },
    ];
    const workspace = await scalar("select initialize_studio($1,$2) as result", [users[0], JSON.stringify(profiles)]);
    const foreignWorkspace = await scalar("select initialize_studio($1,$2) as result", [users[1], JSON.stringify(profiles)]);
    const employee = await scalar("select id as result from studio_employees where workspace_id=$1 and kind='specialist'", [workspace]);
    const director = await scalar("select id as result from studio_employees where workspace_id=$1 and kind='director'", [workspace]);
    const foreignEmployee = await scalar("select id as result from studio_employees where workspace_id=$1 and kind='specialist'", [foreignWorkspace]);
    const instance = "persistent-workstation"; const from = "robyn-cadcraft-old@1";
    const target = "robyn-cadcraft-new@2"; const digest = `sha256:${"b".repeat(64)}`;
    const nextTarget = "robyn-cadcraft-next@1"; const nextDigest = `sha256:${"c".repeat(64)}`;
    await db.query("insert into agents(workspace_id,agent37_id,template,name,cpu,memory,disk) values($1,$2,$3,'Original name',4,8,20)", [workspace, instance, from]);
    await db.query("insert into agents(workspace_id,agent37_id,template) values($1,'director-workstation','agent37-hermes')", [workspace]);
    await db.query("update studio_employees set instance_id=$2,provision_state='ready',monthly_cap_micros=123456 where id=$1", [employee, instance]);
    await db.query("update studio_employees set instance_id='director-workstation',provision_state='ready' where id=$1", [director]);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Project') returning id as result", [workspace, users[0]]);
    const assignment = await scalar("select create_studio_assignment($1,$2,$3,$4,$5,'Create a model.','[]') as result", [workspace, users[0], project, employee, randomUUID()]);
    const workflow = "upgrade-test";
    await scalar("select bind_studio_assignment_workflow($1,$2,$3,$4) as result", [workspace, users[0], assignment.id, workflow]);
    const claimed = await scalar("select claim_studio_assignment($1,$2,$3) as result", [workspace, users[0], assignment.id]);
    const attempt = claimed.assignment.run_attempt;
    const claim = (overrides = {}) => {
      const p = { workspace, user: users[0], employee, instance, assignment: assignment.id, workflow, attempt, from, target, digest, ...overrides };
      return scalar("select claim_studio_workstation_upgrade($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result",
        [p.workspace, p.user, p.employee, p.instance, p.assignment, p.workflow, p.attempt, p.from, p.target, p.digest]);
    };
    const dispatch = (upgrade, overrides = {}) => {
      const p = { workspace, user: users[0], employee, instance, assignment: assignment.id, workflow, attempt, ...overrides };
      return scalar("select dispatch_studio_workstation_upgrade($1,$2,$3,$4,$5,$6,$7,$8) as result",
        [p.workspace, p.user, p.employee, p.instance, upgrade.id, p.assignment, p.workflow, p.attempt]);
    };
    const finish = (overrides = {}) => {
      const p = { workspace, user: users[0], employee, instance, target, digest, ...overrides };
      return scalar("select finish_studio_workstation_upgrade($1,$2,$3,$4,$5,$6) as result",
        [p.workspace, p.user, p.employee, p.instance, p.target, p.digest]);
    };
    const aiDispatch = () => scalar("select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result", [workspace, users[0], assignment.id, workflow, attempt]);
    for (const overrides of [{ user: users[1] }, { employee: foreignEmployee }, { instance: "foreign" }, { employee: director, instance: "director-workstation" }]) {
      await assert.rejects(claim(overrides), /not found/);
    }
    await assert.rejects(db.query("update agents set workspace_id=$2 where agent37_id=$1", [instance, foreignWorkspace]), /foreign key constraint/);
    await db.query("update agents set template='unrelated@1' where agent37_id=$1", [instance]);
    await assert.rejects(claim(), /workstation mirror mismatch/);
    await db.query("update agents set template=$2 where agent37_id=$1", [instance, from]);
    assert.equal(await claim({ attempt: randomUUID() }), null);
    assert.equal(await claim({ workflow: "stale-workflow" }), null);
    await db.query("update studio_employees set assignment_generation=assignment_generation+1 where id=$1", [employee]);
    assert.equal(await claim(), null);
    await db.query("update studio_employees set assignment_generation=assignment_generation-1 where id=$1", [employee]);
    for (const state of ["dispatching", "dispatched", "uncertain"]) {
      await db.query("update studio_assignments set dispatch_state=$2 where id=$1", [assignment.id, state]);
      assert.equal(await claim(), null);
    }
    await db.query("update studio_assignments set dispatch_state='idle',browser_paused=true where id=$1", [assignment.id]);
    assert.equal(await claim(), null);
    await db.query("update studio_assignments set browser_paused=false,budget_paused=true where id=$1", [assignment.id]);
    assert.equal(await claim(), null);
    await db.query("update studio_assignments set budget_paused=false where id=$1", [assignment.id]);
    await db.query("update studio_employees set browser_control='human' where id=$1", [employee]);
    assert.equal(await claim(), null);
    await db.query("update studio_employees set browser_control='agent' where id=$1", [employee]);
    await db.query("update studio_projects set status='archived' where id=$1", [project]);
    assert.equal(await claim(), null);
    await db.query("update studio_projects set status='active' where id=$1", [project]);
    const upgrade = await claim(); assert.equal(upgrade.state, "pending");
    assert.equal((await claim()).id, upgrade.id);
    const next = await claim({ target: nextTarget, digest: nextDigest }); assert.equal(next.state, "pending");
    assert.equal(await scalar("select state as result from studio_workstation_upgrades where id=$1", [upgrade.id]), "superseded");
    assert.equal((await claim()).id, upgrade.id); // Safe reactivation: no request was dispatched.
    assert.equal(await dispatch(upgrade, { attempt: randomUUID() }), false);
    for (const overrides of [{ user: users[1] }, { employee: director, instance: "director-workstation" }]) {
      await assert.rejects(dispatch(upgrade, overrides), /not found/);
      await assert.rejects(finish(overrides), /not found/);
    }
    await db.query("update studio_employees set assignment_generation=assignment_generation+1 where id=$1", [employee]);
    assert.equal(await dispatch(upgrade), false);
    await db.query("update studio_employees set assignment_generation=assignment_generation-1 where id=$1", [employee]);
    await db.query("update studio_assignments set dispatch_state='uncertain' where id=$1", [assignment.id]);
    assert.equal(await dispatch(upgrade), false);
    await db.query("update studio_assignments set dispatch_state='idle' where id=$1", [assignment.id]);
    assert.equal(await dispatch(upgrade), true); assert.equal(await dispatch(upgrade), false);
    await db.query("update studio_workstation_upgrades set created_at=now()-interval '30 days',dispatched_at=now()-interval '30 days' where id=$1", [upgrade.id]);
    assert.equal((await claim()).state, "dispatched"); assert.equal(await dispatch(upgrade), false);
    await assert.rejects(claim({ target: nextTarget, digest: nextDigest }), /outcome uncertain/);
    await assert.rejects(finish({ target: nextTarget, digest: nextDigest }), /outcome uncertain/);
    await db.query("update studio_employees set provision_state='ready' where id=$1", [employee]);
    assert.equal(await aiDispatch(), false); // Readiness cannot bypass an outstanding image request.
    const mirrorBefore = await scalar("select to_jsonb(a) as result from agents a where agent37_id=$1", [instance]);
    assert.equal(await finish(), true); assert.equal(await finish(), true);
    const mirrorAfter = await scalar("select to_jsonb(a) as result from agents a where agent37_id=$1", [instance]);
    assert.deepEqual(mirrorAfter, { ...mirrorBefore, template: target });
    assert.equal(await scalar("select instance_id as result from studio_employees where id=$1", [employee]), instance);
    assert.equal(Number(await scalar("select monthly_cap_micros as result from studio_employees where id=$1", [employee])), 123456);
    assert.equal(await scalar("select state as result from studio_workstation_upgrades where id=$1", [upgrade.id]), "ready");
    await db.query("update agents set template=$2 where agent37_id=$1", [instance, from]);
    await assert.rejects(finish(), /workstation mirror mismatch/);
    await db.query("update agents set template=$2 where agent37_id=$1", [instance, target]);
    assert.equal(await aiDispatch(), true);
    await db.query("update studio_assignments set dispatch_state='idle' where id=$1", [assignment.id]);
    // Model a previous unresolved request: even a ready target cannot make a
    // different delayed provider action safe. Production never clears it by time.
    await db.query("update studio_workstation_upgrades set state='dispatched',dispatched_at=now() where id=$1", [next.id]);
    await assert.rejects(finish(), /outcome uncertain/);
    assert.equal(await aiDispatch(), false);
    await assert.rejects(db.query("update studio_workstation_upgrades set state='pending' where id=$1", [next.id]), /check constraint/);
    await db.query("delete from studio_assignments where id=$1", [assignment.id]);
    assert.equal(await scalar("select state as result from studio_workstation_upgrades where id=$1", [next.id]), "dispatched");
    assert.equal(await scalar("select assignment_id as result from studio_workstation_upgrades where id=$1", [next.id]), null);
    assert.equal(await scalar("select count(*)::int as result from studio_workstation_upgrades where employee_id=$1", [employee]), 2);
  } finally { await db.close(); }
});
