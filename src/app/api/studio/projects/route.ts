import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, textField, dbFailure, withAssetPreviews } from "@/studio/server";
import { readPage, pageFilter, finishPage, literalSearch } from "@/studio/pagination";

export async function GET(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    const page = readPage(request.url);
    let query = db.from("studio_projects").select("*").eq("workspace_id", workspaceId);
    const status = new URL(request.url).searchParams.get("status");
    if (status === "active" || status === "archived") query = query.eq("status",status);
    if (page.search) query = query.ilike("name",literalSearch(page.search));
    if (page.after) query = query.or(pageFilter(page.after,"updated_at"));
    const { data: rows, error } = await query.order("updated_at", { ascending: false }).order("id",{ascending:false}).limit(page.size+1);
    dbFailure(error);
    const {items:data,nextCursor} = finishPage(rows??[],page.size,"updated_at");
    if(!data?.length)return json({projects:[]});
    const {data:assets,error:assetError}=await db.from("studio_assets").select("project_id,current_revision_id").eq("workspace_id",workspaceId).in("project_id",data.map(project=>project.id)).not("current_revision_id","is",null).order("created_at",{ascending:false}).limit(1000);
    dbFailure(assetError);
    const covers=await withAssetPreviews(db,workspaceId,assets??[]);
    return json({ projects: data.map(project=>({...project,preview_url:covers.find(asset=>asset.project_id===project.id&&asset.preview_url)?.preview_url??null})),nextCursor });
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
