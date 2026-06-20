import { NextResponse } from "next/server";
import { generateCsrfToken, setCsrfCookie } from "@/lib/csrf";

/**
 * GET /api/v1/csrf
 *
 * Issues a CSRF token and stores it in an httpOnly cookie (`hospitai-csrf`).
 * The token is also returned in the response body so that authenticated client
 * code can read it and echo it back in the `X-CSRF-Token` header on mutations.
 *
 * This is a GET endpoint, so it does NOT itself require CSRF validation.
 */
export async function GET() {
  const token = await generateCsrfToken();
  const response = NextResponse.json({
    data: { token },
  });
  setCsrfCookie(response, token);
  return response;
}