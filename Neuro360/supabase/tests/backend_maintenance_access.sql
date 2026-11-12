-- Read-only permission assertions; safe on staging and production.
BEGIN;
DO $$
DECLARE signature text; target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.increment_clinic_report_credits(uuid,integer)',
    'public.revoke_consent(uuid,text)', 'public.expire_old_consents()',
    'public.update_setting(text,text,text)',
    'public.generate_monthly_statement(uuid,integer,integer)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN CONTINUE; END IF;
    ASSERT NOT has_function_privilege('anon',target,'EXECUTE'), 'Anonymous mutation remains';
    ASSERT NOT has_function_privilege('authenticated',target,'EXECUTE'), 'Browser mutation remains';
    ASSERT has_function_privilege('service_role',target,'EXECUTE'), 'Backend access was removed';
  END LOOP;
END $$;
ROLLBACK;
SELECT 'Backend-only RPC permission checks passed' AS result;
