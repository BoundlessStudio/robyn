import "server-only";
import { agent37, Agent37Error } from "@/lib/agent37";
import type { DB } from "@/lib/auth";
import type { WorkspaceUsage } from "@/lib/types";
import { ApiError } from "@/lib/http";
import { billingDbError, fulfillPayment, getBillingWallet, paymentsAvailable, stripeClient, type BillingWallet } from "@/lib/billing";

interface AutoAttempt { id: string; workspace_id: string; amount_micros: number; customer_id: string; payment_method_id: string; created_at: string }

async function disableAutoTopUp(db: DB, attempt: AutoAttempt, message: string, finished: boolean) {
  const { error } = await db.from("workspace_billing").update({ auto_top_up_enabled: false, auto_top_up_error: message }).eq("workspace_id", attempt.workspace_id);
  billingDbError(error);
  if (finished) {
    const { error: attemptError } = await db.from("billing_auto_topups").update({ finished: true }).eq("id", attempt.id);
    billingDbError(attemptError);
  }
}

export async function refillWorkspace(db: DB, workspaceId: string) {
  if (!paymentsAvailable()) return;
  const { data, error } = await db.rpc("billing_claim_auto_topup", { p_workspace: workspaceId });
  billingDbError(error);
  const attempt = (data as AutoAttempt[] | null)?.[0];
  if (!attempt) return;
  // Stripe retains retry keys for at least 24h. Never create a second charge after an uncertain result.
  if (Date.now() - Date.parse(attempt.created_at) > 23 * 60 * 60 * 1000) {
    await disableAutoTopUp(db, attempt, "An automatic payment needs review. Contact support or add funds manually.", false);
    return;
  }
  let intent;
  try {
    intent = await stripeClient().paymentIntents.create({
      customer: attempt.customer_id, payment_method: attempt.payment_method_id,
      amount: attempt.amount_micros / 10_000, currency: "usd", off_session: true, confirm: true,
      allowed_payment_method_types: ["card"],
      metadata: { app: "workspace-billing", kind: "top_up", workspace_id: workspaceId, auto_attempt: attempt.id },
    }, { idempotencyKey: `auto-topup:${attempt.id}` });
  } catch (error) {
    // An uncertain network/server failure remains pending and retries with the same key.
    const stripeError = error as { type?: string };
    if (stripeError.type === "StripeCardError" || stripeError.type === "StripeInvalidRequestError") {
      await disableAutoTopUp(db, attempt, "Automatic top-up failed. Update your card or add funds, then enable it again.", true);
      return;
    }
    throw new ApiError(502, "payment_pending", "Automatic payment could not be confirmed; it will be retried safely.");
  }
  if (intent.status === "succeeded") await fulfillPayment(db, intent);
  else if (intent.status !== "processing") await disableAutoTopUp(db, attempt, "Your card needs authentication. Add funds manually, then enable automatic top-up again.", true);
}

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Caller is the authenticated operator sweep, never a browser. Usage remains server-side.
export async function syncWorkspaceBilling(db: DB, wallet: BillingWallet, readUsage: (day: string) => Promise<WorkspaceUsage> = (day) => agent37.getWorkspaceUsage(day, day)) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: tracked, error: trackedError } = await db.from("billing_agents").select("agent37_id").eq("workspace_id", wallet.workspace_id).limit(1);
  billingDbError(trackedError);
  const createdDay = wallet.created_at.slice(0, 10);
  // Re-read two previous days to catch final minutes and delayed upstream settlement.
  const from = wallet.usage_synced_through ? [createdDay, shiftDay(wallet.usage_synced_through, -2)].sort().at(-1)! : createdDay;
  if (tracked?.length && from < shiftDay(today, -89)) throw new ApiError(503, "billing_sync_overdue", "Billing reconciliation is more than 90 days overdue and needs operator review.");
  for (let day = tracked?.length ? from : today; day <= today; day = shiftDay(day, 1)) {
    if (!tracked?.length) {
      const { error } = await db.rpc("billing_settle_usage", { p_workspace: wallet.workspace_id, p_day: day, p_totals: {} });
      billingDbError(error);
      continue;
    }
    const usage = await readUsage(day);
    if (usage.from !== day || usage.to !== day || !Array.isArray(usage.instances)) throw new ApiError(502, "invalid_usage", "Invalid billing usage response.");
    const totals: Record<string, number> = Object.create(null);
    for (const instance of usage.instances) {
      if (!Number.isSafeInteger(instance.total_micros) || instance.total_micros < 0) throw new ApiError(502, "invalid_usage", "Invalid billing usage amount.");
      totals[instance.id] = instance.total_micros;
    }
    // SQL filters to persisted, tenant-owned agent IDs; shared-key totals never enter a wallet.
    const { error } = await db.rpc("billing_settle_usage", { p_workspace: wallet.workspace_id, p_day: day, p_totals: totals });
    billingDbError(error);
  }
  let refillError: unknown;
  try { await refillWorkspace(db, wallet.workspace_id); }
  catch (error) { refillError = error; }
  if ((await getBillingWallet(db, wallet.workspace_id)).balance_micros <= 0) {
    const { data: agents, error } = await db.from("agents").select("agent37_id").eq("workspace_id", wallet.workspace_id);
    billingDbError(error);
    for (const row of agents ?? []) {
      try {
        const live = await agent37.getAgent(row.agent37_id);
        if (!["stopped", "stopping", "failed", "deleted"].includes(live.status)) await agent37.stop(row.agent37_id);
      } catch (error) { if (!(error instanceof Agent37Error && error.status === 404)) throw error; }
    }
  }
  if (refillError) throw refillError;
}
