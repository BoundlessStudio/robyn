import "server-only";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import type { Agent } from "@/lib/types";
import { STUDIO_WORKSTATION_DEFAULTS } from "@/config/agents";
import { hashEmployeeToken, issueEmployeeToken } from "./employee-auth";
import { assignmentRpc } from "./assignment-server";
import type { Assignment, AssignmentIdentity, StudioEmployee } from "./assignments";
import { matchingWorkstationRelease, ownedWorkstation, ownedWorkstationMirror, WorkstationConfigurationError } from "./workstation-upgrades";
import { initialWorkstationCap, confirmInitialWorkstationCap } from "./paid-capacity";
import { robyn } from "./robyn";
import release from "./workstation-release.json";
import image from "./workstation-image.json";

export { WorkstationConfigurationError } from "./workstation-upgrades";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function employeeTemplate(employee: StudioEmployee) {
  if (employee.retired_at || employee.employee_key !== "robyn" || employee.kind !== "director" || employee.app_id !== null) throw new WorkstationConfigurationError("employee_retired");
  if (!/^robyn-studio-[0-9-]+@[1-9][0-9]*$/.test(image.template) || !/^sha256:[a-f0-9]{64}$/.test(image.release)) throw new WorkstationConfigurationError("workstation_image_pending");
  return image.template;
}

/** Creation is claimed before POST. An unknown result is reconciled through
 * exact persisted ownership metadata, never another create request. */
export async function ensureEmployeeInstance(db: DB, identity: AssignmentIdentity, employee: StudioEmployee, _options?: { allowPreviousForMediaRecovery: true }): Promise<Agent | null> {
  const template = employeeTemplate(employee);
  const {data:policy,error}=await db.from("studio_managed_budgets").select("sync_state,cap_sync").eq("workspace_id",identity.workspaceId).maybeSingle();
  if(error)throw new Error("Studio budget unavailable");
  if(policy&&(policy.sync_state!=="synced"||policy.cap_sync))return null;
  const args={p_workspace:identity.workspaceId,p_user:identity.userId,p_employee:employee.id};
  employee=await assignmentRpc<StudioEmployee>(db,"claim_studio_employee_provision",args);
  employeeTemplate(employee);
  let instance:Agent;
  if(employee.instance_id){
    instance=await agent37.getAgent(employee.instance_id);
    const {data:mirror,error}=await db.from("agents").select("agent37_id,workspace_id,template").eq("workspace_id",identity.workspaceId).eq("agent37_id",employee.instance_id).maybeSingle();
    if(error)throw new Error("Studio workstation mirror unavailable");
    ownedWorkstationMirror(instance,identity,employee,mirror);
    if(mirror?.template!==template||!matchingWorkstationRelease(instance,{template,release:image.release}))throw new WorkstationConfigurationError("workstation_release_mismatch");
    await confirmInitialWorkstationCap(db,employee);
  }else{
    if(!employee.provision_attempt)throw new WorkstationConfigurationError("workstation_provision_failed");
    const creation={...args,p_attempt:employee.provision_attempt};
    const mayCreate=await assignmentRpc<boolean>(db,"claim_studio_employee_creation",creation);
    if(mayCreate){
      const cap=await initialWorkstationCap(db,employee);
      instance=await agent37.createAgent({...STUDIO_WORKSTATION_DEFAULTS,template,name:"Robyn",user:identity.userId,budget:{monthly_cap_micros:cap},
        metadata:{app_workspace:identity.workspaceId,studio_employee:employee.id,studio_provision_attempt:employee.provision_attempt}});
    }else{
      const matches=(await agent37.listAgents()).data.filter(i=>i.metadata?.app_workspace===identity.workspaceId&&i.metadata?.studio_employee===employee.id&&i.metadata?.studio_provision_attempt===employee.provision_attempt);
      if(matches.length>1)throw new WorkstationConfigurationError("workstation_identity_ambiguous");
      if(!matches.length)return null;
      instance=matches[0];
    }
    ownedWorkstation(instance,identity,employee);
    if(!matchingWorkstationRelease(instance,{template,release:image.release}))throw new WorkstationConfigurationError("workstation_release_mismatch");
    if(!await assignmentRpc<boolean>(db,"bind_studio_employee_instance",{...creation,p_instance:instance.id,p_template:template,p_resources:instance.resources}))return null;
    const budget=await agent37.getBudget(instance.id);
    const {error}=await db.from("studio_employees").update({budget_cap_period:budget.monthly_period,budget_cap_micros:budget.monthly_cap_micros}).eq("workspace_id",identity.workspaceId).eq("id",employee.id).eq("instance_id",instance.id);
    if(error)throw new Error("Studio budget receipt unavailable");
  }
  if(["stopped","sleeping"].includes(instance.status)){await agent37.start(instance.id);return null;}
  if(instance.status!=="running")return null;
  const health=await agent37.health(instance.id);
  if(!health.ok||!health.healthy)return null;
  if(!await assignmentRpc<boolean>(db,"ready_studio_employee",{...args,p_instance:instance.id}))return null;
  return instance;
}

async function runtimeFile(name:keyof typeof release.files):Promise<Buffer>{
  const bytes=await readFile(path.join(process.cwd(),"vendor/robyn-workstation",path.basename(release.directory),name));
  const expected=release.files[name];
  if(bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)throw new WorkstationConfigurationError("workstation_release_integrity_failed");
  return bytes;
}

/** Each run has an immutable Hermes profile, credential and transfer state.
 * A delayed MCP process can never adopt the next task's credential. */
export async function prepareEmployeeAssignment(db:DB,identity:AssignmentIdentity,assignment:Assignment,employee:StudioEmployee,instance:Agent){
  employeeTemplate(employee);
  const site=new URL(process.env.NEXT_PUBLIC_SITE_URL??"");
  const storage=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
  const generation=assignment.employee_generation,profile=assignment.workstation_profile;
  if(site.protocol!=="https:"||storage.protocol!=="https:"||assignment.execution_model!=="robyn"||!Number.isSafeInteger(generation)||!generation||!profile||!/^robyn-[a-z0-9_-]{1,57}$/.test(profile)||!assignment.allowed_app_ids?.length)throw new WorkstationConfigurationError("workstation_configuration_missing");
  const storageOrigins=[storage.origin];
  if(storage.hostname.endsWith(".supabase.co"))storageOrigins.push(`https://${storage.hostname.replace(/\.supabase\.co$/,".storage.supabase.co")}`);
  const directory=`/home/node/.robyn/setup/${randomUUID()}`;
  const artifacts=new Map<string,Buffer>([["studio-mcp.cjs",await runtimeFile("studio-mcp.cjs")],["configure-hermes.py",await runtimeFile("configure-hermes.py")]]);
  for(const name of Object.keys(release.files).filter(name=>name.startsWith("skills/")))artifacts.set(name,await runtimeFile(name as keyof typeof release.files));
  artifacts.set("SOUL.md",Buffer.from(robyn.instructions+"\n"));
  const token=await issueEmployeeToken(db,assignment.id,instance.id,{generation,profile});
  const credential=Buffer.from(JSON.stringify({endpoint:`${site.origin}/api/studio/mcp`,token,kind:"robyn",assignmentId:assignment.id,generation,profile,allowedAppIds:assignment.allowed_app_ids,appIdHint:assignment.app_id??null,
    workRoot:`/home/node/.robyn/work/${assignment.id}`,stateRoot:`/home/node/.robyn/state/${assignment.id}/${generation}`,storageOrigins}));
  const made=await agent37.exec(instance.id,`mkdir -p '${directory}/skills' && chmod 700 '${directory}' '${directory}/skills'`);
  if(made.exit_code!==0)throw new Error("Workstation setup folder unavailable");
  for(const [name,bytes] of artifacts)await agent37.writeWorkstationFile(instance.id,`${directory}/${name}`,bytes);
  await agent37.writeWorkstationFile(instance.id,`${directory}/assignment.json`,credential);
  const manifest=Object.fromEntries([...artifacts].map(([name,bytes])=>[name,sha256(bytes)]));
  // No secrets enter shell text or exec output. Config is atomically installed
  // once; a retry uses the original credential and revokes its unused new one.
  const activation=await agent37.exec(instance.id,`python3 - <<'PY'
import fcntl, hashlib, json, os, shutil, subprocess
from pathlib import Path
root=Path('/home/node/.robyn')
source=Path('${directory}')
generation=${generation}
expected=${JSON.stringify(manifest)}
with (root/'activation.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    owner=root/'assignment-generation'
    if owner.exists() and int(owner.read_text())>generation: raise RuntimeError('Superseded assignment')
    for name,digest in expected.items():
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest: raise RuntimeError('Runtime integrity failed')
    bundle=root/'studio-mcp-v${release.version}.cjs'
    helper=root/'configure-hermes-v${release.version}.py'
    for origin,target in [(source/'studio-mcp.cjs',bundle),(source/'configure-hermes.py',helper)]:
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=hashlib.sha256(origin.read_bytes()).hexdigest(): raise RuntimeError('Installed runtime is immutable')
        if not target.exists(): shutil.copyfile(origin,target)
    incoming=json.loads((source/'assignment.json').read_text())
    folder=root/'tasks'/'${assignment.id}'/str(generation)
    folder.mkdir(parents=True,mode=0o700,exist_ok=True)
    config=folder/'assignment.json'
    reused=config.exists()
    if reused:
        saved=json.loads(config.read_text())
        if {k:v for k,v in saved.items() if k!='token'}!={k:v for k,v in incoming.items() if k!='token'}: raise RuntimeError('Task configuration is immutable')
    else:
        os.chmod(source/'assignment.json',0o600)
        os.replace(source/'assignment.json',config)
    Path(incoming['workRoot']).mkdir(parents=True,mode=0o700,exist_ok=True)
    Path(incoming['stateRoot']).mkdir(parents=True,mode=0o700,exist_ok=True)
    python='/usr/local/lib/hermes/hermes-agent/venv/bin/python'
    subprocess.run([python,str(helper)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([python,str(helper),'--config',str(config),'--expected-assignment','${assignment.id}','--expected-generation',str(generation),'--expected-profile','${profile}','--bundle',str(bundle),'--soul',str(source/'SOUL.md'),'--skills-dir',str(source/'skills')],check=True,stdout=subprocess.DEVNULL)
    owner.write_text(str(generation))
    hook=Path('/home/node/.agent37/hooks/post-restart.sh')
    hook.parent.mkdir(parents=True,exist_ok=True)
    content=hook.read_text() if hook.exists() else '#!/bin/bash'+chr(10)
    line=python+' '+str(helper)
    if line not in content: hook.write_text(content.rstrip()+chr(10)+line+chr(10))
shutil.rmtree(source)
print(json.dumps({'profile':'${profile}','generation':generation,'reusedConfig':reused,'credentialHash':hashlib.sha256(json.loads(config.read_text())['token'].encode()).hexdigest()}))
PY`);
  if(activation.exit_code!==0)throw new Error("Robyn task preparation failed");
  const activated=JSON.parse(activation.stdout.trim()) as {profile:string;generation:number;reusedConfig:boolean;credentialHash:string};
  if(activated.profile!==profile||activated.generation!==generation||typeof activated.reusedConfig!=="boolean"||!/^[a-f0-9]{64}$/.test(activated.credentialHash))throw new Error("Robyn task preparation was not confirmed");
  if(activated.reusedConfig){const {error}=await db.from("studio_employee_tokens").update({revoked_at:new Date().toISOString()}).eq("assignment_id",assignment.id).eq("token_hash",hashEmployeeToken(token));if(error)throw new Error("Unused task credential revocation failed");}
  else if(activated.credentialHash!==hashEmployeeToken(token))throw new Error("Robyn task credential changed during preparation");
  // Reusing immutable bytes is safe only while that exact token is still
  // authorized. Expiry never silently installs a different capability.
  const {data:scope,error:scopeError}=await db.rpc("studio_employee_scope",{p_hash:activated.credentialHash});
  if(scopeError||!scope||scope.kind!=="robyn"||scope.assignmentId!==assignment.id||scope.generation!==generation||scope.profile!==profile||scope.instanceId!==instance.id)throw new WorkstationConfigurationError("assignment_credential_expired");
  return assignmentRpc<boolean>(db,"ready_studio_employee",{p_workspace:identity.workspaceId,p_user:identity.userId,p_employee:employee.id,p_instance:instance.id});
}
