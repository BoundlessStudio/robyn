import "server-only";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/api-error";
import type { IntegrationConnection } from "@/lib/types";
import type { StudioEmployee } from "./assignments";
import { hasActiveMailbox, MAILCRAFT_LOCKED, isMailConnectionId, isMailProvider, type AssignmentMailbox, type MailConnection, type MailProvider } from "./connected-mail";
import { dbFailure } from "./server";
import { ownedWorkstationMirror } from "./workstation-upgrades";

/** The browser never chooses the instance. Match all three persisted identities
 * before using the instance's managed Composio entity, including while asleep. */
export async function ownedMailWorkstation(db: DB, workspaceId: string) {
  const { data, error } = await db.from("studio_employees").select("*")
    .eq("workspace_id", workspaceId).eq("employee_key", "robyn").is("retired_at", null).maybeSingle();
  dbFailure(error);
  const employee = data as StudioEmployee | null;
  if (!employee?.instance_id || employee.provision_state !== "ready") return null;
  if (employee.kind !== "director" || employee.app_id !== null) throw workstationUnavailable();

  const [instance, mirror] = await Promise.all([
    managedCall(() => agent37.getAgent(employee.instance_id!)),
    db.from("agents").select("agent37_id,workspace_id,template")
      .eq("workspace_id", workspaceId).eq("agent37_id", employee.instance_id).maybeSingle(),
  ]);
  dbFailure(mirror.error);
  try { ownedWorkstationMirror(instance, { workspaceId }, employee, mirror.data); }
  catch { throw workstationUnavailable(); }
  return instance;
}

function workstationUnavailable() {
  return new ApiError(409, "mail_workstation_unavailable", "Robyn’s owned workstation could not be confirmed.");
}

async function managedCall<T>(call: () => Promise<T>): Promise<T> {
  try { return await call(); }
  catch {
    throw new ApiError(502, "mail_provider_unavailable", "Agent37 could not confirm the mail connection request. Refresh the mailbox connections in Studio settings.");
  }
}

function publicConnection(item: IntegrationConnection): MailConnection[] {
  if (!isMailProvider(item?.toolkitSlug) || !isMailConnectionId(item.id)) return [];
  const active = item.status === "ACTIVE" && item.isDisabled !== true;
  const pending = item.status === "INITIATED" || item.status === "PENDING" || item.status === "INITIALIZING";
  return [{ id: item.id, provider: item.toolkitSlug, status: active ? "active" : pending ? "pending" : "unavailable" }];
}

export async function managedMailConnections(instanceId: string): Promise<MailConnection[]> {
  const result = await managedCall(() => agent37.listIntegrationConnections(instanceId));
  if (!Array.isArray(result.connections)) {
    throw new ApiError(502, "mail_provider_unavailable", "Agent37 did not return the mail connection list.");
  }
  return result.connections.flatMap(publicConnection);
}

export async function linkedMailWorkstation(db: DB, workspaceId: string) {
  const instance = await ownedMailWorkstation(db, workspaceId);
  return instance && hasActiveMailbox(await managedMailConnections(instance.id)) ? instance : null;
}

export async function requireMailcraftAccess(db: DB, workspaceId: string, appId: unknown) {
  if (appId === "mailcraft" && !await linkedMailWorkstation(db, workspaceId)) {
    throw new ApiError(409, "mailcraft_connection_required", MAILCRAFT_LOCKED);
  }
}

export async function requireActiveMailConnection(instanceId: string, connectionId: string) {
  const connections = await managedMailConnections(instanceId);
  const connection = connections.find(item => item.id === connectionId && item.status === "active");
  if (!connection) throw new ApiError(409, "mail_connection_inactive", "Connect this mailbox in Studio settings before giving it to Robyn.");
  return connection;
}

export async function assignmentMailbox(db: DB, workspaceId: string, assignmentId: string): Promise<AssignmentMailbox | null> {
  const { data, error } = await db.from("studio_assignment_mail").select("instance_id,connection_id,provider")
    .eq("workspace_id", workspaceId).eq("assignment_id", assignmentId).maybeSingle();
  dbFailure(error);
  if (!data) return null;
  if (!isMailProvider(data.provider) || !isMailConnectionId(data.connection_id)) throw workstationUnavailable();
  return { instanceId: data.instance_id, connectionId: data.connection_id, provider: data.provider };
}

export async function connectManagedMail(instanceId: string, provider: MailProvider, callbackUrl?: string) {
  const result = await managedCall(() => agent37.connectIntegration(instanceId, { toolkit: provider, callbackUrl }));
  let url: URL;
  try { url = new URL(result.redirectUrl); }
  catch { throw invalidConnectLink(); }
  if (result.toolkit !== provider || !isMailConnectionId(result.connectedAccountId) || url.protocol !== "https:"
    || url.username || url.password || url.port || !["backend.composio.dev", "connect.composio.dev", "auth.composio.dev"].includes(url.hostname)) {
    throw invalidConnectLink();
  }
  return { redirectUrl: url.href };
}

function invalidConnectLink() {
  return new ApiError(502, "mail_connect_link_invalid", "Agent37 did not return a valid Composio sign-in link.");
}

export async function disconnectManagedMail(instanceId: string, connectionId: string) {
  const existing = (await managedMailConnections(instanceId)).find(connection => connection.id === connectionId);
  if (!existing) throw new ApiError(404, "mail_connection_not_found", "Mail connection not found.");
  await managedCall(() => agent37.disconnectIntegration(instanceId, existing.id));
  if ((await managedMailConnections(instanceId)).some(connection => connection.id === existing.id)) {
    throw new ApiError(502, "mail_disconnect_unconfirmed", "Agent37 has not confirmed the disconnect. Refresh the mailbox connections in Studio settings.");
  }
}
