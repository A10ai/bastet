"use client";

import { useEffect, useRef, useState } from "react";
import { BOOK_STRINGS, detectBookLocale, type BookLocale } from "@/lib/book-i18n";
import { inputClass, primaryButton, readError } from "./types";

interface Msg { role: "user" | "assistant"; content: string; pay_url?: string }

const STORAGE_KEY = "hospitai-concierge-session";

/**
 * Floating chat for the public booking pages. The session token lives in
 * localStorage (a per-visitor convenience, wrapped in try/catch); the
 * server holds the transcript. Hidden until the API says the assistant is
 * available, so a property without an Anthropic key shows no dead button.
 */
export function ConciergeWidget({ property }: { property?: string | null }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<BookLocale>("en");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const s = BOOK_STRINGS[locale];

  useEffect(() => {
    setLocale(detectBookLocale(new URLSearchParams(window.location.search).get("lang"), navigator.languages));
    try { tokenRef.current = localStorage.getItem(STORAGE_KEY); } catch { tokenRef.current = null; }
    const qs = property ? `?property=${encodeURIComponent(property)}` : "";
    fetch(`/api/v1/book/property${qs}`).then(async (r) => { if (!r.ok) return; const j = await r.json(); setAvailable(Boolean(j.data?.policy?.concierge)); }).catch(() => undefined);
    if (tokenRef.current) {
      fetch(`/api/v1/concierge/chat?session_token=${tokenRef.current}`).then(async (r) => {
        if (!r.ok) { tokenRef.current = null; try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } return; }
        const j = await r.json();
        setMessages((j.data.messages as Msg[]).map((m) => ({ role: m.role, content: m.content })));
      }).catch(() => undefined);
    }
  }, [property]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, open]);

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const r = await fetch("/api/v1/concierge/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_token: tokenRef.current, message, locale, property: property || undefined }) });
      if (!r.ok) throw await readError(r, s.errorGeneric);
      const j = (await r.json()).data as { session_token: string; reply: string; outcome: { pay_url?: string } };
      tokenRef.current = j.session_token;
      try { localStorage.setItem(STORAGE_KEY, j.session_token); } catch { /* ignore */ }
      setMessages((m) => [...m, { role: "assistant", content: j.reply, pay_url: j.outcome?.pay_url }]);
    } catch (e) {
      setError((e as { message?: string })?.message || s.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  if (!available) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40" data-testid="concierge-widget">
      {open ? (
        <div className="w-[min(92vw,380px)] h-[min(70vh,520px)] rounded-2xl border border-brand-border bg-brand-card shadow-xl flex flex-col">
          <header className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <p className="text-sm font-semibold">{s.conciergeTitle}</p>
            <button className="text-text-muted text-sm" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </header>
          <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {messages.length === 0 && <p className="text-text-secondary">{s.conciergeIntro}</p>}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-brand-accent text-brand-bg" : "bg-brand-border/40"}`}>
                  {m.content}
                  {m.pay_url && <a className="block mt-2 underline font-medium" href={m.pay_url}>{s.payDeposit} →</a>}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-text-muted">…</p>}
            {error && <p className="text-xs text-status-error">{error}</p>}
          </div>
          <form className="p-3 border-t border-brand-border flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={s.conciergePlaceholder} maxLength={2000} data-testid="concierge-input" />
            <button type="submit" className={`${primaryButton} w-auto px-4`} disabled={busy || !text.trim()}>{s.send}</button>
          </form>
          <p className="px-3 pb-2 text-[10px] text-text-muted">{s.conciergePrivacy}</p>
        </div>
      ) : (
        <button className="rounded-full bg-brand-accent text-brand-bg font-semibold px-5 py-3 shadow-lg" onClick={() => setOpen(true)} data-testid="concierge-open">{s.conciergeTitle}</button>
      )}
    </div>
  );
}
