import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth, getUserRole } from "@/lib/api-auth";
import { mfaRequiredForRole } from "@/lib/mfa";
import { validateBody, formatZodErrors } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Multi-factor authentication (TOTP) through the application's own API so
 * the session cookies are always written server-side.
 *
 * GET  /api/v1/auth/mfa                      -> factors, assurance level and
 *                                               whether this role must enrol
 * POST /api/v1/auth/mfa {action:"enroll"}    -> { factor_id, qr_code, secret }
 * POST /api/v1/auth/mfa {action:"verify", factor_id, code}   -> session upgraded to aal2
 * POST /api/v1/auth/mfa {action:"unenroll", factor_id}       -> factor removed (needs aal2)
 *
 * These routes use requireAuth (session + CSRF) and deliberately not
 * requireRole, because an owner who has not yet enrolled must be able to
 * reach them.
 */
const mfaActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll"), friendly_name: z.string().max(60).optional() }).strict(),
  z.object({ action: z.literal("verify"), factor_id: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Code must be six digits") }).strict(),
  z.object({ action: z.literal("unenroll"), factor_id: z.string().uuid() }).strict(),
]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;
  try {
    const supabase = await createServerSupabaseClient();
    // The factor list must come from the auth server, not from the session
    // cookie: listFactors() and the nextLevel of getAuthenticatorAssuranceLevel()
    // read the user object cached in the cookie, which goes stale when a
    // factor is removed elsewhere (29 Oct 2026: a cookie still listing a
    // deleted factor reported verification_required and the dashboard looped
    // page -> /login?step=mfa -> /dashboard until the token refreshed).
    const [{ data: userData, error: uErr }, { data: aal, error: aErr }, role] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      getUserRole(request),
    ]);
    if (uErr || aErr || !userData?.user) {
      logger.error({ err: (uErr || aErr)?.message }, "[auth/mfa] status failed");
      return NextResponse.json({ error: "Could not read MFA status" }, { status: 502 });
    }
    const verified = (userData.user.factors || []).filter(
      (f) => f.status === "verified" && (f.factor_type === undefined || f.factor_type === "totp")
    );
    // currentLevel is the aal claim of the verified access token; nextLevel is
    // derived here from the server-reported factors for the same reason.
    const currentLevel = aal?.currentLevel ?? null;
    const nextLevel = verified.length > 0 ? "aal2" : "aal1";
    return NextResponse.json({
      data: {
        factors: verified.map((f) => ({ id: f.id, friendly_name: f.friendly_name, created_at: f.created_at })),
        current_level: currentLevel,
        next_level: nextLevel,
        enrolled: verified.length > 0,
        verification_required: nextLevel === "aal2" && currentLevel !== "aal2",
        // True for owners/admins (MFA_REQUIRED_ROLES) while MFA_ENFORCE is on:
        // the dashboard sends them to Settings > Security until they enrol.
        enrolment_required: mfaRequiredForRole(role ?? undefined),
      },
    });
  } catch (err) {
    logger.error({ err: String(err) }, "[auth/mfa] GET unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;
  try {
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(mfaActionSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const input = validation.data;

    if (input.action === "enroll") {
      // Remove stale unverified factors so re-tries do not pile up.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all || []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: input.friendly_name || "Authenticator app",
        issuer: "HospitAI",
      });
      if (error || !data) {
        logger.warn({ err: error?.message }, "[auth/mfa] enrol failed");
        return NextResponse.json({ error: { code: "MFA_ENROLL_FAILED", message: "Enrolment failed. Try again." } }, { status: 400 });
      }
      return NextResponse.json({ data: { factor_id: data.id, qr_code: data.totp.qr_code, secret: data.totp.secret } });
    }

    if (input.action === "verify") {
      // Six-digit codes: cap guesses per user independently of GoTrue's own throttle.
      const rl = await rateLimit(`mfa-verify:${auth.userId}`, RATE_LIMITS.MFA_VERIFY);
      if (!rl.allowed) {
        return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many codes tried. Wait 15 minutes and try again." } }, { status: 429 });
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.factor_id, code: input.code });
      if (error) {
        return NextResponse.json({ error: { code: "MFA_CODE_INVALID", message: "That code was not accepted" } }, { status: 401 });
      }
      await logAudit(supabase, {
        user_id: auth.userId,
        user_email: auth.email,
        action: "auth.mfa_verified",
        category: "auth",
        resource_type: "user",
        resource_id: auth.userId,
        description: "Second factor verified",
      });
      // challengeAndVerify refreshed the session; the server client already
      // wrote the new (aal2) cookies onto this response.
      return NextResponse.json({ data: { verified: true, current_level: "aal2" } });
    }

    // unenroll
    const { error } = await supabase.auth.mfa.unenroll({ factorId: input.factor_id });
    if (error) {
      logger.warn({ err: error.message }, "[auth/mfa] unenrol failed");
      const needsAal2 = /aal2|assurance/i.test(error.message);
      return NextResponse.json({ error: { code: needsAal2 ? "MFA_REQUIRED" : "MFA_UNENROLL_FAILED", message: needsAal2 ? "Verify your authenticator code before removing it" : "Could not remove the authenticator" } }, { status: needsAal2 ? 403 : 400 });
    }
    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: "auth.mfa_removed",
      category: "auth",
      resource_type: "user",
      resource_id: auth.userId,
      description: "Second factor removed",
    });
    return NextResponse.json({ data: { removed: true } });
  } catch (err) {
    logger.error({ err: String(err) }, "[auth/mfa] POST unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
