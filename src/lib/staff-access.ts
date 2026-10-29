import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Deactivating a staff member must end their access now, not when their
 * access token happens to expire: ban the auth user (refresh stops working)
 * and revoke every session (locally verified tokens are still accepted until
 * `exp`, at most one hour; the ban closes the door after that).
 */
export async function revokeStaffAccess(admin: SupabaseClient, authUserId: string): Promise<void> {
  try {
    await admin.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
  } catch (err) {
    logger.error({ err: String(err) }, "[staff-access] ban failed");
  }
  try {
    await admin.auth.admin.signOut(authUserId, "global");
  } catch (err) {
    logger.warn({ err: String(err) }, "[staff-access] global sign-out failed (older GoTrue?)");
  }
}

/** Mirror of the ban for re-activation. */
export async function restoreStaffAccess(admin: SupabaseClient, authUserId: string): Promise<void> {
  try {
    await admin.auth.admin.updateUserById(authUserId, { ban_duration: "none" });
  } catch (err) {
    logger.error({ err: String(err) }, "[staff-access] unban failed");
  }
}
