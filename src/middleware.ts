import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware responsibilities
 *  1. Content-Security-Policy with a per-request nonce (no 'unsafe-inline'
 *     or 'unsafe-eval' for scripts in production). Next.js reads the nonce
 *     from the CSP request header and stamps it on its own script tags.
 *  2. Dashboard protection: redirect to /login without a verified session.
 *     Identity is verified with auth.getUser(); getSession() only decodes the
 *     cookie and can be forged.
 */

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => (c.name.startsWith("sb-") || c.name.startsWith("sb.")) && c.name.includes("auth-token"));
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
    } catch {
      return "";
    }
  })();
  const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
  const connect = ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.anthropic.com", supabaseOrigin, supabaseWs]
    .filter(Boolean)
    .join(" ");
  const directives = [
    "default-src 'self'",
    // strict-dynamic lets nonce'd Next.js scripts load their chunks; dev needs eval for HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  // Only when the deployment itself is https; otherwise the browser would
  // upgrade every local http call (Supabase on 127.0.0.1) and break them.
  if ((process.env.NEXT_PUBLIC_APP_URL || "").startsWith("https://")) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const next = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const redirect = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const path = request.nextUrl.pathname;
  const protectedPath = path === "/dashboard" || path.startsWith("/dashboard/");
  const isLogin = path === "/login";

  if (!protectedPath && !isLogin) return next();

  const hasCookie = hasSessionCookie(request);

  // Fast path: no auth cookie at all.
  if (protectedPath && !hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return redirect(loginUrl);
  }
  if (!hasCookie) return next();

  // Cookie exists: verify it with the Auth server.
  let response = next();
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
          response = next();
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = next();
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  let userId: string | null = null;
  let needsMfa = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    userId = !error && data.user ? data.user.id : null;
    if (error && error.status !== 401 && error.status !== 403) {
      // A reachability problem, not an invalid session: say so in the logs,
      // otherwise an auth-server outage looks like everyone being signed out.
      console.error("[middleware] auth server error", error.status, error.message);
    }
    if (userId) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      needsMfa = aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2";
    }
  } catch (err) {
    console.error("[middleware] session check threw", err instanceof Error ? err.message : String(err));
    userId = null;
  }

  if (protectedPath && !userId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return redirect(loginUrl);
  }
  if (protectedPath && needsMfa) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    loginUrl.searchParams.set("step", "mfa");
    return redirect(loginUrl);
  }
  if (isLogin && userId && !needsMfa) {
    return redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  // Every page (for CSP); API routes set their own headers and carry no HTML.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|woff2?|txt|xml)$).*)"],
};
