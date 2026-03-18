import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    // Revenue: sum of bookings.total_amount_gbp for checked_in/checked_out bookings this month
    const { data: revenueBookings } = await supabase
      .from("bookings")
      .select("total_amount_gbp")
      .in("status", ["checked_in", "checked_out"])
      .gte("check_in", monthStart)
      .lte("check_in", monthEnd);

    const revenue = (revenueBookings || []).reduce(
      (sum, b) => sum + (b.total_amount_gbp || 0),
      0
    );

    // Expenses: sum this month
    const { data: monthExpenses } = await supabase
      .from("expenses")
      .select("amount_gbp")
      .gte("expense_date", monthStart)
      .lte("expense_date", monthEnd);

    const expenses = (monthExpenses || []).reduce(
      (sum, e) => sum + (e.amount_gbp || 0),
      0
    );

    // Occupancy: count checked_in bookings / total apartments
    const { count: occupiedCount } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_in");

    const { count: totalApartments } = await supabase
      .from("apartments")
      .select("id", { count: "exact", head: true });

    const occupancy =
      totalApartments && totalApartments > 0
        ? Math.round(((occupiedCount || 0) / totalApartments) * 100)
        : 0;

    // ADR: revenue / occupied apartment-nights
    const occupiedNights = (revenueBookings || []).length;
    const adr = occupiedNights > 0 ? revenue / occupiedNights : 0;

    // RevPAA: revenue / total apartment-nights in month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const totalAptNights = (totalApartments || 0) * daysInMonth;
    const revpaa = totalAptNights > 0 ? revenue / totalAptNights : 0;

    // Invoices
    const { count: totalInvoices } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true });

    const { count: outstandingInvoices } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["sent", "partially_paid", "overdue"]);

    // Monthly chart data (last 6 months)
    const monthlyData: { month: string; revenue: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = d.toISOString().split("T")[0];
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];
      const monthLabel = d.toLocaleString("en", { month: "short", year: "2-digit" });

      const { data: mRevenue } = await supabase
        .from("bookings")
        .select("total_amount_gbp")
        .in("status", ["checked_in", "checked_out"])
        .gte("check_in", mStart)
        .lte("check_in", mEnd);

      const { data: mExpenses } = await supabase
        .from("expenses")
        .select("amount_gbp")
        .gte("expense_date", mStart)
        .lte("expense_date", mEnd);

      monthlyData.push({
        month: monthLabel,
        revenue: (mRevenue || []).reduce((s, b) => s + (b.total_amount_gbp || 0), 0),
        expenses: (mExpenses || []).reduce((s, e) => s + (e.amount_gbp || 0), 0),
      });
    }

    return NextResponse.json({
      data: {
        revenue_gbp: Math.round(revenue * 100) / 100,
        expenses_gbp: Math.round(expenses * 100) / 100,
        net_profit_gbp: Math.round((revenue - expenses) * 100) / 100,
        occupancy_rate: occupancy,
        adr_gbp: Math.round(adr * 100) / 100,
        revpaa_gbp: Math.round(revpaa * 100) / 100,
        total_invoices: totalInvoices || 0,
        outstanding_invoices: outstandingInvoices || 0,
        monthly_data: monthlyData,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
