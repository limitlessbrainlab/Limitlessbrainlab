-- ============================================================
-- 057_lockdown_credential_columns.sql
-- FIXES the real `sensitive_columns_exposed` exposure (Step 2 of 2)
--
-- ⚠️ APPLY ONLY AFTER the frontend using the 056 RPCs is deployed
--    and login has been verified (see SECURITY_PHASE2.md).
--
-- Hides credential columns from the public API (anon + authenticated):
--   clinics(password, plain_password)
--   patients(password, plain_password)
--   profiles(password)
--
-- SELECT/UPDATE/INSERT become column-level: every non-credential
-- column keeps working exactly as before; the credential columns
-- are no longer visible or writable through the API. Password
-- writes flow through the 056 security-definer RPCs, and the
-- backend reads plaintext via its service-role key (which bypasses
-- grants entirely) so the credentials-email feature is unchanged.
--
-- Instant rollback: 058_rollback_column_lockdown.sql
-- Idempotent: safe to run multiple times.
-- ============================================================

DO $lockdown$
DECLARE
  rec  record;
  cols text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('clinics',  ARRAY['password', 'plain_password']::text[]),
      ('patients', ARRAY['password', 'plain_password']::text[]),
      ('profiles', ARRAY['password']::text[])
    ) AS t(tbl, hidden)
  LOOP
    -- SELECT: drop the table-level grant, re-grant everything EXCEPT the
    -- credential columns. New columns added in the future are hidden from
    -- the API until granted (fail-closed by design).
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon, authenticated', rec.tbl);
    SELECT string_agg(format('%I', c.column_name), ', ') INTO cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = rec.tbl
      AND NOT (c.column_name = ANY (rec.hidden));
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO anon', cols, rec.tbl);
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO authenticated', cols, rec.tbl);

    -- UPDATE: secrets can no longer be overwritten through the API
    -- (password changes go through set_*_password RPCs instead).
    EXECUTE format('REVOKE UPDATE ON TABLE public.%I FROM anon, authenticated', rec.tbl);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.%I TO anon', cols, rec.tbl);
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.%I TO authenticated', cols, rec.tbl);

    -- INSERT: rows can be created without embedding secrets through the API
    -- (registration credentials go through claim_credentials_for_new_account).
    EXECUTE format('REVOKE INSERT ON TABLE public.%I FROM anon, authenticated', rec.tbl);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.%I TO anon', cols, rec.tbl);
    EXECUTE format('GRANT INSERT (%s) ON TABLE public.%I TO authenticated', cols, rec.tbl);

    RAISE NOTICE '🔒 credential columns hidden on %', rec.tbl;
  END LOOP;
END
$lockdown$;

NOTIFY pgrst, 'reload schema';
