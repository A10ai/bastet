import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPii, isEncrypted } from "@/lib/pii-crypto";
import { logAudit } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/admin/encrypt-pii
 *
 * One-off backfill: encrypts every plaintext passport number still stored
 * from before migration 00024. Idempotent; safe to run repeatedly. Requires
 * PII_ENCRYPTION_KEY to be configured, otherwise refuses.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.ADMIN);
  if (!auth.authenticated) return auth.error!;

  if (!process.env.PII_ENCRYPTION_KEY) {
    return NextResponse.json(
      { error: { code: "NO_KEY", message: "PII_ENCRYPTION_KEY is not configured on this server" } },
      { status: 409 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("guests")
      .select("id, passport_number")
      .not("passport_number", "is", null);
    if (error) throw error;

    let updated = 0;
    for (const row of rows || []) {
      if (!row.passport_number || isEncrypted(row.passport_number)) continue;
      const { error: upErr } = await admin
        .from("guests")
        .update({ passport_number: encryptPii(row.passport_number) })
        .eq("id", row.id);
      if (!upErr) updated++;
    }

    await logAudit(await createServerSupabaseClient(), {
      user_id: auth.userId,
      user_email: auth.email,
      action: "admin.encrypt_pii",
      category: "settings",
      resource_type: "guests",
      description: `Encrypted ${updated} plaintext passport numbers`,
      metadata: { scanned: rows?.length ?? 0, updated },
    });

    return NextResponse.json({ data: { scanned: rows?.length ?? 0, encrypted: updated } });
  } catch (err) {
    logger.error({ err: String(err) }, "[admin/encrypt-pii] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
