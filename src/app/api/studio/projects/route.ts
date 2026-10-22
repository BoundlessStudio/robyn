import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, textField, dbFailure, withAssetPreviews } from "@/studio/server";

export async function GET() {
  try {
    const { db, workspaceId } = await requireStudio();
    const { data, error } = await db.from("studio_projects").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(100);
    dbFailure(error);
    if(!data?.length)return json({projects:[]});
    const {data:assets,error:assetError}=await db.from("studio_assets").select("project_id,current_revision_id").eq("workspace_id",workspaceId).in("project_id",data.map(project=>project.id)).not("current_revision_id","is",null).order("created_at",{ascending:false}).limit(1000);
    dbFailure(assetError);
    const covers=await withAssetPreviews(db,workspaceId,assets??[]);
    return json({ projects: data.map(project=>({...project,preview_url:covers.find(asset=>asset.project_id===project.id&&asset.preview_url)?.preview_url??null})) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user, workspaceId } = await requireStudio();
    const input = await readStudioBody(request);
    const name = textField(input.name, 120, "Project name");
    const brief = textField(input.brief, 20000, "Brief", true);
    const { data, error } = await db.from("studio_projects").insert({ workspace_id: workspaceId, name, brief, created_by: user.id }).select("*").single();
    dbFailure(error); return json({ project: data }, 201);
  } catch (error) { return handleError(error); }
}
