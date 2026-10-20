# Documentation

| Document | What it answers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How a request flows, where the code lives, the data model in one paragraph |
| [DATA-DICTIONARY.md](DATA-DICTIONARY.md) | Every table, column, constraint, trigger, policy and function (generated) |
| [adr/](adr/README.md) | Why the system is built the way it is: eleven architecture decision records |
| [runbooks/](runbooks/README.md) | Deploy, rollback, key rotation, incident response, night audit, backup and restore |
| [STAGING.md](STAGING.md) | Environments, secrets per environment, promotion flow |
| [ALERTING.md](ALERTING.md) | What pages whom, monitor and Sentry rule setup, on-call |
| [ACCOUNTING-EXPORT.md](ACCOUNTING-EXPORT.md) | How ledger lines become a balanced journal, the chart of accounts, importing into Xero, QuickBooks or Sage |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Where Stripe, email/SMS and a channel manager attach, and what each needs |
| [LOAD-TEST.md](LOAD-TEST.md) | Capacity baseline and how to re-run the load test |
| [hospitai-user-manual.md](hospitai-user-manual.md) | Front-desk and manager user guide |
| [../README.md](../README.md) | Getting started, scripts, security configuration, money flow |
| `/api/v1/openapi` | The live OpenAPI 3 document, generated from the route files and checked by a contract test |

Regenerate the generated documents after a schema or route change:

```bash
python3 scripts/generate-data-dictionary.py      # needs `supabase start`
node scripts/generate-openapi-paths.mjs
```
