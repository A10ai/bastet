import { describe, it, expect } from "vitest";
import { buildJournal, summarise, journalRows, toCsv, accountMap, DEFAULT_ACCOUNTS, type LedgerLine } from "@/lib/accounting";

const line = (over: Partial<LedgerLine>): LedgerLine => ({ id: over.id || Math.random().toString(36).slice(2), folio_id: "f1", business_date: "2026-10-18", type: "room", description: "Room night", debit_gbp: 0, credit_gbp: 0, reference_type: null, reference_id: null, reversal_of: null, booking_reference: "BAS-1", ...over });

describe("accounting journal", () => {
  it("maps charges, tax, levy, payments, refunds and reversals to balanced entries", () => {
    const lines: LedgerLine[] = [
      line({ id: "a", type: "room", debit_gbp: 100 }),
      line({ id: "b", type: "tax", debit_gbp: 14, description: "VAT 14% on Room night" }),
      line({ id: "c", type: "levy", debit_gbp: 1 }),
      line({ id: "d", type: "fnb", debit_gbp: 20, description: "Pool Bar: Beer" }),
      line({ id: "e", type: "payment", credit_gbp: 80, method: "card" }),
      line({ id: "f", type: "payment", credit_gbp: 55, method: "cash" }),
      line({ id: "g", type: "refund", debit_gbp: 10, method: "card" }),
      line({ id: "h", type: "reversal", credit_gbp: 20, reversal_of: "d", reversed_type: "fnb", description: "Void: Pool Bar: Beer" }),
    ];
    const entries = buildJournal(lines, DEFAULT_ACCOUNTS);
    expect(entries).toHaveLength(8);
    for (const e of entries) expect(e.legs[0].debit + e.legs[1].debit).toBeCloseTo(e.legs[0].credit + e.legs[1].credit, 2);
    const byId = Object.fromEntries(entries.map((e) => [e.entry_id, e]));
    expect(byId.a.legs.map((l) => `${l.account_key}:${l.debit}/${l.credit}`)).toEqual(["guest_ledger:100/0", "room_revenue:0/100"]);
    expect(byId.b.legs[1].account_key).toBe("vat_output");
    expect(byId.c.legs[1].account_key).toBe("tourism_levy");
    expect(byId.e.legs[0].account_key).toBe("card_clearing");
    expect(byId.f.legs[0].account_key).toBe("cash");
    expect(byId.g.legs.map((l) => l.account_key)).toEqual(["guest_ledger", "card_clearing"]);
    expect(byId.h.legs.map((l) => `${l.account_key}:${l.debit}/${l.credit}`)).toEqual(["fnb_revenue:20/0", "guest_ledger:0/20"]);

    const s = summarise(entries);
    expect(s.balanced).toBe(true);
    expect(s.total_debit).toBe(s.total_credit);
    const guest = s.accounts.find((a) => a.account_key === "guest_ledger")!;
    // 100+14+1+20 charged, 80+55 paid, 10 refunded back, 20 voided -> 135 - 135 + 10 - 20 = net balance 0 + ... compute: debits 135+10=145, credits 135+20=155
    expect(guest.debit).toBe(145);
    expect(guest.credit).toBe(155);
    const fnb = s.accounts.find((a) => a.account_key === "fnb_revenue")!;
    expect(fnb.net).toBe(0); // sold and voided
  });

  it("skips zero lines and honours renamed account codes", () => {
    const custom = accountMap([{ key: "room_revenue", code: "200", name: "Accommodation sales", kind: "revenue" }]);
    expect(custom.room_revenue.code).toBe("200");
    expect(custom.cash.code).toBe("1000");
    const entries = buildJournal([line({ type: "room", debit_gbp: 0 }), line({ type: "room", debit_gbp: 50 })], [{ key: "room_revenue", code: "200", name: "Accommodation sales", kind: "revenue" }]);
    expect(entries).toHaveLength(1);
    expect(entries[0].legs[1].account_code).toBe("200");
  });

  it("renders CSV rows with one line per leg and escapes commas and quotes", () => {
    const entries = buildJournal([line({ id: "x", type: "extra", debit_gbp: 5.5, description: 'Spa: "Massage", 60 min' })], DEFAULT_ACCOUNTS);
    const rows = journalRows(entries);
    expect(rows).toHaveLength(2);
    const csv = toCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("date,entry_id,type,booking,folio,account_code,account_name,debit,credit,description");
    expect(csv).toContain('"Spa: ""Massage"", 60 min"');
    expect(csv).toContain("5.50");
  });
});
