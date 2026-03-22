import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getOccupancyReport,
  getRevenueReport,
  getGuestReport,
  getOperationsReport,
  getFinancialSummary,
  getExecutiveSummary,
} from "@/lib/reports-engine";

const REPORT_TYPES = ["occupancy", "revenue", "guests", "operations", "financial", "executive", "energy", "ai_decisions"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

function flattenForCSV(reportType: string, data: Record<string, unknown>): Record<string, unknown>[] {
  switch (reportType) {
    case "occupancy": {
      const daily = (data.daily as any[]) || [];
      return daily.map((d) => ({
        Date: d.date,
        "Occupancy %": d.occupancy,
        "Occupied Units": d.occupied,
        "Total Units": d.total,
      }));
    }
    case "revenue": {
      const daily = (data.daily as any[]) || [];
      if (daily.length > 0) {
        return daily.map((d) => ({ Date: d.date, Revenue: d.revenue }));
      }
      const byChannel = (data.by_channel as any[]) || [];
      return byChannel.map((c) => ({
        Channel: c.channel,
        Revenue: c.revenue,
        Commission: c.commission,
        "Net Revenue": c.net_revenue,
        Bookings: c.bookings,
      }));
    }
    case "guests": {
      const byNationality = (data.by_nationality as any[]) || [];
      return byNationality.map((n) => ({ Nationality: n.nationality, Count: n.count }));
    }
    case "operations": {
      const rows: Record<string, unknown>[] = [];
      const hk = (data.housekeeping as any) || {};
      for (const t of (hk.by_type as any[]) || []) {
        rows.push({ Department: "Housekeeping", Category: t.type, Count: t.count });
      }
      const mx = (data.maintenance as any) || {};
      for (const c of (mx.by_category as any[]) || []) {
        rows.push({ Department: "Maintenance", Category: c.category, Count: c.count });
      }
      return rows;
    }
    case "financial": {
      const rows: Record<string, unknown>[] = [];
      rows.push({ Item: "Total Revenue", Amount: data.total_revenue });
      rows.push({ Item: "Total Expenses", Amount: data.total_expenses });
      rows.push({ Item: "Gross Profit", Amount: data.gross_profit });
      rows.push({ Item: "Profit Margin %", Amount: data.profit_margin });
      for (const e of (data.expense_breakdown as any[]) || []) {
        rows.push({ Item: `Expense: ${e.category}`, Amount: e.amount });
      }
      return rows;
    }
    case "executive": {
      return [
        { Metric: "Occupancy %", Value: data.occupancy_pct },
        { Metric: "Revenue", Value: data.revenue },
        { Metric: "ADR", Value: data.adr },
        { Metric: "RevPAR", Value: data.revpar },
        { Metric: "Profit Margin %", Value: data.profit_margin },
      ];
    }
    case "energy": {
      const byZone = (data.by_zone as any[]) || [];
      return byZone.map((z) => ({
        Zone: z.zone,
        "Total kWh": z.total_kwh,
        "Total Cost": z.total_cost,
        Readings: z.readings,
      }));
    }
    case "ai_decisions": {
      const decisions = (data.decisions as any[]) || [];
      return decisions.map((d) => ({
        "Cycle ID": d.cycle_id,
        Category: d.category,
        Action: d.action,
        Confidence: d.confidence,
        Executed: d.executed,
        "Created At": d.created_at,
      }));
    }
    default:
      return [];
  }
}

function toCSVString(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const vals = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.error!;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as ReportType | null;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const format = searchParams.get("format");

    if (!type || !REPORT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid report type. Must be one of: ${REPORT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!from || !to || !isValidDate(from) || !isValidDate(to)) {
      return NextResponse.json(
        { error: "Invalid date range. Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 400 }
      );
    }

    if (from > to) {
      return NextResponse.json(
        { error: "from date must be before to date" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    let data: Record<string, unknown>;

    switch (type) {
      case "occupancy":
        data = await getOccupancyReport(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "revenue":
        data = await getRevenueReport(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "guests":
        data = await getGuestReport(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "operations":
        data = await getOperationsReport(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "financial":
        data = await getFinancialSummary(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "executive":
        data = await getExecutiveSummary(supabase, from, to) as unknown as Record<string, unknown>;
        break;
      case "energy": {
        const { data: readings } = await supabase
          .from("energy_readings")
          .select("zone, kwh, cost_gbp, recorded_at")
          .gte("recorded_at", from)
          .lte("recorded_at", to + "T23:59:59");

        const zoneMap = new Map<string, { total_kwh: number; total_cost: number; readings: number }>();
        for (const r of readings || []) {
          const zone = r.zone || "unknown";
          const entry = zoneMap.get(zone) || { total_kwh: 0, total_cost: 0, readings: 0 };
          entry.total_kwh += r.kwh || 0;
          entry.total_cost += r.cost_gbp || 0;
          entry.readings++;
          zoneMap.set(zone, entry);
        }
        const byZone = Array.from(zoneMap.entries()).map(([zone, d]) => ({
          zone,
          total_kwh: Math.round(d.total_kwh * 100) / 100,
          total_cost: Math.round(d.total_cost * 100) / 100,
          readings: d.readings,
        })).sort((a, b) => b.total_kwh - a.total_kwh);

        const totalKwh = byZone.reduce((s, z) => s + z.total_kwh, 0);
        const totalCost = byZone.reduce((s, z) => s + z.total_cost, 0);
        data = { total_kwh: Math.round(totalKwh * 100) / 100, total_cost: Math.round(totalCost * 100) / 100, by_zone: byZone } as unknown as Record<string, unknown>;
        break;
      }
      case "ai_decisions": {
        const { data: decisions } = await supabase
          .from("brain_decisions")
          .select("cycle_id, category, action, confidence, executed, created_at")
          .gte("created_at", from)
          .lte("created_at", to + "T23:59:59")
          .order("created_at", { ascending: false })
          .limit(200);

        const rows = (decisions || []).map((d) => ({
          cycle_id: d.cycle_id,
          category: d.category,
          action: d.action,
          confidence: d.confidence,
          executed: d.executed,
          created_at: d.created_at,
        }));

        const categoryMap = new Map<string, number>();
        for (const d of rows) {
          categoryMap.set(d.category || "unknown", (categoryMap.get(d.category || "unknown") || 0) + 1);
        }
        const byCategory = Array.from(categoryMap.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count);

        const executedCount = rows.filter((d) => d.executed).length;
        data = { total: rows.length, executed: executedCount, by_category: byCategory, decisions: rows } as unknown as Record<string, unknown>;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }

    // CSV format
    if (format === "csv") {
      const rows = flattenForCSV(type, data);
      const csv = toCSVString(rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${type}-report-${from}-to-${to}.csv"`,
        },
      });
    }

    return NextResponse.json({ data, meta: { type, from, to } });
  } catch (err) {
    console.error("Reports API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
