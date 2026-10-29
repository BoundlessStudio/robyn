import { ApiError } from "@/lib/api-error";
import { adminError, adminJson, readAdminBody, requireBetaAdmin } from "@/lib/beta-admin";
import { publicSiteOrigin } from "@/lib/site-url";
import type { BetaRequest } from "@/lib/beta-requests";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireBetaAdmin();
    const input = await readAdminBody(request);
    const { id } = await context.params;
    if (!uuid.test(id)) throw new ApiError(400, "invalid_request", "Choose a valid beta request.");
    const rpc = async (name: string, fields: Record<string, unknown>) => {
      const { data, error } = await db.rpc(name, fields);
      if (error) throw new Error();
      return data;
    };
    if (input.action === "decline" || input.action === "reopen" || input.action === "check") {
      const row = input.action === "check" ? await rpc("reconcile_beta_invitation", { p_request: id }) : await rpc("set_beta_request_status", { p_request: id, p_status: input.action === "decline" ? "declined" : "requested" });
      if (!row) throw new ApiError(409, "request_changed", "This request has changed. Refresh to see its current status.");
      return adminJson({ request: row });
    }
    if (!["invite", "resend"].includes(String(input.action)) || typeof input.operationId !== "string" || !uuid.test(input.operationId)) throw new ApiError(400, "invalid_request", "Choose an invitation action with a request identity.");
    const claim = await rpc("claim_beta_invitation", { p_request: id, p_operation: input.operationId, p_action: input.action });
    if (claim.outcome === "replay" && claim.request.send_state === "sent") return adminJson({ request: claim.request });
    if (claim.outcome !== "claimed") {
      const messages: Record<string, string> = { not_found: "Beta request not found.", pending: "The previous email is still being checked. Check its status before sending again.", replay: "This email attempt has already been recorded. Check its status before sending again.", cooldown: "Wait one minute between invitation emails.", closed: "This request is already joined or declined.", changed: "This request has changed. Refresh before sending." };
      throw new ApiError(claim.outcome === "not_found" ? 404 : 409, claim.outcome, messages[claim.outcome] ?? "Refresh this request before sending.");
    }
    const row = claim.request as BetaRequest;
    const redirectTo = new URL("/dashboard", publicSiteOrigin(new URL(request.url).origin)).toString();
    let result: "sent" | "failed" | "uncertain" = "uncertain";
    let rateLimited = false;
    try {
      let { error } = await db.auth.admin.inviteUserByEmail(row.email, { redirectTo });
      // A confirmed account that has not signed in yet needs a sign-in link.
      if (error && ["email_exists", "user_already_exists"].includes(error.code ?? "")) {
        ({ error } = await db.auth.signInWithOtp({ email: row.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } }));
      }
      rateLimited = error?.status === 429;
      result = !error ? "sent" : error.status && error.status >= 400 && error.status < 500 ? "failed" : "uncertain";
    } catch { /* A lost provider reply must never authorize another send. */ }
    const saved = await rpc("finish_beta_invitation", { p_request: id, p_operation: input.operationId, p_result: result });
    if (result !== "sent") throw new ApiError(rateLimited ? 429 : 503, result === "uncertain" ? "send_uncertain" : "send_failed", result === "uncertain" ? "The email outcome is uncertain. Check its status before sending again." : rateLimited ? "The email provider is limiting requests. Try again later." : "The email was not sent. Try again later.");
    return adminJson({ request: saved });
  } catch (error) { return adminError(error); }
}
