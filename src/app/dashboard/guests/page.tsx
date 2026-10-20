"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/hooks/use-api";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Eye,
  Search,
  Filter,
  Loader2,
  Star,
  Users,
  UserPlus,
  Repeat,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Guest, LoyaltyTier } from "@/types";
import type { RechartsValue } from "@/types/recharts";
import { darkTooltipProps } from "@/lib/chart-styles";

const ACCENT = "#22D3EE";
const TIER_PIE_COLORS = ["#F97316", "#94A3B8", "#FBBF24", "#A78BFA"];
const NAT_BAR_COLORS = ["#22D3EE", "#34D399", "#FBBF24", "#A78BFA", "#F97316", "#F472B6", "#818CF8", "#6EE7B7"];


const TIER_COLORS: Record<LoyaltyTier, string> = {
  bronze: "bg-orange-900/20 text-orange-400",
  silver: "bg-gray-400/20 text-gray-300",
  gold: "bg-brand-accent-muted text-brand-accent",
  platinum: "bg-purple-400/20 text-purple-300",
};

interface GuestIntelligence {
  [guestId: string]: {
    churn_risk?: number;
    ltv_gbp?: number;
    last_checkout?: string;
  };
}

export default function GuestsPage() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [vipOnly, setVipOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tierFilter !== "all") params.set("tier", tierFilter);
    if (vipOnly) params.set("vip", "true");
    return params.toString();
  }, [debouncedSearch, tierFilter, vipOnly]);

  const { data: guestRows, isLoading: loading } = useApi<Guest[]>(`/api/v1/guests?${query}`, undefined, ["guests"]);
  const guests = useMemo(() => guestRows ?? [], [guestRows]);
  const { data: aiGuests } = useApi<Record<string, unknown>>("/api/v1/ai/guests", { refreshInterval: 60_000 });
  const { data: checkedOutRows } = useApi<Array<{ guest_id?: string | null; check_out?: string | null }>>("/api/v1/bookings?status=checked_out&limit=1000", undefined, ["bookings"]);

  const intelligence = useMemo<GuestIntelligence>(() => {
    const intel: GuestIntelligence = {};
    const ai = aiGuests ?? {};
    const guestIntel = (ai.guests || ai.guest_intelligence || []) as Array<Record<string, unknown>>;
    if (Array.isArray(guestIntel)) {
      for (const gi of guestIntel) {
        const id = String(gi.guest_id ?? gi.id ?? "");
        if (!id) continue;
        intel[id] = {
          churn_risk: (gi.churn_risk ?? gi.churn_score) as number | undefined,
          ltv_gbp: (gi.ltv_gbp ?? gi.lifetime_value) as number | undefined,
          last_checkout: (gi.last_checkout ?? gi.last_stay) as string | undefined,
        };
      }
    }
    // Most recent checkout per guest when the AI endpoint does not provide it
    for (const b of checkedOutRows ?? []) {
      if (b.guest_id && b.check_out) {
        const existing = intel[b.guest_id]?.last_checkout;
        if (!existing || b.check_out > existing) intel[b.guest_id] = { ...intel[b.guest_id], last_checkout: b.check_out };
      }
    }
    return intel;
  }, [aiGuests, checkedOutRows]);

  const tiers: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

  /* ---------- Chart data ---------- */
  const statCards = useMemo(() => {
    const total = guests.length;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = guests.filter((g) => g.created_at >= monthStart).length;
    const returning = guests.filter((g) => g.total_stays > 1).length;
    const avgRating = 0; // no per-guest rating field; placeholder
    return { total, newThisMonth, returning, avgRating };
  }, [guests]);

  const tierChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of guests) {
      const t = g.loyalty_tier || "bronze";
      counts[t] = (counts[t] || 0) + 1;
    }
    return tiers
      .map((t) => ({ name: t.charAt(0).toUpperCase() + t.slice(1), value: counts[t] || 0 }))
      .filter((d) => d.value > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is recreated each render; depending on it would refetch in a loop
  }, [guests]);

  const nationalityChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of guests) {
      const nat = g.nationality || g.country || "Unknown";
      counts[nat] = (counts[nat] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [guests]);

  const churnBar = (risk?: number) => {
    if (risk == null) return <span className="text-xs text-text-muted">—</span>;
    const pct = Math.min(100, Math.max(0, risk));
    let color = "bg-status-success";
    if (pct >= 60) color = "bg-status-error";
    else if (pct >= 30) color = "bg-status-warning";
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-brand-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-mono text-text-secondary">{pct}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">
            Guests
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {guests.length} guests found
          </p>
        </div>
        <Link href="/dashboard/guests/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Guest
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      {!loading && guests.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Guests", value: statCards.total, icon: Users, color: ACCENT },
            { label: "New This Month", value: statCards.newThisMonth, icon: UserPlus, color: "#34D399" },
            { label: "Returning", value: statCards.returning, icon: Repeat, color: "#FBBF24" },
            { label: "VIP Guests", value: guests.filter((g) => g.vip_status).length, icon: Star, color: "#A78BFA" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <s.icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-xs text-text-muted">{s.label}</p>
                  <p className="text-xl font-bold text-text-primary">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      {!loading && guests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Nationalities */}
          {nationalityChartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Top Nationalities</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={nationalityChartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...darkTooltipProps} formatter={(v: RechartsValue) => [`${v} guests`, "Count"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                      {nationalityChartData.map((_, i) => (
                        <Cell key={i} fill={NAT_BAR_COLORS[i % NAT_BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Loyalty Tier Donut */}
          {tierChartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Guests by Loyalty Tier</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={tierChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {tierChartData.map((_, i) => (
                        <Cell key={i} fill={TIER_PIE_COLORS[i % TIER_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...darkTooltipProps} formatter={(v: RechartsValue) => [`${v} guests`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {tierChartData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_PIE_COLORS[i % TIER_PIE_COLORS.length] }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
          />
        </div>
        <button
          onClick={() => setVipOnly(!vipOnly)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-colors ${
            vipOnly
              ? "bg-brand-accent text-brand-bg"
              : "bg-brand-card border border-brand-border text-text-secondary hover:text-text-primary"
          }`}
        >
          <Star className="w-3 h-3" />
          VIP Only
        </button>
      </div>

      {/* Tier Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTierFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            tierFilter === "all"
              ? "bg-brand-accent text-brand-bg"
              : "bg-brand-card border border-brand-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All Tiers
        </button>
        {tiers.map((tier) => (
          <button
            key={tier}
            onClick={() => setTierFilter(tier)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              tierFilter === tier
                ? "bg-brand-accent text-brand-bg"
                : "bg-brand-card border border-brand-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {tier}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Tier</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Points</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Stays</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Total Spend</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">VIP</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">Churn Risk</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden md:table-cell">LTV</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3 hidden lg:table-cell">Last Stay</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => {
                  const gi = intelligence[guest.id];
                  return (
                    <tr
                      key={guest.id}
                      className="border-b border-brand-border last:border-0 hover:bg-brand-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="text-sm font-semibold text-text-primary">
                          {guest.first_name} {guest.last_name}
                        </span>
                        {guest.nationality && (
                          <span className="ml-1.5 text-xs text-text-muted">
                            {guest.nationality}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {guest.email || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIER_COLORS[guest.loyalty_tier]}`}
                        >
                          {guest.loyalty_tier}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {guest.loyalty_points.toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {guest.total_stays}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-primary">
                        {formatCurrency(guest.total_spend_gbp)}
                      </td>
                      <td className="px-6 py-3">
                        {guest.vip_status && (
                          <Star className="w-4 h-4 text-brand-accent fill-brand-accent" />
                        )}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        {churnBar(gi?.churn_risk)}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        <span className="text-sm font-mono text-text-primary">
                          {gi?.ltv_gbp != null ? formatCurrency(gi.ltv_gbp) : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 hidden lg:table-cell">
                        <span className="text-sm text-text-secondary">
                          {gi?.last_checkout ? formatDate(gi.last_checkout) : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/guests/${guest.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-brand-accent transition-colors"
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
          {!loading && guests.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">
                No guests match the current filters
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
