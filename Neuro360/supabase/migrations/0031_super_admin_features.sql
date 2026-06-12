-- Add agreement management and care plan features
-- Migration for Super Admin Dashboard enhancements

-- Create agreement types
CREATE TYPE agreement_type AS ENUM ('standard', 'premium', 'enterprise');
CREATE TYPE agreement_status AS ENUM ('draft', 'pending', 'signed', 'expired', 'cancelled');

-- Agreements table for clinic contracts
CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agreement_type agreement_type NOT NULL DEFAULT 'standard',
  status agreement_status NOT NULL DEFAULT 'draft',

  -- Contract details
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  cobranding_enabled BOOLEAN DEFAULT FALSE,
  cobranding_fee DECIMAL(10,2) DEFAULT 0,
  special_terms TEXT,
  payment_terms VARCHAR(50) DEFAULT 'monthly',

  -- Document management
  document_url TEXT,
  template_version VARCHAR(20),

  -- Signature tracking
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by JSONB, -- Array of signatories with names, roles, timestamps

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Care plans table for personalized treatment plans
CREATE TABLE care_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id),

  -- Plan status and dates
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  review_date DATE,
  next_review_date DATE,

  -- Primary treatment goals
  primary_goals JSONB NOT NULL DEFAULT '[]',

  -- Neurofeedback protocol
  neurofeedback_protocol JSONB DEFAULT '{}',

  -- Cognitive exercises and interventions
  cognitive_exercises JSONB DEFAULT '[]',

  -- Lifestyle recommendations
  lifestyle_recommendations JSONB DEFAULT '[]',

  -- Progress tracking
  milestones JSONB DEFAULT '[]',

  -- Clinical notes
  clinical_notes TEXT,

  -- Plan metrics
  overall_progress_percentage INTEGER DEFAULT 0 CHECK (overall_progress_percentage >= 0 AND overall_progress_percentage <= 100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- File metadata table for tracking all file types
CREATE TABLE file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  care_plan_id UUID REFERENCES care_plans(id) ON DELETE SET NULL,

  -- File information
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL, -- patient_profile, qeeg_profile, neurosense_report, care_plan
  file_size BIGINT,
  mime_type VARCHAR(100),

  -- Storage information
  storage_path TEXT NOT NULL,
  storage_provider VARCHAR(20) DEFAULT 'supabase', -- supabase, aws_s3, local

  -- File status and version
  status VARCHAR(20) DEFAULT 'active', -- active, archived, deleted
  version INTEGER DEFAULT 1,
  checksum VARCHAR(64), -- For integrity checking

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Additional file-specific metadata

  -- Access control
  visibility VARCHAR(20) DEFAULT 'private', -- private, clinic, public

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add agreement status to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS agreement_status agreement_status DEFAULT 'draft';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_agreement_id UUID REFERENCES agreements(id);

-- Add admin assignment tracking to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS assigned_admins JSONB DEFAULT '[]';

-- Enhanced location tracking for analytics
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'United States';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS coordinates POINT; -- For geographic analytics

-- Usage tracking for reports and analytics
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reports_used INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reports_allowed INTEGER DEFAULT 10;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_usage_reset DATE DEFAULT CURRENT_DATE;

-- Create indexes for performance
CREATE INDEX idx_agreements_clinic_id ON agreements(clinic_id);
CREATE INDEX idx_agreements_status ON agreements(status);
CREATE INDEX idx_care_plans_patient_id ON care_plans(patient_id);
CREATE INDEX idx_care_plans_status ON care_plans(status);
CREATE INDEX idx_file_metadata_patient_id ON file_metadata(patient_id);
CREATE INDEX idx_file_metadata_type ON file_metadata(file_type);
CREATE INDEX idx_file_metadata_status ON file_metadata(status);
CREATE INDEX idx_organizations_agreement_status ON organizations(agreement_status);
CREATE INDEX idx_organizations_location ON organizations(city, state, country);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agreements_updated_at BEFORE UPDATE ON agreements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_care_plans_updated_at BEFORE UPDATE ON care_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_file_metadata_updated_at BEFORE UPDATE ON file_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing (optional)
/*
INSERT INTO agreements (clinic_id, agreement_type, status, valid_from, valid_until, cobranding_enabled, cobranding_fee)
SELECT
  id,
  'standard'::agreement_type,
  'signed'::agreement_status,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  random() > 0.5,
  CASE WHEN random() > 0.5 THEN 299.00 ELSE 0 END
FROM organizations
WHERE type = 'clinic'
LIMIT 3;
*/