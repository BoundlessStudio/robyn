import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { agent37 } from "@/lib/agent37";
import type { WorkspaceUsage } from "@/lib/types";
import { billingDbError, type BillingWallet } from "@/lib/billing";
import { syncWorkspaceBilling } from "@/lib/billing-sync";
import { ApiError, handleError, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const secret = process.env.BILLING_CRON_SECRET;
    const authorization = request.headers.get("authorization") || "";
    if (!secret || !timingSafeEqual(createHash("sha256").update(authorization).digest(), createHash("sha256").update(`Bearer ${secret}`).digest())) throw new ApiError(401, "unauthorized", "Operator authentication required.");
    const db = createAdminClient();
    let synced = 0;
    let failed = 0;
    const usageCache = new Map<string, Promise<WorkspaceUsage>>();
    const readUsage = (day: string) => {
      if (!usageCache.has(day)) usageCache.set(day, agent37.getWorkspaceUsage(day, day));
      return usageCache.get(day)!;
    };
    // Keyset pagination avoids dropping wallets past Supabase's result limit.
    let cursor: string | null = null;
    do {
      let query = db.from("workspace_billing").select("*").order("workspace_id").limit(100);
      if (cursor) query = query.gt("workspace_id", cursor);
      const { data, error } = await query;
      billingDbError(error);
      const wallets = (data ?? []) as BillingWallet[];
      for (const wallet of wallets) {
        try { await syncWorkspaceBilling(db, wallet, readUsage); synced++; }
        catch (error) {
          failed++;
          console.error("[billing-sync]", wallet.workspace_id, error instanceof ApiError ? error.code : "sync_failed");
        }
      }
      cursor = wallets.length === 100 ? wallets.at(-1)!.workspace_id : null;
    } while (cursor);
    return json({ synced, failed }, failed ? 503 : 200);
  } catch (error) { return handleError(error); }
}
