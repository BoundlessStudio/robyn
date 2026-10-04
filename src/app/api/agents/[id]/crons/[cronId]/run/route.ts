import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { handleError, json } from "@/lib/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; cronId: string }> }) {
  try {
    const { id, cronId } = await params;
    await requireAgentAccess(id, "manage");
    return json(await agent37.runCron(id, cronId), 202);
  } catch (error) { return handleError(error); }
}
