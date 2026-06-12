-- =====================================================
-- Create Uploaded Files Table for EEG File Tracking
-- =====================================================
-- This table tracks uploaded EEG files during processing
-- Created: 2025-11-05

-- Drop table if exists
DROP TABLE IF EXISTS public.uploaded_files CASCADE;

-- Create uploaded_files table
CREATE TABLE public.uploaded_files (
    id TEXT PRIMARY KEY,
    workflow_id TEXT REFERENCES public.workflows(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

    -- File information
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'EDF',

    -- Storage information
    storage_path TEXT NOT NULL,
    storage_url TEXT,
    storage_bucket TEXT DEFAULT 'reports',

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'uploaded',
    -- Status values: uploaded, processing, processed, failed

    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_uploaded_files_clinic_id ON public.uploaded_files(clinic_id);
CREATE INDEX idx_uploaded_files_patient_id ON public.uploaded_files(patient_id);
CREATE INDEX idx_uploaded_files_workflow_id ON public.uploaded_files(workflow_id);
CREATE INDEX idx_uploaded_files_status ON public.uploaded_files(status);
CREATE INDEX idx_uploaded_files_uploaded_at ON public.uploaded_files(uploaded_at DESC);

-- Enable RLS
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Clinics can only see their own uploaded files
DROP POLICY IF EXISTS "Clinics can view own uploaded files" ON uploaded_files;
CREATE POLICY "Clinics can view own uploaded files"
    ON public.uploaded_files
    FOR SELECT
    USING (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Clinics can insert their own uploaded files
DROP POLICY IF EXISTS "Clinics can insert own uploaded files" ON uploaded_files;
CREATE POLICY "Clinics can insert own uploaded files"
    ON public.uploaded_files
    FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Clinics can update their own uploaded files
DROP POLICY IF EXISTS "Clinics can update own uploaded files" ON uploaded_files;
CREATE POLICY "Clinics can update own uploaded files"
    ON public.uploaded_files
    FOR UPDATE
    USING (
        clinic_id IN (
            SELECT id FROM public.clinics
            WHERE id = auth.uid() OR id::text = current_setting('app.clinic_id', true)
        )
    );

-- Super admins can see all uploaded files
DROP POLICY IF EXISTS "Super admins can view all uploaded files" ON uploaded_files;
CREATE POLICY "Super admins can view all uploaded files"
    ON public.uploaded_files
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_uploaded_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_uploaded_files_updated_at
    BEFORE UPDATE ON public.uploaded_files
    FOR EACH ROW
    EXECUTE FUNCTION update_uploaded_files_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.uploaded_files TO authenticated;
GRANT SELECT ON public.uploaded_files TO anon;

-- Add comments
COMMENT ON TABLE public.uploaded_files IS 'Tracks uploaded EEG files during processing';
COMMENT ON COLUMN public.uploaded_files.id IS 'Unique file identifier';
COMMENT ON COLUMN public.uploaded_files.workflow_id IS 'Associated workflow identifier';
COMMENT ON COLUMN public.uploaded_files.clinic_id IS 'Clinic that uploaded the file';
COMMENT ON COLUMN public.uploaded_files.patient_id IS 'Patient for whom the file was uploaded';
COMMENT ON COLUMN public.uploaded_files.file_name IS 'Original file name';
COMMENT ON COLUMN public.uploaded_files.file_size IS 'File size in bytes';
COMMENT ON COLUMN public.uploaded_files.file_type IS 'File type (EDF, EEG, BDF)';
COMMENT ON COLUMN public.uploaded_files.storage_path IS 'Path in storage bucket';
COMMENT ON COLUMN public.uploaded_files.storage_url IS 'Public/signed URL to access file';
COMMENT ON COLUMN public.uploaded_files.status IS 'Processing status: uploaded, processing, processed, failed';
