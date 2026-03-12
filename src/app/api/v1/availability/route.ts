import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addDays, format } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = request.nextUrl;
    const propertyId = searchParams.get("property_id");
    const startDate = searchParams.get("start_date") || format(new Date(), "yyyy-MM-dd");
    const days = parseInt(searchParams.get("days") || "14", 10);
    const endDate = format(addDays(new Date(startDate), days), "yyyy-MM-dd");

    // Get all apartments
    let aptQuery = supabase
      .from("apartments")
      .select("id, number, floor, view_type, status, building:buildings(id, name, code), apartment_type:apartment_types(id, name)")
      .order("number");

    if (propertyId) aptQuery = aptQuery.eq("property_id", propertyId);

    const { data: apartments, error: aptError } = await aptQuery;
    if (aptError) {
      return NextResponse.json({ error: aptError.message }, { status: 500 });
    }

    // Get all bookings overlapping the date range
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, apartment_id, reference, check_in, check_out, status, guest_id, guests(id, first_name, last_name)")
      .not("status", "in", "(cancelled,no_show)")
      .lt("check_in", endDate)
      .gt("check_out", startDate) as { data: Array<{
        id: string; apartment_id: string; reference: string; check_in: string;
        check_out: string; status: string; guest_id: string | null;
        guests: { id: string; first_name: string; last_name: string } | null;
      }> | null };

    // Get blocked dates from availability table
    const { data: blocked } = await supabase
      .from("availability")
      .select("apartment_id, date, block_reason")
      .eq("is_available", false)
      .gte("date", startDate)
      .lt("date", endDate);

    // Build the calendar grid
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      dates.push(format(addDays(new Date(startDate), i), "yyyy-MM-dd"));
    }

    const grid = (apartments || []).map((apt) => {
      const aptBookings = (bookings || []).filter((b) => b.apartment_id === apt.id);
      const aptBlocked = (blocked || []).filter((b) => b.apartment_id === apt.id);

      const cells = dates.map((date) => {
        // Check if blocked
        const block = aptBlocked.find((b) => b.date === date);
        if (block) {
          return { date, status: "blocked" as const, reason: block.block_reason };
        }

        // Check if booked
        const booking = aptBookings.find(
          (b) => date >= b.check_in && date < b.check_out
        );
        if (booking) {
          return {
            date,
            status: booking.status as string,
            booking_id: booking.id,
            reference: booking.reference,
            guest_name: booking.guests
              ? `${booking.guests.first_name} ${booking.guests.last_name}`
              : null,
          };
        }

        return { date, status: "available" as const };
      });

      return { apartment: apt, cells };
    });

    return NextResponse.json({ data: { dates, grid } });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
