import "server-only";
import { requireHostAdmin } from "@/lib/host-auth";
import { hostAgentLimit } from "@/lib/agent-capacity-input";
import { billingUsdToCents } from "@/lib/billing-input";
import { ApiError } from "@/lib/http";
import type { HostCredit } from "@/lib/host-types";

function workspaceId(id: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) throw new ApiError(404, "not_found", "Tenant not found.");
  return id;
}

function mutationError(error: { message: string } | null) {
  if (!error) return;
  if (error.message === "host_required") throw new ApiError(403, "host_forbidden", "Host access is required.");
  if (error.message === "workspace_not_found") throw new ApiError(404, "not_found", "Tenant not found.");
  if (error.message === "credit_conflict") throw new ApiError(409, "credit_conflict", "This credit request has already been used for a different grant.");
  if (error.message === "wallet_unavailable") throw new ApiError(503, "wallet_unavailable", "The workspace wallet is unavailable.");
  throw new ApiError(503, "host_unavailable", "Could not save the Host change. Please retry.");
}

export function requireHostWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "invalid_origin", "Use the Host console to make this change.");
}

export async function setHostAgentLimit(id: string, value: unknown): Promise<{ agent_limit: number }> {
  const { db, user } = await requireHostAdmin();
  workspaceId(id);
  let limit: number;
  try { limit = hostAgentLimit(value); }
  catch (error) { throw new ApiError(400, "invalid_limit", (error as Error).message); }
  const { error } = await db.rpc("host_set_agent_limit", { p_host: user.id, p_workspace: id, p_limit: limit });
  mutationError(error);
  return { agent_limit: limit };
}

export async function addHostCredit(id: string, value: unknown, retryKey: unknown): Promise<HostCredit> {
  const { db, user } = await requireHostAdmin();
  workspaceId(id);
  let amount: number;
  try { amount = billingUsdToCents(value, 1) * 10_000; }
  catch (error) { throw new ApiError(400, "invalid_amount", (error as Error).message); }
  if (typeof retryKey !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(retryKey)) {
    throw new ApiError(400, "invalid_request", "A valid credit retry key is required.");
  }
  const { data, error } = await db.rpc("host_add_credit", {
    p_host: user.id, p_workspace: id, p_request: retryKey, p_amount: amount,
  });
  mutationError(error);
  if (typeof data !== "number" || !Number.isSafeInteger(data)) throw new ApiError(503, "host_unavailable", "The updated balance is unavailable. Please retry.");
  return { workspace_id: id, amount_micros: amount, balance_micros: data };
}
