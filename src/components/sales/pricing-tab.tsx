"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { gbp, btn, btnGhost, field, postJson } from "./shared";

interface Rec { id: string; stay_from: string; stay_to: string; current_rate_gbp: number; recommended_rate_gbp: number; change_percent: number; floor_gbp: number; ceiling_gbp: number; comp_median_gbp: number | null; comp_samples: number; pickup_7d: number; reasoning: string; status: string; apartment_type: { name: string } | null }
interface Band { id: string; apartment_type_id: string | null; floor_gbp: number; ceiling_gbp: number; target_premium_percent: number; max_daily_change_percent: number; auto_apply: boolean; horizon_weeks: number; apartment_type: { name: string } | null }
interface Type { id: string; name: string }

/** The pricing agent's queue plus the bands that bound it. */
export function PricingTab() {
  const [status, setStatus] = useState("pending");
  const { data: recs, isLoading, mutate } = useApi<Rec[]>(`/api/v1/sales/recommendations?status=${status}&limit=100`, undefined, ["rate_recommendations"]);
  const { data: bands, mutate: mutateBands } = useApi<Band[]>("/api/v1/sales/pricing-bands");
  const { data: types } = useApi<Type[]>("/api/v1/apartment-types?limit=100");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [bandForm, setBandForm] = useState({ apartment_type_id: "", floor_gbp: "", ceiling_gbp: "", target_premium_percent: "15", max_daily_change_percent: "10", auto_apply: false, horizon_weeks: "12" });

  const act = async (id: string, action: "approve" | "reject", rate?: number) => {
    setBusy(id); setMsg("");
    try { await postJson(`/api/v1/sales/recommendations/${id}`, { action, rate_gbp: rate }); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  const runAgent = async () => {
    setBusy("run"); setMsg("");
    try { const r = await postJson<{ pending: number; auto_applied: number; unchanged: number }>("/api/v1/sales/recommendations", { action: "generate" }); setMsg(`Agent run: ${r.pending} queued, ${r.auto_applied} auto-applied, ${r.unchanged} unchanged.`); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  const saveBand = async () => {
    setBusy("band"); setMsg("");
    try {
      await postJson("/api/v1/sales/pricing-bands", { apartment_type_id: bandForm.apartment_type_id || null, floor_gbp: Number(bandForm.floor_gbp), ceiling_gbp: Number(bandForm.ceiling_gbp), target_premium_percent: Number(bandForm.target_premium_percent), max_daily_change_percent: Number(bandForm.max_daily_change_percent), auto_apply: bandForm.auto_apply, horizon_weeks: Number(bandForm.horizon_weeks) }, "PUT");
      setMsg("Band saved."); mutateBands();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6" data-testid="sales-pricing">
      <div className="flex flex-wrap items-center gap-2">
        {["pending", "approved", "auto_applied", "rejected", "expired", "all"].map((s) => <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border ${status === s ? "bg-brand-accent text-brand-bg border-brand-accent" : "border-brand-border text-text-secondary"}`}>{s.replace("_", " ")}</button>)}
        <span className="flex-1" />
        <button className={btn} onClick={runAgent} disabled={busy === "run"} data-testid="pricing-run">{busy === "run" ? "Running…" : "Run agent now"}</button>
      </div>
      {msg && <p className="text-xs text-text-secondary">{msg}</p>}
      <Card>
        <CardContent className="p-0">
          {isLoading && !recs ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-brand-accent" /></div> : (recs ?? []).length === 0 ? <p className="py-12 text-center text-sm text-text-muted">Nothing in this list.</p> : (
            <ul className="divide-y divide-brand-border/60">
              {(recs ?? []).map((r) => (
                <li key={r.id} className="p-4 text-sm flex flex-col md:flex-row md:items-start gap-3" data-testid="rec-row">
                  <div className="flex-1">
                    <p className="font-medium">{r.apartment_type?.name ?? "Type"} · {r.stay_from} → {r.stay_to} · {gbp(r.current_rate_gbp)} → <span className={r.change_percent >= 0 ? "text-status-success" : "text-status-error"}>{gbp(r.recommended_rate_gbp)} ({r.change_percent >= 0 ? "+" : ""}{r.change_percent}%)</span></p>
                    <p className="text-xs text-text-secondary mt-1">{r.reasoning}</p>
                    <p className="text-[11px] text-text-muted mt-1">band {gbp(r.floor_gbp)}–{gbp(r.ceiling_gbp)}{r.comp_median_gbp !== null ? ` · comp median ${gbp(r.comp_median_gbp)} (${r.comp_samples})` : ""} · pickup {r.pickup_7d}</p>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button className={btn} onClick={() => act(r.id, "approve")} disabled={busy === r.id} data-testid="rec-approve">Approve</button>
                      <button className={btnGhost} onClick={() => { const v = window.prompt(`Approve at a different rate (GBP, ${r.floor_gbp}–${r.ceiling_gbp})`, String(r.recommended_rate_gbp)); if (v) void act(r.id, "approve", Number(v)); }} disabled={busy === r.id}>Edit…</button>
                      <button className={btnGhost} onClick={() => act(r.id, "reject")} disabled={busy === r.id}>Reject</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><h2 className="font-semibold">Bands</h2><p className="text-xs text-text-secondary">Floor, ceiling and limits the agent must respect. Auto-apply writes rates without approval.</p></CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-brand-border"><th className="py-2">Type</th><th className="py-2 text-right">Floor</th><th className="py-2 text-right">Ceiling</th><th className="py-2 text-right">Premium</th><th className="py-2 text-right">Max/day</th><th className="py-2">Auto</th><th className="py-2 text-right">Weeks</th></tr></thead>
            <tbody>{(bands ?? []).map((b) => <tr key={b.id} className="border-b border-brand-border/50"><td className="py-2">{b.apartment_type?.name ?? "Default (all types)"}</td><td className="py-2 text-right">{gbp(b.floor_gbp)}</td><td className="py-2 text-right">{gbp(b.ceiling_gbp)}</td><td className="py-2 text-right">+{b.target_premium_percent}%</td><td className="py-2 text-right">{b.max_daily_change_percent}%</td><td className="py-2">{b.auto_apply ? "yes" : "no"}</td><td className="py-2 text-right">{b.horizon_weeks}</td></tr>)}{(bands ?? []).length === 0 && <tr><td className="py-4 text-text-muted" colSpan={7}>No bands yet: the agent uses 70%–200% of the base rate and never auto-applies.</td></tr>}</tbody></table>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end text-xs">
            <label className="col-span-2">Type<select className={field} value={bandForm.apartment_type_id} onChange={(e) => setBandForm({ ...bandForm, apartment_type_id: e.target.value })}><option value="">Default (all)</option>{(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Floor<input className={field} type="number" value={bandForm.floor_gbp} onChange={(e) => setBandForm({ ...bandForm, floor_gbp: e.target.value })} /></label>
            <label>Ceiling<input className={field} type="number" value={bandForm.ceiling_gbp} onChange={(e) => setBandForm({ ...bandForm, ceiling_gbp: e.target.value })} /></label>
            <label>Premium %<input className={field} type="number" value={bandForm.target_premium_percent} onChange={(e) => setBandForm({ ...bandForm, target_premium_percent: e.target.value })} /></label>
            <label>Max/day %<input className={field} type="number" value={bandForm.max_daily_change_percent} onChange={(e) => setBandForm({ ...bandForm, max_daily_change_percent: e.target.value })} /></label>
            <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={bandForm.auto_apply} onChange={(e) => setBandForm({ ...bandForm, auto_apply: e.target.checked })} /> Auto-apply</label>
            <button className={`${btn} col-span-2 md:col-span-1`} onClick={saveBand} disabled={busy === "band" || !bandForm.floor_gbp || !bandForm.ceiling_gbp}>Save band</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
