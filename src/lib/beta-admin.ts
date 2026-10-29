import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api-error";
import { hasSameOrigin } from "@/lib/request-origin";

export const BETA_ADMIN_COOKIE = "robyn_beta_admin";
export const BETA_SESSION_SECONDS = 8 * 60 * 60;
export const sessionHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newAdminToken = () => randomBytes(32).toString("base64url");
export const adminCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL), sameSite: "strict" as const, path: "/", maxAge: BETA_SESSION_SECONDS });

export async function betaAdminSession() {
  const token = (await cookies()).get(BETA_ADMIN_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = createAdminClient();
  const { data, error } = await db.from("studio_beta_admin_sessions").select("token_hash").eq("token_hash", sessionHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new ApiError(503, "admin_unavailable", "Admin access is temporarily unavailable.");
  return data ? { db, tokenHash: data.token_hash as string } : null;
}

export async function requireBetaAdmin() {
  const session = await betaAdminSession();
  if (!session) throw new ApiError(401, "admin_required", "Sign in to beta administration.");
  return session;
}

export function adminJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function adminError(error: unknown) {
  if (error instanceof ApiError) return adminJson({ error: { code: error.code, message: error.message } }, error.status);
  // Provider errors and request bodies can contain private information.
  console.error("[beta-admin] operation failed");
  return adminJson({ error: { code: "admin_unavailable", message: "Beta administration is temporarily unavailable. Refresh to check the current state." } }, 503);
}

export async function readAdminBody(request: Request): Promise<Record<string, unknown>> {
  if (!hasSameOrigin(request)) throw new ApiError(403, "origin_mismatch", "Submit this request from beta administration.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ApiError(415, "invalid_content_type", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_request", "A request body is required.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw new ApiError(413, "request_too_large", "This request is too large."); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, "invalid_request", "Invalid JSON request."); }
}
