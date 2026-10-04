import { after } from "next/server";
import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { beginInkboxSetup, getInkboxRow, inkboxIdentityView, queueInkboxIdentity, runInkboxSetup } from "@/lib/inkbox-provisioning";
import { normalizeInkboxPhone } from "@/lib/inkbox-setup";
import { inkboxConfigured } from "@/lib/inkbox";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, row } = await requireAgentAccess(id);
    return json(await inkboxIdentityView(db, row));
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, row } = await requireAgentAccess(id, "manage");
    if (row.template !== "agent37-hermes") throw new ApiError(400, "unsupported_agent", "Inkbox identities require Hermes.");
    if (!inkboxConfigured()) throw new ApiError(503, "inkbox_not_configured", "The operator must add INKBOX_ADMIN_KEY.");
    const live = await agent37.getAgent(id);
    if (!["running", "sleeping"].includes(live.status)) throw new ApiError(409, "agent_stopped", "Start this agent before enabling or updating Inkbox.");
    const body = await readJson<{ phone?: string }>(request);
    if (body.phone !== undefined && typeof body.phone !== "string") throw new ApiError(400, "invalid_phone", "Phone must be a string.");
    let phone: string | null | undefined;
    try { phone = body.phone === undefined ? undefined : normalizeInkboxPhone(body.phone); }
    catch { throw new ApiError(400, "invalid_phone", "Enter a phone number with its country code, such as +14165550123."); }

    if (!(await getInkboxRow(db, id))) {
      // A workspace teammate may administer an agent, but its inbox defaults to its creator.
      const owner = row.created_by ? await db.auth.admin.getUserById(row.created_by) : null;
      const email = owner?.data.user?.email;
      if (!email) throw new ApiError(400, "email_required", "The agent creator needs an account email for its inbox.");
      await queueInkboxIdentity(db, id, email);
    }
    const identity = await beginInkboxSetup(db, id, phone);
    after(() => runInkboxSetup(db, identity, row.name || "Robyn"));
    return json({ status: "provisioning" }, 202);
  } catch (error) { return handleError(error); }
}
