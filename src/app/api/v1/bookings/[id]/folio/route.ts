import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES, roleAtLeast } from "@/lib/api-auth";
import { validateBody, formatZodErrors } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Guest folio for a stay (migration 00026).
 *
 * GET  /api/v1/bookings/:id/folio                      folio, lines, balance
 * POST /api/v1/bookings/:id/folio  { action: ... }
 *   post_charge   { type, description, quantity, unit_amount_gbp, tax_rate_percent? }   front desk
 *   post_payment  { amount_gbp, method, amount_original?, currency?, fx_rate?, reference?, notes? } front desk
 *   refund        { payment_id, amount_gbp, reason, reference? }                           manager
 *   void_line     { line_id, reason }                                                      manager
 *   issue_invoice { due_date? }                                                            front desk
 */
const folioActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("post_charge"),
    type: z.enum(["extra", "fnb", "adjustment"]),
    description: z.string().min(1).max(200),
    quantity: z.number().positive().max(999),
    unit_amount_gbp: z.number().min(0).max(100000),
    tax_rate_percent: z.number().min(0).max(100).optional(),
  }).strict(),
  z.object({
    action: z.literal("post_payment"),
    amount_gbp: z.number().positive().max(1000000),
    method: z.enum(["cash", "card", "bank_transfer", "stripe", "cheque", "other"]),
    amount_original: z.number().positive().optional(),
    currency: z.string().length(3).optional(),
    fx_rate: z.number().positive().optional(),
    reference: z.string().max(100).optional(),
    notes: z.string().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal("refund"),
    payment_id: z.string().uuid(),
    amount_gbp: z.number().positive(),
    reason: z.string().min(3).max(500),
    reference: z.string().max(100).optional(),
  }).strict(),
  z.object({ action: z.literal("void_line"), line_id: z.string().uuid(), reason: z.string().min(3).max(500) }).strict(),
  z.object({ action: z.literal("issue_invoice"), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict(),
]);

async function loadFolio(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, bookingId: string) {
  const { data: folio } = await supabase.from("folios").select("*").eq("booking_id", bookingId).maybeSingle();
  if (!folio) return null;
  const [{ data: lines }, { data: balance }, { data: payments }] = await Promise.all([
    supabase.from("folio_lines").select("*").eq("folio_id", folio.id).order("posted_at", { ascending: true }),
    supabase.rpc("folio_balance", { p_folio_id: folio.id }),
    supabase.from("payments").select("id, amount_gbp, method, status, received_at, reference").eq("folio_id", folio.id).order("received_at"),
  ]);
  const totals = (lines || []).reduce(
    (t: { charges: number; tax: number; payments: number; refunds: number }, l: { type: string; debit_gbp: number; credit_gbp: number }) => {
      if (["room", "levy", "extra", "fnb", "adjustment"].includes(l.type)) t.charges += Number(l.debit_gbp);
      else if (l.type === "tax") t.tax += Number(l.debit_gbp);
      else if (l.type === "payment") t.payments += Number(l.credit_gbp);
      else if (l.type === "refund") t.refunds += Number(l.debit_gbp);
      else if (l.type === "reversal") t.charges -= Number(l.credit_gbp);
      return t;
    },
    { charges: 0, tax: 0, payments: 0, refunds: 0 }
  );
  return { folio, lines: lines || [], payments: payments || [], balance_gbp: Number(balance ?? 0), totals };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  try {
    const { id } = await ctx.params;
    const supabase = await createServerSupabaseClient();
    const data = await loadFolio(supabase, id);
    if (!data) return NextResponse.json({ data: null, meta: { note: "No folio yet: it opens at check-in" } });
    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err: String(err) }, "[folio] GET unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ROLES.FRONT_DESK);
  if (!auth.authenticated) return auth.error!;
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const validation = validateBody(folioActionSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const input = validation.data;
    const supabase = await createServerSupabaseClient();
    const actor = auth.email || auth.userId || "staff";

    if ((input.action === "refund" || input.action === "void_line") && !roleAtLeast(auth.role, "manager")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Refunds and voids require a manager" } }, { status: 403 });
    }

    // Folio opens at check-in; a deposit before arrival may open it early.
    const { data: folioId, error: openErr } = await supabase.rpc("open_folio", { p_booking_id: id });
    if (openErr) return rpcErrorResponse(openErr, "open_folio");

    let result: { data: unknown; error: { message?: string; code?: string } | null };
    switch (input.action) {
      case "post_charge":
        result = await supabase.rpc("post_folio_charge", {
          p_folio_id: folioId, p_type: input.type, p_description: input.description, p_quantity: input.quantity,
          p_unit_amount_gbp: input.unit_amount_gbp, p_tax_rate_percent: input.tax_rate_percent ?? null, p_actor: actor,
        });
        break;
      case "post_payment":
        result = await supabase.rpc("record_folio_payment", {
          p_folio_id: folioId, p_amount_gbp: input.amount_gbp, p_method: input.method,
          p_amount_original: input.amount_original ?? null, p_currency: input.currency ?? "GBP", p_fx_rate: input.fx_rate ?? null,
          p_reference: input.reference ?? null, p_received_by: auth.staffId ?? null, p_notes: input.notes ?? null, p_actor: actor,
        });
        break;
      case "refund":
        result = await supabase.rpc("refund_payment", {
          p_payment_id: input.payment_id, p_amount_gbp: input.amount_gbp, p_reason: input.reason,
          p_refunded_by: auth.staffId ?? null, p_reference: input.reference ?? null, p_actor: actor,
        });
        break;
      case "void_line":
        result = await supabase.rpc("void_folio_line", { p_line_id: input.line_id, p_reason: input.reason, p_actor: actor });
        break;
      case "issue_invoice":
        result = await supabase.rpc("issue_folio_invoice", { p_folio_id: folioId, p_due_date: input.due_date ?? null, p_actor: actor });
        break;
    }
    if (result.error) return rpcErrorResponse(result.error, `folio.${input.action}`);

    await logAudit(supabase, {
      user_id: auth.userId,
      user_email: auth.email,
      action: `folio.${input.action}`,
      category: "finance",
      resource_type: "folio",
      resource_id: String(folioId),
      description: `${input.action} on folio for booking ${id}`,
      new_data: { ...input },
    });

    const snapshot = await loadFolio(supabase, id);
    return NextResponse.json({ data: result.data, folio: snapshot }, { status: input.action === "issue_invoice" ? 200 : 201 });
  } catch (err) {
    logger.error({ err: String(err) }, "[folio] POST unhandled");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
