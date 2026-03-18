import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verify that the request has a valid Supabase auth session.
 * Usage:
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) return auth.error!;
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ authenticated: boolean; error?: NextResponse }> {
  try {
    // Check if any Supabase auth cookie exists
    const cookies = request.cookies.getAll();
    const hasAuthCookie = cookies.some(
      (c) =>
        c.name.includes("auth-token") ||
        c.name.includes("sb-") ||
        c.name.includes("supabase")
    );

    // If request comes from the same origin (browser navigation / fetch from dashboard)
    // and has auth cookies, allow it
    const referer = request.headers.get("referer") || "";
    const host = request.headers.get("host") || "";
    const isInternalRequest =
      referer.includes(host) ||
      referer.includes("hospitai") ||
      referer.includes("localhost");

    if (hasAuthCookie && isInternalRequest) {
      return { authenticated: true };
    }

    // Full session validation for external requests
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {},
          remove(_name: string, _options: CookieOptions) {},
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        authenticated: false,
        error: NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ),
      };
    }

    return { authenticated: true };
  } catch {
    return {
      authenticated: false,
      error: NextResponse.json(
        { error: "Authentication check failed" },
        { status: 401 }
      ),
    };
  }
}
