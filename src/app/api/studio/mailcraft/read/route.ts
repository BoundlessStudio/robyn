import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agent37 } from "@/lib/agent37";
import { ApiError, handleError, json } from "@/lib/http";
import { isMailConnectionId } from "@/studio/connected-mail";
import { ownedMailWorkstation, requireActiveMailConnection } from "@/studio/connected-mail-server";
import { mailcraftBrowserBundle } from "@/studio/mailcraft-browser";
import { mailcraftRead } from "@/studio/mailcraft-read";
import helperPin from "@/studio/mailcraft-helper.json";
import { readStudioBody, requireStudio } from "@/studio/server";

export const maxDuration = 120;

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

export async function POST(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    if (!mailcraftBrowserBundle()) throw new ApiError(404, "mailcraft_unavailable", "MailCraft is not available in this studio.");
    const input = await readStudioBody(request);
    if (!isMailConnectionId(input.connectionId)) throw new ApiError(400, "mailcraft_invalid_connection", "Choose a connected mailbox in Profile.");
    const view = mailcraftRead(input.view);
    const instance = await ownedMailWorkstation(db, workspaceId);
    if (!instance || instance.status !== "running") {
      throw new ApiError(409, "mailcraft_workstation_asleep", "Start your shared Robyn workstation before opening connected MailCraft.");
    }
    const connection = await requireActiveMailConnection(instance.id, input.connectionId);
    const helper = await pinnedHelper();
    const answer = await agent37.readMailcraft(instance.id, helper, {
      mailbox: { instanceId: instance.id, provider: connection.provider, connectionId: connection.id },
      request: view,
    }).catch(() => { throw unavailable(); });
    if ((await ownedMailWorkstation(db, workspaceId))?.id !== instance.id
      || (await requireActiveMailConnection(instance.id, connection.id)).provider !== connection.provider) throw unavailable();
    if (typeof answer.error === "string" && publicErrors.has(answer.error)) return json({ error: answer.error });
    const result = answer.result;
    if (!result || typeof result !== "object" || Array.isArray(result) || (result as Record<string, unknown>).kind !== view.kind) throw unavailable();
    return json({ result });
  } catch (error) { return handleError(error); }
}
