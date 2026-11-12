-- Independent of the native-session rollout: these mutations have no browser callers.
-- Existing backend/service-role callers keep their current permissions and behavior.
BEGIN;
DO $$
DECLARE signature text; target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.increment_clinic_report_credits(uuid,integer)',
    'public.revoke_consent(uuid,text)',
    'public.expire_old_consents()',
    'public.update_setting(text,text,text)',
    'public.generate_monthly_statement(uuid,integer,integer)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',target);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',target);
    IF has_function_privilege('anon',target,'EXECUTE') OR
       has_function_privilege('authenticated',target,'EXECUTE') OR
       NOT has_function_privilege('service_role',target,'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected effective permissions for %',signature;
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
