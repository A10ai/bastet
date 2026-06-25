"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarDays,
  Plus,
  Eye,
  Search,
  Filter,
  Loader2,
  Star,
  Wallet,
  TrendingUp,
  Globe,
} from "lucide-react";
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { BOOKING_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Booking } from "@/types";
import type { RechartsValue, RechartsName } from "@/types/recharts";

const CHANNEL_COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F97316", "#F472B6", "#818CF8"];

const darkTooltipStyle = {
  contentStyle: { background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, fontSize: 12, color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
};

const TIER_BADGE_COLORS: Record<string, string> = {
  bronze: "bg-orange-900/20 text-orange-400",
  silver: "bg-gray-400/20 text-gray-300",
  gold: "bg-bastet-gold-muted text-bastet-gold",
  platinum: "bg-purple-400/20 text-purple-300",
};

interface BookingMiniStats {
  total_revenue_month: number;
  avg_nightly_rate: number;
  direct_booking_pct: number;
}

interface GuestMeta {
  [guestId: string]: {
    loyalty_tier?: string;
    vip_status?: boolean;
  };
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [miniStats, setMiniStats] = useState<BookingMiniStats | null>(null);
  const [guestMeta, setGuestMeta] = useState<GuestMeta>({});

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/v1/bookings?${params}`);
      const json = await res.json();
      const data = json.data || [];
      setBookings(data);

      // Compute mini stats from bookings data
      computeMiniStats(data);
      // Fetch guest metadata for tier/VIP info
      fetchGuestMeta(data);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const computeMiniStats = (bks: Booking[]) => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const monthBookings = bks.filter(
        (b) => b.check_in >= monthStart && !["cancelled", "no_show"].includes(b.status)
      );
      const totalRevenue = monthBookings.reduce((sum, b) => sum + (b.total_amount_gbp || 0), 0);
      const totalNights = monthBookings.reduce((sum, b) => sum + (b.nights || 1), 0);
      const avgRate = totalNights > 0 ? totalRevenue / totalNights : 0;
      const directCount = monthBookings.filter(
        (b) => (b as unknown as Record<string, any>).channel === "direct" || (b as unknown as Record<string, any>).source === "direct"
      ).length;
      const directPct = monthBookings.length > 0
        ? Math.round((directCount / monthBookings.length) * 100)
        : 0;

      setMiniStats({
        total_revenue_month: totalRevenue,
        avg_nightly_rate: avgRate,
        direct_booking_pct: directPct,
      });
    } catch {
      // Non-critical
    }
  };

  const fetchGuestMeta = async (bks: Booking[]) => {
    try {
      const res = await fetch("/api/v1/guests?limit=1000");
      const json = await res.json();
      const guests = json.data || [];
      const meta: GuestMeta = {};
      for (const g of guests) {
        meta[g.id] = {
          loyalty_tier: g.loyalty_tier,
          vip_status: g.vip_status,
        };
      }
      setGuestMeta(meta);
    } catch { /* — */ }
  };

  useEffect(() => {
    fetchBookings();
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const statusCounts = BOOKING_STATUSES.reduce(
    (acc, s) => {
      acc[s] = bookings.filter((b) => b.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Bookings
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {bookings.length} bookings found
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/bookings/calendar">
            <Button variant="secondary">
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendar
            </Button>
          </Link>
          <Link href="/dashboard/bookings/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Booking
            </Button>
          </Link>
        </div>
      </div>

      {/* Mini Stat Cards */}
      {miniStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-bastet-gold/10">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase">Revenue This Month</p>
                  <p className="text-sm font-semibold font-mono text-text-primary">
                    {formatCurrency(miniStats.total_revenue_month)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-bastet-gold/10">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase">Avg Nightly Rate</p>
                  <p className="text-sm font-semibold font-mono text-text-primary">
                    {formatCurrency(miniStats.avg_nightly_rate)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-bastet-gold/10">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bastet-gold/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-bastet-gold" />
                </div>
                <div>
                  <p className="text-[10px] text-text-muted uppercase">Direct Booking %</p>
                  <p className="text-sm font-semibold font-mono text-text-primary">
                    {miniStats.direct_booking_pct}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {bookings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Channel Donut */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">Bookings by Channel</h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const channelMap: Record<string, number> = {};
                bookings.forEach((b) => {
                  const ch = b.channel?.name || "Unknown";
                  channelMap[ch] = (channelMap[ch] || 0) + 1;
                });
                const channelData = Object.entries(channelMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
                return (
                  <div className="flex items-center justify-center gap-6">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={channelData}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                          paddingAngle={2} dataKey="value"
                        >
                          {channelData.map((_, i) => (
                            <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...darkTooltipStyle} formatter={(value: RechartsValue) => [value, "Bookings"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {channelData.map((ch, i) => (
                        <div key={ch.name} className="flex items-center gap-2 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                          <span className="text-text-secondary">{ch.name}</span>
                          <span className="font-mono text-text-muted ml-auto">{ch.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Bookings Trend */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-text-primary">Check-in Trend</h3>
            </CardHeader>
            <CardContent>
              {(() => {
                const dayMap: Record<string, number> = {};
                bookings.forEach((b) => {
                  if (b.check_in) {
                    const day = b.check_in.split("T")[0];
                    dayMap[day] = (dayMap[day] || 0) + 1;
                  }
                });
                const trendData = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({
                  date: date.slice(5),
                  bookings: count,
                }));
                return (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={trendData} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="bookingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...darkTooltipStyle} formatter={(value: RechartsValue) => [value, "Bookings"]} />
                      <Area type="monotone" dataKey="bookings" stroke="#22D3EE" strokeWidth={2} fill="url(#bookingGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search reference, guest..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40 text-sm"
        />
        <span className="text-text-muted text-sm">to</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40 text-sm"
        />
      </div>

      {/* Status Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({bookings.length})
        </button>
        {BOOKING_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === status
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Reference</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Guest</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Tier</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Apartment</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Check-in</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Check-out</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Nights</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const gm = booking.guest_id ? guestMeta[booking.guest_id] : undefined;
                  return (
                    <tr
                      key={booking.id}
                      className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="text-sm font-mono font-semibold text-bastet-gold">
                          {booking.reference}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text-primary">
                        <div className="flex items-center gap-1.5">
                          {gm?.vip_status && (
                            <Star className="w-3.5 h-3.5 text-bastet-gold fill-bastet-gold flex-shrink-0" />
                          )}
                          <span>
                            {booking.guest
                              ? `${booking.guest.first_name} ${booking.guest.last_name}`
                              : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {gm?.loyalty_tier ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${TIER_BADGE_COLORS[gm.loyalty_tier] || "bg-bastet-bg text-text-muted"}`}
                          >
                            {gm.loyalty_tier}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary font-mono">
                        {booking.apartment?.number || "—"}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {formatDate(booking.check_in)}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {formatDate(booking.check_out)}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {booking.nights}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-primary">
                        {formatCurrency(booking.total_amount_gbp)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge status={booking.status} variant="status" />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/bookings/${booking.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
          {!loading && bookings.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">
                No bookings match the current filters
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
