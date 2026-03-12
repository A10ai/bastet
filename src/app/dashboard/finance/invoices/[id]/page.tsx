"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Send,
  CreditCard,
} from "lucide-react";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { Invoice, Payment } from "@/types";
import type { InvoiceLineItem } from "@/types/api";

export default function InvoiceDetailPage() {
  const params = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Payment form
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("card");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const [invRes, payRes] = await Promise.all([
        fetch(`/api/v1/invoices/${params.id}`),
        fetch(`/api/v1/invoices/${params.id}/payments`),
      ]);
      const invJson = await invRes.json();
      const payJson = await payRes.json();
      setInvoice(invJson.data);
      setPayments(payJson.data || []);
    } catch {
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoice();
  }, [params.id]);

  const handleSend = async () => {
    setActionLoading(true);
    try {
      await fetch(`/api/v1/invoices/${params.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      fetchInvoice();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!payAmount || !payMethod) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/invoices/${params.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_gbp: parseFloat(payAmount),
          method: payMethod,
          reference: payRef || null,
          notes: payNotes || null,
        }),
      });
      if (res.ok) {
        setShowPayment(false);
        setPayAmount("");
        setPayRef("");
        setPayNotes("");
        fetchInvoice();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const paidTotal = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount_gbp, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-24">
        <p className="text-text-secondary">Invoice not found</p>
      </div>
    );
  }

  const lineItems = (invoice.line_items || []) as InvoiceLineItem[];
  const invoiceGuest = (invoice as unknown as Record<string, unknown>).guest as { first_name: string; last_name: string; email: string } | null;
  const invoiceBooking = (invoice as unknown as Record<string, unknown>).booking as { reference: string; check_in: string; check_out: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/finance/invoices" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-text-primary">
              {invoice.invoice_number}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Created {timeAgo(invoice.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="status" status={invoice.status} />
          {invoice.status === "draft" && (
            <Button size="sm" onClick={handleSend} disabled={actionLoading}>
              <Send className="w-4 h-4 mr-1" />
              Send
            </Button>
          )}
          {["sent", "partially_paid"].includes(invoice.status) && (
            <Button size="sm" onClick={() => setShowPayment(true)} disabled={actionLoading}>
              <CreditCard className="w-4 h-4 mr-1" />
              Record Payment
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Line Items</h3>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bastet-border">
                    <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Description</th>
                    <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Qty</th>
                    <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Unit Price</th>
                    <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-bastet-border last:border-0">
                      <td className="px-6 py-3 text-sm text-text-primary">{item.description}</td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">{item.quantity}</td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-text-secondary">{formatCurrency(item.unit_price_gbp)}</td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">{formatCurrency(item.total_gbp)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-bastet-border">
                    <td colSpan={3} className="px-6 py-2 text-sm text-right text-text-secondary">Subtotal</td>
                    <td className="px-6 py-2 text-sm text-right font-mono text-text-primary">{formatCurrency(invoice.subtotal_gbp)}</td>
                  </tr>
                  {invoice.tax_amount_gbp > 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-2 text-sm text-right text-text-secondary">Tax</td>
                      <td className="px-6 py-2 text-sm text-right font-mono text-text-primary">{formatCurrency(invoice.tax_amount_gbp)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-bastet-border">
                    <td colSpan={3} className="px-6 py-3 text-sm text-right font-semibold text-text-primary">Total</td>
                    <td className="px-6 py-3 text-sm text-right font-mono font-semibold text-bastet-gold">{formatCurrency(invoice.total_gbp)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Payment Form */}
          {showPayment && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Record Payment</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={`Amount (GBP) — Outstanding: ${formatCurrency(invoice.total_gbp - paidTotal)}`}
                    type="number"
                    id="payAmount"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    min={0.01}
                    step="0.01"
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Method</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Reference" id="payRef" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction ref..." />
                  <Input label="Notes" id="payNotes" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional notes..." />
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={handleRecordPayment} disabled={!payAmount || actionLoading}>
                    Record Payment
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowPayment(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payments History */}
          {payments.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Payments ({formatCurrency(paidTotal)} of {formatCurrency(invoice.total_gbp)})
                </h3>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bastet-border">
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Date</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Method</th>
                      <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Amount</th>
                      <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay) => (
                      <tr key={pay.id} className="border-b border-bastet-border last:border-0">
                        <td className="px-6 py-3 text-sm text-text-secondary">
                          {pay.received_at ? formatDate(pay.received_at) : timeAgo(pay.created_at)}
                        </td>
                        <td className="px-6 py-3 text-sm text-text-primary capitalize">
                          {pay.method.replace("_", " ")}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">
                          {formatCurrency(pay.amount_gbp)}
                        </td>
                        <td className="px-6 py-3 text-sm text-text-secondary">
                          {pay.reference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Details</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  <Badge variant="status" status={invoice.status} />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Due Date</p>
                  <p className="text-sm text-text-primary">{formatDate(invoice.due_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Currency</p>
                  <p className="text-sm text-text-primary">{invoice.guest_currency}</p>
                </div>
                {invoice.fx_rate_used && (
                  <div>
                    <p className="text-xs text-text-muted">FX Rate</p>
                    <p className="text-sm font-mono text-text-primary">{invoice.fx_rate_used}</p>
                  </div>
                )}
                {invoice.total_guest_currency && (
                  <div>
                    <p className="text-xs text-text-muted">Guest Currency Total</p>
                    <p className="text-sm font-mono text-text-primary">
                      {formatCurrency(invoice.total_guest_currency, invoice.guest_currency)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {invoiceGuest && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Guest</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-semibold text-text-primary">
                  {invoiceGuest.first_name} {invoiceGuest.last_name}
                </p>
                <p className="text-sm text-text-secondary">{invoiceGuest.email}</p>
              </CardContent>
            </Card>
          )}

          {invoiceBooking && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Booking</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-mono text-bastet-gold">{invoiceBooking.reference}</p>
                <p className="text-sm text-text-secondary mt-1">
                  {formatDate(invoiceBooking.check_in)} — {formatDate(invoiceBooking.check_out)}
                </p>
              </CardContent>
            </Card>
          )}

          {invoice.notes && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Notes</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-primary whitespace-pre-wrap">{invoice.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
