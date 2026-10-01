import "server-only";
import { ApiError } from "@/lib/http";

export class InkboxError extends ApiError {
  existingRuleId?: string;
  constructor(public upstreamStatus: number, existingRuleId?: string) {
    const message = upstreamStatus === 402 || upstreamStatus === 429
      ? "Inkbox capacity was reached. Check the Inkbox Console plan and retry."
      : upstreamStatus === 401 || upstreamStatus === 403
        ? "Inkbox rejected the server credential. Check INKBOX_ADMIN_KEY."
        : "Inkbox could not complete this step. Please retry.";
    super(502, "inkbox_error", message);
    this.existingRuleId = existingRuleId;
  }
}

export function inkboxConfigured(): boolean {
  return !!process.env.INKBOX_ADMIN_KEY;
}

async function call<T>(path: string, init?: RequestInit, scopedKey?: string): Promise<T> {
  const key = scopedKey ?? process.env.INKBOX_ADMIN_KEY;
  if (!key) throw new ApiError(503, "inkbox_not_configured", "The operator must add INKBOX_ADMIN_KEY to enable agent identities.");
  let response: Response;
  try {
    response = await fetch(`https://inkbox.ai/api/v1${path}`, {
      ...init,
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(502, "inkbox_unavailable", "Inkbox is temporarily unavailable. Please retry.");
  }
  if (!response.ok) {
    // Provider bodies can contain credentials or private content. Extract only a rule identifier.
    const body = await response.json().catch(() => ({}));
    const id = body?.detail?.existing_rule_id;
    throw new InkboxError(response.status, typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : undefined);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface InkboxIdentity {
  id: string;
  email_address: string;
  agent_handle: string;
}

export const inkbox = {
  getIdentity: (handle: string) => call<InkboxIdentity>(`/identities/${handle}`),
  createIdentity: (handle: string, displayName: string) => call<InkboxIdentity>("/identities", {
    method: "POST", body: JSON.stringify({ agent_handle: handle, display_name: displayName, imessage_enabled: true }),
  }),
  restrictIdentity: (handle: string) => call<InkboxIdentity>(`/identities/${handle}`, {
    method: "PATCH", body: JSON.stringify({ phone_filter_mode: "whitelist", mail_inbound_filter_mode: "whitelist" }),
  }),
  async allowContact(handle: string, channel: "phone" | "email", target: string) {
    const path = channel === "phone" ? `/imessage/identities/${handle}/contact-rules` : `/identities/${handle}/mail-contact-rules`;
    try {
      return await call<{ id: string }>(path, { method: "POST", body: JSON.stringify({
        action: "allow", match_target: target, direction: "both", ...(channel === "email" ? { match_type: "exact_email" } : {}),
      }) });
    } catch (error) {
      if (error instanceof InkboxError && error.upstreamStatus === 409 && error.existingRuleId) return { id: error.existingRuleId };
      throw error;
    }
  },
  listPhoneRules: (handle: string) => call<{ id: string; action: string; match_target: string }[]>(`/imessage/identities/${handle}/contact-rules?limit=200`),
  deletePhoneRule: (handle: string, ruleId: string) => call<void>(`/imessage/identities/${handle}/contact-rules/${ruleId}`, { method: "DELETE" }),
  mintKey: (identityId: string, handle: string) => call<{ api_key: string }>("/api-keys", {
    method: "POST", body: JSON.stringify({ label: `${handle} runtime`, scoped_identity_id: identityId }),
  }),
  revokeKey: (key: string) => call<void>("/api-keys/self/revoke", { method: "POST" }, key),
  deleteIdentity: (handle: string) => call<void>(`/identities/${handle}`, { method: "DELETE" }),
  connectInfo: (identityId: string) => call<{
    number: string; connect_command: string; sms_link: string; connect_qr_png_data_url: string;
  }>(`/imessage/triage-number?agent_identity_id=${encodeURIComponent(identityId)}`),
};
