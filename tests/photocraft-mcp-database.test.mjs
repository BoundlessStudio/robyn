import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { studioDatabase } from "./helpers/database.mjs";
import { applyStudioMigrations } from "./helpers/robyn-database.mjs";
import { loadModule } from "./helpers/module.mjs";

test("PhotoCraft's MCP saves recover one upload, preserve conflicts and stop after revocation", async t => {
  const db = await studioDatabase();
  t.after(() => db.close());
  await db.exec("alter table auth.users add column banned_until timestamptz");
  await applyStudioMigrations(db);
  const [owner, project, asset, grant] = Array.from({ length: 4 }, randomUUID);
  const call = async (name, ...args) => (await db.query(
    "select public." + name + "(" + args.map((_, i) => "$" + (i + 1)).join(",") + ") as value", args,
  )).rows[0].value;
  await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now())", [owner]);
  const workspace = await call("initialize_studio", owner, "[]");
  const client = await call("register_studio_mcp_client", "PhotoCraft test", ["https://client.example/callback"], "none", null);
  await db.query("insert into studio_mcp_grants(id,client_id,user_id,workspace_id,resource,access_hash,refresh_hash) values ($1,$2,$3,$4,'https://robyn.example/mcp','access','refresh')",
    [grant, client, owner, workspace]);
  await db.query("insert into studio_projects(id,workspace_id,name,created_by) values($1,$2,'Photos',$3)", [project, workspace, owner]);
  await db.query("insert into studio_assets(id,workspace_id,project_id,app_id,name,created_by) values($1,$2,$3,'photocraft','Layered image',$4)", [asset, workspace, project, owner]);
  const manifest = { files: [{ path: "Layered image.pcraft", role: "master", bytes: 5, sha256: "a".repeat(64), mimeType: "application/octet-stream" }], dependencies: [], message: "Fixture" };
  const pkg = JSON.stringify(manifest);
  const base = await call("begin_studio_revision", workspace, owner, asset, null, pkg);
  const verified = async revision => JSON.stringify((await db.query("select id,bytes from studio_package_files where revision_id=$1", [revision])).rows);
  await call("commit_studio_revision", workspace, owner, base, await verified(base));
  const key = randomUUID(), session = createHash("sha256").update("fixture session").digest("hex");
  const start = (request = key, fingerprint = "one", target = asset, previous = base, creation = null, snapshot = pkg) =>
    call("begin_studio_mcp_photocraft_save", workspace, owner, grant, project, target, previous, creation, request, session, fingerprint, snapshot);
  const commit = (revision, files, binding = session) =>
    call("commit_studio_mcp_photocraft_save", workspace, owner, grant, project, revision, binding, files);

  await db.exec("set role authenticated");
  await assert.rejects(start(), /permission denied/);
  await db.exec("reset role");
  await db.exec("set role service_role");
  const saving = await start();
  assert.equal(saving.status, "uploading");
  assert.deepEqual(await start(), saving);
  await assert.rejects(start(key, "different"), /photo save identity reused/);
  await assert.rejects(commit(saving.revisionId, "[]"), /incomplete upload/);
  await assert.rejects(commit(saving.revisionId, await verified(saving.revisionId), "wrong"), /not found/);
  assert.deepEqual(await commit(saving.revisionId, await verified(saving.revisionId)),
    { assetId: asset, revisionId: saving.revisionId, status: "committed" });
  assert.deepEqual(await start(), { ...saving, status: "committed" });

  const competing = await start(randomUUID());
  assert.equal((await commit(competing.revisionId, await verified(competing.revisionId))).status, "conflict");
  assert.equal((await db.query("select current_revision_id from studio_assets where id=$1", [asset])).rows[0].current_revision_id, saving.revisionId);

  const copyId = randomUUID(), copyRequest = randomUUID();
  const source = { assetId: asset, revisionId: saving.revisionId };
  const newAsset = JSON.stringify({ name: "Photo copy", source });
  await assert.rejects(start(copyRequest, "copy", copyId, null, newAsset), /source revision unavailable/);
  const copyManifest = JSON.stringify({ ...manifest, dependencies: [source] });
  const copy = await start(copyRequest, "copy", copyId, null, newAsset, copyManifest);
  assert.equal((await commit(copy.revisionId, await verified(copy.revisionId))).assetId, copyId);
  assert.deepEqual(await start(copyRequest, "copy", copyId, null, newAsset, copyManifest), { ...copy, status: "committed" });

  const interrupted = await start(randomUUID(), "pending", asset, saving.revisionId);
  await db.query("update studio_mcp_grants set revoked_at=now() where id=$1", [grant]);
  await assert.rejects(commit(interrupted.revisionId, await verified(interrupted.revisionId)), /not found/);
  await assert.rejects(start(), /not found/);
});

test("an MCP photo session is bound to its OAuth grant and the exact original document", async t => {
  const keys = ["NEXT_PUBLIC_SITE_URL", "ROBYN_MCP_RUNTIME_SECRET"];
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  process.env.NEXT_PUBLIC_SITE_URL = "https://robyn.example";
  process.env.ROBYN_MCP_RUNTIME_SECRET = "x".repeat(43);
  const [workspaceId, userId, grantId, projectId, assetId, revisionId] = Array.from({ length: 6 }, randomUUID);
  const binding = { projectId, assetId, revisionId };
  const identity = { workspaceId, userId, grantId, db: {} };
  const { openPhotoCraft, photoCraftEditorRequest } = await loadModule("../../src/studio/mcp/photocraft.ts", {
    "server-only": "",
    "@/studio/server": "export const ownedProject=(_,__,id)=>({id,status:'active'}); export const ownedAsset=()=>{}; export const ownedRevision=()=>{}; export const revisionFiles=()=>{}; export const verifyStoredFiles=()=>{}; export const withAssetPreviews=()=>{}; export const dbFailure=()=>{}; export const mapInBatches=()=>{}; export const STUDIO_BUCKET='studio-assets';",
    "./library": "export const readAssetRef=(_,projectId,ref)=>({asset:{id:ref.assetId,name:'Photo fixture',app_id:'photocraft',asset_kind:'native',project_id:projectId},revision:{id:ref.revisionId,state:'committed'}});",
  });
  const opened = await openPhotoCraft(identity, binding);
  assert.deepEqual(opened.output.ref, { assetId, revisionId });
  const request = { binding, session: opened.session, method: "GET", path: "/api/studio/unsupported" };
  await assert.rejects(photoCraftEditorRequest({ ...identity, grantId: randomUUID() }, request), { code: "invalid_editor_session" });
  await assert.rejects(photoCraftEditorRequest(identity, { ...request, binding: { ...binding, revisionId: randomUUID() } }), { code: "invalid_editor_session" });
  await assert.rejects(photoCraftEditorRequest(identity, request), { code: "not_found" });
});

test("Craft editor saves are restricted by application and reuse the immutable revision on retry", async t => {
  const db = await studioDatabase();
  t.after(() => db.close());
  await db.exec("alter table auth.users add column banned_until timestamptz");
  await applyStudioMigrations(db);
  const call = async (name, ...args) => (await db.query(
    "select public." + name + "(" + args.map((_, i) => "$" + (i + 1)).join(",") + ") as value", args,
  )).rows[0].value;
  const [owner, project, asset, grant, ledger] = Array.from({length:5}, randomUUID);
  await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now())", [owner]);
  const workspace = await call("initialize_studio", owner, "[]");
  const client = await call("register_studio_mcp_client", "Craft test", ["https://client.example/callback"], "none", null);
  await db.query("insert into studio_mcp_grants(id,client_id,user_id,workspace_id,resource,access_hash,refresh_hash) values ($1,$2,$3,$4,'https://robyn.example/mcp','access','refresh')",
    [grant, client, owner, workspace]);
  await db.query("insert into studio_projects(id,workspace_id,name,created_by) values($1,$2,'Crafts',$3)", [project, workspace, owner]);
  await db.query("insert into studio_assets(id,workspace_id,project_id,app_id,name,created_by) values($1,$2,$3,'pixelcraft','Sprite',$4),($5,$2,$3,'ledgercraft','Ledger',$4)",
    [asset, workspace, project, owner, ledger]);
  const manifest = { files: [{ path:"Sprite.oxypix", role:"master", bytes:5, sha256:"a".repeat(64), mimeType:"application/octet-stream" }], dependencies:[], message:"Fixture" };
  const pkg = JSON.stringify(manifest);
  const verify = async revision => JSON.stringify((await db.query("select id,bytes from studio_package_files where revision_id=$1", [revision])).rows);
  const first = await call("begin_studio_revision", workspace, owner, asset, null, pkg);
  await call("commit_studio_revision", workspace, owner, first, await verify(first));
  const session = createHash("sha256").update("fixture session").digest("hex"), request = randomUUID();
  const start = (app, target = asset, body = pkg) => call("begin_studio_mcp_craft_save", workspace, owner, grant, project,
    app, target, first, null, request, session, "fingerprint", body);
  const commit = async (app, revision) => call("commit_studio_mcp_craft_save", workspace, owner, grant, project,
    app, revision, session, await verify(revision));
  await db.exec("set role authenticated");
  await assert.rejects(start("pixelcraft"), /permission denied/);
  await db.exec("reset role");
  await db.exec("set role service_role");
  for (const app of ["gridcraft","dashcraft","ledgercraft","mailcraft","plancraft"]) {
    await assert.rejects(start(app, app === "ledgercraft" ? ledger : asset), /not found/);
  }
  await assert.rejects(start("pixelcraft", asset, JSON.stringify({...manifest, dependencies:[{assetId:ledger, revisionId:randomUUID()}]})),
    /dependency unavailable/);
  const saved = await start("pixelcraft");
  assert.deepEqual(await start("pixelcraft"), saved);
  await assert.rejects(commit("gridcraft", saved.revisionId), /not found/);
  const receipt = await commit("pixelcraft", saved.revisionId);
  assert.equal(receipt.status, "committed");
  assert.deepEqual(await start("pixelcraft"), {...saved, status:"committed"});
  await db.query("update studio_mcp_grants set revoked_at=now() where id=$1", [grant]);
  await assert.rejects(commit("pixelcraft", saved.revisionId), /not found/);
});
