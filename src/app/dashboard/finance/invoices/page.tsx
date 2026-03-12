"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Filter, Loader2, Plus } from "lucide-react";
import { INVOICE_STATUSES } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice } from "@/types";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/invoices");
        const json = await res.json();
        setInvoices(json.data || []);
      } catch {
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  const filtered =
    statusFilter === "all"
      ? invoices
      : invoices.filter((inv) => inv.status === statusFilter);

  const statusCounts = INVOICE_STATUSES.reduce(
    (acc, s) => {
      acc[s] = invoices.filter((inv) => inv.status === s).length;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/finance" className="text-sm text-text-secondary hover:text-bastet-gold">
              Finance
            </Link>
            <span className="text-text-muted">/</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-text-primary">Invoices</h1>
          <p className="text-sm text-text-secondary mt-1">{invoices.length} invoices</p>
        </div>
        <Link href="/dashboard/finance/invoices/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </Link>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-bastet-gold text-bastet-bg"
              : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
          }`}
        >
          All ({invoices.length})
        </button>
        {INVOICE_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              statusFilter === status
                ? "bg-bastet-gold text-bastet-bg"
                : "bg-bastet-card border border-bastet-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bastet-gold" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-bastet-border">
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Guest</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Booking</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Total</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-muted px-6 py-3">Due Date</th>
                  <th className="text-right text-xs font-medium text-text-muted px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const invAny = inv as unknown as Record<string, unknown>;
                  const guestData = invAny.guest as { first_name: string; last_name: string } | null;
                  const bookingData = invAny.booking as { reference: string } | null;
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-bastet-border last:border-0 hover:bg-bastet-bg/50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <span className="text-sm font-mono font-semibold text-bastet-gold">
                          {inv.invoice_number}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-text-primary">
                        {guestData ? `${guestData.first_name} ${guestData.last_name}` : "—"}
                      </td>
                      <td className="px-6 py-3 text-sm font-mono text-text-secondary">
                        {bookingData?.reference || "—"}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono text-text-primary">
                        {formatCurrency(inv.total_gbp)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="status" status={inv.status} />
                      </td>
                      <td className="px-6 py-3 text-sm text-text-secondary">
                        {formatDate(inv.due_date)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/dashboard/finance/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-bastet-gold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Filter className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-secondary">No invoices found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
