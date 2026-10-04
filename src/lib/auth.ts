import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/http";
import type { AgentRow, Role } from "@/lib/types";

// `db` is the privileged service-role client (RLS bypassed). All table access in this app goes
// through it, which makes the helpers below the authorization boundary — they replace what RLS used
// to enforce. The user's IDENTITY still comes only from their verified session cookie (the
// anon/SSR client in getSession), never from `db`; `db` is used purely to run the query once the
// session-derived user id has been checked against the memberships table.
export type DB = ReturnType<typeof createAdminClient>;

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user };
}

export async function requireUser() {
  const { user } = await getSession();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in required");
  return { db: createAdminClient(), user };
}

export async function getRole(db: DB, workspaceId: string, userId: string): Promise<Role | null> {
  const { data } = await db
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

// 404 (not 403) so we don't leak whether the workspace exists.
export async function requireMember(db: DB, workspaceId: string, userId: string): Promise<Role> {
  const role = await getRole(db, workspaceId, userId);
  if (!role) throw new ApiError(404, "not_found", "Workspace not found");
  return role;
}

export async function requireAdmin(db: DB, workspaceId: string, userId: string): Promise<void> {
  const role = await getRole(db, workspaceId, userId);
  if (role !== "admin") throw new ApiError(403, "forbidden", "Admin role required");
}

export async function getAgentRow(db: DB, agent37Id: string): Promise<AgentRow> {
  const { data } = await db.from("agents").select("*").eq("agent37_id", agent37Id).maybeSingle();
  if (!data) throw new ApiError(404, "not_found", "Agent not found");
  return data as AgentRow;
}

// Admins may access any workspace agent; members may read and manage only their assignments.
// "admin" is reserved for workspace-level changes such as reassigning an agent.
export async function requireAgentAccess(agent37Id: string, access: "member" | "manage" | "admin" = "member") {
  const { db, user } = await requireUser();
  const row = await getAgentRow(db, agent37Id);
  const role = await getRole(db, row.workspace_id, user.id);
  if (!role || (role !== "admin" && row.assigned_user_id !== user.id)) {
    throw new ApiError(404, "not_found", "Agent not found");
  }
  if (access === "admin" && role !== "admin") {
    throw new ApiError(403, "forbidden", "Admin role required");
  }
  return { db, user, row, role };
}

export async function requireAssignee(db: DB, workspaceId: string, userId: string) {
  if (!(await getRole(db, workspaceId, userId))) {
    throw new ApiError(400, "invalid_assignment", "Assigned user must belong to this workspace.");
  }
}
