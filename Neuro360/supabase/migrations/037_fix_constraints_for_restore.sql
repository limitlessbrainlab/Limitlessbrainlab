-- Drop FK so profiles can be restored without auth users existing
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Fix clinical_reports column name
ALTER TABLE clinical_reports ADD COLUMN IF NOT EXISTS appearance_be TEXT;

-- Relax pricing_config constraints
ALTER TABLE pricing_config DROP CONSTRAINT IF EXISTS pricing_config_type_check;

-- Relax professional_onboarding column lengths
ALTER TABLE professional_onboarding ALTER COLUMN certifications TYPE TEXT;
ALTER TABLE professional_onboarding ALTER COLUMN professional_category TYPE TEXT;
ALTER TABLE professional_onboarding ALTER COLUMN years_experience TYPE TEXT;

-- Fix program_inquiries boolean stored as string in backup
ALTER TABLE program_inquiries ALTER COLUMN has_done_brain_scan TYPE TEXT USING has_done_brain_scan::TEXT;

-- Allow null patient_id in patient_feedback
ALTER TABLE patient_feedback ALTER COLUMN patient_id DROP NOT NULL;

-- Make patients owner_user nullable (auth users won't exist in staging)
ALTER TABLE patients ALTER COLUMN owner_user DROP NOT NULL;
