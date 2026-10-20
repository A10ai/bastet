import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole, ROLES } from "@/lib/api-auth";
import { rpcErrorResponse } from "@/lib/rpc-error";
import { logAudit } from "@/lib/audit";
import { buildJournal, journalRows, summarise, toCsv, type GlAccount, type LedgerLine } from "@/lib/accounting";

/**
 * GET /api/v1/finance/export?from=YYYY-MM-DD&to=YYYY-MM-DD&type=journal|summary&format=json|csv
 *
 * Accounting export for the period (business dates, inclusive): a balanced
 * double-entry journal built from the folio ledger, or the per-account
 * summary. Manager and above. CSV downloads carry a filename.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ROLES.MANAGEMENT);
  if (!auth.authenticated) return auth.error!;
  const q = request.nextUrl.searchParams;
  const from = q.get("from"), to = q.get("to");
  const type = q.get("type") === "summary" ? "summary" : "journal";
  const format = q.get("format") === "csv" ? "csv" : "json";
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD, from <= to) are required" }, { status: 400 });
  }
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) return NextResponse.json({ error: "Export at most 400 days at a time" }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  let folioQuery = supabase.from("folios").select("id, booking:bookings(reference)");
  if (auth.propertyId) folioQuery = folioQuery.eq("property_id", auth.propertyId);
  const { data: folios, error: fErr } = await folioQuery;
  if (fErr) return rpcErrorResponse(fErr, "folios.select");
  const folioIds = (folios || []).map((f) => f.id);
  const refByFolio = new Map((folios || []).map((f) => [f.id, (f.booking as unknown as { reference: string } | null)?.reference ?? null]));
  if (folioIds.length === 0) return respond([], [], from, to, type, format, auth, supabase);

  const { data: lines, error } = await supabase
    .from("folio_lines")
    .select("id, folio_id, business_date, type, description, debit_gbp, credit_gbp, reference_type, reference_id, reversal_of")
    .in("folio_id", folioIds)
    .gte("business_date", from)
    .lte("business_date", to)
    .order("business_date")
    .order("posted_at");
  if (error) return rpcErrorResponse(error, "folio_lines.select");

  const payIds = (lines || []).filter((l) => l.type === "payment" && l.reference_id).map((l) => l.reference_id as string);
  const refundIds = (lines || []).filter((l) => l.type === "refund" && l.reference_id).map((l) => l.reference_id as string);
  const reversedIds = (lines || []).filter((l) => l.type === "reversal" && l.reversal_of).map((l) => l.reversal_of as string);
  const [pays, refunds, reversed, accounts] = await Promise.all([
    payIds.length ? supabase.from("payments").select("id, method").in("id", payIds) : Promise.resolve({ data: [] as { id: string; method: string }[] }),
    refundIds.length ? supabase.from("refunds").select("id, method").in("id", refundIds) : Promise.resolve({ data: [] as { id: string; method: string }[] }),
    reversedIds.length ? supabase.from("folio_lines").select("id, type").in("id", reversedIds) : Promise.resolve({ data: [] as { id: string; type: string }[] }),
    auth.propertyId ? supabase.from("gl_accounts").select("key, code, name, kind").eq("property_id", auth.propertyId) : Promise.resolve({ data: [] as GlAccount[] }),
  ]);
  const methodOf = new Map<string, string>([...(pays.data || []), ...(refunds.data || [])].map((p) => [p.id, p.method]));
  const typeOf = new Map((reversed.data || []).map((l) => [l.id, l.type as LedgerLine["type"]]));
  const enriched: LedgerLine[] = (lines || []).map((l) => ({
    ...(l as unknown as LedgerLine),
    debit_gbp: Number(l.debit_gbp || 0),
    credit_gbp: Number(l.credit_gbp || 0),
    method: l.reference_id ? methodOf.get(l.reference_id) ?? null : null,
    reversed_type: l.reversal_of ? typeOf.get(l.reversal_of) ?? null : null,
    booking_reference: refByFolio.get(l.folio_id) ?? null,
  }));
  return respond(enriched, (accounts.data || []) as GlAccount[], from, to, type, format, auth, supabase);
}

async function respond(lines: LedgerLine[], accounts: GlAccount[], from: string, to: string, type: "journal" | "summary", format: "json" | "csv", auth: { userId?: string; email?: string }, supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const entries = buildJournal(lines, accounts);
  const summary = summarise(entries);
  await logAudit(supabase, { user_id: auth.userId, user_email: auth.email, action: "finance.export", category: "finance", resource_type: "journal", description: `Accounting export ${type} ${from} to ${to} (${summary.entries} entries, ${format})`, metadata: { from, to, type, format, balanced: summary.balanced } });
  if (format === "csv") {
    const rows = type === "summary"
      ? summary.accounts.map((a) => ({ account_code: a.account_code, account_name: a.account_name, debit: a.debit.toFixed(2), credit: a.credit.toFixed(2), net: a.net.toFixed(2) }))
      : journalRows(entries);
    return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hospitai-${type}-${from}-to-${to}.csv"`, "Cache-Control": "no-store", "X-Journal-Balanced": String(summary.balanced) } });
  }
  return NextResponse.json({ data: type === "summary" ? { period: { from, to }, ...summary } : { period: { from, to }, entries, check: { total_debit: summary.total_debit, total_credit: summary.total_credit, balanced: summary.balanced, entries: summary.entries } } }, { headers: { "Cache-Control": "no-store" } });
}
