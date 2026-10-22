/** Next can normalize request.url to localhost behind its dev proxy. The Host
 * header retains the actual destination and is not a client-chosen CORS header.
 * Never use x-forwarded-host here: visitors can supply it on a direct server. */
export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const parsed = new URL(origin);
    const destination = new URL(request.url);
    const host = request.headers.get("host") || destination.host;
    if (parsed.origin !== origin || parsed.host !== host) return false;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    // Vercel terminates TLS ahead of the application; public deployments must
    // still receive a secure browser origin. Local previews may use HTTP.
    if (process.env.VERCEL && parsed.protocol !== "https:") return false;
    return true;
  } catch { return false; }
}
