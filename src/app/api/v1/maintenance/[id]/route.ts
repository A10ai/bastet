import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("maintenance_requests")
      .select(`
        *,
        apartment:apartments(id, number, floor, status, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role, email, phone)
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const allowedFields = [
      "priority",
      "category",
      "title",
      "description",
      "estimated_cost_gbp",
      "status",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key];
    }

    // Handle on_hold status transition
    if (updates.status === "on_hold") {
      const { data: current } = await supabase
        .from("maintenance_requests")
        .select("status")
        .eq("id", params.id)
        .single();
      if (!current || !["assigned", "in_progress"].includes(current.status)) {
        return NextResponse.json(
          { error: "Can only put on hold from assigned or in_progress" },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from("maintenance_requests")
      .update(updates)
      .eq("id", params.id)
      .select(`
        *,
        apartment:apartments(id, number, building:buildings(id, name, code)),
        assigned_staff:staff!maintenance_requests_assigned_to_fkey(id, first_name, last_name, role)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
