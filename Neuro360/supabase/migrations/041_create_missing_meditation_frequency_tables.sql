-- Migration: Create missing meditation and frequency tables
-- Fixes 404 errors for meditation_favorites, meditation_purchases, meditation_sessions, frequency_purchases

CREATE TABLE IF NOT EXISTS meditation_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email TEXT NOT NULL,
  meditation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_email, meditation_id)
);

CREATE TABLE IF NOT EXISTS meditation_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email TEXT NOT NULL,
  meditation_id TEXT NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_email, meditation_id)
);

CREATE TABLE IF NOT EXISTS meditation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email TEXT NOT NULL,
  meditation_id TEXT NOT NULL,
  duration_seconds INTEGER,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frequency_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email TEXT NOT NULL,
  frequency_id TEXT,
  pack_id TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and allow all authenticated access
ALTER TABLE meditation_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE meditation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequency_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow all for meditation_favorites" ON meditation_favorites FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for meditation_purchases" ON meditation_purchases FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for meditation_sessions" ON meditation_sessions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow all for frequency_purchases" ON frequency_purchases FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_meditation_favorites_email ON meditation_favorites(patient_email);
CREATE INDEX IF NOT EXISTS idx_meditation_purchases_email ON meditation_purchases(patient_email);
CREATE INDEX IF NOT EXISTS idx_meditation_sessions_email ON meditation_sessions(patient_email);
CREATE INDEX IF NOT EXISTS idx_frequency_purchases_email ON frequency_purchases(patient_email);
