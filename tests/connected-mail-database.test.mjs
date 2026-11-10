import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";

test("mail grants are immutable and private, and only a confirmed draft counts as delivery", async () => {
  const db = await studioDatabase();
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const owner = randomUUID();
  const outsider = randomUUID();
  try {
    await applyStudioMigrations(db);
    await db.exec("alter table auth.users add column banned_until timestamptz");
    await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now()),($2,now())", [owner, outsider]);
    const workspace = await scalar("select initialize_studio($1,'[]') as value", [owner]);
    const employee = await scalar("select id as value from studio_employees where workspace_id=$1", [workspace]);
    const project = await scalar("insert into studio_projects(workspace_id,created_by,name) values($1,$2,'Mail test') returning id as value", [workspace, owner]);
    const instance = "qa-mail-workstation";
    await db.query("insert into agents(workspace_id,agent37_id,template) values($1,$2,'robyn-studio-0-8-0@1')", [workspace, instance]);
    await db.query("update studio_employees set instance_id=$2,provision_state='ready',monthly_cap_micros=1000 where id=$1", [employee, instance]);
    const mailbox = { instanceId: instance, connectionId: "ca_fixture", provider: "gmail" };
    const apps = '["wordcraft"]';
    const request = randomUUID();
    const create = (mail, mode = "draft", key = request, user = owner, app = null) => scalar(
      "select create_robyn_assignment_with_mail($1,$2,$3,$4,$5,'Write a draft','[]',$6,$7,$8,$9) as value",
      [workspace, user, project, employee, key, app, apps, mode, mail && JSON.stringify(mail)],
    );
    const job = await create(mailbox);
    assert.equal((await create(mailbox)).id, job.id);
    await assert.rejects(create(null), /operation key reused/);
    await assert.rejects(create({ ...mailbox, connectionId: "ca_other" }), /operation key reused/);
    await assert.rejects(create({ ...mailbox, instanceId: "wrong-instance" }, "draft", randomUUID()), /mail workstation changed/);
    await assert.rejects(create(mailbox, "draft", randomUUID(), outsider), /not found/);
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["studio_assignment_mail", "studio_mail_draft_operations"]) {
        assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT') as value", [role, table]), false);
      }
    }
    const client = await scalar("insert into studio_mcp_clients(name,redirect_uris,auth_method) values('QA','{https://fixture.test/callback}','none') returning id as value");
    const grant = await scalar("insert into studio_mcp_grants(client_id,user_id,workspace_id,resource,access_hash,refresh_hash) values($1,$2,$3,'https://fixture.test/mcp','access','refresh') returning id as value", [client, owner, workspace]);
    await assert.rejects(scalar("select create_studio_mcp_job($1,$2,$3,$4,$5,$6,'Write a draft','[]',null,$7,'draft') as value",
      [workspace, owner, grant, project, employee, request, apps]), /operation key reused/);

    async function claim(assignment, hash) {
      const workflow = "qa-" + randomUUID();
      await scalar("select bind_studio_assignment_workflow($1,$2,$3,$4) as value", [workspace, owner, assignment.id, workflow]);
      const running = (await scalar("select claim_studio_assignment($1,$2,$3) as value", [workspace, owner, assignment.id])).assignment;
      await db.query("insert into studio_employee_tokens(assignment_id,instance_id,token_hash,expires_at,employee_generation,workstation_profile) values($1,$2,$3,now()+interval '1 hour',$4,$5)",
        [running.id, instance, hash, running.employee_generation, running.workstation_profile]);
      return running;
    }
    async function finish(running) {
      const fence = [workspace, owner, running.id, running.workflow_id, running.run_attempt];
      assert.equal(await scalar("select claim_studio_assignment_dispatch($1,$2,$3,$4,$5) as value", fence), true);
      assert.equal(await scalar("select record_studio_assignment_response($1,$2,$3,$4,$5,$6,'response') as value", [...fence, running.session_id]), true);
      return scalar("select finish_studio_assignment($1,$2,$3,$4,$5,'response','completed','Draft task ended',null) as value", fence);
    }

    const operation = randomUUID();
    const hash = "a".repeat(64);
    const requestHash = "1".repeat(64);
    const reserve = (token, key = operation, fingerprint = requestHash) =>
      scalar("select reserve_studio_mail_draft($1,$2,$3) as value", [token, key, fingerprint]);
    const settle = (token, key = operation) =>
      scalar("select finish_studio_mail_draft($1,$2,'saved','draft_id') as value", [token, key]);
    const running = await claim(job, hash);
    assert.equal((await reserve(hash)).state, "dispatch");
    assert.equal((await reserve(hash)).state, "dispatching");
    assert.equal((await reserve(hash, randomUUID())).state, "dispatching");
    await assert.rejects(reserve(hash, operation, "2".repeat(64)), /operation key reused/);
    await assert.rejects(settle(hash, randomUUID()), /mail draft access denied/);
    const control = randomUUID();
    await scalar("select control_studio_research($1,$2,$3,$4,'request') as value", [workspace, owner, employee, control]);
    await assert.rejects(reserve(hash), /employee access denied/);
    await scalar("select control_studio_research($1,$2,$3,$4,'confirm') as value", [workspace, owner, employee, control]);
    await scalar("select control_studio_research($1,$2,$3,$4,'return') as value", [workspace, owner, employee, control]);
    const nextHash = "b".repeat(64);
    const resumed = await claim(running, nextHash);
    await assert.rejects(settle(hash), /employee access denied/);
    assert.equal((await reserve(nextHash)).state, "dispatching");
    assert.deepEqual(await settle(nextHash), { state: "saved", draftId: "draft_id" });
    assert.deepEqual(await reserve(nextHash), { state: "saved", draftId: "draft_id" });
    assert.equal((await finish(resumed)).state, "awaiting_review");
    await assert.rejects(reserve(nextHash), /employee access denied/);

    for (const [mode, mail, app, expected] of [
      ["plan", mailbox, null, "awaiting_review"],
      ["work", null, null, "awaiting_review"],
      ["draft", mailbox, "wordcraft", "failed"],
      ["draft", mailbox, null, "failed"],
    ]) {
      const token = createHash("sha256").update(randomUUID()).digest("hex");
      const task = await claim(await create(mail, mode, randomUUID(), owner, app), token);
      if (!mail || mode === "plan") await assert.rejects(reserve(token), /mail draft access denied/);
      else {
        assert.equal((await reserve(token)).state, "dispatch");
        if (app) await settle(token);
      }
      assert.equal((await finish(task)).state, expected);
    }
  } finally { await db.close(); }
});
