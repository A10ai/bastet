import type { SupabaseClient } from "@supabase/supabase-js";
import { CHANNEL_COMMISSIONS } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────

export interface OccupancyReport {
  daily: { date: string; occupancy: number; occupied: number; total: number }[];
  average_occupancy: number;
  peak_day: { date: string; occupancy: number } | null;
  low_day: { date: string; occupancy: number } | null;
  by_building: { building_name: string; occupancy: number; occupied: number; total: number }[];
  by_floor: { floor_label: string; occupancy: number; occupied: number; total: number }[];
  by_apartment_type: { type_name: string; occupancy: number; occupied: number; total: number }[];
  previous_period_avg: number;
  change_pct: number;
}

export interface RevenueReport {
  total_revenue: number;
  adr: number;
  revpar: number;
  by_apartment_type: { type_name: string; revenue: number; bookings: number }[];
  by_channel: { channel: string; revenue: number; commission: number; net_revenue: number; bookings: number }[];
  daily: { date: string; revenue: number }[];
  top_bookings: { ref: string; guest_name: string; apartment: string; amount: number; nights: number }[];
  previous_period_revenue: number;
  change_pct: number;
}

export interface GuestReport {
  total_guests: number;
  new_guests: number;
  returning_guests: number;
  by_nationality: { nationality: string; count: number }[];
  by_loyalty_tier: { tier: string; count: number }[];
  average_spend: number;
  vip_guests: { name: string; email: string; tier: string; total_spend: number; stays: number }[];
}

export interface OperationsReport {
  housekeeping: {
    total_tasks: number;
    completed: number;
    avg_completion_minutes: number;
    by_type: { type: string; count: number }[];
    by_status: { status: string; count: number }[];
  };
  maintenance: {
    opened: number;
    resolved: number;
    by_category: { category: string; count: number }[];
    by_priority: { priority: string; count: number }[];
    avg_resolution_hours: number;
    total_cost: number;
  };
  staff_workload: { staff_name: string; role: string; tasks_assigned: number; tasks_completed: number }[];
}

export interface FinancialReport {
  total_revenue: number;
  total_expenses: number;
  gross_profit: number;
  profit_margin: number;
  revenue_breakdown: { source: string; amount: number }[];
  expense_breakdown: { category: string; amount: number }[];
  outstanding_invoices: { count: number; value: number };
  cash_flow: { payments_received: number; expenses_paid: number; net: number };
}

export interface ExecutiveSummary {
  occupancy_pct: number;
  revenue: number;
  adr: number;
  revpar: number;
  profit_margin: number;
  guest_satisfaction: number;
  highlights: string[];
  concerns: string[];
  period: { from: string; to: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const floorLabelFn = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / 86400000) + 1);
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  return {
    from: prevFrom.toISOString().split("T")[0],
    to: prevTo.toISOString().split("T")[0],
  };
}

// ─── Occupancy Report ────────────────────────────────────────────────

export async function getOccupancyReport(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<OccupancyReport> {
  // Get total apartments with building, type, and floor info
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, floor, building_id, apartment_type_id, buildings(name), apartment_types(name)");

  const totalApartments = (apartments || []).length;

  // Get bookings overlapping the period
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, apartment_id, check_in, check_out, status")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("check_in", dateTo)
    .gte("check_out", dateFrom);

  // Calculate daily occupancy — precompute date→occupied-apartments map (O(n*d) not O(n²))
  const days = daysBetween(dateFrom, dateTo);
  const daily: OccupancyReport["daily"] = [];

  // Build date strings once
  const dateStrings: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(dateFrom);
    d.setDate(d.getDate() + i);
    dateStrings.push(d.toISOString().split("T")[0]);
  }

  // Precompute: for each date, which apartment IDs are occupied
  const occupiedByDate = new Map<string, Set<string>>();
  for (const dateStr of dateStrings) {
    occupiedByDate.set(dateStr, new Set());
  }
  for (const b of bookings || []) {
    for (const dateStr of dateStrings) {
      if (b.check_in <= dateStr && b.check_out > dateStr) {
        occupiedByDate.get(dateStr)!.add(b.apartment_id);
      }
    }
  }

  // Precompute apartment→group maps for building, floor, type
  const aptToBuilding = new Map<string, string>();
  const aptToFloor = new Map<string, number>();
  const aptToType = new Map<string, string>();
  for (const apt of apartments || []) {
    aptToBuilding.set(apt.id, ((apt.buildings as Record<string, any> | null)?.name as string) || "Unknown");
    aptToFloor.set(apt.id, (apt as Record<string, any>).floor as number ?? 0);
    aptToType.set(apt.id, ((apt.apartment_types as Record<string, any> | null)?.name as string) || "Unknown");
  }

  // Daily occupancy
  for (const dateStr of dateStrings) {
    const occupied = occupiedByDate.get(dateStr)!.size;
    const occ = totalApartments > 0 ? round2((occupied / totalApartments) * 100) : 0;
    daily.push({ date: dateStr, occupancy: occ, occupied, total: totalApartments });
  }

  const avgOccupancy = daily.length > 0
    ? round2(daily.reduce((s, d) => s + d.occupancy, 0) / daily.length)
    : 0;

  const sorted = [...daily].sort((a, b) => b.occupancy - a.occupancy);
  const peakDay = sorted[0] || null;
  const lowDay = sorted[sorted.length - 1] || null;

  // By building — use precomputed maps (no re-filtering bookings)
  const buildingMap = new Map<string, { total: number; name: string }>();
  for (const apt of apartments || []) {
    const name = aptToBuilding.get(apt.id)!;
    const entry = buildingMap.get(name) || { total: 0, name };
    entry.total++;
    buildingMap.set(name, entry);
  }

  const byBuilding: OccupancyReport["by_building"] = [];
  for (const [name, info] of Array.from(buildingMap)) {
    const buildingAptIds = new Set(
      (apartments || []).filter((a) => aptToBuilding.get(a.id) === name).map((a) => a.id)
    );
    let totalOccDays = 0;
    for (const dateStr of dateStrings) {
      const occSet = occupiedByDate.get(dateStr)!;
      for (const aptId of occSet) {
        if (buildingAptIds.has(aptId)) totalOccDays++;
      }
    }
    const avgOcc = info.total * days > 0 ? round2((totalOccDays / (info.total * days)) * 100) : 0;
    byBuilding.push({ building_name: name, occupancy: avgOcc, occupied: totalOccDays, total: info.total * days });
  }

  // By floor — use precomputed maps
  const floorMap = new Map<number, { total: number; floor: number }>();
  for (const apt of apartments || []) {
    const f = aptToFloor.get(apt.id)!;
    const entry = floorMap.get(f) || { total: 0, floor: f };
    entry.total++;
    floorMap.set(f, entry);
  }

  const byFloor: OccupancyReport["by_floor"] = [];
  for (const [f, info] of Array.from(floorMap)) {
    const floorAptIds = new Set(
      (apartments || []).filter((a) => aptToFloor.get(a.id) === f).map((a) => a.id)
    );
    let totalOccDays = 0;
    for (const dateStr of dateStrings) {
      const occSet = occupiedByDate.get(dateStr)!;
      for (const aptId of occSet) {
        if (floorAptIds.has(aptId)) totalOccDays++;
      }
    }
    const avgOcc = info.total * days > 0 ? round2((totalOccDays / (info.total * days)) * 100) : 0;
    byFloor.push({ floor_label: floorLabelFn(f), occupancy: avgOcc, occupied: totalOccDays, total: info.total * days });
  }
  byFloor.sort((a, b) => a.floor_label.localeCompare(b.floor_label));

  // By apartment type — use precomputed maps
  const typeMap = new Map<string, { total: number; name: string }>();
  for (const apt of apartments || []) {
    const name = aptToType.get(apt.id)!;
    const entry = typeMap.get(name) || { total: 0, name };
    entry.total++;
    typeMap.set(name, entry);
  }

  const byType: OccupancyReport["by_apartment_type"] = [];
  for (const [name, info] of Array.from(typeMap)) {
    const typeAptIds = new Set(
      (apartments || []).filter((a) => aptToType.get(a.id) === name).map((a) => a.id)
    );
    let totalOccDays = 0;
    for (const dateStr of dateStrings) {
      const occSet = occupiedByDate.get(dateStr)!;
      for (const aptId of occSet) {
        if (typeAptIds.has(aptId)) totalOccDays++;
      }
    }
    const avgOcc = info.total * days > 0 ? round2((totalOccDays / (info.total * days)) * 100) : 0;
    byType.push({ type_name: name, occupancy: avgOcc, occupied: totalOccDays, total: info.total * days });
  }

  // Previous period comparison
  const prev = previousPeriod(dateFrom, dateTo);
  const { data: prevBookings } = await supabase
    .from("bookings")
    .select("id, apartment_id, check_in, check_out")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("check_in", prev.to)
    .gte("check_out", prev.from);

  const prevDays = daysBetween(prev.from, prev.to);
  let prevOccTotal = 0;
  for (let i = 0; i < prevDays; i++) {
    const d = new Date(prev.from);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const occupied = (prevBookings || []).filter(
      (b) => b.check_in <= dateStr && b.check_out > dateStr
    ).length;
    prevOccTotal += totalApartments > 0 ? (occupied / totalApartments) * 100 : 0;
  }
  const prevAvg = prevDays > 0 ? round2(prevOccTotal / prevDays) : 0;

  return {
    daily,
    average_occupancy: avgOccupancy,
    peak_day: peakDay ? { date: peakDay.date, occupancy: peakDay.occupancy } : null,
    low_day: lowDay ? { date: lowDay.date, occupancy: lowDay.occupancy } : null,
    by_building: byBuilding,
    by_floor: byFloor,
    by_apartment_type: byType,
    previous_period_avg: prevAvg,
    change_pct: prevAvg > 0 ? round2(((avgOccupancy - prevAvg) / prevAvg) * 100) : 0,
  };
}

// ─── Revenue Report ──────────────────────────────────────────────────

export async function getRevenueReport(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<RevenueReport> {
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, apartment_type_id, apartment_types(name)");

  const totalApartments = (apartments || []).length;

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, reference, apartment_id, guest_id, check_in, check_out, total_amount_gbp, channel, nights, guests(first_name, last_name), apartments(number)")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("check_in", dateTo)
    .gte("check_out", dateFrom)
    .order("total_amount_gbp", { ascending: false });

  const totalRevenue = (bookings || []).reduce((s, b) => s + (b.total_amount_gbp || 0), 0);
  const totalNights = (bookings || []).reduce((s, b) => s + (b.nights || 0), 0);
  const adr = totalNights > 0 ? round2(totalRevenue / totalNights) : 0;
  const days = daysBetween(dateFrom, dateTo);
  const revpar = totalApartments * days > 0 ? round2(totalRevenue / (totalApartments * days)) : 0;

  // By apartment type
  const typeRevMap = new Map<string, { revenue: number; bookings: number }>();
  for (const b of bookings || []) {
    const apt = (apartments || []).find((a) => a.id === b.apartment_id);
    const typeName = ((apt?.apartment_types as Record<string, any> | null)?.name as string) || "Unknown";
    const entry = typeRevMap.get(typeName) || { revenue: 0, bookings: 0 };
    entry.revenue += b.total_amount_gbp || 0;
    entry.bookings++;
    typeRevMap.set(typeName, entry);
  }
  const byType = Array.from(typeRevMap.entries()).map(([name, d]) => ({
    type_name: name,
    revenue: round2(d.revenue),
    bookings: d.bookings,
  }));

  // By channel
  const channelMap = new Map<string, { revenue: number; bookings: number }>();
  for (const b of bookings || []) {
    const ch = b.channel || "direct";
    const entry = channelMap.get(ch) || { revenue: 0, bookings: 0 };
    entry.revenue += b.total_amount_gbp || 0;
    entry.bookings++;
    channelMap.set(ch, entry);
  }
  const byChannel = Array.from(channelMap.entries()).map(([ch, d]) => {
    const commRate = CHANNEL_COMMISSIONS[ch] || 0;
    const commission = round2(d.revenue * commRate);
    return {
      channel: ch,
      revenue: round2(d.revenue),
      commission,
      net_revenue: round2(d.revenue - commission),
      bookings: d.bookings,
    };
  });

  // Daily revenue
  const dailyMap = new Map<string, number>();
  for (const b of bookings || []) {
    const date = (b.check_in || "").split("T")[0];
    dailyMap.set(date, (dailyMap.get(date) || 0) + (b.total_amount_gbp || 0));
  }
  const dailyRevenue = Array.from(dailyMap.entries())
    .map(([date, revenue]) => ({ date, revenue: round2(revenue) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top 10 bookings
  const topBookings = (bookings || []).slice(0, 10).map((b) => ({
    ref: b.reference || "N/A",
    guest_name: `${(b.guests as Record<string, any> | null)?.first_name || ""} ${(b.guests as Record<string, any> | null)?.last_name || ""}`.trim() || "Guest",
    apartment: (b.apartments as Record<string, any> | null)?.number || "N/A",
    amount: round2(b.total_amount_gbp || 0),
    nights: b.nights || 0,
  }));

  // Previous period
  const prev = previousPeriod(dateFrom, dateTo);
  const { data: prevBookings } = await supabase
    .from("bookings")
    .select("total_amount_gbp")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("check_in", prev.to)
    .gte("check_out", prev.from);

  const prevRevenue = (prevBookings || []).reduce((s, b) => s + (b.total_amount_gbp || 0), 0);

  return {
    total_revenue: round2(totalRevenue),
    adr,
    revpar,
    by_apartment_type: byType,
    by_channel: byChannel,
    daily: dailyRevenue,
    top_bookings: topBookings,
    previous_period_revenue: round2(prevRevenue),
    change_pct: prevRevenue > 0 ? round2(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0,
  };
}

// ─── Guest Report ────────────────────────────────────────────────────

export async function getGuestReport(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<GuestReport> {
  // Get bookings in period with guest info
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, guest_id, total_amount_gbp, guests(id, first_name, last_name, email, nationality, loyalty_tier, created_at)")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .gte("check_in", dateFrom)
    .lte("check_in", dateTo);

  // Unique guests
  const guestMap = new Map<string, {
    name: string;
    email: string;
    nationality: string;
    tier: string;
    spend: number;
    stays: number;
    created_at: string;
  }>();

  for (const b of bookings || []) {
    const guest = b.guests as Record<string, any> | null;
    if (!guest?.id) continue;
    const existing = guestMap.get(guest.id as string);
    if (existing) {
      existing.spend += b.total_amount_gbp || 0;
      existing.stays++;
    } else {
      guestMap.set(guest.id as string, {
        name: `${guest.first_name || ""} ${guest.last_name || ""}`.trim(),
        email: (guest.email as string) || "",
        nationality: (guest.nationality as string) || "Unknown",
        tier: (guest.loyalty_tier as string) || "bronze",
        spend: b.total_amount_gbp || 0,
        stays: 1,
        created_at: (guest.created_at as string) || "",
      });
    }
  }

  const totalGuests = guestMap.size;

  // New vs returning: check if guest has bookings before dateFrom
  const guestIds = Array.from(guestMap.keys());
  let returningCount = 0;
  if (guestIds.length > 0) {
    const { count } = await supabase
      .from("bookings")
      .select("guest_id", { count: "exact", head: true })
      .in("guest_id", guestIds)
      .lt("check_in", dateFrom)
      .in("status", ["confirmed", "checked_in", "checked_out"]);
    returningCount = count || 0;
  }
  // Approximate: this counts guests who had any prior booking
  // For accuracy we'd need distinct, but this gives a reasonable estimate
  const { data: returningGuestRows } = guestIds.length > 0
    ? await supabase
        .from("bookings")
        .select("guest_id")
        .in("guest_id", guestIds)
        .lt("check_in", dateFrom)
        .in("status", ["confirmed", "checked_in", "checked_out"])
    : { data: [] };

  const returningGuestIds = new Set((returningGuestRows || []).map((r) => r.guest_id));
  const returning = returningGuestIds.size;
  const newGuests = totalGuests - returning;

  // By nationality
  const natMap = new Map<string, number>();
  for (const g of Array.from(guestMap.values())) {
    natMap.set(g.nationality, (natMap.get(g.nationality) || 0) + 1);
  }
  const byNationality = Array.from(natMap.entries())
    .map(([nationality, count]) => ({ nationality, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // By loyalty tier
  const tierMap = new Map<string, number>();
  for (const g of Array.from(guestMap.values())) {
    tierMap.set(g.tier, (tierMap.get(g.tier) || 0) + 1);
  }
  const byTier = Array.from(tierMap.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count);

  // Average spend
  const totalSpend = Array.from(guestMap.values()).reduce((s, g) => s + g.spend, 0);
  const avgSpend = totalGuests > 0 ? round2(totalSpend / totalGuests) : 0;

  // VIP guests (gold/platinum)
  const vipGuests = Array.from(guestMap.values())
    .filter((g) => g.tier === "gold" || g.tier === "platinum")
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20)
    .map((g) => ({
      name: g.name,
      email: g.email,
      tier: g.tier,
      total_spend: round2(g.spend),
      stays: g.stays,
    }));

  return {
    total_guests: totalGuests,
    new_guests: newGuests,
    returning_guests: returning,
    by_nationality: byNationality,
    by_loyalty_tier: byTier,
    average_spend: avgSpend,
    vip_guests: vipGuests,
  };
}

// ─── Operations Report ───────────────────────────────────────────────

export async function getOperationsReport(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<OperationsReport> {
  // Housekeeping
  const { data: hkTasks } = await supabase
    .from("housekeeping_tasks")
    .select("id, task_type, status, assigned_to, created_at, completed_at, staff(first_name, last_name)")
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo + "T23:59:59");

  const hkTotal = (hkTasks || []).length;
  const hkCompleted = (hkTasks || []).filter((t) => t.status === "completed" || t.status === "verified").length;

  // Avg completion time (minutes)
  const completedWithTime = (hkTasks || []).filter((t) => t.completed_at && t.created_at);
  const avgMinutes = completedWithTime.length > 0
    ? round2(
        completedWithTime.reduce((s, t) => {
          const diff = new Date(t.completed_at).getTime() - new Date(t.created_at).getTime();
          return s + diff / 60000;
        }, 0) / completedWithTime.length
      )
    : 0;

  // HK by type
  const hkTypeMap = new Map<string, number>();
  for (const t of hkTasks || []) {
    hkTypeMap.set(t.task_type || "general", (hkTypeMap.get(t.task_type || "general") || 0) + 1);
  }
  const hkByType = Array.from(hkTypeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // HK by status
  const hkStatusMap = new Map<string, number>();
  for (const t of hkTasks || []) {
    hkStatusMap.set(t.status || "pending", (hkStatusMap.get(t.status || "pending") || 0) + 1);
  }
  const hkByStatus = Array.from(hkStatusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Maintenance
  const { data: mxRequests } = await supabase
    .from("maintenance_requests")
    .select("id, category, priority, status, cost, created_at, resolved_at, assigned_to, staff(first_name, last_name)")
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo + "T23:59:59");

  const mxOpened = (mxRequests || []).length;
  const mxResolved = (mxRequests || []).filter((r) => r.status === "completed").length;

  // MX by category
  const mxCatMap = new Map<string, number>();
  for (const r of mxRequests || []) {
    mxCatMap.set(r.category || "general", (mxCatMap.get(r.category || "general") || 0) + 1);
  }
  const mxByCat = Array.from(mxCatMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // MX by priority
  const mxPriMap = new Map<string, number>();
  for (const r of mxRequests || []) {
    mxPriMap.set(r.priority || "normal", (mxPriMap.get(r.priority || "normal") || 0) + 1);
  }
  const mxByPri = Array.from(mxPriMap.entries())
    .map(([priority, count]) => ({ priority, count }))
    .sort((a, b) => b.count - a.count);

  // Avg resolution time (hours)
  const resolvedWithTime = (mxRequests || []).filter((r) => r.resolved_at && r.created_at);
  const avgResHours = resolvedWithTime.length > 0
    ? round2(
        resolvedWithTime.reduce((s, r) => {
          const diff = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
          return s + diff / 3600000;
        }, 0) / resolvedWithTime.length
      )
    : 0;

  const mxTotalCost = (mxRequests || []).reduce((s, r) => s + (r.cost || 0), 0);

  // Staff workload
  const staffMap = new Map<string, { name: string; role: string; assigned: number; completed: number }>();

  for (const t of hkTasks || []) {
    if (!t.assigned_to) continue;
    const staff = t.staff as Record<string, any> | null;
    const name = staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() : t.assigned_to;
    const entry = staffMap.get(t.assigned_to) || { name, role: "Housekeeping", assigned: 0, completed: 0 };
    entry.assigned++;
    if (t.status === "completed" || t.status === "verified") entry.completed++;
    staffMap.set(t.assigned_to, entry);
  }

  for (const r of mxRequests || []) {
    if (!r.assigned_to) continue;
    const staff = r.staff as Record<string, any> | null;
    const name = staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() : r.assigned_to;
    const entry = staffMap.get(r.assigned_to) || { name, role: "Maintenance", assigned: 0, completed: 0 };
    entry.assigned++;
    if (r.status === "completed") entry.completed++;
    staffMap.set(r.assigned_to, entry);
  }

  const staffWorkload = Array.from(staffMap.values())
    .map((s) => ({
      staff_name: s.name,
      role: s.role,
      tasks_assigned: s.assigned,
      tasks_completed: s.completed,
    }))
    .sort((a, b) => b.tasks_assigned - a.tasks_assigned);

  return {
    housekeeping: {
      total_tasks: hkTotal,
      completed: hkCompleted,
      avg_completion_minutes: avgMinutes,
      by_type: hkByType,
      by_status: hkByStatus,
    },
    maintenance: {
      opened: mxOpened,
      resolved: mxResolved,
      by_category: mxByCat,
      by_priority: mxByPri,
      avg_resolution_hours: avgResHours,
      total_cost: round2(mxTotalCost),
    },
    staff_workload: staffWorkload,
  };
}

// ─── Financial Report ────────────────────────────────────────────────

export async function getFinancialSummary(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<FinancialReport> {
  // Revenue from bookings (overlapping: active during period)
  const { data: bookings } = await supabase
    .from("bookings")
    .select("total_amount_gbp, channel")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("check_in", dateTo)
    .gte("check_out", dateFrom);

  const totalRevenue = (bookings || []).reduce((s, b) => s + (b.total_amount_gbp || 0), 0);

  // Expenses
  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount_gbp, category")
    .gte("expense_date", dateFrom)
    .lte("expense_date", dateTo);

  const totalExpenses = (expenses || []).reduce((s, e) => s + (e.amount_gbp || 0), 0);
  const grossProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;

  // Revenue breakdown by channel
  const channelRevMap = new Map<string, number>();
  for (const b of bookings || []) {
    const ch = b.channel || "direct";
    channelRevMap.set(ch, (channelRevMap.get(ch) || 0) + (b.total_amount_gbp || 0));
  }
  const revenueBreakdown = Array.from(channelRevMap.entries())
    .map(([source, amount]) => ({ source, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Expense breakdown by category
  const expCatMap = new Map<string, number>();
  for (const e of expenses || []) {
    expCatMap.set(e.category || "other", (expCatMap.get(e.category || "other") || 0) + (e.amount_gbp || 0));
  }
  const expenseBreakdown = Array.from(expCatMap.entries())
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Outstanding invoices
  const { data: outstandingInv } = await supabase
    .from("invoices")
    .select("total_amount_gbp")
    .in("status", ["sent", "partially_paid", "overdue"]);

  const outstandingCount = (outstandingInv || []).length;
  const outstandingValue = (outstandingInv || []).reduce((s, i) => s + (i.total_amount_gbp || 0), 0);

  // Cash flow
  const { data: payments } = await supabase
    .from("payments")
    .select("amount_gbp")
    .gte("payment_date", dateFrom)
    .lte("payment_date", dateTo);

  const paymentsReceived = (payments || []).reduce((s, p) => s + (p.amount_gbp || 0), 0);

  return {
    total_revenue: round2(totalRevenue),
    total_expenses: round2(totalExpenses),
    gross_profit: round2(grossProfit),
    profit_margin: profitMargin,
    revenue_breakdown: revenueBreakdown,
    expense_breakdown: expenseBreakdown,
    outstanding_invoices: { count: outstandingCount, value: round2(outstandingValue) },
    cash_flow: {
      payments_received: round2(paymentsReceived),
      expenses_paid: round2(totalExpenses),
      net: round2(paymentsReceived - totalExpenses),
    },
  };
}

// ─── Executive Summary ───────────────────────────────────────────────

export async function getExecutiveSummary(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<ExecutiveSummary> {
  const [occupancy, revenue, financial] = await Promise.all([
    getOccupancyReport(supabase, dateFrom, dateTo),
    getRevenueReport(supabase, dateFrom, dateTo),
    getFinancialSummary(supabase, dateFrom, dateTo),
  ]);

  const highlights: string[] = [];
  const concerns: string[] = [];

  // Generate highlights
  if (revenue.change_pct > 0) {
    highlights.push(`Revenue up ${revenue.change_pct}% compared to previous period`);
  }
  if (occupancy.average_occupancy >= 80) {
    highlights.push(`Strong occupancy at ${occupancy.average_occupancy}%`);
  }
  if (financial.profit_margin > 40) {
    highlights.push(`Healthy profit margin of ${financial.profit_margin}%`);
  }
  if (revenue.by_channel.find((c) => c.channel === "direct" && c.bookings > 0)) {
    const directPct = round2(
      ((revenue.by_channel.find((c) => c.channel === "direct")?.revenue || 0) / (revenue.total_revenue || 1)) * 100
    );
    if (directPct > 30) {
      highlights.push(`Direct bookings at ${directPct}% — reducing commission costs`);
    }
  }

  // Generate concerns
  if (occupancy.average_occupancy < 60) {
    concerns.push(`Occupancy below target at ${occupancy.average_occupancy}%`);
  }
  if (revenue.change_pct < -5) {
    concerns.push(`Revenue declined ${Math.abs(revenue.change_pct)}% vs previous period`);
  }
  if (financial.profit_margin < 20) {
    concerns.push(`Profit margin of ${financial.profit_margin}% is below target`);
  }
  if (financial.outstanding_invoices.count > 10) {
    concerns.push(`${financial.outstanding_invoices.count} outstanding invoices totalling ${financial.outstanding_invoices.value}`);
  }

  // Check for floors with low occupancy
  for (const f of occupancy.by_floor) {
    if (f.occupancy < 50) {
      concerns.push(`${f.floor_label} occupancy is low at ${f.occupancy}%`);
    }
  }

  if (highlights.length === 0) {
    highlights.push("Operations running within normal parameters");
  }

  return {
    occupancy_pct: occupancy.average_occupancy,
    revenue: revenue.total_revenue,
    adr: revenue.adr,
    revpar: revenue.revpar,
    profit_margin: financial.profit_margin,
    guest_satisfaction: 0, // Placeholder — no satisfaction table yet
    highlights,
    concerns,
    period: { from: dateFrom, to: dateTo },
  };
}
