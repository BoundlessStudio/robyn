import { json, handleError, ApiError } from "@/lib/http";
import { requireStudio, readStudioBody, textField, appFor, id, ownedProject, dbFailure, withAssetPreviews } from "@/studio/server";
import { readPage, pageFilter, finishPage, literalSearch } from "@/studio/pagination";

export async function GET(request: Request) {
  try {
    const { db, workspaceId } = await requireStudio();
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (projectId) await ownedProject(db, workspaceId, id(projectId));
    const page = readPage(request.url);
    let query = db.from("studio_assets").select("*,project:studio_projects(name)").eq("workspace_id", workspaceId);
    if (projectId) query = query.eq("project_id", projectId);
    if (page.search) query = query.ilike("name", literalSearch(page.search));
    const visible = "asset_kind.eq.native,current_revision_id.not.is.null";
    query = query.or(page.after ? `and(or(${visible}),or(${pageFilter(page.after)}))` : visible);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", {ascending:false}).limit(page.size+1);
    dbFailure(error);
    const result = finishPage(data??[], page.size);
    return json({ assets: await withAssetPreviews(db,workspaceId,result.items), nextCursor:result.nextCursor });
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
    // A client-generated ID makes Save As / Copy retries safe after a lost reply.
    // It never grants access to an existing asset from another studio.
    const creationId = input.creationId === undefined ? undefined : id(input.creationId);
    const { data, error } = await db.from("studio_assets").insert({ ...(creationId ? {id:creationId} : {}), workspace_id: workspaceId, project_id: projectId, app_id: app.id, name, created_by: user.id }).select("*").single();
    if (creationId && error?.code === "23505") {
      const { data: prior, error: readError } = await db.from("studio_assets").select("*").eq("id",creationId).eq("workspace_id",workspaceId).eq("project_id",projectId).eq("app_id",app.id).eq("created_by",user.id).eq("name",name).maybeSingle();
      dbFailure(readError);
      if (!prior) throw new ApiError(409,"creation_id_reused","This creation ID is already in use. Start a new save.");
      return json({asset:prior});
    }
    dbFailure(error); return json({ asset: data }, 201);
  } catch (error) { return handleError(error); }
}
