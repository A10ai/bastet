import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import { logAudit } from "@/lib/audit";
import { encryptPii } from "@/lib/pii-crypto";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { validateBody, formatZodErrors, createGuestSchema } from "@/lib/validation";
import { ilikeAnyFilter } from "@/lib/postgrest-filter";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search");
    const tier = searchParams.get("tier");
    const vip = searchParams.get("vip");

    let query = supabase
      .from("guests")
      .select(`
        *,
        segment:guest_segments(id, name, code)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (tier) query = query.eq("loyalty_tier", tier);
    if (vip === "true") query = query.eq("vip_status", true);
    const searchFilter = ilikeAnyFilter(["first_name", "last_name", "email"], search);
    if (searchFilter) query = query.or(searchFilter);

    const pagination = parsePagination(searchParams);
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
    const { data, error, count } = await query;
    if (error) return rpcErrorResponse(error, "guests.list");
    // Identity documents never travel in list payloads.
    const rows = (data || []).map((g: Record<string, unknown>) => {
      const { passport_number: _pp, ...rest } = g;
      return rest;
    });
    return NextResponse.json({ data: rows, meta: paginationMeta(pagination, count, rows.length) });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.FRONT_DESK);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
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
        property_id: auth.propertyId,
        first_name,
        last_name,
        email: email || null,
        phone: phone || null,
        date_of_birth: date_of_birth || null,
        nationality: nationality || null,
        language,
        preferred_currency,
        passport_number: encryptPii(passport_number),
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

    if (error) return rpcErrorResponse(error, "guests.create");

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
      description: `Created guest ${guest.id}`,
      new_data: { guest_id: guest.id, vip_status, marketing_consent, language, preferred_currency },
    });

    return NextResponse.json({ data: guest }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
