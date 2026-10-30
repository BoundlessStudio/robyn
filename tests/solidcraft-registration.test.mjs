import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { loadModule, httpMock } from "./helpers/module.mjs";
import { studioApps } from "../src/studio/apps/registry.ts";
import { research } from "../src/studio/specialists/research.ts";
import { isAppReady, isEmployeeReady } from "../src/studio/manifest.ts";
import { nativeImportApp } from "../src/studio/native-import.ts";

function pendingCatalogue() {
  return studioApps.map(app => app.id !== "solidcraft" ? app : {
    ...app, editor: { ...app.editor, status: "pending" }, workstation: { ...app.workstation, status: "pending" },
    formats: { ...app.formats, verification: "pending" },
  });
}

test("SolidCraft registers once as an independent application and employee while pending imports stay unavailable", async () => {
  const apps = pendingCatalogue(), solid = apps.find(app => app.id === "solidcraft");
  assert.equal(apps.filter(app => app.id === "solidcraft").length, 1);
  assert.equal(solid.sourceUrl, "https://github.com/tangency-labs/solidcraft");
  assert.equal(solid.employee.role, "Parametric 3D Designer");
  assert.equal(isAppReady(solid), false); assert.equal(isEmployeeReady(solid), false);
  for (const extension of solid.formats.native) assert.equal(nativeImportApp(`Assembly${extension.toUpperCase()}`, [solid]), null);
  globalThis.__solidcraftCatalogue = [research, ...apps];
  try {
    const { profiles, publicApps } = await loadModule("../../src/studio/server.ts", {
      "server-only": "", "@/lib/auth": "export const requireUser=()=>{throw Error('Unexpected authentication');};",
      "@/lib/http": httpMock, "./tools": "export const studioTools=globalThis.__solidcraftCatalogue;",
    });
    assert.equal(profiles.length, apps.length + 2); // Every Craft, Research, and the Director.
    assert.equal(profiles.filter(profile => profile.key === "solidcraft").length, 1);
    assert.equal(profiles.find(profile => profile.key === "solidcraft").kind, "specialist");
    assert.equal(publicApps().length, apps.length + 1);
    assert.equal(publicApps().find(app => app.id === "solidcraft").ready, false);
  } finally { delete globalThis.__solidcraftCatalogue; }
});

test("homepage and icon counts follow registered and ready applications independently", async () => {
  const apps = pendingCatalogue(); globalThis.__solidcraftCatalogue = apps;
  try {
    const tour = await loadModule("../../src/components/home/craft-tour.ts", {
      "@/studio/apps/registry": "export const studioApps=globalThis.__solidcraftCatalogue;",
    });
    assert.equal(tour.craftTour.length, apps.filter(isAppReady).length);
    assert.equal(tour.craftTour.some(app => app.id === "solidcraft"), false);
    assert.equal(tour.studioTour.length, tour.craftTour.length + 1);
    const solid = apps.find(app => app.id === "solidcraft");
    solid.editor = { ...solid.editor, status: "verified", release: "fixture-editor", bundleUrl: "https://editor.example/solidcraft/" };
    solid.workstation = { ...solid.workstation, status: "verified", template: "robyn-solidcraft-fixture@1", release: `sha256:${"a".repeat(64)}` };
    solid.formats.verification = "verified";
    const ready = await loadModule("../../src/components/home/craft-tour.ts", {
      "@/studio/apps/registry": "export const studioApps=globalThis.__solidcraftCatalogue;",
    });
    assert.equal(ready.craftTour.length, tour.craftTour.length + 1);
    assert.ok(ready.craftTour.find(app => app.id === "solidcraft").story.copy.trim());
  } finally { delete globalThis.__solidcraftCatalogue; }
  const provenance = JSON.parse(await fs.readFile(new URL("../public/brand/apps/sources.json", import.meta.url), "utf8"));
  const expected = [...studioApps.map(app => app.id), research.id].sort();
  assert.deepEqual(provenance.icons.map(icon => icon.id).sort(), expected);
  for (const icon of provenance.icons) {
    const bytes = await fs.readFile(new URL(`../public/brand/apps/${icon.id}.webp`, import.meta.url));
    assert.equal(bytes.byteLength, icon.bytes, `${icon.id} icon bytes`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), icon.sha256, `${icon.id} icon digest`);
  }
});

test("pending SolidCraft rejects paid assignment creation before budget or workflow side effects", async () => {
  const workspaceId = randomUUID(), projectId = randomUUID(), employeeId = randomUUID(); const calls = [];
  const employee = { id: employeeId, kind: "specialist", app_id: "solidcraft" };
  const db = { from(table) {
    assert.equal(table, "studio_employees"); calls.push(table);
    return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: employee, error: null }; } };
  } };
  globalThis.__solidcraftAssignment = { apps: pendingCatalogue(), db, workspaceId, user: { id: randomUUID() }, calls };
  try {
    const { POST } = await loadModule("../../src/app/api/studio/assignments/route.ts", {
      "@/lib/http": httpMock,
      "@/studio/server": `export const requireStudio=async()=>globalThis.__solidcraftAssignment;
        export const readStudioBody=request=>request.json();export const ownedProject=async()=>({status:'active'});
        export const dbFailure=error=>{if(error)throw Error('Database error')};export const id=value=>value;export const textField=value=>value;`,
      "@/studio/tools": "export const studioTools=globalThis.__solidcraftAssignment.apps;",
      "@/studio/assignment-server": "export const assignmentRpc=()=>{throw Error('Unexpected assignment write');};",
      "@/studio/assignment-launch": "export const launchAssignment=()=>{throw Error('Unexpected workflow launch');};",
      "@/studio/paid-capacity": "export const paidCapacity=()=>{globalThis.__solidcraftAssignment.calls.push('budget');throw Error('Unexpected budget call');};",
    });
    const response = await POST(new Request("https://studio.example/api/studio/assignments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, appId: "solidcraft", brief: "Model a bracket.", requestId: randomUUID(), inputs: [] }),
    }));
    assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "integration_pending");
    assert.deepEqual(calls, ["studio_employees"]);
  } finally { delete globalThis.__solidcraftAssignment; }
});

test("the actual editor host refuses a pending SolidCraft import before creating a package", async () => {
  const calls = []; globalThis.__solidcraftCatalogue = pendingCatalogue(); globalThis.__pendingImportCalls = calls;
  try {
    const { createEditorHost } = await loadModule("../../src/studio/editor-host.ts", {
      "./apps/registry": "export const studioApps=globalThis.__solidcraftCatalogue;",
      "@/lib/api": "export const apiFetch=(...args)=>{globalThis.__pendingImportCalls.push(args);throw Error('Unexpected BFF call');};export const readApiError=()=>'';",
    });
    const host = createEditorHost({ projectId: randomUUID(), initialRef: { assetId: randomUUID(), revisionId: randomUUID() },
      signal: new AbortController().signal, onDirty() {}, onStatus() {}, onSaved() {} });
    await assert.rejects(host.handle({ protocol: "robyn.editor.v1", channel: randomUUID(), requestId: randomUUID(), operation: "importAsset",
      payload: { creationId: randomUUID(), name: "Assembly.sc", file: new Blob(["pending fixture"]) } }), /Choose a supported image, audio, video or native document/);
    assert.deepEqual(calls, []);
  } finally { delete globalThis.__solidcraftCatalogue; delete globalThis.__pendingImportCalls; }
});

test("the actual launcher displays a disabled pending SolidCraft and responds to project readiness", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url)); const apps = pendingCatalogue();
  const result = await build({
    stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {ApplicationLauncher} from './src/components/studio/ApplicationLauncher';
      window.__solidcraftLaunches=[];function Fixture(){const [ready,setReady]=useState(true);return <>
      <button onClick={()=>setReady(value=>!value)}>Toggle project readiness</button><ApplicationLauncher projectId="project" ready={ready}
        launch={{storageReady:true,busy:false,pending:null,pendingApp:null,error:null,status:''}}
        onLaunch={id=>window.__solidcraftLaunches.push(id)} onFiles={()=>{}} onFolder={()=>{}} employeesHref="/employees"/></>}
      createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: root, loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", tsconfig: root + "tsconfig.json",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "pending-catalogue", setup(builder) {
      builder.onResolve({ filter: /(?:^next\/link$|(?:^|\/)apps\/registry$|(?:^|\/)blank-starters$)/ }, args => ({ path: args.path, namespace: "pending-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "pending-fixture" }, args => ({ loader: "js", resolveDir: root, contents:
        args.path === "next/link" ? "import React from 'react';export default ({children,...props})=>React.createElement('a',props,children);"
          : args.path.endsWith("blank-starters") ? `export const currentBlankStarters=${JSON.stringify(apps.map(app => ({ appId: app.id, description: `Blank ${app.name}` })))};`
            : `export const studioApps=${JSON.stringify(apps)};` }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    const solid = page.getByRole("button", { name: /SolidCraft/ }); await solid.waitFor();
    assert.equal(await page.locator(".application-grid button").count(), studioApps.length);
    assert.equal(await solid.isDisabled(), true); await solid.click({ force: true });
    assert.deepEqual(await page.evaluate(() => window.__solidcraftLaunches), []);
    const word = page.getByRole("button", { name: /WordCraft/ }); assert.equal(await word.isEnabled(), true);
    await word.click(); assert.deepEqual(await page.evaluate(() => window.__solidcraftLaunches), ["wordcraft"]);
    await page.getByRole("button", { name: "Toggle project readiness" }).click();
    assert.equal(await word.isDisabled(), true); assert.equal(await solid.isDisabled(), true);
    await page.getByRole("button", { name: "Toggle project readiness" }).click();
    assert.equal(await word.isEnabled(), true); assert.equal(await solid.isDisabled(), true);
  } finally { await browser.close(); }
});
