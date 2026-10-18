import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, updateInvoiceSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "invoices",
  roles: ROLES.FRONT_DESK,
  select: `
        *,
        guest:guests(id, first_name, last_name, email, phone),
        booking:bookings(id, reference, check_in, check_out, apartment:apartments(id, number))
      `,
  label: "Invoice",
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, ROLES.MANAGEMENT);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(updateInvoiceSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    // Only allow editing draft invoices
    const { data: current } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", params.id)
      .single();

    if (!current) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (current.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft invoices can be edited" },
        { status: 400 }
      );
    }

    const allowedFields = [
      "line_items",
      "subtotal_gbp",
      "tax_amount_gbp",
      "total_gbp",
      "due_date",
      "notes",
      "guest_id",
      "status",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) updates[key] = (validated as Record<string, unknown>)[key];
    }

    // Allow cancellation from draft
    if (updates.status && updates.status !== "cancelled") {
      return NextResponse.json(
        { error: "Can only cancel from draft status via this endpoint" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", params.id)
      .select(`
        *,
        guest:guests(id, first_name, last_name, email),
        booking:bookings(id, reference)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "invoice.update",
      category: "finance",
      resource_type: "invoice",
      resource_id: data?.id || params.id,
      description: `Updated invoice ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
