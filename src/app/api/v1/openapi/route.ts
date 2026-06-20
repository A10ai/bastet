import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

/**
 * Serves the OpenAPI 3.0 specification as JSON.
 * Mount in Swagger UI or Redoc for interactive API documentation.
 *
 * Public endpoint (no auth) — the spec itself contains no sensitive data.
 */
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}