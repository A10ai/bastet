import "server-only";
import { NextResponse } from "next/server";

/**
 * Centralized API error handler.
 * Maps Supabase/Postgres errors to safe, structured responses.
 * Never leaks raw DB error messages to the client.
 */

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

// Common Postgres error codes → safe messages
const PG_ERROR_MAP: Record<string, { code: string; message: string; status: number }> = {
  "23505": { code: "DUPLICATE", message: "A record with this value already exists", status: 409 },
  "23503": { code: "FK_VIOLATION", message: "Referenced record does not exist", status: 400 },
  "23502": { code: "NOT_NULL", message: "Required field is missing", status: 400 },
  "23514": { code: "CHECK_VIOLATION", message: "Value violates a constraint", status: 400 },
  "PGRST205": { code: "NOT_FOUND", message: "Resource not found", status: 404 },
  "PGRST204": { code: "NO_ROWS", message: "No rows returned", status: 404 },
  "PGRST116": { code: "NOT_SINGLE", message: "Expected single row, got multiple", status: 400 },
  "42501": { code: "INSUFFICIENT_PRIVILEGE", message: "Permission denied", status: 403 },
  "42P01": { code: "TABLE_NOT_FOUND", message: "Resource not found", status: 404 },
  "42703": { code: "COLUMN_NOT_FOUND", message: "Invalid field in request", status: 400 },
  "22P02": { code: "INVALID_TEXT", message: "Invalid input format", status: 400 },
};

/**
 * Handle a Supabase/Postgres error and return a safe NextResponse.
 * Extracts the error code if available, maps to a safe message,
 * and logs the full error server-side.
 */
export function handleDbError(error: unknown, context?: string): NextResponse {
  const err = error as { code?: string; message?: string };
  const pgCode = err?.code;
  const mapped = pgCode ? PG_ERROR_MAP[pgCode] : undefined;

  // Log full error server-side (never to client)
  if (context) {
    console.error(`[DB Error: ${context}]`, error);
  } else {
    console.error("[DB Error]", error);
  }

  if (mapped) {
    return NextResponse.json(
      { error: { code: mapped.code, message: mapped.message } },
      { status: mapped.status }
    );
  }

  // Generic fallback — never expose raw error.message
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 }
  );
}

/**
 * Create a structured error response.
 */
export function apiError(code: string, message: string, status: number = 400): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  );
}

/**
 * Create a success response with consistent envelope.
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/**
 * Wrap an async route handler with automatic error handling.
 * Catches any thrown error and returns a safe 500 response.
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[Unhandled API Error]", error);
      return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
    }
  };
}