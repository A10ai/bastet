import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { convertExpenseToGbp } from "@/lib/finance-engine";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const category = searchParams.get("category");
    const isRAndD = searchParams.get("is_r_and_d");
    const isRecurring = searchParams.get("is_recurring");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    let query = supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false });

    if (category) query = query.eq("category", category);
    if (isRAndD !== null && isRAndD !== undefined && isRAndD !== "") {
      query = query.eq("is_r_and_d", isRAndD === "true");
    }
    if (isRecurring !== null && isRecurring !== undefined && isRecurring !== "") {
      query = query.eq("is_recurring", isRecurring === "true");
    }
    if (dateFrom) query = query.gte("expense_date", dateFrom);
    if (dateTo) query = query.lte("expense_date", dateTo);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const {
      category,
      description,
      amount_egp,
      vendor,
      invoice_reference,
      is_recurring = false,
      recurring_frequency,
      is_r_and_d = false,
      expense_date,
    } = body;

    if (!category || !description || !amount_egp || !expense_date) {
      return NextResponse.json(
        { error: "Missing required fields: category, description, amount_egp, expense_date" },
        { status: 400 }
      );
    }

    // Convert EGP to GBP
    let amountGbp: number | null = null;
    let fxRate: number | null = null;
    const converted = await convertExpenseToGbp(amount_egp, supabase);
    if (converted) {
      amountGbp = converted.amount_gbp;
      fxRate = converted.fx_rate;
    }

    // Get property_id
    const { data: prop } = await supabase
      .from("properties")
      .select("id")
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        property_id: prop?.id,
        category,
        description,
        amount_egp,
        amount_gbp: amountGbp,
        fx_rate: fxRate,
        vendor: vendor || null,
        invoice_reference: invoice_reference || null,
        is_recurring,
        recurring_frequency: is_recurring ? recurring_frequency || null : null,
        is_r_and_d,
        expense_date,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
