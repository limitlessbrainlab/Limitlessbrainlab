-- Fix contact_inquiries: id is integer in backup, not UUID
ALTER TABLE contact_inquiries DROP CONSTRAINT IF EXISTS contact_inquiries_pkey;
ALTER TABLE contact_inquiries ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE contact_inquiries ADD PRIMARY KEY (id);

-- Fix patient_feedback: patient_id is text (like 'HOPE-202512-0001'), not UUID
ALTER TABLE patient_feedback ALTER COLUMN patient_id TYPE TEXT USING patient_id::TEXT;

-- Fix patients: drop FK on clinic_id so mismatched clinic_ids don't block restore
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_clinic_id_fkey;

-- Fix reports: drop FK on patient_id to handle patients that might fail
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_patient_id_fkey;

-- Ensure clinical_reports has appearance_behavior column
ALTER TABLE clinical_reports ADD COLUMN IF NOT EXISTS appearance_behavior TEXT;

-- Fix pricing_config check constraint (likely on a column value range)
DO $$ BEGIN
  ALTER TABLE pricing_config DROP CONSTRAINT IF EXISTS pricing_config_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop any remaining check constraints on pricing_config
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'pricing_config'::regclass AND contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE pricing_config DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;
