"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { RatePlan, StayQuote } from "@/lib/rate-plans";
import { describeCancellation } from "@/lib/rate-plans";

interface PriceCalculatorProps {
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guestCurrency?: string;
  /** Selected rate plan; null means the property's default plan. */
  ratePlanId?: string | null;
  onRatePlanChange?: (id: string | null) => void;
}

/**
 * Live price preview for the booking form. Prices come from
 * GET /api/v1/bookings/quote (the same `quote_stay` function the booking
 * route uses), so the preview and the booking can never disagree.
 */
export function PriceCalculator({ apartmentId, checkIn, checkOut, ratePlanId = null, onRatePlanChange }: PriceCalculatorProps) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [quote, setQuote] = useState<StayQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/rate-plans")
      .then((r) => r.json())
      .then((j) => setPlans(j.data || []))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (!apartmentId || !checkIn || !checkOut || checkOut <= checkIn) {
      setQuote(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ apartment_id: apartmentId, check_in: checkIn, check_out: checkOut });
        if (ratePlanId) params.set("rate_plan_id", ratePlanId);
        const res = await fetch(`/api/v1/bookings/quote?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) {
          setQuote(null);
          setError(json.error?.message || json.error || "Could not price this stay");
          return;
        }
        setQuote(json.data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Could not price this stay");
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [apartmentId, checkIn, checkOut, ratePlanId]);

  const planSelect = plans.length > 0 && (
    <label className="block text-xs text-text-muted mb-3">
      Rate plan
      <select
        className="mt-1 w-full bg-brand-bg border border-brand-border rounded-lg text-sm text-text-primary px-3 py-2"
        value={ratePlanId ?? ""}
        onChange={(e) => onRatePlanChange?.(e.target.value || null)}
        data-testid="rate-plan-select"
      >
        <option value="">Default ({plans.find((p) => p.is_default)?.name || "Best Available Rate"})</option>
        {plans.filter((p) => !p.is_default).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-text-primary">Price Preview</h3>
      </CardHeader>
      <CardContent>
        {planSelect}
        {!apartmentId || !checkIn || !checkOut ? (
          <p className="text-sm text-text-muted">Select an apartment and dates to see the price.</p>
        ) : loading && !quote ? (
          <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="w-4 h-4 animate-spin" /> Pricing...</div>
        ) : error ? (
          <p className="text-sm text-status-error" data-testid="quote-error">{error}</p>
        ) : quote ? (
          <div className="space-y-2 text-sm" data-testid="quote">
            {quote.rate_plan && (
              <div className="rounded-lg border border-brand-border bg-brand-bg/40 p-3 mb-2">
                <p className="text-text-primary font-medium">{quote.rate_plan.name}</p>
                <p className="text-xs text-text-muted">{describeCancellation(quote.rate_plan)}{quote.rate_plan.includes_breakfast ? " · breakfast included" : ""}</p>
              </div>
            )}
            <div className="flex justify-between"><span className="text-text-secondary">Nights</span><span className="text-text-primary">{quote.nights}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Average per night</span><span className="text-text-primary">{formatCurrency(quote.rate_per_night_gbp)}</span></div>
            {quote.discount_percentage > 0 && (
              <div className="flex justify-between"><span className="text-text-secondary">Saving vs. seasonal rate</span><span className="text-status-success">-{quote.discount_percentage}% ({formatCurrency(quote.bar_total_gbp - quote.total_gbp)})</span></div>
            )}
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer">Per night</summary>
              <ul className="mt-1 space-y-0.5">
                {quote.nightly.map((n) => (
                  <li key={n.date} className="flex justify-between"><span>{n.date} · {n.season}</span><span>{formatCurrency(n.rate_gbp)}</span></li>
                ))}
              </ul>
            </details>
            <div className="flex justify-between pt-2 border-t border-brand-border font-semibold">
              <span className="text-text-primary">Total</span>
              <span className="text-brand-accent" data-testid="quote-total">{formatCurrency(quote.total_gbp)}</span>
            </div>
            <p className="text-xs text-text-muted">Excludes VAT and tourism levy, posted per night to the folio.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
