"use client";

import { useMemo } from "react";
import type { BookStrings } from "@/lib/book-i18n";
import { inputClass, primaryButton, type SearchParams, type BookPolicy } from "./types";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SearchForm({ s, value, onChange, onSearch, busy, policy }: {
  s: BookStrings;
  value: SearchParams;
  onChange: (v: SearchParams) => void;
  onSearch: () => void;
  busy: boolean;
  policy: BookPolicy | null;
}) {
  const minIn = useMemo(() => addDays(todayIso(), policy?.min_lead_days ?? 0), [policy]);
  const maxIn = useMemo(() => addDays(todayIso(), policy?.max_advance_days ?? 540), [policy]);
  const minOut = value.check_in ? addDays(value.check_in, 1) : addDays(minIn, 1);
  const maxGuests = policy?.max_guests_per_booking ?? 8;
  const datesOk = value.check_in && value.check_out && value.check_out > value.check_in;
  const guestsOk = value.adults >= 1 && value.adults + value.children <= maxGuests;

  return (
    <form
      className="rounded-xl border border-brand-border bg-brand-card p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end"
      onSubmit={(e) => { e.preventDefault(); if (datesOk && guestsOk) onSearch(); }}
      data-testid="book-search"
    >
      <label className="text-xs text-text-muted col-span-1">{s.checkIn}
        <input type="date" required min={minIn} max={maxIn} className={inputClass} value={value.check_in} onChange={(e) => onChange({ ...value, check_in: e.target.value, check_out: value.check_out && value.check_out <= e.target.value ? addDays(e.target.value, 1) : value.check_out })} data-testid="book-checkin" />
      </label>
      <label className="text-xs text-text-muted col-span-1">{s.checkOut}
        <input type="date" required min={minOut} className={inputClass} value={value.check_out} onChange={(e) => onChange({ ...value, check_out: e.target.value })} data-testid="book-checkout" />
      </label>
      <label className="text-xs text-text-muted">{s.adults}
        <input type="number" min={1} max={maxGuests} className={inputClass} value={value.adults} onChange={(e) => onChange({ ...value, adults: Math.max(1, Number(e.target.value) || 1) })} data-testid="book-adults" />
      </label>
      <label className="text-xs text-text-muted">{s.children}
        <input type="number" min={0} max={maxGuests} className={inputClass} value={value.children} onChange={(e) => onChange({ ...value, children: Math.max(0, Number(e.target.value) || 0) })} data-testid="book-children" />
      </label>
      <button type="submit" className={`${primaryButton} col-span-2 sm:col-span-1`} disabled={busy || !datesOk || !guestsOk} data-testid="book-search-submit">
        {busy ? s.searching : s.search}
      </button>
      {value.check_in && value.check_out && !datesOk && <p className="col-span-full text-xs text-status-error">{s.arrivalBeforeDeparture}</p>}
      {!guestsOk && <p className="col-span-full text-xs text-status-error">{s.tooManyGuests}</p>}
    </form>
  );
}
