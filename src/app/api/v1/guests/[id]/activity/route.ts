import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { formatZodErrors, guestActivityQuerySchema } from "@/lib/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    // Validate query params
    const { searchParams } = request.nextUrl;
    const queryParams: Record<string, string | undefined> = {};
    const limit = searchParams.get("limit") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    if (limit !== undefined) queryParams.limit = limit;
    if (type !== undefined) queryParams.type = type;

    const queryValidation = guestActivityQuerySchema.safeParse(queryParams);
    if (!queryValidation.success) {
      return NextResponse.json({ error: formatZodErrors(queryValidation.error) }, { status: 400 });
    }

    let query = supabase
      .from("guest_activity_log")
      .select("*")
      .eq("guest_id", params.id)
      .order("created_at", { ascending: false });

    if (type) query = query.eq("activity_type", type);
    const effectiveLimit = queryValidation.data.limit ?? 50;
    query = query.limit(effectiveLimit);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
