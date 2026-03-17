"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  List,
  Building2,
  BedDouble,
  LogIn,
  LogOut,
  Home,
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  parseISO,
  isToday,
  isWeekend,
  differenceInDays,
  isBefore,
  isAfter,
} from "date-fns";
import { cn } from "@/lib/utils";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
interface CalendarBooking {
  id: string;
  reference: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status: string;
}

interface CalendarApartment {
  id: string;
  number: string;
  floor: number;
  building_code: string;
  type_name: string;
  type_slug: string;
  status: string;
  bookings: CalendarBooking[];
}

const floorLabel = (floor: number) => floor === 0 ? 'Ground' : `Floor ${floor}`;

interface BuildingOption {
  id: string;
  code: string;
  name: string;
}

interface TypeOption {
  id: string;
  name: string;
  slug: string;
}

interface CalendarData {
  apartments: CalendarApartment[];
  buildings: BuildingOption[];
  apartment_types: TypeOption[];
  date_range: { from: string; to: string };
}

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------
const BOOKING_BAR_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  confirmed: {
    bg: "bg-cyan-500/25",
    border: "border-cyan-500/50",
    text: "text-cyan-300",
  },
  checked_in: {
    bg: "bg-emerald-500/25",
    border: "border-emerald-500/50",
    text: "text-emerald-300",
  },
  pending: {
    bg: "bg-amber-500/25",
    border: "border-amber-500/50",
    text: "text-amber-300",
  },
  checked_out: {
    bg: "bg-slate-500/20",
    border: "border-slate-500/40",
    text: "text-slate-400",
  },
};

const DEFAULT_BAR = {
  bg: "bg-slate-500/15",
  border: "border-slate-500/30",
  text: "text-slate-400",
};

const DESKTOP_DAYS = 14;
const MOBILE_DAYS = 7;
const COL_WIDTH = 56; // px per day column
const APT_COL_WIDTH = 100; // px for apartment label column
const ROW_HEIGHT = 40; // px per apartment row
const BAR_HEIGHT = 26; // px for booking bar
const BUILDING_HEADER_HEIGHT = 32; // px for building group header

// -------------------------------------------------------------------
// Helper: get date array
// -------------------------------------------------------------------
function getDateArray(from: string, numDays: number): Date[] {
  const start = parseISO(from);
  return Array.from({ length: numDays }, (_, i) => addDays(start, i));
}

// -------------------------------------------------------------------
// Tooltip component
// -------------------------------------------------------------------
function BookingTooltip({
  booking,
  style,
}: {
  booking: CalendarBooking;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="absolute z-50 bg-navy-900 border border-bastet-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style={style}
    >
      <div className="font-semibold text-text-primary">{booking.guest_name}</div>
      <div className="text-text-secondary mt-0.5">
        {format(parseISO(booking.check_in), "dd MMM")} &ndash;{" "}
        {format(parseISO(booking.check_out), "dd MMM yyyy")}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span
          className={cn(
            "inline-block w-2 h-2 rounded-full",
            BOOKING_BAR_COLORS[booking.status]?.bg || DEFAULT_BAR.bg
          )}
        />
        <span className="text-text-muted capitalize">
          {booking.status.replace("_", " ")}
        </span>
        <span className="text-text-muted ml-1 font-mono">{booking.reference}</span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Main Page
// -------------------------------------------------------------------
export default function AvailabilityCalendarPage() {
  const today = format(new Date(), "yyyy-MM-dd");

  // State
  const [startDate, setStartDate] = useState(today);
  const [numDays, setNumDays] = useState(DESKTOP_DAYS);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [hoveredBooking, setHoveredBooking] = useState<{
    booking: CalendarBooking;
    rect: DOMRect;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive day count
  useEffect(() => {
    const handleResize = () => {
      setNumDays(window.innerWidth < 768 ? MOBILE_DAYS : DESKTOP_DAYS);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch data
  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const endDate = format(addDays(parseISO(startDate), numDays), "yyyy-MM-dd");
      const params = new URLSearchParams({ from: startDate, to: endDate });
      if (typeFilter !== "all") params.set("type_id", typeFilter);

      const res = await fetch(`/api/v1/availability/calendar?${params}`);
      const json = await res.json();
      if (json.apartments) {
        setData(json);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, [startDate, numDays, typeFilter]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // Date array
  const dates = useMemo(
    () => getDateArray(startDate, numDays),
    [startDate, numDays]
  );

  // Group apartments by floor
  const groupedApartments = useMemo(() => {
    if (!data) return [];

    // Apply floor filter client-side
    const filteredApts = floorFilter === "all"
      ? data.apartments
      : data.apartments.filter((apt) => apt.floor === Number(floorFilter));

    const floorMap = new Map<
      number,
      { floor: number; label: string; apartments: CalendarApartment[] }
    >();

    for (const apt of filteredApts) {
      const f = apt.floor ?? 0;
      if (!floorMap.has(f)) {
        floorMap.set(f, {
          floor: f,
          label: floorLabel(f),
          apartments: [],
        });
      }
      floorMap.get(f)!.apartments.push(apt);
    }

    const groups: {
      floor: number;
      floor_label: string;
      apartments: CalendarApartment[];
    }[] = [];

    floorMap.forEach((group) => {
      groups.push({
        floor: group.floor,
        floor_label: group.label,
        apartments: group.apartments,
      });
    });

    return groups.sort((a, b) => a.floor - b.floor);
  }, [data, floorFilter]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!data) return { total: 0, available: 0, arriving: 0, departing: 0 };

    const todayStr = format(new Date(), "yyyy-MM-dd");
    let available = 0;
    let arriving = 0;
    let departing = 0;

    for (const apt of data.apartments) {
      const hasOccupancy = apt.bookings.some(
        (b) =>
          b.check_in <= todayStr &&
          b.check_out > todayStr &&
          (b.status === "confirmed" || b.status === "checked_in")
      );
      if (!hasOccupancy && apt.status !== "maintenance" && apt.status !== "out_of_service") {
        available++;
      }
      for (const b of apt.bookings) {
        if (b.check_in === todayStr && b.status !== "cancelled") arriving++;
        if (b.check_out === todayStr && b.status !== "cancelled") departing++;
      }
    }

    return {
      total: data.apartments.length,
      available,
      arriving,
      departing,
    };
  }, [data]);

  // Navigation
  const shiftDates = (direction: number) => {
    const current = parseISO(startDate);
    const shifted =
      direction > 0
        ? addDays(current, numDays)
        : subDays(current, numDays);
    setStartDate(format(shifted, "yyyy-MM-dd"));
  };

  const goToToday = () => {
    setStartDate(today);
  };

  // Booking bar positioning
  const getBarStyle = (
    booking: CalendarBooking,
    viewStart: Date,
    viewEnd: Date
  ): React.CSSProperties | null => {
    const checkIn = parseISO(booking.check_in);
    const checkOut = parseISO(booking.check_out);

    // Check if booking is visible in this range
    if (!isBefore(checkIn, viewEnd) || !isAfter(checkOut, viewStart)) {
      return null;
    }

    const barStart = isBefore(checkIn, viewStart) ? viewStart : checkIn;
    const barEnd = isAfter(checkOut, viewEnd) ? viewEnd : checkOut;

    const startCol = differenceInDays(barStart, viewStart);
    const endCol = differenceInDays(barEnd, viewStart);
    const span = endCol - startCol;

    if (span <= 0) return null;

    return {
      left: `${startCol * COL_WIDTH + 2}px`,
      width: `${span * COL_WIDTH - 4}px`,
      height: `${BAR_HEIGHT}px`,
      top: `${(ROW_HEIGHT - BAR_HEIGHT) / 2}px`,
    };
  };

  const viewStart = parseISO(startDate);
  const viewEnd = addDays(viewStart, numDays);

  // Date range display
  const rangeDisplay = `${format(viewStart, "dd MMM")} - ${format(
    addDays(viewStart, numDays - 1),
    "dd MMM yyyy"
  )}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Availability Calendar
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Visual overview of apartment bookings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/bookings">
            <Button variant="secondary" size="sm">
              <List className="w-4 h-4 mr-1.5" />
              List View
            </Button>
          </Link>
          <Link href="/dashboard/bookings/new">
            <Button size="sm">New Booking</Button>
          </Link>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Home className="w-4 h-4 text-cyan-400" />}
          label="Total Units"
          value={summaryStats.total}
        />
        <SummaryCard
          icon={<BedDouble className="w-4 h-4 text-emerald-400" />}
          label="Available Tonight"
          value={summaryStats.available}
          accent="emerald"
        />
        <SummaryCard
          icon={<LogIn className="w-4 h-4 text-amber-400" />}
          label="Arriving Today"
          value={summaryStats.arriving}
          accent="amber"
        />
        <SummaryCard
          icon={<LogOut className="w-4 h-4 text-slate-400" />}
          label="Departing Today"
          value={summaryStats.departing}
          accent="slate"
        />
      </div>

      {/* Date Navigation + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-bastet-card border border-bastet-border rounded-xl px-4 py-3">
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => shiftDates(-1)}
            aria-label={`Previous ${numDays} days`}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-text-primary font-medium min-w-[180px] text-center font-mono">
            {rangeDisplay}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => shiftDates(1)}
            aria-label={`Next ${numDays} days`}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="bg-bastet-bg border border-bastet-border rounded-lg text-xs text-text-primary px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
              aria-label="Filter by floor"
            >
              <option value="all">All Floors</option>
              <option value="0">Ground</option>
              <option value="1">Floor 1</option>
              <option value="2">Floor 2</option>
              <option value="3">Floor 3</option>
              <option value="4">Floor 4</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <BedDouble className="w-3.5 h-3.5 text-text-muted" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-bastet-bg border border-bastet-border rounded-lg text-xs text-text-primary px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
              aria-label="Filter by apartment type"
            >
              <option value="all">All Types</option>
              {data?.apartment_types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div
        ref={containerRef}
        className="relative bg-bastet-card border border-bastet-border rounded-xl overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
          </div>
        ) : !data || data.apartments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-muted">
            <CalendarDays className="w-8 h-8 mb-2" />
            <p className="text-sm">No apartments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto" ref={gridRef}>
            {/* Date Header Row */}
            <div className="flex border-b border-bastet-border sticky top-0 z-20 bg-bastet-card">
              {/* Apartment label column header */}
              <div
                className="sticky left-0 z-30 bg-bastet-card border-r border-bastet-border flex items-end px-3 py-2 shrink-0"
                style={{ width: `${APT_COL_WIDTH}px`, minWidth: `${APT_COL_WIDTH}px` }}
              >
                <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
                  Apt
                </span>
              </div>
              {/* Date columns */}
              {dates.map((date) => {
                const weekend = isWeekend(date);
                const todayCol = isToday(date);
                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      "shrink-0 flex flex-col items-center justify-end py-1.5 border-r border-bastet-border/50",
                      weekend && "bg-navy-800/40",
                      todayCol && "bg-cyan-400/10 border-x border-cyan-400/30"
                    )}
                    style={{ width: `${COL_WIDTH}px`, minWidth: `${COL_WIDTH}px` }}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase",
                        todayCol
                          ? "text-cyan-400"
                          : weekend
                            ? "text-text-muted"
                            : "text-text-secondary"
                      )}
                    >
                      {format(date, "EEE")}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-mono font-semibold",
                        todayCol
                          ? "text-cyan-400"
                          : weekend
                            ? "text-text-muted"
                            : "text-text-primary"
                      )}
                    >
                      {format(date, "dd")}
                    </span>
                    {todayCol && (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Apartment Rows grouped by floor */}
            {groupedApartments.map((group) => (
              <div key={group.floor}>
                {/* Floor header */}
                <div
                  className="flex items-center border-b border-bastet-border bg-navy-800/60"
                  style={{ height: `${BUILDING_HEADER_HEIGHT}px` }}
                >
                  <div
                    className="sticky left-0 z-20 bg-navy-800/60 px-3 flex items-center gap-2 h-full shrink-0"
                    style={{ width: `${APT_COL_WIDTH}px`, minWidth: `${APT_COL_WIDTH}px` }}
                  >
                    <Building2 className="w-3 h-3 text-cyan-400" />
                    <span className="text-xs font-bold text-text-primary">
                      {group.floor_label}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      ({group.apartments.length} units)
                    </span>
                  </div>
                  {/* Empty space for the date columns */}
                  <div
                    className="bg-navy-800/60 h-full shrink-0"
                    style={{
                      width: `${dates.length * COL_WIDTH}px`,
                      minWidth: `${dates.length * COL_WIDTH}px`,
                    }}
                  />
                </div>

                {/* Apartment rows */}
                {group.apartments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex border-b border-bastet-border/40 hover:bg-bastet-bg/20 transition-colors"
                    style={{ height: `${ROW_HEIGHT}px` }}
                  >
                    {/* Apartment label */}
                    <div
                      className="sticky left-0 z-10 bg-bastet-card border-r border-bastet-border flex items-center px-3 shrink-0"
                      style={{
                        width: `${APT_COL_WIDTH}px`,
                        minWidth: `${APT_COL_WIDTH}px`,
                      }}
                    >
                      <div className="truncate">
                        <span className="text-xs font-mono font-semibold text-cyan-300">
                          {apt.number}
                        </span>
                        <span className="text-[9px] text-text-muted ml-1.5 hidden sm:inline">
                          {apt.type_name}
                        </span>
                      </div>
                    </div>

                    {/* Grid cells with booking bars overlay */}
                    <div
                      className="relative shrink-0"
                      style={{
                        width: `${dates.length * COL_WIDTH}px`,
                        minWidth: `${dates.length * COL_WIDTH}px`,
                      }}
                    >
                      {/* Background cells (date columns) */}
                      <div className="absolute inset-0 flex">
                        {dates.map((date, idx) => {
                          const weekend = isWeekend(date);
                          const todayCol = isToday(date);
                          const dateStr = format(date, "yyyy-MM-dd");

                          // Determine if this cell is available (no booking on this date)
                          const isBooked = apt.bookings.some(
                            (b) => dateStr >= b.check_in && dateStr < b.check_out
                          );

                          return (
                            <div
                              key={date.toISOString()}
                              className={cn(
                                "h-full border-r border-bastet-border/30",
                                weekend && "bg-navy-800/30",
                                todayCol && "bg-cyan-400/5"
                              )}
                              style={{
                                width: `${COL_WIDTH}px`,
                                minWidth: `${COL_WIDTH}px`,
                              }}
                            >
                              {/* Clickable empty cell for creating new booking */}
                              {!isBooked && (
                                <Link
                                  href={`/dashboard/bookings/new?apartment_id=${apt.id}&check_in=${dateStr}`}
                                  className="block w-full h-full hover:bg-emerald-500/10 transition-colors"
                                  aria-label={`Book apartment ${apt.number} on ${format(date, "dd MMM yyyy")}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Booking bars */}
                      {apt.bookings.map((booking) => {
                        const barStyle = getBarStyle(booking, viewStart, viewEnd);
                        if (!barStyle) return null;

                        const colors =
                          BOOKING_BAR_COLORS[booking.status] || DEFAULT_BAR;

                        return (
                          <Link
                            key={booking.id}
                            href={`/dashboard/bookings/${booking.id}`}
                            className={cn(
                              "absolute rounded-md border flex items-center px-2 overflow-hidden cursor-pointer transition-all hover:brightness-125 hover:scale-y-110 z-[5]",
                              colors.bg,
                              colors.border
                            )}
                            style={barStyle}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredBooking({ booking, rect });
                            }}
                            onMouseLeave={() => setHoveredBooking(null)}
                            aria-label={`Booking ${booking.reference} - ${booking.guest_name}`}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-medium truncate",
                                colors.text
                              )}
                            >
                              {booking.guest_name}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Tooltip (rendered outside grid for proper positioning) */}
        {hoveredBooking && (
          <BookingTooltip
            booking={hoveredBooking.booking}
            style={{
              position: "fixed",
              left: `${hoveredBooking.rect.left}px`,
              top: `${hoveredBooking.rect.top - 80}px`,
              zIndex: 100,
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {[
          { label: "Confirmed", status: "confirmed" },
          { label: "Checked In", status: "checked_in" },
          { label: "Pending", status: "pending" },
          { label: "Checked Out", status: "checked_out" },
        ].map(({ label, status }) => {
          const colors = BOOKING_BAR_COLORS[status] || DEFAULT_BAR;
          return (
            <div key={status} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-5 h-3 rounded-sm border",
                  colors.bg,
                  colors.border
                )}
              />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-3 rounded-sm bg-bastet-bg border border-bastet-border/30" />
          <span className="text-xs text-text-muted">Available</span>
        </div>
        <div className="flex items-center gap-1.5 ml-2 text-[10px] text-text-muted">
          Click empty cell to create a booking
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Summary Card
// -------------------------------------------------------------------
function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "slate" | "cyan";
}) {
  return (
    <div className="bg-bastet-card border border-bastet-border rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-bastet-bg">{icon}</div>
      <div>
        <div className="text-lg font-bold font-mono text-text-primary">
          {value}
        </div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}
