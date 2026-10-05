import "server-only";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import type { AgentCapacity } from "@/lib/agent-capacity-input";

export async function readAgentCapacity(db: DB, workspaceId: string): Promise<AgentCapacity> {
  const { data, error } = await db.rpc("workspace_agent_capacity", { p_workspace: workspaceId });
  if (error || !data) throw new ApiError(503, "capacity_unavailable", "Agent capacity is unavailable. Please retry.");
  const row = data as AgentCapacity;
  return { agent_limit: row.agent_limit, agent_count: row.agent_count, pending_count: row.pending_count, balance_micros: row.balance_micros };
}

export async function reserveAgentCreation(db: DB, workspaceId: string, userId: string, assignedUserId: string): Promise<string> {
  const { data, error } = await db.rpc("reserve_agent_creation", { p_workspace: workspaceId, p_user: userId, p_assignee: assignedUserId });
  if (error) {
    const failures: Record<string, [number, string]> = {
      agent_limit_reached: [409, "This workspace has reached its agent limit."],
      workspace_balance_empty: [402, "Add funds or redeem a coupon in workspace Billing to create agents."],
      wallet_unavailable: [503, "Workspace wallet is unavailable. Please retry."],
      workspace_not_found: [404, "Workspace not found."], admin_required: [403, "Admin role required."],
      invalid_assignee: [400, "The assigned user must belong to this workspace."],
    };
    const failure = failures[error.message];
    if (failure) throw new ApiError(failure[0], error.message, failure[1]);
    throw new ApiError(503, "capacity_unavailable", "Could not reserve agent capacity. Please retry.");
  }
  if (typeof data !== "string") throw new ApiError(503, "capacity_unavailable", "Agent capacity is unavailable. Please retry.");
  return data;
}

export async function releaseAgentCreation(db: DB, reservation: string): Promise<void> {
  const { error } = await db.from("agent_creation_reservations").delete().eq("id", reservation);
  if (error) throw new ApiError(503, "capacity_unavailable", "A reserved creation slot needs Host review.");
}
