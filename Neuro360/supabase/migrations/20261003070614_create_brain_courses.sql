CREATE TABLE IF NOT EXISTS public.brain_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Dr Sweta Adatia',
  category TEXT NOT NULL DEFAULT 'general',
  thumbnail_url TEXT,
  course_url TEXT NOT NULL CHECK (course_url ~* '^https://'),
  original_price NUMERIC(10, 2) CHECK (original_price IS NULL OR original_price >= 0),
  sale_price NUMERIC(10, 2) CHECK (sale_price IS NULL OR sale_price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brain_courses_price_consistency CHECK (
    (is_free AND sale_price IS NULL) OR (NOT is_free AND sale_price > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.brain_course_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.brain_courses(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  amount_paid NUMERIC(10, 2) CHECK (amount_paid IS NULL OR amount_paid >= 0),
  currency CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brain_course_purchases_patient_id_course_id_key UNIQUE (patient_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_brain_courses_visible_sort_order
  ON public.brain_courses (sort_order, created_at DESC) WHERE is_visible;
CREATE INDEX IF NOT EXISTS idx_brain_courses_category_visible
  ON public.brain_courses (category, sort_order) WHERE is_visible;
CREATE INDEX IF NOT EXISTS idx_brain_course_purchases_patient_id
  ON public.brain_course_purchases (patient_id, purchased_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS brain_course_purchases_stripe_session_id_key
  ON public.brain_course_purchases (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

ALTER TABLE public.brain_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_course_purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brain_courses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.brain_course_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.brain_courses TO anon, authenticated;
GRANT SELECT ON TABLE public.brain_course_purchases TO authenticated;

DROP POLICY IF EXISTS "Visible brain courses are public" ON public.brain_courses;
CREATE POLICY "Visible brain courses are public"
  ON public.brain_courses FOR SELECT
  TO anon, authenticated
  USING (is_visible);

DROP POLICY IF EXISTS "Patients read their own brain course purchases" ON public.brain_course_purchases;
CREATE POLICY "Patients read their own brain course purchases"
  ON public.brain_course_purchases FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = patient_id);

INSERT INTO public.brain_courses (
  slug, title, author, category, thumbnail_url, course_url,
  original_price, sale_price, currency, sort_order
) VALUES
  ('neuro-manifestation', 'Neuro Manifestation - Get Your Dream Life Designed', 'Dr Sweta Adatia', 'manifestation', '/brain-course/Neuro Color.jpg', 'https://www.limitlessbrainacademy.com', 7999, 4099, 'INR', 1),
  ('neuro-gut-axis', 'NEURO GUT AXIS FOR A SHARP BRAIN AND LONG LIFE', 'Dr Sweta Adatia', 'health', NULL, 'https://www.limitlessbrainacademy.com', 4099, 2999, 'INR', 2),
  ('neuro-memory', 'Neuro Memory - Masterclass', 'Dr Sweta Adatia', 'memory', '/brain-course/Neuro Memory.jpg', 'https://www.limitlessbrainacademy.com', 5999, 2999, 'INR', 3),
  ('swara-yoga', 'Swara Yoga For Daily Life', 'Dr Sweta Adatia', 'yoga', '/brain-course/Swara Yoga For Daily Life.jpg', 'https://www.limitlessbrainacademy.com', 5999, 2999, 'INR', 4),
  ('neuro-meditation', 'Neuro Meditation - Brain Rewiring Through Meditation', 'Dr Sweta Adatia', 'meditation', '/brain-course/Neuro Meditation - Brain Rewiring Through Meditation.jpg', 'https://www.limitlessbrainacademy.com', 7999, 4999, 'INR', 5),
  ('neuro-gratitude', 'Neuro Gratitude - Power Manifestation Tool With Healer Codes', 'Limitless Brain Mastery', 'manifestation', '/brain-course/Neuro Gratitude - Power Manifestation Tool With Healer.jpg', 'https://www.limitlessbrainacademy.com', 5999, 3999, 'INR', 6),
  ('neuro-sales', 'Neuro Sales - The Art & Science of Selling', 'Limitless Brain Mastery', 'sales', NULL, 'https://www.limitlessbrainacademy.com', 15999, 8999, 'INR', 7),
  ('neuro-parenting-hindi', 'Neuro Parenting In Hindi', 'Dr Sweta Adatia', 'parenting', '/brain-course/Neuro Parenting In Hindi.jpg', 'https://www.limitlessbrainacademy.com', 4999, 2999, 'INR', 8),
  ('solfeggio-frequencies', 'Bundled 5 Solfeggio Music Frequencies', 'Dr Sweta Adatia', 'frequencies', NULL, 'https://www.limitlessbrainacademy.com', 9999, 6999, 'INR', 9),
  ('meditation-frequencies', 'Bundled 5 Meditation Music Frequencies', 'Dr Sweta Adatia', 'frequencies', NULL, 'https://www.limitlessbrainacademy.com', 9999, 6999, 'INR', 10),
  ('binaural-beats', 'Bundled 5 Binaural Beats', 'Dr Sweta Adatia', 'frequencies', NULL, 'https://www.limitlessbrainacademy.com', 9999, 6999, 'INR', 11),
  ('neuro-breathing', 'Neuro Breathing - The Principles of Yogic Breathing', 'Limitless Brain Mastery', 'breathing', '/brain-course/Neuro Breathing - The Principles of Yogic Breathing.jpg', 'https://www.limitlessbrainacademy.com', 5999, 2999, 'INR', 12)
ON CONFLICT (slug) DO NOTHING;
