import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { requireAuth } from "@/lib/api-auth";
import { apiError, apiSuccess } from "@/lib/api-error";
import { validateBody, formatZodErrors, passwordChangeSchema } from "@/lib/validation";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  // Rate limit password changes
  const ip = getClientIp(request);
  const rl = rateLimit(`pwchange:${ip}`, RATE_LIMITS.API_DEFAULT);
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Too many requests", 429);
  }

  try {
    const body = await request.json();
    const validation = validateBody(passwordChangeSchema, body);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const { currentPassword, newPassword } = validation.data;

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

    // Verify current password by re-authenticating
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.email) {
      return apiError("NO_SESSION", "No active session", 401);
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: sessionData.session.user.email,
      password: currentPassword,
    });

    if (signInError) {
      return apiError("INVALID_PASSWORD", "Current password is incorrect", 401);
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return apiError("UPDATE_FAILED", updateError.message, 400);
    }

    // Transfer any updated cookies
    const resultResponse = apiSuccess({ changed: true });
    const setCookies = response.cookies.getAll();
    for (const cookie of setCookies) {
      resultResponse.cookies.set(cookie.name, cookie.value, { ...cookie });
    }

    return resultResponse;
  } catch {
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}