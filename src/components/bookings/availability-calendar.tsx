"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface CalendarCell {
  date: string;
  status: string;
  booking_id?: string;
  reference?: string;
  guest_name?: string | null;
  reason?: string;
}

interface CalendarRow {
  apartment: {
    id: string;
    number: string;
    building?: { name: string; code: string } | null;
    apartment_type?: { name: string } | null;
  };
  cells: CalendarCell[];
}

interface CalendarData {
  dates: string[];
  grid: CalendarRow[];
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-status-success/20",
  pending: "bg-status-warning/30",
  confirmed: "bg-status-info/30",
  checked_in: "bg-bastet-gold/30",
  blocked: "bg-status-error/20",
};

export function AvailabilityCalendar() {
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [days] = useState(14);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/availability?start_date=${startDate}&days=${days}`
      );
      const json = await res.json();
      setData(json.data);
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [startDate, days]);

  const shiftDates = (direction: number) => {
    const newDate =
      direction > 0
        ? addDays(new Date(startDate), 7)
        : subDays(new Date(startDate), 7);
    setStartDate(format(newDate, "yyyy-MM-dd"));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          Availability Calendar
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => shiftDates(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-text-secondary font-mono">
            {startDate && format(new Date(startDate), "dd MMM")} —{" "}
            {startDate && format(addDays(new Date(startDate), days - 1), "dd MMM yyyy")}
          </span>
          <Button size="sm" variant="ghost" onClick={() => shiftDates(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStartDate(format(new Date(), "yyyy-MM-dd"))}
          >
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-12 text-sm text-text-muted">
            Failed to load calendar data
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-bastet-border">
                <th className="sticky left-0 bg-bastet-card z-10 text-left px-3 py-2 text-text-muted font-medium min-w-[120px]">
                  Apartment
                </th>
                {data.dates.map((date) => {
                  const d = new Date(date);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th
                      key={date}
                      className={cn(
                        "px-1 py-2 text-center font-medium min-w-[44px]",
                        isWeekend ? "text-bastet-gold" : "text-text-muted"
                      )}
                    >
                      <div>{format(d, "EEE")}</div>
                      <div className="font-mono">{format(d, "dd")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.grid.map((row) => (
                <tr
                  key={row.apartment.id}
                  className="border-b border-bastet-border/50 hover:bg-bastet-bg/30"
                >
                  <td className="sticky left-0 bg-bastet-card z-10 px-3 py-1.5">
                    <div className="font-mono font-semibold text-bastet-gold">
                      {row.apartment.number}
                    </div>
                    <div className="text-text-muted text-[10px]">
                      {row.apartment.apartment_type?.name}
                    </div>
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.date} className="px-0.5 py-1">
                      <div
                        className={cn(
                          "h-8 rounded flex items-center justify-center cursor-default",
                          STATUS_COLORS[cell.status] || "bg-bastet-bg/50"
                        )}
                        title={
                          cell.guest_name
                            ? `${cell.reference} — ${cell.guest_name}`
                            : cell.reason || cell.status
                        }
                      >
                        {cell.status !== "available" && (
                          <span className="truncate px-1 text-[10px]">
                            {cell.reference?.slice(-4) || cell.status[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Legend */}
        <div className="px-4 py-3 border-t border-bastet-border flex flex-wrap gap-4">
          {[
            { label: "Available", color: "bg-status-success/20" },
            { label: "Pending", color: "bg-status-warning/30" },
            { label: "Confirmed", color: "bg-status-info/30" },
            { label: "Checked In", color: "bg-bastet-gold/30" },
            { label: "Blocked", color: "bg-status-error/20" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("w-3 h-3 rounded", color)} />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
