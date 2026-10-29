"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { when, btn, btnGhost, postJson } from "./shared";

interface Conn { id: string; name: string; provider: string; status: string; hotel_code: string | null; push_url: string | null; push_days: number; markup_percent: number; last_inbound_at: string | null; last_push_at: string | null; last_push_status: string | null; last_error: string | null; has_webhook_secret: boolean; channel: { code: string; name: string; commission_rate: number } | null }

/** OTA connections: status, last inbound reservation, last ARI push. */
export function ChannelsTab() {
  const { data, mutate } = useApi<Conn[]>("/api/v1/channels/connections", undefined, ["channel_connections", "channel_messages"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const push = async (c: Conn) => {
    setBusy(c.id); setMsg("");
    try { const r = await postJson<{ status: string; rooms: number; days: number; error: string | null }>(`/api/v1/channels/${c.channel?.code}/push`, {}); setMsg(`${c.name}: ${r.status} (${r.rooms} rooms × ${r.days} days)${r.error ? ` – ${r.error}` : ""}`); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  const toggle = async (c: Conn) => {
    setBusy(c.id);
    try { await postJson(`/api/v1/channels/connections/${c.id}`, { status: c.status === "active" ? "inactive" : "active" }, "PATCH"); mutate(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4" data-testid="sales-channels">
      {msg && <p className="text-xs text-text-secondary">{msg}</p>}
      <Card>
        <CardHeader><h2 className="font-semibold">Connections</h2><p className="text-xs text-text-secondary">Reservations in via signed webhooks, availability and rates out via ARI push. Set up and mapped through the API (docs/CHANNEL-MANAGER.md).</p></CardHeader>
        <CardContent className="p-0">
          {(data ?? []).length === 0 ? <p className="py-10 text-center text-sm text-text-muted">No channel connections yet.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-brand-border"><th className="px-4 py-2">Channel</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Secret</th><th className="px-4 py-2">Last inbound</th><th className="px-4 py-2">Last push</th><th className="px-4 py-2">Markup</th><th className="px-4 py-2"></th></tr></thead>
              <tbody>{(data ?? []).map((c) => <tr key={c.id} className="border-b border-brand-border/50 align-top"><td className="px-4 py-2 font-medium">{c.name}<br /><span className="text-xs text-text-muted">{c.channel?.code} · {c.channel?.commission_rate ?? 0}%</span></td><td className="px-4 py-2">{c.provider}</td><td className="px-4 py-2"><span className={c.status === "active" ? "text-status-success" : c.status === "error" ? "text-status-error" : "text-text-muted"}>{c.status}</span>{c.last_error && <p className="text-[11px] text-status-error max-w-[16rem]">{c.last_error}</p>}</td><td className="px-4 py-2">{c.has_webhook_secret ? "set" : "missing"}</td><td className="px-4 py-2">{when(c.last_inbound_at)}</td><td className="px-4 py-2">{when(c.last_push_at)}{c.last_push_status ? ` · ${c.last_push_status}` : ""}{!c.push_url && <p className="text-[11px] text-text-muted">dry run (no push URL)</p>}</td><td className="px-4 py-2">{c.markup_percent}%</td><td className="px-4 py-2 flex gap-2"><button className={btn} onClick={() => push(c)} disabled={busy === c.id}>Push ARI</button><button className={btnGhost} onClick={() => toggle(c)} disabled={busy === c.id}>{c.status === "active" ? "Pause" : "Activate"}</button></td></tr>)}</tbody></table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
