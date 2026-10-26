import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, id } from "@/studio/server";
import { ownedMediaJob, mediaDbFailure } from "@/studio/media-server";
import { launchMediaJob } from "@/studio/media-launch";
import { publicMediaJob } from "@/studio/media";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId, user } = await requireStudio(); const params = await context.params;
    const identity = { workspaceId, userId: user.id, projectId: id(new URL(request.url).searchParams.get("projectId")) };
    return json({ job: publicMediaJob(await ownedMediaJob(db, identity, params.id)) });
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, workspaceId, user } = await requireStudio(); const params = await context.params;
    const input = await readStudioBody(request);
    const identity = { workspaceId, userId: user.id, projectId: id(input.projectId) };
    const job = await ownedMediaJob(db, identity, params.id);
    if (input.action === "cancel") {
      const { data, error } = await db.rpc("cancel_unpaid_media_job", { p_workspace: workspaceId, p_user: user.id, p_job: job.id });
      mediaDbFailure(error);
      return json({ job: publicMediaJob(data) });
    }
    await launchMediaJob(db, identity, job);
    return json({ job: publicMediaJob(job) }, 202);
  } catch (error) { return handleError(error); }
}
