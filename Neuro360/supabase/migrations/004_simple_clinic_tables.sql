-- Simple clinic-based schema — incremental migration version

-- Add clinic_id to existing tables that need it
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

-- Create reports table (new)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  file_path TEXT,
  report_data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payments table (new)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL,
  stripe_payment_id VARCHAR(255),
  payment_method VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create usage table (new)
CREATE TABLE IF NOT EXISTS usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Create alerts table (new)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) DEFAULT 'info',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reports_clinic_id ON reports(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reports_patient_id ON reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_clinic_id ON subscriptions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_clinic_id ON payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_usage_clinic_id ON usage(clinic_id);
CREATE INDEX IF NOT EXISTS idx_alerts_clinic_id ON alerts(clinic_id);

-- Updated_at trigger (function already exists from 001)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers (use DO block to skip if already exists)
DO $$ BEGIN
  CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable RLS on new tables
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies (use DO blocks to skip if already exist)
DO $$ BEGIN DROP POLICY IF EXISTS "Allow all operations on reports" ON reports;
CREATE POLICY "Allow all operations on reports" ON reports FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Allow all operations on payments" ON payments;
CREATE POLICY "Allow all operations on payments" ON payments FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Allow all operations on usage" ON usage;
CREATE POLICY "Allow all operations on usage" ON usage FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Allow all operations on alerts" ON alerts;
CREATE POLICY "Allow all operations on alerts" ON alerts FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
