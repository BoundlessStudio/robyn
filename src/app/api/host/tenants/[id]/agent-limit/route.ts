import { requireHostWriteOrigin, setHostAgentLimit } from "@/lib/host-workspace-actions";
import { handleError, json, readJson } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireHostWriteOrigin(request);
    const { id } = await params;
    const body = await readJson<{ agent_limit?: unknown }>(request);
    const response = json(await setHostAgentLimit(id, body?.agent_limit));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleError(error); }
}
