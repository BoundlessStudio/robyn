import { json, handleError } from "@/lib/http";
import { requireStudio, publicApps, dbFailure } from "@/studio/server";

export async function GET() {
  try {
    const { db, workspace, workspaceId } = await requireStudio();
    const { data: employees, error } = await db.from("studio_employees").select("id,employee_key,kind,app_id,role,manifest_version,provision_state,created_at").eq("workspace_id", workspaceId).order("created_at");
    dbFailure(error);
    return json({ workspace, employees, applications: publicApps(), maxConcurrentSpecialists: 3 });
  } catch (error) { return handleError(error); }
}
