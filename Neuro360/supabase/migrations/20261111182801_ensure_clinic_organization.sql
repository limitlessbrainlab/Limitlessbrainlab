BEGIN;
-- Clinic and organization use the same business ID. Keep first-patient creation
-- compatible with read-only organization permissions, atomically with clinic creation.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION private.ensure_clinic_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  INSERT INTO public.organizations(id, name)
  VALUES (NEW.id, coalesce(nullif(NEW.name, ''), 'Clinic') || '_' || NEW.id::text)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_clinic_organization() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ensure_clinic_organization ON public.clinics;
CREATE TRIGGER ensure_clinic_organization AFTER INSERT ON public.clinics
FOR EACH ROW EXECUTE FUNCTION private.ensure_clinic_organization();
INSERT INTO public.organizations(id, name)
SELECT c.id, coalesce(nullif(c.name, ''), 'Clinic') || '_' || c.id::text
FROM public.clinics c WHERE NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=c.id)
ON CONFLICT (id) DO NOTHING;
COMMIT;
