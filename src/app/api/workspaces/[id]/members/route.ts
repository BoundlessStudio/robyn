import { requireAdmin, requireUser } from "@/lib/auth";
import { validateInvitationRole } from "@/lib/assignment-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import type { Invitation, WorkspaceMember } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    const role = "admin";

    const { data: members, error } = await db.rpc("get_workspace_members_with_names", { p_workspace: id });
    if (error) throw new ApiError(500, "db_error", error.message);

    const { data: inv, error: invitationError } = await db
      .from("invitations")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false });
    if (invitationError) throw new ApiError(500, "db_error", invitationError.message);
    const invitations = (inv as Invitation[]) ?? [];

    return json({ members: (members as WorkspaceMember[]) ?? [], invitations, role });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);
    const body = await readJson<{ role?: unknown }>(request);
    let role;
    try { role = validateInvitationRole(body?.role); }
    catch (error) { throw new ApiError(400, "invalid_role", (error as Error).message); }

    const { data, error } = await db
      .from("invitations")
      .insert({ workspace_id: id, role, created_by: user.id })
      .select("token")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
    const url = `${origin}/invite/${data.token}`;

    return json({ token: data.token, url }, 201);
  } catch (e) {
    return handleError(e);
  }
}
