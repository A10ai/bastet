"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { when, btn, btnGhost, field, postJson } from "./shared";

interface Review { id: string; source: string; reviewer_name: string | null; overall_rating: number; title: string | null; body: string | null; language: string | null; response: string | null; responded_at: string | null; reply_draft: string | null; created_at: string }

/** Reviews from the portal and OTAs; draft replies with Claude, publish from here. */
export function ReviewsTab() {
  const [unanswered, setUnanswered] = useState(true);
  const { data, mutate } = useApi<Review[]>(`/api/v1/sales/reviews?limit=50${unanswered ? "&unanswered=1" : ""}`, undefined, ["reviews"]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const draft = async (r: Review) => {
    setBusy(r.id); setMsg("");
    try { const d = await postJson<{ draft: string; model: string | null }>(`/api/v1/sales/reviews/${r.id}`, {}); setDrafts((x) => ({ ...x, [r.id]: d.draft })); setMsg(d.model ? `Drafted with ${d.model}.` : "Drafted from the template (no model key)."); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  const publish = async (r: Review) => {
    const response = drafts[r.id] ?? r.reply_draft ?? "";
    if (response.trim().length < 5) return;
    setBusy(r.id); setMsg("");
    try { await postJson(`/api/v1/sales/reviews/${r.id}`, { response }, "PATCH"); setMsg(r.source === "portal" || r.source === "direct" ? "Reply published." : "Reply saved. Copy it to the OTA extranet."); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4" data-testid="sales-reviews">
      <div className="flex items-center gap-2">
        <button className={`px-3 py-1.5 rounded-full text-xs font-medium border ${unanswered ? "bg-brand-accent text-brand-bg border-brand-accent" : "border-brand-border text-text-secondary"}`} onClick={() => setUnanswered(true)}>Unanswered</button>
        <button className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!unanswered ? "bg-brand-accent text-brand-bg border-brand-accent" : "border-brand-border text-text-secondary"}`} onClick={() => setUnanswered(false)}>All</button>
        {msg && <span className="text-xs text-text-secondary ml-2">{msg}</span>}
      </div>
      {(data ?? []).length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-text-muted">No reviews here.</CardContent></Card> : (data ?? []).map((r) => (
        <Card key={r.id} data-testid="review-card">
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{"★".repeat(r.overall_rating)}{"☆".repeat(Math.max(0, 5 - r.overall_rating))}</span><span className="font-medium">{r.title ?? "(no title)"}</span><span className="text-xs text-text-muted">{r.reviewer_name ?? "Guest"} · {r.source} · {r.language ?? ""} · {when(r.created_at)}</span></div>
            {r.body && <p className="text-text-secondary whitespace-pre-wrap">{r.body}</p>}
            {r.response ? <p className="text-xs border-l-2 border-brand-accent pl-3 text-text-secondary">Reply ({when(r.responded_at)}): {r.response}</p> : (
              <div className="space-y-2">
                <textarea className={field} rows={3} value={drafts[r.id] ?? r.reply_draft ?? ""} onChange={(e) => setDrafts((x) => ({ ...x, [r.id]: e.target.value }))} placeholder="Reply…" />
                <div className="flex gap-2"><button className={btnGhost} onClick={() => draft(r)} disabled={busy === r.id}>Draft with AI</button><button className={btn} onClick={() => publish(r)} disabled={busy === r.id}>Publish reply</button></div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
