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

    // Expense breakdown by category
    const { data: expensesByCategory } = await supabase
      .from("expenses")
      .select("category, amount_gbp")
      .gte("expense_date", monthStart)
      .lte("expense_date", monthEnd);

    const categoryMap: Record<string, { total_gbp: number; count: number }> = {};
    for (const e of expensesByCategory || []) {
      const cat = e.category || "Uncategorised";
      if (!categoryMap[cat]) categoryMap[cat] = { total_gbp: 0, count: 0 };
      categoryMap[cat].total_gbp += e.amount_gbp || 0;
      categoryMap[cat].count += 1;
    }
    const expenseBreakdown = Object.entries(categoryMap)
      .map(([category, v]) => ({
        category,
        total_gbp: Math.round(v.total_gbp * 100) / 100,
        count: v.count,
        percentage: expenses > 0 ? Math.round((v.total_gbp / expenses) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.total_gbp - a.total_gbp);

    // Revenue by source
    const revenueBySource: { source: string; amount_gbp: number; percentage: number }[] = [];
    const roomRevenue = revenue;

    // Try extras/marketplace tables if they exist
    let extrasRevenue = 0;
    try {
      const { data: extras } = await supabase
        .from("extras")
        .select("amount_gbp")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      extrasRevenue = (extras || []).reduce((s, e) => s + (e.amount_gbp || 0), 0);
    } catch {
      // extras table may not exist
    }

    let marketplaceRevenue = 0;
    try {
      const { data: marketplace } = await supabase
        .from("marketplace_orders")
        .select("total_gbp")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      marketplaceRevenue = (marketplace || []).reduce((s, m) => s + (m.total_gbp || 0), 0);
    } catch {
      // marketplace table may not exist
    }

    const totalRevenue = roomRevenue + extrasRevenue + marketplaceRevenue;
    if (roomRevenue > 0) {
      revenueBySource.push({
        source: "Room Revenue",
        amount_gbp: Math.round(roomRevenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((roomRevenue / totalRevenue) * 10000) / 100 : 100,
      });
    }
    if (extrasRevenue > 0) {
      revenueBySource.push({
        source: "Extras",
        amount_gbp: Math.round(extrasRevenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((extrasRevenue / totalRevenue) * 10000) / 100 : 0,
      });
    }
    if (marketplaceRevenue > 0) {
      revenueBySource.push({
        source: "Marketplace",
        amount_gbp: Math.round(marketplaceRevenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((marketplaceRevenue / totalRevenue) * 10000) / 100 : 0,
      });
    }
    if (revenueBySource.length === 0) {
      revenueBySource.push({ source: "Room Revenue", amount_gbp: 0, percentage: 100 });
    }

    // Cost per occupied room
    const costPerOccupiedRoom = occupiedNights > 0 ? expenses / occupiedNights : 0;

    // Profit margin
    const profitMarginPct = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;

    // Previous month boundaries for comparison
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .split("T")[0];
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      .toISOString()
      .split("T")[0];

    const { data: prevRevenueBookings } = await supabase
      .from("bookings")
      .select("total_amount_gbp")
      .in("status", ["checked_in", "checked_out"])
      .gte("check_in", prevMonthStart)
      .lte("check_in", prevMonthEnd);

    const prevRevenue = (prevRevenueBookings || []).reduce(
      (sum, b) => sum + (b.total_amount_gbp || 0),
      0
    );

    const { data: prevMonthExpenses } = await supabase
      .from("expenses")
      .select("amount_gbp")
      .gte("expense_date", prevMonthStart)
      .lte("expense_date", prevMonthEnd);

    const prevExpenses = (prevMonthExpenses || []).reduce(
      (sum, e) => sum + (e.amount_gbp || 0),
      0
    );

    const revenueVsLastMonthPct =
      prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    const expensesVsLastMonthPct =
      prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null;

    // YTD boundaries
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];

    const { data: ytdRevenueBookings } = await supabase
      .from("bookings")
      .select("total_amount_gbp")
      .in("status", ["checked_in", "checked_out"])
      .gte("check_in", yearStart)
      .lte("check_in", monthEnd);

    const ytdRevenue = (ytdRevenueBookings || []).reduce(
      (sum, b) => sum + (b.total_amount_gbp || 0),
      0
    );

    const { data: ytdExpensesData } = await supabase
      .from("expenses")
      .select("amount_gbp")
      .gte("expense_date", yearStart)
      .lte("expense_date", monthEnd);

    const ytdExpenses = (ytdExpensesData || []).reduce(
      (sum, e) => sum + (e.amount_gbp || 0),
      0
    );

    // R&D total (for Innovate UK tracking)
    let rAndDTotal = 0;
    try {
      const { data: rndExpenses } = await supabase
        .from("expenses")
        .select("amount_gbp")
        .eq("is_r_and_d", true)
        .gte("expense_date", yearStart)
        .lte("expense_date", monthEnd);
      rAndDTotal = (rndExpenses || []).reduce(
        (sum, e) => sum + (e.amount_gbp || 0),
        0
      );
    } catch {
      // is_r_and_d column may not exist yet
    }

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
        expense_breakdown: expenseBreakdown,
        revenue_by_source: revenueBySource,
        cost_per_occupied_room: Math.round(costPerOccupiedRoom * 100) / 100,
        profit_margin_pct: Math.round(profitMarginPct * 100) / 100,
        revenue_vs_last_month_pct:
          revenueVsLastMonthPct !== null
            ? Math.round(revenueVsLastMonthPct * 100) / 100
            : null,
        expenses_vs_last_month_pct:
          expensesVsLastMonthPct !== null
            ? Math.round(expensesVsLastMonthPct * 100) / 100
            : null,
        ytd_revenue_gbp: Math.round(ytdRevenue * 100) / 100,
        ytd_expenses_gbp: Math.round(ytdExpenses * 100) / 100,
        ytd_net_profit_gbp: Math.round((ytdRevenue - ytdExpenses) * 100) / 100,
        r_and_d_total_gbp: Math.round(rAndDTotal * 100) / 100,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
