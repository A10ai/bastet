"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { when, btn, btnGhost, field, postJson } from "./shared";

const STAGES = ["identified", "researched", "contacted", "replied", "meeting", "rates_sent", "negotiating", "contracted", "declined", "dormant"] as const;
interface Account { id: string; name: string; kind: string; market: string | null; stage: string; priority: number; source: string; next_action: string | null; next_action_at: string | null; notes: string | null; updated_at: string; contacts: { id: string; name: string; role: string | null; email: string | null; is_primary: boolean }[] }
interface Detail extends Account { activities: { id: string; kind: string; summary: string; body: string | null; happened_at: string }[] }

/** Inbound operator pipeline: who asked, where they are, what happens next. */
export function OperatorsTab() {
  const { data, mutate } = useApi<Account[]>("/api/v1/sales/accounts?limit=200", undefined, ["sales_accounts", "sales_activities"]);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: detail, mutate: mutateDetail } = useApi<Detail>(selected ? `/api/v1/sales/accounts/${selected}` : null);
  const [form, setForm] = useState({ name: "", kind: "tour_operator", market: "", stage: "identified", next_action: "", next_action_at: "" });
  const [note, setNote] = useState({ kind: "note", summary: "" });
  const [contact, setContact] = useState({ name: "", role: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const wrap = async (fn: () => Promise<void>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const create = () => wrap(async () => { const a = await postJson<Account>("/api/v1/sales/accounts", { ...form, market: form.market || null, next_action: form.next_action || null, next_action_at: form.next_action_at || null }); setForm({ name: "", kind: "tour_operator", market: "", stage: "identified", next_action: "", next_action_at: "" }); mutate(); setSelected(a.id); });
  const setStage = (id: string, stage: string) => wrap(async () => { await postJson(`/api/v1/sales/accounts/${id}`, { stage }, "PATCH"); mutate(); mutateDetail(); });
  const addNote = () => wrap(async () => { if (!selected || note.summary.trim().length < 3) return; await postJson(`/api/v1/sales/accounts/${selected}/activities`, note); setNote({ kind: "note", summary: "" }); mutateDetail(); mutate(); });
  const addContact = () => wrap(async () => { if (!selected || contact.name.trim().length < 2) return; await postJson(`/api/v1/sales/accounts/${selected}/contacts`, { ...contact, role: contact.role || null, email: contact.email || null }); setContact({ name: "", role: "", email: "" }); mutateDetail(); mutate(); });
  const byStage = (s: string) => (data ?? []).filter((a) => a.stage === s);

  return (
    <div className="space-y-4" data-testid="sales-operators">
      <Card>
        <CardHeader><h2 className="font-semibold">New account</h2><p className="text-xs text-text-secondary">Tour operators, bed banks and corporates that come to us. Outbound campaigns wait until the online numbers exist.</p></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end text-xs">
          <label className="col-span-2">Name<input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="account-name" /></label>
          <label>Kind<select className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{["tour_operator", "bed_bank", "ota", "travel_agent", "corporate", "airline", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></label>
          <label>Market<input className={field} maxLength={2} placeholder="DE" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value.toUpperCase() })} /></label>
          <label>Stage<select className={field} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></label>
          <label>Next action<input className={field} value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} /></label>
          <button className={btn} onClick={create} disabled={busy || form.name.trim().length < 2} data-testid="account-create">Add</button>
        </CardContent>
      </Card>
      {msg && <p className="text-xs text-status-error">{msg}</p>}
      <div className="grid md:grid-cols-5 gap-4">
        <Card className="md:col-span-3">
          <CardContent className="p-0">
            {STAGES.map((s) => byStage(s).length === 0 ? null : (
              <div key={s}>
                <p className="px-4 pt-3 pb-1 text-xs uppercase tracking-wider text-text-muted">{s.replace("_", " ")} · {byStage(s).length}</p>
                <ul className="divide-y divide-brand-border/60 text-sm">{byStage(s).map((a) => <li key={a.id}><button className={`w-full text-left px-4 py-2 hover:bg-brand-bg/40 ${selected === a.id ? "bg-brand-bg/60" : ""}`} onClick={() => setSelected(a.id)}><span className="font-medium">{a.name}</span> <span className="text-xs text-text-muted">{a.kind.replace("_", " ")}{a.market ? ` · ${a.market}` : ""} · P{a.priority}</span>{a.next_action && <p className="text-xs text-text-secondary">Next: {a.next_action}{a.next_action_at ? ` by ${a.next_action_at}` : ""}</p>}</button></li>)}</ul>
              </div>
            ))}
            {(data ?? []).length === 0 && <p className="py-10 text-center text-sm text-text-muted">No accounts yet.</p>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardContent className="space-y-3 text-sm">
            {!detail ? <p className="text-text-muted">Select an account.</p> : (
              <>
                <div><p className="font-semibold">{detail.name}</p><p className="text-xs text-text-muted">{detail.kind.replace("_", " ")}{detail.market ? ` · ${detail.market}` : ""} · {detail.source}</p></div>
                <label className="text-xs">Stage<select className={field} value={detail.stage} onChange={(e) => setStage(detail.id, e.target.value)} disabled={busy}>{STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></label>
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Contacts</p>
                  <ul className="text-xs space-y-1">{detail.contacts.map((c) => <li key={c.id}>{c.name}{c.role ? ` · ${c.role}` : ""}{c.email ? ` · ${c.email}` : ""}{c.is_primary ? " (primary)" : ""}</li>)}</ul>
                  <div className="grid grid-cols-3 gap-1 mt-1"><input className={field} placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /><input className={field} placeholder="Role" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} /><input className={field} placeholder="Email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
                  <button className={`${btnGhost} mt-1`} onClick={addContact} disabled={busy}>Add contact</button>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-text-muted">Activity</p>
                  <div className="flex gap-1 mt-1"><select className={`${field} w-28`} value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value })}>{["note", "email_in", "email_out", "call", "meeting", "proposal"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select><input className={field} placeholder="What happened" value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} /><button className={btn} onClick={addNote} disabled={busy}>Log</button></div>
                  <ul className="text-xs space-y-1 mt-2 max-h-64 overflow-y-auto">{detail.activities.map((a) => <li key={a.id}><span className="text-text-muted">{when(a.happened_at)}</span> · <span className="font-medium">{a.kind.replace("_", " ")}</span> · {a.summary}</li>)}</ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
