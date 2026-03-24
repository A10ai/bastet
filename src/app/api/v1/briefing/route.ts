import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import { format, startOfWeek } from "date-fns";
import { calculateHealthScore } from "@/lib/ai-engine";

interface BriefingItem {
  text: string;
  trend?: "up" | "down" | "neutral";
  alert?: boolean;
}

interface BriefingSection {
  title: string;
  icon: string;
  items: BriefingItem[];
}

interface TopAction {
  text: string;
  link: string;
  priority: "high" | "medium" | "low";
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const supabase = createServerSupabaseClient();

    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    // ── 1. Occupancy ──────────────────────────────────────────────────
    let apartments: { id: string; status: string }[] = [];
    try {
      const { data } = await supabase.from("apartments").select("id, status");
      apartments = data || [];
    } catch {
      // apartments query failed
    }

    const totalApartments = apartments.length;
    const occupiedCount = apartments.filter((a) => a.status === "occupied").length;
    const availableCount = apartments.filter((a) => a.status === "available").length;
    const maintenanceAptCount = apartments.filter((a) => a.status === "maintenance").length;
    const cleaningCount = apartments.filter((a) => a.status === "cleaning").length;
    const occupancyPct = totalApartments > 0 ? Math.round((occupiedCount / totalApartments) * 100) : 0;

    // ── 2. Today's arrivals ───────────────────────────────────────────
    let arrivalsCount = 0;
    try {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["confirmed", "checked_in"])
        .eq("check_in", today);
      arrivalsCount = count || 0;
    } catch {
      // arrivals query failed
    }

    // ── 3. Today's departures ─────────────────────────────────────────
    let departuresCount = 0;
    try {
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["checked_in", "checked_out"])
        .eq("check_out", today);
      departuresCount = count || 0;
    } catch {
      // departures query failed
    }

    // ── 4. Revenue today ──────────────────────────────────────────────
    let revenueToday = 0;
    try {
      const { data } = await supabase
        .from("bookings")
        .select("total_amount_gbp, nights")
        .eq("status", "checked_in")
        .lte("check_in", today)
        .gt("check_out", today);
      revenueToday = (data || []).reduce((sum, b) => {
        return sum + (b.nights > 0 ? b.total_amount_gbp / b.nights : 0);
      }, 0);
    } catch {
      // revenue today query failed
    }

    // ── 5. Revenue this month ─────────────────────────────────────────
    let revenueMonth = 0;
    try {
      const { data } = await supabase
        .from("bookings")
        .select("total_amount_gbp")
        .in("status", ["checked_in", "checked_out"])
        .gte("check_in", monthStart)
        .lte("check_in", monthEnd);
      revenueMonth = (data || []).reduce((sum, b) => sum + (b.total_amount_gbp || 0), 0);
    } catch {
      // revenue month query failed
    }

    // ADR
    const checkedInToday = (apartments.filter((a) => a.status === "occupied")).length;
    const adr = checkedInToday > 0 ? revenueToday / checkedInToday : 0;

    // ── 6. Housekeeping ───────────────────────────────────────────────
    let hkPending = 0;
    let hkAssigned = 0;
    let hkInProgress = 0;
    let hkCompleted = 0;
    try {
      const { data } = await supabase
        .from("housekeeping_tasks")
        .select("status")
        .eq("scheduled_date", today);
      const tasks = data || [];
      hkPending = tasks.filter((t) => t.status === "pending").length;
      hkAssigned = tasks.filter((t) => t.status === "assigned").length;
      hkInProgress = tasks.filter((t) => t.status === "in_progress").length;
      hkCompleted = tasks.filter((t) => t.status === "completed").length;
    } catch {
      // housekeeping query failed
    }

    const hkToClean = hkPending + hkAssigned;

    // ── 7. Maintenance ────────────────────────────────────────────────
    let openMaintenance = 0;
    let urgentMaintenance = 0;
    try {
      const [openRes, urgentRes] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "assigned", "in_progress"]),
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "assigned", "in_progress"])
          .in("priority", ["urgent", "emergency"]),
      ]);
      openMaintenance = openRes.count || 0;
      urgentMaintenance = urgentRes.count || 0;
    } catch {
      // maintenance query failed
    }

    // ── 8. Outstanding invoices ───────────────────────────────────────
    let outstandingInvoices = 0;
    try {
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .in("status", ["sent", "partially_paid", "overdue"]);
      outstandingInvoices = count || 0;
    } catch {
      // invoices query failed
    }

    // ── 9. Recent expenses (this week) ────────────────────────────────
    let weekExpenses = 0;
    try {
      const { data } = await supabase
        .from("expenses")
        .select("amount_gbp")
        .gte("expense_date", weekStart)
        .lte("expense_date", today);
      weekExpenses = (data || []).reduce((sum, e) => sum + (e.amount_gbp || 0), 0);
    } catch {
      // expenses query failed
    }

    // ── 10. Guest alerts ──────────────────────────────────────────────
    let specialRequestGuests: { special_requests: string | null; guest_name?: string }[] = [];
    try {
      const { data } = await supabase
        .from("bookings")
        .select("special_requests, guest_name")
        .eq("check_in", today)
        .in("status", ["confirmed", "checked_in"])
        .not("special_requests", "is", null);
      specialRequestGuests = data || [];
    } catch {
      // guest alerts query failed
    }

    const specialRequestCount = specialRequestGuests.length;
    const vipCount = specialRequestGuests.filter(
      (g) => g.special_requests?.toLowerCase().includes("vip")
    ).length;

    // ── Build sections ────────────────────────────────────────────────
    const occupancySection: BriefingSection = {
      title: "Occupancy",
      icon: "Building2",
      items: [
        {
          text: `${occupancyPct}% occupied (${occupiedCount}/${totalApartments} units)`,
          trend: occupancyPct >= 70 ? "up" : occupancyPct >= 50 ? "neutral" : "down",
        },
        { text: `${arrivalsCount} arrivals today`, trend: "neutral" },
        { text: `${departuresCount} departures today` },
        { text: `${availableCount} available, ${maintenanceAptCount} maintenance, ${cleaningCount} cleaning` },
      ],
    };

    const revenueSection: BriefingSection = {
      title: "Revenue",
      icon: "DollarSign",
      items: [
        { text: `\u00a3${Math.round(revenueToday * 100) / 100} revenue today` },
        { text: `\u00a3${Math.round(revenueMonth * 100) / 100} this month` },
        { text: `ADR: \u00a3${Math.round(adr * 100) / 100}` },
      ],
    };

    const housekeepingSection: BriefingSection = {
      title: "Housekeeping",
      icon: "Sparkles",
      items: [
        ...(hkToClean > 0
          ? [{ text: `${hkToClean} rooms to clean`, alert: true }]
          : [{ text: "No rooms to clean" }]),
        ...(hkInProgress > 0 ? [{ text: `${hkInProgress} in progress` }] : []),
        { text: `${hkCompleted} completed today` },
      ],
    };

    const maintenanceSection: BriefingSection = {
      title: "Maintenance",
      icon: "Wrench",
      items: [
        { text: `${openMaintenance} open tickets` },
        ...(urgentMaintenance > 0
          ? [{ text: `${urgentMaintenance} urgent needs attention`, alert: true }]
          : [{ text: "No urgent tickets" }]),
      ],
    };

    const financeSection: BriefingSection = {
      title: "Finance",
      icon: "Wallet",
      items: [
        { text: `${outstandingInvoices} outstanding invoices` },
        { text: `\u00a3${Math.round(weekExpenses * 100) / 100} expenses this week` },
      ],
    };

    const guestsSection: BriefingSection = {
      title: "Guest Alerts",
      icon: "Users",
      items: [
        ...(vipCount > 0
          ? [{ text: `${vipCount} VIP arrivals today`, alert: true }]
          : []),
        ...(specialRequestCount > 0
          ? [{ text: `${specialRequestCount} guests with special requests` }]
          : [{ text: "No special requests today" }]),
      ],
    };

    // ── Top actions (dynamic, priority-ordered) ───────────────────────
    const topActions: TopAction[] = [];

    if (urgentMaintenance > 0) {
      topActions.push({
        text: `Resolve ${urgentMaintenance} urgent maintenance ticket${urgentMaintenance > 1 ? "s" : ""}`,
        link: "/dashboard/maintenance",
        priority: "high",
      });
    }

    if (hkToClean > 0) {
      topActions.push({
        text: `Clean ${hkToClean} rooms before 2PM check-ins`,
        link: "/dashboard/housekeeping",
        priority: "high",
      });
    }

    if (arrivalsCount > 0) {
      topActions.push({
        text: `Prepare for ${arrivalsCount} guest arrival${arrivalsCount > 1 ? "s" : ""}`,
        link: "/dashboard/bookings",
        priority: "medium",
      });
    }

    if (outstandingInvoices > 0) {
      topActions.push({
        text: `Follow up on ${outstandingInvoices} outstanding invoice${outstandingInvoices > 1 ? "s" : ""}`,
        link: "/dashboard/finance/invoices",
        priority: "medium",
      });
    }

    if (specialRequestCount > 0) {
      topActions.push({
        text: `Review ${specialRequestCount} guest special request${specialRequestCount > 1 ? "s" : ""}`,
        link: "/dashboard/bookings",
        priority: "medium",
      });
    }

    if (departuresCount > 0) {
      topActions.push({
        text: `Process ${departuresCount} checkout${departuresCount > 1 ? "s" : ""} today`,
        link: "/dashboard/bookings",
        priority: "medium",
      });
    }

    topActions.push({
      text: "Review AI pricing recommendations",
      link: "/dashboard/ai/revenue",
      priority: "low",
    });

    // ── Health score ──────────────────────────────────────────────────
    const overallHealth = calculateHealthScore({
      occupancy: occupancyPct,
      urgent_maintenance: urgentMaintenance,
      housekeeping_dirty: hkToClean,
      total_apartments: totalApartments,
    });

    // Dimension scores for breakdown
    const occupancyScore =
      occupancyPct >= 70 && occupancyPct <= 90
        ? 100
        : occupancyPct >= 50
          ? 80
          : occupancyPct >= 30
            ? 60
            : 40;

    const maintenanceScore = Math.max(0, 100 - urgentMaintenance * 20 - (openMaintenance - urgentMaintenance) * 5);
    const housekeepingScore =
      totalApartments > 0
        ? Math.max(0, 100 - Math.round((hkToClean / totalApartments) * 100))
        : 100;
    const financeScore = Math.max(0, 100 - outstandingInvoices * 10);
    const guestScore =
      arrivalsCount > 0 && specialRequestCount === 0
        ? 100
        : Math.max(0, 100 - specialRequestCount * 5);

    return NextResponse.json({
      data: {
        greeting: getGreeting(),
        date: today,
        property: "Bastet Hurghada",
        sections: {
          occupancy: occupancySection,
          revenue: revenueSection,
          housekeeping: housekeepingSection,
          maintenance: maintenanceSection,
          finance: financeSection,
          guests: guestsSection,
        },
        top_actions: topActions,
        health_score: {
          overall: overallHealth,
          dimensions: {
            occupancy: occupancyScore,
            maintenance: maintenanceScore,
            housekeeping: housekeepingScore,
            finance: financeScore,
            guest_satisfaction: guestScore,
          },
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
