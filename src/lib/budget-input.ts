// Keep USD input as decimal text so sub-cent budgets reach Agent37 as exact integer micros.
export function budgetUsdToMicros(value: unknown, positive = false): number {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (text.length > 32 || !/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(text)) {
    throw new Error("Enter a USD amount with up to 6 decimal places.");
  }
  const [whole, fraction = ""] = text.split(".");
  const micros = BigInt(whole || "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The USD amount is too large.");
  if (positive && micros === 0n) throw new Error("Extra budget must be greater than $0.");
  return Number(micros);
}

export function microsToBudgetUsd(micros: number): string {
  const whole = Math.floor(micros / 1_000_000);
  const fraction = String(micros % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function budgetBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a budget object.");
  return value as Record<string, unknown>;
}

export function validateMonthlyBudget(value: unknown): { monthly_cap_micros: number } {
  const body = budgetBody(value);
  return { monthly_cap_micros: budgetUsdToMicros(body.monthly_cap_usd) };
}

export function validateBudgetTopUp(value: unknown): { amount_micros: number; idempotency_key: string } {
  const body = budgetBody(value);
  const amount_micros = budgetUsdToMicros(body.amount_usd, true);
  if (typeof body.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.idempotency_key)) {
    throw new Error("A valid top-up retry key is required.");
  }
  return { amount_micros, idempotency_key: body.idempotency_key };
}
