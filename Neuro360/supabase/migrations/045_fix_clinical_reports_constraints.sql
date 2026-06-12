-- Relax NOT NULL constraints on clinical_reports to allow restore
ALTER TABLE clinical_reports ALTER COLUMN patient_uid DROP NOT NULL;
ALTER TABLE clinical_reports ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE clinical_reports ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE clinical_reports DROP CONSTRAINT IF EXISTS clinical_reports_patient_id_fkey;
ALTER TABLE clinical_reports DROP CONSTRAINT IF EXISTS clinical_reports_org_id_fkey;
ALTER TABLE clinical_reports ALTER COLUMN patient_id DROP NOT NULL;
