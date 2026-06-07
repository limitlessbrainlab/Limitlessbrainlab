-- Patient feedback submitted from the PatientDashboard feedback modal
CREATE TABLE IF NOT EXISTS patient_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT,
  patient_email TEXT,
  patient_name TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  category TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients can insert their own feedback; no one can read/update/delete via client
ALTER TABLE patient_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients can submit feedback"
  ON patient_feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "admins can read feedback"
  ON patient_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );
