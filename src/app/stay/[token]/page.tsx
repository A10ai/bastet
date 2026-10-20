"use client";

import { use, useEffect, useState } from "react";
import type { PortalStay } from "@/lib/portal";

const field = "w-full rounded-lg border border-brand-border bg-brand-card px-3 py-2 text-sm text-text-primary";
const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Guest-facing stay page. No login: the token in the URL is the credential.
 * Mobile first, plain language, nothing the guest did not already give us.
 */
export default function StayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [stay, setStay] = useState<PortalStay | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [form, setForm] = useState({ arrival_time: "", flight_or_transport: "", adults: "", children: "", phone: "", email: "", special_requests: "", marketing_consent: false, accept_terms: false });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/v1/portal/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error(); const j = await r.json(); setStay(j.data); setState("ok"); if (j.data?.booking?.precheckin_completed_at) setDone(true); })
      .catch(() => setState("invalid"));
  }, [token]);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/portal/${token}/precheckin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arrival_time: form.arrival_time || null,
          flight_or_transport: form.flight_or_transport || null,
          adults: form.adults ? Number(form.adults) : undefined,
          children: form.children ? Number(form.children) : undefined,
          phone: form.phone || null,
          email: form.email || null,
          special_requests: form.special_requests || null,
          marketing_consent: form.marketing_consent,
          accept_terms: form.accept_terms,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = json.details ? Object.values(json.details as Record<string, string>).join("; ") : "";
        setError(json.error?.message || (typeof json.error === "string" ? json.error : "") || detail || "Could not save your details");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not save your details");
    } finally {
      setSaving(false);
    }
  };

  if (state === "loading") return <main className="min-h-screen bg-brand-bg flex items-center justify-center text-text-muted text-sm">Loading your stay...</main>;
  if (state === "invalid" || !stay) {
    return (
      <main className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="portal-invalid">
          <h1 className="text-xl font-semibold text-text-primary">This link is not valid</h1>
          <p className="text-sm text-text-secondary mt-2">It may have expired or been replaced. Please contact the property for a new link.</p>
        </div>
      </main>
    );
  }
  const b = stay.booking;
  const canCheckIn = ["pending", "confirmed"].includes(b.status) && !done;

  return (
    <main className="min-h-screen bg-brand-bg text-text-primary">
      <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
        <header className="pt-4">
          <p className="text-xs uppercase tracking-wider text-text-muted">{stay.property.name}</p>
          <h1 className="text-2xl font-semibold mt-1" data-testid="portal-title">{stay.guest?.first_name ? `Welcome, ${stay.guest.first_name}` : "Your stay"}</h1>
          <p className="text-sm text-text-secondary mt-1">Booking <span className="font-mono" data-testid="portal-reference">{b.reference}</span></p>
        </header>

        <section className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-text-muted">Check-in</span><span>{day(b.check_in)}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Check-out</span><span>{day(b.check_out)}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Nights</span><span>{b.nights}</span></div>
          {b.apartment && <div className="flex justify-between"><span className="text-text-muted">Room</span><span>{b.apartment.type ? `${b.apartment.type} · ` : ""}{b.apartment.number}</span></div>}
          <div className="flex justify-between"><span className="text-text-muted">Guests</span><span>{b.adults} adult{b.adults === 1 ? "" : "s"}{b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">Room total</span><span className="font-medium">{money(b.total_gbp)}</span></div>
          {b.rate_plan && (
            <div className="pt-2 mt-2 border-t border-brand-border text-xs text-text-secondary">
              <p className="font-medium text-text-primary">{b.rate_plan.name}{b.rate_plan.includes_breakfast ? " · breakfast included" : ""}</p>
              <p>{b.rate_plan.cancellation}</p>
            </div>
          )}
        </section>

        {stay.folio && (
          <section className="rounded-xl border border-brand-border bg-brand-card p-4" data-testid="portal-folio">
            <h2 className="text-base font-semibold mb-2">Your bill</h2>
            <ul className="divide-y divide-brand-border/60 text-sm">
              {stay.folio.lines.map((l, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-3"><span className="text-text-secondary">{l.date} · {l.description}</span><span className={l.credit_gbp ? "text-status-success" : ""}>{l.credit_gbp ? `-${money(l.credit_gbp)}` : money(l.debit_gbp)}</span></li>
              ))}
            </ul>
            <div className="flex justify-between pt-3 mt-2 border-t border-brand-border font-semibold"><span>Balance</span><span data-testid="portal-balance">{money(stay.folio.balance_gbp)}</span></div>
          </section>
        )}

        <section className="rounded-xl border border-brand-border bg-brand-card p-4" data-testid="portal-precheckin">
          <h2 className="text-base font-semibold">Online check-in</h2>
          {done ? (
            <p className="text-sm text-status-success mt-2" data-testid="portal-precheckin-done">Thank you, your details are with the front desk. We look forward to welcoming you.</p>
          ) : !canCheckIn ? (
            <p className="text-sm text-text-secondary mt-2">Online check-in is available before arrival.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-text-muted">Arrival time<input type="time" className={field} value={form.arrival_time} onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} data-testid="pc-arrival" /></label>
                <label className="text-xs text-text-muted">Flight or transport<input className={field} value={form.flight_or_transport} onChange={(e) => setForm({ ...form, flight_or_transport: e.target.value })} placeholder="MS 775, taxi..." /></label>
                <label className="text-xs text-text-muted">Adults<input type="number" min={1} className={field} value={form.adults} onChange={(e) => setForm({ ...form, adults: e.target.value })} placeholder={String(b.adults)} /></label>
                <label className="text-xs text-text-muted">Children<input type="number" min={0} className={field} value={form.children} onChange={(e) => setForm({ ...form, children: e.target.value })} placeholder={String(b.children)} /></label>
                <label className="text-xs text-text-muted">Mobile<input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="text-xs text-text-muted">Email<input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              </div>
              <label className="text-xs text-text-muted block">Anything we should know?<textarea className={field} rows={3} value={form.special_requests} onChange={(e) => setForm({ ...form, special_requests: e.target.value })} placeholder="Allergies, a cot, a late arrival..." /></label>
              <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" checked={form.accept_terms} onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })} data-testid="pc-terms" /> I accept the booking terms{b.rate_plan ? ` (${b.rate_plan.cancellation.toLowerCase()})` : ""} and the house rules.</label>
              <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} /> You may email me offers from this property. Optional.</label>
              {error && <p className="text-xs text-status-error" data-testid="pc-error">{error}</p>}
              <button onClick={submit} disabled={saving || !form.accept_terms} className="w-full rounded-lg bg-brand-accent text-brand-bg font-medium py-2.5 disabled:opacity-50" data-testid="pc-submit">{saving ? "Saving..." : "Complete check-in"}</button>
            </div>
          )}
        </section>

        <footer className="text-xs text-text-muted pb-8 space-y-1">
          {(stay.property.phone || stay.property.email) && <p>Questions? {stay.property.phone ? `Call ${stay.property.phone}` : ""}{stay.property.phone && stay.property.email ? " or " : ""}{stay.property.email ? `email ${stay.property.email}` : ""}.</p>}
          <p>This page is private to your booking. Do not forward the link. It stops working a week after check-out.</p>
        </footer>
      </div>
    </main>
  );
}
