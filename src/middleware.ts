import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Check whether a Supabase auth session cookie exists on the request.
 * The cookie name follows the pattern `sb-<project-ref>-auth-token` (or
 * `sb.<project-ref>-auth-token` depending on the Supabase version).
 * Chunked tokens may have `.0` / `.1` suffixes.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => (c.name.startsWith("sb-") || c.name.startsWith("sb.")) && c.name.includes("auth-token"));
}

export async function middleware(request: NextRequest) {
  // Fast path: if no auth cookie exists, skip Supabase entirely.
  // This avoids network calls to Supabase in CI / during outages and
  // lets the redirect fire immediately.
  const hasCookie = hasSessionCookie(request);

  // Protect dashboard routes — redirect to login if no session cookie
  if (request.nextUrl.pathname.startsWith("/dashboard") && !hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If no cookie and on login page, just let it render
  if (!hasCookie) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  // Cookie exists — validate with Supabase
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
  } catch {
    session = null;
  }

  // Protect dashboard routes — cookie existed but session is invalid/expired
  if (request.nextUrl.pathname.startsWith("/dashboard") && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from login
  if (request.nextUrl.pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
