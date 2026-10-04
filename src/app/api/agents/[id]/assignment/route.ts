import { requireAgentAccess, requireAssignee } from "@/lib/auth";
import { validateAssignedUserId } from "@/lib/assignment-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, row } = await requireAgentAccess(id, "admin");
    const body = await readJson<{ assigned_user_id?: unknown }>(request);
    let assignedUserId;
    try { assignedUserId = validateAssignedUserId(body?.assigned_user_id); }
    catch (error) { throw new ApiError(400, "invalid_assignment", (error as Error).message); }
    await requireAssignee(db, row.workspace_id, assignedUserId);
    const { error } = await db.from("agents").update({ assigned_user_id: assignedUserId }).eq("agent37_id", id);
    if (error) throw new ApiError(500, "db_error", error.message);
    return json({ id, assigned_user_id: assignedUserId });
  } catch (error) { return handleError(error); }
}
