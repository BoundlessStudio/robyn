import { ApiError, handleError, json } from "@/lib/http";
import { isMailConnectionId, isMailProvider } from "@/studio/connected-mail";
import { connectManagedMail, disconnectManagedMail, managedMailConnections, ownedMailWorkstation } from "@/studio/connected-mail-server";
import { readStudioBody, requireStudio } from "@/studio/server";

export async function GET() {
  try {
    const { db, workspaceId } = await requireStudio();
    const instance = await ownedMailWorkstation(db, workspaceId);
    return json({ workstationReady: Boolean(instance), connections: instance ? await managedMailConnections(instance.id) : [] });
  } catch (error) { return handleError(error); }
}

function profileReturnUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return undefined;
  const origin = new URL(site);
  if (origin.protocol !== "https:") return undefined;
  return new URL("/dashboard/profile?mail=return", origin.origin).href;
}

export async function POST(request: Request) {
  try {
    const input = await readStudioBody(request);
    const { db, workspaceId } = await requireStudio();
    const instance = await ownedMailWorkstation(db, workspaceId);
    if (!instance) throw new ApiError(409, "mail_workstation_not_started", "Start Robyn with a project brief before connecting mail.");
    if (input.action === "connect" && isMailProvider(input.provider)) {
      return json(await connectManagedMail(instance.id, input.provider, profileReturnUrl()));
    }
    if (input.action === "disconnect" && isMailConnectionId(input.connectionId)) {
      await disconnectManagedMail(instance.id, input.connectionId);
      return json({ disconnected: true });
    }
    throw new ApiError(400, "invalid_mail_action", "Choose a Gmail or Microsoft 365 connection.");
  } catch (error) { return handleError(error); }
}
