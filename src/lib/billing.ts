import "server-only";
import Stripe from "stripe";
import type { DB } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { normalizeOrigin } from "@/lib/site-url";
import { billingRetryKey, billingUsdToCents, type BillingSummary } from "@/lib/billing-input";

export interface BillingWallet {
  workspace_id: string;
  balance_micros: number;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  payment_method_details: BillingSummary["payment_method"];
  auto_top_up_enabled: boolean;
  auto_top_up_amount_micros: number;
  auto_top_up_threshold_micros: number;
  auto_top_up_error: string | null;
  usage_synced_through: string | null;
  created_at: string;
}

export function paymentsAvailable() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new ApiError(503, "payments_unavailable", "Card payments have not been configured yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });
}

export function billingDbError(error: unknown) {
  if (error) throw new ApiError(500, "billing_error", "Billing could not be updated. Please retry.");
}

export async function getBillingWallet(db: DB, workspaceId: string): Promise<BillingWallet> {
  const { data, error } = await db.from("workspace_billing").select("*").eq("workspace_id", workspaceId).single();
  billingDbError(error);
  if (!data) throw new ApiError(503, "billing_unavailable", "Workspace billing is unavailable.");
  return data as BillingWallet;
}

export async function billingSummary(db: DB, workspaceId: string): Promise<BillingSummary> {
  const wallet = await getBillingWallet(db, workspaceId);
  // Only these fields may reach the browser. No shared wallet, usage, customer IDs, or keys.
  return {
    balance_micros: wallet.balance_micros, currency: "USD", payments_available: paymentsAvailable(),
    payment_method: wallet.payment_method_details,
    automatic_top_up: {
      enabled: wallet.auto_top_up_enabled, amount_micros: wallet.auto_top_up_amount_micros,
      threshold_micros: wallet.auto_top_up_threshold_micros, error: wallet.auto_top_up_error,
    },
  };
}

export async function requireWorkspaceBalance(db: DB, workspaceId: string) {
  if ((await getBillingWallet(db, workspaceId)).balance_micros <= 0) {
    throw new ApiError(402, "workspace_balance_empty", "Add funds in workspace Billing to run agents.");
  }
}

async function ensureCustomer(db: DB, workspaceId: string, email: string) {
  const wallet = await getBillingWallet(db, workspaceId);
  if (wallet.stripe_customer_id) return wallet.stripe_customer_id;
  const customer = await stripeClient().customers.create({ email, metadata: { app: "workspace-billing", workspace_id: workspaceId } }, { idempotencyKey: `workspace-customer:${workspaceId}` });
  const { error } = await db.from("workspace_billing").update({ stripe_customer_id: customer.id }).eq("workspace_id", workspaceId).is("stripe_customer_id", null);
  billingDbError(error);
  // A concurrent request may have attached the same customer first.
  return (await getBillingWallet(db, workspaceId)).stripe_customer_id!;
}

function returnUrl(request: Request, workspaceId: string) {
  const requestUrl = new URL(request.url);
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const origin = configured || (["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname) ? requestUrl.origin : null);
  if (!origin) throw new ApiError(503, "payments_unavailable", "The billing return URL has not been configured yet.");
  return `${origin}/dashboard/billing?workspace=${encodeURIComponent(workspaceId)}`;
}

export async function createBillingCheckout(db: DB, workspaceId: string, email: string, request: Request, body: Record<string, unknown>, setup = false) {
  if (!paymentsAvailable()) throw new ApiError(503, "payments_unavailable", "Card payments have not been configured yet.");
  const retryKey = billingRetryKey(body.idempotency_key);
  const amount = setup ? null : billingUsdToCents(body.amount_usd);
  const url = returnUrl(request, workspaceId);
  const customer = await ensureCustomer(db, workspaceId, email);
  const metadata = { app: "workspace-billing", workspace_id: workspaceId, kind: setup ? "card_setup" : "top_up" };
  const session = await stripeClient().checkout.sessions.create({
    customer, mode: setup ? "setup" : "payment", allowed_payment_method_types: ["card"],
    success_url: `${url}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${url}&canceled=1`, metadata,
    ...(setup ? { currency: "usd", setup_intent_data: { metadata } } : {
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount!, product_data: { name: "Workspace balance", description: "Prepaid credit for your agents" } } }],
      payment_intent_data: { setup_future_usage: "off_session", metadata },
    }),
    custom_text: { submit: { message: "Your card is saved for future payments. Automatic top-up charges require you to enable automatic top-up in Billing." } },
  }, { idempotencyKey: `billing-checkout:${workspaceId}:${setup ? "setup" : "payment"}:${retryKey}` });
  if (!session.url) throw new ApiError(502, "checkout_error", "Could not open payment checkout. Please retry.");
  return { url: session.url };
}

async function walletForCustomer(db: DB, customer: string, workspaceId: string) {
  const wallet = await getBillingWallet(db, workspaceId);
  if (wallet.stripe_customer_id !== customer) throw new ApiError(400, "invalid_payment", "Payment does not belong to this workspace.");
  return wallet;
}

async function savePaymentMethod(db: DB, workspaceId: string, customer: string, methodId: string, eventTime: number) {
  const method = await stripeClient().paymentMethods.retrieve(methodId);
  if (method.customer !== customer || method.type !== "card" || !method.card) throw new ApiError(400, "invalid_payment_method", "Invalid saved payment method.");
  const { brand, last4, exp_month, exp_year } = method.card;
  const { error } = await db.from("workspace_billing").update({
    payment_method_id: methodId, payment_method_details: { brand, last4, exp_month, exp_year }, payment_method_updated_at: eventTime,
  }).eq("workspace_id", workspaceId).lte("payment_method_updated_at", eventTime);
  billingDbError(error);
}

// Called only with Stripe-verified events or objects retrieved directly from Stripe.
export async function fulfillPayment(db: DB, intent: Stripe.PaymentIntent) {
  if (intent.metadata.app !== "workspace-billing" || intent.metadata.kind !== "top_up") return;
  if (intent.status !== "succeeded" || intent.currency !== "usd" || typeof intent.customer !== "string") throw new ApiError(400, "invalid_payment", "Invalid balance payment.");
  const workspaceId = intent.metadata.workspace_id;
  await walletForCustomer(db, intent.customer, workspaceId);
  if (!Number.isSafeInteger(intent.amount_received) || intent.amount_received < 500 || intent.amount_received > 1_000_000) throw new ApiError(400, "invalid_payment", "Invalid payment amount.");
  const { error } = await db.rpc("billing_credit", { p_workspace: workspaceId, p_amount: intent.amount_received * 10_000, p_kind: "payment", p_source: `stripe:${intent.id}` });
  billingDbError(error);
  if (typeof intent.payment_method === "string") await savePaymentMethod(db, workspaceId, intent.customer, intent.payment_method, intent.created);
  if (intent.metadata.auto_attempt) {
    const { error: attemptError } = await db.from("billing_auto_topups").update({ finished: true }).eq("id", intent.metadata.auto_attempt).eq("workspace_id", workspaceId);
    billingDbError(attemptError);
  }
}

export async function fulfillCardSetup(db: DB, intent: Stripe.SetupIntent) {
  if (intent.metadata?.app !== "workspace-billing" || intent.metadata.kind !== "card_setup") return;
  if (intent.status !== "succeeded" || typeof intent.customer !== "string" || typeof intent.payment_method !== "string") throw new ApiError(400, "invalid_payment_method", "Invalid saved payment method.");
  await walletForCustomer(db, intent.customer, intent.metadata.workspace_id);
  await savePaymentMethod(db, intent.metadata.workspace_id, intent.customer, intent.payment_method, intent.created);
}

export async function fulfillRefund(db: DB, charge: Stripe.Charge) {
  if (typeof charge.payment_intent !== "string") return;
  const intent = await stripeClient().paymentIntents.retrieve(charge.payment_intent);
  if (intent.metadata.app !== "workspace-billing" || intent.metadata.kind !== "top_up") return;
  if (charge.currency !== "usd" || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0) throw new ApiError(400, "invalid_refund", "Invalid balance refund.");
  // A refund webhook can arrive before the successful payment webhook.
  await fulfillPayment(db, intent);
  const { error } = await db.rpc("billing_settle_refund", { p_source: `stripe:${intent.id}`, p_refunded: charge.amount_refunded * 10_000 });
  billingDbError(error);
}

export async function confirmBillingCheckout(db: DB, workspaceId: string, sessionId: unknown) {
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]{1,240}$/.test(sessionId)) throw new ApiError(400, "invalid_request", "Invalid checkout session.");
  const wallet = await getBillingWallet(db, workspaceId);
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.customer !== wallet.stripe_customer_id || session.metadata?.workspace_id !== workspaceId || session.metadata?.app !== "workspace-billing") throw new ApiError(404, "not_found", "Checkout not found.");
  if (session.status !== "complete") return { complete: false };
  if (typeof session.payment_intent === "string") await fulfillPayment(db, await stripe.paymentIntents.retrieve(session.payment_intent));
  else if (typeof session.setup_intent === "string") await fulfillCardSetup(db, await stripe.setupIntents.retrieve(session.setup_intent));
  else return { complete: false };
  return { complete: true };
}
