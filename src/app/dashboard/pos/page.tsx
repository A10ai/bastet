"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Receipt, Minus, Plus, Trash2 } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { formatCurrency } from "@/lib/utils";
import type { PosOutlet, PosItem, PosTicketResult, InHouseStay } from "@/lib/pos";

type OutletWithItems = PosOutlet & { items: PosItem[] };
type Line = { item: PosItem; quantity: number };
const input = "w-full bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2";

/** Till: post outlet charges to the in-house guest's folio by room number. */
export default function PosPage() {
  const { data: outlets } = useApi<OutletWithItems[]>("/api/v1/pos/outlets", undefined, ["pos_outlets", "pos_items"]);
  const [outletId, setOutletId] = useState("");
  const [room, setRoom] = useState("");
  const [stay, setStay] = useState<InHouseStay | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [looking, setLooking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [reference, setReference] = useState("");
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<PosTicketResult | null>(null);
  const [error, setError] = useState("");
  const { data: recent, mutate: refreshRecent } = useApi<Array<{ id: string; status: string; total_gbp: number; ticket_reference: string | null; created_at: string; outlet?: { name: string }; booking?: { reference: string; apartment?: { number: string } } }>>(outletId ? `/api/v1/pos/tickets?outlet_id=${outletId}&limit=10` : null);

  const outlet = useMemo(() => (outlets ?? []).find((o) => o.id === outletId) ?? null, [outlets, outletId]);
  useEffect(() => { if (!outletId && outlets?.length) setOutletId(outlets[0].id); }, [outlets, outletId]);
  useEffect(() => { setLines([]); }, [outletId]);

  const categories = useMemo(() => {
    const map = new Map<string, PosItem[]>();
    for (const it of outlet?.items ?? []) { const k = it.category || "Other"; map.set(k, [...(map.get(k) || []), it]); }
    return [...map.entries()];
  }, [outlet]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * Number(l.item.unit_price_gbp), 0);

  const lookup = async () => {
    if (!room.trim()) return;
    setLooking(true); setLookupError(""); setStay(null); setResult(null);
    try {
      const res = await fetch(`/api/v1/pos/in-house?room=${encodeURIComponent(room.trim())}`);
      const json = await res.json();
      if (!res.ok) { setLookupError(json.error?.message || "Room not found"); return; }
      setStay(json.data);
    } finally { setLooking(false); }
  };
  const add = (item: PosItem) => setLines((ls) => { const i = ls.findIndex((l) => l.item.id === item.id); if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], quantity: c[i].quantity + 1 }; return c; } return [...ls, { item, quantity: 1 }]; });
  const bump = (id: string, d: number) => setLines((ls) => ls.map((l) => l.item.id === id ? { ...l, quantity: Math.max(1, l.quantity + d) } : l));
  const remove = (id: string) => setLines((ls) => ls.filter((l) => l.item.id !== id));

  const post = async () => {
    if (!stay || !outlet || lines.length === 0) return;
    setPosting(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/v1/pos/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outlet_id: outlet.id, booking_id: stay.booking_id, ticket_reference: reference || null, items: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity })) }) });
      const json = await res.json();
      if (!res.ok) { setError(json.error?.message || (typeof json.error === "string" ? json.error : "") || "Could not post the ticket"); return; }
      setResult(json.data); setLines([]); setReference("");
      setStay({ ...stay, folio_balance_gbp: json.data.folio_balance_gbp });
      refreshRecent();
    } finally { setPosting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary flex items-center gap-2"><Receipt className="w-6 h-6 text-brand-accent" /> Point of sale</h1>
          <p className="text-sm text-text-secondary mt-1">Charge an outlet ticket to the guest&apos;s room. It appears on the folio immediately, with VAT, and can be voided by a manager.</p>
        </div>
        <select className="bg-brand-card border border-brand-border rounded-lg text-sm px-3 py-2 text-text-primary" value={outletId} onChange={(e) => setOutletId(e.target.value)} data-testid="pos-outlet">
          {(outlets ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="py-4">
              <div className="flex gap-2">
                <input className={input} placeholder="Room number" value={room} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} data-testid="pos-room" />
                <Button onClick={lookup} disabled={looking || !room.trim()} data-testid="pos-lookup">{looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button>
              </div>
              {lookupError && <p className="text-sm text-status-error mt-2" data-testid="pos-lookup-error">{lookupError}</p>}
              {stay && (
                <div className="mt-3 text-sm flex flex-wrap gap-x-6 gap-y-1" data-testid="pos-stay">
                  <span className="text-text-primary font-medium">Room {stay.room_number}</span>
                  <span className="text-text-secondary">{stay.guest_name || "Guest"}</span>
                  <Link href={`/dashboard/bookings/${stay.booking_id}`} className="font-mono text-brand-accent hover:underline">{stay.reference}</Link>
                  <span className="text-text-muted">balance {stay.folio_balance_gbp === null ? "—" : formatCurrency(stay.folio_balance_gbp)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary">{outlet?.name || "Menu"}</h2></CardHeader>
            <CardContent>
              {categories.length === 0 ? <p className="text-sm text-text-muted">No items on this outlet&apos;s menu. Managers add them in Admin.</p> : categories.map(([cat, items]) => (
                <div key={cat} className="mb-4">
                  <p className="text-xs uppercase tracking-wider text-text-muted mb-2">{cat}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {items.map((it) => (
                      <button key={it.id} onClick={() => add(it)} disabled={!stay} className="text-left rounded-lg border border-brand-border bg-brand-bg/40 px-3 py-2 hover:border-brand-accent/60 disabled:opacity-50" data-testid="pos-item">
                        <span className="block text-sm text-text-primary">{it.name}</span>
                        <span className="block text-xs text-text-muted font-mono">{formatCurrency(Number(it.unit_price_gbp))}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary">Ticket</h2></CardHeader>
            <CardContent>
              {lines.length === 0 ? <p className="text-sm text-text-muted">{stay ? "Tap items to add them." : "Find the room first."}</p> : (
                <ul className="divide-y divide-brand-border/60 text-sm" data-testid="pos-lines">
                  {lines.map((l) => (
                    <li key={l.item.id} className="py-2 flex items-center gap-2">
                      <span className="flex-1 text-text-primary">{l.item.name}</span>
                      <button onClick={() => bump(l.item.id, -1)} className="text-text-muted"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-6 text-center">{l.quantity}</span>
                      <button onClick={() => bump(l.item.id, 1)} className="text-text-muted"><Plus className="w-3.5 h-3.5" /></button>
                      <span className="w-16 text-right font-mono">{formatCurrency(l.quantity * Number(l.item.unit_price_gbp))}</span>
                      <button onClick={() => remove(l.item.id)} className="text-text-muted hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-between pt-3 mt-2 border-t border-brand-border text-sm"><span className="text-text-secondary">Subtotal (VAT added on the folio)</span><span className="font-mono text-text-primary" data-testid="pos-subtotal">{formatCurrency(subtotal)}</span></div>
              <input className={`${input} mt-3`} placeholder="Ticket or table reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
              {error && <p className="text-sm text-status-error mt-2" data-testid="pos-error">{error}</p>}
              <Button className="w-full mt-3" onClick={post} disabled={!stay || lines.length === 0 || posting} data-testid="pos-post">{posting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Charge to room${stay ? ` ${stay.room_number}` : ""}`}</Button>
              {result && (
                <p className="text-sm text-status-success mt-3" data-testid="pos-result">Posted {formatCurrency(result.total_gbp)} (incl. VAT {formatCurrency(result.tax_gbp)}) to {result.reference}. Folio balance {formatCurrency(result.folio_balance_gbp)}.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-base font-display font-semibold text-text-primary">Recent tickets</h2></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-brand-border/60 text-sm">
                {(recent ?? []).map((t) => (
                  <li key={t.id} className={`px-4 py-2 flex justify-between gap-2 ${t.status === "voided" ? "opacity-50 line-through" : ""}`}>
                    <span className="text-text-secondary">{t.booking?.apartment?.number ? `Room ${t.booking.apartment.number}` : t.booking?.reference}{t.ticket_reference ? ` · ${t.ticket_reference}` : ""}</span>
                    <span className="font-mono text-text-primary">{formatCurrency(Number(t.total_gbp))}</span>
                  </li>
                ))}
                {(recent ?? []).length === 0 && <li className="px-4 py-4 text-text-muted">No tickets yet today</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
