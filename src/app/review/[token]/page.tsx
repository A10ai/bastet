"use client";

import { use, useEffect, useState } from "react";

interface Info { property: string; reference: string; check_in: string; check_out: string; first_name: string | null; can_review: boolean; already_reviewed: boolean }
const field = "w-full rounded-lg border border-brand-border bg-brand-card px-3 py-2 text-sm text-text-primary";

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm"><span className="text-text-secondary">{label}</span>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} of 5`} onClick={() => onChange(n)} className={`text-xl leading-none ${n <= value ? "text-brand-accent" : "text-brand-border"}`}>★</button>)}</div>
    </div>
  );
}

/** Public review form reached from the post-stay link. One review per stay, after check-out. */
export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "invalid" | "done">("loading");
  const [form, setForm] = useState({ overall_rating: 0, cleanliness_rating: 0, service_rating: 0, value_rating: 0, title: "", body: "", reviewer_name: "", consent_public: true });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch(`/api/v1/portal/${token}/review`).then(async (r) => { if (!r.ok) throw new Error(); const j = await r.json(); setInfo(j.data); setState(j.data.already_reviewed ? "done" : "ok"); }).catch(() => setState("invalid"));
  }, [token]);
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/v1/portal/${token}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cleanliness_rating: form.cleanliness_rating || null, service_rating: form.service_rating || null, value_rating: form.value_rating || null, title: form.title || null, body: form.body || null, reviewer_name: form.reviewer_name || null, language: navigator.language.slice(0, 2) }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error?.message || "Could not save your review"); return; }
      setState("done");
    } catch { setError("Could not save your review"); } finally { setSaving(false); }
  };
  if (state === "loading") return <main className="min-h-screen bg-brand-bg flex items-center justify-center text-sm text-text-muted">Loading…</main>;
  if (state === "invalid" || !info) return <main className="min-h-screen bg-brand-bg flex items-center justify-center p-6"><div className="max-w-md text-center" data-testid="review-invalid"><h1 className="text-xl font-semibold text-text-primary">This link is not valid</h1><p className="text-sm text-text-secondary mt-2">It may have expired. Thank you anyway for staying with us.</p></div></main>;
  return (
    <main className="min-h-screen bg-brand-bg text-text-primary">
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-5">
        <header className="pt-4"><p className="text-xs uppercase tracking-wider text-text-muted">{info.property}</p><h1 className="text-2xl font-semibold mt-1">{info.first_name ? `Thank you, ${info.first_name}` : "Thank you for staying with us"}</h1><p className="text-sm text-text-secondary mt-1">{info.check_in} to {info.check_out} · {info.reference}</p></header>
        {state === "done" ? <p className="text-sm text-status-success" data-testid="review-done">Your review has been received. Thank you, it helps us and future guests.</p> : !info.can_review ? <p className="text-sm text-text-secondary">You can leave a review after check-out.</p> : (
          <section className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-3">
            <Stars label="Overall" value={form.overall_rating} onChange={(n) => setForm({ ...form, overall_rating: n })} />
            <Stars label="Cleanliness" value={form.cleanliness_rating} onChange={(n) => setForm({ ...form, cleanliness_rating: n })} />
            <Stars label="Service" value={form.service_rating} onChange={(n) => setForm({ ...form, service_rating: n })} />
            <Stars label="Value" value={form.value_rating} onChange={(n) => setForm({ ...form, value_rating: n })} />
            <input className={field} placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} />
            <textarea className={field} rows={4} placeholder="What was good, what could be better?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={3000} />
            <input className={field} placeholder="Name to show (optional)" value={form.reviewer_name} onChange={(e) => setForm({ ...form, reviewer_name: e.target.value })} maxLength={80} />
            <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" checked={form.consent_public} onChange={(e) => setForm({ ...form, consent_public: e.target.checked })} /> The property may publish this review with the name above.</label>
            {error && <p className="text-xs text-status-error">{error}</p>}
            <button className="w-full rounded-lg bg-brand-accent text-brand-bg font-medium py-2.5 disabled:opacity-50" disabled={saving || form.overall_rating === 0} onClick={submit} data-testid="review-submit">{saving ? "Sending…" : "Send review"}</button>
          </section>
        )}
        <footer className="text-xs text-text-muted pb-8">This page is private to your booking. Do not forward the link.</footer>
      </div>
    </main>
  );
}
