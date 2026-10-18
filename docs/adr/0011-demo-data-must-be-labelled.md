# 0011 Sample or modelled data is always labelled on screen and in the API

Date: 2026-10-18. Status: accepted.

## Context

F&B, tour operators, channel status, the weekly revenue chart and energy
waste figures were fabricated and presented as live. A buyer or auditor
seeing them would, rightly, distrust everything else.

## Decision

Any endpoint returning sample or modelled data includes
`meta.demo: true` with a note; the screen shows `DemoDataBanner`. Budgets
are never estimated: the finance summary returns `budget_source: "none"`
when `department_budgets` is empty. Removing a banner requires the real
integration.

## Consequences

- Demo screens are honest and still useful for sales.
- The deep test checks that demo pages carry the banner.
