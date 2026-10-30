import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/module.mjs";

async function workstationBoundary(run) {
  const image={template:"robyn-studio-0-1-0@1",release:`sha256:${"a".repeat(64)}`,resources:{cpu:2,memory:4,disk:6}};
  const employee = { id: "employee", workspace_id: "studio", kind: "director", app_id: null, instance_id: "persistent",
    provision_state: "ready", provision_attempt: null, employee_key: "robyn", role: "Robyn", retired_at:null, instructions: "Use the shared creative tools." };
  const instance = { id: "persistent", name:"Robyn", status: "running", template: "robyn-studio-0-1-0", template_revision: 1,
    image_ref: null, image_digest:image.release, resources:{...image.resources}, metadata: { app_workspace: "studio", studio_employee: employee.id } };
  const mirror = { agent37_id: instance.id, workspace_id: "studio", template: image.template };
  const calls = [],writes=[];
  const state={image,employee,instance,mirror,policy:null,healthy:true,ready:true,mayCreate:true,matches:[]};
  const db = { from(table) {
    assert.ok(["studio_managed_budgets", "agents","studio_employees"].includes(table), `Unexpected workstation query: ${table}`);
    return { select() { return this; }, eq() { return this; }, update(value){writes.push({table,value});return this;},
      async maybeSingle() { return { data: table === "agents" ? state.mirror : state.policy, error: null }; },
      then(resolve){return Promise.resolve({error:null}).then(resolve);},
    };
  } };
  globalThis.__workstationBoundary = { image,
    rpc: async (_db,name,args) => {
      writes.push({rpc:name,args});
      if(name==="claim_studio_employee_provision")return employee;
      if(name==="claim_studio_employee_creation")return state.mayCreate;
      if(name==="ready_studio_employee")return state.ready;
      assert.equal(name,"bind_studio_employee_instance");return true;
    },
    agent37: {
      getAgent: async id => { calls.push(`get:${id}`); return instance; },
      health: async id => { calls.push(`health:${id}`); return { ok: true, healthy: state.healthy }; },
      start:async id=>{calls.push(`start:${id}`);},
      createAgent:async body=>{calls.push("create");writes.push({create:body});return instance;},
      listAgents:async()=>{calls.push("list");return {data:state.matches};},
      getBudget:async id=>{calls.push(`budget:${id}`);return {monthly_period:"2026-10",monthly_cap_micros:5000000};},
    },
  };
  try {
    const workstation = await loadModule("../../src/studio/workstation.ts", {
      "server-only": "", "./workstation-image.json":"export default globalThis.__workstationBoundary.image;",
      "@/lib/agent37": "export const agent37=globalThis.__workstationBoundary.agent37;",
      "./assignment-server": "export const assignmentRpc=(...args)=>globalThis.__workstationBoundary.rpc(...args);",
      "./employee-auth": "export const issueEmployeeToken=()=>{throw Error('Unexpected capability issue');};export const hashEmployeeToken=()=>{throw Error('Unexpected token mutation');};",
      "./paid-capacity":"export const initialWorkstationCap=async()=>5000000;export const confirmInitialWorkstationCap=async()=>{};",
    });
    await run({ ...workstation, state,image,employee,instance,mirror,calls,writes,db, identity: { workspaceId: "studio", userId: "owner", assignmentId: "assignment" } });
  } finally { delete globalThis.__workstationBoundary; }
}

test("canonical Robyn reuses the owned shared workstation at its exact published image", async () => {
  await workstationBoundary(async ({ ensureEmployeeInstance, employeeTemplate,image,employee,instance,calls,writes,db,identity }) => {
    assert.equal(employeeTemplate(employee),image.template);
    assert.equal(await ensureEmployeeInstance(db, identity, employee), instance);
    assert.deepEqual(calls, ["get:persistent", "health:persistent"]);
    assert.equal(instance.name,"Robyn");assert.deepEqual(instance.resources,image.resources);
    assert.deepEqual(writes.map(write=>write.rpc),["claim_studio_employee_provision","ready_studio_employee"]);
  });
});

test("retired Research and Craft identities cannot provision or operate shared Robyn",async()=>{
  for(const retired of [{employee_key:"research",kind:"specialist",app_id:"research"},{employee_key:"solidcraft",kind:"specialist",app_id:"solidcraft"},{employee_key:"director"},{retired_at:"2026-10-29T00:00:00Z"},{kind:"specialist"},{app_id:"wordcraft"}]){
    await workstationBoundary(async({ensureEmployeeInstance,employeeTemplate,employee,calls,writes,db,identity})=>{
      Object.assign(employee,retired);
      assert.throws(()=>employeeTemplate(employee),/employee_retired/);
      await assert.rejects(ensureEmployeeInstance(db,identity,employee),/employee_retired/);
      assert.deepEqual(calls,[]);assert.deepEqual(writes,[]);
    });
  }
});

test("an unconfirmed shared image stops before provider operations or provisioning claims",async()=>{
  await workstationBoundary(async({ensureEmployeeInstance,state,employee,calls,writes,db,identity})=>{
    state.image.release="pending";
    await assert.rejects(ensureEmployeeInstance(db,identity,employee),/workstation_image_pending/);
    assert.deepEqual(calls,[]);assert.deepEqual(writes,[]);
  });
});

test("Robyn requires matching owner metadata and the exact owned mirror before health or start",async()=>{
  for(const [tamper,error] of [
    [state=>state.employee.workspace_id="foreign","workstation_ownership_mismatch"],
    [state=>state.instance.metadata.app_workspace="foreign","workstation_ownership_mismatch"],
    [state=>state.instance.metadata.studio_employee="foreign","workstation_ownership_mismatch"],
    [state=>state.instance.id="foreign","workstation_ownership_mismatch"],
    [state=>state.mirror.workspace_id="foreign","workstation_mirror_mismatch"],
    [state=>state.mirror.agent37_id="foreign","workstation_mirror_mismatch"],
    [state=>state.mirror=null,"workstation_mirror_mismatch"],
  ])await workstationBoundary(async({ensureEmployeeInstance,state,employee,calls,db,identity})=>{
    tamper(state);await assert.rejects(ensureEmployeeInstance(db,identity,employee),new RegExp(error));
    assert.deepEqual(calls,["get:persistent"]);
  });
});

test("template revision and installed digest must both match; a matching image_ref cannot hide digest drift",async()=>{
  for(const tamper of [state=>state.mirror.template="robyn-studio-old@1",state=>state.instance.template="robyn-cadcraft@1",state=>state.instance.template_revision=2,state=>state.instance.image_digest=null,state=>{state.instance.image_digest=`sha256:${"b".repeat(64)}`;state.instance.image_ref=`ghcr.io/example/studio@${state.image.release}`;}])await workstationBoundary(async({ensureEmployeeInstance,state,employee,calls,db,identity})=>{
    tamper(state);await assert.rejects(ensureEmployeeInstance(db,identity,employee),/workstation_release_mismatch/);assert.deepEqual(calls,["get:persistent"]);
  });
  await workstationBoundary(async({ensureEmployeeInstance,state,employee,instance,db,identity})=>{
    instance.image_ref=`ghcr.io/example/studio@${state.image.release}`;instance.image_digest=null;
    assert.equal(await ensureEmployeeInstance(db,identity,employee),instance,"legacy digest-bearing image_ref still proves exact bytes");
  });
});

test("sleeping Robyn starts once and waits for a later healthy observation",async()=>{
  await workstationBoundary(async({ensureEmployeeInstance,state,employee,instance,calls,db,identity})=>{
    instance.status="sleeping";assert.equal(await ensureEmployeeInstance(db,identity,employee),null);assert.deepEqual(calls,["get:persistent","start:persistent"]);
    instance.status="running";state.healthy=false;assert.equal(await ensureEmployeeInstance(db,identity,employee),null);
    state.healthy=true;assert.equal(await ensureEmployeeInstance(db,identity,employee),instance);
    assert.equal(calls.filter(call=>call.startsWith("start:")).length,1);
  });
});

test("one claimed Robyn creation uses the shared image and server resources with exact ownership",async()=>{
  await workstationBoundary(async({ensureEmployeeInstance,image,employee,instance,calls,writes,db,identity})=>{
    employee.instance_id=null;employee.provision_attempt="attempt";instance.metadata.studio_provision_attempt="attempt";
    assert.equal(await ensureEmployeeInstance(db,identity,employee),instance);
    const created=writes.find(write=>write.create).create;
    assert.deepEqual(created,{template:image.template,name:"Robyn",user:"owner",resources:{cpu:4,memory:16,disk:10},type:"default",region:"us",budget:{monthly_cap_micros:5000000},auto_sleep:true,idle_timeout_seconds:3600,metadata:{app_workspace:"studio",studio_employee:"employee",studio_provision_attempt:"attempt"}});
    assert.deepEqual(calls,["create","budget:persistent","health:persistent"]);
    assert.deepEqual(writes.filter(write=>write.rpc).map(write=>write.rpc),["claim_studio_employee_provision","claim_studio_employee_creation","bind_studio_employee_instance","ready_studio_employee"]);
  });
});

test("an uncertain creation reconciles the same persisted attempt without creating again",async()=>{
  await workstationBoundary(async({ensureEmployeeInstance,state,employee,instance,calls,db,identity})=>{
    employee.instance_id=null;employee.provision_attempt="attempt";state.mayCreate=false;
    instance.metadata.studio_provision_attempt="attempt";state.matches=[{...instance,id:"unrelated",metadata:{...instance.metadata,app_workspace:"foreign"}},instance];
    assert.equal(await ensureEmployeeInstance(db,identity,employee),instance);assert.deepEqual(calls,["list","budget:persistent","health:persistent"]);
    state.matches=[];calls.length=0;assert.equal(await ensureEmployeeInstance(db,identity,employee),null);assert.deepEqual(calls,["list"]);
    state.matches=[instance,{...instance,id:"duplicate"}];calls.length=0;await assert.rejects(ensureEmployeeInstance(db,identity,employee),/workstation_identity_ambiguous/);assert.deepEqual(calls,["list"]);
  });
});
