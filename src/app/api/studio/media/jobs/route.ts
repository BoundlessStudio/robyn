import { json, handleError } from "@/lib/http";
import { requireStudio, readStudioBody, id } from "@/studio/server";
import { createMediaJob, listMediaJobs, mediaBudget } from "@/studio/media-server";
import { launchMediaJob } from "@/studio/media-launch";
import { publicMediaJob, generationServices } from "@/studio/media";
import { mediaAvailability } from "@/studio/media-providers";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { db, workspaceId, user } = await requireStudio();
    const projectId = id(new URL(request.url).searchParams.get("projectId"));
    const jobs = await listMediaJobs(db, { workspaceId, userId: user.id, projectId },request.url);
    let budget;
    try{budget=await mediaBudget(db,workspaceId);}catch{budget={availableMicros:null,reason:"The Director’s allowance could not be checked. Your existing jobs are preserved."};}
    return json({ ...jobs, budget, providers: mediaAvailability(), generationServices });
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request) {
  try {
    const { db, workspaceId, user } = await requireStudio(); const input = await readStudioBody(request);
    const identity = { workspaceId, userId: user.id, projectId: id(input.projectId) };
    const job = await createMediaJob(db, identity, input);
    await launchMediaJob(db, identity, job);
    return json({ job: publicMediaJob(job) }, 202);
  } catch (error) { return handleError(error); }
}
