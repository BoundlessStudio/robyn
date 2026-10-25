import "server-only";
import { start, getRun } from "workflow/api";
import type { DB } from "@/lib/auth";
import type { MediaIdentity, MediaJob } from "./media";
import { mediaWorkflow } from "@/workflows/media";
import { mediaDbFailure } from "./media-server";
import { mediaNeedsSettlement, mediaTerminal } from "./media-recovery";

export async function launchMediaJob(db: DB, identity: MediaIdentity, job: MediaJob) {
  if (mediaTerminal(job) && !mediaNeedsSettlement(job)) return;
  if (job.workflow_id) {
    const run = getRun(job.workflow_id);
    if (await run.exists && ["pending", "running"].includes(await run.status)) return;
    const { error } = await db.from("studio_media_jobs").update({ workflow_id: null }).eq("id", job.id).eq("workspace_id", identity.workspaceId).eq("workflow_id", job.workflow_id); mediaDbFailure(error);
  }
  // Worker-side CAS chooses a single workflow even if the launch reply is lost.
  await start(mediaWorkflow, [identity, job.id]);
}
