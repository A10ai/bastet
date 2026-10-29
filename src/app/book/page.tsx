"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BOOK_LOCALES, BOOK_STRINGS, detectBookLocale, type BookLocale } from "@/lib/book-i18n";
import { SearchForm } from "@/components/book/search-form";
import { OfferCard } from "@/components/book/offer-card";
import { GuestForm, type GuestFormValue } from "@/components/book/guest-form";
import { inputClass, readError, type AvailabilityResponse, type Offer, type PropertyResponse, type SearchParams } from "@/components/book/types";

/**
 * Public booking page: search -> offers -> guest details -> hold created ->
 * /book/:token for payment. State lives in the URL so a shared link or a
 * reload lands on the same search. Language from ?lang= or the browser.
 */
export default function BookPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-sm text-text-muted">...</main>}>
      <BookPageInner />
    </Suspense>
  );
}

function BookPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const propertySlug = params.get("property");
  const [locale, setLocale] = useState<BookLocale>("en");
  const s = BOOK_STRINGS[locale];

  const [info, setInfo] = useState<PropertyResponse | null>(null);
  const [infoState, setInfoState] = useState<"loading" | "ok" | "closed">("loading");
  const [search, setSearch] = useState<SearchParams>({
    check_in: params.get("check_in") || "",
    check_out: params.get("check_out") || "",
    adults: Number(params.get("adults")) || 2,
    children: Number(params.get("children")) || 0,
  });
  const [results, setResults] = useState<AvailabilityResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    setLocale(detectBookLocale(params.get("lang"), typeof navigator !== "undefined" ? navigator.languages : []));
  }, [params]);

  useEffect(() => {
    const qs = propertySlug ? `?property=${encodeURIComponent(propertySlug)}` : "";
    fetch(`/api/v1/book/property${qs}`)
      .then(async (r) => { if (!r.ok) throw new Error(); const j = await r.json(); setInfo(j.data); setInfoState(j.data?.policy?.online_enabled ? "ok" : "closed"); })
      .catch(() => setInfoState("closed"));
  }, [propertySlug]);

  const runSearch = useCallback(async (sp: SearchParams) => {
    setSearching(true);
    setSearchError("");
    setSelected(null);
    try {
      const q = new URLSearchParams({ check_in: sp.check_in, check_out: sp.check_out, adults: String(sp.adults), children: String(sp.children) });
      if (propertySlug) q.set("property", propertySlug);
      const res = await fetch(`/api/v1/book/availability?${q}`);
      if (!res.ok) throw await readError(res, s.errorGeneric);
      const j = await res.json();
      setResults(j.data as AvailabilityResponse);
      const url = new URLSearchParams(q);
      if (locale !== "en") url.set("lang", locale);
      router.replace(`/book?${url}`, { scroll: false });
    } catch (e) {
      setResults(null);
      setSearchError((e as { message?: string })?.message || s.errorGeneric);
    } finally {
      setSearching(false);
    }
  }, [propertySlug, router, s.errorGeneric, locale]);

  // A link with dates searches straight away.
  const initialSearched = useMemo(() => Boolean(params.get("check_in") && params.get("check_out")), [params]);
  useEffect(() => {
    if (initialSearched && infoState === "ok" && !results && !searching && !searchError) void runSearch(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoState]);

  const createBooking = async (g: GuestFormValue) => {
    if (!selected?.quote) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/v1/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property: propertySlug || undefined,
          apartment_type_id: selected.apartment_type.id,
          check_in: search.check_in,
          check_out: search.check_out,
          adults: search.adults,
          children: search.children,
          expected_total_gbp: selected.quote.total_gbp,
          guest: { first_name: g.first_name, last_name: g.last_name, email: g.email, phone: g.phone || null, country: g.country || null, marketing_consent: g.marketing_consent },
          locale,
          currency: "GBP",
          special_requests: g.special_requests || null,
          accept_terms: true,
          source: "web",
        }),
      });
      if (!res.ok) {
        const err = await readError(res, s.errorGeneric);
        if (err.code === "PRICE_CHANGED" || err.code === "NO_AVAILABILITY") {
          setCreateError(err.code === "PRICE_CHANGED" ? s.priceChanged : s.soldOut);
          return;
        }
        setCreateError(err.message);
        return;
      }
      const j = await res.json();
      router.push(`/book/${j.data.token}${locale !== "en" ? `?lang=${locale}` : ""}`);
    } catch {
      setCreateError(s.errorGeneric);
    } finally {
      setCreating(false);
    }
  };

  const changeLocale = (l: BookLocale) => {
    setLocale(l);
    const url = new URLSearchParams(params.toString());
    if (l === "en") url.delete("lang"); else url.set("lang", l);
    router.replace(`/book${url.toString() ? `?${url}` : ""}`, { scroll: false });
  };

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="pt-2 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">{info?.property.name || ""}</p>
          <h1 className="text-2xl font-semibold mt-1" data-testid="book-title">{s.title}</h1>
          <p className="text-sm text-text-secondary mt-1">{s.subtitle}</p>
        </div>
        <label className="text-xs text-text-muted shrink-0">
          <span className="sr-only">{s.language}</span>
          <select className={`${inputClass} w-auto py-1`} value={locale} onChange={(e) => changeLocale(e.target.value as BookLocale)} data-testid="book-lang">
            {BOOK_LOCALES.map((l) => <option key={l} value={l}>{BOOK_STRINGS[l].langName}</option>)}
          </select>
        </label>
      </header>

      {infoState === "closed" ? (
        <section className="rounded-xl border border-brand-border bg-brand-card p-6 text-sm text-text-secondary" data-testid="book-closed">{s.noResults}</section>
      ) : selected && results ? (
        <GuestForm s={s} locale={locale} offer={selected} search={search} policy={info?.policy ?? null} busy={creating} error={createError} onSubmit={createBooking} onBack={() => { setSelected(null); setCreateError(""); }} />
      ) : (
        <>
          <SearchForm s={s} value={search} onChange={setSearch} onSearch={() => runSearch(search)} busy={searching || infoState === "loading"} policy={info?.policy ?? null} />
          {searchError && <p className="text-sm text-status-error" data-testid="book-search-error">{searchError}</p>}
          {results && (
            <section className="space-y-3" data-testid="book-results">
              {results.offers.filter((o) => o.quote && !o.unavailable_reason).length === 0 && <p className="text-sm text-text-secondary">{s.noResults}</p>}
              {[...results.offers].sort((a, b) => Number(Boolean(b.quote)) - Number(Boolean(a.quote))).map((o) => (
                <OfferCard key={o.apartment_type.id} offer={o} s={s} locale={locale} onBook={setSelected} />
              ))}
            </section>
          )}
        </>
      )}

      <footer className="text-[11px] text-text-muted pb-8 flex flex-wrap gap-x-4 gap-y-1">
        {info?.property.email && <span>{s.questions} {info.property.email}{info.property.phone ? ` · ${info.property.phone}` : ""}</span>}
        <span>{s.poweredBy}</span>
      </footer>
    </main>
  );
}
