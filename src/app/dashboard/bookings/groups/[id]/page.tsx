"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Wallet, Ban, Plus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { GROUP_STATUS_LABEL, type GroupStatement } from "@/lib/groups";

const input = "w-full bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2";

type ApartmentRow = { id: string; number: string; status: string; apartment_type?: { name?: string } | null };
type BookingRow = { apartment_id: string; status: string };

/** One group: statement, room block, organiser payment, confirm and cancel. */
export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: statement, isLoading, mutate } = useApi<GroupStatement>(`/api/v1/groups/${id}`, undefined, ["bookings", "folio_lines", "booking_groups"]);
  const group = statement?.group;
  const { data: apartments } = useApi<ApartmentRow[]>("/api/v1/apartments?limit=500", undefined, ["apartments"]);
  const { data: overlapping } = useApi<BookingRow[]>(group ? `/api/v1/bookings?date_from=${group.check_in}&date_to=${group.check_out}&limit=1000` : null, undefined, ["bookings"]);

  const [selected, setSelected] = useState<string[]>([]);
  const [payment, setPayment] = useState({ amount_gbp: "", method: "bank_transfer", reference: "" });
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const freeRooms = useMemo(() => {
    const taken = new Set((overlapping ?? []).filter((b) => !["cancelled", "no_show"].includes(b.status)).map((b) => b.apartment_id));
    const inGroup = new Set((statement?.rooms ?? []).map((r) => r.apartment_id));
    return (apartments ?? []).filter((a) => !["maintenance", "blocked", "out_of_service"].includes(a.status) && !taken.has(a.id) && !inGroup.has(a.id));
  }, [apartments, overlapping, statement]);

  const call = async (label: string, url: string, init: RequestInit, ok: string) => {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.details ? Object.values(json.details as Record<string, string>).join("; ") : "";
        setMessage({ kind: "error", text: json.error?.message || (typeof json.error === "string" ? json.error : "") || detail || "Request failed" });
        return false;
      }
      setMessage({ kind: "ok", text: ok });
      mutate();
      return true;
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && !statement) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-brand-accent" /></div>;
  if (!group) return <div className="py-24 text-center text-text-muted">Group not found</div>;
  const open = group.status === "tentative" || group.status === "confirmed";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
            <Link href="/dashboard/bookings" className="hover:text-brand-accent">Bookings</Link><span>/</span>
            <Link href="/dashboard/bookings/groups" className="hover:text-brand-accent">Groups</Link><span>/</span>
            <span className="text-text-secondary font-mono">{group.reference}</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-text-primary flex items-center gap-2"><Users className="w-6 h-6 text-brand-accent" /> {group.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatDate(group.check_in)} – {formatDate(group.check_out)} · {GROUP_STATUS_LABEL[group.status]} · {group.billing_mode === "master" ? "organiser settles" : "each room pays its own folio"}
            {group.organiser_name ? ` · ${group.organiser_name}` : ""}{group.company ? ` (${group.company})` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {group.status === "tentative" && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => call("confirm", `/api/v1/groups/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) }, "Group confirmed; rooms are now confirmed bookings")}>Confirm group</Button>
          )}
          {open && (
            <Button variant="danger" disabled={busy !== null} onClick={() => setShowCancel((v) => !v)} data-testid="group-cancel">
              <Ban className="w-4 h-4 mr-2" /> Cancel group
            </Button>
          )}
        </div>
      </div>

      {showCancel && (
        <Card className="border-status-error/40"><CardContent className="py-4 flex flex-col md:flex-row gap-3 md:items-end">
          <label className="text-xs text-text-muted flex-1">Reason for cancelling the whole group (rooms not yet in house are released)
            <input className={input} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} data-testid="group-cancel-reason" />
          </label>
          <Button variant="danger" size="sm" disabled={cancelReason.trim().length < 3 || busy !== null} data-testid="group-cancel-confirm" onClick={async () => { const ok = await call("cancel", `/api/v1/groups/${id}`, { method: "DELETE", body: JSON.stringify({ reason: cancelReason.trim() }) }, "Group cancelled and rooms released"); if (ok) setShowCancel(false); }}>Confirm cancellation</Button>
        </CardContent></Card>
      )}
      {message && <p className={`text-sm ${message.kind === "ok" ? "text-status-success" : "text-status-error"}`} data-testid="group-message">{message.text}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Rooms", `${statement.room_count}${group.rooms_requested ? ` / ${group.rooms_requested}` : ""}`],
          ["Contract value", formatCurrency(statement.contract_total_gbp)],
          ["Paid", formatCurrency(statement.paid_gbp)],
          ["Balance", formatCurrency(statement.balance_gbp)],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="py-4"><p className="text-xs text-text-muted">{label}</p><p className="text-lg font-semibold font-mono text-text-primary" data-testid={`group-${label.toLowerCase().replace(/ /g, "-")}`}>{value}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary">Rooms</h2></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm" data-testid="group-rooms">
            <thead><tr className="border-b border-brand-border text-left text-xs uppercase tracking-wider text-text-muted"><th className="py-2 px-4">Room</th><th className="py-2 px-4">Guest</th><th className="py-2 px-4">Booking</th><th className="py-2 px-4 text-right">Contract</th><th className="py-2 px-4 text-right">Charged</th><th className="py-2 px-4 text-right">Paid</th><th className="py-2 px-4 text-right">Balance</th></tr></thead>
            <tbody>
              {statement.rooms.map((r) => (
                <tr key={r.booking_id} className="border-b border-brand-border/50">
                  <td className="py-2 px-4 text-text-primary">{r.apartment_number}<span className="block text-xs text-text-muted">{r.apartment_type}</span></td>
                  <td className="py-2 px-4 text-text-secondary">{r.guest_name || <span className="text-text-muted italic">rooming list pending</span>}</td>
                  <td className="py-2 px-4"><Link href={`/dashboard/bookings/${r.booking_id}`} className="font-mono text-brand-accent hover:underline">{r.reference}</Link><span className="block text-xs text-text-muted">{r.status.replace("_", " ")}</span></td>
                  <td className="py-2 px-4 text-right font-mono">{formatCurrency(r.contract_total_gbp)}</td>
                  <td className="py-2 px-4 text-right font-mono">{formatCurrency(r.charged_gbp)}</td>
                  <td className="py-2 px-4 text-right font-mono">{formatCurrency(r.paid_gbp)}</td>
                  <td className={`py-2 px-4 text-right font-mono ${r.balance_gbp > 0 ? "text-status-warning" : ""}`}>{formatCurrency(r.balance_gbp)}</td>
                </tr>
              ))}
              {statement.rooms.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-text-muted">No rooms blocked yet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Block rooms</h2><p className="text-xs text-text-muted">Free for {formatDate(group.check_in)} – {formatDate(group.check_out)}. All selected rooms are booked together or not at all.</p></CardHeader>
            <CardContent>
              <div className="max-h-56 overflow-y-auto border border-brand-border rounded-lg divide-y divide-brand-border/50" data-testid="free-rooms">
                {freeRooms.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-brand-bg/40">
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} />
                    <span className="text-text-primary">{a.number}</span><span className="text-text-muted text-xs">{a.apartment_type?.name}</span>
                  </label>
                ))}
                {freeRooms.length === 0 && <p className="px-3 py-4 text-sm text-text-muted">No free rooms for these dates</p>}
              </div>
              <div className="flex justify-end mt-3">
                <Button size="sm" disabled={selected.length === 0 || busy !== null} data-testid="group-add-rooms" onClick={async () => { const ok = await call("rooms", `/api/v1/groups/${id}/rooms`, { method: "POST", body: JSON.stringify({ apartment_ids: selected }) }, `${selected.length} room(s) blocked`); if (ok) setSelected([]); }}>
                  {busy === "rooms" ? <Loader2 className="w-4 h-4 animate-spin" /> : `Block ${selected.length || ""} room${selected.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-lg font-display font-semibold text-text-primary flex items-center gap-2"><Wallet className="w-4 h-4" /> Organiser payment</h2><p className="text-xs text-text-muted">Allocated across the rooms that owe money, largest balance first. Shows on each room&apos;s folio.</p></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-text-muted">Amount (GBP)<input type="number" min={0.01} step="0.01" className={input} value={payment.amount_gbp} onChange={(e) => setPayment({ ...payment, amount_gbp: e.target.value })} data-testid="group-payment-amount" /></label>
                <label className="text-xs text-text-muted">Method
                  <select className={input} value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>
                    <option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option>
                  </select>
                </label>
                <label className="text-xs text-text-muted">Reference<input className={input} value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></label>
              </div>
              <div className="flex justify-end mt-3">
                <Button size="sm" disabled={!payment.amount_gbp || Number(payment.amount_gbp) <= 0 || busy !== null} data-testid="group-pay" onClick={async () => { const ok = await call("pay", `/api/v1/groups/${id}/payments`, { method: "POST", body: JSON.stringify({ amount_gbp: Number(payment.amount_gbp), method: payment.method, reference: payment.reference || null }) }, `Payment of ${formatCurrency(Number(payment.amount_gbp))} recorded`); if (ok) setPayment({ ...payment, amount_gbp: "", reference: "" }); }}>
                  {busy === "pay" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record payment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {group.notes && <Card><CardContent className="py-4 text-sm text-text-secondary whitespace-pre-line">{group.notes}</CardContent></Card>}
    </div>
  );
}
