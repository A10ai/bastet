import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { getByIdHandler } from "@/lib/crud";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createExpenseSchema } from "@/lib/validation";

export const GET = getByIdHandler({
  table: "expenses",
  roles: ROLES.MANAGEMENT,
  label: "Expense",
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await requireRole(request, ROLES.MANAGEMENT);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createExpenseSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const allowedFields = [
      "category",
      "description",
      "amount_egp",
      "amount_gbp",
      "vendor",
      "invoice_reference",
      "is_recurring",
      "recurring_frequency",
      "is_r_and_d",
      "approved_by",
      "expense_date",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in validated) updates[key] = (validated as Record<string, unknown>)[key];
    }

    const { data, error } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAudit(supabase, {
      action: "expense.update",
      category: "finance",
      resource_type: "expense",
      resource_id: data?.id || params.id,
      description: `Updated expense ${params.id}`,
      new_data: body,
    });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
