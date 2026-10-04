import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { hermesSoul } from "@/lib/hermes-soul";
import { validateSoulWrite } from "@/lib/soul-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

async function requireHermes(id: string) {
  const access = await requireAgentAccess(id);
  if (!access.row.template?.startsWith("agent37-hermes")) throw new ApiError(400, "unsupported_agent", "SOUL.md is available on Hermes agents.");
  return access;
}

async function requireRunning(id: string) {
  const agent = await agent37.getAgent(id);
  if (!["running", "sleeping"].includes(agent.status)) throw new ApiError(409, "agent_stopped", "Start this agent to read or edit its SOUL.md.");
}

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireHermes(id);
    await requireRunning(id);
    return json(await hermesSoul(id));
  } catch (error) { return handleError(error); }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireHermes(id);
    let input;
    try { input = validateSoulWrite(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_soul", (error as Error).message); }
    await requireRunning(id);
    return json(await hermesSoul(id, input));
  } catch (error) { return handleError(error); }
}
