import { budgetUsdToMicros } from "./budget-input";

export const MAX_BUDGET_REQUEST_NOTE = 1000;

export function validateBudgetRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a budget request.");
  const body = value as Record<string, unknown>;
  const amount_micros = budgetUsdToMicros(body.amount_usd, true);
  if (typeof body.idempotency_key !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.idempotency_key)) {
    throw new Error("A valid request retry key is required.");
  }
  if (body.note !== undefined && typeof body.note !== "string") throw new Error("The note must be text.");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_BUDGET_REQUEST_NOTE || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) {
    throw new Error(`The note must be at most ${MAX_BUDGET_REQUEST_NOTE} characters.`);
  }
  return { amount_micros, note, idempotency_key: body.idempotency_key };
}
