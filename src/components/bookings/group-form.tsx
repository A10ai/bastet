"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import type { RatePlan } from "@/lib/rate-plans";

const input = "w-full bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2 placeholder:text-text-muted focus:outline-none focus:border-brand-accent/40";

/** Create a group: the master record first, rooms are blocked from the group page. */
export function GroupForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { data: plans } = useApi<RatePlan[]>("/api/v1/rate-plans");
  const [form, setForm] = useState({ name: "", organiser_name: "", organiser_email: "", company: "", check_in: "", check_out: "", rooms_requested: 2, rate_plan_id: "", billing_mode: "individual", cutoff_date: "", status: "tentative", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/v1/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          organiser_name: form.organiser_name || null,
          organiser_email: form.organiser_email || null,
          company: form.company || null,
          rate_plan_id: form.rate_plan_id || null,
          cutoff_date: form.cutoff_date || null,
          notes: form.notes || null,
          rooms_requested: Number(form.rooms_requested),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = json.details ? Object.values(json.details as Record<string, string>).join("; ") : "";
        setError(json.error?.message || (typeof json.error === "string" ? json.error : "") || detail || "Could not create the group");
        return;
      }
      onCreated(json.data.id);
    } catch {
      setError("Could not create the group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="group-form">
      <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary">New group</h2></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-text-muted md:col-span-2">Group name<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nile Tours allotment, Ahmed wedding..." /></label>
          <label className="text-xs text-text-muted">Rooms requested<input type="number" min={0} className={input} value={form.rooms_requested} onChange={(e) => setForm({ ...form, rooms_requested: Number(e.target.value) })} /></label>
          <label className="text-xs text-text-muted">Check-in<input type="date" className={input} value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Check-out<input type="date" className={input} value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Release date (optional)<input type="date" className={input} value={form.cutoff_date} onChange={(e) => setForm({ ...form, cutoff_date: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Organiser<input className={input} value={form.organiser_name} onChange={(e) => setForm({ ...form, organiser_name: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Organiser email<input type="email" className={input} value={form.organiser_email} onChange={(e) => setForm({ ...form, organiser_email: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Company<input className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
          <label className="text-xs text-text-muted">Rate plan
            <select className={input} value={form.rate_plan_id} onChange={(e) => setForm({ ...form, rate_plan_id: e.target.value })}>
              <option value="">Default</option>
              {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-text-muted">Billing
            <select className={input} value={form.billing_mode} onChange={(e) => setForm({ ...form, billing_mode: e.target.value })}>
              <option value="individual">Each room pays its own folio</option>
              <option value="master">Organiser settles (payments allocated across rooms)</option>
            </select>
          </label>
          <label className="text-xs text-text-muted">Status
            <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="tentative">Tentative</option><option value="confirmed">Confirmed</option>
            </select>
          </label>
          <label className="text-xs text-text-muted md:col-span-3">Notes<input className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        {error && <p className="text-sm text-status-error mt-3" data-testid="group-error">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit} disabled={saving || form.name.length < 2 || !form.check_in || !form.check_out} data-testid="group-save">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create group"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
