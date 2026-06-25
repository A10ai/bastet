import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createGuestSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search");
    const tier = searchParams.get("tier");
    const vip = searchParams.get("vip");

    let query = supabase
      .from("guests")
      .select(`
        *,
        segment:guest_segments(id, name, code)
      `)
      .order("created_at", { ascending: false });

    if (tier) query = query.eq("loyalty_tier", tier);
    if (vip === "true") query = query.eq("vip_status", true);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

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
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const validation = validateBody(createGuestSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const {
      first_name,
      last_name,
      email,
      phone,
      date_of_birth,
      nationality,
      language = "en",
      preferred_currency = "GBP",
      passport_number,
      address_line1,
      address_line2,
      city,
      country,
      postcode,
      vip_status = false,
      notes,
      marketing_consent = false,
    } = validated;

    // Create guest
    const { data: guest, error } = await supabase
      .from("guests")
      .insert({
        first_name,
        last_name,
        email: email || null,
        phone: phone || null,
        date_of_birth: date_of_birth || null,
        nationality: nationality || null,
        language,
        preferred_currency,
        passport_number: passport_number || null,
        address_line1: address_line1 || null,
        address_line2: address_line2 || null,
        city: city || null,
        country: country || null,
        postcode: postcode || null,
        vip_status,
        notes: notes || null,
        marketing_consent,
        loyalty_tier: "bronze",
        loyalty_points: 0,
        total_stays: 0,
        total_nights: 0,
        total_spend_gbp: 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Auto-create preferences row
    await supabase.from("guest_preferences").insert({
      guest_id: guest.id,
      contact_language: language,
    });

    await logAudit(supabase, {
      action: "guest.create",
      category: "guest",
      resource_type: "guest",
      resource_id: guest.id,
      description: `Created guest ${first_name} ${last_name}`,
      new_data: body,
    });

    return NextResponse.json({ data: guest }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
