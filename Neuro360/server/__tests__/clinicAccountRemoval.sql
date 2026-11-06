-- Run only in a DISPOSABLE EMPTY database: psql -v ON_ERROR_STOP=1 -f this-file.sql
-- CREATE TABLE intentionally fails if a clinics table already exists.
\set ON_ERROR_STOP on
CREATE TABLE public.clinics (id uuid PRIMARY KEY, is_active boolean, name text);
CREATE TABLE public.patients (id integer PRIMARY KEY, clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE);
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.clinics TO anon, authenticated, service_role;
\ir ../../supabase/migrations/20261106154107_clinic_account_removal.sql
INSERT INTO clinics VALUES ('12345678-1234-4234-8234-123456789abc', true, 'Fixture clinic', null);
INSERT INTO patients VALUES (1, '12345678-1234-4234-8234-123456789abc');
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    UPDATE public.clinics SET deleted_at=now(), is_active=false;
    RAISE EXCEPTION 'TEST FAILED: anon removed an account';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Account removal requires the admin service' THEN RAISE; END IF;
  END;
END $$;
SET ROLE service_role;
UPDATE public.clinics SET deleted_at=now(), is_active=false;
DO $$ BEGIN
  BEGIN
    UPDATE public.clinics SET deleted_at=null, is_active=true;
    RAISE EXCEPTION 'TEST FAILED: removed account reactivated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Removed clinic accounts cannot be reactivated' THEN RAISE; END IF;
  END;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.clinics VALUES ('22345678-1234-4234-8234-123456789abc', false, 'Removed', now());
    RAISE EXCEPTION 'TEST FAILED: client inserted a removed account';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Account removal requires the admin service' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.clinics) = 1, 'clinic record must be retained';
  ASSERT (SELECT count(*) FROM public.patients) = 1, 'patient record must be retained';
  ASSERT (SELECT is_active IS FALSE AND deleted_at IS NOT NULL FROM public.clinics), 'removed account must remain inactive';
END $$;
SELECT 'Clinic removal database checks passed' AS result;
