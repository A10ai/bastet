"use client";

import { useState } from "react";
import { formatDay, formatMoney, nightsLabel, type BookLocale, type BookStrings } from "@/lib/book-i18n";
import { inputClass, primaryButton, secondaryButton, type Offer, type SearchParams, type BookPolicy } from "./types";

export interface GuestFormValue {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  special_requests: string;
  marketing_consent: boolean;
  accept_terms: boolean;
}

const COUNTRIES: [string, string][] = [["GB", "United Kingdom"], ["DE", "Deutschland"], ["PL", "Polska"], ["RU", "Россия"], ["CZ", "Česko"], ["AT", "Österreich"], ["CH", "Schweiz"], ["NL", "Nederland"], ["BE", "Belgique"], ["FR", "France"], ["IT", "Italia"], ["ES", "España"], ["SE", "Sverige"], ["NO", "Norge"], ["DK", "Danmark"], ["FI", "Suomi"], ["IE", "Ireland"], ["UA", "Україна"], ["SK", "Slovensko"], ["HU", "Magyarország"], ["RO", "România"], ["EG", "مصر"], ["SA", "السعودية"], ["AE", "الإمارات"], ["KW", "الكويت"], ["US", "United States"], ["CA", "Canada"], ["TR", "Türkiye"], ["OTHER", "—"]];

export function GuestForm({ s, locale, offer, search, policy, busy, error, onSubmit, onBack }: {
  s: BookStrings;
  locale: BookLocale;
  offer: Offer;
  search: SearchParams;
  policy: BookPolicy | null;
  busy: boolean;
  error: string;
  onSubmit: (v: GuestFormValue) => void;
  onBack: () => void;
}) {
  const [v, setV] = useState<GuestFormValue>({ first_name: "", last_name: "", email: "", phone: "", country: "", special_requests: "", marketing_consent: false, accept_terms: false });
  const q = offer.quote!;
  const valid = v.first_name.trim() && v.last_name.trim() && /.+@.+\..+/.test(v.email) && v.accept_terms;

  return (
    <div className="grid gap-4 lg:grid-cols-5" data-testid="book-guest-form">
      <section className="lg:col-span-2 rounded-xl border border-brand-border bg-brand-card p-4 text-sm space-y-2 h-fit">
        <h2 className="text-base font-semibold">{s.summary}</h2>
        <p className="font-medium">{offer.apartment_type.name}</p>
        <div className="flex justify-between"><span className="text-text-muted">{s.checkIn}</span><span>{formatDay(search.check_in, locale)}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">{s.checkOut}</span><span>{formatDay(search.check_out, locale)}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">{s.guests}</span><span>{search.adults} + {search.children}</span></div>
        <div className="flex justify-between"><span className="text-text-muted">{nightsLabel(q.nights, s)}</span><span>{formatMoney(q.rate_per_night_gbp, "GBP", locale)} {s.perNight}</span></div>
        <div className="flex justify-between font-semibold border-t border-brand-border pt-2"><span>{s.total}</span><span>{formatMoney(q.total_gbp, "GBP", locale)}</span></div>
        {offer.deposit_gbp !== null && <div className="flex justify-between"><span className="text-text-muted">{s.deposit}</span><span>{formatMoney(offer.deposit_gbp, "GBP", locale)}</span></div>}
        {offer.deposit_gbp !== null && <div className="flex justify-between"><span className="text-text-muted">{s.balance}</span><span>{formatMoney(Math.max(0, q.total_gbp - offer.deposit_gbp), "GBP", locale)}</span></div>}
        {offer.cancellation && <p className="text-xs text-text-secondary pt-2 border-t border-brand-border">{q.rate_plan?.name}: {offer.cancellation}</p>}
      </section>

      <form className="lg:col-span-3 rounded-xl border border-brand-border bg-brand-card p-4 space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onSubmit(v); }}>
        <h2 className="text-base font-semibold">{s.guestDetails}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-muted">{s.firstName}<input required autoComplete="given-name" className={inputClass} value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} data-testid="guest-first" /></label>
          <label className="text-xs text-text-muted">{s.lastName}<input required autoComplete="family-name" className={inputClass} value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} data-testid="guest-last" /></label>
          <label className="text-xs text-text-muted col-span-2">{s.email}<input required type="email" autoComplete="email" className={inputClass} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} data-testid="guest-email" /></label>
          <label className="text-xs text-text-muted">{s.phone}<input type="tel" autoComplete="tel" className={inputClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
          <label className="text-xs text-text-muted">{s.country}
            <select className={inputClass} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} autoComplete="country">
              <option value="">—</option>
              {COUNTRIES.filter(([c]) => c !== "OTHER").map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="text-xs text-text-muted block">{s.specialRequests}<textarea rows={2} className={inputClass} value={v.special_requests} onChange={(e) => setV({ ...v, special_requests: e.target.value })} /></label>
        <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" checked={v.accept_terms} onChange={(e) => setV({ ...v, accept_terms: e.target.checked })} data-testid="guest-terms" /> <span>{s.acceptTerms}{policy?.terms_url ? <> <a className="underline" href={policy.terms_url} target="_blank" rel="noreferrer">{s.termsLink}</a></> : null}</span></label>
        <label className="flex items-start gap-2 text-xs text-text-secondary"><input type="checkbox" checked={v.marketing_consent} onChange={(e) => setV({ ...v, marketing_consent: e.target.checked })} /> {s.marketing}</label>
        {error && <p className="text-xs text-status-error" data-testid="guest-error">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" className={secondaryButton} onClick={onBack} disabled={busy}>{s.back}</button>
          <button type="submit" className={primaryButton} disabled={!valid || busy} data-testid="guest-submit">{busy ? s.creating : s.continueToPayment}</button>
        </div>
      </form>
    </div>
  );
}
