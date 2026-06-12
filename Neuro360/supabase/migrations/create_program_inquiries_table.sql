-- Create program_inquiries table for 100X Brain Optimization Program Form
CREATE TABLE IF NOT EXISTS program_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT,
  profession TEXT,
  industry TEXT,
  brain_fitness_score TEXT,
  has_done_brain_scan TEXT,
  program_type TEXT DEFAULT '100X Brain Optimization',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_program_inquiries_email ON program_inquiries(email);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_program_inquiries_created_at ON program_inquiries(created_at DESC);

-- Enable Row Level Security
ALTER TABLE program_inquiries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow inserts from anonymous users (for public form submissions)
DROP POLICY IF EXISTS "Allow anonymous inserts" ON program_inquiries;
CREATE POLICY "Allow anonymous inserts" ON program_inquiries
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow authenticated users to view all records (for admin access)
DROP POLICY IF EXISTS "Allow authenticated users to view" ON program_inquiries;
CREATE POLICY "Allow authenticated users to view" ON program_inquiries
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add comment to table
COMMENT ON TABLE program_inquiries IS 'Stores 100X Brain Optimization Program form submissions';
