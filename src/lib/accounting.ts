/**
 * Accounting export: a balanced double-entry journal built from folio_lines.
 *
 * Every ledger line becomes one journal entry with two legs:
 *   charge (room, fnb, extra, adjustment)   Dr guest ledger      Cr revenue account
 *   tax                                     Dr guest ledger      Cr VAT output
 *   levy                                    Dr guest ledger      Cr tourism levy payable
 *   payment                                 Dr cash/card/bank    Cr guest ledger
 *   refund                                  Dr guest ledger      Cr cash/card/bank
 *   reversal (void of a charge/tax/levy)    Dr the reversed account   Cr guest ledger
 * Debits always equal credits, per entry and for the whole period; the
 * export reports the check so an import into Xero, QuickBooks or Sage can
 * be trusted. Account codes come from gl_accounts (migration 00031) with the
 * defaults below as a fallback.
 */

export type AccountKey =
  | "guest_ledger" | "cash" | "card_clearing" | "bank" | "other_receipts"
  | "vat_output" | "tourism_levy" | "room_revenue" | "fnb_revenue" | "extras_revenue" | "adjustments";

export interface GlAccount { key: AccountKey; code: string; name: string; kind: "asset" | "liability" | "revenue" | "expense" | "equity" }

export const DEFAULT_ACCOUNTS: GlAccount[] = [
  { key: "guest_ledger", code: "1200", name: "Guest ledger (debtors)", kind: "asset" },
  { key: "cash", code: "1000", name: "Cash", kind: "asset" },
  { key: "card_clearing", code: "1010", name: "Card clearing", kind: "asset" },
  { key: "bank", code: "1020", name: "Bank", kind: "asset" },
  { key: "other_receipts", code: "1030", name: "Other receipts", kind: "asset" },
  { key: "vat_output", code: "2200", name: "VAT output tax", kind: "liability" },
  { key: "tourism_levy", code: "2210", name: "Tourism levy payable", kind: "liability" },
  { key: "room_revenue", code: "4000", name: "Room revenue", kind: "revenue" },
  { key: "fnb_revenue", code: "4100", name: "Food and beverage revenue", kind: "revenue" },
  { key: "extras_revenue", code: "4200", name: "Other guest revenue", kind: "revenue" },
  { key: "adjustments", code: "4900", name: "Adjustments and allowances", kind: "revenue" },
];

export interface LedgerLine {
  id: string;
  folio_id: string;
  business_date: string;
  type: "room" | "tax" | "levy" | "extra" | "fnb" | "adjustment" | "payment" | "refund" | "reversal";
  description: string;
  debit_gbp: number;
  credit_gbp: number;
  reference_type: string | null;
  reference_id: string | null;
  reversal_of: string | null;
  /** Filled by the caller from payments/refunds for money lines. */
  method?: string | null;
  booking_reference?: string | null;
  /** The type of the line a reversal undoes (caller resolves it). */
  reversed_type?: LedgerLine["type"] | null;
}

export interface JournalLeg { account_code: string; account_name: string; account_key: AccountKey; debit: number; credit: number }
export interface JournalEntry {
  entry_id: string;
  date: string;
  type: LedgerLine["type"];
  description: string;
  booking_reference: string | null;
  folio_id: string;
  legs: [JournalLeg, JournalLeg];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function accountMap(accounts: GlAccount[] | null | undefined): Record<AccountKey, GlAccount> {
  const map = Object.fromEntries(DEFAULT_ACCOUNTS.map((a) => [a.key, a])) as Record<AccountKey, GlAccount>;
  for (const a of accounts ?? []) if (a.key in map) map[a.key] = { ...map[a.key], ...a };
  return map;
}

export function revenueKeyFor(type: LedgerLine["type"]): AccountKey {
  switch (type) {
    case "room": return "room_revenue";
    case "fnb": return "fnb_revenue";
    case "extra": return "extras_revenue";
    case "adjustment": return "adjustments";
    case "tax": return "vat_output";
    case "levy": return "tourism_levy";
    default: return "adjustments";
  }
}

export function moneyKeyFor(method: string | null | undefined): AccountKey {
  switch ((method || "").toLowerCase()) {
    case "cash": return "cash";
    case "card": case "stripe": return "card_clearing";
    case "bank_transfer": case "bank": return "bank";
    default: return "other_receipts";
  }
}

/** One ledger line -> one balanced journal entry (null for a zero line). */
export function journalEntryFor(line: LedgerLine, accounts: Record<AccountKey, GlAccount>): JournalEntry | null {
  const amount = r2(Number(line.debit_gbp || 0) || Number(line.credit_gbp || 0));
  if (amount === 0) return null;
  const leg = (key: AccountKey, debit: number, credit: number): JournalLeg => ({ account_code: accounts[key].code, account_name: accounts[key].name, account_key: key, debit: r2(debit), credit: r2(credit) });
  const guest = "guest_ledger" as const;
  let legs: [JournalLeg, JournalLeg];
  switch (line.type) {
    case "payment":
      legs = [leg(moneyKeyFor(line.method), amount, 0), leg(guest, 0, amount)];
      break;
    case "refund":
      legs = [leg(guest, amount, 0), leg(moneyKeyFor(line.method), 0, amount)];
      break;
    case "reversal": {
      const key = revenueKeyFor(line.reversed_type || "adjustment");
      legs = [leg(key, amount, 0), leg(guest, 0, amount)];
      break;
    }
    default:
      legs = [leg(guest, amount, 0), leg(revenueKeyFor(line.type), 0, amount)];
  }
  return { entry_id: line.id, date: line.business_date, type: line.type, description: line.description, booking_reference: line.booking_reference ?? null, folio_id: line.folio_id, legs };
}

export function buildJournal(lines: LedgerLine[], accounts: GlAccount[] | null | undefined): JournalEntry[] {
  const map = accountMap(accounts);
  return lines.map((l) => journalEntryFor(l, map)).filter((e): e is JournalEntry => e !== null);
}

export interface AccountTotal { account_code: string; account_name: string; account_key: AccountKey; debit: number; credit: number; net: number }

export function summarise(entries: JournalEntry[]): { accounts: AccountTotal[]; total_debit: number; total_credit: number; balanced: boolean; entries: number } {
  const by = new Map<string, AccountTotal>();
  let td = 0, tc = 0;
  for (const e of entries) for (const l of e.legs) {
    const t = by.get(l.account_code) || { account_code: l.account_code, account_name: l.account_name, account_key: l.account_key, debit: 0, credit: 0, net: 0 };
    t.debit = r2(t.debit + l.debit); t.credit = r2(t.credit + l.credit); t.net = r2(t.debit - t.credit);
    by.set(l.account_code, t); td += l.debit; tc += l.credit;
  }
  td = r2(td); tc = r2(tc);
  return { accounts: [...by.values()].sort((a, b) => a.account_code.localeCompare(b.account_code)), total_debit: td, total_credit: tc, balanced: Math.abs(td - tc) < 0.005, entries: entries.length };
}

/** Flat rows for CSV: one row per leg, the shape most packages import. */
export function journalRows(entries: JournalEntry[]): Record<string, string | number>[] {
  return entries.flatMap((e) => e.legs.map((l) => ({
    date: e.date, entry_id: e.entry_id, type: e.type, booking: e.booking_reference ?? "", folio: e.folio_id,
    account_code: l.account_code, account_name: l.account_name, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), description: e.description,
  })));
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n") + "\r\n";
}
