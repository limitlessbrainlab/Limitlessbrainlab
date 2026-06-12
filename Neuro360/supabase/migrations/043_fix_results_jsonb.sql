-- Fix algorithm_results.results column — stored as JSON string, needs to be JSONB object
UPDATE public.algorithm_results
SET results = results::text::jsonb
WHERE jsonb_typeof(results) = 'string';

-- Also fix pdf_url — replace old Supabase URL with new staging URL
UPDATE public.algorithm_results
SET pdf_url = REPLACE(pdf_url,
  'wqykofpjpaytjuqsessf.supabase.co',
  'puzdgwtprcpaaxxwkwtk.supabase.co')
WHERE pdf_url LIKE '%wqykofpjpaytjuqsessf%';

-- Fix algorithm_results other JSONB columns if stored as strings
UPDATE public.algorithm_results
SET input_data = input_data::text::jsonb
WHERE input_data IS NOT NULL AND jsonb_typeof(input_data) = 'string';

UPDATE public.algorithm_results
SET output_data = output_data::text::jsonb
WHERE output_data IS NOT NULL AND jsonb_typeof(output_data) = 'string';
