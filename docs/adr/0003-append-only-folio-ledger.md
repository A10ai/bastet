# 0003 Append-only folio ledger; corrections are reversing lines

Date: 2026-10-18. Status: accepted.

## Context

Money was tracked as mutable totals on bookings and invoices. Tax was
applied as a multiplier (14% became 14x), refunds did not exist, and an
issued invoice could be edited. None of this would survive an accountant.

## Decision

Every stay has a folio (`folios`). All money movements are `folio_lines`
rows: room, VAT, tourism levy, extras, payments, refunds and reversals. A
trigger rejects UPDATE and DELETE on `folio_lines`; a mistake is corrected
by `void_folio_line`, which posts a reversing line with a reason and the
acting staff member. Refunds reference the original payment. Invoices are
issued from the folio (`issue_folio_invoice`) and frozen by trigger once
issued. All of this is implemented as database functions so the API, the
night audit and manual SQL share one code path.

## Consequences

- The ledger explains every balance; `folio_balance()` is a sum, not a
  stored number.
- Operators must learn "void and re-post" instead of "edit"; runbooks cover
  it.
- Reports must net reversals; `revenue_by_stay_date` does.
