import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/api-error";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import type { AssetRef } from "@/studio/assets";
import type { StudioEmployee } from "@/studio/assignments";
import type { StudioAppManifest } from "@/studio/manifest";
import { dbFailure, ownedProject, revisionFiles } from "@/studio/server";
import { ensureEmployeeInstance } from "@/studio/workstation";
import { matchingWorkstationRelease, ownedWorkstationMirror } from "@/studio/workstation-upgrades";
import image from "@/studio/workstation-image.json";
import { hash, mcpConfig, workerPath, workerToken } from "./config";
import { readAssetRef } from "./library";
import type { McpIdentity } from "./oauth";
import type { CraftRequest } from "./schemas";
import runtime from "./runtime-release.json";

export type DirectOperation = {
  id: string;
  request_key: string;
  workspace_id: string;
  project_id: string;
  grant_id: string;
  instance_id: string;
  app_id: string;
  request_hash: string;
  inputs: AssetRef[];
  save_spec: ({ name: string } | AssetRef) | null;
  save_asset_id: string | null;
  save_revision_id: string | null;
  dispatched_at: string | null;
  worker_started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
};

const root = "/home/node/.robyn/direct-mcp";
const quote = (text: string) => "'" + text.replaceAll("'", "'\"'\"'") + "'";

export function operationFailure(error: { message: string; code?: string } | null) {
  if (error?.message.includes("mcp workstation busy")) throw new ApiError(409, "workstation_busy", "A Studio job or direct Craft command holds this workstation. Wait for its confirmed result.");
  if (error?.message.includes("mcp workstation unavailable")) throw new ApiError(409, "workstation_unavailable", "The owned workstation is unavailable. Retry this same operation.");
  if (error?.message.includes("operation key reused")) throw new ApiError(409, "operation_key_reused", "Retry a Craft operation with its original arguments and connection.");
  dbFailure(error);
}

export async function currentRobyn(db: DB, workspaceId: string) {
  const { data, error } = await db.from("studio_employees").select("*").eq("workspace_id", workspaceId)
    .eq("employee_key", "robyn").is("retired_at", null).maybeSingle();
  dbFailure(error);
  if (!data) throw new ApiError(503, "robyn_unavailable", "Robyn's workstation is unavailable.");
  return data as StudioEmployee;
}

async function ownedInstance(identity: McpIdentity, instanceId?: string) {
  const { db, workspaceId } = identity;
  const employee = await currentRobyn(db, workspaceId);
  if (instanceId && employee.instance_id !== instanceId) throw new ApiError(409, "workstation_changed", "The operation belongs to the previous workstation. Recover its receipt before retrying.");
  if (!employee.instance_id || employee.provision_state !== "ready") {
    const instance = await ensureEmployeeInstance(db, identity, employee);
    if (instance) return instance;
    throw new ApiError(409, "workstation_starting", "Robyn's workstation is starting. Retry this same operation.");
  }
  const [instance, mirror] = await Promise.all([
    agent37.getAgent(employee.instance_id),
    db.from("agents").select("agent37_id,workspace_id,template").eq("agent37_id", employee.instance_id).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  dbFailure(mirror.error);
  ownedWorkstationMirror(instance, identity, employee, mirror.data);
  if (mirror.data?.template !== image.template || !matchingWorkstationRelease(instance, image)) {
    throw new ApiError(409, "workstation_release_mismatch", "Direct commands require the current verified Studio workstation.");
  }
  if (instance.status === "stopped") {
    await agent37.start(instance.id);
    throw new ApiError(409, "workstation_starting", "Robyn's workstation is starting. Retry this same operation.");
  }
  if (!["running", "sleeping"].includes(instance.status)) throw new ApiError(409, "workstation_unavailable", "The workstation is unavailable. Retry this same operation.");
  return instance;
}

function fingerprint(appId: string, request: CraftRequest) {
  return hash(JSON.stringify({ appId, request }, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : value));
}

async function validateInputs(identity: McpIdentity, app: StudioAppManifest, request: CraftRequest) {
  const project = await ownedProject(identity.db, identity.workspaceId, request.projectId);
  if (project.status !== "active") throw new ApiError(409, "project_archived", "Reactivate the project before running a Craft command.");
  if (request.save && app.editor.mode === "readOnly") throw new ApiError(400, "read_only_craft", "This Craft opens exact saved inputs and computes results in read-only mode.");
  if (request.save?.projectFiles && app.id !== "matcraft") throw new ApiError(400, "invalid_save", "Explicit numerical source files are available in MatCraft.");
  const distinct = new Set(request.inputs.map(ref => ref.revisionId));
  if (distinct.size !== request.inputs.length) throw new ApiError(400, "invalid_inputs", "Choose each input revision once.");
  const inputs = await Promise.all(request.inputs.map(ref => readAssetRef(identity, request.projectId, ref)));
  if (inputs.some(input => input.revision.state !== "committed")) throw new ApiError(409, "revision_not_saved", "Use committed library revisions as Craft inputs.");
  const files = (await Promise.all(inputs.map(input => revisionFiles(identity.db, identity.workspaceId, input.revision.id)))).flat();
  if (files.reduce((bytes, file) => bytes + Number(file.bytes), 0) > 1024 ** 3) {
    throw new ApiError(413, "craft_input_too_large", "Direct Craft commands accept up to 1 GiB of exact saved inputs per operation.");
  }
  if (!request.save) return null;
  const index = request.save.inputIndex;
  if (index === undefined && request.save.name) return { name: request.save.name };
  if (index !== undefined && !request.save.name && inputs[index]?.asset.app_id === app.id && inputs[index].asset.asset_kind === "native") return request.inputs[index];
  throw new ApiError(400, "invalid_save", "Name a new asset or select the exact base input from this Craft.");
}

async function readOperation(identity: McpIdentity, key: string) {
  const { data, error } = await identity.db.from("studio_mcp_operations").select("*")
    .eq("workspace_id", identity.workspaceId).eq("request_key", key).maybeSingle();
  dbFailure(error);
  if (data && data.grant_id !== identity.grantId) throw new ApiError(404, "not_found", "Craft operation not found for this connection.");
  return data as DirectOperation | null;
}

function publicOperation(op: DirectOperation) {
  return {
    operationId: op.request_key, appId: op.app_id, projectId: op.project_id,
    state: op.finished_at ? op.result?.outcome ?? "interrupted" : op.dispatched_at ? "running" : "preparing",
    ...(op.result ? { result: op.result } : {}),
  };
}

export async function getCraftOperation(identity: McpIdentity, key: string) {
  const op = await readOperation(identity, key);
  if (!op) throw new ApiError(404, "not_found", "Craft operation not found.");
  return publicOperation(op);
}

const runtimeFolder = `${root}/runtime/${runtime.fingerprint}`;
const files = Object.entries(runtime.files);
const checks = files.map(([name, entry]) => `${entry.sha256}  ${name}`).join("\n");
const verify = (folder: string) => `(cd ${quote(folder)} && printf '%s\\n' ${quote(checks)} | sha256sum -c --status)`;

async function prepareRuntime(instance: string, folder: string) {
  const initialized = await agent37.exec(instance, `umask 077; mkdir -p ${quote(folder)} ${quote(root + "/runtime")} && if ${verify(runtimeFolder)} 2>/dev/null; then printf ready; fi`);
  if (initialized.exit_code !== 0) throw new Error("Workstation folders unavailable");
  if (initialized.stdout === "ready") return;
  const stage = `${folder}/runtime-${randomUUID()}`;
  const created = await agent37.exec(instance, `umask 077; mkdir ${quote(stage)}`);
  if (created.exit_code !== 0) throw new Error("Workstation setup folder unavailable");
  for (const [name, expected] of files) {
    const bytes = await readFile(path.resolve(runtime.directory, name));
    if (bytes.length !== expected.bytes || hashBytes(bytes) !== expected.sha256) throw new Error("Direct runtime integrity failure");
    await agent37.writeWorkstationFile(instance, stage + "/" + name, bytes);
  }
  const installed = await agent37.exec(instance, `set -eu
${verify(stage)}
chmod 500 ${quote(stage + "/bwrap")}
mv -T -n ${quote(stage)} ${quote(runtimeFolder)}
${verify(runtimeFolder)}
if [ -d ${quote(stage)} ]; then
  rm -f ${files.map(([name]) => quote(stage + "/" + name)).join(" ")}
  rmdir ${quote(stage)}
fi`);
  if (installed.exit_code !== 0) throw new Error("Direct runtime installation was not confirmed");
}

const hashBytes = (value: Buffer) => createHash("sha256").update(value).digest("hex");

export async function runCraft(identity: McpIdentity, app: StudioAppManifest, request: CraftRequest) {
  const { db, workspaceId, userId, grantId } = identity;
  const { issuer } = mcpConfig();
  const requestHash = fingerprint(app.id, request);
  let operation = await readOperation(identity, request.operationId);
  if (operation && operation.request_hash !== requestHash) throw new ApiError(409, "operation_key_reused", "Retry the original Craft command with the same arguments.");
  if (operation?.finished_at) return publicOperation(operation);
  if (!issuer.startsWith("https://")) throw new ApiError(503, "workstation_unavailable", "Deploy the HTTPS Robyn endpoint before running direct commands on a workstation.");
  const save = operation ? operation.save_spec : await validateInputs(identity, app, request);
  const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (storage.protocol !== "https:") throw new ApiError(503, "storage_unavailable", "Private Storage requires HTTPS for Craft commands.");
  const storageOrigins = [storage.origin];
  if (storage.hostname.endsWith(".supabase.co")) storageOrigins.push(`https://${storage.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")}`);
  const instance = await ownedInstance(identity, operation?.instance_id);
  if (!operation) {
    const { data, error } = await db.rpc("reserve_studio_mcp_operation", {
      p_workspace: workspaceId, p_user: userId, p_grant: grantId, p_project: request.projectId, p_request: request.operationId,
      p_instance: instance.id, p_app: app.id, p_request_hash: requestHash, p_inputs: request.inputs, p_save: save,
    });
    operationFailure(error);
    operation = data as DirectOperation;
  }
  if (operation.finished_at) return publicOperation(operation);
  if (operation.instance_id !== instance.id) throw new ApiError(409, "workstation_changed", "The operation's workstation identity changed.");
  const op = operation;
  const folder = `${root}/${op.id}`;
  const configPath = `${folder}/config-${randomUUID()}.json`;
  const rpc = { p_operation: op.id, p_workspace: workspaceId, p_grant: grantId };
  try {
    await prepareRuntime(instance.id, folder);
    await agent37.writeWorkstationFile(instance.id, configPath, Buffer.from(JSON.stringify({
      endpoint: issuer + workerPath + "?operation=" + op.id, token: workerToken(op.id, instance.id),
      kind: "direct", assignmentId: op.id, appId: app.id, workRoot: folder + "/work",
      stateRoot: folder + "/state", storageOrigins, request,
    })));
  } catch {
    const { error } = await db.rpc("fail_prepared_studio_mcp_operation", rpc);
    operationFailure(error);
    throw new ApiError(503, "craft_preparation_failed", "The Craft worker could not be prepared. Check this operation before submitting another.");
  }
  const { data: dispatched, error } = await db.rpc("dispatch_studio_mcp_operation", { ...rpc, p_user: userId });
  operationFailure(error);
  if (!dispatched) {
    const { error } = await db.rpc("fail_prepared_studio_mcp_operation", rpc);
    operationFailure(error);
    return getCraftOperation(identity, request.operationId);
  }
  try {
    // The worker owns a persisted execution marker and an OS lock. Re-sending
    // this launcher can recover its result but cannot execute the commands twice.
    const launched = await agent37.exec(instance.id, `umask 077
nohup /bin/sh -s >/dev/null 2>&1 <<'ROBYN_DIRECT_WORKER' &
flock -n ${quote(folder + "/worker.lock")} timeout -k 5s 900s node ${quote(runtimeFolder + "/studio-mcp.cjs")} ${quote(configPath)} ${quote(runtimeFolder + "/bwrap")}
rm -f ${quote(configPath)}
ROBYN_DIRECT_WORKER`);
    if (launched.exit_code !== 0) throw new Error("Launcher unavailable");
  } catch {
    throw new ApiError(503, "craft_dispatch_unconfirmed", "The dispatch outcome is unknown. Check this operation or retry with the same operation ID and arguments.");
  }
  return getCraftOperation(identity, request.operationId);
}
