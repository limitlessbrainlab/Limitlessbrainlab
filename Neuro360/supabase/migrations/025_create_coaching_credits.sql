-- Create coaches table (schema derived from source data)
CREATE TABLE IF NOT EXISTS coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  photo TEXT,
  credentials TEXT,
  specialties JSONB DEFAULT '[]',
  modalities JSONB DEFAULT '[]',
  rating NUMERIC(3,1) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  is_online BOOLEAN DEFAULT true,
  is_in_person BOOLEAN DEFAULT true,
  price NUMERIC(10,2),
  price_display VARCHAR(100),
  bio TEXT,
  languages JSONB DEFAULT '[]',
  experience TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  city VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  whatsapp VARCHAR(50),
  next_slots JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Allow all for coaches" ON coaches FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migration: Create coaching credits system
-- Description: Adds patient_coaching_credits table and extends coaches table with Calendly support

-- Patient coaching credits table
CREATE TABLE IF NOT EXISTS patient_coaching_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_email VARCHAR(255) NOT NULL,
    credits_available INTEGER DEFAULT 1,
    credits_used INTEGER DEFAULT 0,
    source VARCHAR(50) NOT NULL DEFAULT 'assessment_purchase',
    source_reference_id VARCHAR(255),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_coaching_credits_email ON patient_coaching_credits(patient_email);
CREATE INDEX IF NOT EXISTS idx_coaching_credits_available ON patient_coaching_credits(credits_available) WHERE credits_available > 0;
CREATE INDEX IF NOT EXISTS idx_coaching_credits_expires ON patient_coaching_credits(expires_at);

-- Extend coaches table with Calendly support
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS calendly_url VARCHAR(500);
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS booking_preference VARCHAR(50) DEFAULT 'whatsapp';

-- Create coach_connection_requests table (if not exists)
CREATE TABLE IF NOT EXISTS coach_connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add admin_notes to connection requests for tracking
ALTER TABLE coach_connection_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- RLS Policies for patient_coaching_credits
ALTER TABLE patient_coaching_credits ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own credits
DROP POLICY IF EXISTS "Users can view own coaching credits" ON patient_coaching_credits;
CREATE POLICY "Users can view own coaching credits"
    ON patient_coaching_credits
    FOR SELECT
    USING (auth.jwt() ->> 'email' = patient_email);

-- Allow service role to manage all credits
DROP POLICY IF EXISTS "Service role can manage all coaching credits" ON patient_coaching_credits;
CREATE POLICY "Service role can manage all coaching credits"
    ON patient_coaching_credits
    FOR ALL
    USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_coaching_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS coaching_credits_updated_at ON patient_coaching_credits;
CREATE TRIGGER coaching_credits_updated_at
    BEFORE UPDATE ON patient_coaching_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_coaching_credits_updated_at();

-- Comment on table
COMMENT ON TABLE patient_coaching_credits IS 'Tracks free coaching session credits granted to patients with assessment purchases';
COMMENT ON COLUMN patient_coaching_credits.source IS 'Source of credit: assessment_purchase, manual_grant, promotion';
COMMENT ON COLUMN patient_coaching_credits.source_reference_id IS 'Reference to source record (e.g., stripe session ID)';