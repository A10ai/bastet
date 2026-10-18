#!/usr/bin/env python3
"""Generate docs/DATA-DICTIONARY.md from a running local Supabase stack.

Reads information_schema and pg_catalog through the supabase_db container so
the document always matches the applied migrations. Run after `supabase db
reset` or after adding a migration:  python3 scripts/generate-data-dictionary.py
"""
import subprocess, sys, datetime, re

DESCRIPTIONS = {
  "properties": "A hotel or aparthotel operated on the platform. Carries VAT rate, currencies and the current business date.",
  "buildings": "Physical buildings or wings of a property.",
  "apartment_types": "Sellable unit types (studio, 1-bed, ...) with base weekly rates and capacity.",
  "apartments": "Individual sellable units with status (available, occupied, cleaning, maintenance, blocked, out_of_service).",
  "apartment_images": "Photos attached to a unit.",
  "rates": "Seasonal rate rows per apartment type (start/end date, weekly rate, minimum nights).",
  "availability": "Legacy per-day availability rows; overlap protection now lives on bookings.",
  "guests": "Guest master record. Passport numbers are encrypted at rest (enc:v1: prefix). Loyalty tier and VIP flag live here.",
  "guest_preferences": "Preference DNA per guest (room, pillow, temperature, dietary ...).",
  "guest_consent": "GDPR consent records per guest and purpose.",
  "guest_communications": "Outbound messages to guests and their delivery status.",
  "guest_activity_log": "Timeline of guest-facing events.",
  "guest_predictions": "Model outputs per guest (churn, lifetime value).",
  "guest_segments": "Named guest segments for marketing and pricing.",
  "gdpr_requests": "Subject access and erasure requests with their state.",
  "booking_channels": "Distribution channels (direct, OTA ...) with commission as a percentage.",
  "bookings": "A stay: unit, guest, dates, status, totals. Overlapping confirmed stays on one unit are rejected by an exclusion constraint. `nights` is a generated column.",
  "booking_addons": "Extras attached to a booking.",
  "folios": "Guest account for a stay; opened at check-in or by a deposit, closed at check-out.",
  "folio_lines": "Append-only ledger lines (room, tax, levy, extra, payment, refund, reversal). Updates and deletes are rejected by trigger; corrections are reversing lines.",
  "payments": "Money received against a folio or invoice.",
  "refunds": "Money returned, always linked to the original payment and a reason.",
  "invoices": "Invoice issued from a folio. Frozen by trigger once status is issued.",
  "expenses": "Operating expenses by category and department, with R&D flag.",
  "department_budgets": "Monthly budget per department; the source of budget-vs-actual, never estimated.",
  "financial_reports": "Stored report snapshots.",
  "currency_rates": "Exchange rates refreshed daily by the FX cron.",
  "daily_closes": "One row per property per business date closed by the night audit (charges posted, no-shows marked).",
  "housekeeping_tasks": "Cleaning and inspection tasks per unit with type, status, priority and assignee.",
  "maintenance_requests": "Maintenance tickets per unit with category, priority and status.",
  "inventory": "Stock items and levels.",
  "staff": "Staff members linked to auth users; `role` drives authorisation (owner, admin, manager, receptionist, housekeeping, maintenance, readonly).",
  "staff_properties": "Membership of staff in properties; required for cross-property access.",
  "staff_schedules": "Shifts per staff member.",
  "audit_log": "Who did what, when, from where. Written by API routes through logAudit.",
  "notifications": "In-app notifications per staff member; broadcasts create one row per active staff member.",
  "system_events": "Event bus log with idempotency keys; consumed by workflows and automations.",
  "workflows": "Multi-step operational workflows with optimistic locking on `version`.",
  "brain_config": "Configuration of the AI brain (mode, thresholds).",
  "brain_decisions": "Decisions proposed or executed by the AI brain per cycle.",
  "pricing_decisions": "Rate changes proposed or applied by the pricing automation (gated by AUTO_PRICING_ENABLED).",
  "demand_forecasts": "Forecast rows produced by the predictions engine.",
  "ai_learning_feedback": "Outcomes recorded against AI decisions for learning.",
  "analytics_events": "Product analytics events (no personal data).",
  "reviews": "Guest reviews and responses.",
  "promotions": "Promotional offers.",
  "flash_deals": "Time-boxed deals.",
  "loyalty_programme": "Loyalty tiers and rules.",
  "partners": "Local partners (excursions, transfers, beach).",
  "partner_certifications": "Compliance documents of partners.",
  "beach_partnerships": "Beach club arrangements.",
  "excursions": "Excursion catalogue.",
  "excursion_bookings": "Excursions booked by guests.",
  "facilities": "On-site facilities (pool, gym, meeting rooms).",
  "facility_bookings": "Reservations of facilities.",
  "shuttle_routes": "Shuttle routes.",
  "shuttle_schedules": "Shuttle departures.",
  "shuttle_bookings": "Seats booked on shuttles.",
}

def q(sql):
    # Unit/record separators: policy expressions can contain anything printable.
    out = subprocess.run(["docker", "exec", "-i", "supabase_db_bastet", "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "\x1f", "-R", "\x1e", "-c", sql], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr)
    return [[f.replace("\n", " ").strip() for f in rec.split("\x1f")] for rec in out.stdout.split("\x1e") if rec.strip()]

tables = [r[0] for r in q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
rls = {r[0]: r[1] == "t" for r in q("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'")}
policies = {}
for t, name, cmd, roles, qual, check in q("select tablename, policyname, cmd, roles::text, coalesce(qual,''), coalesce(with_check,'') from pg_policies where schemaname='public' order by 1,2"):
    policies.setdefault(t, []).append((name, cmd, roles, qual, check))
fks = {}
for t, col, ft, fcol in q("""select kcu.table_name, kcu.column_name, ccu.table_name, ccu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
  join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'"""):
    fks[(t, col)] = f"{ft}.{fcol}"
cons = {}
for t, name, typ, deff in q("""select conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid)
  from pg_constraint where connamespace='public'::regnamespace and contype in ('x','c','u') order by 1,2"""):
    cons.setdefault(t, []).append((name, {"x": "exclusion", "c": "check", "u": "unique"}[typ], deff))
triggers = {}
for t, name, deff in q("select event_object_table, trigger_name, action_statement from information_schema.triggers where trigger_schema='public' order by 1,2"):
    triggers.setdefault(t, set()).add((name, deff))
funcs = q("""select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), l.lanname, p.prosecdef::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='public' and l.lanname in ('plpgsql','sql') order by 1""")

out = []
out.append("# Data dictionary\n")
out.append(f"Generated {datetime.date.today().isoformat()} from the local Supabase stack by `scripts/generate-data-dictionary.py`; do not edit by hand. Schema source of truth: `supabase/migrations/`.\n")
out.append(f"{len(tables)} tables, {len(funcs)} functions. Every table has row-level security enabled unless marked otherwise; policies are summarised per table.\n")
out.append("## Tables\n")
out.append("| Table | Purpose | Columns | RLS |\n| --- | --- | ---: | --- |")
for t in tables:
    ncols = q(f"select count(*) from information_schema.columns where table_schema='public' and table_name='{t}'")[0][0]
    out.append(f"| [{t}](#{t}) | {DESCRIPTIONS.get(t, '')} | {ncols} | {'on' if rls.get(t) else '**off**'} |")
out.append("")
for t in tables:
    out.append(f"### {t}\n")
    if t in DESCRIPTIONS: out.append(DESCRIPTIONS[t] + "\n")
    out.append("| Column | Type | Null | Default | References |\n| --- | --- | --- | --- | --- |")
    for col, typ, null, deff, gen in q(f"""select column_name, case when data_type='USER-DEFINED' then udt_name when data_type='ARRAY' then udt_name||'[]' when character_maximum_length is not null then data_type||'('||character_maximum_length||')' when numeric_precision is not null and data_type='numeric' then 'numeric('||numeric_precision||','||coalesce(numeric_scale,0)||')' else data_type end, is_nullable, coalesce(column_default,''), is_generated from information_schema.columns where table_schema='public' and table_name='{t}' order by ordinal_position"""):
        d = deff.replace("|", "\\|")
        if len(d) > 40: d = d[:37] + "..."
        if gen == "ALWAYS": d = "generated"
        out.append(f"| {col} | {typ} | {'yes' if null=='YES' else ''} | {d} | {fks.get((t,col),'')} |")
    if t in cons:
        out.append("\nConstraints:\n")
        for name, typ, deff in cons[t]:
            out.append(f"- {typ} `{name}`: `{deff}`")
    if t in triggers:
        out.append("\nTriggers:\n")
        for name, deff in sorted(triggers[t]):
            out.append(f"- `{name}`: {deff}")
    if t in policies:
        out.append("\nRow-level security policies:\n")
        out.append("| Policy | Command | Using | With check |\n| --- | --- | --- | --- |")
        for name, cmd, roles, qual, check in policies[t]:
            out.append(f"| {name} | {cmd} | `{qual[:90]}` | `{check[:90]}` |")
    out.append("")
out.append("## Functions\n")
out.append("Called by API routes through PostgREST `rpc()`. SECURITY DEFINER functions run with the owner's rights and enforce their own checks.\n")
out.append("| Function | Arguments | Returns | Language | Security definer |\n| --- | --- | --- | --- | --- |")
for name, args, ret, lang, secdef in funcs:
    out.append(f"| {name} | `{args}` | {ret} | {lang} | {'yes' if secdef=='true' else ''} |")
out.append("")
open("docs/DATA-DICTIONARY.md", "w").write("\n".join(out))
print(f"wrote docs/DATA-DICTIONARY.md: {len(tables)} tables, {len(funcs)} functions")
