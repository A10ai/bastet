import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/api-error";
import { validateBody, formatZodErrors, passwordResetRequestSchema } from "@/lib/validation";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Request a password reset link.
 * Sends a Supabase password recovery email if the email exists in the staff table.
 * Always returns 200 (don't leak whether email exists or not).
 */
export async function POST(request: NextRequest) {
  // Rate limit: 3 requests per hour per IP
  const ip = getClientIp(request);
  const rl = rateLimit(`pwreset:${ip}`, RATE_LIMITS.PASSWORD_RESET);
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Too many reset requests. Try again later.", 429);
  }

  try {
    const body = await request.json();
    const validation = validateBody(passwordResetRequestSchema, body);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const { email } = validation.data;

    // Check if email belongs to an active staff member (don't leak to client)
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("id, is_active")
      .eq("email", email)
      .single();

    // Only send reset email if staff exists and is active
    if (staff?.is_active) {
      // Use Supabase auth to send password reset email
      const { createServerClient } = await import("@supabase/ssr");
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get() { return undefined; },
            set() {},
            remove() {},
          },
        }
      );

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password`,
      });
    }

    // Always return success — don't reveal whether the email exists
    return apiSuccess({ sent: true });
  } catch {
    // Always return success on error too — don't leak info
    return apiSuccess({ sent: true });
  }
}