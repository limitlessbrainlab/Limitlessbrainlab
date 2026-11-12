-- Apply only after the matching application/backend has passed staging checks.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reports_unlocked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.portal_actor()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.resolve_portal_identity(auth.uid(), (auth.jwt()->>'session_id')::uuid)
$$;
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(private.portal_actor()->>'role' = 'super_admin', false)
$$;
CREATE OR REPLACE FUNCTION private.clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (private.portal_actor()->>'clinic_id')::uuid
$$;
CREATE OR REPLACE FUNCTION private.patient_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (private.portal_actor()->>'patient_id')::uuid
$$;
CREATE OR REPLACE FUNCTION private.owns_patient(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_admin() OR p_id = private.patient_id() OR EXISTS (
    SELECT 1 FROM public.patients p WHERE p.id = p_id AND coalesce(p.clinic_id, p.org_id) = private.clinic_id()
  )
$$;
CREATE OR REPLACE FUNCTION private.owns_patient_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_admin() OR EXISTS (
    SELECT 1 FROM public.patients p WHERE lower(trim(p.email)) = lower(trim(p_email)) AND private.owns_patient(p.id)
  )
$$;
REVOKE ALL ON FUNCTION private.portal_actor(),private.is_admin(),private.clinic_id(),private.patient_id(),private.owns_patient(uuid),private.owns_patient_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.portal_actor(),private.is_admin(),private.clinic_id(),private.patient_id(),private.owns_patient(uuid),private.owns_patient_email(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.caller_is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT private.is_admin() $$;

-- Ownership and billing state cannot be reassigned through ordinary profile edits.
CREATE OR REPLACE FUNCTION public.protect_account_permissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE fields text[]; field text;
BEGIN
  IF current_user NOT IN ('anon','authenticated') OR public.caller_is_super_admin() THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'clinics' THEN
    fields := ARRAY['id','is_active','deleted_at','reports_used','reports_allowed','subscription_status','subscription_tier','trial_start_date','trial_end_date'];
  ELSE
    fields := ARRAY['id','clinic_id','org_id','owner_user','subscription_status','subscription_tier','dashboard_access','reports_unlocked'];
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOREACH field IN ARRAY fields LOOP
      IF to_jsonb(NEW)->field IS DISTINCT FROM to_jsonb(OLD)->field THEN
        RAISE EXCEPTION 'Protected account field: %', field USING ERRCODE = '42501';
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'patients' AND
    (coalesce(NEW.subscription_tier, 'free') NOT IN ('free','trial') OR
     coalesce(NEW.subscription_status, 'free') NOT IN ('free','trial','inactive','unpaid') OR
     coalesce(NEW.dashboard_access, false) OR coalesce(NEW.reports_unlocked, false)) THEN
    RAISE EXCEPTION 'Paid access requires verified fulfillment' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_account_permissions ON public.clinics;
CREATE TRIGGER protect_account_permissions BEFORE INSERT OR UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.protect_account_permissions();
DROP TRIGGER IF EXISTS protect_account_permissions ON public.patients;
CREATE TRIGGER protect_account_permissions BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.protect_account_permissions();
REVOKE ALL ON FUNCTION public.protect_account_permissions() FROM PUBLIC;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('clinics','patients','profiles') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_read ON public.clinics FOR SELECT TO authenticated USING (
  (SELECT private.is_admin()) OR id = (SELECT private.clinic_id()) OR id = (
    SELECT coalesce(p.clinic_id,p.org_id) FROM public.patients p WHERE p.id = (SELECT private.patient_id())
  )
);
CREATE POLICY clinic_create ON public.clinics FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));
CREATE POLICY clinic_edit ON public.clinics FOR UPDATE TO authenticated
USING ((SELECT private.is_admin()) OR id = (SELECT private.clinic_id()))
WITH CHECK ((SELECT private.is_admin()) OR id = (SELECT private.clinic_id()));
CREATE POLICY clinic_delete ON public.clinics FOR DELETE TO authenticated USING ((SELECT private.is_admin()));
CREATE POLICY patient_read ON public.patients FOR SELECT TO authenticated
USING ((SELECT private.is_admin()) OR id = (SELECT private.patient_id()) OR coalesce(clinic_id,org_id) = (SELECT private.clinic_id()));
CREATE POLICY patient_create ON public.patients FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_admin()) OR coalesce(clinic_id,org_id) = (SELECT private.clinic_id()));
CREATE POLICY patient_edit ON public.patients FOR UPDATE TO authenticated
USING (private.owns_patient(id)) WITH CHECK (private.owns_patient(id));
CREATE POLICY patient_delete ON public.patients FOR DELETE TO authenticated
USING ((SELECT private.is_admin()) OR coalesce(clinic_id,org_id) = (SELECT private.clinic_id()));
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR (SELECT private.is_admin()));
CREATE POLICY profile_create ON public.profiles FOR INSERT TO authenticated
WITH CHECK ((id = auth.uid() AND role::text = 'patient') OR (SELECT private.is_admin()));
CREATE POLICY profile_edit ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR (SELECT private.is_admin())) WITH CHECK (id = auth.uid() OR (SELECT private.is_admin()));
CREATE POLICY profile_delete ON public.profiles FOR DELETE TO authenticated USING ((SELECT private.is_admin()));

-- No API role can read/write credentials, including authenticated administrators.
DO $$ DECLARE tbl text; cols text; write_cols text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['clinics','patients','profiles'] LOOP
    SELECT string_agg(quote_ident(column_name), ',') INTO cols FROM information_schema.columns
    WHERE table_schema='public' AND table_name=tbl AND column_name NOT IN ('password','plain_password','smtp_password');
    SELECT string_agg(quote_ident(column_name), ',') INTO write_cols FROM information_schema.columns
    WHERE table_schema='public' AND table_name=tbl AND column_name NOT IN ('password','plain_password','smtp_password','auth_user_id');
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated',tbl);
    -- Remove column grants left by earlier lockdown/rollback attempts as well.
    EXECUTE format('REVOKE SELECT (password), INSERT (password), UPDATE (password) ON public.%I FROM anon, authenticated',tbl);
    IF tbl <> 'profiles' THEN
      EXECUTE format('REVOKE SELECT (plain_password), INSERT (plain_password), UPDATE (plain_password) ON public.%I FROM anon, authenticated',tbl);
      EXECUTE format('REVOKE INSERT (auth_user_id), UPDATE (auth_user_id) ON public.%I FROM anon, authenticated',tbl);
    END IF;
    IF tbl = 'clinics' THEN
      REVOKE SELECT (smtp_password), INSERT (smtp_password), UPDATE (smtp_password) ON public.clinics FROM anon, authenticated;
    END IF;
    EXECUTE format('GRANT SELECT (%s), INSERT (%s), UPDATE (%s), DELETE ON public.%I TO authenticated',cols,write_cols,write_cols,tbl);
  END LOOP;
END $$;

-- Password operations use the same verified business identity as row policies.
CREATE OR REPLACE FUNCTION public.set_clinic_password(p_clinic_id uuid, p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() AND p_clinic_id IS DISTINCT FROM private.clinic_id() THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 OR octet_length(trim(p_new_password)) > 72 THEN RAISE EXCEPTION 'invalid-password'; END IF;
  UPDATE public.clinics SET password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf',10)),
    plain_password = trim(p_new_password), credentials_updated_at = now(), updated_at = now() WHERE id=p_clinic_id;
END $$;
CREATE OR REPLACE FUNCTION public.set_patient_password(p_patient_id uuid, p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() AND p_patient_id IS DISTINCT FROM private.patient_id() THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 OR octet_length(trim(p_new_password)) > 72 THEN RAISE EXCEPTION 'invalid-password'; END IF;
  UPDATE public.patients SET password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf',10)),
    plain_password = trim(p_new_password), credentials_updated_at=now(), updated_at=now() WHERE id=p_patient_id;
END $$;
CREATE OR REPLACE FUNCTION public.set_patient_password_by_clinic(p_clinic_id uuid,p_patient_id uuid,p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NOT private.is_admin() AND p_clinic_id IS DISTINCT FROM private.clinic_id()) OR NOT EXISTS (
    SELECT 1 FROM public.patients WHERE id=p_patient_id AND coalesce(clinic_id,org_id)=p_clinic_id
  ) THEN RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501'; END IF;
  IF p_new_password IS NULL OR length(trim(p_new_password))=0 OR octet_length(trim(p_new_password))>72 THEN RAISE EXCEPTION 'invalid-password'; END IF;
  UPDATE public.patients SET password=extensions.crypt(trim(p_new_password),extensions.gen_salt('bf',10)),
    plain_password=trim(p_new_password),credentials_updated_at=now(),updated_at=now() WHERE id=p_patient_id;
END $$;
CREATE OR REPLACE FUNCTION public.heal_patient_password(p_patient_id uuid,p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_patient_id IS DISTINCT FROM private.patient_id() THEN RAISE EXCEPTION 'not-permitted' USING ERRCODE='42501'; END IF;
  IF p_new_password IS NULL OR length(trim(p_new_password))=0 OR octet_length(trim(p_new_password))>72 THEN RAISE EXCEPTION 'invalid-password'; END IF;
  UPDATE public.patients SET password=extensions.crypt(trim(p_new_password),extensions.gen_salt('bf',10)) WHERE id=p_patient_id;
END $$;
CREATE OR REPLACE FUNCTION public.claim_credentials_for_new_account(p_table text,p_email text,p_new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_new_password IS NULL OR length(trim(p_new_password))=0 OR octet_length(trim(p_new_password))>72 THEN RAISE EXCEPTION 'invalid-password'; END IF;
  IF p_table='patients' AND (private.is_admin() OR private.clinic_id() IS NOT NULL) THEN
    UPDATE public.patients SET password=extensions.crypt(trim(p_new_password),extensions.gen_salt('bf',10)),plain_password=trim(p_new_password)
    WHERE lower(trim(email))=lower(trim(p_email)) AND password IS NULL AND created_at>=now()-interval '15 minutes'
      AND (private.is_admin() OR coalesce(clinic_id,org_id)=private.clinic_id());
  ELSIF p_table='clinics' AND private.is_admin() THEN
    UPDATE public.clinics SET password=extensions.crypt(trim(p_new_password),extensions.gen_salt('bf',10)),plain_password=trim(p_new_password)
    WHERE lower(trim(email))=lower(trim(p_email)) AND password IS NULL AND created_at>=now()-interval '15 minutes';
  ELSIF p_table='profiles' AND private.is_admin() THEN
    UPDATE public.profiles SET password=extensions.crypt(trim(p_new_password),extensions.gen_salt('bf',10))
    WHERE lower(trim(email))=lower(trim(p_email)) AND password IS NULL AND created_at>=now()-interval '15 minutes';
  ELSE RAISE EXCEPTION 'not-permitted' USING ERRCODE='42501';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'credential-claim-failed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_clinic_password(uuid,text),public.set_patient_password(uuid,text),
  public.set_patient_password_by_clinic(uuid,uuid,text),public.heal_patient_password(uuid,text),
  public.claim_credentials_for_new_account(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_password(uuid,text),public.set_patient_password(uuid,text),
  public.set_patient_password_by_clinic(uuid,uuid,text),public.heal_patient_password(uuid,text),
  public.claim_credentials_for_new_account(text,text,text) TO authenticated,service_role;

-- New accounts cannot claim another person's existing email/native Auth identity.
CREATE OR REPLACE FUNCTION public.guard_new_patient_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized text := lower(trim(NEW.email));
BEGIN
  IF TG_OP='UPDATE' AND lower(trim(OLD.email)) IS NOT DISTINCT FROM normalized THEN RETURN NEW; END IF;
  IF normalized IS NULL OR normalized='' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized,0));
  IF EXISTS(SELECT 1 FROM public.patients WHERE lower(trim(email))=normalized AND id<>NEW.id)
    OR EXISTS(SELECT 1 FROM auth.users WHERE lower(trim(email))=normalized)
    OR EXISTS(SELECT 1 FROM public.clinics WHERE lower(trim(email))=normalized)
    OR EXISTS(SELECT 1 FROM public.profiles WHERE lower(trim(email))=normalized) THEN
    RAISE EXCEPTION 'An account with this email already exists' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_new_patient_email ON public.patients;
CREATE TRIGGER guard_new_patient_email BEFORE INSERT OR UPDATE OF email ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.guard_new_patient_email();
REVOKE ALL ON FUNCTION public.guard_new_patient_email() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.credential_matches(p_plain text,p_stored text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_plain IS NULL OR trim(p_plain)='' OR p_stored IS NULL OR p_stored='' THEN false
    WHEN p_stored LIKE '$2a$%' OR p_stored LIKE '$2b$%' OR p_stored LIKE '$2y$%'
      THEN extensions.crypt(trim(p_plain),overlay(p_stored placing 'a' from 3 for 1))=overlay(p_stored placing 'a' from 3 for 1)
    ELSE trim(p_plain)=trim(p_stored)
  END
$$;


-- Apply ownership to patient records and their reports, activity, and billing rows.
DO $$
DECLARE tbl text; pol record; predicates text[]; checks text[]; read_check text; write_check text;
  column_kind text; readonly boolean; clinical boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'reports','algorithm_results','clinical_reports','clinical_documentation','eeg_reports','documents',
    'care_plans','file_metadata','workflows','uploaded_files','wellness_scores','assessments',
    'daily_content','daily_progress','sessions','consent_records','download_logs','access_logs',
    'coach_connection_requests','coaching_sessions','appointments','coach_bookings','patient_feedback',
    'ans_sessions','ans_user_settings','care_program_progress','frequency_favorites','frequency_sessions',
    'meditation_favorites','meditation_sessions','movers_activities','neurofeedback_bookings',
    'neurofeedback_sessions','nootropics_eligibility','pbm_sessions','agreements','alerts','usage',
    'payment_history','patient_payments','payments','subscriptions','monthly_statements',
    'assessment_purchases','frequency_purchases','meditation_purchases','brain_course_purchases',
    'patient_coaching_credits','patient_content_entitlements','wallet_credits','wallet_transactions',
    'wallet_invoices','wallet_subscriptions','wallet_payment_methods','clinic_roles','organizations',
    'admin_notifications','audit_logs','backup_history','report_jobs','report_generation_jobs','sent_notifications'
  ] LOOP
    IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
    predicates := ARRAY['(SELECT private.is_admin())'];
    checks := ARRAY[]::text[];
    IF tbl LIKE 'wallet_%' THEN
      predicates := array_append(predicates,
        '(SELECT private.portal_actor()->>''role'') = ''patient'' AND lower(trim(patient_email)) = lower(trim((SELECT private.portal_actor()->>''email'')))');
    ELSE
      SELECT data_type INTO column_kind FROM information_schema.columns
        WHERE table_schema='public' AND table_name=tbl AND column_name='patient_id';
      IF FOUND THEN
        IF column_kind='uuid' THEN
          predicates := array_append(predicates, 'private.owns_patient(patient_id)');
          checks := array_append(checks, '(patient_id IS NULL OR private.owns_patient(patient_id))');
        ELSE
          predicates := array_append(predicates, 'EXISTS (SELECT 1 FROM public.patients p WHERE p.id::text = patient_id AND private.owns_patient(p.id))');
          checks := array_append(checks, '(patient_id IS NULL OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id::text = patient_id AND private.owns_patient(p.id)))');
        END IF;
        IF tbl='brain_course_purchases' THEN
          predicates := array_append(predicates,'patient_id = auth.uid() AND (SELECT private.patient_id()) IS NOT NULL');
        END IF;
      END IF;
      IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='patient_email') THEN
        predicates := array_append(predicates,'private.owns_patient_email(patient_email)');
        checks := array_append(checks,'(patient_email IS NULL OR private.owns_patient_email(patient_email))');
      END IF;
      IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name='clinic_id') THEN
        predicates := array_append(predicates,'clinic_id = (SELECT private.clinic_id())');
      END IF;
      FOREACH column_kind IN ARRAY ARRAY['clinic_id','org_id'] LOOP
        IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl AND column_name=column_kind) THEN
          checks := array_append(checks,format('(%1$I IS NULL OR %1$I = (SELECT private.clinic_id()) OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id=(SELECT private.patient_id()) AND coalesce(p.clinic_id,p.org_id)=%2$I.%1$I))',column_kind,tbl));
          IF column_kind='org_id' THEN
            predicates := array_append(predicates,'org_id = (SELECT private.clinic_id())');
          END IF;
        END IF;
      END LOOP;
      IF tbl='organizations' THEN
        predicates := array_append(predicates,'id = (SELECT private.clinic_id())');
      END IF;
    END IF;
    read_check := '(' || array_to_string(predicates,' OR ') || ')';
    readonly := tbl = ANY(ARRAY['payment_history','patient_payments','payments','subscriptions','monthly_statements',
      'assessment_purchases','frequency_purchases','meditation_purchases','brain_course_purchases',
      'patient_coaching_credits','patient_content_entitlements','wallet_credits','wallet_transactions',
      'wallet_invoices','wallet_subscriptions','usage','admin_notifications','audit_logs','backup_history',
      'report_jobs','report_generation_jobs','sent_notifications','organizations']);
    clinical := tbl = ANY(ARRAY['reports','algorithm_results','clinical_reports','clinical_documentation','eeg_reports',
      'care_plans','file_metadata','workflows','uploaded_files','wellness_scores','agreements','clinic_roles']);
    write_check := CASE WHEN readonly THEN '(SELECT private.is_admin())'
      WHEN clinical THEN read_check || ' AND ((SELECT private.is_admin()) OR (SELECT private.clinic_id()) IS NOT NULL)'
      ELSE read_check END;
    IF cardinality(checks)>0 THEN
      write_check := '('||write_check||') AND ((SELECT private.is_admin()) OR ('||array_to_string(checks,' AND ')||'))';
    END IF;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,tbl);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('CREATE POLICY scoped_read ON public.%I FOR SELECT TO authenticated USING (%s)',tbl,read_check);
    EXECUTE format('CREATE POLICY scoped_create ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',tbl,write_check);
    EXECUTE format('CREATE POLICY scoped_edit ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',tbl,write_check,write_check);
    EXECUTE format('CREATE POLICY scoped_delete ON public.%I FOR DELETE TO authenticated USING (%s)',tbl,write_check);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',tbl);
  END LOOP;
END $$;

-- Wallet status is local display state, never a payment or access grant.
REVOKE INSERT, UPDATE, DELETE ON public.wallet_subscriptions FROM authenticated;
DO $$ DECLARE cols text; BEGIN
  SELECT string_agg(quote_ident(column_name), ',') INTO cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='wallet_subscriptions';
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.wallet_subscriptions FROM authenticated',cols,cols);
END $$;
GRANT UPDATE (status) ON public.wallet_subscriptions TO authenticated;
CREATE POLICY wallet_status_edit ON public.wallet_subscriptions FOR UPDATE TO authenticated
USING ((SELECT private.portal_actor()->>'role')='patient' AND
  lower(trim(patient_email))=lower(trim((SELECT private.portal_actor()->>'email'))))
WITH CHECK ((SELECT private.portal_actor()->>'role')='patient' AND
  lower(trim(patient_email))=lower(trim((SELECT private.portal_actor()->>'email'))));
CREATE OR REPLACE FUNCTION public.protect_wallet_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user='authenticated' AND NOT coalesce((
    (OLD.status='Active' AND NEW.status IN ('Paused','Cancelled')) OR
    (OLD.status='Paused' AND NEW.status IN ('Active','Cancelled'))
  ),false) THEN
    RAISE EXCEPTION 'Invalid wallet status transition' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_wallet_status_transition ON public.wallet_subscriptions;
CREATE TRIGGER protect_wallet_status_transition BEFORE UPDATE OF status ON public.wallet_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.protect_wallet_status_transition();
REVOKE ALL ON FUNCTION public.protect_wallet_status_transition() FROM PUBLIC;

-- Browser audit entries are self-reported; stamp identity rather than trust metadata.
CREATE OR REPLACE FUNCTION public.stamp_client_audit_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor jsonb;
BEGIN
  IF current_user='authenticated' THEN
    actor := private.portal_actor();
    IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
    NEW.user_id := auth.uid();
    NEW.user_email := actor->>'email';
    NEW.user_role := actor->>'role';
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stamp_client_audit_identity ON public.audit_logs;
CREATE TRIGGER stamp_client_audit_identity BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.stamp_client_audit_identity();
REVOKE ALL ON FUNCTION public.stamp_client_audit_identity() FROM PUBLIC;
CREATE POLICY audit_self_append ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid() AND (SELECT private.portal_actor()) IS NOT NULL);
-- The existing insert helper requests its inserted row back.
CREATE POLICY audit_self_read ON public.audit_logs FOR SELECT TO authenticated
USING (user_id=auth.uid() AND (SELECT private.portal_actor()) IS NOT NULL);

-- Clinics may append their profile-change notice, never payment/admin decisions.
CREATE POLICY clinic_profile_notice ON public.admin_notifications FOR INSERT TO authenticated
WITH CHECK (clinic_id=(SELECT private.clinic_id()) AND type='profile_change' AND category='clinic'
  AND patient_id IS NULL AND report_id IS NULL AND action IS NULL
  AND coalesce(action_data,'{}'::jsonb)='{}'::jsonb AND is_read IS FALSE
  AND created_by=(SELECT private.portal_actor()->>'email'));

-- Backend maintenance/fulfillment functions must not bypass the row policies via RPC.
DO $$ DECLARE sig text; fn regprocedure; BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.increment_clinic_report_credits(uuid,integer)',
    'public.revoke_consent(uuid,text)', 'public.update_setting(text,text,text)',
    'public.expire_old_consents()', 'public.generate_monthly_statement(uuid,integer,integer)',
    'public.check_permission(uuid,uuid,text)', 'public.exec_sql(text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn);
    END IF;
  END LOOP;
END $$;
-- Existing coaches policies pass the JWT email, which is internal for clinic sessions.
-- Resolve the verified mapping instead; caller-supplied emails confer no authority.
CREATE OR REPLACE FUNCTION public.get_user_clinic_id(user_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.clinic_id()
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT user_id=auth.uid() AND private.is_admin()
$$;

-- Preserve report-insert metering while protecting client quota writes.
CREATE OR REPLACE FUNCTION public.increment_clinic_reports_used()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.clinics SET reports_used=coalesce(reports_used,0)+1, updated_at=now()
  WHERE id=NEW.clinic_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.increment_clinic_reports_used() FROM PUBLIC,anon,authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
