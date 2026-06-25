// ─── CSV Export Utilities ─────────────────────────────────────────────

/**
 * Convert an array of flat objects to CSV string and trigger browser download.
 */
export function toCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [headers.join(",")];

  for (const row of data) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Helper to narrow an unknown value to a record array. */
function asRowArray(val: unknown): Record<string, unknown>[] {
  return Array.isArray(val) ? val as Record<string, unknown>[] : [];
}

/** Helper to narrow an unknown value to a record. */
function asRow(val: unknown): Record<string, unknown> {
  return (val && typeof val === "object") ? val as Record<string, unknown> : {};
}

/**
 * Flatten nested report data into flat rows suitable for CSV export.
 */
export function formatReportData(
  reportType: string,
  data: Record<string, unknown>
): Record<string, unknown>[] {
  switch (reportType) {
    case "occupancy": {
      const daily = asRowArray(data.daily);
      return daily.map((d) => ({
        Date: d.date,
        "Occupancy %": d.occupancy,
        "Occupied Units": d.occupied,
        "Total Units": d.total,
      }));
    }

    case "revenue": {
      const daily = asRowArray(data.daily);
      if (daily.length > 0) {
        return daily.map((d) => ({
          Date: d.date,
          Revenue: d.revenue,
        }));
      }
      // Fallback: channel breakdown
      const byChannel = asRowArray(data.by_channel);
      return byChannel.map((c) => ({
        Channel: c.channel,
        Revenue: c.revenue,
        Commission: c.commission,
        "Net Revenue": c.net_revenue,
        Bookings: c.bookings,
      }));
    }

    case "guests": {
      const byNationality = asRowArray(data.by_nationality);
      return byNationality.map((n) => ({
        Nationality: n.nationality,
        "Guest Count": n.count,
      }));
    }

    case "operations": {
      const rows: Record<string, unknown>[] = [];

      // Housekeeping by type
      const hk = asRow(data.housekeeping);
      for (const t of asRowArray(hk.by_type)) {
        rows.push({ Department: "Housekeeping", Category: t.type, Count: t.count });
      }

      // Maintenance by category
      const mx = asRow(data.maintenance);
      for (const c of asRowArray(mx.by_category)) {
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

      for (const e of asRowArray(data.expense_breakdown)) {
        rows.push({ Item: `Expense: ${e.category}`, Amount: e.amount });
      }

      for (const r of asRowArray(data.revenue_breakdown)) {
        rows.push({ Item: `Revenue: ${r.source}`, Amount: r.amount });
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
      const floors = asRowArray(data.by_floor).length > 0 ? asRowArray(data.by_floor) : asRowArray(data.floors);
      if (floors.length > 0) {
        return floors.map((f) => ({
          Floor: f.floor_label || f.building_name || `Floor ${f.floor}`,
          "Consumption (kWh)": f.consumption_kwh || 0,
          "Waste (kWh)": f.waste_kwh || 0,
          "Savings Potential": f.savings_potential_gbp || 0,
          "Occupied Units": f.occupied_units || 0,
          "Total Units": f.total_units || 0,
        }));
      }
      return [];
    }

    case "ai_decisions": {
      const decisions = asRowArray(data.decisions).length > 0 ? asRowArray(data.decisions) : asRowArray(data.recent_decisions);
      if (decisions.length > 0) {
        return decisions.map((d) => ({
          Decision: d.title || d.description || "—",
          Type: d.type || d.category || "—",
          Confidence: d.confidence ? `${(Number(d.confidence) * 100).toFixed(0)}%` : "—",
          Outcome: d.outcome || d.status || "—",
          Timestamp: d.timestamp || d.created_at || "—",
        }));
      }
      const cycles = asRowArray(data.cycles).length > 0 ? asRowArray(data.cycles) : asRowArray(data.brain_cycles);
      return cycles.map((c) => ({
        "Cycle ID": c.id || c.cycle_id || "—",
        Timestamp: c.timestamp || c.created_at || "—",
        "Duration (ms)": c.duration_ms || "—",
        Decisions: c.decisions_count || c.decisions || 0,
        Status: c.status || c.outcome || "completed",
      }));
    }

    default:
      return [];
  }
}
