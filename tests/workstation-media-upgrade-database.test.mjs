import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("image upgrades preserve active and unsettled legacy media, fence late binding, and leave settlement available", async () => {
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
    for (const name of (await fs.readdir(new URL("../supabase/migrations", import.meta.url))).filter(name => name.endsWith(".sql")).sort()) {
      await db.exec(await fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    }
    const owner = randomUUID(); await db.query("insert into auth.users(id) values($1)", [owner]);
    await db.exec("set role service_role");
    const profiles = [
      { key: "cadcraft", kind: "specialist", appId: "cadcraft", role: "CAD", version: "1", instructions: "Create editable work." },
      { key: "director", kind: "director", appId: null, role: "Director", version: "1", instructions: "Coordinate." },
    ];
    const workspace = await scalar("select initialize_studio($1,$2) as result", [owner, JSON.stringify(profiles)]);
    const employee = await scalar("select id as result from studio_employees where workspace_id=$1 and kind='specialist'", [workspace]);
    const director = await scalar("select id as result from studio_employees where workspace_id=$1 and kind='director'", [workspace]);
    const instance = "legacy-craft", template = "robyn-cadcraft-old@1", target = "robyn-cadcraft-new@1", digest = `sha256:${"b".repeat(64)}`;
    await db.query("insert into agents(workspace_id,agent37_id,template) values($1,$2,$3),($1,'director','agent37-hermes')", [workspace, instance, template]);
    await db.query("update studio_employees set instance_id=$2,provision_state='ready' where id=$1", [employee, instance]);
    await db.query("update studio_employees set instance_id='director',provision_state='ready' where id=$1", [director]);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Media fence') returning id as result", [workspace, owner]);
    const assignment = await scalar("select create_studio_assignment($1,$2,$3,$4,$5,'Create CAD.','[]') as result", [workspace, owner, project, employee, randomUUID()]);
    const workflow = "media-upgrade-fence";
    await scalar("select bind_studio_assignment_workflow($1,$2,$3,$4) as result", [workspace, owner, assignment.id, workflow]);
    const run = await scalar("select claim_studio_assignment($1,$2,$3) as result", [workspace, owner, assignment.id]);
    const attempt = run.assignment.run_attempt;
    const token = "d".repeat(64);
    await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')", [assignment.id, instance, token]);
    const claim = (to = target, sha = digest, from = template) => scalar("select claim_studio_workstation_upgrade($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result", [workspace, owner, employee, instance, assignment.id, workflow, attempt, from, to, sha]);
    const dispatch = upgrade => scalar("select dispatch_studio_workstation_upgrade($1,$2,$3,$4,$5,$6,$7,$8) as result", [workspace, owner, employee, instance, upgrade.id, assignment.id, workflow, attempt]);
    const aiDispatch = () => scalar("select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as result", [workspace, owner, assignment.id, workflow, attempt]);
    const finish = (to = target, sha = digest) => scalar("select finish_studio_workstation_upgrade($1,$2,$3,$4,$5,$6) as result", [workspace, owner, employee, instance, to, sha]);
    const media = async (overrides = {}) => {
      const p = { instance: null, employee: null, budgetEmployee: null, state: "preparing", operation: "import", reserved: 0, providerJob: null, settled: false, ...overrides };
      return scalar(`insert into studio_media_jobs(workspace_id,project_id,created_by,assignment_id,employee_id,budget_employee_id,operation_id,
        operation,provider,kind,name,request,state,instance_id,workflow_id,reserved_micros,provider_job_id,billing_settled)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,'image','Legacy media','{}',$10,$11,'media-workflow',$12,$13,$14) returning id as result`,
      [workspace, project, owner, p.employee ? assignment.id : null, p.employee, p.budgetEmployee, randomUUID(), p.operation,
        p.operation === "generate" ? "perflo" : "commons", p.state, p.instance, p.reserved, p.providerJob, p.settled]);
    };
    const settle = (job, actual = 900) => scalar("select settle_media_charge($1,$2,$3,'media-workflow',$4,'{\"verified\":true}') as result", [workspace, owner, job, actual]);
    const row = job => scalar("select to_jsonb(j) as result from studio_media_jobs j where id=$1", [job]);

    const held = await media({ employee, operation: "generate", reserved: 900, state: "processing" });
    assert.equal(await claim(), null, "an unbound attributed job protects the employee before its late bind");
    await db.query("update studio_media_jobs set instance_id=$2,created_at=now()-interval '90 days',state='failed' where id=$1", [held, instance]);
    const heldBefore = await row(held);
    assert.equal(await claim(), null, "a terminal old charge is still unsettled");
    assert.deepEqual(await row(held), heldBefore, "image admission never changes payment records");
    assert.equal(await settle(held), true);
    const providerHeld = await media({ instance, operation: "generate", state: "cancelled", providerJob: "known-provider-job", reserved: 0 });
    assert.equal(await claim(), null, "a provider identity protects an unreserved unresolved charge");
    assert.equal(await settle(providerHeld, 50), true);
    const budgetOnly = await media({ budgetEmployee: employee });
    assert.equal(await claim(), null, "legacy unbound payer identity is also protected");
    await scalar("select cancel_unpaid_media_job($1,$2,$3) as result", [workspace, owner, budgetOnly]);

    const directorJob = await media({ employee, instance: "director", budgetEmployee: director, operation: "generate" });
    const upgrade = await claim(); assert.equal(upgrade.state, "pending");
    assert.equal(await scalar("select provision_state as result from studio_employees where id=$1", [employee]), "ready");
    assert.equal((await scalar("select studio_employee_scope($1) as result", [token])).employeeId, employee, "pending image plans do not revoke existing media capabilities");
    assert.equal(await aiDispatch(), false, "pending image plans still fence new AI turns");
    const late = await media({ employee });
    assert.equal(await dispatch(upgrade), false, "dispatch rechecks a job that appeared after claim");
    assert.equal((await scalar("select studio_employee_scope($1) as result", [token])).employeeId, employee);
    await scalar("select cancel_unpaid_media_job($1,$2,$3) as result", [workspace, owner, late]);
    assert.equal(await dispatch(upgrade), true);
    assert.equal(await scalar("select provision_state as result from studio_employees where id=$1", [employee]), "provisioning");
    const waitingBind = await media();
    const waitingBefore = await row(waitingBind);
    await assert.rejects(db.query("update studio_media_jobs set instance_id=$2 where id=$1", [waitingBind, instance]), /workstation upgrade in progress/);
    await assert.rejects(db.query("update studio_media_jobs set employee_id=$2,assignment_id=$3 where id=$1", [waitingBind, employee, assignment.id]), /workstation upgrade in progress/);
    assert.deepEqual(await row(waitingBind), waitingBefore);
    const settledBefore = await row(held);
    await assert.rejects(db.query("update studio_media_jobs set state='preparing',reserved_micros=1000,billing_settled=false where id=$1", [held]), /workstation upgrade in progress/);
    assert.deepEqual(await row(held), settledBefore, "a rejected revival cannot clear a paid receipt");
    await assert.rejects(scalar("select create_media_job($1,$2,$3,$4,$5,$6) as result", [workspace, owner, project, randomUUID(), JSON.stringify({ operation: "generate", provider: "perflo", kind: "image", name: "Late tool call", inputs: [] }), token]), /employee access denied/);
    // Current Director reservations remain available while a Craft image is
    // in flight. The requesting employee's identity is not its worker instance.
    assert.equal(Number(await scalar("select reserve_media_charge($1,$2,$3,'media-workflow',5000,1000) as result", [workspace, owner, directorJob])), 1000);
    // Seed restored legacy financial evidence to prove the guard never prevents
    // settlement, even if an image request was already recorded separately.
    const restoredCharge = await media({ instance, state: "failed", operation: "generate", reserved: 700, providerJob: "restored-provider-job" });
    assert.equal(await settle(restoredCharge, 700), true);
    assert.equal((await row(restoredCharge)).billing_settled, true);
    assert.equal((await row(restoredCharge)).provider_job_id, "restored-provider-job");
    const allFinancialBefore = [await row(held), await row(providerHeld), await row(restoredCharge), await row(directorJob)];
    assert.equal(await finish(), true);
    assert.deepEqual([await row(held), await row(providerHeld), await row(restoredCharge), await row(directorJob)], allFinancialBefore);

    await db.query("update studio_employees set provision_state='ready' where id=$1", [employee]);
    // A rollback or cancelled deployment can revoke only a never-sent plan.
    const rollback = await claim("robyn-cadcraft-next@1", `sha256:${"c".repeat(64)}`, target);
    assert.equal(rollback.state, "pending"); assert.equal(await aiDispatch(), false);
    assert.equal(await finish(), true);
    assert.equal(await scalar("select state as result from studio_workstation_upgrades where id=$1", [rollback.id]), "superseded");
    assert.equal(await dispatch(rollback), false);
    assert.equal(await aiDispatch(), true);
  } finally { await db.close(); }
});
