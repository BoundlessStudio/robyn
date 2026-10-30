import test from "node:test";
import assert from "node:assert/strict";
import type { Agent } from "../src/lib/types";
import type { AssignmentIdentity, StudioEmployee } from "../src/studio/assignments";
import { matchingWorkstationRelease, prepareWorkstationRelease, type WorkstationUpgrade } from "../src/studio/workstation-upgrades";

function fixture() {
  const identity = { workspaceId: "studio", userId: "owner", assignmentId: "assignment", workflowId: "workflow", attemptId: "attempt" };
  const employee: StudioEmployee = {
    id: "employee", workspace_id: identity.workspaceId, kind: "specialist", app_id: "cadcraft", employee_key: "cadcraft",
    role: "Designer", instructions: "Create editable work", instance_id: "persistent", provision_state: "ready",
    provision_attempt: null, provision_create_started_at: null, provision_error: null,
  };
  const previous = { template: "robyn-cadcraft-old@1", release: `sha256:${"a".repeat(64)}` };
  const target = { template: "robyn-cadcraft-new@2", release: `sha256:${"b".repeat(64)}` };
  const instance: Agent = {
    id: "persistent", status: "running", status_reason: null, template: "robyn-cadcraft-old", template_revision: 1,
    image_ref: null, image_digest: previous.release, resources: { cpu: 4, memory: 8, disk: 20 },
    ports: null, user: "owner", name: "Designer", metadata: { app_workspace: "studio", studio_employee: "employee" },
    paid_through: null, past_due: false, created: 1,
  };
  const mirror = { agent37_id: instance.id, workspace_id: identity.workspaceId, template: previous.template };
  const upgrades: WorkstationUpgrade[] = [];
  const calls: string[] = [];
  const input = {
    identity: identity as AssignmentIdentity, employee, instance, mirror, target, previousReleases: [previous], upgrades,
    io: {
      claim: async () => {
        calls.push("claim");
        const row: WorkstationUpgrade = { id: "upgrade", workspace_id: "studio", employee_id: employee.id, instance_id: instance.id,
          from_template: previous.template, target_template: target.template, target_digest: target.release, state: "pending" };
        upgrades.push(row); return row;
      },
      dispatch: async (row: WorkstationUpgrade) => { calls.push("dispatch"); row.state = "dispatched"; return true; },
      update: async (template: string) => { calls.push(`update:${template}`); },
      finish: async () => {
        calls.push("finish"); const row = upgrades.find(row => row.target_template === target.template);
        if (row?.state !== "dispatched" && row?.state !== "ready") return false;
        row.state = "ready"; mirror.template = target.template; return true;
      },
    },
  };
  const observeTarget = () => { instance.template = "robyn-cadcraft-new"; instance.template_revision = 2; instance.image_digest = target.release; };
  return { input, calls, instance, employee, mirror, identity, target, previous, upgrades, observeTarget };
}

test("workstation image update preserves identity and waits for a later exact GET", async () => {
  const f = fixture(); const before = structuredClone(f.instance);
  assert.equal(await prepareWorkstationRelease(f.input), false);
  assert.deepEqual(f.calls, ["claim", "dispatch", `update:${f.target.template}`]);
  assert.equal(f.mirror.template, f.previous.template);
  f.observeTarget();
  assert.equal(await prepareWorkstationRelease(f.input), true);
  assert.equal(f.mirror.template, f.target.template);
  assert.equal(f.upgrades[0].state, "ready");
  assert.equal(f.instance.id, before.id); assert.deepEqual(f.instance.resources, before.resources);
  assert.deepEqual(f.instance.metadata, before.metadata);
});

test("new Craft workstations require the selected template revision and immutable image digest", () => {
  const f = fixture(); f.observeTarget();
  assert.equal(matchingWorkstationRelease(f.instance, f.target), true);
  f.instance.image_digest = null;
  assert.equal(matchingWorkstationRelease(f.instance, f.target), false);
  f.instance.image_digest = f.previous.release;
  assert.equal(matchingWorkstationRelease(f.instance, f.target), false);
  f.instance.image_digest = f.target.release; f.instance.template_revision = 1;
  assert.equal(matchingWorkstationRelease(f.instance, f.target), false);
});

test("lost update replies and repeated old GETs never authorize another POST", async () => {
  const f = fixture(); f.input.io.update = async () => { f.calls.push("lost-reply"); throw new Error("timeout"); };
  assert.equal(await prepareWorkstationRelease(f.input), false);
  for (let i = 0; i < 3; i++) assert.equal(await prepareWorkstationRelease(f.input), false);
  assert.deepEqual(f.calls, ["claim", "dispatch", "lost-reply"]);
  f.observeTarget(); assert.equal(await prepareWorkstationRelease(f.input), true);
  assert.deepEqual(f.calls, ["claim", "dispatch", "lost-reply", "finish"]);
});

test("legacy GETs without image_digest can migrate only from an exact known template revision", async () => {
  const f = fixture(); f.instance.image_digest = null;
  assert.equal(await prepareWorkstationRelease(f.input), false);
  assert.deepEqual(f.calls, ["claim", "dispatch", `update:${f.target.template}`]);
  f.observeTarget(); f.instance.image_digest = null; f.calls.length = 0;
  assert.equal(await prepareWorkstationRelease(f.input), false); assert.deepEqual(f.calls, []);
  f.instance.image_digest = f.target.release;
  assert.equal(await prepareWorkstationRelease(f.input), true);
  const unknown = fixture(); unknown.instance.image_digest = null; unknown.instance.template_revision = null;
  await assert.rejects(prepareWorkstationRelease(unknown.input), /workstation_release_mismatch/);
  assert.deepEqual(unknown.calls, []);
});

test("foreign metadata, employee binding, and mirrors reject before external operations", async () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.instance.metadata!.app_workspace = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.instance.metadata!.studio_employee = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.employee.workspace_id = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.employee.instance_id = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.mirror.workspace_id = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.mirror.agent37_id = "foreign"; },
    (f: ReturnType<typeof fixture>) => { f.mirror.template = "unrelated@1"; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    await assert.rejects(prepareWorkstationRelease(f.input), /workstation_(ownership|mirror)_mismatch/);
    assert.deepEqual(f.calls, []);
  }
});

test("release drift and arbitrary images cannot become an upgrade source", async () => {
  const f = fixture(); f.instance.image_digest = `sha256:${"c".repeat(64)}`;
  await assert.rejects(prepareWorkstationRelease(f.input), /workstation_release_mismatch/);
  assert.deepEqual(f.calls, []);
  const ready = fixture(); await prepareWorkstationRelease(ready.input); ready.upgrades[0].state = "ready";
  await assert.rejects(prepareWorkstationRelease(ready.input), /workstation_release_drift/);
  assert.equal(ready.calls.filter(call => call.startsWith("update:")).length, 1);
});

test("target template, revision, digest, and settled lifecycle must all agree", async () => {
  for (const field of ["revision", "digest", "missing-digest", "status"] as const) {
    const f = fixture(); await prepareWorkstationRelease(f.input); f.observeTarget(); f.calls.length = 0;
    if (field === "revision") f.instance.template_revision = 1;
    if (field === "digest") f.instance.image_digest = f.previous.release;
    if (field === "missing-digest") f.instance.image_digest = null;
    if (field === "status") f.instance.status = "updating";
    if (field === "digest") await assert.rejects(prepareWorkstationRelease(f.input), /workstation_release_mismatch/);
    else assert.equal(await prepareWorkstationRelease(f.input), false);
    assert.deepEqual(f.calls, []);
  }
});

test("an earlier uncertain target fences even an already-current image and media recovery", async () => {
  const f = fixture(); await prepareWorkstationRelease(f.input);
  f.upgrades[0].target_template = "robyn-cadcraft-intermediate@1"; f.calls.length = 0;
  f.observeTarget(); f.mirror.template = f.target.template;
  await assert.rejects(prepareWorkstationRelease(f.input), /workstation_upgrade_uncertain/);
  assert.deepEqual(f.calls, []);
});

test("image changes require an idle assignment fence; scoped media recovery can retain its known image", async () => {
  const f = fixture(); f.input.identity = { workspaceId: "studio", userId: "owner", assignmentId: "media-job" };
  assert.equal(await prepareWorkstationRelease(f.input), false); assert.deepEqual(f.calls, []);
  assert.equal(await prepareWorkstationRelease({ ...f.input, allowPreviousForMediaRecovery: true }), true);
  assert.deepEqual(f.calls, []);
  const rejected = fixture(); rejected.input.io.dispatch = async () => { rejected.calls.push("dispatch-denied"); return false; };
  assert.equal(await prepareWorkstationRelease(rejected.input), false);
  assert.deepEqual(rejected.calls, ["claim", "dispatch-denied"]);
});

test("already-current releases still reconcile database fences and reject an untracked mirror change", async () => {
  const f = fixture(); f.observeTarget();
  await assert.rejects(prepareWorkstationRelease(f.input), /workstation_mirror_mismatch/);
  assert.deepEqual(f.calls, ["finish"]);
  f.mirror.template = f.target.template; f.calls.length = 0;
  assert.equal(await prepareWorkstationRelease(f.input), true); assert.deepEqual(f.calls, ["finish"]);
});
