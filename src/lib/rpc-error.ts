import "server-only";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";

/**
 * Map a Postgres function error raised with our `CODE: detail` convention
 * (see migrations 00020+) to a safe HTTP response. Anything that is not one
 * of our own codes is logged and returned as a generic 500 so database
 * internals never reach the client.
 */
const STATUS_BY_CODE: Record<string, number> = {
  BOOKING_NOT_FOUND: 404,
  INVOICE_NOT_FOUND: 404,
  INVALID_STATUS: 409,
  NO_GUEST: 400,
  TOO_EARLY: 400,
  ROOM_NOT_READY: 409,
  OUTSTANDING_BALANCE: 402,
  INVALID_AMOUNT: 400,
  MISSING_ORIGINAL_AMOUNT: 400,
  OVERPAYMENT: 400,
  FOLIO_NOT_FOUND: 404,
  LINE_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  FOLIO_CLOSED: 409,
  ALREADY_VOIDED: 409,
  INVALID_VOID: 400,
  INVALID_CHARGE_TYPE: 400,
  REASON_REQUIRED: 400,
  OVER_REFUND: 400,
  LEDGER_IMMUTABLE: 409,
  INVOICE_IMMUTABLE: 409,
  PROPERTY_FORBIDDEN: 403,
  // rate plans (00027)
  TYPE_NOT_FOUND: 404,
  RATE_PLAN_NOT_FOUND: 404,
  RATE_PLAN_INACTIVE: 409,
  RATE_PLAN_NOT_VALID: 409,
  RATE_PLAN_CHANNEL: 409,
  MIN_NIGHTS: 400,
  MAX_NIGHTS: 400,
  NO_RATE: 400,
  INVALID_DATES: 400,
  // group bookings (00028)
  GROUP_NOT_FOUND: 404,
  GROUP_CLOSED: 409,
  APARTMENT_NOT_FOUND: 404,
  ROOM_UNAVAILABLE: 409,
  DUPLICATE_ROOM: 409,
  DOUBLE_BOOKING: 409,
  INVALID_INPUT: 400,
};

export function rpcErrorResponse(
  error: { message?: string; code?: string } | null,
  context: string
): NextResponse {
  const message = error?.message ?? "";
  const match = message.match(/^([A-Z_]+)(?::\s*(.*))?$/);
  if (match && STATUS_BY_CODE[match[1]]) {
    return NextResponse.json(
      { error: { code: match[1], message: match[2] || match[1].toLowerCase().replace(/_/g, " ") } },
      { status: STATUS_BY_CODE[match[1]] }
    );
  }
  // Exclusion constraint from 00020: two active bookings overlap
  if (error?.code === "23P01" || /bookings_no_overlap/.test(message)) {
    return NextResponse.json(
      { error: { code: "DOUBLE_BOOKING", message: "Another active booking already occupies this apartment for those dates" } },
      { status: 409 }
    );
  }
  logger.error({ context, err: message, code: error?.code }, "[RPC] Unexpected database error");
  captureException(new Error(`[RPC ${context}] ${message}`), { tags: { layer: "rpc", context } });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}
