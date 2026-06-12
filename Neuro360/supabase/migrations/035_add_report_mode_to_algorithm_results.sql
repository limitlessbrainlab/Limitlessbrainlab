-- Add report_mode column to algorithm_results and gate clinic/doctor (and patient) reads
-- so that only 'neurosense' rows are visible to clinics, doctors, and patients.
-- 'claude' rows remain visible ONLY to super_admin.
--
-- Shared contract:
--   report_mode TEXT NOT NULL DEFAULT 'neurosense'  -- values: 'neurosense' | 'claude'
--   'claude' rows are HIDDEN from patient and clinic (clinic_admin, doctor) reads.
--   super_admin keeps full access.

-- 1) Column
ALTER TABLE public.algorithm_results
    ADD COLUMN IF NOT EXISTS report_mode TEXT NOT NULL DEFAULT 'neurosense';

-- 2) Recreate the SELECT/ALL policies from migration 022, adding the report_mode gate
--    to the clinic_admin and doctor SELECT policies. super_admin policy is recreated
--    identically (full access, no report_mode gate) for deterministic ordering.

-- Drop existing policies (same set as migration 022)
DROP POLICY IF EXISTS "Super admins have full access to algorithm_results" ON public.algorithm_results;
DROP POLICY IF EXISTS "Clinic admins can view their clinic algorithm_results" ON public.algorithm_results;
DROP POLICY IF EXISTS "Doctors can view their clinic algorithm_results" ON public.algorithm_results;

-- Super admins: FULL access, unchanged (recreated identically to migration 022)
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

-- Clinic admins: only 'neurosense' rows for their clinic
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
        AND algorithm_results.report_mode = 'neurosense'
    );

-- Doctors: only 'neurosense' rows for their clinic
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
        AND algorithm_results.report_mode = 'neurosense'
    );

-- NOTE: No PATIENT-specific RLS SELECT policy exists on public.algorithm_results
-- (migrations 021 and 022 define only super_admin, clinic_admin, and doctor policies).
-- Patient visibility is enforced via the frontend anon-key query filter, which must
-- also include report_mode = 'neurosense' to keep 'claude' rows hidden from patients.
