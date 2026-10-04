import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { validateCronInput } from "@/lib/cron-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; cronId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id, cronId } = await params;
    await requireAgentAccess(id, "manage");
    let input;
    try { input = validateCronInput(await readJson<unknown>(request), true); }
    catch (error) { throw new ApiError(400, "invalid_schedule", (error as Error).message); }
    return json(await agent37.updateCron(id, cronId, input));
  } catch (error) { return handleError(error); }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id, cronId } = await params;
    await requireAgentAccess(id, "manage");
    return json(await agent37.deleteCron(id, cronId));
  } catch (error) { return handleError(error); }
}
