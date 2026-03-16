import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { format, addDays } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;

    const from = searchParams.get("from") || format(new Date(), "yyyy-MM-dd");
    const to =
      searchParams.get("to") || format(addDays(new Date(from), 14), "yyyy-MM-dd");
    const buildingId = searchParams.get("building_id");
    const typeId = searchParams.get("type_id");

    // Query apartments with building and type info
    let aptQuery = supabase
      .from("apartments")
      .select(
        "id, number, floor, status, building_id, apartment_type_id, building:buildings(id, code, name), apartment_type:apartment_types(id, name, slug)"
      )
      .order("number");

    if (buildingId) aptQuery = aptQuery.eq("building_id", buildingId);
    if (typeId) aptQuery = aptQuery.eq("apartment_type_id", typeId);

    const { data: apartments, error: aptError } = await aptQuery;
    if (aptError) {
      return NextResponse.json({ error: aptError.message }, { status: 500 });
    }

    // Query bookings that overlap the date range
    // overlap: booking.check_in < to AND booking.check_out > from
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, apartment_id, reference, check_in, check_out, status, guest:guests(id, first_name, last_name)"
      )
      .not("status", "in", "(cancelled,no_show)")
      .lt("check_in", to)
      .gt("check_out", from);

    if (bookingsError) {
      return NextResponse.json(
        { error: bookingsError.message },
        { status: 500 }
      );
    }

    // Build apartment-level booking map
    const bookingsByApartment: Record<string, typeof bookings> = {};
    for (const b of bookings || []) {
      if (!bookingsByApartment[b.apartment_id]) {
        bookingsByApartment[b.apartment_id] = [];
      }
      bookingsByApartment[b.apartment_id].push(b);
    }

    // Get distinct buildings and types for filters
    const { data: buildings } = await supabase
      .from("buildings")
      .select("id, code, name")
      .order("code");

    const { data: apartmentTypes } = await supabase
      .from("apartment_types")
      .select("id, name, slug")
      .order("name");

    // Sort apartments by building code then number
    const sortedApartments = (apartments || []).sort((a, b) => {
      const buildingA = (a.building as any)?.code || "";
      const buildingB = (b.building as any)?.code || "";
      if (buildingA !== buildingB) return buildingA.localeCompare(buildingB);
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });

    // Build response
    const result = sortedApartments.map((apt) => {
      const buildingRaw = apt.building as unknown;
      const building = Array.isArray(buildingRaw) ? buildingRaw[0] as { id: string; code: string; name: string } | undefined : buildingRaw as { id: string; code: string; name: string } | null;
      const typeRaw = apt.apartment_type as unknown;
      const aptType = Array.isArray(typeRaw) ? typeRaw[0] as { id: string; name: string; slug: string } | undefined : typeRaw as { id: string; name: string; slug: string } | null;
      const aptBookings = bookingsByApartment[apt.id] || [];

      return {
        id: apt.id,
        number: apt.number,
        floor: apt.floor,
        building_code: building?.code || "",
        type_name: aptType?.name || "",
        type_slug: aptType?.slug || "",
        status: apt.status,
        bookings: aptBookings.map((bk) => {
          const guestRaw = bk.guest as unknown;
          const guest = Array.isArray(guestRaw) ? guestRaw[0] as { id: string; first_name: string; last_name: string } | undefined : guestRaw as { id: string; first_name: string; last_name: string } | null;
          return {
            id: bk.id,
            reference: bk.reference,
            guest_name: guest
              ? `${guest.first_name} ${guest.last_name}`
              : "Unknown Guest",
            check_in: bk.check_in,
            check_out: bk.check_out,
            status: bk.status,
          };
        }),
      };
    });

    return NextResponse.json({
      apartments: result,
      buildings: buildings || [],
      apartment_types: apartmentTypes || [],
      date_range: { from, to },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
