-- Create wallet tables for patient wallet feature
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_id UUID,
  type VARCHAR(50),
  amount NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  description TEXT,
  reference_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_id UUID,
  amount NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  description TEXT,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_id UUID,
  stripe_subscription_id VARCHAR(255),
  plan_name VARCHAR(255),
  status VARCHAR(50),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_id UUID,
  stripe_payment_method_id VARCHAR(255),
  type VARCHAR(50),
  last4 VARCHAR(4),
  brand VARCHAR(50),
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_id UUID,
  stripe_invoice_id VARCHAR(255),
  amount NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50),
  invoice_url TEXT,
  pdf_url TEXT,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Static pages for CMS
CREATE TABLE IF NOT EXISTS static_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255),
  content TEXT,
  meta_title VARCHAR(255),
  meta_description TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID,
  patient_email VARCHAR(255),
  patient_name VARCHAR(255),
  clinic_id UUID,
  clinic_name VARCHAR(255),
  coach_id UUID,
  coach_name VARCHAR(255),
  appointment_type VARCHAR(100),
  appointment_date DATE,
  appointment_time TIME,
  duration_minutes INTEGER DEFAULT 60,
  status VARCHAR(50) DEFAULT 'scheduled',
  notes TEXT,
  meeting_link TEXT,
  stripe_session_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANS user settings
CREATE TABLE IF NOT EXISTS ans_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255) UNIQUE,
  patient_id UUID,
  notifications_enabled BOOLEAN DEFAULT true,
  reminder_frequency VARCHAR(50) DEFAULT 'daily',
  preferred_session_time VARCHAR(50),
  goals JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANS sessions
CREATE TABLE IF NOT EXISTS ans_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  session_type VARCHAR(100),
  duration_minutes INTEGER,
  heart_rate_avg NUMERIC(6,2),
  hrv_score NUMERIC(6,2),
  stress_level INTEGER,
  session_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Neurofeedback bookings
CREATE TABLE IF NOT EXISTS neurofeedback_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  patient_name VARCHAR(255),
  preferred_date DATE,
  preferred_time VARCHAR(50),
  session_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movers activities (movement tracking)
CREATE TABLE IF NOT EXISTS movers_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_email VARCHAR(255),
  activity_type VARCHAR(100),
  duration_minutes INTEGER,
  intensity VARCHAR(50),
  calories_burned NUMERIC(8,2),
  activity_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE static_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ans_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ans_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE neurofeedback_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE movers_activities ENABLE ROW LEVEL SECURITY;

-- Enable RLS on clinics (was missing)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

-- Permissive policies for all new tables
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY[
  'wallet_transactions','wallet_credits','wallet_subscriptions',
  'wallet_payment_methods','wallet_invoices','static_pages',
  'appointments','ans_user_settings','ans_sessions',
  'neurofeedback_bookings','movers_activities','clinics'
]) LOOP
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
  EXECUTE format('CREATE POLICY "Allow all" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
END LOOP; END $$;

-- Create neurosense-reports storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neurosense-reports', 'neurosense-reports', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policy for neurosense-reports bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'neurosense-reports access'
  ) THEN
    EXECUTE 'CREATE POLICY "neurosense-reports access" ON storage.objects FOR ALL USING (bucket_id = ''neurosense-reports'')';
  END IF;
END $$;
