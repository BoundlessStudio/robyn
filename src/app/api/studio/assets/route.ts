import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, textField, appFor, id, ownedProject, dbFailure, withAssetPreviews } from "@/studio/server";

export async function GET(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) await ownedProject(db, workspaceId, id(projectId));
    let query = db.from("studio_assets").select("*").eq("workspace_id", workspaceId);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(300);
    dbFailure(error); return json({ assets: await withAssetPreviews(db,workspaceId,data??[]) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const input = await readStudioBody(request);
    const projectId = id(input.projectId);
    await ownedProject(db, workspaceId, projectId);
    const app = appFor(input.appId);
    const name = textField(input.name, 160, "Asset name");
    const { data, error } = await db.from("studio_assets").insert({ workspace_id: workspaceId, project_id: projectId, app_id: app.id, name, created_by: user.id }).select("*").single();
    dbFailure(error); return json({ asset: data }, 201);
  } catch (error) { return handleError(error); }
}
