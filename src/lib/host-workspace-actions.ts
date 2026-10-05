import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { requireHostAdmin } from "@/lib/host-auth";
import { hostAgentLimit } from "@/lib/agent-capacity-input";
import { billingUsdToCents } from "@/lib/billing-input";
import { ApiError } from "@/lib/http";
import type { HostCoupon } from "@/lib/host-types";

function workspaceId(id: string) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) throw new ApiError(404, "not_found", "Tenant not found.");
  return id;
}

function mutationError(error: { message: string } | null) {
  if (!error) return;
  if (error.message === "host_required") throw new ApiError(403, "host_forbidden", "Host access is required.");
  if (error.message === "workspace_not_found") throw new ApiError(404, "not_found", "Tenant not found.");
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

export async function issueHostCoupon(id: string, value: unknown): Promise<HostCoupon> {
  const { db, user } = await requireHostAdmin();
  workspaceId(id);
  let amount: number;
  try { amount = billingUsdToCents(value, 1) * 10_000; }
  catch (error) { throw new ApiError(400, "invalid_amount", (error as Error).message); }
  const code = `CREDIT-${randomBytes(16).toString("hex").toUpperCase()}`;
  const { data, error } = await db.rpc("host_issue_coupon", {
    p_host: user.id, p_workspace: id, p_hash: createHash("sha256").update(code).digest("hex"), p_amount: amount,
  });
  mutationError(error);
  if (typeof data !== "string") throw new ApiError(503, "host_unavailable", "The coupon expiry is unavailable. Please retry.");
  return { code, workspace_id: id, amount_micros: amount, expires_at: data };
}
