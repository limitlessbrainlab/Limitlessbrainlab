-- Create pricing_config table for dynamic credit package pricing
CREATE TABLE IF NOT EXISTS pricing_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_type TEXT NOT NULL CHECK (clinic_type IN ('lbl_partner', 'lbl_clinic')),
  package_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  reports INTEGER NOT NULL,
  price_inr NUMERIC(10,2) NOT NULL,
  price_usd NUMERIC(10,2) NOT NULL,
  popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing packages
INSERT INTO pricing_config (clinic_type, package_id, label, reports, price_inr, price_usd, popular, is_active, sort_order) VALUES
  ('lbl_partner', 'partner-5', '5 Reports', 5, 7500.00, 90.00, false, true, 1),
  ('lbl_partner', 'partner-25', '25 Reports', 25, 30000.00, 360.00, true, true, 2),
  ('lbl_partner', 'partner-50', '50 Reports', 50, 50000.00, 600.00, false, true, 3),
  ('lbl_clinic', 'clinic-5', '5 Reports', 5, 3000.00, 36.00, false, true, 1),
  ('lbl_clinic', 'clinic-10', '10 Reports', 10, 2500.00, 30.00, true, true, 2)
ON CONFLICT (package_id) DO NOTHING;

-- Enable RLS
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read pricing
DROP POLICY IF EXISTS "Anyone can read pricing" ON pricing_config;
CREATE POLICY "Anyone can read pricing" ON pricing_config
  FOR SELECT USING (true);

-- Only super_admin can modify pricing (via service role key from server)
DROP POLICY IF EXISTS "Service role can manage pricing" ON pricing_config;
CREATE POLICY "Service role can manage pricing" ON pricing_config
  FOR ALL USING (true) WITH CHECK (true);
