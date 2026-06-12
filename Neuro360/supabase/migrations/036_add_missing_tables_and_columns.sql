-- Add missing columns to existing tables

-- clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_type VARCHAR(50);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS smtp_email VARCHAR(255);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS smtp_password TEXT;

-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(255);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS handedness VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255);

-- algorithm_results
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS algorithm_name TEXT;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS input_data JSONB;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS output_data JSONB;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS parameter_notes TEXT;
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS report_mode VARCHAR(50);
ALTER TABLE algorithm_results ADD COLUMN IF NOT EXISTS claude_report_url TEXT;

-- Create missing tables

CREATE TABLE IF NOT EXISTS brain_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id VARCHAR(100),
  name VARCHAR(255),
  color VARCHAR(50),
  position JSONB,
  responsibilities JSONB,
  strengthen JSONB,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  param_id VARCHAR(100),
  label VARCHAR(255),
  icon TEXT,
  description TEXT,
  intro TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  author VARCHAR(255),
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brain_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  city VARCHAR(100),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  message TEXT,
  profession VARCHAR(255),
  industry VARCHAR(255),
  brain_fitness_score INTEGER,
  has_done_brain_scan BOOLEAN DEFAULT false,
  program_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS professional_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  city_country VARCHAR(255),
  organization VARCHAR(255),
  certifications TEXT,
  professional_category VARCHAR(100),
  years_experience VARCHAR(50),
  client_segments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessment_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  assessment_id VARCHAR(255),
  assessment_name VARCHAR(255),
  assessment_link TEXT,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  amount_paid NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'completed',
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS neurosense_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  link TEXT,
  is_free BOOLEAN DEFAULT false,
  is_inquire BOOLEAN DEFAULT false,
  original_price_usd NUMERIC(10,2),
  sale_price_usd NUMERIC(10,2),
  original_price_aed NUMERIC(10,2),
  sale_price_aed NUMERIC(10,2),
  original_price_inr NUMERIC(10,2),
  sale_price_inr NUMERIC(10,2),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  category VARCHAR(100),
  bundle_includes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(100),
  category VARCHAR(100),
  title VARCHAR(255),
  message TEXT,
  clinic_id UUID,
  clinic_name VARCHAR(255),
  patient_id UUID,
  patient_name VARCHAR(255),
  report_id TEXT,
  action VARCHAR(100),
  action_data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_documentation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID,
  clinic_id UUID,
  patient_name VARCHAR(255),
  recording_date DATE,
  duration INTEGER,
  eyes_open BOOLEAN DEFAULT false,
  eyes_closed BOOLEAN DEFAULT false,
  both_conditions BOOLEAN DEFAULT false,
  hyperventilation BOOLEAN DEFAULT false,
  photic_stimulation BOOLEAN DEFAULT false,
  cognitive_task BOOLEAN DEFAULT false,
  cognitive_task_details TEXT,
  other_task BOOLEAN DEFAULT false,
  other_task_details TEXT,
  electrode_system VARCHAR(50),
  reporting_clinician VARCHAR(255),
  date_of_report DATE,
  institution_name VARCHAR(255),
  partner_platform VARCHAR(255),
  unique_report_id VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  contact_address TEXT,
  file_urls JSONB,
  examination_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pbm_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  target_area VARCHAR(255),
  wavelength VARCHAR(100),
  duration_minutes INTEGER,
  session_date DATE,
  notes TEXT,
  rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS neurofeedback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  focus_area VARCHAR(255),
  duration_minutes INTEGER,
  session_date DATE,
  notes TEXT,
  rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frequency_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  frequency_id VARCHAR(255),
  duration_minutes INTEGER,
  session_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frequency_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  frequency_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_program_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  current_week INTEGER DEFAULT 1,
  start_date DATE,
  checked_items JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID,
  patient_email VARCHAR(255),
  patient_name VARCHAR(255),
  rating INTEGER,
  category VARCHAR(100),
  message TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preferred_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  title VARCHAR(255),
  description TEXT,
  address TEXT,
  phone VARCHAR(50),
  image_url TEXT,
  status VARCHAR(50) DEFAULT 'active',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nootropics_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  is_eligible BOOLEAN DEFAULT false,
  eligibility_checks JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID,
  patient_uid VARCHAR(255),
  org_id UUID,
  clinic_name VARCHAR(255),
  full_name VARCHAR(255),
  date_of_birth DATE,
  gender VARCHAR(20),
  handedness VARCHAR(20),
  occupation VARCHAR(255),
  date_of_test DATE,
  referring_physician VARCHAR(255),
  referral_reason TEXT,
  presenting_complaints TEXT,
  symptom_duration VARCHAR(100),
  past_medical_history TEXT,
  medications TEXT,
  family_history TEXT,
  lifestyle TEXT,
  uploaded_documents JSONB,
  appearance_behavior TEXT,
  mood_affect TEXT,
  thought_process_content TEXT,
  cognitive_assessment TEXT,
  insight_judgment TEXT,
  eeg_frequency_bands JSONB,
  eeg_connectivity JSONB,
  eeg_asymmetry_patterns TEXT,
  eeg_artifact_quality TEXT,
  brain_parameters JSONB,
  primary_findings TEXT,
  correlations_clinical_eeg TEXT,
  differential_considerations TEXT,
  lifestyle_modifications TEXT,
  cognitive_behavioral_strategies TEXT,
  neurofeedback_protocol TEXT,
  pharmacological_considerations TEXT,
  referrals_followup TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE brain_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE neurosense_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE pbm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE neurofeedback_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_program_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferred_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nootropics_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_reports ENABLE ROW LEVEL SECURITY;

-- Permissive policies for all new tables
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY[
  'brain_regions','brain_parameters','brain_quotes','brain_tips',
  'contact_inquiries','program_inquiries','professional_onboarding',
  'assessment_purchases','neurosense_assessments','admin_notifications',
  'clinical_documentation','pbm_sessions','neurofeedback_sessions',
  'frequency_sessions','frequency_favorites','care_program_progress',
  'patient_feedback','preferred_locations','clinic_locations',
  'nootropics_eligibility','clinical_reports'
]) LOOP
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
  EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
END LOOP; END $$;
