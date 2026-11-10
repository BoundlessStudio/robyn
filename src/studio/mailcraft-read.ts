import { ApiError } from "@/lib/api-error";

const remoteId = /^[A-Za-z0-9+/_=.:-]{1,512}$/;

export type MailcraftRead =
  | { kind: "mail" | "contacts" | "tasks" }
  | { kind: "message"; id: string }
  | { kind: "calendar"; from: number; to: number };

export function mailcraftRead(value: unknown): MailcraftRead {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { kind, id, from, to } = value as Record<string, unknown>;
    if (kind === "mail" || kind === "contacts" || kind === "tasks") return { kind };
    if (kind === "message" && typeof id === "string" && remoteId.test(id)) return { kind, id };
    if (kind === "calendar" && typeof from === "number" && typeof to === "number"
      && Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0
      && to > from && to - from <= 93 * 86400 && to <= 4102444800) return { kind, from, to };
  }
  throw new ApiError(400, "mailcraft_invalid_view", "Choose a supported MailCraft view.");
}
