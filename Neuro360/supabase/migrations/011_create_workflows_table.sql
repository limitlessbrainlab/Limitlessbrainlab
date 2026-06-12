-- =====================================================
-- Create Workflows Table for EEG Processing Tracking
-- =====================================================
-- This table tracks the status of EEG file processing workflows
-- Created: 2025-11-05

-- Drop table if exists
DROP TABLE IF EXISTS public.workflows CASCADE;

-- Create workflows table
CREATE TABLE public.workflows (
    id TEXT PRIMARY KEY,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    -- Status values: pending, processing, completed, failed

    -- Workflow steps tracking
    steps JSONB DEFAULT '{
        "fileUpload": {"status": "pending", "startedAt": null, "completedAt": null, "error": null},
        "qeegProcessing": {"status": "pending", "startedAt": null, "completedAt": null, "error": null},
        "neuroSenseAnalysis": {"status": "pending", "startedAt": null, "completedAt": null, "error": null},
        "carePlanGeneration": {"status": "pending", "startedAt": null, "completedAt": null, "error": null},
        "reportFinalization": {"status": "pending", "startedAt": null, "completedAt": null, "error": null}
    }'::jsonb,

    -- Result data
    result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,

    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_workflows_clinic_id ON public.workflows(clinic_id);
CREATE INDEX idx_workflows_patient_id ON public.workflows(patient_id);
CREATE INDEX idx_workflows_status ON public.workflows(status);
CREATE INDEX idx_workflows_created_at ON public.workflows(created_at DESC);

-- Enable RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Clinics can only see their own workflows
DROP POLICY IF EXISTS "Clinics can view own workflows" ON workflows;
CREATE POLICY "Clinics can view own workflows"
    ON public.workflows
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Clinics can insert their own workflows
DROP POLICY IF EXISTS "Clinics can insert own workflows" ON workflows;
CREATE POLICY "Clinics can insert own workflows"
    ON public.workflows
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Clinics can update their own workflows
DROP POLICY IF EXISTS "Clinics can update own workflows" ON workflows;
CREATE POLICY "Clinics can update own workflows"
    ON public.workflows
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Super admins can see all workflows
DROP POLICY IF EXISTS "Super admins can view all workflows" ON workflows;
CREATE POLICY "Super admins can view all workflows"
    ON public.workflows
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_workflows_updated_at
    BEFORE UPDATE ON public.workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_workflows_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.workflows TO authenticated;
GRANT SELECT ON public.workflows TO anon;

-- Add comments
COMMENT ON TABLE public.workflows IS 'Tracks EEG file processing workflows';
COMMENT ON COLUMN public.workflows.id IS 'Unique workflow identifier';
COMMENT ON COLUMN public.workflows.clinic_id IS 'Clinic that initiated the workflow';
COMMENT ON COLUMN public.workflows.patient_id IS 'Patient for whom the EEG is being processed';
COMMENT ON COLUMN public.workflows.file_name IS 'Original EEG file name';
COMMENT ON COLUMN public.workflows.status IS 'Overall workflow status: pending, processing, completed, failed';
COMMENT ON COLUMN public.workflows.steps IS 'JSON object tracking each workflow step status';
COMMENT ON COLUMN public.workflows.result IS 'JSON object containing workflow results and generated reports';
COMMENT ON COLUMN public.workflows.error_message IS 'Error message if workflow failed';
