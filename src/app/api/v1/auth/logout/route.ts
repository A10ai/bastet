import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { requireAuth } from "@/lib/api-auth";
import { apiSuccess } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  try {
    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set(name, "", { ...options, maxAge: 0 });
          },
        },
      }
    );

    const { error } = await supabase.auth.signOut();

    // Even if signOut fails, clear the cookies
    const logoutResponse = apiSuccess({ loggedOut: true });

    // Transfer all Set-Cookie headers (clears session cookies)
    const setCookies = response.cookies.getAll();
    for (const cookie of setCookies) {
      logoutResponse.cookies.set(cookie.name, cookie.value, { ...cookie });
    }

    // Also explicitly clear known Supabase cookie patterns
    const allCookies = request.cookies.getAll();
    for (const cookie of allCookies) {
      if (
        cookie.name.includes("sb-") ||
        cookie.name.includes("auth-token") ||
        cookie.name.includes("supabase")
      ) {
        logoutResponse.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
      }
    }

    if (error) {
      // Still return success — cookies are cleared, session is effectively over
      return logoutResponse;
    }

    return logoutResponse;
  } catch {
    return NextResponse.json(
      { error: { code: "LOGOUT_FAILED", message: "Logout failed" } },
      { status: 500 }
    );
  }
}