-- Create coach_bookings table to store Calendly bookings
CREATE TABLE IF NOT EXISTS coach_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Patient info
  patient_email VARCHAR(255) NOT NULL,
  patient_name VARCHAR(255),
  patient_phone VARCHAR(50),

  -- Coach info
  coach_id UUID REFERENCES coaches(id) ON DELETE SET NULL,
  coach_name VARCHAR(255),
  coach_email VARCHAR(255),

  -- Booking details
  event_type VARCHAR(255), -- e.g., "30 Minute Meeting"
  event_name VARCHAR(255),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  timezone VARCHAR(100),

  -- Calendly specific
  calendly_event_id VARCHAR(255) UNIQUE,
  calendly_invitee_id VARCHAR(255),
  calendly_event_url TEXT,
  calendly_cancel_url TEXT,
  calendly_reschedule_url TEXT,

  -- Meeting details
  meeting_url TEXT, -- Zoom/Google Meet link
  location VARCHAR(255) DEFAULT 'Online',

  -- Status
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled, no_show
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,

  -- Indexes
  CONSTRAINT valid_status CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled'))
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_coach_bookings_patient_email ON coach_bookings(patient_email);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_coach_id ON coach_bookings(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_start_time ON coach_bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_status ON coach_bookings(status);
CREATE INDEX IF NOT EXISTS idx_coach_bookings_calendly_event ON coach_bookings(calendly_event_id);

-- Enable RLS
ALTER TABLE coach_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Patients can view their own bookings
DROP POLICY IF EXISTS "Patients can view own bookings" ON coach_bookings;
CREATE POLICY "Patients can view own bookings" ON coach_bookings
  FOR SELECT USING (
    patient_email = (SELECT email FROM patients WHERE email = current_setting('request.jwt.claims')::json->>'email')
  );

-- Coaches can view bookings assigned to them
DROP POLICY IF EXISTS "Coaches can view assigned bookings" ON coach_bookings;
CREATE POLICY "Coaches can view assigned bookings" ON coach_bookings
  FOR SELECT USING (
    coach_email = current_setting('request.jwt.claims')::json->>'email'
  );

-- Service role can do everything (for webhooks)
DROP POLICY IF EXISTS "Service role full access" ON coach_bookings;
CREATE POLICY "Service role full access" ON coach_bookings
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anonymous inserts for webhook
DROP POLICY IF EXISTS "Allow webhook inserts" ON coach_bookings;
CREATE POLICY "Allow webhook inserts" ON coach_bookings
  FOR INSERT WITH CHECK (true);

-- Allow anonymous updates for webhook
DROP POLICY IF EXISTS "Allow webhook updates" ON coach_bookings;
CREATE POLICY "Allow webhook updates" ON coach_bookings
  FOR UPDATE USING (true) WITH CHECK (true);

COMMENT ON TABLE coach_bookings IS 'Stores coaching session bookings from Calendly';
