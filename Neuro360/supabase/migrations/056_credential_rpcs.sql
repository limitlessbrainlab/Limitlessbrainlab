-- ============================================================
-- 056_credential_rpcs.sql
-- Fixes Supabase Security Advisor `sensitive_columns_exposed`
-- (Step 1 of 2 — safe to apply anytime: nothing calls these
--  functions until the frontend deploy lands)
--
-- Moves credential verification + credential writes into
-- security-definer functions so the browser never needs to
-- read `password` / `plain_password` through the API.
--
-- Semantics mirror src/utils/passwordUtils.comparePassword:
-- bcrypt ($2a$/$2b$/$2y$) via pgcrypto, else plaintext equality.
-- Verified: pgcrypto present + $2b$ works on both projects.
-- ============================================================

-- ------------------------------------------------------------
-- Shared matcher (same rules as comparePassword in the app)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credential_matches(p_plain text, p_stored text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_stored LIKE '$2a$%' OR p_stored LIKE '$2b$%' OR p_stored LIKE '$2y$%'
      THEN extensions.crypt(trim(p_plain), p_stored) = p_stored
    ELSE trim(p_plain) = trim(coalesce(p_stored, ''))
  END
$$;

-- Helper: email claimed by the caller's JWT (empty when anonymous)
CREATE OR REPLACE FUNCTION public.jwt_email()
RETURNS text
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')))
$$;

-- Helper: caller is a super admin (profiles.id === auth.uid())
CREATE OR REPLACE FUNCTION public.caller_is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )
$$;

-- ------------------------------------------------------------
-- LOGIN VERIFICATION (callable by anon — this IS the login)
-- Rows are returned WITHOUT credential columns.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_clinic_login(p_email text, p_password text)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_jsonb(c) - 'password' - 'plain_password' - 'smtp_password'
  FROM public.clinics c
  WHERE lower(trim(c.email)) = lower(trim(p_email))
    AND public.credential_matches(p_password, c.password)
  ORDER BY c.created_at DESC NULLS LAST
$$;

CREATE OR REPLACE FUNCTION public.verify_patient_login(p_email text, p_password text)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_jsonb(p) - 'password' - 'plain_password'
  FROM public.patients p
  WHERE lower(trim(p.email)) = lower(trim(p_email))
    AND public.credential_matches(p_password, p.password)
  ORDER BY p.created_at DESC NULLS LAST
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT to_jsonb(p) - 'password'
  FROM public.profiles p
  WHERE lower(trim(p.email)) = lower(trim(p_email))
    AND p.role = 'super_admin'
    AND public.credential_matches(p_password, p.password)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION
  public.verify_clinic_login(text, text),
  public.verify_patient_login(text, text),
  public.verify_admin_login(text, text)
TO anon, authenticated;

-- ------------------------------------------------------------
-- CREDENTIAL WRITES
-- ------------------------------------------------------------

-- Admin/self password change for a clinic.
-- Gate: caller's JWT email matches the clinic, or caller is super admin.
CREATE OR REPLACE FUNCTION public.set_clinic_password(p_clinic_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 THEN
    RAISE EXCEPTION 'password-required';
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM public.clinics WHERE id = p_clinic_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'clinic-not-found'; END IF;

  IF coalesce(public.jwt_email(), '') <> v_email AND NOT public.caller_is_super_admin() THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clinics SET
    password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10)),
    plain_password = trim(p_new_password),
    credentials_updated_at = now(),
    updated_at = now()
  WHERE id = p_clinic_id;
END;
$$;

-- Admin/self password change for a patient (same gates).
CREATE OR REPLACE FUNCTION public.set_patient_password(p_patient_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 THEN
    RAISE EXCEPTION 'password-required';
  END IF;

  SELECT lower(trim(email)) INTO v_email FROM public.patients WHERE id = p_patient_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'patient-not-found'; END IF;

  IF coalesce(public.jwt_email(), '') <> v_email AND NOT public.caller_is_super_admin() THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients SET
    password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10)),
    plain_password = trim(p_new_password),
    credentials_updated_at = now(),
    updated_at = now()
  WHERE id = p_patient_id;
END;
$$;

-- Clinic edits its own patient's password.
-- Clinic users have no Supabase session, so the gate is ownership
-- knowledge: the caller must supply the clinic_id the patient
-- belongs to (equivalent exposure to the previous allow-all update,
-- no weaker; the secret columns stay hidden from SELECT either way).
CREATE OR REPLACE FUNCTION public.set_patient_password_by_clinic(
  p_clinic_id uuid, p_patient_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 THEN
    RAISE EXCEPTION 'password-required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients SET
    password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10)),
    plain_password = trim(p_new_password),
    credentials_updated_at = now(),
    updated_at = now()
  WHERE id = p_patient_id;
END;
$$;

-- Patient self-heal (login via Supabase Auth succeeded for this email;
-- store the hash so future logins take the fast path). Mirrors the
-- previous browser write exactly: password column only, no bump.
CREATE OR REPLACE FUNCTION public.heal_patient_password(p_patient_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF coalesce(public.jwt_email(), '') = '' THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND lower(trim(email)) = public.jwt_email()
  ) THEN
    RAISE EXCEPTION 'not-permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients SET
    password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10))
  WHERE id = p_patient_id;
END;
$$;

-- Registration helper: set credentials on a JUST-created account.
-- Guarded: only rows with no password yet, created in the last 15 min
-- (prevents using this to reset arbitrary existing accounts).
CREATE OR REPLACE FUNCTION public.claim_credentials_for_new_account(
  p_table text, p_email text, p_new_password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_table text;
BEGIN
  v_table := lower(coalesce(p_table, ''));
  IF v_table NOT IN ('clinics', 'patients', 'profiles') THEN
    RAISE EXCEPTION 'invalid-table';
  END IF;
  IF p_new_password IS NULL OR length(trim(p_new_password)) = 0 THEN
    RAISE EXCEPTION 'password-required';
  END IF;

  IF v_table = 'clinics' THEN
    UPDATE public.clinics SET
      password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10)),
      plain_password = trim(p_new_password)
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND password IS NULL
      AND created_at >= now() - interval '15 minutes';
  ELSIF v_table = 'patients' THEN
    UPDATE public.patients SET
      password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10)),
      plain_password = trim(p_new_password)
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND password IS NULL
      AND created_at >= now() - interval '15 minutes';
  ELSE
    UPDATE public.profiles SET
      password = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf', 10))
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND password IS NULL
      AND created_at >= now() - interval '15 minutes';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credential-claim-failed';
  END IF;
END;
$$;

-- Execute permissions: logins are anon-callable; writes per audience.
REVOKE ALL ON FUNCTION public.set_clinic_password(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_patient_password(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.heal_patient_password(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_patient_password_by_clinic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_clinic_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_patient_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heal_patient_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_patient_password_by_clinic(uuid, uuid, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_credentials_for_new_account(text, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';


