-- ============================================================
-- Migration 00022: Explicit role grants (audit Oct 2026)
-- Hosted Supabase grants anon/authenticated/service_role on tables created
-- through the dashboard via default privileges. A database built from these
-- migrations alone (local CLI, Edge Box, CI) had no grants at all, so every
-- PostgREST call failed with "permission denied". Make the schema self-contained.
-- Row Level Security still governs what authenticated users can see.
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Audit log is append-only for application roles: no UPDATE/DELETE even for
-- the anon/authenticated grants above (service_role keeps full access for ops).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM anon, authenticated;
