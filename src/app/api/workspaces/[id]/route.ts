import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json } from "@/lib/http";
import { readStudioBody, saveStudioName } from "@/studio/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user } = await requireUser();
    await requireAdmin(db, id, user.id);

    const { name } = await readStudioBody(request);
    return json(await saveStudioName(db, id, user.id, name));
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
