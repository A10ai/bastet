"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

export default function NewExpensePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amountEgp, setAmountEgp] = useState("");
  const [vendor, setVendor] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("");
  const [isRAndD, setIsRAndD] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description,
          amount_egp: parseFloat(amountEgp),
          vendor: vendor || null,
          invoice_reference: invoiceRef || null,
          expense_date: expenseDate,
          is_recurring: isRecurring,
          recurring_frequency: isRecurring ? recurringFrequency : null,
          is_r_and_d: isRAndD,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create expense");
        return;
      }

      router.push("/dashboard/finance/expenses");
    } catch {
      setError("Failed to create expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/finance/expenses" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Expense</h1>
          <p className="text-sm text-text-secondary mt-1">Record an expense</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Expense Details</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  label="Description"
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  placeholder="What was this expense for?"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Select category...</option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Amount (EGP)"
                    type="number"
                    id="amountEgp"
                    value={amountEgp}
                    onChange={(e) => setAmountEgp(e.target.value)}
                    required
                    min={0.01}
                    step="0.01"
                  />
                  <Input
                    label="Expense Date"
                    type="date"
                    id="expenseDate"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                  />
                  <Input
                    label="Vendor"
                    id="vendor"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Supplier name"
                  />
                </div>
                <Input
                  label="Invoice Reference"
                  id="invoiceRef"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="External invoice number"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-text-primary">Flags</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRAndD}
                    onChange={(e) => setIsRAndD(e.target.checked)}
                    className="w-4 h-4 rounded border-bastet-border text-bastet-gold focus:ring-bastet-gold"
                  />
                  <div>
                    <span className="text-sm font-medium text-text-primary">R&D Expense</span>
                    <p className="text-xs text-text-secondary">Eligible for R&D tax credits</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded border-bastet-border text-bastet-gold focus:ring-bastet-gold"
                  />
                  <div>
                    <span className="text-sm font-medium text-text-primary">Recurring Expense</span>
                    <p className="text-xs text-text-secondary">This expense repeats regularly</p>
                  </div>
                </label>
                {isRecurring && (
                  <div className="ml-7">
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Frequency</label>
                    <select
                      value={recurringFrequency}
                      onChange={(e) => setRecurringFrequency(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Select frequency...</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annually">Annually</option>
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-sm text-status-error">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Expense
            </Button>
            <Link href="/dashboard/finance/expenses">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
