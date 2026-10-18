# 0007 Field-level encryption for identity documents with a two-key rotation

Date: 2026-10-18. Status: accepted.

## Context

Passport numbers were stored in plaintext and returned in list endpoints.
Under UK GDPR they are personal data with elevated risk; a database
backup leak would expose every guest's document.

## Decision

`passport_number` is encrypted with AES-256-GCM (`src/lib/pii-crypto.ts`),
stored as `enc:v1:<iv>:<tag>:<ciphertext>`, masked in lists and revealed
only to roles with a need. Rotation is built in: the previous key is read
through `PII_ENCRYPTION_KEY_PREVIOUS`, writes use the new key, and
`POST /api/v1/admin/encrypt-pii` re-encrypts existing rows and reports any
that neither key can read.

## Consequences

- Searching by document number is not possible (by design).
- Losing the key loses the documents; the key-rotation runbook covers
  custody and the 90-day retention of retired keys for backup restores.
