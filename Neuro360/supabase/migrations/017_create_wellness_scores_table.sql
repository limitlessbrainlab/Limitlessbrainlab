-- Create wellness status enum
DO $$ BEGIN CREATE TYPE wellness_status AS ENUM ('normal', 'mild', 'moderate', 'severe'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create wellness_scores table
CREATE TABLE IF NOT EXISTS wellness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  eeg_report_id UUID REFERENCES eeg_reports(id) ON DELETE SET NULL,
  assessment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Core wellness scores (0-100 scale)
  cognition_score DECIMAL(5,2) NOT NULL CHECK (cognition_score >= 0 AND cognition_score <= 100),
  stress_score DECIMAL(5,2) NOT NULL CHECK (stress_score >= 0 AND stress_score <= 100),
  focus_attention_score DECIMAL(5,2) NOT NULL CHECK (focus_attention_score >= 0 AND focus_attention_score <= 100),
  focus_stimulus_control_score DECIMAL(5,2) NOT NULL CHECK (focus_stimulus_control_score >= 0 AND focus_stimulus_control_score <= 100),
  burnout_fatigue_score DECIMAL(5,2) NOT NULL CHECK (burnout_fatigue_score >= 0 AND burnout_fatigue_score <= 100),
  emotional_regulation_score DECIMAL(5,2) NOT NULL CHECK (emotional_regulation_score >= 0 AND emotional_regulation_score <= 100),
  learning_score DECIMAL(5,2) CHECK (learning_score IS NULL OR (learning_score >= 0 AND learning_score <= 100)),
  creativity_score DECIMAL(5,2) NOT NULL CHECK (creativity_score >= 0 AND creativity_score <= 100),
  overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),

  -- Detailed metrics for each parameter (stored as JSONB for flexibility)
  cognition_details JSONB DEFAULT '{}',
  stress_details JSONB DEFAULT '{}',
  focus_attention_details JSONB DEFAULT '{}',
  focus_stimulus_control_details JSONB DEFAULT '{}',
  burnout_fatigue_details JSONB DEFAULT '{}',
  emotional_regulation_details JSONB DEFAULT '{}',
  learning_details JSONB DEFAULT '{}',
  creativity_details JSONB DEFAULT '{}',

  -- Overall wellness assessment
  overall_status wellness_status NOT NULL DEFAULT 'normal',
  recommendations TEXT[] DEFAULT '{}',
  clinical_notes TEXT,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_wellness_scores_patient_id ON wellness_scores(patient_id);
CREATE INDEX idx_wellness_scores_eeg_report_id ON wellness_scores(eeg_report_id);
CREATE INDEX idx_wellness_scores_assessment_date ON wellness_scores(assessment_date DESC);
CREATE INDEX idx_wellness_scores_overall_status ON wellness_scores(overall_status);
CREATE INDEX idx_wellness_scores_patient_date ON wellness_scores(patient_id, assessment_date DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wellness_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wellness_scores_updated_at
  BEFORE UPDATE ON wellness_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_wellness_scores_updated_at();

-- Add wellness_score_id to eeg_reports table for bidirectional relationship
ALTER TABLE eeg_reports
ADD COLUMN IF NOT EXISTS wellness_score_id UUID REFERENCES wellness_scores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eeg_reports_wellness_score_id ON eeg_reports(wellness_score_id);

-- Enable Row Level Security
ALTER TABLE wellness_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wellness_scores

-- Super admins can do everything
DROP POLICY IF EXISTS "Super admins have full access to wellness_scores" ON wellness_scores;
CREATE POLICY "Super admins have full access to wellness_scores"
  ON wellness_scores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Clinicians can view wellness scores for patients in their organization
DROP POLICY IF EXISTS "Clinicians can view wellness_scores for their org patients" ON wellness_scores;
CREATE POLICY "Clinicians can view wellness_scores for their org patients"
  ON wellness_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      INNER JOIN org_memberships om ON om.org_id = p.org_id
      WHERE p.id = wellness_scores.patient_id
      AND om.user_id = auth.uid()
      AND om.role IN ('clinician', 'owner')
    )
  );

-- Clinicians can create wellness scores for patients in their organization
DROP POLICY IF EXISTS "Clinicians can create wellness_scores for their org patients" ON wellness_scores;
CREATE POLICY "Clinicians can create wellness_scores for their org patients"
  ON wellness_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM patients p
      INNER JOIN org_memberships om ON om.org_id = p.org_id
      WHERE p.id = wellness_scores.patient_id
      AND om.user_id = auth.uid()
      AND om.role IN ('clinician', 'owner')
    )
  );

-- Clinicians can update wellness scores they created
DROP POLICY IF EXISTS "Clinicians can update their wellness_scores" ON wellness_scores;
CREATE POLICY "Clinicians can update their wellness_scores"
  ON wellness_scores
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Patients can view their own wellness scores
DROP POLICY IF EXISTS "Patients can view their own wellness_scores" ON wellness_scores;
CREATE POLICY "Patients can view their own wellness_scores"
  ON wellness_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = wellness_scores.patient_id
      AND p.owner_user = auth.uid()
    )
  );

-- Add comment to table for documentation
COMMENT ON TABLE wellness_scores IS 'Stores comprehensive wellness assessment scores derived from EEG analysis using proprietary wellness algorithm. Includes 8 core parameters: Cognition, Stress, Focus/Attention, Stimulus Control, Burnout/Fatigue, Emotional Regulation, Learning, and Creativity.';

COMMENT ON COLUMN wellness_scores.cognition_score IS 'Cognitive function score (0-100) based on Theta/Beta ratio, Alpha peak, and Alpha:Theta balance';
COMMENT ON COLUMN wellness_scores.stress_score IS 'Stress level score (0-100) based on arousal, relaxation, and regeneration metrics';
COMMENT ON COLUMN wellness_scores.focus_attention_score IS 'Focus and attention score (0-100) based on Theta band analysis';
COMMENT ON COLUMN wellness_scores.focus_stimulus_control_score IS 'Stimulus control score (0-100) based on Theta/Beta ratio at frontal regions';
COMMENT ON COLUMN wellness_scores.burnout_fatigue_score IS 'Burnout and fatigue score (0-100) based on arousal, relaxation, and excessive Delta';
COMMENT ON COLUMN wellness_scores.emotional_regulation_score IS 'Emotional regulation score (0-100) based on frontal Alpha asymmetry';
COMMENT ON COLUMN wellness_scores.learning_score IS 'Learning capacity score (0-100) for patients under 18 years old, NULL for adults';
COMMENT ON COLUMN wellness_scores.creativity_score IS 'Creativity score (0-100) based on relaxation and Alpha band activity';
COMMENT ON COLUMN wellness_scores.overall_score IS 'Weighted overall wellness score (0-100) combining all applicable parameters';
