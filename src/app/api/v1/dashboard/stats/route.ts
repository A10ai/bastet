import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { format, subDays } from "date-fns";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const today = format(new Date(), "yyyy-MM-dd");
    const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    // Get total apartments and occupied count
    const { data: allApartments } = await supabase
      .from("apartments")
      .select("id, status");

    const totalApartments = allApartments?.length || 0;
    const occupiedCount = allApartments?.filter((a) => a.status === "occupied").length || 0;
    const occupancy = totalApartments > 0 ? Math.round((occupiedCount / totalApartments) * 100) : 0;

    // Get occupancy a week ago for trend (count bookings that were checked_in on that date)
    const { count: occupiedWeekAgo } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["checked_in", "checked_out"])
      .lte("check_in", weekAgo)
      .gt("check_out", weekAgo);

    const occupancyWeekAgo = totalApartments > 0
      ? Math.round(((occupiedWeekAgo || 0) / totalApartments) * 100)
      : 0;
    const occupancyTrend = occupancy - occupancyWeekAgo;

    // Revenue today — sum of bookings checked in today
    const { data: todayBookings } = await supabase
      .from("bookings")
      .select("total_amount_gbp, nights")
      .eq("status", "checked_in")
      .lte("check_in", today)
      .gt("check_out", today);

    const revenueToday = (todayBookings || []).reduce((sum, b) => {
      return sum + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0);
    }, 0);

    // Arrivals today
    const { count: arrivalsToday } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "checked_in"])
      .eq("check_in", today);

    // Departures today
    const { count: departuresToday } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("status", ["checked_in", "checked_out"])
      .eq("check_out", today);

    // Maintenance
    const { count: openMaintenance } = await supabase
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "assigned", "in_progress"]);

    const { count: urgentMaintenance } = await supabase
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "assigned", "in_progress"])
      .in("priority", ["urgent", "emergency"]);

    // Housekeeping
    const { data: hkTasks } = await supabase
      .from("housekeeping_tasks")
      .select("status")
      .eq("scheduled_date", today);

    const hkClean = totalApartments - (hkTasks?.filter((t) => t.status === "pending" || t.status === "assigned").length || 0);
    const hkDirty = hkTasks?.filter((t) => t.status === "pending" || t.status === "assigned").length || 0;
    const hkInProgress = hkTasks?.filter((t) => t.status === "in_progress").length || 0;

    // Recent bookings (5 most recent)
    const { data: recentBookings } = await supabase
      .from("bookings")
      .select(`
        id, reference, status, check_in, check_out, nights, total_amount_gbp,
        guest:guests(id, first_name, last_name),
        apartment:apartments(id, number)
      `)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      data: {
        occupancy_percentage: occupancy,
        occupancy_trend: occupancyTrend,
        revenue_today_gbp: Math.round(revenueToday * 100) / 100,
        arrivals_today: arrivalsToday || 0,
        departures_today: departuresToday || 0,
        open_maintenance: openMaintenance || 0,
        urgent_maintenance: urgentMaintenance || 0,
        housekeeping_clean: hkClean,
        housekeeping_dirty: hkDirty,
        housekeeping_in_progress: hkInProgress,
        total_apartments: totalApartments,
        recent_bookings: recentBookings || [],
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
