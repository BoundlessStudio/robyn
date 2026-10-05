import { requireAdmin, requireUser } from "@/lib/auth";
import { ApiError, handleError, json, readJson } from "@/lib/http";
import { autoTopUpInput } from "@/lib/billing-input";
import { billingDbError, billingSummary, confirmBillingCheckout, createBillingCheckout, getBillingWallet, paymentsAvailable } from "@/lib/billing";

type Ctx = { params: Promise<{ id: string }> };

async function authorize({ params }: Ctx) {
  const { id } = await params;
  const { db, user } = await requireUser();
  await requireAdmin(db, id, user.id);
  return { id, db, user };
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id, db } = await authorize(ctx);
    return json(await billingSummary(db, id));
  } catch (error) { return handleError(error); }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id, db } = await authorize(ctx);
    let settings;
    try { settings = autoTopUpInput(await readJson<unknown>(request)); }
    catch (error) { throw new ApiError(400, "invalid_request", (error as Error).message); }
    if (settings.auto_top_up_enabled) {
      if (!paymentsAvailable()) throw new ApiError(503, "payments_unavailable", "Card payments have not been configured yet.");
      if (!(await getBillingWallet(db, id)).payment_method_id) throw new ApiError(400, "payment_method_required", "Add a payment method before enabling automatic top-up.");
    }
    const { error } = await db.from("workspace_billing").update({ ...settings, auto_top_up_error: null }).eq("workspace_id", id);
    billingDbError(error);
    return json(await billingSummary(db, id));
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id, db, user } = await authorize(ctx);
    const body = await readJson<Record<string, unknown>>(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_request", "Expected a billing action.");
    if (body.action === "confirm") return json(await confirmBillingCheckout(db, id, body.session_id));
    if (body.action === "checkout" || body.action === "payment_method") {
      try { return json(await createBillingCheckout(db, id, user.email || "", request, body, body.action === "payment_method")); }
      catch (error) {
        if (error instanceof ApiError) throw error;
        // Input errors may be shown; provider errors must not expose private payment data.
        if ((error as { type?: string }).type?.startsWith("Stripe")) throw new ApiError(502, "payment_error", "Could not open Stripe checkout. Please retry.");
        throw new ApiError(400, "invalid_request", (error as Error).message);
      }
    }
    throw new ApiError(400, "invalid_request", "Unknown billing action.");
  } catch (error) { return handleError(error); }
}
