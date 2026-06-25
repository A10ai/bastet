import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { validateBody, formatZodErrors, currencyRateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    // Get latest rate for each currency pair
    const { data, error } = await supabase
      .from("currency_rates")
      .select("*")
      .eq("base_currency", "GBP")
      .order("fetched_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate to latest per target_currency
    const latest: Record<string, typeof data[0]> = {};
    for (const rate of data || []) {
      if (!latest[rate.target_currency]) {
        latest[rate.target_currency] = rate;
      }
    }

    return NextResponse.json({ data: Object.values(latest) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(currencyRateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { base_currency = "GBP", target_currency, rate } = validation.data;

    const { data, error } = await supabase
      .from("currency_rates")
      .insert({
        base_currency,
        target_currency,
        rate,
        source: "manual",
        fetched_at: new Date().toISOString(),
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
