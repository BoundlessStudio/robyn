import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";

test("external MCP binds project edits, job cancellation and native execution to the consenting owner", async () => {
  const db = await studioDatabase();
  const call = async (name, ...args) => (await db.query(
    `select public.${name}(${args.map((_, index) => "$" + (index + 1)).join(",")}) as value`, args,
  )).rows[0].value;
  const owner = randomUUID(), stranger = randomUUID();
  const resource = "https://robyn.example/mcp", redirect = "https://client.example/callback";
  try {
    await db.exec("alter table auth.users add column banned_until timestamptz");
    await applyStudioMigrations(db);
    await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now()),($2,now())", [owner, stranger]);
    const workspace = await call("initialize_studio", owner, "[]");
    const otherWorkspace = await call("initialize_studio", stranger, "[]");
    const createProject = async (ws, user) => (await db.query(
      "insert into studio_projects(workspace_id,created_by,name) values($1,$2,'MCP fixture') returning id", [ws, user],
    )).rows[0].id;
    const project = await createProject(workspace, owner);
    const foreignProject = await createProject(otherWorkspace, stranger);
    const { id: employee } = (await db.query("select id from studio_employees where workspace_id=$1 and employee_key='robyn'", [workspace])).rows[0];
    await db.query("insert into agents(workspace_id,agent37_id,template) values ($1,'mcp-test','robyn-studio-0-6-0@1')", [workspace]);
    await db.query("update studio_employees set instance_id='mcp-test',provision_state='ready',monthly_cap_micros=0 where id=$1", [employee]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of ["studio_mcp_clients", "studio_mcp_codes", "studio_mcp_grants", "studio_mcp_operations"]) {
        await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
      }
      await assert.rejects(call("studio_mcp_identity", "access", resource), /permission denied/);
      await assert.rejects(call("create_studio_mcp_project", workspace, owner, randomUUID(), randomUUID(), "Project", ""), /permission denied/);
      await assert.rejects(call("update_studio_mcp_project", workspace, owner, randomUUID(), project, new Date().toISOString(), "Project", null), /permission denied/);
      await assert.rejects(call("cancel_studio_mcp_job", workspace, owner, randomUUID(), project, randomUUID()), /permission denied/);
      await db.exec("reset role");
    }

    const client = await call("register_studio_mcp_client", "MCP fixture", [redirect], "none", null);
    assert.equal(await call("register_studio_mcp_client", "MCP fixture", [redirect], "none", null), client);
    await db.query(`insert into studio_mcp_codes(code_hash,client_id,user_id,workspace_id,redirect_uri,challenge,resource)
      values ('code',$1,$2,$3,$4,'challenge',$5)`, [client, owner, workspace, redirect, resource]);
    const exchange = (uri, challenge, target) => call("exchange_studio_mcp_code", "code", client, uri, challenge, target, "access", "refresh");
    assert.equal(await exchange(redirect + "/other", "challenge", resource), false);
    assert.equal(await exchange(redirect, "wrong", resource), false);
    assert.equal(await exchange(redirect, "challenge", resource + "/other"), false);
    assert.equal(await exchange(redirect, "challenge", resource), true);
    assert.equal(await exchange(redirect, "challenge", resource), false);
    assert.equal(await call("studio_mcp_identity", "access", resource + "/other"), null);
    const identity = await call("studio_mcp_identity", "access", resource);
    assert.equal(identity.userId, owner);
    assert.equal(identity.workspaceId, workspace);
    const grant = identity.grantId;
    assert.equal(await call("refresh_studio_mcp_grant", "refresh", client, resource, "new-access", "new-refresh"), true);
    assert.equal(await call("refresh_studio_mcp_grant", "refresh", client, resource, "third-access", "third-refresh"), false);
    assert.equal(await call("studio_mcp_identity", "access", resource), null);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [owner]);
    assert.equal(await call("studio_mcp_identity", "new-access", resource), null);
    await db.query("update auth.users set banned_until=null where id=$1", [owner]);

    const createMcpProject = (id, connection = grant) =>
      call("create_studio_mcp_project", workspace, owner, connection, id, "MCP project", "A saved brief");
    const updateMcpProject = (id, updatedAt, name, brief) =>
      call("update_studio_mcp_project", workspace, owner, grant, id, updatedAt, name, brief);
    const newProjectId = randomUUID();
    await db.exec("set role service_role");
    const created = await createMcpProject(newProjectId);
    assert.equal(created.id, newProjectId);
    assert.equal(created.status, "active");
    assert.deepEqual(await createMcpProject(newProjectId), created);
    await assert.rejects(createMcpProject(foreignProject), /creation id reused/);
    await assert.rejects(createMcpProject(randomUUID(), randomUUID()), /not found/);
    await assert.rejects(updateMcpProject(foreignProject, created.updated_at, "Renamed", null), /not found/);
    const renamed = await updateMcpProject(newProjectId, created.updated_at, "Renamed", null);
    assert.equal(renamed.name, "Renamed");
    assert.equal(renamed.brief, "A saved brief");
    assert.notEqual(renamed.updated_at, created.updated_at);
    await assert.rejects(updateMcpProject(newProjectId, created.updated_at, "Stale edit", ""), /project changed/);
    const cleared = await updateMcpProject(newProjectId, renamed.updated_at, null, "");
    assert.equal(cleared.name, "Renamed");
    assert.equal(cleared.brief, "");
    assert.deepEqual(await createMcpProject(newProjectId), cleared, "replaying creation preserves later edits");
    await db.exec("reset role");

    const job = (request = randomUUID()) => call("create_studio_mcp_job", workspace, owner, grant, project, employee, request,
      "Make a sheet", "[]", "gridcraft", '["gridcraft"]', "work");
    const cancel = (assignment, target = project) => call("cancel_studio_mcp_job", workspace, owner, grant, target, assignment);
    await assert.rejects(job(), /mcp ai helper disabled/);
    const reserve = (key, digest = "same", target = project, save = '{"name":"Output"}', inputs = "[]") =>
      call("reserve_studio_mcp_operation", workspace, owner, grant, target, key, "mcp-test", "gridcraft", digest, inputs, save);
    await assert.rejects(reserve(randomUUID(), "same", foreignProject), /workstation unavailable/);
    const operationId = randomUUID();
    const operation = await reserve(operationId);
    assert.equal((await reserve(operationId)).id, operation.id);
    await assert.rejects(reserve(operationId, "different"), /operation key reused/);
    await assert.rejects(reserve(randomUUID()), /workstation busy/);
    assert.equal(await call("studio_mcp_worker_scope", operation.id), null);
    assert.equal(await call("dispatch_studio_mcp_operation", operation.id, workspace, owner, grant), true);
    assert.equal((await call("studio_mcp_worker_scope", operation.id)).project_id, project);
    assert.equal(await call("claim_studio_mcp_worker", operation.id), true);
    assert.equal(await call("claim_studio_mcp_worker", operation.id), false);

    await db.query("update studio_employees set monthly_cap_micros=100000 where id=$1", [employee]);
    const request = randomUUID();
    const queued = await job(request);
    assert.equal((await job(request)).id, queued.id);
    const queuedToStop = await job();
    await assert.rejects(cancel(queuedToStop.id, newProjectId), /not found/);
    assert.equal((await cancel(queuedToStop.id)).state, "cancelled");
    assert.equal((await cancel(queuedToStop.id)).state, "cancelled");
    assert.equal((await call("claim_studio_assignment", workspace, owner, queued.id)).claimed, false);
    assert.equal(await call("studio_media_admission_available", workspace, null, null), false);

    const pkg = JSON.stringify({ files: [{ path: "Workbook.xlsx", role: "master", mimeType: "application/octet-stream", bytes: 50, sha256: "a".repeat(64) }], dependencies: [] });
    const saved = await call("prepare_studio_mcp_save", operation.id, pkg);
    assert.deepEqual(await call("prepare_studio_mcp_save", operation.id, pkg), saved);
    await assert.rejects(call("prepare_studio_mcp_save", operation.id, pkg.replace('"bytes":50', '"bytes":51')), /operation key reused/);
    await assert.rejects(call("commit_studio_mcp_save", operation.id, saved.revisionId, "[]"), /incomplete upload/);
    const files = (await db.query("select id,bytes from studio_package_files where revision_id=$1", [saved.revisionId])).rows;
    assert.equal((await call("commit_studio_mcp_save", operation.id, saved.revisionId, JSON.stringify(files))).status, "committed");
    assert.equal(await call("finish_studio_mcp_operation", operation.id, '{"outcome":"completed","save":"untrusted"}'), true);
    const receipt = (await db.query("select result from studio_mcp_operations where id=$1", [operation.id])).rows[0].result;
    assert.deepEqual(receipt.save, { ...saved, status: "committed" });
    const workflow = "mcp-cancel-workflow";
    assert.equal(await call("bind_studio_assignment_workflow", workspace, owner, queued.id, workflow), true);
    const running = await call("claim_studio_assignment", workspace, owner, queued.id);
    assert.equal(running.claimed, true);
    const fence = [workspace, owner, queued.id, workflow, running.assignment.run_attempt];
    assert.equal(await call("claim_studio_assignment_dispatch", ...fence), true);
    assert.equal(await call("mark_studio_dispatch_uncertain", ...fence), true);
    await db.query("insert into studio_assignment_deliverables values ($1,$2,$3,$4)", [workspace, queued.id, saved.assetId, saved.revisionId]);
    await db.query("update studio_employees set monthly_cap_micros=0 where id=$1", [employee]);
    assert.equal((await cancel(queued.id)).state, "cancelling");
    assert.equal((await cancel(queued.id)).dispatch_state, "uncertain");
    await assert.rejects(reserve(randomUUID()), /workstation busy/);
    assert.equal(await call("finish_studio_assignment", ...fence, null, "cancelled", "", null), null);
    assert.equal(await call("record_studio_assignment_response", ...fence, running.assignment.session_id, "mcp-response"), true);
    const stopped = await call("finish_studio_assignment", ...fence, "mcp-response", "completed", "Stopped", null);
    assert.equal(stopped.state, "cancelled");
    assert.equal((await cancel(queued.id)).state, "cancelled");
    const preserved = (await db.query(`select r.state from studio_assignment_deliverables d
      join studio_revisions r on r.id=d.revision_id where d.assignment_id=$1 and r.id=$2`, [queued.id, saved.revisionId])).rows;
    assert.deepEqual(preserved, [{ state: "committed" }]);

    const second = await reserve(randomUUID(), "second", project, '{"name":"After revocation"}');
    assert.equal(await call("dispatch_studio_mcp_operation", second.id, workspace, owner, grant), true);
    await db.query("update studio_mcp_grants set revoked_at=now() where id=$1", [grant]);
    assert.equal(await call("studio_mcp_identity", "new-access", resource), null);
    await assert.rejects(createMcpProject(randomUUID()), /not found/);
    await assert.rejects(updateMcpProject(newProjectId, cleared.updated_at, "Revoked edit", null), /not found/);
    await assert.rejects(cancel(queued.id), /not found/);
    assert.equal(await call("studio_mcp_worker_scope", second.id), null);
    await assert.rejects(call("prepare_studio_mcp_save", second.id, pkg), /not found/);
    assert.equal(await call("finish_studio_mcp_operation", second.id, '{"outcome":"interrupted"}'), true);
  } finally { await db.close(); }
});
