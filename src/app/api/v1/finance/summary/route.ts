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

    // ===== NEW: Revenue by Room Type =====
    let revenueByRoomType: { type: string; bookings: number; revenue_gbp: number; avg_rate: number; avg_nights: number }[] = [];
    try {
      const { data: roomTypeBookings } = await supabase
        .from("bookings")
        .select("total_amount_gbp, nights, apartment_id")
        .in("status", ["checked_in", "checked_out"])
        .gte("check_in", monthStart)
        .lte("check_in", monthEnd);

      if (roomTypeBookings && roomTypeBookings.length > 0) {
        // Get apartment -> apartment_type mapping
        const aptIds = Array.from(new Set(roomTypeBookings.map((b) => b.apartment_id)));
        const { data: apartments } = await supabase
          .from("apartments")
          .select("id, apartment_type_id")
          .in("id", aptIds);

        const typeIds = Array.from(new Set((apartments || []).map((a) => a.apartment_type_id)));
        const { data: aptTypes } = await supabase
          .from("apartment_types")
          .select("id, name")
          .in("id", typeIds);

        const aptToType: Record<string, string> = {};
        const typeIdToName: Record<string, string> = {};
        for (const t of aptTypes || []) typeIdToName[t.id] = t.name;
        for (const a of apartments || []) aptToType[a.id] = typeIdToName[a.apartment_type_id] || "Unknown";

        const typeMap: Record<string, { bookings: number; revenue: number; nights: number }> = {};
        for (const b of roomTypeBookings) {
          const typeName = aptToType[b.apartment_id] || "Unknown";
          if (!typeMap[typeName]) typeMap[typeName] = { bookings: 0, revenue: 0, nights: 0 };
          typeMap[typeName].bookings += 1;
          typeMap[typeName].revenue += b.total_amount_gbp || 0;
          typeMap[typeName].nights += b.nights || 0;
        }

        revenueByRoomType = Object.entries(typeMap)
          .map(([type, v]) => ({
            type,
            bookings: v.bookings,
            revenue_gbp: Math.round(v.revenue * 100) / 100,
            avg_rate: v.nights > 0 ? Math.round((v.revenue / v.nights) * 100) / 100 : 0,
            avg_nights: v.bookings > 0 ? Math.round((v.nights / v.bookings) * 10) / 10 : 0,
          }))
          .sort((a, b) => b.revenue_gbp - a.revenue_gbp);
      }
    } catch {
      // revenue_by_room_type query failed — continue with empty array
    }

    // ===== NEW: Revenue by Channel (booking source) =====
    let revenueByChannel: { source: string; bookings: number; revenue_gbp: number; percentage: number }[] = [];
    try {
      const { data: channelBookings } = await supabase
        .from("bookings")
        .select("total_amount_gbp, channel_id")
        .in("status", ["checked_in", "checked_out"])
        .gte("check_in", monthStart)
        .lte("check_in", monthEnd);

      if (channelBookings && channelBookings.length > 0) {
        const channelIds = Array.from(new Set(channelBookings.map((b) => b.channel_id)));
        const { data: channels } = await supabase
          .from("booking_channels")
          .select("id, name, code")
          .in("id", channelIds);

        const chIdToName: Record<string, string> = {};
        for (const c of channels || []) chIdToName[c.id] = c.name;

        const chMap: Record<string, { bookings: number; revenue: number }> = {};
        for (const b of channelBookings) {
          const chName = chIdToName[b.channel_id] || "Unknown";
          if (!chMap[chName]) chMap[chName] = { bookings: 0, revenue: 0 };
          chMap[chName].bookings += 1;
          chMap[chName].revenue += b.total_amount_gbp || 0;
        }

        const channelTotal = Object.values(chMap).reduce((s, v) => s + v.revenue, 0);
        revenueByChannel = Object.entries(chMap)
          .map(([source, v]) => ({
            source,
            bookings: v.bookings,
            revenue_gbp: Math.round(v.revenue * 100) / 100,
            percentage: channelTotal > 0 ? Math.round((v.revenue / channelTotal) * 10000) / 100 : 0,
          }))
          .sort((a, b) => b.revenue_gbp - a.revenue_gbp);
      }
    } catch {
      // revenue_by_channel query failed — continue with empty array
    }

    // ===== NEW: Accounts Receivable Aging =====
    const accountsReceivable = {
      current: { count: 0, total: 0 },
      days_30: { count: 0, total: 0 },
      days_60: { count: 0, total: 0 },
      days_90_plus: { count: 0, total: 0 },
    };
    try {
      const { data: outstandingInvoicesList } = await supabase
        .from("invoices")
        .select("total_gbp, due_date, status")
        .in("status", ["sent", "partially_paid", "overdue"]);

      const today = new Date();
      for (const inv of outstandingInvoicesList || []) {
        const due = new Date(inv.due_date);
        const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(inv.total_gbp) || 0;

        if (diffDays <= 0) {
          accountsReceivable.current.count += 1;
          accountsReceivable.current.total += amount;
        } else if (diffDays <= 30) {
          accountsReceivable.days_30.count += 1;
          accountsReceivable.days_30.total += amount;
        } else if (diffDays <= 60) {
          accountsReceivable.days_60.count += 1;
          accountsReceivable.days_60.total += amount;
        } else {
          accountsReceivable.days_90_plus.count += 1;
          accountsReceivable.days_90_plus.total += amount;
        }
      }
      // Round totals
      accountsReceivable.current.total = Math.round(accountsReceivable.current.total * 100) / 100;
      accountsReceivable.days_30.total = Math.round(accountsReceivable.days_30.total * 100) / 100;
      accountsReceivable.days_60.total = Math.round(accountsReceivable.days_60.total * 100) / 100;
      accountsReceivable.days_90_plus.total = Math.round(accountsReceivable.days_90_plus.total * 100) / 100;
    } catch {
      // accounts_receivable query failed — continue with defaults
    }

    // ===== NEW: Gross Operating Profit (GOP) =====
    // GOP = revenue - operating expenses (exclude tax, insurance as non-operating)
    const operatingCategories = ["staff", "utilities", "maintenance", "supplies", "marketing", "commission", "technology", "other"];
    let operatingExpenses = 0;
    for (const e of expensesByCategory || []) {
      const cat = e.category || "other";
      if (operatingCategories.includes(cat)) {
        operatingExpenses += e.amount_gbp || 0;
      }
    }
    const gopGbp = revenue - operatingExpenses;
    const gopMarginPct = revenue > 0 ? (gopGbp / revenue) * 100 : 0;
    const gop = {
      gop_gbp: Math.round(gopGbp * 100) / 100,
      gop_margin_pct: Math.round(gopMarginPct * 100) / 100,
    };

    // ===== NEW: CPOR Trend (last 6 months) =====
    const cporTrend: { month: string; cpor_gbp: number }[] = [];
    try {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = d.toISOString().split("T")[0];
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];
        const monthLabel = d.toLocaleString("en", { month: "short", year: "2-digit" });

        // Use existing monthlyData for expenses if already computed, otherwise query
        const existingMonth = monthlyData.find((m) => m.month === monthLabel);
        let mExpTotal = existingMonth?.expenses || 0;

        if (!existingMonth) {
          const { data: mExp } = await supabase
            .from("expenses")
            .select("amount_gbp")
            .gte("expense_date", mStart)
            .lte("expense_date", mEnd);
          mExpTotal = (mExp || []).reduce((s, e) => s + (e.amount_gbp || 0), 0);
        }

        const { count: mOccupied } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("status", ["checked_in", "checked_out"])
          .gte("check_in", mStart)
          .lte("check_in", mEnd);

        const cpor = (mOccupied || 0) > 0 ? mExpTotal / (mOccupied || 1) : 0;
        cporTrend.push({ month: monthLabel, cpor_gbp: Math.round(cpor * 100) / 100 });
      }
    } catch {
      // cpor_trend query failed — continue with empty array
    }

    // ===== NEW: Department Costs =====
    // Map expense categories to hotel departments
    const categoryToDepartment: Record<string, string> = {
      staff: "Personnel",
      utilities: "Energy",
      maintenance: "Property",
      supplies: "Rooms",
      marketing: "Sales & Marketing",
      commission: "Sales & Marketing",
      insurance: "Administration",
      tax: "Administration",
      technology: "Technology",
      other: "General",
    };

    // Budget estimates per department (monthly) — can be overridden by a budget table later
    const departmentBudgets: Record<string, number> = {
      Personnel: expenses * 0.35,
      Energy: expenses * 0.15,
      Property: expenses * 0.12,
      Rooms: expenses * 0.10,
      "Sales & Marketing": expenses * 0.12,
      Administration: expenses * 0.08,
      Technology: expenses * 0.05,
      General: expenses * 0.03,
    };

    const deptActualMap: Record<string, number> = {};
    for (const e of expensesByCategory || []) {
      const dept = categoryToDepartment[e.category || "other"] || "General";
      deptActualMap[dept] = (deptActualMap[dept] || 0) + (e.amount_gbp || 0);
    }

    const allDepts = new Set([...Object.keys(departmentBudgets), ...Object.keys(deptActualMap)]);
    const departmentCosts = Array.from(allDepts)
      .map((department) => {
        const budget = departmentBudgets[department] || 0;
        const actual = deptActualMap[department] || 0;
        const variance = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
        return {
          department,
          budget_gbp: Math.round(budget * 100) / 100,
          actual_gbp: Math.round(actual * 100) / 100,
          variance_pct: Math.round(variance * 100) / 100,
        };
      })
      .filter((d) => d.actual_gbp > 0 || d.budget_gbp > 0)
      .sort((a, b) => b.actual_gbp - a.actual_gbp);

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
        revenue_by_room_type: revenueByRoomType,
        revenue_by_channel: revenueByChannel,
        accounts_receivable: accountsReceivable,
        gop,
        cpor_trend: cporTrend,
        department_costs: departmentCosts,
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
