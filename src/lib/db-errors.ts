/**
 * Postgres unique_violation (23505). Some inserts are deliberately guarded by
 * a unique index so concurrent runs can't duplicate work (00034:
 * uq_housekeeping_open_checkout_clean, uq_pricing_decisions_type_day); for
 * those a 23505 means "already done", not a failure.
 */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
