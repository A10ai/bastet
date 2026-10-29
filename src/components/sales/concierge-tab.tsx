"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { when } from "./shared";

interface Session { id: string; channel: string; locale: string; status: string; booking_id: string | null; message_count: number; last_message_at: string | null; created_at: string }
interface Transcript { session: Session; messages: { role: string; content: string; tool_calls: { name: string; ok: boolean; summary: string }[] | null; model: string | null; input_tokens: number | null; output_tokens: number | null; stop_reason: string | null; created_at: string }[] }

/** Concierge conversations (scrubbed) for the front desk. */
export function ConciergeTab({ initialSession }: { initialSession?: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialSession ?? null);
  const { data: sessions } = useApi<Session[]>("/api/v1/sales/concierge/sessions?limit=50", undefined, ["concierge_sessions"]);
  const { data: transcript } = useApi<Transcript>(selected ? `/api/v1/sales/concierge/sessions?session=${selected}` : null);
  return (
    <div className="grid md:grid-cols-5 gap-4" data-testid="sales-concierge">
      <Card className="md:col-span-2">
        <CardHeader><h2 className="font-semibold">Conversations</h2></CardHeader>
        <CardContent className="p-0 max-h-[32rem] overflow-y-auto">
          {(sessions ?? []).length === 0 ? <p className="py-10 text-center text-sm text-text-muted">No conversations yet.</p> : (
            <ul className="divide-y divide-brand-border/60 text-sm">{(sessions ?? []).map((s) => <li key={s.id}><button className={`w-full text-left px-4 py-3 hover:bg-brand-bg/40 ${selected === s.id ? "bg-brand-bg/60" : ""}`} onClick={() => setSelected(s.id)}><span className="font-medium">{s.channel} · {s.locale.toUpperCase()}</span> <span className={`text-xs ${s.status === "handoff" ? "text-status-error" : "text-text-muted"}`}>{s.status}</span><br /><span className="text-xs text-text-muted">{s.message_count} messages · {when(s.last_message_at)}{s.booking_id ? " · booking created" : ""}</span></button></li>)}</ul>
          )}
        </CardContent>
      </Card>
      <Card className="md:col-span-3">
        <CardHeader><h2 className="font-semibold">Transcript</h2><p className="text-xs text-text-secondary">Contact details are masked before storage.</p></CardHeader>
        <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto text-sm">
          {!transcript ? <p className="text-text-muted">Select a conversation.</p> : transcript.messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-brand-accent/20" : "bg-brand-bg"}`}>
                {m.content}
                {m.tool_calls && <p className="text-[11px] text-text-muted mt-1">tools: {m.tool_calls.map((t) => `${t.name}${t.ok ? "" : " (failed)"}`).join(", ")}</p>}
                {m.role === "assistant" && m.model && <p className="text-[10px] text-text-muted">{m.model} · {m.input_tokens ?? 0}/{m.output_tokens ?? 0} tokens · {m.stop_reason}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
