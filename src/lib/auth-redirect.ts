import { safeNextPath } from "./site-url";

/** Email templates receive an absolute RedirectTo; only our own origin is trusted. */
export function authReturnPath(raw: string | null, origin: string): string {
  let next = raw;
  if (raw && /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    try {
      const url = new URL(raw);
      next = url.origin === origin ? url.pathname + url.search + url.hash : null;
    } catch { next = null; }
  }
  const path = safeNextPath(next);
  // Previously sent invitations can still open the studio without setting a password.
  return path.split(/[?#]/)[0] === "/reset-password" ? "/dashboard" : path;
}
