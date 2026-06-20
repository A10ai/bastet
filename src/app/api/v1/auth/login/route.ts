import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api-error";
import { validateBody, formatZodErrors, loginSchema } from "@/lib/validation";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit login attempts: 5 per 15 minutes per IP
  const ip = getClientIp(request);
  const rl = rateLimit(`login:${ip}`, RATE_LIMITS.LOGIN);
  if (!rl.allowed) {
    return apiError(
      "RATE_LIMITED",
      "Too many login attempts. Please try again in a few minutes.",
      429
    );
  }

  try {
    const body = await request.json();
    const validation = validateBody(loginSchema, body);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const { email, password } = validation.data;

    // 1. Verify the email belongs to an active staff member (quick check)
    const adminSupabase = createAdminClient();
    const { data: staffMember, error: staffError } = await adminSupabase
      .from("staff")
      .select("id, first_name, last_name, role, property_id, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (staffError || !staffMember) {
      return apiError("INVALID_CREDENTIALS", "Invalid credentials or inactive account", 401);
    }

    // 2. Verify the password via Supabase Auth
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

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.session) {
      return apiError("INVALID_CREDENTIALS", "Invalid credentials", 401);
    }

    // 3. Return staff data + set session cookies on the response
    const authResponse = NextResponse.json({
      data: {
        staff: {
          id: staffMember.id,
          first_name: staffMember.first_name,
          last_name: staffMember.last_name,
          role: staffMember.role,
          property_id: staffMember.property_id,
        },
      },
    });

    // Transfer all Set-Cookie headers from the intermediate response
    const setCookies = response.cookies.getAll();
    for (const cookie of setCookies) {
      authResponse.cookies.set(cookie.name, cookie.value, {
        ...cookie,
      });
    }

    return authResponse;
  } catch {
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}