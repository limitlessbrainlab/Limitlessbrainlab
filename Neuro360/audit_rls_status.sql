-- ============================================================
-- audit_rls_status.sql  (READ-ONLY — safe to run anywhere)
--
-- Lists every table in the public schema with its RLS status,
-- per-table policy count, and any columns that Supabase's
-- security scanner treats as "sensitive".
--
-- Run in: Supabase SQL Editor (or via apply-rls-lockdown.js --audit)
-- ============================================================

-- 1) RLS status of every public table
SELECT
  c.relname                          AS table_name,
  c.relrowsecurity                   AS rls_enabled,
  (SELECT count(*)
     FROM pg_policy p
    WHERE p.polrelid = c.oid)       AS policy_count,
  c.reltuples::bigint                AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')      -- ordinary + partitioned tables
ORDER BY rls_enabled ASC, c.relname;

-- 2) Sensitive-looking columns exposed in the public schema
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~* '(password|pwd|secret|api_key|token|ssn|credit_card|hash)'
ORDER BY table_name, column_name;

-- 3) Existing policies on tables that already have RLS (context only)
SELECT
  c.relname  AS table_name,
  p.polname  AS policy_name,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polname;
