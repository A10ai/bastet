"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BOOK_STRINGS, detectBookLocale, formatDay, formatMoney, nightsLabel, type BookLocale } from "@/lib/book-i18n";
import { HoldTimer } from "@/components/book/hold-timer";
import { PayPanel } from "@/components/book/pay-panel";
import { primaryButton, readError, secondaryButton, type BookingStatusResponse } from "@/components/book/types";

/**
 * Pay-and-manage page for one online booking. The token in the URL is the
 * credential. Pending: countdown + Payment Element (or request-to-book when
 * cards are off). After payment the page polls until the webhook confirms.
 * Confirmed/cancelled: the summary and, where the terms allow, cancellation.
 */
export default function BookTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-sm text-text-muted">...</main>}>
      <BookTokenInner token={token} />
    </Suspense>
  );
}

function BookTokenInner({ token }: { token: string }) {
  const qs = useSearchParams();
  const [locale, setLocale] = useState<BookLocale>("en");
  const s = BOOK_STRINGS[locale];
  const [data, setData] = useState<BookingStatusResponse | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [phase, setPhase] = useState<"idle" | "awaiting_confirmation" | "requested" | "expired">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => { setLocale(detectBookLocale(qs.get("lang"), typeof navigator !== "undefined" ? navigator.languages : [])); }, [qs]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/book/${token}`, { cache: "no-store" });
    if (!r.ok) { setState("invalid"); return null; }
    const j = (await r.json()).data as BookingStatusResponse;
    setData(j);
    setState("ok");
    if (j.booking.locale && !qs.get("lang")) setLocale(detectBookLocale(j.booking.locale));
    return j;
  }, [token, qs]);

  useEffect(() => { void load(); }, [load]);

  // Returning from a 3-D Secure redirect: Stripe appends redirect_status.
  useEffect(() => {
    if (qs.get("redirect_status") === "succeeded" || qs.get("redirect_status") === "processing") setPhase("awaiting_confirmation");
  }, [qs]);

  // Poll until the webhook has confirmed (or 90 s).
  useEffect(() => {
    if (phase !== "awaiting_confirmation") return;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const j = await load();
      if ((j && j.booking.status !== "pending") || tries > 45) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        if (j && j.booking.status === "confirmed") setPhase("idle");
      }
    };
    pollRef.current = window.setInterval(tick, 2000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [phase, load]);

  const requestToBook = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/v1/book/${token}/request`, { method: "POST" });
      if (!r.ok) throw await readError(r, s.errorGeneric);
      setPhase("requested");
      await load();
    } catch (e) { setError((e as { message?: string })?.message || s.errorGeneric); } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm(s.cancelConfirm)) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/v1/book/${token}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw await readError(r, s.errorGeneric);
      await load();
    } catch (e) { setError((e as { message?: string })?.message || s.errorGeneric); } finally { setBusy(false); }
  };

  if (state === "loading") return <main className="min-h-screen flex items-center justify-center text-sm text-text-muted">{s.loading}</main>;
  if (state === "invalid" || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="book-invalid">
          <h1 className="text-xl font-semibold">{s.invalidLink}</h1>
          <p className="text-sm text-text-secondary mt-2">{s.invalidLinkBody}</p>
        </div>
      </main>
    );
  }
  const b = data.booking;
  const holdOver = phase === "expired" || (b.status === "pending" && b.hold_expires_at !== null && new Date(b.hold_expires_at).getTime() <= Date.now() && phase !== "requested" && phase !== "awaiting_confirmation");
  const statusLabel = b.status === "pending" ? s.status_pending : b.status === "confirmed" ? s.status_confirmed : b.status === "cancelled" ? s.status_cancelled : b.status;

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-text-muted">{data.property?.name}</p>
        <h1 className="text-2xl font-semibold mt-1" data-testid="book-status-title">
          {b.status === "confirmed" ? s.confirmedTitle : b.status === "cancelled" ? s.status_cancelled : phase === "awaiting_confirmation" ? s.processingTitle : phase === "requested" ? s.requestSent : holdOver ? s.holdExpired : s.holdTitle}
        </h1>
        <p className="text-sm text-text-secondary mt-1">{s.reference} <span className="font-mono" data-testid="book-reference">{b.reference}</span> · <span data-testid="book-status">{statusLabel}</span></p>
        {b.status === "pending" && !holdOver && phase === "idle" && <div className="mt-2"><HoldTimer expiresAt={b.hold_expires_at} s={s} onExpired={() => setPhase("expired")} /></div>}
      </header>

      {b.status === "confirmed" && <p className="text-sm text-status-success" data-testid="book-confirmed">{s.confirmedBody}</p>}
      {b.status === "cancelled" && <p className="text-sm text-text-secondary">{s.cancelled}</p>}

      <div className="grid gap-4 md:grid-cols-5">
        <section className="md:col-span-2 rounded-xl border border-brand-border bg-brand-card p-4 text-sm space-y-2 h-fit" data-testid="book-summary">
          <h2 className="text-base font-semibold">{s.summary}</h2>
          <div className="flex justify-between"><span className="text-text-muted">{s.checkIn}</span><span>{formatDay(b.check_in, locale)}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">{s.checkOut}</span><span>{formatDay(b.check_out, locale)}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">{s.guests}</span><span>{b.adults} + {b.children}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">{nightsLabel(b.nights, s)}</span><span>{formatMoney(b.rate_per_night_gbp, "GBP", locale)} {s.perNight}</span></div>
          <div className="flex justify-between font-semibold border-t border-brand-border pt-2"><span>{s.total}</span><span>{formatMoney(b.total_gbp, "GBP", locale)}</span></div>
          <div className="flex justify-between"><span className="text-text-muted">{s.paid}</span><span>{formatMoney(b.paid_gbp, "GBP", locale)}</span></div>
          {b.status !== "cancelled" && <div className="flex justify-between"><span className="text-text-muted">{s.balance}</span><span>{formatMoney(b.balance_gbp, "GBP", locale)}</span></div>}
          {b.rate_plan && <p className="text-xs text-text-secondary pt-2 border-t border-brand-border">{b.rate_plan.name}: {b.rate_plan.cancellation}{b.rate_plan.includes_breakfast ? ` · ${s.includesBreakfast}` : ""}</p>}
        </section>

        <div className="md:col-span-3 space-y-4">
          {b.status === "pending" && phase === "idle" && !holdOver && b.due_now_gbp > 0 && (
            data.card_payments ? (
              <PayPanel token={token} s={s} locale={locale} currencies={data.currencies} dueGbp={b.due_now_gbp} onPaid={() => setPhase("awaiting_confirmation")} />
            ) : (
              <section className="rounded-xl border border-brand-border bg-brand-card p-4 space-y-3 text-sm" data-testid="request-panel">
                <h2 className="text-base font-semibold">{s.requestToBook}</h2>
                <p className="text-text-secondary">{s.requestBody}</p>
                <p><span className="text-text-muted">{s.deposit}: </span><span className="font-semibold">{formatMoney(b.deposit_gbp, "GBP", locale)}</span></p>
                <button className={primaryButton} onClick={requestToBook} disabled={busy} data-testid="request-submit">{s.requestToBook}</button>
              </section>
            )
          )}
          {phase === "awaiting_confirmation" && b.status === "pending" && (
            <section className="rounded-xl border border-brand-border bg-brand-card p-4 text-sm text-text-secondary" data-testid="awaiting-confirmation">{s.processingTitle}</section>
          )}
          {phase === "requested" && b.status === "pending" && (
            <section className="rounded-xl border border-brand-border bg-brand-card p-4 text-sm text-status-success" data-testid="request-sent">{s.requestSent}</section>
          )}
          {holdOver && b.status === "pending" && (
            <a className={`${secondaryButton} inline-block`} href={`/book?check_in=${b.check_in}&check_out=${b.check_out}&adults=${b.adults}&children=${b.children}${locale !== "en" ? `&lang=${locale}` : ""}`}>{s.searchAgain}</a>
          )}
          {error && <p className="text-xs text-status-error" data-testid="book-action-error">{error}</p>}
          {["pending", "confirmed"].includes(b.status) && b.cancellation.allowed && phase !== "awaiting_confirmation" && (
            <div className="text-xs text-text-muted">
              <button className="underline" onClick={cancel} disabled={busy} data-testid="book-cancel">{s.cancelBooking}</button>
              {b.cancellation.free ? "" : ` · ${b.cancellation.reason}`}
            </div>
          )}
          {["pending", "confirmed"].includes(b.status) && !b.cancellation.allowed && b.status === "confirmed" && <p className="text-xs text-text-muted">{b.cancellation.reason}</p>}
        </div>
      </div>

      <footer className="text-[11px] text-text-muted pb-8 space-y-1">
        <p>{s.manageLater}</p>
        {(data.property?.phone || data.property?.email) && <p>{s.questions} {[data.property?.phone, data.property?.email].filter(Boolean).join(" · ")}</p>}
        <p>{s.poweredBy}</p>
      </footer>
    </main>
  );
}
