import type { Agent } from "@/lib/types";
import type { AssignmentFence, AssignmentIdentity, StudioEmployee } from "./assignments";

export class WorkstationConfigurationError extends Error {}

export interface WorkstationRelease { template: string; release: string }
export interface WorkstationMirror { agent37_id: string; workspace_id: string; template: string | null }
export interface WorkstationUpgrade {
  id: string; workspace_id: string; employee_id: string; instance_id: string;
  from_template: string; target_template: string; target_digest: string;
  state: "pending" | "dispatched" | "ready" | "superseded";
}

export function matchingWorkstationTemplate(instance: Agent, template: string) {
  const [name, revision] = template.split("@");
  return (instance.template === name || instance.template === template)
    && (!revision || (/^\d+$/.test(revision)
      ? instance.template_revision === Number(revision)
      : instance.image_ref?.endsWith(`:${revision}`)));
}

export function ownedWorkstation(instance: Agent, identity: Pick<AssignmentIdentity,"workspaceId">, employee: StudioEmployee) {
  if (employee.workspace_id !== identity.workspaceId
    || employee.instance_id && employee.instance_id !== instance.id
    || instance.metadata?.app_workspace !== identity.workspaceId || instance.metadata?.studio_employee !== employee.id) {
    throw new WorkstationConfigurationError("workstation_ownership_mismatch");
  }
}

export function ownedWorkstationMirror(instance: Agent, identity: Pick<AssignmentIdentity,"workspaceId">, employee: StudioEmployee, mirror: WorkstationMirror | null) {
  ownedWorkstation(instance, identity, employee);
  if (employee.instance_id !== instance.id || !mirror || mirror.agent37_id !== instance.id
    || mirror.workspace_id !== identity.workspaceId) {
    throw new WorkstationConfigurationError("workstation_mirror_mismatch");
  }
}

function observedDigest(instance: Agent) {
  // https://www.agent37.com/docs/agents-api/instances/object.md:
  // cloud-build image_ref is null; image_digest identifies the installed bytes.
  return instance.image_digest ?? instance.image_ref?.match(/(?:^|@)(sha256:[0-9a-f]{64})$/)?.[1] ?? null;
}

export function matchingWorkstationRelease(instance: Agent, target: WorkstationRelease) {
  return matchingWorkstationTemplate(instance, target.template) && observedDigest(instance) === target.release;
}

function hasAssignmentFence(identity: AssignmentIdentity): identity is AssignmentFence {
  return "workflowId" in identity && typeof identity.workflowId === "string" && Boolean(identity.workflowId)
    && "attemptId" in identity && typeof identity.attemptId === "string" && Boolean(identity.attemptId);
}

interface UpgradeIO {
  claim: (from: WorkstationRelease, fence: AssignmentFence) => Promise<WorkstationUpgrade | null>;
  dispatch: (upgrade: WorkstationUpgrade, fence: AssignmentFence) => Promise<boolean>;
  update: (template: string) => Promise<unknown>;
  finish: () => Promise<boolean>;
}

/** The only external write follows an at-most-once database dispatch claim.
 * An acknowledgement is insufficient: a later GET must confirm the exact pin
 * and digest before the owned mirror is changed and an AI turn may start.
 * API contract: https://www.agent37.com/docs/agents-api/instances/update.md */
export async function prepareWorkstationRelease(input: {
  identity: AssignmentIdentity; employee: StudioEmployee; instance: Agent;
  mirror: WorkstationMirror | null; target: WorkstationRelease;
  previousReleases: readonly WorkstationRelease[]; upgrades: readonly WorkstationUpgrade[];
  allowPreviousForMediaRecovery?: boolean; io: UpgradeIO;
}): Promise<boolean> {
  const { identity, employee, instance, mirror, target, previousReleases, upgrades, io } = input;
  ownedWorkstationMirror(instance, identity, employee, mirror);
  if (employee.kind !== "specialist" || !/^robyn-[a-z0-9-]+@[1-9][0-9]*$/.test(target.template)
    || !/^sha256:[0-9a-f]{64}$/.test(target.release)) {
    throw new WorkstationConfigurationError("workstation_release_invalid");
  }
  if (mirror!.template !== target.template && !previousReleases.some(release => release.template === mirror!.template)) {
    throw new WorkstationConfigurationError("workstation_mirror_mismatch");
  }
  const records = upgrades.filter(upgrade => upgrade.employee_id === employee.id);
  if (records.some(upgrade => upgrade.workspace_id !== identity.workspaceId)) {
    throw new WorkstationConfigurationError("workstation_ownership_mismatch");
  }
  const current = records.find(upgrade => upgrade.instance_id === instance.id
    && upgrade.target_template === target.template && upgrade.target_digest === target.release);
  if (records.some(upgrade => upgrade.state === "dispatched" && upgrade !== current)) {
    throw new WorkstationConfigurationError("workstation_upgrade_uncertain");
  }
  const digest = observedDigest(instance);
  const targetTemplate = matchingWorkstationTemplate(instance, target.template);
  const targetMatches = targetTemplate && digest === target.release;
  if (current?.state === "ready" && !targetMatches) {
    throw new WorkstationConfigurationError("workstation_release_drift");
  }
  const stable = ["running", "sleeping", "stopped"].includes(instance.status);
  if (targetTemplate) {
    if (digest && digest !== target.release) throw new WorkstationConfigurationError("workstation_release_mismatch");
    if (!targetMatches || !stable) return false;
    // Even an already-current mirror must pass the database's outstanding
    // dispatch check. An earlier, delayed update must not race the next turn.
    const finished = await io.finish();
    if (mirror!.template !== target.template && !finished) {
      throw new WorkstationConfigurationError("workstation_mirror_mismatch");
    }
    return current?.state === "dispatched" || current?.state === "ready" ? finished : mirror!.template === target.template || finished;
  }
  // A lost reply is reconciled only through GET. Never send another update,
  // including when the instance still reports its previous image for days.
  if (current?.state === "dispatched") return false;
  const previous = previousReleases.find(release => matchingWorkstationTemplate(instance, release.template)
    && /^sha256:[0-9a-f]{64}$/.test(release.release) && (digest === release.release || digest === null));
  // Older instances predate image_digest. Their exact published template
  // revision can authorize the one migration; its resulting digest must still
  // be confirmed through GET before any AI turn starts on the target image.
  if (!previous) throw new WorkstationConfigurationError("workstation_release_mismatch");
  if (mirror!.template !== previous.template) throw new WorkstationConfigurationError("workstation_mirror_mismatch");
  if (!stable) return false;
  if (!hasAssignmentFence(identity)) {
    // Paid media recovery may use its already-known image, but cannot initiate
    // an image change without the assignment runner's idle-generation fence.
    return input.allowPreviousForMediaRecovery === true;
  }
  const upgrade = await io.claim(previous, identity);
  if (!upgrade) return false;
  if (upgrade.state === "ready") throw new WorkstationConfigurationError("workstation_release_drift");
  if (upgrade.state !== "pending" || !await io.dispatch(upgrade, identity)) return false;
  try { await io.update(target.template); } catch {
    // The persistent dispatched row survives a timeout, transport error, or
    // lost worker. None is evidence that the provider did not apply the image.
  }
  return false;
}
