import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { getAuditLog, getAuditStats } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.error!;

  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") || "log";

    if (type === "stats") {
      const stats = await getAuditStats(supabase);
      return NextResponse.json({ data: stats });
    }

    const category = searchParams.get("category") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await getAuditLog(supabase, { category, limit, offset });
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
