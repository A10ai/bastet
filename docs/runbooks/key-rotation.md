# Key rotation

Rotate on a schedule (every 12 months), when a person with access leaves, and
immediately on any suspected leak. Keep a rotation log (date, key, who, why).

| Secret | Where it lives | Rotation impact | How |
| --- | --- | --- | --- |
| Supabase anon key / service role key | Supabase dashboard > Project Settings > API; Vercel env; `.env.local` of every developer | Service role: server restarts only. Anon key: it is baked into the client bundle, so a redeploy is required | See below |
| `PII_ENCRYPTION_KEY` | Vercel env; your password manager | None for users if done in two steps | See below |
| `CRON_SECRET` | Vercel env | Crons fail until redeploy | Set new value, redeploy, watch health `scheduler` |
| Upstash REST token | Upstash console; Vercel env | Rate limiter falls back to in-memory until redeploy (health reports `degraded`) | Upstash console > Reset token, update env, redeploy |
| Sentry DSN | Sentry project settings; Vercel env | Errors unreported until redeploy | Create a new client key, update env, redeploy, revoke old key |
| Staff passwords | Supabase Auth | User signs in again | Settings > Security, or admin "Send reset" in Admin > Users |
| TOTP (MFA) factors | Supabase Auth | User must re-enrol | Admin unenrol via `POST /api/v1/auth/mfa` as the user, or delete the factor in Supabase Auth > Users |

## Supabase keys

Supabase projects created from 2025 onwards have **publishable** and
**secret** API keys that can be rotated individually; older projects have the
JWT-derived `anon` and `service_role` keys, where rotating means rotating
the JWT secret and both keys change at once. Check which kind the project has
under Project Settings > API.

1. Create the new secret key (or rotate the JWT secret, during a quiet hour;
   it signs every user out).
2. Update `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   Vercel (Production and Preview), in the staging project if it shares keys
   (it should not), and in every Edge Box `.env`.
3. Redeploy. Smoke test sign-in and a booking page.
4. Revoke the old key. Confirm the old key now returns 401 against
   `https://<ref>.supabase.co/rest/v1/properties?select=id`.
5. Ask every developer to replace the key in their `.env.local`. Keys in
   `.env.local`/`.env.cloud` from before October 2026 are considered exposed and
   must not be reused.

## PII_ENCRYPTION_KEY (passport numbers)

Values are stored as `enc:v1:<iv>:<tag>:<ciphertext>` and encrypted with
AES-256-GCM. Rotation is a two-step, zero-downtime procedure built into the
application:

1. Generate a new key: `openssl rand -base64 32`.
2. In Vercel set `PII_ENCRYPTION_KEY_PREVIOUS` to the **current** key and
   `PII_ENCRYPTION_KEY` to the **new** key. Redeploy. From now on new writes
   use the new key and reads fall back to the previous one.
3. As an admin, re-encrypt existing rows:

   ```bash
   curl -X POST https://app.hospitai.uk/api/v1/admin/encrypt-pii \
     -H "Cookie: <admin session>" -H "X-CSRF-Token: <token>"
   # {"data":{"scanned":412,"encrypted":412,"unreadable":0}}
   ```

   Run it again until `encrypted` is 0. `unreadable` greater than 0 means some
   rows were written with a key that is neither the current nor the previous
   one; stop and investigate before continuing (do not remove the previous key).
4. Remove `PII_ENCRYPTION_KEY_PREVIOUS` from Vercel and redeploy.
5. Record the rotation. Keep the old key in the password manager for 90 days
   in case a backup from before the rotation has to be restored (a restored
   backup needs the key it was encrypted with, set as `_PREVIOUS`, then step 3).

Losing the key means losing every passport number. The key is stored in the
company password manager under "HospitAI production", with two owners.

## CRON_SECRET

1. `openssl rand -hex 32`, set it in Vercel, redeploy.
2. Within 15 minutes the automations cron should have run with the new
   secret: `GET /api/v1/health` shows `scheduler: ok` and the age in minutes.
   If it shows the previous run getting older, the secret in Vercel and the
   one the app reads differ (typo, wrong environment scope).
3. Update any Edge Box crontab that calls the cron routes.

## After any rotation

- `GET /api/v1/health` is `healthy`.
- Sign in, open Settings > Security, confirm MFA status loads.
- Create and cancel a test booking on a test guest (confirms the service
  role key works for the server-side write paths).
- Update the rotation log and the password manager entry.
