-- Return newly inserted clinic patients without a lookup of the same table.
-- A self-query under INSERT ... RETURNING cannot see the new row in its snapshot.
BEGIN;

DROP POLICY IF EXISTS patient_read ON public.patients;
CREATE POLICY patient_read ON public.patients FOR SELECT TO authenticated
USING (
  (SELECT private.is_admin())
  OR id = (SELECT private.patient_id())
  OR coalesce(clinic_id, org_id) = (SELECT private.clinic_id())
);

COMMIT;
