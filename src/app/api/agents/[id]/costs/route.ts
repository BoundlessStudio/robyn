import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { agentCosts, monthWindow } from "@/lib/agent-costs";
import { handleError, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");
    const { period, from, to } = monthWindow();
    return json(agentCosts(id, await agent37.getWorkspaceUsage(from, to), period));
  } catch (error) { return handleError(error); }
}
