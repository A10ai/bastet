"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import type { ProofMetrics } from "@/lib/sales-ops";
import { Kpi, pct, gbp, btn, postJson } from "./shared";

interface ReportResponse { metrics: ProofMetrics; previous: ProofMetrics | null; narrative: string; snapshots: { id: string; period_start: string; period_end: string; narrative: string | null; metrics: ProofMetrics }[] }

/** The weekly proof: the numbers Bastet shows tour operators when they come to contract. */
export function OverviewTab() {
  const { data, isLoading, mutate } = useApi<ReportResponse>("/api/v1/sales/report", undefined, ["bookings", "reviews"]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (isLoading && !data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></div>;
  if (!data) return <p className="text-sm text-text-muted">No data.</p>;
  const m = data.metrics;
  const snapshot = async () => {
    setBusy(true); setMsg("");
    try { const r = await postJson<{ created: boolean; metrics: ProofMetrics }>("/api/v1/sales/report", { action: "snapshot" }); setMsg(r.created ? "Last week's report stored." : "Last week's report already existed."); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-6" data-testid="sales-overview">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Occupancy" value={pct(m.occupancy)} hint={`${m.room_nights} of ${m.available_room_nights} room nights`} />
        <Kpi label="ADR" value={gbp(m.adr_gbp)} hint={data.previous ? `prev ${gbp(data.previous.adr_gbp)}` : undefined} />
        <Kpi label="RevPAR" value={gbp(m.revpar_gbp)} hint={data.previous ? `prev ${gbp(data.previous.revpar_gbp)}` : undefined} />
        <Kpi label="Direct share" value={pct(m.direct_share)} hint={`online ${pct(m.online_share)}`} />
        <Kpi label="Pickup" value={`${m.pickup.bookings}`} hint={`${m.pickup.room_nights} nights · ${gbp(m.pickup.revenue_gbp)}`} />
        <Kpi label="Cancellations" value={m.cancellations} />
        <Kpi label="Reviews" value={m.reviews_all_time.avg_rating ?? "–"} hint={`${m.reviews_all_time.count} total · ${m.reviews.new} new · ${m.reviews.unanswered} unanswered`} />
        <Kpi label="Concierge" value={m.concierge.sessions} hint={`${m.concierge.bookings} holds from chat`} />
      </div>
      <Card>
        <CardHeader className="flex items-center justify-between"><h2 className="font-semibold">This week in words</h2><button className={btn} onClick={snapshot} disabled={busy}>{busy ? "Storing…" : "Store last week's report"}</button></CardHeader>
        <CardContent className="text-sm text-text-secondary space-y-2"><p data-testid="sales-narrative">{data.narrative}</p>{msg && <p className="text-xs text-text-muted">{msg}</p>}</CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><h2 className="font-semibold">Channels</h2></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-brand-border"><th className="px-4 py-2">Channel</th><th className="px-4 py-2 text-right">Nights</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Commission</th></tr></thead>
              <tbody>{m.channels.map((c) => <tr key={c.code} className="border-b border-brand-border/50"><td className="px-4 py-2">{c.name}</td><td className="px-4 py-2 text-right">{c.room_nights}</td><td className="px-4 py-2 text-right">{gbp(c.revenue_gbp)}</td><td className="px-4 py-2 text-right">{c.commission_rate ?? 0}%</td></tr>)}{m.channels.length === 0 && <tr><td className="px-4 py-6 text-text-muted" colSpan={4}>No stays in this period</td></tr>}</tbody></table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="font-semibold">Markets</h2></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-brand-border"><th className="px-4 py-2">Country</th><th className="px-4 py-2 text-right">Nights</th><th className="px-4 py-2 text-right">Revenue</th></tr></thead>
              <tbody>{m.markets.map((x) => <tr key={x.market} className="border-b border-brand-border/50"><td className="px-4 py-2">{x.market}</td><td className="px-4 py-2 text-right">{x.room_nights}</td><td className="px-4 py-2 text-right">{gbp(x.revenue_gbp)}</td></tr>)}{m.markets.length === 0 && <tr><td className="px-4 py-6 text-text-muted" colSpan={3}>No stays in this period</td></tr>}</tbody></table>
          </CardContent>
        </Card>
      </div>
      {data.snapshots.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-semibold">Stored weekly reports</h2></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-brand-border"><th className="px-4 py-2">Week</th><th className="px-4 py-2 text-right">Occ</th><th className="px-4 py-2 text-right">ADR</th><th className="px-4 py-2 text-right">RevPAR</th><th className="px-4 py-2 text-right">Direct</th><th className="px-4 py-2 text-right">Reviews</th></tr></thead>
              <tbody>{data.snapshots.map((s) => <tr key={s.id} className="border-b border-brand-border/50" title={s.narrative ?? ""}><td className="px-4 py-2">{s.period_start} → {s.period_end}</td><td className="px-4 py-2 text-right">{pct(s.metrics.occupancy)}</td><td className="px-4 py-2 text-right">{gbp(s.metrics.adr_gbp)}</td><td className="px-4 py-2 text-right">{gbp(s.metrics.revpar_gbp)}</td><td className="px-4 py-2 text-right">{pct(s.metrics.direct_share)}</td><td className="px-4 py-2 text-right">{s.metrics.reviews.avg_rating ?? "–"}</td></tr>)}</tbody></table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
