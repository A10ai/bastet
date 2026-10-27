import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoiceNumber } from "./utils";

/**
 * Get the next invoice number using a DB sequence (race-condition free).
 * Falls back to query-last-then-increment if the DB sequence function doesn't exist.
 */
export async function getNextInvoiceNumber(
  supabase: SupabaseClient
): Promise<string> {
  // Try DB sequence first (migration 00016)
  const { data: seqResult } = await supabase.rpc("next_invoice_number");
  if (seqResult) return seqResult as string;

  // Fallback: query-last-then-increment
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `INV-HRG-${year}`;

  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1)
    .single();

  let seq = 1;
  if (data?.invoice_number) {
    const lastSeq = parseInt(data.invoice_number.slice(-4), 10);
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return generateInvoiceNumber(seq);
}

/**
 * Calculate invoice totals from line items.
 */
export function calculateInvoiceTotals(
  lineItems: { quantity: number; unit_price_gbp: number }[],
  /** Tax rate as a PERCENT, e.g. 14 for Egyptian VAT. Values 0–100. */
  taxRatePercent: number = 0
): {
  subtotal_gbp: number;
  tax_amount_gbp: number;
  total_gbp: number;
} {
  if (taxRatePercent < 0 || taxRatePercent > 100) {
    throw new RangeError(`taxRatePercent must be between 0 and 100, got ${taxRatePercent}`);
  }
  // Whole pence throughout: each line is rounded as stored (lineTotalGbp), tax
  // is charged on the rounded subtotal (as SQL post_folio_charge does), and
  // total = subtotal + tax exactly.
  const subtotalPence = lineItems.reduce(
    (sum, item) => sum + Math.round(lineTotalGbp(item.quantity, item.unit_price_gbp) * 100),
    0
  );
  const taxPence = Math.round((subtotalPence * taxRatePercent) / 100);

  return {
    subtotal_gbp: subtotalPence / 100,
    tax_amount_gbp: taxPence / 100,
    total_gbp: (subtotalPence + taxPence) / 100,
  };
}

/** A line item's total rounded to the penny; the value stored on the line. */
export function lineTotalGbp(quantity: number, unitPriceGbp: number): number {
  return Math.round(quantity * unitPriceGbp * 100) / 100;
}

/** Compare money in whole pence so 100.10 + 200.20 equals 300.30. */
export function toPence(amountGbp: number): number {
  return Math.round(amountGbp * 100);
}

/**
 * Determine invoice payment status from payments.
 */
export function getInvoicePaymentStatus(
  totalGbp: number,
  paymentsSum: number
): "paid" | "partially_paid" | "sent" {
  const paid = toPence(paymentsSum);
  if (paid >= toPence(totalGbp)) return "paid";
  if (paid > 0) return "partially_paid";
  return "sent";
}

/**
 * Convert an EGP expense to GBP using the latest rate.
 */
export async function convertExpenseToGbp(
  amountEgp: number,
  supabase: SupabaseClient
): Promise<{ amount_gbp: number; fx_rate: number } | null> {
  // We need EGP→GBP, so we look for GBP→EGP rate and invert it
  const { data: fxRate } = await supabase
    .from("currency_rates")
    .select("rate")
    .eq("base_currency", "GBP")
    .eq("target_currency", "EGP")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (!fxRate) return null;

  const gbpAmount = amountEgp / fxRate.rate;
  return {
    amount_gbp: Math.round(gbpAmount * 100) / 100,
    fx_rate: fxRate.rate,
  };
}
