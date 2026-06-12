-- Create demo_report_requests table
CREATE TABLE IF NOT EXISTS demo_report_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE demo_report_requests ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form)
DROP POLICY IF EXISTS "Allow anonymous insert on demo_report_requests" ON demo_report_requests;
CREATE POLICY "Allow anonymous insert on demo_report_requests"
  ON demo_report_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to read (for admin)
DROP POLICY IF EXISTS "Allow authenticated read on demo_report_requests" ON demo_report_requests;
CREATE POLICY "Allow authenticated read on demo_report_requests"
  ON demo_report_requests
  FOR SELECT
  TO authenticated
  USING (true);
