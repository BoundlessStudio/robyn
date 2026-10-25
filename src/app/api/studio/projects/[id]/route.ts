import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, ownedProject, readStudioBody, textField, dbFailure } from "@/studio/server";
import { finishPage } from "@/studio/pagination";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio();
    const { id } = await context.params;
    const project = await ownedProject(db, workspaceId, id);
    const [assets, activity] = await Promise.all([
      db.from("studio_assets").select("*").eq("workspace_id", workspaceId).eq("project_id", id).or("asset_kind.eq.native,current_revision_id.not.is.null").order("created_at", { ascending: false }).order("id",{ascending:false}).limit(101),
      db.from("studio_activity").select("*").eq("workspace_id", workspaceId).eq("project_id", id).order("created_at", { ascending: false }).limit(50),
    ]);
    dbFailure(assets.error); dbFailure(activity.error);
    const page = finishPage(assets.data??[],100);
    return json({ project, assets: page.items, nextAssetCursor:page.nextCursor, activity: activity.data });
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId } = await requireStudio();
    const { id } = await context.params;
    await ownedProject(db, workspaceId, id);
    const input = await readStudioBody(request);
    const updates: Record<string, string> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) updates.name = textField(input.name, 120, "Project name");
    if (input.brief !== undefined) updates.brief = textField(input.brief, 20000, "Brief", true);
    if (input.status !== undefined) {
      if (input.status !== "active" && input.status !== "archived") throw new ApiError(400, "invalid_request", "Invalid project status.");
      updates.status = input.status;
    }
    const { data, error } = await db.from("studio_projects").update(updates).eq("workspace_id", workspaceId).eq("id", id).select("*").single();
    dbFailure(error); return json({ project: data });
  } catch (error) { return handleError(error); }
}
