import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";

export async function isStudioInstance(db: DB, workspaceId: string, instanceId: string) {
  const { data, error } = await db.from("studio_employees").select("id").eq("workspace_id", workspaceId).eq("instance_id", instanceId).maybeSingle();
  if (error) throw new ApiError(503, "studio_employee_unavailable", "The employee's Studio state could not be checked. Try again shortly.");
  return Boolean(data);
}

/** Run after requireAgentAccess and before any upstream mutation. */
export async function requireLegacyAgent(db: DB, workspaceId: string, instanceId: string) {
  if (await isStudioInstance(db, workspaceId, instanceId)) {
    throw new ApiError(409, "studio_lifecycle_required", "Studio manages this employee's workstation. Use the project controls or contact support for recovery.");
  }
}
