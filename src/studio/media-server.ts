import "server-only";
import { createHash } from "node:crypto";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { dbFailure, id, ownedProject } from "./server";
import { parseMediaRequest, parseMediaSearch, publicMediaJob, type MediaIdentity, type MediaJob } from "./media";
import { generationReadiness } from "./media-readiness";
import { searchStock, type StockRecord } from "./media-providers";
import {ownedBudgetEmployee} from "./employee-budgets";
import {paidCapacity} from "./paid-capacity";
import { readPage, pageFilter, finishPage } from "./pagination";

export function mediaDbFailure(error: { message: string; code?: string } | null) {
  if (error?.message.includes("media already dispatched")) throw new ApiError(409, "media_already_dispatched", "This job has already started. Its existing payment must be reconciled before closing it.");
  if (error?.message.includes("operation key reused")) throw new ApiError(409, "operation_key_reused", "Keep this operation ID only when retrying the same media request.");
  if (error?.message.includes("media budget exhausted")) throw new ApiError(409, "media_budget_exhausted", "Your media budget has no room for this request. Adjust the monthly limit or spend ceiling.");
  if (error?.message.includes("media capacity reached")) throw new ApiError(409, "media_capacity", "Three media jobs are already in progress. Wait for one to finish.");
  if (error?.message.includes("employee access denied")) throw new ApiError(401, "employee_access_denied", "This employee assignment is no longer active.");
  if (error?.message.includes("media discovery unavailable")) throw new ApiError(409, "media_discovery_expired", "This search result has expired. Search again before importing.");
  dbFailure(error);
}
export async function searchMedia(db: DB, identity: MediaIdentity, input: Record<string, unknown>) {
  await ownedProject(db, identity.workspaceId, identity.projectId);
  const { error: cleanupError } = await db.rpc("prune_studio_media_search", { p_workspace: identity.workspaceId, p_user: identity.userId });
  mediaDbFailure(cleanupError);
  let search;
  try { search = parseMediaSearch(input); } catch (error) { throw new ApiError(400, "invalid_media_search", (error as Error).message); }
  const cacheKey = createHash("sha256").update(JSON.stringify(search)).digest("hex");
  const { data: cached, error: cacheError } = await db.from("studio_media_search_cache").select("results,expires_at").eq("workspace_id", identity.workspaceId).eq("cache_key", cacheKey).gt("expires_at", new Date().toISOString()).maybeSingle();
  mediaDbFailure(cacheError);
  const expiresAt = cached?.expires_at ?? new Date(Date.now() + 24 * 3600_000).toISOString();
  const records: StockRecord[] = cached?.results ?? await searchStock(search.kind, search.query, search.page);
  if (!cached) {
    const { error } = await db.from("studio_media_search_cache").upsert({ workspace_id: identity.workspaceId, provider: "commons", cache_key: cacheKey, results: records, expires_at: expiresAt }); mediaDbFailure(error);
  }
  if (!records.length) return { results: [], attribution: "Wikimedia Commons · results limited to CC0 and CC BY", page: search.page };
  const { data, error } = await db.from("studio_media_discoveries").insert(records.map(record => ({ workspace_id: identity.workspaceId, project_id: identity.projectId, provider: "commons", source_id: record.sourceId, kind: record.kind, metadata: record, expires_at: expiresAt }))).select("id,metadata");
  mediaDbFailure(error);
  return { results: (data ?? []).map(({ id, metadata: record }: { id: string; metadata: StockRecord }) => ({ id, provider: record.provider, sourceId: record.sourceId, kind: record.kind, title: record.title, creator: record.creator, sourceUrl: record.sourceUrl, previewUrl: record.previewUrl, width: record.width, height: record.height, license: record.license, licenseUrl: record.licenseUrl, attribution: record.attribution, rendition: record.rendition })), attribution: "Wikimedia Commons · CC0 and CC BY", page: search.page };
}
export async function createMediaJob(db: DB, identity: MediaIdentity, input: Record<string, unknown>, employeeHash?: string) {
  const operationId = id(input.operationId, "operation ID");
  let request;
  try { request = parseMediaRequest(input); } catch (error) { throw new ApiError(400, "invalid_media_request", (error as Error).message); }
  if (request.operation === "generate" && !generationReadiness(request).available) {
    // Existing operation IDs still reach the SQL idempotency check. Withdrawing
    // an option must never prevent reconciliation of a previously accepted job.
    const { data: existing, error } = await db.from("studio_media_jobs").select("id").eq("workspace_id",identity.workspaceId).eq("created_by",identity.userId).eq("project_id",identity.projectId).eq("operation_id",operationId).maybeSingle();
    mediaDbFailure(error);
    if (!existing) throw new ApiError(409,"media_acceptance_pending","This exact generation option is awaiting acquisition and editable-file acceptance. Choose an available option.");
  }
  if (!process.env.AGENT37_API_KEY) throw new ApiError(503, "media_workstation_unavailable", "Media acquisition requires a configured studio workstation.");
  const { data, error } = await db.rpc("create_media_job", { p_workspace: identity.workspaceId, p_user: identity.userId, p_project: identity.projectId, p_operation: operationId, p_request: request, p_hash: employeeHash ?? null });
  mediaDbFailure(error);
  return data as MediaJob;
}
export async function ownedMediaJob(db: DB, identity: MediaIdentity, jobId: string): Promise<MediaJob> {
  await ownedProject(db, identity.workspaceId, identity.projectId);
  const { data, error } = await db.from("studio_media_jobs").select("*").eq("workspace_id", identity.workspaceId).eq("project_id", identity.projectId).eq("id", id(jobId, "job ID")).maybeSingle();
  mediaDbFailure(error);
  if (!data) throw new ApiError(404, "not_found", "Media job not found.");
  return data as MediaJob;
}
export async function listMediaJobs(db: DB, identity: MediaIdentity, url = "https://local.invalid/") {
  await ownedProject(db, identity.workspaceId, identity.projectId);
  const page = readPage(url,50);
  let query = db.from("studio_media_jobs").select("*").eq("workspace_id", identity.workspaceId).eq("project_id", identity.projectId);
  if (page.after) query = query.or(pageFilter(page.after));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id",{ascending:false}).limit(page.size+1); mediaDbFailure(error);
  const result = finishPage(data as MediaJob[] ?? [],page.size);
  return {jobs:result.items.map(publicMediaJob),nextCursor:result.nextCursor};
}
export async function mediaBudget(db: DB, workspaceId: string) {
  const {data,error}=await db.from("studio_employees").select("id").eq("workspace_id",workspaceId).eq("employee_key","robyn").is("retired_at",null).single();mediaDbFailure(error);
  if(!data)throw new ApiError(503,"director_unavailable","Robyn is unavailable.");
  return paidCapacity(db,await ownedBudgetEmployee(db,workspaceId,data.id));
}
