"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/lib/constants";

interface LineItem {
  description: string;
  quantity: number;
  unit_price_gbp: number;
}

interface GuestOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface BookingOption {
  id: string;
  reference: string;
  total_amount_gbp: number;
  guest?: { first_name: string; last_name: string } | null;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);

  const [guestId, setGuestId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [guestCurrency, setGuestCurrency] = useState("GBP");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price_gbp: 0 },
  ]);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/guests").then((r) => r.json()),
      fetch("/api/v1/bookings").then((r) => r.json()),
    ]).then(([guestRes, bookingRes]) => {
      setGuests(guestRes.data || []);
      setBookings(bookingRes.data || []);
    });

    // Default due date: 14 days from now
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setDueDate(due.toISOString().split("T")[0]);
  }, []);

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price_gbp: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_gbp,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validItems = lineItems.filter((item) => item.description && item.unit_price_gbp > 0);
    if (!validItems.length) {
      setError("At least one line item with a description and price is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: guestId || null,
          booking_id: bookingId || null,
          guest_currency: guestCurrency,
          due_date: dueDate,
          notes: notes || null,
          line_items: validItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to create invoice");
        return;
      }

      const { data } = await res.json();
      router.push(`/dashboard/finance/invoices/${data.id}`);
    } catch {
      setError("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/finance/invoices" className="p-2 rounded-lg hover:bg-bastet-card transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-text-primary">New Invoice</h1>
          <p className="text-sm text-text-secondary mt-1">Create a new invoice</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Guest & Booking */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Details</h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Guest</label>
                    <select
                      value={guestId}
                      onChange={(e) => setGuestId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">No guest</option>
                      {guests.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.first_name} {g.last_name} {g.email ? `(${g.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Booking</label>
                    <select
                      value={bookingId}
                      onChange={(e) => setBookingId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      <option value="">Manual invoice</option>
                      {bookings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.reference} — {formatCurrency(b.total_amount_gbp)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">Currency</label>
                    <select
                      value={guestCurrency}
                      onChange={(e) => setGuestCurrency(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Due Date"
                    type="date"
                    id="dueDate"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-text-primary">Line Items</h3>
                  <Button type="button" size="sm" variant="secondary" onClick={addLineItem}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-5">
                        <Input
                          label={index === 0 ? "Description" : undefined}
                          id={`desc-${index}`}
                          value={item.description}
                          onChange={(e) => updateLineItem(index, "description", e.target.value)}
                          placeholder="Item description..."
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          label={index === 0 ? "Qty" : undefined}
                          type="number"
                          id={`qty-${index}`}
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                          min={1}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          label={index === 0 ? "Unit Price (GBP)" : undefined}
                          type="number"
                          id={`price-${index}`}
                          value={item.unit_price_gbp || ""}
                          onChange={(e) => updateLineItem(index, "unit_price_gbp", parseFloat(e.target.value) || 0)}
                          min={0}
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-1 text-right text-sm font-mono text-text-secondary pb-2.5">
                        {formatCurrency(item.quantity * item.unit_price_gbp)}
                      </div>
                      <div className="col-span-1 pb-2.5">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-1 text-text-muted hover:text-status-error transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Notes</h3>
              </CardHeader>
              <CardContent>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-bastet-bg border border-bastet-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-bastet-gold/50"
                  placeholder="Invoice notes..."
                />
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
                Create Invoice
              </Button>
              <Link href="/dashboard/finance/invoices">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
            </div>
          </div>

          {/* Sidebar - Preview */}
          <div>
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-text-primary">Summary</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Items</span>
                    <span className="text-text-primary">{lineItems.filter((i) => i.description).length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Subtotal</span>
                    <span className="font-mono text-text-primary">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="border-t border-bastet-border pt-3 flex justify-between text-sm font-semibold">
                    <span className="text-text-primary">Total</span>
                    <span className="font-mono text-bastet-gold">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
