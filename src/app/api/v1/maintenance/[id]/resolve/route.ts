import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, resolveSchema } from "@/lib/validation";
import { handleDbError } from "@/lib/api-error";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.OPERATIONS);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(resolveSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { resolution_notes, actual_cost_gbp } = validation.data;

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
      return handleDbError(error, "maintenance.id.resolve");
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
