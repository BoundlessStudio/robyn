import "server-only";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import type { Agent } from "@/lib/types";
import { DEFAULT_AGENT } from "@/config/agents";
import { studioTools as studioApps } from "./tools";
import { isEmployeeReady } from "./manifest";
import { issueEmployeeToken } from "./employee-auth";
import { assignmentRpc } from "./assignment-server";
import type { Assignment, AssignmentIdentity, StudioEmployee } from "./assignments";
import release from "./workstation-release.json";

export class WorkstationConfigurationError extends Error {}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function employeeTemplate(employee: StudioEmployee) {
  if (employee.kind === "director") return DEFAULT_AGENT.template;
  const app = studioApps.find(app => app.id === employee.app_id);
  if (!app || !isEmployeeReady(app) || !app.workstation.template) throw new WorkstationConfigurationError("integration_pending");
  return app.workstation.template;
}

function ownedWorkstation(instance: Agent, identity: AssignmentIdentity, employee: StudioEmployee) {
  if (instance.metadata?.app_workspace !== identity.workspaceId || instance.metadata?.studio_employee !== employee.id) {
    throw new WorkstationConfigurationError("workstation_ownership_mismatch");
  }
}
function matchingTemplate(instance: Agent, template: string) {
  const [name, revision] = template.split("@");
  return (instance.template === name || instance.template === template)
    && (!revision || (/^\d+$/.test(revision) ? instance.template_revision === Number(revision) : instance.image_ref?.endsWith(`:${revision}`)));
}

/** A create attempt is recorded before the upstream request. Recovery only
 * adopts an exact metadata match, including its persistent attempt UUID. */
export async function ensureEmployeeInstance(db: DB, identity: AssignmentIdentity, employee: StudioEmployee): Promise<Agent | null> {
  // Existing paid results may still be collected by their bound workstation.
  // New setup waits while the owner allocation is being synchronized.
  const {data:budgetPolicy,error:budgetError}=await db.from("studio_managed_budgets").select("sync_state").eq("workspace_id",identity.workspaceId).maybeSingle();
  if(budgetError)throw new Error("Studio budget unavailable");
  if(budgetPolicy&&budgetPolicy.sync_state!=="synced")return null;
  const template = employeeTemplate(employee);
  const args = { p_workspace: identity.workspaceId, p_user: identity.userId, p_employee: employee.id };
  employee = await assignmentRpc<StudioEmployee>(db, "claim_studio_employee_provision", args);
  let instance: Agent;
  if (employee.instance_id) {
    instance = await agent37.getAgent(employee.instance_id);
    ownedWorkstation(instance, identity, employee);
    if (!matchingTemplate(instance, template)) throw new WorkstationConfigurationError("workstation_release_mismatch");
  } else {
    if (!employee.provision_attempt) throw new WorkstationConfigurationError("workstation_provision_failed");
    const creationArgs = { ...args, p_attempt: employee.provision_attempt };
    const mayCreate = await assignmentRpc<boolean>(db, "claim_studio_employee_creation", creationArgs);
    if (mayCreate) {
      instance = await agent37.createAgent({
        template, name: `Robyn · ${employee.role}`, user: identity.userId,
        resources: { cpu: DEFAULT_AGENT.cpu, memory: DEFAULT_AGENT.memory, disk: DEFAULT_AGENT.disk },
        budget: { monthly_cap_micros: Number(employee.monthly_cap_micros ?? 0) },
        auto_sleep: true, idle_timeout_seconds: 900,
        metadata: { app_workspace: identity.workspaceId, studio_employee: employee.id, studio_provision_attempt: employee.provision_attempt },
      });
    } else {
      const matches = (await agent37.listAgents()).data.filter(instance => instance.metadata?.app_workspace === identity.workspaceId
        && instance.metadata?.studio_employee === employee.id && instance.metadata?.studio_provision_attempt === employee.provision_attempt);
      if (matches.length > 1) throw new WorkstationConfigurationError("workstation_identity_ambiguous");
      if (!matches.length) return null;
      instance = matches[0];
    }
    ownedWorkstation(instance, identity, employee);
    if (!matchingTemplate(instance, template)) throw new WorkstationConfigurationError("workstation_release_mismatch");
    if (!await assignmentRpc<boolean>(db, "bind_studio_employee_instance", { ...creationArgs, p_instance: instance.id, p_template: template, p_resources: instance.resources })) return null;
  }
  if (["stopped", "sleeping"].includes(instance.status)) { await agent37.start(instance.id); return null; }
  if (instance.status !== "running") return null;
  const health = await agent37.health(instance.id);
  return health.ok && health.healthy ? instance : null;
}

async function runtimeFile(name: keyof typeof release.files): Promise<Buffer> {
  const bytes = await readFile(path.join(process.cwd(), "vendor/robyn-workstation", path.basename(release.directory), name));
  const expected = release.files[name];
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) throw new WorkstationConfigurationError("workstation_release_integrity_failed");
  return bytes;
}

/** Called only inside a step. Credentials never become workflow arguments,
 * return values or logs. A remote generation fence rejects delayed old setup. */
export async function prepareEmployeeAssignment(db: DB, identity: AssignmentIdentity, assignment: Assignment, employee: StudioEmployee, instance: Agent) {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (site.protocol !== "https:" || storage.protocol !== "https:" || !assignment.employee_generation) throw new WorkstationConfigurationError("workstation_configuration_missing");
  const storageOrigins = [storage.origin];
  if (storage.hostname.endsWith(".supabase.co")) storageOrigins.push(`https://${storage.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}`);
  const directory = `/home/node/.robyn/setup/${randomUUID()}`;
  const artifacts = new Map<string, Buffer>([
    ["studio-mcp.cjs", await runtimeFile("studio-mcp.cjs")],
    ["configure-hermes.py", await runtimeFile("configure-hermes.py")],
  ]);
  if (employee.app_id) {
    const key = `skills/${employee.app_id}.md` as keyof typeof release.files;
    if (!(key in release.files)) throw new WorkstationConfigurationError("employee_skill_missing");
    artifacts.set("SKILL.md", await runtimeFile(key));
  }
  artifacts.set("SOUL.md", Buffer.from(`${employee.instructions}\n\nRead studio_context before each assignment. Work only in its workRoot. Never read credentials or other projects.\n`));
  const token = await issueEmployeeToken(db, assignment.id, instance.id);
  const credential = Buffer.from(JSON.stringify({
    endpoint: `${site.origin}/api/studio/mcp`, token, assignmentId: assignment.id, appId: employee.app_id,
    workRoot: `/home/node/.robyn/work/${assignment.id}`, stateRoot: `/home/node/.robyn/state/${assignment.id}`, storageOrigins,
  }));
  const made = await agent37.exec(instance.id, `mkdir -p '${directory}' && chmod 700 '${directory}'`);
  if (made.exit_code !== 0) throw new Error("Workstation setup folder unavailable");
  for (const [name, bytes] of artifacts) await agent37.writeWorkstationFile(instance.id, `${directory}/${name}`, bytes);
  await agent37.writeWorkstationFile(instance.id, `${directory}/assignment.json`, credential);
  // Only trusted UUIDs, integer generations and pinned digests enter this script.
  // Secret bytes are transferred through the Files API, never a shell command.
  const manifest = Object.fromEntries([...artifacts].map(([name, bytes]) => [name, sha256(bytes)]));
  const activation = await agent37.exec(instance.id, `python3 - <<'PY'
import fcntl, hashlib, json, os, shutil, subprocess
from pathlib import Path
root=Path('/home/node/.robyn')
source=Path('${directory}')
generation=${assignment.employee_generation}
expected=${JSON.stringify(manifest)}
with (root/'activation.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    owner=root/'assignment-generation'
    if owner.exists() and int(owner.read_text()) > generation:
        raise RuntimeError('Superseded assignment')
    for name,digest in expected.items():
        if hashlib.sha256((source/name).read_bytes()).hexdigest()!=digest: raise RuntimeError('Runtime integrity failed')
    bundle=root/'studio-mcp-v${release.version}.cjs'
    if bundle.exists() and hashlib.sha256(bundle.read_bytes()).hexdigest()!=expected['studio-mcp.cjs']:
        raise RuntimeError('Installed runtime version is immutable')
    shutil.copyfile(source/'studio-mcp.cjs',bundle)
    shutil.copyfile(source/'configure-hermes.py',root/'configure-hermes.py')
    hermes=Path('/home/node/.hermes')
    hermes.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source/'SOUL.md',hermes/'SOUL.md')
    if (source/'SKILL.md').exists():
        skill=hermes/'skills'/'robyn-${employee.app_id ?? "director"}'
        skill.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source/'SKILL.md',skill/'SKILL.md')
    os.chmod(source/'assignment.json',0o600)
    os.replace(source/'assignment.json',root/'active-assignment.json')
    owner.write_text(str(generation))
    hook=Path('/home/node/.agent37/hooks/post-restart.sh')
    hook.parent.mkdir(parents=True,exist_ok=True)
    content=hook.read_text() if hook.exists() else '#!/bin/bash'+chr(10)
    line='/usr/local/lib/hermes/hermes-agent/venv/bin/python /home/node/.robyn/configure-hermes.py'
    if line not in content: hook.write_text(content.rstrip()+chr(10)+line+chr(10))
    subprocess.run(['/usr/local/lib/hermes/hermes-agent/venv/bin/python',str(root/'configure-hermes.py')],check=True,stdout=subprocess.DEVNULL)
    # Hermes caches MCP discovery for its process lifetime. A new pinned client
    # must cross a real restart before production can use its changed toolset.
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()+':'+Path('/proc/1/stat').read_text().rsplit(') ',1)[1].split()[19]
    refresh=root/'runtime-refresh.json'
    state=json.loads(refresh.read_text()) if refresh.exists() else {}
    if state.get('fingerprint')!='${release.fingerprint}':
        state={'fingerprint':'${release.fingerprint}','boot':boot,'pending':True}
    needs_restart=state.get('pending',True) and state.get('boot')==boot
    if not needs_restart: state['pending']=False
    temporary=refresh.with_suffix('.tmp')
    temporary.write_text(json.dumps(state))
    os.replace(temporary,refresh)
shutil.rmtree(source)
print(json.dumps({'needsRestart':needs_restart}))
PY`);
  if (activation.exit_code !== 0) throw new Error("Employee assignment preparation failed");
  const activated = JSON.parse(activation.stdout.trim()) as { needsRestart?: boolean };
  if (typeof activated.needsRestart !== "boolean") throw new Error("Employee runtime activation was not confirmed");
  if (activated.needsRestart) {
    await agent37.restart(instance.id);
    return false;
  }
  await agent37.editAgent(instance.id, { auto_sleep: true, idle_timeout_seconds: 900 });
  await assignmentRpc<boolean>(db, "ready_studio_employee", { p_workspace: identity.workspaceId, p_user: identity.userId, p_employee: employee.id, p_instance: instance.id });
  return true;
}
