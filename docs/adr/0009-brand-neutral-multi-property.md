# 0009 No customer identity in code; property data comes from the database

Date: 2026-10-18. Status: accepted.

## Context

The first customer's name was in 1,041 design-token uses, the AI system
prompt, the provider fallback, the OpenAPI description and a storage key.
Selling to a second hotel would have meant a fork.

## Decision

Design tokens are `brand-*` with the palette in CSS variables. Anything
that names the property reads the `properties` table (AI chat prompt) or
`NEXT_PUBLIC_PROPERTY_NAME` as a last-resort fallback. Sample data uses
generic names and is labelled as sample data (ADR 0011).

## Consequences

- A new property is seed data and a theme, not a code change.
- Reviews should reject customer names in `src/`; the deep test's grep can
  be reused.
