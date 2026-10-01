import { agent37, Agent37Error } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { deleteInkboxIdentity } from "@/lib/inkbox-provisioning";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db } = await requireAgentAccess(id, "admin");

    const { name } = await readJson<{ name?: string }>(request);
    const trimmed = (name || "").trim();
    if (!trimmed) throw new ApiError(400, "invalid_request", "name is required");

    const { error } = await db.from("agents").update({ name: trimmed }).eq("agent37_id", id);
    if (error) throw new ApiError(500, "db_error", error.message);

    return json({ id, name: trimmed });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db } = await requireAgentAccess(id, "admin");

    await deleteInkboxIdentity(db, id, async () => {
      try {
        await agent37.deleteAgent(id);
      } catch (e) {
        // Instance already gone upstream — still remove our mirror row.
        if (!(e instanceof Agent37Error && e.status === 404)) throw e;
      }
      const { error } = await db.from("agents").delete().eq("agent37_id", id);
      if (error) throw new ApiError(500, "db_error", "Could not remove the agent record. Please retry.");
    });

    return json({ id, deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
