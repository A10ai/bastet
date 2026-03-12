import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
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
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { base_currency = "GBP", target_currency, rate } = body;

    if (!target_currency || !rate) {
      return NextResponse.json(
        { error: "Missing required fields: target_currency, rate" },
        { status: 400 }
      );
    }

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
