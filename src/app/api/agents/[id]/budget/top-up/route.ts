import { agent37 } from "@/lib/agent37";
import { requireAgentAccess } from "@/lib/auth";
import { validateBudgetTopUp } from "@/lib/budget-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await requireAgentAccess(id, "admin");

    let input;
    try { input = validateBudgetTopUp(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }

    return json(await agent37.topUpBudget(id, input));
  } catch (error) {
    return handleError(error);
  }
}
