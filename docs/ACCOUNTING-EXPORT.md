# Accounting export

`GET /api/v1/finance/export?from=YYYY-MM-DD&to=YYYY-MM-DD&type=journal|summary&format=json|csv`
(manager and above; also the "Accounting export" card on the finance page).

## What it exports

Every line of the guest ledger (`folio_lines`) in the period, by business
date, becomes one journal entry with two legs. Debits always equal credits:
the response carries `check.balanced` and the CSV an `X-Journal-Balanced`
header, so an unbalanced file is never imported unnoticed.

| Ledger line | Debit | Credit |
| --- | --- | --- |
| Room charge | Guest ledger 1200 | Room revenue 4000 |
| Food and beverage, extras, adjustments | Guest ledger 1200 | 4100 / 4200 / 4900 |
| VAT line | Guest ledger 1200 | VAT output 2200 |
| Tourism levy | Guest ledger 1200 | Tourism levy payable 2210 |
| Payment (cash / card / bank transfer / other) | 1000 / 1010 / 1020 / 1030 | Guest ledger 1200 |
| Refund | Guest ledger 1200 | the method's account |
| Reversal (void) | the account the original line credited | Guest ledger 1200 |

The guest ledger (1200) is the debtors control account: its balance at any
date equals the sum of open folio balances. Revenue is recognised on the
business date the night audit (or the till) posted it, which is the stay
date for room charges.

## Chart of accounts

Codes live in `gl_accounts` per property and are created with the defaults
above on first use. Managers rename them to match their package through
`PUT /api/v1/finance/accounts` with `{ "accounts": [{ "key": "room_revenue",
"code": "200", "name": "Accommodation sales" }] }`. Keys are fixed; only
codes and names change.

## Importing

- **Xero**: Accounting > Manual journals > Import; map `date`, `account_code`,
  `debit`, `credit`, `description`; one journal per `entry_id`.
- **QuickBooks Online**: Journal entry import (CSV) with the same columns.
- **Sage**: Nominal journal import; `account_code` is the nominal code.

Export monthly after the last night audit of the month has run; the
`summary` type gives the per-account totals for a quick reconciliation
against the finance page's revenue figures.
