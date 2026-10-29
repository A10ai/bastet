"use client";

import Image from "next/image";
import { formatMoney, nightsLabel, type BookLocale, type BookStrings } from "@/lib/book-i18n";
import { primaryButton, type Offer } from "./types";

export function OfferCard({ offer, s, locale, onBook }: { offer: Offer; s: BookStrings; locale: BookLocale; onBook: (offer: Offer) => void }) {
  const t = offer.apartment_type;
  const q = offer.quote;
  const image = t.images[0];
  const sellable = q && !offer.unavailable_reason;
  return (
    <article className="rounded-xl border border-brand-border bg-brand-card overflow-hidden flex flex-col sm:flex-row" data-testid="book-offer" data-type={t.slug}>
      <div className="relative sm:w-56 h-40 sm:h-auto bg-brand-border/40 shrink-0">
        {image ? (
          <Image src={image.url} alt={image.alt || t.name} fill sizes="(max-width: 640px) 100vw, 224px" className="object-cover" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">{t.name}</div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div>
          <h3 className="text-base font-semibold">{t.name}</h3>
          <p className="text-xs text-text-secondary">
            {t.bedrooms === 0 ? s.studio : `${t.bedrooms} ${s.bedrooms}`} · {s.sleepsUpTo} {t.max_occupancy}{t.size_sqm ? ` · ${t.size_sqm} m²` : ""}
          </p>
          {t.description && <p className="text-sm text-text-secondary mt-1 line-clamp-2">{t.description}</p>}
        </div>
        {t.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {t.amenities.slice(0, 6).map((a) => <li key={a} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-accent-muted text-text-secondary">{a}</li>)}
          </ul>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between gap-3">
          {sellable ? (
            <div className="text-sm">
              <p className="text-xl font-semibold">{formatMoney(q.total_gbp, "GBP", locale)}</p>
              <p className="text-xs text-text-muted">{formatMoney(q.rate_per_night_gbp, "GBP", locale)} {s.perNight} · {nightsLabel(q.nights, s)}</p>
              {q.discount_percentage > 0 && <p className="text-xs text-status-success">-{q.discount_percentage}%</p>}
              {offer.cancellation && <p className="text-xs text-text-secondary mt-1">{offer.cancellation}{q.rate_plan?.includes_breakfast ? ` · ${s.includesBreakfast}` : ""}</p>}
              {offer.deposit_gbp !== null && <p className="text-xs text-text-muted">{s.deposit}: {formatMoney(offer.deposit_gbp, "GBP", locale)}</p>}
            </div>
          ) : (
            <p className="text-sm text-text-muted">{offer.unavailable_reason === "Sold out for these dates" ? s.soldOut : offer.unavailable_reason}</p>
          )}
          {sellable && (
            <button className={`${primaryButton} w-auto px-5`} onClick={() => onBook(offer)} data-testid="book-offer-select">{s.bookNow}</button>
          )}
        </div>
      </div>
    </article>
  );
}
