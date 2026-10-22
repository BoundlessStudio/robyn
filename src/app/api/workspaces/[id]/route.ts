import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { readStudioBody, textField } from "@/studio/server";
import type { Workspace } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);

    const { name } = await readStudioBody(request);
    const trimmed = textField(name, 120, "Studio name");

    const { data, error } = await db
      .from("workspaces")
      .update({ name: trimmed })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ workspace: data as Workspace });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  try {
    await requireUser();
    // The starter's destructive fleet deletion does not manage immutable
    // packages, Storage objects, or durable jobs. Do not expose partial teardown.
    throw new ApiError(410, "pilot_operation_unavailable", "Studio deletion is not available in this pilot.");
  } catch (e) {
    return handleError(e);
  }
}
