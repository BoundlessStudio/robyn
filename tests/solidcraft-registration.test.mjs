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

test("SolidCraft registers as a tool under one Robyn profile while pending imports stay unavailable", async () => {
  const apps = pendingCatalogue(), solid = apps.find(app => app.id === "solidcraft");
  assert.equal(apps.filter(app => app.id === "solidcraft").length, 1);
  assert.equal(solid.sourceUrl, "https://github.com/tangency-labs/solidcraft");
  assert.equal(solid.employee.role, "Parametric 3D Designer");
  assert.equal(isAppReady(solid), false); assert.equal(isEmployeeReady(solid), false);
  for (const extension of solid.formats.native) assert.equal(nativeImportApp(`Assembly${extension.toUpperCase()}`, [solid]), null);
  globalThis.__solidcraftCatalogue = apps;
  try {
    const { profiles, publicApps } = await loadModule("../../src/studio/server.ts", {
      "server-only": "", "@/lib/auth": "export const requireUser=()=>{throw Error('Unexpected authentication');};",
      "@/lib/http": httpMock, "./tools": "export const studioTools=globalThis.__solidcraftCatalogue;",
      "./apps/registry":"export const studioApps=globalThis.__solidcraftCatalogue;",
    });
    assert.equal(profiles.length,1);
    assert.deepEqual(profiles.map(({key,kind,appId,role})=>({key,kind,appId,role})),[{key:"robyn",kind:"director",appId:null,role:"Robyn"}]);
    assert.equal(publicApps().length,apps.length);assert.equal(publicApps().length,26);
    assert.equal(publicApps().some(app=>app.id==="research"),false);
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
    assert.equal(tour.studioTour.length, tour.craftTour.length);
    assert.equal(tour.studioTour.some(app=>app.id==="research"),false);
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
  const registered = new Set([...studioApps.map(app => app.id), research.id]);
  const iconIds = new Set(provenance.icons.map(icon => icon.id));
  assert.equal(iconIds.size,provenance.icons.length);
  for(const icon of provenance.icons)assert.ok(registered.has(icon.id));
  for(const app of [...studioApps.filter(isAppReady),research])assert.ok(iconIds.has(app.id),`${app.id} ready icon`);
  for (const icon of provenance.icons) {
    const bytes = await fs.readFile(new URL(`../public/brand/apps/${icon.id}.webp`, import.meta.url));
    assert.equal(bytes.byteLength, icon.bytes, `${icon.id} icon bytes`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), icon.sha256, `${icon.id} icon digest`);
  }
});

async function assignmentBoundary(apps,run){
  const workspaceId=randomUUID(),projectId=randomUUID(),employeeId=randomUUID(),calls=[],created=[];
  const employee={id:employeeId,workspace_id:workspaceId,employee_key:"robyn",kind:"director",app_id:null,role:"Robyn",retired_at:null};
  const state={apps,workspaceId,projectId,user:{id:randomUUID()},employee,calls,created,prior:null,refs:[]};
  const db={from(table){
    assert.ok(["studio_assignments","studio_employees","studio_assignment_inputs"].includes(table));calls.push(table);
    return {select(){return this;},eq(){return this;},is(){return this;},
      async maybeSingle(){return {data:table==="studio_employees"?employee:state.prior,error:null};},
      then(resolve){return Promise.resolve({data:state.refs,error:null}).then(resolve);},
    };
  }};
  state.db=db;globalThis.__solidcraftAssignment=state;
  try {
    const { POST } = await loadModule("../../src/app/api/studio/assignments/route.ts", {
      "@/lib/http": httpMock.replace("export const json=data=>Response.json(data);","export const json=(data,status=200)=>Response.json(data,{status});"),
      "@/studio/server": `export const requireStudio=async()=>globalThis.__solidcraftAssignment;
        export const readStudioBody=request=>request.json();export const ownedProject=async()=>({status:'active'});
        export const dbFailure=error=>{if(error)throw Error('Database error')};export const id=value=>value;export const textField=value=>value;`,
      "@/studio/apps/registry": "export const studioApps=globalThis.__solidcraftAssignment.apps;",
      "@/studio/assignment-server": `export const assignmentRpc=async(_db,name,args)=>{const s=globalThis.__solidcraftAssignment;s.calls.push(name);s.created.push(args);return {id:args.p_request,state:'queued',employee_id:args.p_employee,execution_model:'robyn',app_id:args.p_app,allowed_app_ids:args.p_allowed_apps};};`,
      "@/studio/assignment-launch": "export const launchAssignment=async()=>{globalThis.__solidcraftAssignment.calls.push('launch');};",
      "@/studio/paid-capacity": "export const paidCapacity=async()=>{globalThis.__solidcraftAssignment.calls.push('budget');return {availableMicros:5000000};};",
    });
    const submit=(input={})=>POST(new Request("https://studio.example/api/studio/assignments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,brief:"Make editable work.",requestId:randomUUID(),inputs:[],...input})}));
    await run({...state,submit});
  } finally { delete globalThis.__solidcraftAssignment; }
}

test("pending SolidCraft rejects paid assignment creation before budget or workflow side effects",async()=>{
  await assignmentBoundary(pendingCatalogue(),async({submit,calls,created})=>{
    const response=await submit({appId:"solidcraft",brief:"Model a bracket."});
    assert.equal(response.status,409);assert.equal((await response.json()).error.code,"integration_pending");
    assert.deepEqual(calls,["studio_assignments","studio_employees"]);assert.deepEqual(created,[]);
  });
});

test("all 26 ready Craft hints and an unhinted brief use the same canonical Robyn",async()=>{
  const readyApps=studioApps.filter(isEmployeeReady);
  assert.equal(readyApps.length,26);
  assert.deepEqual(studioApps.filter(app=>!isAppReady(app)).map(app=>app.id),[]);
  await assignmentBoundary(studioApps,async({submit,employee,created})=>{
    for(const app of readyApps){const response=await submit({appId:app.id,employeeId:employee.id});assert.equal(response.status,202);}
    const response=await submit();assert.equal(response.status,202);
    assert.deepEqual(created.map(args=>args.p_app),[...readyApps.map(app=>app.id),null]);
    assert.deepEqual([...new Set(created.map(args=>args.p_employee))],[employee.id]);
    assert.ok(created.every(args=>JSON.stringify(args.p_allowed_apps)===JSON.stringify(readyApps.map(app=>app.id))));
  });
});

test("new studio Crafts cannot start paid work before their integrations pass acceptance",async()=>{
  const pendingApps=studioApps.map(app=>({...app,editor:{...app.editor,status:'pending'}}));
  await assignmentBoundary(pendingApps,async({submit,calls,created})=>{
    for(const app of pendingApps){
      const response=await submit({appId:app.id});
      assert.equal(response.status,409,app.id);
      assert.equal((await response.json()).error.code,"integration_pending",app.id);
    }
    assert.equal(calls.includes("budget"),false);assert.deepEqual(created,[]);
  });
});

test("a new request rejects a retired recipient or Notes as a Craft hint before paid effects",async()=>{
  await assignmentBoundary(studioApps,async({submit,calls,created})=>{
    const retired=await submit({employeeId:randomUUID(),appId:"solidcraft"});assert.equal(retired.status,409);assert.equal((await retired.json()).error.code,"employee_retired");
    const notes=await submit({appId:"research"});assert.equal(notes.status,400);assert.equal((await notes.json()).error.code,"invalid_application");
    assert.equal(calls.includes("budget"),false);assert.deepEqual(created,[]);
  });
});

test("a frozen legacy acknowledgement returns its original job without retargeting or paid dispatch",async()=>{
  await assignmentBoundary(studioApps,async(state)=>{
    const requestId=randomUUID(),employeeId=randomUUID(),prior={id:randomUUID(),project_id:state.projectId,employee_id:employeeId,brief:"Original saved brief.",start_mode:"work",execution_model:"legacy",state:"queued"};
    globalThis.__solidcraftAssignment.prior=prior;
    const response=await state.submit({requestId,employeeId,brief:prior.brief});assert.equal(response.status,202);assert.equal((await response.json()).assignmentId,prior.id);
    assert.deepEqual(state.calls,["studio_assignments","studio_assignment_inputs"]);assert.deepEqual(state.created,[]);
    const changed=await state.submit({requestId,employeeId:state.employee.id,brief:prior.brief});assert.equal(changed.status,409);assert.equal((await changed.json()).error.code,"operation_key_reused");
    assert.equal(state.calls.includes("budget"),false);assert.deepEqual(state.created,[]);
  });
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
