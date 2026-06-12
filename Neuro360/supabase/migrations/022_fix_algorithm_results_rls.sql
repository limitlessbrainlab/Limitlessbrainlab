-- Create algorithm_results table (if not exists from earlier migration)
CREATE TABLE IF NOT EXISTS public.algorithm_results (
    id TEXT PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    clinic_name TEXT NOT NULL,
    results JSONB NOT NULL,
    eyes_open_file TEXT,
    eyes_closed_file TEXT,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_algorithm_results_patient_id ON public.algorithm_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_results_clinic_id ON public.algorithm_results(clinic_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_results_processed_at ON public.algorithm_results(processed_at DESC);
ALTER TABLE public.algorithm_results ENABLE ROW LEVEL SECURITY;

-- Fix RLS policies for algorithm_results table to allow INSERT operations
-- This adds the WITH CHECK clause needed for INSERT operations

-- Drop existing policies
DROP POLICY IF EXISTS "Super admins have full access to algorithm_results" ON public.algorithm_results;
DROP POLICY IF EXISTS "Clinic admins can view their clinic algorithm_results" ON public.algorithm_results;
DROP POLICY IF EXISTS "Doctors can view their clinic algorithm_results" ON public.algorithm_results;

-- Recreate policies with proper WITH CHECK clause for INSERT operations
DROP POLICY IF EXISTS "Super admins have full access to algorithm_results" ON algorithm_results;
CREATE POLICY "Super admins have full access to algorithm_results"
    ON public.algorithm_results
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "Clinic admins can view their clinic algorithm_results" ON algorithm_results;
CREATE POLICY "Clinic admins can view their clinic algorithm_results"
    ON public.algorithm_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
            AND algorithm_results.clinic_id IS NOT NULL
        )
    );

DROP POLICY IF EXISTS "Doctors can view their clinic algorithm_results" ON algorithm_results;
CREATE POLICY "Doctors can view their clinic algorithm_results"
    ON public.algorithm_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'clinician'
            AND algorithm_results.clinic_id IS NOT NULL
        )
    );

-- ALTERNATIVE: Temporarily disable RLS for testing
-- Uncomment the line below if you want to disable RLS for testing purposes
-- ALTER TABLE public.algorithm_results DISABLE ROW LEVEL SECURITY;

-- After disabling RLS, you can re-enable it later with:
-- ALTER TABLE public.algorithm_results ENABLE ROW LEVEL SECURITY;
