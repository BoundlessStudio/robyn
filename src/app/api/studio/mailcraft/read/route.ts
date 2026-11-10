import { ApiError, handleError, json } from "@/lib/http";
import { isMailConnectionId } from "@/studio/connected-mail";
import { mailcraftBrowserBundle } from "@/studio/mailcraft-browser";
import { mailcraftRead } from "@/studio/mailcraft-read";
import { readConnectedMailcraft } from "@/studio/mailcraft-server";
import { readStudioBody, requireStudio } from "@/studio/server";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    if (!mailcraftBrowserBundle()) throw new ApiError(404, "mailcraft_unavailable", "MailCraft is not available in this studio.");
    const input = await readStudioBody(request);
    if (!isMailConnectionId(input.connectionId)) throw new ApiError(400, "mailcraft_invalid_connection", "Choose a connected mailbox in Profile.");
    return json(await readConnectedMailcraft(db, workspaceId, input.connectionId, mailcraftRead(input.view)));
  } catch (error) { return handleError(error); }
}
