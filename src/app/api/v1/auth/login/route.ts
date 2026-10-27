import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api-error";
import { validateBody, formatZodErrors, loginSchema } from "@/lib/validation";
import { rateLimit, getClientIp, RATE_LIMITS, failuresBelowLimit, recordFailure, clearFailures } from "@/lib/rate-limit";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";

/** One message for every failure, so the endpoint does not reveal which emails are staff. */
const INVALID = () => apiError("INVALID_CREDENTIALS", "Invalid email or password", 401);

/**
 * Login CSRF guard. Signing in sets session cookies, so a cross-site form
 * must not be able to sign a victim into an attacker's account. Requiring a
 * JSON body makes the request non-simple (a cross-origin page cannot send it
 * without a CORS preflight, which only our origin passes); an Origin header,
 * when the browser sends one, must be ours.
 */
function sameOriginJson(request: NextRequest): boolean {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // ignore a malformed APP_URL
    }
  }
  return allowed.has(origin);
}

export async function POST(request: NextRequest) {
  if (!sameOriginJson(request)) {
    return apiError("BAD_REQUEST", "Send a JSON body from the application's own origin", 400);
  }

  // Rate limits: a whole property's staff share one NAT address, so the
  // brute-force limit counts FAILED attempts per account and network (5 per
  // 15 min) plus a wider per-account ceiling across networks (50), and a
  // generous per-IP ceiling (60 per 15 min) against credential stuffing.
  // Only failures count, so someone else's wrong passwords from another
  // network cannot lock the real user out.
  const ip = getClientIp(request);
  if (ip !== "unknown") {
    const ipLimit = await rateLimit(`login-ip:${ip}`, RATE_LIMITS.LOGIN_PER_IP);
    if (!ipLimit.allowed) {
      return apiError("RATE_LIMITED", "Too many login attempts from this network. Please try again later.", 429);
    }
  }

  try {
    const body = await request.json();
    const validation = validateBody(loginSchema, body);
    if (!validation.success) {
      return apiError("VALIDATION_ERROR", formatZodErrors(validation.error), 400);
    }

    const { email, password } = validation.data;
    const account = email.toLowerCase();
    const localKey = `login:${account}:${ip}`;
    const globalKey = `login:${account}`;

    const [localOk, globalOk] = await Promise.all([
      failuresBelowLimit(localKey, RATE_LIMITS.LOGIN),
      failuresBelowLimit(globalKey, RATE_LIMITS.LOGIN_ACCOUNT_GLOBAL),
    ]);
    if (!localOk || !globalOk) {
      return apiError("RATE_LIMITED", "Too many login attempts for this account. Please try again in a few minutes.", 429);
    }
    const fail = async () => {
      await Promise.all([
        recordFailure(localKey, RATE_LIMITS.LOGIN),
        recordFailure(globalKey, RATE_LIMITS.LOGIN_ACCOUNT_GLOBAL),
      ]);
      return INVALID();
    };

    // 1. Verify the email belongs to an active staff member (quick check)
    const adminSupabase = createAdminClient();
    const { data: staffMember, error: staffError } = await adminSupabase
      .from("staff")
      .select("id, first_name, last_name, role, property_id, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .single();

    if (staffError || !staffMember) {
      return fail();
    }

    // 2. Verify the password via Supabase Auth
    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: sessionCookieOptions(),
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
      return fail();
    }
    await clearFailures(localKey, RATE_LIMITS.LOGIN);

    // 3. Return staff data + set session cookies on the response.
    //    Rotate the CSRF token so a pre-login token cannot be reused.
    const csrfToken = await generateCsrfToken();
    const authResponse = NextResponse.json({
      data: {
        csrf_token: csrfToken,
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
    setCsrfCookie(authResponse, csrfToken);

    return authResponse;
  } catch {
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}