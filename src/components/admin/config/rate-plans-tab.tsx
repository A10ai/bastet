"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Star } from "lucide-react";
import type { ShowToast } from "@/components/admin/config/types";
import type { RatePlan } from "@/lib/rate-plans";
import { describeCancellation } from "@/lib/rate-plans";

const MODE_LABEL: Record<RatePlan["pricing_mode"], string> = {
  bar: "Seasonal rate (BAR)",
  percent_off: "% off BAR",
  percent_markup: "% on top of BAR",
  fixed_nightly: "Fixed nightly £",
};

const EMPTY = { code: "", name: "", description: "", pricing_mode: "percent_off" as RatePlan["pricing_mode"], adjustment: 10, cancellation_policy: "flexible" as RatePlan["cancellation_policy"], free_cancellation_days: 1, min_nights: 1, includes_breakfast: false };

/** Rate plans: named pricing and cancellation rules on top of the seasonal rates (migration 00027). */
export function RatePlansTab({ showToast, inputClass }: { showToast: ShowToast; inputClass: string }) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/rate-plans?include_inactive=true");
      const json = await res.json();
      setPlans(json.data || []);
    } catch {
      showToast("Failed to load rate plans", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/rate-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, description: form.description || null, adjustment: Number(form.adjustment), free_cancellation_days: Number(form.free_cancellation_days), min_nights: Number(form.min_nights) }),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = json.details ? Object.values(json.details as Record<string, string>).join("; ") : "";
        showToast(json.error?.message || json.error || detail || "Could not create plan", "error");
        return;
      }
      showToast(`Rate plan ${json.data.code} created`);
      setShowForm(false);
      setForm(EMPTY);
      load();
    } catch {
      showToast("Could not create plan", "error");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, updates: Partial<RatePlan>, okMessage: string) => {
    const res = await fetch(`/api/v1/rate-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    const json = await res.json();
    if (!res.ok) { showToast(json.error?.message || json.error || "Update failed", "error"); return; }
    showToast(okMessage);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold text-text-primary">Rate plans</h2>
            <p className="text-xs text-text-muted mt-0.5">The seasonal rate is the Best Available Rate; plans adjust it and set the cancellation terms. Sold bookings keep the plan they were priced with.</p>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)} data-testid="rate-plan-new">
            <Plus className="w-4 h-4 mr-2" /> New plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 p-4 rounded-lg border border-brand-border bg-brand-bg/40" data-testid="rate-plan-form">
            <label className="text-xs text-text-muted">Code<input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NRF" maxLength={30} /></label>
            <label className="text-xs text-text-muted">Name<input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Non-refundable" /></label>
            <label className="text-xs text-text-muted">Pricing
              <select className={inputClass} value={form.pricing_mode} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value as RatePlan["pricing_mode"] })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs text-text-muted">{form.pricing_mode === "fixed_nightly" ? "Nightly rate (GBP)" : "Adjustment (%)"}<input type="number" min={0} step="0.01" className={inputClass} value={form.adjustment} disabled={form.pricing_mode === "bar"} onChange={(e) => setForm({ ...form, adjustment: Number(e.target.value) })} /></label>
            <label className="text-xs text-text-muted">Cancellation
              <select className={inputClass} value={form.cancellation_policy} onChange={(e) => setForm({ ...form, cancellation_policy: e.target.value as RatePlan["cancellation_policy"] })}>
                <option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="strict">Strict</option><option value="non_refundable">Non-refundable</option>
              </select>
            </label>
            <label className="text-xs text-text-muted">Free cancellation (days before)<input type="number" min={0} className={inputClass} value={form.free_cancellation_days} onChange={(e) => setForm({ ...form, free_cancellation_days: Number(e.target.value) })} /></label>
            <label className="text-xs text-text-muted">Minimum nights<input type="number" min={1} className={inputClass} value={form.min_nights} onChange={(e) => setForm({ ...form, min_nights: Number(e.target.value) })} /></label>
            <label className="text-xs text-text-muted md:col-span-2">Description<input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Shown to the front desk when choosing a plan" /></label>
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={form.includes_breakfast} onChange={(e) => setForm({ ...form, includes_breakfast: e.target.checked })} /> Includes breakfast</label>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={create} disabled={saving || form.code.length < 2 || form.name.length < 2}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create plan"}</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="rate-plan-table">
              <thead>
                <tr className="border-b border-brand-border text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="py-2 px-3">Code</th><th className="py-2 px-3">Name</th><th className="py-2 px-3">Pricing</th><th className="py-2 px-3">Cancellation</th><th className="py-2 px-3">Min nights</th><th className="py-2 px-3">Status</th><th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className={`border-b border-brand-border/50 ${p.is_active ? "" : "opacity-50"}`}>
                    <td className="py-2 px-3 font-mono text-text-primary">{p.code}{p.is_default && <Star className="inline w-3 h-3 ml-1 text-amber-400" aria-label="default" />}</td>
                    <td className="py-2 px-3 text-text-primary">{p.name}{p.includes_breakfast ? " · breakfast" : ""}</td>
                    <td className="py-2 px-3 text-text-secondary">{p.pricing_mode === "bar" ? "BAR" : p.pricing_mode === "fixed_nightly" ? `£${p.adjustment}/night` : `${p.pricing_mode === "percent_off" ? "-" : "+"}${p.adjustment}% BAR`}</td>
                    <td className="py-2 px-3 text-text-secondary">{describeCancellation(p)}</td>
                    <td className="py-2 px-3 text-text-secondary">{p.min_nights}{p.max_nights ? `–${p.max_nights}` : ""}</td>
                    <td className="py-2 px-3">{p.is_active ? <span className="text-status-success">active</span> : <span className="text-text-muted">retired</span>}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {!p.is_default && p.is_active && <button className="text-xs text-cyan-400 hover:underline mr-3" onClick={() => patch(p.id, { is_default: true }, `${p.code} is now the default plan`)}>Make default</button>}
                      {!p.is_default && <button className="text-xs text-text-muted hover:underline" onClick={() => patch(p.id, { is_active: !p.is_active }, p.is_active ? `${p.code} retired` : `${p.code} reactivated`)}>{p.is_active ? "Retire" : "Reactivate"}</button>}
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-muted">No rate plans yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
