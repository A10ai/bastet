"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";

const input = "bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2";
const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const todayStr = () => new Date().toISOString().slice(0, 10);

/** Download the double-entry journal or the account summary for a period (managers). */
export function AccountingExportCard() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const href = (type: "journal" | "summary") => `/api/v1/finance/export?from=${from}&to=${to}&type=${type}&format=csv`;
  return (
    <Card data-testid="accounting-export">
      <CardHeader>
        <h2 className="text-lg font-display font-semibold text-text-primary flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-brand-accent" /> Accounting export</h2>
        <p className="text-xs text-text-muted">A balanced double-entry journal from the guest ledger, by business date, mapped to your chart of accounts. Import the CSV into Xero, QuickBooks or Sage.</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-text-muted">From<br /><input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="export-from" /></label>
          <label className="text-xs text-text-muted">To<br /><input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} data-testid="export-to" /></label>
          <a href={valid ? href("journal") : undefined} aria-disabled={!valid} data-testid="export-journal"><Button size="sm" disabled={!valid}><Download className="w-4 h-4 mr-2" /> Journal CSV</Button></a>
          <a href={valid ? href("summary") : undefined} aria-disabled={!valid} data-testid="export-summary"><Button size="sm" variant="secondary" disabled={!valid}><Download className="w-4 h-4 mr-2" /> Account summary CSV</Button></a>
        </div>
      </CardContent>
    </Card>
  );
}
