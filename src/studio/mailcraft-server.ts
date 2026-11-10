import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agent37 } from "@/lib/agent37";
import { ApiError } from "@/lib/api-error";
import type { DB } from "@/lib/auth";
import type { AssignmentMailbox } from "./connected-mail";
import { ownedMailWorkstation, requireActiveMailConnection } from "./connected-mail-server";
import helperPin from "./mailcraft-helper.json";
import type { MailcraftRead } from "./mailcraft-read";

const publicErrors = new Set([
  "This mailbox needs to be reconnected in Profile.",
  "The existing grant does not allow this read.",
  "The workstation’s AI allowance is exhausted.",
  "This Gmail grant covers mail. Contacts, Calendar, and Tasks require their own Google connections.",
  "MailCraft could not load this view from the connected account.",
]);

function unavailable() {
  return new ApiError(502, "mailcraft_read_unconfirmed", "MailCraft could not confirm this read from the connected account.");
}

async function pinnedHelper() {
  const bytes = await readFile(join(process.cwd(), "vendor/robyn-mailcraft/managed-read.mjs")).catch(() => { throw unavailable(); });
  if (bytes.length !== helperPin.bytes || createHash("sha256").update(bytes).digest("hex") !== helperPin.sha256) throw unavailable();
  return bytes;
}

export async function readConnectedMailcraft(db: DB, workspaceId: string, connectionId: string,
  view: MailcraftRead, approved?: AssignmentMailbox) {
  const instance = await ownedMailWorkstation(db, workspaceId);
  if (approved && instance?.id !== approved.instanceId) throw unavailable();
  // Exec wakes a sleeping Agent37 instance after its grant is checked.
  if (!instance || !["running", "sleeping"].includes(instance.status)) {
    throw new ApiError(409, "mailcraft_workstation_asleep", "Start your shared Robyn workstation before opening connected MailCraft.");
  }
  const connection = await requireActiveMailConnection(instance.id, connectionId);
  if (approved && (connection.id !== approved.connectionId || connection.provider !== approved.provider)) throw unavailable();
  const answer = await agent37.readMailcraft(instance.id, await pinnedHelper(), {
    mailbox: { instanceId: instance.id, provider: connection.provider, connectionId: connection.id },
    request: view,
  }).catch(() => { throw unavailable(); });
  if ((await ownedMailWorkstation(db, workspaceId))?.id !== instance.id
    || (await requireActiveMailConnection(instance.id, connection.id)).provider !== connection.provider) throw unavailable();
  if (typeof answer.error === "string" && publicErrors.has(answer.error)) return { error: answer.error };
  const result = answer.result;
  if (!result || typeof result !== "object" || Array.isArray(result) || (result as Record<string, unknown>).kind !== view.kind) throw unavailable();
  return { result };
}
