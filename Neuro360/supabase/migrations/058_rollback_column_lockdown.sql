-- ============================================================
-- 058_rollback_column_lockdown.sql
-- INSTANT ROLLBACK for 057_lockdown_credential_columns.sql.
--
-- Restores table-level SELECT/UPDATE/INSERT for the API roles,
-- which overrides the column-level restrictions of 057 and puts
-- the API back to pre-lockdown behavior (columns visible again).
--
-- Run only if a rollback is genuinely needed:
--   node apply-sql-file.js <staging|prod> supabase/migrations/058_rollback_column_lockdown.sql
-- ============================================================

GRANT SELECT, UPDATE, INSERT ON TABLE
  public.clinics, public.patients, public.profiles
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
