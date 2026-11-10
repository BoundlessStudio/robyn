import "server-only";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import type { Agent } from "@/lib/types";
import type { AssignmentIdentity, StudioEmployee } from "./assignments";
import { ownedWorkstationMirror, WorkstationConfigurationError, type WorkstationMirror } from "./workstation-upgrades";

type StudioIdentity = Pick<AssignmentIdentity, "workspaceId" | "userId">;
type NameMirror = WorkstationMirror & { name: string | null };

export function workstationName(studioName: string) {
  const studio = studioName.replace(/[\s\p{Cc}]+/gu, " ").trim();
  const name = studio ? `Robyn — ${studio}` : "Robyn";
  // Agent37 limits labels to 60 characters. Leave room for the ellipsis and
  // remove a trailing high surrogate if the cut landed inside a character.
  return name.length <= 60 ? name : `${name.slice(0, 59).replace(/[\uD800-\uDBFF]$/, "").trimEnd()}…`;
}

export async function readWorkstationName(db: DB, { workspaceId, userId }: StudioIdentity) {
  const { data, error } = await db.from("workspaces").select("name")
    .eq("id", workspaceId).eq("owner_id", userId).maybeSingle();
  if (error || !data) throw new Error("Studio name unavailable");
  return workstationName(data.name);
}

export async function readWorkstationNameMirror(db: DB, workspaceId: string, instanceId: string): Promise<NameMirror | null> {
  const { data, error } = await db.from("agents").select("agent37_id,workspace_id,template,name")
    .eq("workspace_id", workspaceId).eq("agent37_id", instanceId).maybeSingle();
  if (error) throw new Error("Studio workstation mirror unavailable");
  return data;
}

/** A label edit leaves the running container and its ownership metadata alone. */
export async function syncWorkstationName(db: DB, identity: StudioIdentity, employee: StudioEmployee,
  instance: Agent, mirror: NameMirror | null, name: string) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ownedWorkstationMirror(instance, identity, employee, mirror);
    if (instance.name === name && mirror?.name === name) return;

    if (instance.name !== name) {
      const edited = await agent37.editAgent(instance.id, { name });
      ownedWorkstationMirror(edited, identity, employee, mirror);
      if (edited.name !== name) throw new WorkstationConfigurationError("workstation_name_unconfirmed");
    }
    if (mirror?.name !== name) {
      const { data, error } = await db.from("agents").update({ name })
        .eq("workspace_id", identity.workspaceId).eq("agent37_id", instance.id).select("agent37_id").maybeSingle();
      if (error || data?.agent37_id !== instance.id) throw new WorkstationConfigurationError("workstation_mirror_unavailable");
    }

    // An older save can finish its provider call after another Studio rename.
    // Recheck the source and observe both records again before correcting it.
    const latestName = await readWorkstationName(db, identity);
    if (latestName === name) return;
    if (attempt === maxAttempts) break;
    name = latestName;
    [instance, mirror] = await Promise.all([
      agent37.getAgent(instance.id, AbortSignal.timeout(10_000)),
      readWorkstationNameMirror(db, identity.workspaceId, instance.id),
    ]);
  }
  throw new WorkstationConfigurationError("workstation_name_unconfirmed");
}

/** Sync an existing canonical workstation without starting or provisioning it. */
export async function syncOwnedWorkstationName(db: DB, identity: StudioIdentity) {
  const name = await readWorkstationName(db, identity);
  const { data, error } = await db.from("studio_employees").select("*")
    .eq("workspace_id", identity.workspaceId).eq("employee_key", "robyn").is("retired_at", null).maybeSingle();
  if (error) throw new WorkstationConfigurationError("workstation_binding_unavailable");
  const employee = data as StudioEmployee | null;
  if (!employee?.instance_id) return;
  if (employee.kind !== "director" || employee.app_id !== null) throw new WorkstationConfigurationError("workstation_ownership_mismatch");
  const mirror = await readWorkstationNameMirror(db, identity.workspaceId, employee.instance_id);
  if (!mirror) throw new WorkstationConfigurationError("workstation_mirror_mismatch");
  const instance = await agent37.getAgent(employee.instance_id, AbortSignal.timeout(10_000));
  await syncWorkstationName(db, identity, employee, instance, mirror, name);
}
