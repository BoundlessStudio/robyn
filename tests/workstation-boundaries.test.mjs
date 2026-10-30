import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/module.mjs";
import { research } from "../src/studio/specialists/research.ts";
import { studioApps } from "../src/studio/apps/registry.ts";

async function workstationBoundary(run) {
  const solid = structuredClone(studioApps.find(app => app.id === "solidcraft"));
  solid.editor.status = "pending"; solid.workstation.status = "pending"; solid.formats.verification = "pending";
  const employee = { id: "employee", workspace_id: "studio", kind: "specialist", app_id: "research", instance_id: "persistent",
    provision_state: "ready", provision_attempt: null, employee_key: "research", role: "Research", instructions: "Research sources." };
  const instance = { id: "persistent", status: "running", template: research.workstation.template, template_revision: 1,
    image_ref: null, image_digest: null, metadata: { app_workspace: "studio", studio_employee: employee.id } };
  const mirror = { agent37_id: instance.id, workspace_id: "studio", template: research.workstation.template };
  const calls = [];
  const db = { from(table) {
    assert.ok(["studio_managed_budgets", "agents"].includes(table), `Unexpected workstation query: ${table}`);
    return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: table === "agents" ? mirror : null, error: null }; } };
  } };
  globalThis.__workstationBoundary = { apps: [research, solid], employee,
    rpc: async (_db, name) => { assert.equal(name, "claim_studio_employee_provision"); return employee; },
    agent37: { getAgent: async id => { calls.push(`get:${id}`); return instance; }, health: async id => { calls.push(`health:${id}`); return { ok: true, healthy: true }; } },
  };
  try {
    const workstation = await loadModule("../../src/studio/workstation.ts", {
      "server-only": "", "./tools": "export const studioTools=globalThis.__workstationBoundary.apps;",
      "@/lib/agent37": "export const agent37=globalThis.__workstationBoundary.agent37;",
      "./assignment-server": "export const assignmentRpc=(...args)=>globalThis.__workstationBoundary.rpc(...args);",
      "./employee-auth": "export const issueEmployeeToken=()=>{throw Error('Unexpected capability issue');};",
    });
    await run({ ...workstation, employee, instance, mirror, calls, db, identity: { workspaceId: "studio", userId: "owner", assignmentId: "assignment" } });
  } finally { delete globalThis.__workstationBoundary; }
}

test("Research retains its versioned workstation contract without entering Craft image migrations", async () => {
  await workstationBoundary(async ({ ensureEmployeeInstance, employeeTemplate, employee, instance, calls, db, identity }) => {
    assert.equal(employeeTemplate(employee), research.workstation.template);
    assert.equal(await ensureEmployeeInstance(db, identity, employee), instance);
    assert.deepEqual(calls, ["get:persistent", "health:persistent"]);
  });
});

test("pending SolidCraft employees cannot provision or operate an instance", async () => {
  await workstationBoundary(async ({ ensureEmployeeInstance, employeeTemplate, employee, calls, db, identity }) => {
    employee.app_id = "solidcraft";
    assert.throws(() => employeeTemplate(employee), /integration_pending/);
    await assert.rejects(ensureEmployeeInstance(db, identity, employee), /integration_pending/);
    assert.deepEqual(calls, []);
  });
});

test("Research still requires exact employee metadata and the owned template mirror", async () => {
  await workstationBoundary(async ({ ensureEmployeeInstance, employee, instance, mirror, calls, db, identity }) => {
    mirror.workspace_id = "foreign";
    await assert.rejects(ensureEmployeeInstance(db, identity, employee), /workstation_mirror_mismatch/);
    assert.deepEqual(calls, ["get:persistent"]);
    mirror.workspace_id = "studio"; calls.length = 0; instance.metadata.studio_employee = "foreign";
    await assert.rejects(ensureEmployeeInstance(db, identity, employee), /workstation_ownership_mismatch/);
    assert.deepEqual(calls, ["get:persistent"]);
  });
});
