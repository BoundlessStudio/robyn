import "server-only";
import { agent37 } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { buildUsageReport, usageWindowDays, type UsageOwnership, type UsageWindow } from "@/lib/usage-report";
import type { WorkspaceUsage } from "@/lib/types";

// Server-only daily snapshots are shared across tenant requests, but ownership is
// always read and applied afresh. Cache no permissions or tenant-facing reports.
const dayCache = new Map<string, { expires: number; response: Promise<WorkspaceUsage> }>();
async function readDay(date: string): Promise<WorkspaceUsage> {
  const cached = dayCache.get(date);
  if (cached && cached.expires > Date.now()) return cached.response;
  const response = agent37.getWorkspaceUsage(date, date, AbortSignal.timeout(20_000));
  const entry = { expires: Date.now() + 60_000, response };
  dayCache.delete(date);
  dayCache.set(date, entry);
  if (dayCache.size > 90) dayCache.delete(dayCache.keys().next().value!);
  try { return await response; }
  catch (error) { if (dayCache.get(date) === entry) dayCache.delete(date); throw error; }
}

async function ownershipRows(db: DB, workspaceId: string, table: "agents" | "billing_agents") {
  const result: { agent37_id: string; name?: string | null }[] = [];
  for (let start = 0; ; start += 1000) {
    const query = table === "agents" ? db.from("agents").select("agent37_id, name") : db.from("billing_agents").select("agent37_id");
    const { data, error } = await query
      .eq("workspace_id", workspaceId).order("agent37_id").range(start, start + 999);
    if (error || !data) throw new ApiError(503, "usage_ownership_unavailable", "Could not load workspace agents. Please retry.");
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

// Caller must verify workspace admin access before invoking this read-only DAL.
export async function readWorkspaceUsage(db: DB, workspaceId: string, window: UsageWindow) {
  const [tracked, current] = await Promise.all([
    ownershipRows(db, workspaceId, "billing_agents"),
    ownershipRows(db, workspaceId, "agents"),
  ]);
  const ownership = new Map<string, UsageOwnership>(tracked.map((row) => [row.agent37_id, { id: row.agent37_id, name: null, deleted: true }]));
  for (const row of current) ownership.set(row.agent37_id, { id: row.agent37_id, name: row.name ?? null, deleted: false });
  const dates = usageWindowDays(window);
  if (!ownership.size) {
    return buildUsageReport(window, [], dates.map((date) => ({ date, usage: { from: date, to: date, instances: [] } })));
  }
  const sources: { date: string; usage: WorkspaceUsage }[] = [];
  // The API's daily and model totals cover the shared key, so request one UTC day
  // at a time and sum only authorized instances. Bound parallelism for 90-day views.
  for (let start = 0; start < dates.length; start += 6) {
    sources.push(...await Promise.all(dates.slice(start, start + 6).map(async (date) => ({ date, usage: await readDay(date) }))));
  }
  try { return buildUsageReport(window, [...ownership.values()], sources); }
  catch { throw new ApiError(502, "invalid_usage", "The usage response was incomplete or inconsistent. Please retry."); }
}
