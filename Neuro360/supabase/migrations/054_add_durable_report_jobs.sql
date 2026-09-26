ALTER TABLE public.algorithm_results
  ADD COLUMN IF NOT EXISTS canonical_results JSONB,
  ADD COLUMN IF NOT EXISTS qeeg_data JSONB;

CREATE TABLE IF NOT EXISTS public.report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL CHECK (report_type IN ('neurosense', 'performance')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  stage TEXT NOT NULL DEFAULT 'pending',
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  patient_id UUID,
  clinic_id UUID,
  algorithm_result_id UUID REFERENCES public.algorithm_results(id) ON DELETE SET NULL,
  requested_by UUID,
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical_results JSONB,
  qeeg_data JSONB,
  output_url TEXT,
  error_message TEXT,
  workflow_run_id TEXT,
  attempts SMALLINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_jobs_status_created_idx
  ON public.report_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS report_jobs_patient_idx
  ON public.report_jobs(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_jobs_clinic_idx
  ON public.report_jobs(clinic_id, created_at DESC);

ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;

-- Report jobs are coordinated only by trusted server-side service-role clients.
REVOKE ALL ON public.report_jobs FROM anon, authenticated;

