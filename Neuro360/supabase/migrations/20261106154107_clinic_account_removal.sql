BEGIN;

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clinics ADD CONSTRAINT removed_clinics_inactive
  CHECK (deleted_at IS NULL OR is_active IS FALSE);

-- Client-side CRUD must not undo account removal or mark another account removed.
CREATE FUNCTION public.protect_clinic_removal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.is_active IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'Removed clinic accounts cannot be reactivated';
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.deleted_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    IF current_user NOT IN ('postgres', 'service_role') THEN
      RAISE EXCEPTION 'Account removal requires the admin service';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_clinic_removal BEFORE INSERT OR UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_removal();

COMMIT;
