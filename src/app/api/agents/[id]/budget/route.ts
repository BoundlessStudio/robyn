import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { validateMonthlyBudget } from "@/lib/budget-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "member");

    return json(await agent37.getBudget(id));
  } catch (e) {
    return handleError(e);
  }
}

// Set the agent's monthly managed-spend cap. Admin-only; the body is in USD (the UI's unit) and
// converted to micros for the API. Returns the updated Budget.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "admin");

    let input;
    try { input = validateMonthlyBudget(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }

    return json(await agent37.setBudget(id, input));
  } catch (e) {
    return handleError(e);
  }
}
