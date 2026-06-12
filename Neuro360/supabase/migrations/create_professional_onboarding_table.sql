-- Create professional_onboarding table for NeuroSense Professional Interest & Onboarding Form
CREATE TABLE IF NOT EXISTS professional_onboarding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  city_country TEXT NOT NULL,
  organization TEXT,
  certifications TEXT,
  professional_category TEXT[] DEFAULT '{}',
  years_experience TEXT,
  client_segments TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_professional_onboarding_email ON professional_onboarding(email);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_professional_onboarding_created_at ON professional_onboarding(created_at DESC);

-- Enable Row Level Security
ALTER TABLE professional_onboarding ENABLE ROW LEVEL SECURITY;

-- Create policy to allow inserts from anonymous users (for public form submissions)
DROP POLICY IF EXISTS "Allow anonymous inserts" ON professional_onboarding;
CREATE POLICY "Allow anonymous inserts" ON professional_onboarding
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow authenticated users to view all records (for admin access)
DROP POLICY IF EXISTS "Allow authenticated users to view" ON professional_onboarding;
CREATE POLICY "Allow authenticated users to view" ON professional_onboarding
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add comment to table
COMMENT ON TABLE professional_onboarding IS 'Stores professional onboarding form submissions from About Us page';
