import type { MediaJob } from "./media";

export const mediaTerminal = (job: Pick<MediaJob, "state">) => ["completed", "failed", "cancelled"].includes(job.state);
export const mediaNeedsSettlement = (job: Pick<MediaJob, "operation" | "billing_settled" | "reserved_micros" | "provider_job_id">) =>
  job.operation === "generate" && !job.billing_settled && (Number(job.reserved_micros) > 0 || Boolean(job.provider_job_id));
export const mediaCanCancelUnpaid = (job: Pick<MediaJob, "state" | "provider_job_id">) =>
  ["queued", "preparing", "waiting_budget", "waiting_capacity"].includes(job.state) && !job.provider_job_id;
