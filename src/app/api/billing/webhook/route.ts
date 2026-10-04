import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillCardSetup, fulfillPayment, fulfillRefund, stripeClient } from "@/lib/billing";
import { ApiError, handleError, json } from "@/lib/http";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, "payments_unavailable", "Payment webhook is not configured.");
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "invalid_signature", "Missing payment signature.");
    let event: Stripe.Event;
    try { event = stripeClient().webhooks.constructEvent(await request.text(), signature, secret); }
    catch { throw new ApiError(400, "invalid_signature", "Invalid payment signature."); }
    if (event.type === "payment_intent.succeeded") await fulfillPayment(createAdminClient(), event.data.object);
    if (event.type === "setup_intent.succeeded") await fulfillCardSetup(createAdminClient(), event.data.object);
    if (event.type === "charge.refunded") await fulfillRefund(createAdminClient(), event.data.object);
    return json({ received: true });
  } catch (error) { return handleError(error); }
}
