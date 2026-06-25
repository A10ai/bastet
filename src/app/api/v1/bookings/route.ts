import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  calculateRate,
  calculateBookingTotal,
  calculateNights,
  getNextBookingReference,
  checkAvailability,
  convertCurrency,
} from "@/lib/booking-engine";
import { logAudit } from "@/lib/audit";
import { validateBody, formatZodErrors, createBookingSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();
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
      `)
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

    // Calculate rate
    const nights = calculateNights(check_in, check_out);
    if (nights <= 0) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }

    const rateInfo = await calculateRate(apartment.apartment_type_id, check_in, check_out, supabase);
    if (!rateInfo) {
      return NextResponse.json({ error: "No rate found for this apartment type" }, { status: 400 });
    }

    const pricing = calculateBookingTotal(rateInfo.nightly_rate_gbp, nights);

    // Convert to guest currency
    let totalGuestCurrency: number | null = null;
    if (guest_currency !== "GBP") {
      const converted = await convertCurrency(pricing.total, guest_currency, supabase);
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
      channel_id: channel_id || null,
      reference,
      status: "pending",
      check_in,
      check_out,
      nights,
      adults,
      children,
      infants,
      rate_per_night_gbp: Math.round(rateInfo.nightly_rate_gbp * 100) / 100,
      discount_percentage: pricing.discount_percentage,
      total_amount_gbp: pricing.total,
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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
