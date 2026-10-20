import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { parsePagination, paginationMeta } from "@/lib/pagination";
import {
  calculateNights,
  getNextBookingReference,
  checkAvailability,
  convertCurrency,
} from "@/lib/booking-engine";
import { logAudit } from "@/lib/audit";
import { quoteStay } from "@/lib/rate-plans";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { validateBody, formatZodErrors, createBookingSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ROLES.ALL_STAFF);
    if (!auth.authenticated) return auth.error!;
    const supabase = await createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const apartmentId = searchParams.get("apartment_id");
    const guestId = searchParams.get("guest_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const search = searchParams.get("search");
    const propertyId = searchParams.get("property_id");

    let query = supabase
      .from("bookings")
      .select(`
        *,
        guest:guests(id, first_name, last_name, email, loyalty_tier, vip_status),
        apartment:apartments(id, number, floor, view_type, building:buildings(id, name, code), apartment_type:apartment_types(id, name)),
        channel:booking_channels(id, name, code)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (propertyId) query = query.eq("property_id", propertyId);
    if (status) query = query.eq("status", status);
    if (apartmentId) query = query.eq("apartment_id", apartmentId);
    if (guestId) query = query.eq("guest_id", guestId);
    if (dateFrom) query = query.gte("check_in", dateFrom);
    if (dateTo) query = query.lte("check_out", dateTo);
    if (search) {
      query = query.ilike("reference", `%${search}%`);
    }

    const pagination = parsePagination(searchParams);
    query = query.range(pagination.offset, pagination.offset + pagination.limit - 1);
    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, meta: paginationMeta(pagination, count, (data || []).length) });
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

    const validation = validateBody(createBookingSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const validated = validation.data;

    const {
      property_id,
      apartment_id,
      guest_id,
      channel_id,
      rate_plan_id,
      check_in,
      check_out,
      adults = 1,
      children = 0,
      infants = 0,
      special_requests,
      internal_notes,
      guest_currency = "GBP",
    } = validated;

    // Check availability
    const availability = await checkAvailability(apartment_id, check_in, check_out, supabase);
    if (!availability.available) {
      return NextResponse.json(
        { error: `Apartment not available: ${availability.reason}` },
        { status: 409 }
      );
    }

    // Get apartment type and property_id for rate calculation
    const { data: apartment } = await supabase
      .from("apartments")
      .select("apartment_type_id, property_id")
      .eq("id", apartment_id)
      .single();

    if (!apartment) {
      return NextResponse.json({ error: "Apartment not found" }, { status: 404 });
    }

    const nights = calculateNights(check_in, check_out);
    if (nights <= 0) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }

    // Channel is NOT NULL in the schema: default to the direct channel
    let resolvedChannelId = channel_id || null;
    let channelCode: string | null = null;
    if (resolvedChannelId) {
      const { data: ch } = await supabase.from("booking_channels").select("code").eq("id", resolvedChannelId).maybeSingle();
      channelCode = ch?.code ?? null;
    } else {
      const { data: direct } = await supabase
        .from("booking_channels")
        .select("id, code")
        .eq("code", "direct")
        .maybeSingle();
      resolvedChannelId = direct?.id ?? null;
      channelCode = direct?.code ?? null;
      if (!resolvedChannelId) {
        return NextResponse.json({ error: "channel_id is required (no direct channel configured)" }, { status: 400 });
      }
    }

    // Price the stay night by night through the chosen (or default) rate plan
    const { quote, error: quoteError } = await quoteStay(supabase, {
      apartmentTypeId: apartment.apartment_type_id,
      checkIn: check_in,
      checkOut: check_out,
      ratePlanId: rate_plan_id,
      channelCode,
    });
    if (quoteError || !quote) return rpcErrorResponse(quoteError!, "quote_stay");

    // Convert to guest currency
    let totalGuestCurrency: number | null = null;
    if (guest_currency !== "GBP") {
      const converted = await convertCurrency(quote.total_gbp, guest_currency, supabase);
      if (converted) {
        totalGuestCurrency = converted.amount;
      }
    }

    // Generate reference
    const reference = await getNextBookingReference(supabase);

    const resolvedPropertyId = property_id || apartment.property_id;

    const bookingData = {
      property_id: resolvedPropertyId,
      apartment_id,
      guest_id: guest_id || null,
      channel_id: resolvedChannelId,
      reference,
      status: "pending",
      check_in,
      check_out,
      // `nights` is GENERATED ALWAYS in the schema; never insert it
      adults,
      children,
      infants,
      rate_per_night_gbp: quote.rate_per_night_gbp,
      discount_percentage: quote.discount_percentage,
      total_amount_gbp: quote.total_gbp,
      rate_plan_id: quote.rate_plan?.id ?? null,
      rate_plan_snapshot: quote.rate_plan,
      total_amount_guest_currency: totalGuestCurrency,
      guest_currency,
      special_requests: special_requests || null,
      internal_notes: internal_notes || null,
    };

    const { data, error } = await supabase
      .from("bookings")
      .insert(bookingData)
      .select(`
        *,
        guest:guests(id, first_name, last_name, email),
        apartment:apartments(id, number, building:buildings(id, name, code)),
        channel:booking_channels(id, name, code)
      `)
      .single();

    if (error) return rpcErrorResponse(error, "bookings.insert");

    await logAudit(supabase, {
      action: "booking.create",
      category: "booking",
      resource_type: "booking",
      resource_id: data?.id,
      description: `Created booking ${data?.reference} for apartment ${apartment_id}`,
      new_data: body,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
