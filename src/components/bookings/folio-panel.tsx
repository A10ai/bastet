"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCSRFToken } from "@/components/CSRFTokenProvider";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Receipt } from "lucide-react";

interface FolioLine {
  id: string;
  business_date: string;
  type: string;
  description: string;
  quantity: number;
  debit_gbp: number;
  credit_gbp: number;
  reversal_of: string | null;
}
interface FolioPayment { id: string; amount_gbp: number; method: string; status: string; received_at: string }
interface FolioData {
  folio: { id: string; status: string; invoice_id: string | null };
  lines: FolioLine[];
  payments: FolioPayment[];
  balance_gbp: number;
  totals: { charges: number; tax: number; payments: number; refunds: number };
}

/**
 * Guest folio on the booking page: ledger lines, balance, and the front-desk
 * actions (charge, payment, invoice). Refunds and voids need a manager and
 * prompt for a reason.
 */
export function FolioPanel({ bookingId, canManage }: { bookingId: string; canManage: boolean }) {
  const { getCSRFHeaders } = useCSRFToken();
  const [data, setData] = useState<FolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"none" | "charge" | "payment">("none");
  const [charge, setCharge] = useState({ type: "extra", description: "", quantity: "1", unit: "" });
  const [payment, setPayment] = useState({ amount: "", method: "cash", reference: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}/folio`, { credentials: "same-origin" });
      const json = await res.json();
      setData(res.ok ? json.data : null);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/v1/bookings/${bookingId}/folio`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...getCSRFHeaders() },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || (typeof json?.error === "string" ? json.error : JSON.stringify(json?.error)) || `HTTP ${res.status}`);
      setMode("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const voidLine = (line: FolioLine) => {
    const reason = window.prompt(`Reason for voiding "${line.description}"?`);
    if (reason && reason.trim().length >= 3) act({ action: "void_line", line_id: line.id, reason: reason.trim() });
  };
  const refund = (p: FolioPayment) => {
    const amount = window.prompt(`Refund amount (max ${p.amount_gbp})`, String(p.amount_gbp));
    if (!amount) return;
    const reason = window.prompt("Reason for the refund?");
    if (reason && reason.trim().length >= 3) act({ action: "refund", payment_id: p.id, amount_gbp: Number(amount), reason: reason.trim() });
  };

  return (
    <Card data-testid="folio-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-text-primary">Guest folio</h3>
          </div>
          {data && (
            <span className={`text-sm font-mono ${data.balance_gbp > 0.005 ? "text-amber-300" : "text-emerald-300"}`} data-testid="folio-balance">
              Balance {formatCurrency(data.balance_gbp)}
            </span>
          )}
        </div>
        {data && <p className="text-xs text-text-muted mt-1">Status {data.folio.status}{data.folio.invoice_id ? " · invoiced" : ""}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Loading folio…</div>
        ) : !data ? (
          <p className="text-sm text-text-muted">No folio yet. It opens at check-in, or when a deposit is taken.</p>
        ) : (
          <>
            <ul className="divide-y divide-bastet-border text-sm">
              {data.lines.length === 0 && <li className="py-2 text-text-muted">No charges posted yet.</li>}
              {data.lines.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate ${l.type === "reversal" ? "text-text-muted line-through" : "text-text-primary"}`}>{l.description}</p>
                    <p className="text-xs text-text-muted">{l.business_date} · {l.type}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-mono ${Number(l.credit_gbp) > 0 ? "text-emerald-300" : "text-text-primary"}`}>
                      {Number(l.credit_gbp) > 0 ? `-${formatCurrency(Number(l.credit_gbp))}` : formatCurrency(Number(l.debit_gbp))}
                    </span>
                    {canManage && data.folio.status === "open" && ["room", "extra", "fnb", "adjustment", "levy"].includes(l.type) && (
                      <button type="button" onClick={() => voidLine(l)} className="text-xs text-text-muted hover:text-status-error" disabled={busy}>void</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary border-t border-bastet-border pt-2">
              <span>Charges {formatCurrency(data.totals.charges)}</span><span className="text-right">VAT {formatCurrency(data.totals.tax)}</span>
              <span>Payments {formatCurrency(data.totals.payments)}</span><span className="text-right">Refunds {formatCurrency(data.totals.refunds)}</span>
            </div>
            {canManage && data.payments.filter((p) => p.status !== "refunded").length > 0 && (
              <div className="text-xs text-text-muted">
                {data.payments.filter((p) => p.status !== "refunded").map((p) => (
                  <button key={p.id} type="button" onClick={() => refund(p)} disabled={busy} className="mr-3 underline hover:text-text-primary">
                    refund {formatCurrency(Number(p.amount_gbp))} ({p.method})
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="p-2 rounded border border-status-error/20 bg-status-error/10 text-xs text-status-error">{error}</div>}

        {data?.folio.status !== "closed" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === "charge" ? "none" : "charge")} disabled={busy}>Add charge</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === "payment" ? "none" : "payment")} disabled={busy}>Take payment</Button>
            {data && !data.folio.invoice_id && (
              <Button size="sm" variant="secondary" onClick={() => act({ action: "issue_invoice" })} disabled={busy}>Issue invoice</Button>
            )}
          </div>
        )}

        {mode === "charge" && (
          <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "post_charge", type: charge.type, description: charge.description, quantity: Number(charge.quantity), unit_amount_gbp: Number(charge.unit) }); }}>
            <select value={charge.type} onChange={(e) => setCharge({ ...charge, type: e.target.value })} className="col-span-2 px-3 py-2 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary" aria-label="Charge type">
              <option value="extra">Extra</option><option value="fnb">Food &amp; beverage</option><option value="adjustment">Adjustment</option>
            </select>
            <Input id="charge-desc" label="Description" value={charge.description} onChange={(e) => setCharge({ ...charge, description: e.target.value })} required className="col-span-2" />
            <Input id="charge-qty" label="Quantity" type="number" min="0.01" step="0.01" value={charge.quantity} onChange={(e) => setCharge({ ...charge, quantity: e.target.value })} required />
            <Input id="charge-unit" label="Unit price (GBP, before VAT)" type="number" min="0" step="0.01" value={charge.unit} onChange={(e) => setCharge({ ...charge, unit: e.target.value })} required />
            <Button type="submit" size="sm" disabled={busy} className="col-span-2">{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Post charge</Button>
          </form>
        )}
        {mode === "payment" && (
          <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "post_payment", amount_gbp: Number(payment.amount), method: payment.method, reference: payment.reference || undefined }); }}>
            <Input id="pay-amount" label="Amount (GBP)" type="number" min="0.01" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required />
            <div>
              <label htmlFor="pay-method" className="block text-sm font-medium text-text-secondary mb-1.5">Method</label>
              <select id="pay-method" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-sm text-text-primary">
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
              </select>
            </div>
            <Input id="pay-ref" label="Reference (optional)" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} className="col-span-2" />
            <Button type="submit" size="sm" disabled={busy} className="col-span-2">{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Record payment</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
