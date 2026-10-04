import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // These routes authenticate Stripe signatures / the operator secret themselves.
  if (["/api/billing/webhook", "/api/billing/sync"].includes(request.nextUrl.pathname)) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
