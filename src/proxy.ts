import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Host BFFs verify sessions and Host permission themselves and return JSON 401/403 errors.
  // A proxy redirect would return login HTML to their fetch callers after session expiry.
  if (request.nextUrl.pathname.startsWith("/api/host/")) return NextResponse.next();
  // Usage verifies workspace admin access itself; expired sessions need JSON 401s.
  if (/^\/api\/workspaces\/[^/]+\/usage\/?$/.test(request.nextUrl.pathname)) return NextResponse.next();
  // These routes authenticate Stripe signatures / the operator secret themselves.
  if (["/api/billing/webhook", "/api/billing/sync"].includes(request.nextUrl.pathname)) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
