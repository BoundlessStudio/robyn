import type { EmailOtpType } from "@supabase/supabase-js";
import { authReturnPath } from "./auth-redirect";
import { hasSameOrigin } from "./request-origin";

const emailTypes = new Set<EmailOtpType>(["email", "invite", "magiclink", "signup", "recovery", "email_change"]);

export function emailLinkFields(fields: URLSearchParams) {
  const tokenHash = fields.get("token_hash");
  const type = fields.get("type") as EmailOtpType | null;
  return tokenHash && /^[a-zA-Z0-9_-]{32,256}$/.test(tokenHash) && type && emailTypes.has(type)
    ? { tokenHash, type } : null;
}

type AuthActions = {
  verify: (tokenHash: string, type: EmailOtpType) => Promise<boolean>;
  exchangeCode: (code: string) => Promise<boolean>;
  hasSession: () => Promise<boolean>;
};

/** A GET may be an email safety scan. Only an intentional same-origin POST spends an email token. */
export async function emailLinkResponse(request: Request, auth: AuthActions): Promise<Response> {
  const url = new URL(request.url);
  const redirect = (target: URL, status = request.method === "POST" ? 303 : 307) => new Response(null, {
    status, headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "strict-origin" },
  });

  let fields = url.searchParams;
  if (request.method === "POST") {
    if (!hasSameOrigin(request)) return new Response("Open your sign-in link on Robyn to continue.", { status: 403 });
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response("Invalid sign-in form.", { status: 415 });
    if (Number(request.headers.get("content-length")) > 8192) return new Response("Sign-in form is too large.", { status: 413 });
    const body = await request.text();
    if (body.length > 8192) return new Response("Sign-in form is too large.", { status: 413 });
    fields = new URLSearchParams(body);
  }

  const next = authReturnPath(fields.get("next"), url.origin);
  const destination = new URL(next, url.origin);
  const link = emailLinkFields(fields);
  if (link && request.method !== "POST") {
    const confirmation = new URL("/auth/confirm", url.origin);
    confirmation.searchParams.set("token_hash", link.tokenHash);
    confirmation.searchParams.set("type", link.type);
    confirmation.searchParams.set("next", next);
    return redirect(confirmation);
  }

  if (request.method === "POST" && link) {
    if (await auth.verify(link.tokenHash, link.type)) return redirect(destination);
  } else if (request.method === "GET" && fields.get("code")) {
    if (await auth.exchangeCode(fields.get("code")!)) return redirect(destination);
  }

  // Reopening a used link in an already signed-in browser should keep the creator in their studio.
  if (await auth.hasSession()) return redirect(destination);
  const retry = new URL("/login", url.origin);
  retry.searchParams.set("error", "auth");
  retry.searchParams.set("next", next);
  return redirect(retry);
}
