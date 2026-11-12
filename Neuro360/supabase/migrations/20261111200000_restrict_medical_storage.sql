-- Bucket public flags are changed through the Storage API, not storage metadata SQL.
BEGIN;
DROP POLICY IF EXISTS "neurosense-reports access" ON storage.objects;
DROP POLICY IF EXISTS private_medical_objects ON storage.objects;
CREATE POLICY private_medical_objects ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
USING (bucket_id NOT IN ('patients_documents','neurosense-reports','patient-reports','edf-files','qeeg-uploads'))
WITH CHECK (bucket_id NOT IN ('patients_documents','neurosense-reports','patient-reports','edf-files','qeeg-uploads'));
COMMIT;
