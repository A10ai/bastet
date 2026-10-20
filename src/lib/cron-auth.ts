import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireRole, ROLES, type AuthContext } from "@/lib/api-auth";
import { timingSafeEqual } from "node:crypto";

/**
 * Authorise a scheduled job endpoint.
 *
 * Vercel Cron calls the route with `Authorization: Bearer <CRON_SECRET>`.
 * An owner or admin may also trigger the job by hand from a signed-in
 * session (useful for a manual night audit after a late departure).
 */
export async function requireCronOrAdmin(
  request: NextRequest
): Promise<{ ok: true; actor: string; auth?: AuthContext } | { ok: false; error: NextResponse }> {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (secret && header.startsWith("Bearer ")) {
    const presented = Buffer.from(header.slice(7));
    const expected = Buffer.from(secret);
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      return { ok: true, actor: "cron" };
    }
  }
  const auth = await requireRole(request, ROLES.ADMIN);
  if (auth.authenticated) return { ok: true, actor: auth.email || auth.userId || "admin", auth };
  return {
    ok: false,
    error: NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Cron secret or admin session required" } },
      { status: 401 }
    ),
  };
}
