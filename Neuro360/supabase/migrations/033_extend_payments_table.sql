-- Create payments table for all payment tracking (clinics + patients)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID,
  patient_email VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  type VARCHAR(50) DEFAULT 'subscription',
  package_name VARCHAR(255),
  reports_allowed INTEGER DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'stripe',
  payment_id VARCHAR(255),
  stripe_payment_id VARCHAR(255),
  stripe_session_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for payments table (SuperAdmin needs full access)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
DROP POLICY IF EXISTS "Allow all for authenticated users" ON payments;
CREATE POLICY "Allow all for authenticated users" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon insert for webhook (server-side)
DROP POLICY IF EXISTS "Allow insert for anon" ON payments;
CREATE POLICY "Allow insert for anon" ON payments
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anon select for webhook verification
DROP POLICY IF EXISTS "Allow select for anon" ON payments;
CREATE POLICY "Allow select for anon" ON payments
  FOR SELECT TO anon USING (true);
