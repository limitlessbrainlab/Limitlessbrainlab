-- Additive prerequisites: deploy before the clinic-session endpoint/frontend.
BEGIN;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clinics_auth_user_id_key ON public.clinics(auth_user_id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS patients_auth_user_id_idx ON public.patients(auth_user_id);

CREATE OR REPLACE FUNCTION public.protect_clinic_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND
    ((TG_OP = 'INSERT' AND NEW.auth_user_id IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id)) THEN
    RAISE EXCEPTION 'Authentication mapping is server-managed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.password IS DISTINCT FROM OLD.password OR NEW.email IS DISTINCT FROM OLD.email OR
     NEW.credentials_updated_at IS DISTINCT FROM OLD.credentials_updated_at) THEN
    -- Old Auth sessions remain cryptographically valid but no longer map to this clinic.
    NEW.auth_user_id := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_clinic_identity ON public.clinics;
CREATE TRIGGER protect_clinic_identity BEFORE INSERT OR UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_identity();
DROP TRIGGER IF EXISTS protect_patient_identity ON public.patients;
CREATE TRIGGER protect_patient_identity BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_identity();

-- Called only by the backend after cryptographic JWT verification.
-- Checking auth.sessions makes revoked access JWTs ineffective immediately.
CREATE OR REPLACE FUNCTION public.resolve_portal_identity(p_user_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH verified_session AS (
    SELECT u.id, u.email FROM auth.users u JOIN auth.sessions s ON s.user_id = u.id
    WHERE u.id = p_user_id AND s.id = p_session_id
  ), identities AS (
    SELECT 1 AS priority, jsonb_build_object('id', s.id, 'email', s.email, 'role', 'super_admin') AS actor
    FROM verified_session s JOIN public.profiles p ON p.id = s.id WHERE p.role::text = 'super_admin'
    UNION ALL
    SELECT 2, jsonb_build_object('id', s.id, 'email', c.email, 'role', 'clinic_admin', 'clinic_id', c.id)
    FROM verified_session s JOIN public.clinics c ON c.auth_user_id = s.id
    WHERE c.is_active IS TRUE AND c.deleted_at IS NULL AND c.subscription_status IS DISTINCT FROM 'pending_approval'
    UNION ALL
    SELECT 3, jsonb_build_object('id', s.id, 'email', p.email, 'role', 'patient', 'patient_id', p.id)
    FROM verified_session s JOIN public.patients p ON p.auth_user_id = s.id
    WHERE lower(trim(p.email)) = lower(trim(s.email)) AND p.id = (
      SELECT latest.id FROM public.patients latest WHERE lower(trim(latest.email)) = lower(trim(s.email))
      ORDER BY latest.created_at DESC NULLS LAST, latest.id DESC LIMIT 1
    )
  ) SELECT actor FROM identities ORDER BY priority LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.resolve_portal_identity(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_portal_identity(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT public.caller_is_super_admin() THEN
    IF (TG_OP = 'INSERT' AND (NEW.role::text <> 'patient' OR NEW.id IS DISTINCT FROM auth.uid())) OR
       (TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role)) OR
       (TG_OP = 'DELETE' AND OLD.id IS DISTINCT FROM auth.uid()) THEN
      RAISE EXCEPTION 'Profile authority is administrator-managed' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_authority ON public.profiles;
CREATE TRIGGER protect_profile_authority BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();
REVOKE ALL ON FUNCTION public.protect_clinic_identity(), public.protect_profile_authority() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';

-- Prepare scoped helpers and safe projection columns before application deployment.
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


COMMIT;
