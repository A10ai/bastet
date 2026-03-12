import { SupabaseClient } from "@supabase/supabase-js";
import { generateInvoiceNumber } from "./utils";

/**
 * Get the next invoice number by querying the last one and incrementing.
 */
export async function getNextInvoiceNumber(
  supabase: SupabaseClient
): Promise<string> {
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
  taxRate: number = 0
): {
  subtotal_gbp: number;
  tax_amount_gbp: number;
  total_gbp: number;
} {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_gbp,
    0
  );
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return {
    subtotal_gbp: Math.round(subtotal * 100) / 100,
    tax_amount_gbp: Math.round(tax * 100) / 100,
    total_gbp: Math.round(total * 100) / 100,
  };
}

/**
 * Determine invoice payment status from payments.
 */
export function getInvoicePaymentStatus(
  totalGbp: number,
  paymentsSum: number
): "paid" | "partially_paid" | "sent" {
  if (paymentsSum >= totalGbp) return "paid";
  if (paymentsSum > 0) return "partially_paid";
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
