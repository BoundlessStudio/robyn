import "server-only";
import { ApiError } from "@/lib/api-error";
import type { DB } from "@/lib/auth";
import { mailConnectionLabel, type AssignmentMailbox, type MailProvider } from "../connected-mail";
import { managedMailConnections, ownedMailWorkstation, requireActiveMailConnection } from "../connected-mail-server";
import { mailcraftRead } from "../mailcraft-read";
import { readConnectedMailcraft } from "../mailcraft-server";
import { dbFailure } from "../server";
import { mcpConfig } from "./config";
import type { McpIdentity } from "./oauth";

export type McpMailboxRow = { connection_id: string; instance_id: string; provider: MailProvider };

export function describeMcpMailbox(id: string, provider: MailProvider) {
  return { mailConnectionId: id, provider, label: mailConnectionLabel({ id, provider }) };
}

export async function activeMcpMailboxes(db: DB, workspaceId: string) {
  const instance = await ownedMailWorkstation(db, workspaceId);
  const mailboxes = instance
    ? (await managedMailConnections(instance.id)).filter(connection => connection.status === "active")
    : [];
  return { instanceId: instance?.id, mailboxes };
}

function grantArgs({ workspaceId, userId, grantId }: McpIdentity) {
  return { p_grant: grantId, p_workspace: workspaceId, p_user: userId };
}

async function approvedMailboxes(identity: McpIdentity): Promise<McpMailboxRow[]> {
  const { data, error } = await identity.db.rpc("list_studio_mcp_mailboxes", grantArgs(identity));
  dbFailure(error);
  return data ?? [];
}

export async function listMailcraftAccounts(identity: McpIdentity) {
  const mailboxes = [];
  if ((await approvedMailboxes(identity)).length) {
    const active = await activeMcpMailboxes(identity.db, identity.workspaceId);
    const approved = await approvedMailboxes(identity);
    for (const connection of active.mailboxes) {
      if (approved.some(row => row.instance_id === active.instanceId && row.connection_id === connection.id && row.provider === connection.provider)) {
        mailboxes.push(describeMcpMailbox(connection.id, connection.provider));
      }
    }
  }
  return { mailboxes, settingsUrl: mcpConfig().issuer + "/oauth/connections" };
}

function mailboxDenied() {
  return new ApiError(403, "mcp_mailbox_access_denied", "Choose a mailbox from list_mailcraft_accounts. You can allow MailCraft reads for this client in Robyn’s MCP connections.");
}

async function requireApprovedMailbox(identity: McpIdentity, connectionId: string): Promise<AssignmentMailbox> {
  const row = (await approvedMailboxes(identity)).find(item => item.connection_id === connectionId);
  if (!row) throw mailboxDenied();
  return { connectionId, instanceId: row.instance_id, provider: row.provider };
}

export async function readMailcraftMailbox(identity: McpIdentity, input: { mailConnectionId: string; view: unknown }) {
  const view = mailcraftRead(input.view);
  const mailbox = await requireApprovedMailbox(identity, input.mailConnectionId);
  const answer = await readConnectedMailcraft(identity.db, identity.workspaceId, mailbox.connectionId, view, mailbox);
  const current = await requireApprovedMailbox(identity, mailbox.connectionId);
  if (current.instanceId !== mailbox.instanceId || current.provider !== mailbox.provider) throw mailboxDenied();
  if (answer.error) throw new ApiError(409, "mailcraft_read_unavailable", answer.error);
  return { ...describeMcpMailbox(mailbox.connectionId, mailbox.provider), result: answer.result };
}

export async function changeMcpMailboxAccess(identity: McpIdentity, connectionId: string, allow: boolean) {
  const { db, workspaceId, userId, grantId } = identity;
  let mailbox: AssignmentMailbox | null = null;
  if (allow) {
    const { data, error } = await db.from("studio_mcp_grants").select("id")
      .eq("id", grantId).eq("workspace_id", workspaceId).eq("user_id", userId)
      .is("revoked_at", null).gt("refresh_expires_at", new Date().toISOString()).maybeSingle();
    dbFailure(error);
    if (!data) throw new ApiError(404, "mcp_connection_unavailable", "Choose an active MCP connection.");
    const instance = await ownedMailWorkstation(db, workspaceId);
    if (!instance) throw new ApiError(409, "mail_workstation_unavailable", "Connect a mailbox on your workstation in Studio settings.");
    const connection = await requireActiveMailConnection(instance.id, connectionId);
    mailbox = { connectionId, instanceId: instance.id, provider: connection.provider };
  }
  const { data, error } = await db.rpc("set_studio_mcp_mailbox", {
    ...grantArgs(identity), p_connection: connectionId, p_instance: mailbox?.instanceId ?? null, p_provider: mailbox?.provider ?? null,
  });
  dbFailure(error);
  if (data !== true) throw new ApiError(409, "mcp_mailbox_access_changed", "The MCP connection or workstation changed. Open MCP connections and try again.");
}
