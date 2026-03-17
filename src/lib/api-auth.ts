import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verify that the request has a valid Supabase auth session.
 * Usage:
 *   const auth = await requireAuth(request);
 *   if (!auth.authenticated) return auth.error;
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ authenticated: boolean; error?: NextResponse }> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(_name: string, _value: string, _options: CookieOptions) {
            // We only need to read cookies for auth check
          },
          remove(_name: string, _options: CookieOptions) {
            // We only need to read cookies for auth check
          },
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
