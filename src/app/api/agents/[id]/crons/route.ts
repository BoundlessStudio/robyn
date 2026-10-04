import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { validateCronInput } from "@/lib/cron-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import type { CronInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id);
    return json(await agent37.listCrons(id));
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "manage");
    let input;
    try { input = validateCronInput(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_schedule", (error as Error).message); }
    return json(await agent37.createCron(id, input as CronInput), 201);
  } catch (error) { return handleError(error); }
}
