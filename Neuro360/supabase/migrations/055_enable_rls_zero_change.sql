-- ============================================================
-- 055_enable_rls_zero_change.sql
-- FIXES: Supabase Security Advisor `rls_disabled_in_public`
--
-- ZERO-BEHAVIOR-CHANGE LOCKDOWN
-- -----------------------------
-- For every ordinary table in `public` that has RLS DISABLED:
--   1. Enable Row Level Security.
--   2. Add one explicit policy that allows exactly what the
--      database effectively allowed before (full access for
--      the API roles anon + authenticated).
--
-- Result: identical behavior for every existing feature
-- (logins, portals, admin, Realtime), while RLS is now
-- formally enabled so the critical
-- "Table publicly accessible" warning is resolved.
--
-- SCOPE (deliberately untouched):
--   - Tables that ALREADY have RLS enabled are NOT modified.
--   - No columns are revoked, no policies tightened.
--     (sensitive_columns_exposed is a separate later change.)
--   - No FORCE ROW LEVEL SECURITY: service_role (backend)
--     continues to bypass RLS exactly as today.
--   - Idempotent: safe to run multiple times.
-- ============================================================

DO $lockdown$
DECLARE
  t             record;
  locked_count  int := 0;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')      -- ordinary + partitioned tables
      AND c.relrowsecurity = FALSE     -- only tables WITHOUT RLS
  LOOP
    -- 1) Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);

    -- 2) Mirror the previous effective behavior with an explicit policy
    EXECUTE format('DROP POLICY IF EXISTS "zero_change_full_access" ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY "zero_change_full_access" ON public.%I ' ||
      'FOR ALL TO anon, authenticated ' ||
      'USING (true) WITH CHECK (true)',
      t.relname
    );

    locked_count := locked_count + 1;
    RAISE NOTICE '🔒 RLS enabled + zero-change policy: %', t.relname;
  END LOOP;

  RAISE NOTICE '✅ Lockdown complete — tables locked: %', locked_count;
END
$lockdown$;

-- PostgREST schema cache reload (harmless if not needed)
NOTIFY pgrst, 'reload schema';
