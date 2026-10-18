import "server-only";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

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
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}
