-- Create patient_payments table for tracking patient purchases per clinic
CREATE TABLE IF NOT EXISTS patient_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID,
  patient_id UUID,
  patient_email VARCHAR(255) NOT NULL,
  patient_name VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'completed',
  type VARCHAR(50) NOT NULL,
  item_name VARCHAR(255),
  assessment_id VARCHAR(100),
  assessment_link TEXT,
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  source VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_payments_clinic ON patient_payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_payments_email ON patient_payments(patient_email);
CREATE INDEX IF NOT EXISTS idx_patient_payments_patient_id ON patient_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_payments_date ON patient_payments(created_at DESC);

-- RLS
ALTER TABLE patient_payments ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Allow all for authenticated" ON patient_payments;
CREATE POLICY "Allow all for authenticated" ON patient_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow insert for anon" ON patient_payments;
CREATE POLICY "Allow insert for anon" ON patient_payments
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for anon" ON patient_payments;
CREATE POLICY "Allow select for anon" ON patient_payments
  FOR SELECT TO anon USING (true);
