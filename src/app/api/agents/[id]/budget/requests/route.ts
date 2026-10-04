import { requireAgentAccess } from "@/lib/auth";
import { validateBudgetRequest } from "@/lib/budget-request-input";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { userProfileFromUser } from "@/lib/user-profile";

type Ctx = { params: Promise<{ id: string }> };
const FIELDS = "id,requester_name,amount_micros,note,created_at";

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user, row, role } = await requireAgentAccess(id);
    let query = db.from("agent_budget_requests").select(FIELDS)
      .eq("agent37_id", id).eq("workspace_id", row.workspace_id);
    if (role === "member") query = query.eq("requester_id", user.id);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
    if (error) throw new ApiError(500, "requests_unavailable", "Could not load extra budget requests. Please retry.");
    return json({ requests: data ?? [] });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { db, user, row, role } = await requireAgentAccess(id);
    if (role !== "member") throw new ApiError(403, "forbidden", "Only assigned members can request extra budget.");
    let input;
    try { input = validateBudgetRequest(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }

    // The verified session supplies the requester and workspace. A unique retry key
    // makes double clicks and ambiguous network retries produce one request.
    const { data, error } = await db.from("agent_budget_requests").insert({
      ...input, agent37_id: id, workspace_id: row.workspace_id, requester_id: user.id,
      requester_name: (userProfileFromUser(user).display_name || "Member").slice(0, 320),
    }).select(FIELDS).single();
    if (!error) return json(data, 201);
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await db.from("agent_budget_requests").select(FIELDS)
        .eq("agent37_id", id).eq("workspace_id", row.workspace_id)
        .eq("requester_id", user.id).eq("idempotency_key", input.idempotency_key).maybeSingle();
      if (!lookupError && existing) {
        if (existing.amount_micros !== input.amount_micros || existing.note !== input.note) {
          throw new ApiError(409, "request_conflict", "This retry key was already used for a different request.");
        }
        return json(existing);
      }
    }
    throw new ApiError(500, "request_failed", "Could not submit your extra budget request. Please retry.");
  } catch (error) { return handleError(error); }
}
