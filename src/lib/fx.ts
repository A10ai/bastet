import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export const FX_TARGETS = ["EGP", "EUR", "USD"] as const;

/**
 * Fetch GBP exchange rates and store them in currency_rates.
 *
 * Uses Open Exchange Rates when OPEN_EXCHANGE_RATES_APP_ID is set, otherwise
 * the European Central Bank reference rates via frankfurter.app (no key).
 * Manual entry through POST /api/v1/currency-rates still works as an override.
 *
 * The ECB does not publish every currency (EGP among them), so a refresh can
 * succeed for some targets only. Those not returned are listed in `missing`
 * and logged: their stored rate was NOT updated and keeps its old fetched_at.
 * When no OPEN_EXCHANGE_RATES_APP_ID is set, EGP must be maintained by hand.
 */
export async function refreshFxRates(
  supabase: SupabaseClient
): Promise<{ source: string; rates: Record<string, number>; stored: number; missing: string[] } | { error: string }> {
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
  let source: string;
  let rates: Record<string, number> = {};
  try {
    if (appId) {
      const res = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${appId}&base=GBP&symbols=${FX_TARGETS.join(",")}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { error: `Open Exchange Rates responded ${res.status}` };
      const json = (await res.json()) as { rates?: Record<string, number> };
      rates = json.rates || {};
      source = "open_exchange_rates";
    } else {
      const res = await fetch(`https://api.frankfurter.app/latest?from=GBP&to=${FX_TARGETS.join(",")}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { error: `frankfurter.app responded ${res.status}` };
      const json = (await res.json()) as { rates?: Record<string, number> };
      rates = json.rates || {};
      source = "ecb_frankfurter";
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "[fx] rate fetch failed");
    return { error: `Rate provider unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  const fetchedAt = new Date().toISOString();
  const rows = Object.entries(rates)
    .filter(([, r]) => Number.isFinite(r) && r > 0)
    .map(([target, rate]) => ({ base_currency: "GBP", target_currency: target, rate, source, fetched_at: fetchedAt }));
  if (rows.length === 0) return { error: "Provider returned no rates" };
  const missing = FX_TARGETS.filter((t) => !rows.some((r) => r.target_currency === t));
  if (missing.length > 0) {
    logger.warn({ source, missing }, "[fx] provider did not return every target; those rates were not updated");
  }
  const { error } = await supabase.from("currency_rates").insert(rows);
  if (error) return { error: error.message };
  return { source, rates, stored: rows.length, missing };
}
