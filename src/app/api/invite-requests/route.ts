import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInvitationRequest } from "@/lib/invitation-request";
import { hasSameOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const unavailable = "Invitations aren’t connected yet. Your request has not been saved. Please try again later.";
function failure(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return failure("Please submit the invitation form from this website.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("Send a JSON invitation request.", 415);
  // Bound actual streamed bytes as well as Content-Length; the latter is optional
  // and cannot be trusted to protect a public endpoint's memory use.
  if (Number(request.headers.get("content-length")) > 4096) return failure("This request is too large.", 413);
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("Please enter your email address.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return failure("This request is too large.", 413); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return failure("Please check the invitation form and try again.", 400); }
  let payload;
  try { payload = parseInvitationRequest(input); }
  catch (error) { return failure(error instanceof Error ? error.message : "Invalid invitation request.", 400); }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return failure(unavailable, 503);
  // Vercel overwrites this header. Outside Vercel use one conservative local
  // bucket instead of trusting a visitor-supplied forwarding header.
  const address = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const bucket = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY).update(address).digest("hex");
  try {
    const { data, error } = await createAdminClient().rpc("submit_studio_access_request", {
      p_email: payload.email, p_craft: payload.craft, p_rate_key: bucket,
    });
    if (error) { console.error("[invite-request] database operation failed", error.code); return failure("Your request could not be saved. Please try again later.", 503); }
    if (data === "rate_limited") return failure("Too many requests. Please try again in an hour.", 429);
    if (data !== "saved") return failure("Your request could not be saved. Please try again later.", 503);
    return NextResponse.json({ saved: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return failure("Your request could not be saved. Please try again later.", 503); }
}
