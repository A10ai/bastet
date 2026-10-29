import "server-only";
import Stripe from "stripe";

/**
 * Stripe is the card-payment seam (docs/INTEGRATIONS.md). The server client
 * is created lazily so builds and tests without a key still work; routes
 * answer 503 PAYMENTS_UNAVAILABLE when it is not configured. Card data never
 * touches this server: the browser uses the Payment Element, we only create
 * PaymentIntents and verify webhooks. PCI scope stays at SAQ A.
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true, appInfo: { name: "HospitAI", version: "0.2.0" } });
  }
  return client;
}

/** Zero-decimal currencies are charged in whole units; everything else in minor units. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF"]);

export function toMinorUnits(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  return ZERO_DECIMAL.has(c) ? Math.round(amount) : Math.round(amount * 100);
}

export function fromMinorUnits(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  return ZERO_DECIMAL.has(c) ? amount : Math.round(amount) / 100;
}

export interface DepositIntentArgs {
  bookingId: string;
  reference: string;
  amount: number;
  currency: string;
  /** GBP equivalent and the rate used, so the webhook can post the folio in GBP. */
  amountGbp: number;
  fxRate: number;
  email?: string | null;
  description?: string;
}

/**
 * Create (or reuse) the deposit PaymentIntent for a booking. The idempotency
 * key is derived from the booking id and amount, so a guest who reloads the
 * payment page gets the same intent instead of a second charge.
 */
export async function createDepositIntent(args: DepositIntentArgs): Promise<{ id: string; client_secret: string; amount: number; currency: string }> {
  const stripe = getStripe();
  const minor = toMinorUnits(args.amount, args.currency);
  const intent = await stripe.paymentIntents.create(
    {
      amount: minor,
      currency: args.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: args.description ?? `Deposit for booking ${args.reference}`,
      receipt_email: args.email || undefined,
      metadata: {
        booking_id: args.bookingId,
        reference: args.reference,
        amount_gbp: args.amountGbp.toFixed(2),
        fx_rate: String(args.fxRate),
        purpose: "deposit",
      },
    },
    { idempotencyKey: `deposit:${args.bookingId}:${minor}:${args.currency.toLowerCase()}` }
  );
  if (!intent.client_secret) throw new Error("Stripe returned no client secret");
  return { id: intent.id, client_secret: intent.client_secret, amount: minor, currency: intent.currency };
}

/** Verify a webhook payload. Throws on a bad signature. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

/** Pull what the folio needs out of a PaymentIntent (metadata written by createDepositIntent). */
export function depositFromIntent(intent: Stripe.PaymentIntent): { bookingId: string | null; reference: string | null; amountGbp: number; amountOriginal: number; currency: string; fxRate: number | null } {
  const currency = intent.currency.toUpperCase();
  const amountOriginal = fromMinorUnits(intent.amount_received || intent.amount, currency);
  const metaGbp = Number(intent.metadata?.amount_gbp);
  const fxRate = Number(intent.metadata?.fx_rate);
  const amountGbp = currency === "GBP" ? amountOriginal : Number.isFinite(metaGbp) && metaGbp > 0 ? metaGbp : Number.isFinite(fxRate) && fxRate > 0 ? Math.round((amountOriginal / fxRate) * 100) / 100 : amountOriginal;
  return {
    bookingId: intent.metadata?.booking_id || null,
    reference: intent.id,
    amountGbp,
    amountOriginal,
    currency,
    fxRate: Number.isFinite(fxRate) && fxRate > 0 ? fxRate : null,
  };
}

export type { Stripe };
