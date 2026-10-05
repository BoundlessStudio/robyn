export const MIN_TOP_UP_CENTS = 500;
export const MAX_TOP_UP_CENTS = 1_000_000;

export function billingUsdToCents(value: unknown, minimum = MIN_TOP_UP_CENTS): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter a USD amount with up to two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < minimum || cents > MAX_TOP_UP_CENTS) throw new Error(`Enter an amount between $${minimum / 100} and $10,000.`);
  return cents;
}

export function billingRetryKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error("A valid payment retry key is required.");
  return value;
}

export function autoTopUpInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected automatic top-up settings.");
  const body = value as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") throw new Error("Choose whether automatic top-up is enabled.");
  if (!body.enabled) return { auto_top_up_enabled: false };
  const amount = billingUsdToCents(body.amount_usd);
  const threshold = billingUsdToCents(body.threshold_usd, 300);
  if (threshold >= amount) throw new Error("The refill amount must be greater than the balance threshold.");
  return { auto_top_up_enabled: true, auto_top_up_amount_micros: amount * 10_000, auto_top_up_threshold_micros: threshold * 10_000 };
}

export interface BillingSummary {
  balance_micros: number;
  currency: "USD";
  payments_available: boolean;
  payment_method: { brand: string; last4: string; exp_month: number; exp_year: number } | null;
  automatic_top_up: { enabled: boolean; amount_micros: number; threshold_micros: number; error: string | null };
}
