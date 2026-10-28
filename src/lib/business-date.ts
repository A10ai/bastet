/**
 * Calendar-date arithmetic for hotel business dates ("YYYY-MM-DD").
 *
 * Stay dates are calendar days, not instants. Doing arithmetic on them with
 * local-time Date methods (setDate, getDay, date-fns differenceInDays) breaks
 * whenever the process time zone observes DST: a night "disappears" or a day
 * repeats. Everything here works on UTC midnight, so results are the same
 * under any TZ.
 *
 * "Today" for the hotel is the date in the property's time zone (Africa/Cairo
 * for Bastet), matching SQL property_business_date(); the server clock's date
 * is wrong for three hours each night.
 */

export const DEFAULT_PROPERTY_TIMEZONE = "Africa/Cairo";

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** UTC-midnight epoch ms for a "YYYY-MM-DD" (or ISO timestamp; only the date part is used). */
export function dateToUtcMs(date: string): number {
  const m = ISO_DATE.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date in strict YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = dateToUtcMs(date);
  return !Number.isNaN(ms) && utcMsToDate(ms) === date;
}

/** Whole days from `from` to `to` (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}

export function addDays(date: string, n: number): string {
  return utcMsToDate(dateToUtcMs(date) + n * DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday, for the calendar date itself. */
export function dayOfWeek(date: string): number {
  return new Date(dateToUtcMs(date)).getUTCDay();
}

/** Every date from `from` to `to`, both inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** First day of the month containing `date`, shifted by `offset` months. */
export function monthStart(date: string, offset = 0): string {
  const d = new Date(dateToUtcMs(date));
  return utcMsToDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

/** Last day of the month containing `date`, shifted by `offset` months. */
export function monthEnd(date: string, offset = 0): string {
  const d = new Date(dateToUtcMs(date));
  return utcMsToDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset + 1, 0));
}

export function daysInMonth(date: string): number {
  return Number(monthEnd(date).slice(8, 10));
}

/**
 * Number of stay nights of [checkIn, checkOut) that fall inside the inclusive
 * date range [from, to].
 */
export function nightsInRange(checkIn: string, checkOut: string, from: string, to: string): number {
  const start = Math.max(dateToUtcMs(checkIn), dateToUtcMs(from));
  const end = Math.min(dateToUtcMs(checkOut), dateToUtcMs(to) + DAY_MS);
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

/**
 * The business date of the (first active) property, using its stored
 * time zone. Falls back to DEFAULT_PROPERTY_TIMEZONE when the lookup fails.
 */
export async function propertyBusinessDate(
  supabase: { from: (table: string) => unknown },
  now: Date = new Date()
): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = supabase.from("properties") as any;
    const { data } = await q.select("timezone").order("created_at").limit(1).maybeSingle();
    return businessDate((data?.timezone as string | undefined) || DEFAULT_PROPERTY_TIMEZONE, now);
  } catch {
    return businessDate(DEFAULT_PROPERTY_TIMEZONE, now);
  }
}

/** The property's business date: today's calendar date in its time zone. */
export function businessDate(timeZone: string = DEFAULT_PROPERTY_TIMEZONE, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_PROPERTY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
  }
}
