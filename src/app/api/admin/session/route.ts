import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api-error";
import { verifyBetaPassword } from "@/lib/beta-password";
import { adminCookieOptions, adminError, adminJson, BETA_ADMIN_COOKIE, newAdminToken, readAdminBody, requireBetaAdmin, sessionHash } from "@/lib/beta-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await readAdminBody(request);
    if (typeof input.username !== "string" || input.username.length > 80 || typeof input.password !== "string" || input.password.length > 256) throw new ApiError(400, "invalid_request", "Enter your admin username and password.");
    const db = createAdminClient();
    const address = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
    const rateKey = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`beta-admin:${address}`).digest("hex");
    const { data: allowed, error: limitError } = await db.rpc("claim_beta_admin_login", { p_rate_key: rateKey });
    if (limitError) throw new Error();
    if (!allowed) throw new ApiError(429, "rate_limited", "Too many sign-in attempts. Try again in 15 minutes.");
    const { data: admin, error } = await db.from("studio_beta_admin").select("username,password_hash").eq("singleton", true).maybeSingle();
    if (error) throw new Error();
    const valid = await verifyBetaPassword(input.password, admin?.password_hash ?? null);
    if (!valid || input.username !== admin?.username) throw new ApiError(401, "invalid_credentials", "Incorrect username or password.");
    const token = newAdminToken();
    const { data: started, error: sessionError } = await db.rpc("start_beta_admin_session", { p_password_hash: admin.password_hash, p_token_hash: sessionHash(token) });
    if (sessionError) throw new Error();
    if (!started) throw new ApiError(401, "invalid_credentials", "Incorrect username or password.");
    (await cookies()).set(BETA_ADMIN_COOKIE, token, adminCookieOptions());
    return adminJson({ signedIn: true });
  } catch (error) { return adminError(error); }
}

export async function DELETE(request: Request) {
  try {
    await readAdminBody(request);
    const { db, tokenHash } = await requireBetaAdmin();
    const { error } = await db.from("studio_beta_admin_sessions").delete().eq("token_hash", tokenHash);
    if (error) throw new Error();
    (await cookies()).set(BETA_ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
    return adminJson({ signedOut: true });
  } catch (error) { return adminError(error); }
}
