import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  // The public creative site does not need an auth round trip. This also lets
  // the site render before the pilot's private services have been configured.
  if (pathname === "/" || pathname === "/privacy" || pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/api/invite-requests") return response;
  // This one endpoint authenticates a revocable assignment capability in its
  // handler. Employee workstations never receive a creator's session cookie.
  if (pathname === "/api/studio/mcp") return response;
  const isPublic = pathname === "/login" || pathname.startsWith("/auth/") || pathname === "/reset-password" || pathname.startsWith("/invite/");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isPublic) return response;
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "not_configured", message: "The studio is not connected yet." } }, { status: 503 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}
