import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
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
      if (key in body) updates[key] = body[key];
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
