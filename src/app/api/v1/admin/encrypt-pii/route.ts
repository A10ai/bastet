import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { needsRekey, rekeyPii } from "@/lib/pii-crypto";
import { logAudit } from "@/lib/audit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/admin/encrypt-pii
 *
 * Backfill and key rotation: rewrites every passport number that is still
 * plaintext (pre-migration 00024) or encrypted under
 * PII_ENCRYPTION_KEY_PREVIOUS so it uses the current PII_ENCRYPTION_KEY.
 * Idempotent; safe to run repeatedly. Reports how many rows still cannot be
 * read with the current key so the operator knows when the previous key can
 * be retired (docs/runbooks/key-rotation.md).
 *
 * Owner only: the key is deployment-wide, so the job rewrites guests of
 * every property, which no property-scoped admin should be able to start.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ROLES.OWNER);
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
    let unreadable = 0;
    for (const row of rows || []) {
      if (!row.passport_number || !needsRekey(row.passport_number)) continue;
      const next = rekeyPii(row.passport_number);
      if (next === row.passport_number) { unreadable++; continue; }
      const { error: upErr } = await admin
        .from("guests")
        .update({ passport_number: next })
        .eq("id", row.id);
      if (!upErr) updated++;
    }

    await logAudit(await createServerSupabaseClient(), {
      user_id: auth.userId,
      user_email: auth.email,
      action: "admin.encrypt_pii",
      category: "settings",
      resource_type: "guests",
      description: `Re-encrypted ${updated} passport numbers under the current key`,
      metadata: { scanned: rows?.length ?? 0, updated, unreadable },
    });

    return NextResponse.json({ data: { scanned: rows?.length ?? 0, encrypted: updated, unreadable } });
  } catch (err) {
    logger.error({ err: String(err) }, "[admin/encrypt-pii] failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
