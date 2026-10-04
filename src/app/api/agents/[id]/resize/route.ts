import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { readResourceChange, resourceProfile, validateResourceResize } from "@/lib/resource-input";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, row } = await requireAgentAccess(id, "admin");

    let input;
    try { input = readResourceChange(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }
    const current = await agent37.getAgent(id);
    if (current.status !== "running") throw new ApiError(409, "instance_not_running", "Start the agent before changing resources.");
    let patch;
    try { patch = validateResourceResize(input, current.resources); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }
    const result = await agent37.resize(id, patch);
    const { error } = await db
      .from("agents")
      .update({
        cpu: result.resources.cpu,
        memory: result.resources.memory,
        disk: result.resources.disk,
        status: result.status,
      })
      .eq("agent37_id", id)
      .eq("workspace_id", row.workspace_id);
    if (error) throw new ApiError(500, "db_error", "Resources changed upstream, but the agent record could not be refreshed. Reload to see the current resources.");

    return json(resourceProfile({ ...current, ...result }));
  } catch (e) {
    return handleError(e);
  }
}
