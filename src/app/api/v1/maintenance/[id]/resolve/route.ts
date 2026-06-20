import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { resolution_notes, actual_cost_gbp } = body;

    const { data: req } = await supabase
      .from("maintenance_requests")
      .select("id, status, apartment_id")
      .eq("id", params.id)
      .single();

    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!["assigned", "in_progress", "on_hold"].includes(req.status)) {
      return NextResponse.json(
        { error: `Cannot resolve request with status: ${req.status}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("maintenance_requests")
      .update({
        status: "completed",
        resolution_notes: resolution_notes || null,
        actual_cost_gbp: actual_cost_gbp ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Set apartment back to available
    if (req.apartment_id) {
      await supabase
        .from("apartments")
        .update({ status: "available" })
        .eq("id", req.apartment_id);
    }

    await logAudit(supabase, {
      action: "maintenance.resolve",
      category: "maintenance",
      resource_type: "maintenance_request",
      resource_id: data?.id || params.id,
      description: `Resolved maintenance request ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
