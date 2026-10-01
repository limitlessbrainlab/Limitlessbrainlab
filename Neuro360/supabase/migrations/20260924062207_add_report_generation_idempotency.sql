-- One durable result per saved algorithm result and report type.
CREATE TABLE IF NOT EXISTS public.report_generation_jobs (
  idempotency_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
  report_url text,
  report_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.report_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS report_generation_jobs_processing_idx
  ON public.report_generation_jobs (created_at)
  WHERE status = 'processing';
