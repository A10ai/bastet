"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { formatMoney, type BookLocale, type BookStrings } from "@/lib/book-i18n";
import { inputClass, primaryButton, readError } from "./types";

interface IntentData {
  client_secret: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  amount_gbp: number;
  fx_rate: number;
  publishable_key: string | null;
}

const stripeCache = new Map<string, Promise<StripeJs | null>>();
function stripeFor(key: string) {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key));
  return stripeCache.get(key)!;
}

/**
 * Deposit payment with Stripe's Payment Element. The intent is created on
 * our server for the amount still due, in the currency the guest picks;
 * card details go straight to Stripe. On success the page polls the booking
 * until the webhook has confirmed it.
 */
export function PayPanel({ token, s, locale, currencies, dueGbp, onPaid }: {
  token: string;
  s: BookStrings;
  locale: BookLocale;
  currencies: string[];
  dueGbp: number;
  onPaid: () => void;
}) {
  const [currency, setCurrency] = useState<string>(currencies[0] || "GBP");
  const [intent, setIntent] = useState<IntentData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIntent(null);
    setError("");
    fetch(`/api/v1/book/${token}/payment-intent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency }) })
      .then(async (r) => {
        if (!r.ok) throw await readError(r, s.errorGeneric);
        const j = await r.json();
        if (!cancelled) setIntent(j.data as IntentData);
      })
      .catch((e: { message?: string }) => { if (!cancelled) setError(e?.message || s.errorGeneric); });
    return () => { cancelled = true; };
  }, [token, currency, s.errorGeneric]);

  const stripePromise = useMemo(() => (intent?.publishable_key ? stripeFor(intent.publishable_key) : null), [intent?.publishable_key]);
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <section className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-3" data-testid="pay-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{s.payDeposit}</h2>
        {currencies.length > 1 && (
          <label className="text-xs text-text-muted flex items-center gap-2">{s.currency}
            <select className={`${inputClass} w-auto py-1`} value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="pay-currency">
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-sm">
        <span className="text-text-muted">{s.dueNow}: </span>
        <span className="font-semibold">{intent ? formatMoney(intent.currency === "GBP" ? intent.amount_gbp : intent.amount / 100, intent.currency, locale) : formatMoney(dueGbp, "GBP", locale)}</span>
        {intent && intent.currency !== "GBP" && <span className="text-xs text-text-muted"> ({formatMoney(intent.amount_gbp, "GBP", locale)})</span>}
      </p>
      {error && <p className="text-xs text-status-error" data-testid="pay-error">{error}</p>}
      {intent && stripePromise ? (
        <Elements key={intent.client_secret} stripe={stripePromise} options={{ clientSecret: intent.client_secret, locale: locale, appearance: { theme: dark ? "night" : "stripe", variables: { colorPrimary: dark ? "#22D3EE" : "#0891B2", borderRadius: "8px" } } }}>
          <CheckoutForm s={s} onPaid={onPaid} />
        </Elements>
      ) : !error ? (
        <p className="text-xs text-text-muted">{s.loading}</p>
      ) : null}
      <p className="text-[11px] text-text-muted">{s.paySecure}</p>
    </section>
  );
}

function CheckoutForm({ s, onPaid }: { s: BookStrings; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (err) {
      setError(err.message || s.errorGeneric);
      setBusy(false);
      return;
    }
    if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) onPaid();
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-xs text-status-error" data-testid="card-error">{error}</p>}
      <button type="submit" className={primaryButton} disabled={!stripe || busy} data-testid="pay-submit">{busy ? s.paying : s.payDeposit}</button>
    </form>
  );
}
