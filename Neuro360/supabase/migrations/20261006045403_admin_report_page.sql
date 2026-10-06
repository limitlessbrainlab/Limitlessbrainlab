-- Read-only feed for the Super Admin reports list.  It pages by patient so an
-- expanded row still contains that patient's reports without downloading every
-- report in the system.
CREATE INDEX IF NOT EXISTS idx_reports_created_at_desc ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_clinic_created_at_desc ON public.reports (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_documentation_created_at_desc ON public.clinical_documentation (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_documentation_clinic_created_at_desc ON public.clinical_documentation (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_algorithm_results_completed_created_at_desc
  ON public.algorithm_results (created_at DESC)
  WHERE status = 'completed' AND pdf_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_algorithm_results_clinic_completed_created_at_desc
  ON public.algorithm_results (clinic_id, created_at DESC)
  WHERE status = 'completed' AND pdf_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_report_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 15,
  p_clinic_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_ascending boolean DEFAULT false
)
RETURNS TABLE (reports jsonb, total_patients bigint, total_reports bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH report_items AS (
    SELECT
      r.patient_id,
      r.clinic_id,
      r.created_at,
      jsonb_build_object(
        'id', r.id,
        'clinicId', r.clinic_id,
        'patientId', r.patient_id,
        'patientName', COALESCE(p.full_name, p.name, 'Unknown Patient'),
        'patientUid', p.external_id,
        'clinicName', COALESCE(c.name, 'Unknown Clinic'),
        'fileName', r.file_name,
        'filePath', r.file_path,
        'storagePath', r.file_path,
        'reportData', COALESCE(r.report_data, '{}'::jsonb),
        'storedInCloud', true,
        'uploadedAt', r.created_at,
        'createdAt', r.created_at,
        'updatedAt', r.updated_at,
        'title', COALESCE(r.report_data ->> 'title', r.file_name)
      ) AS report
    FROM public.reports r
    LEFT JOIN public.patients p ON p.id = r.patient_id
    LEFT JOIN public.clinics c ON c.id = r.clinic_id
    WHERE (p_clinic_id IS NULL OR r.clinic_id = p_clinic_id)
      AND (p_patient_id IS NULL OR r.patient_id = p_patient_id)

    UNION ALL

    SELECT
      cd.patient_id,
      cd.clinic_id,
      cd.created_at,
      jsonb_build_object(
        'id', cd.id::text || '_' || document.key,
        'clinicId', cd.clinic_id,
        'patientId', cd.patient_id,
        'patientName', COALESCE(p.full_name, p.name, cd.patient_name, 'Unknown Patient'),
        'patientUid', p.external_id,
        'clinicName', COALESCE(c.name, 'Unknown Clinic'),
        'fileName', COALESCE(document.value ->> 'originalName', document.value ->> 'fileName', 'Document'),
        'filePath', COALESCE(document.value ->> 'path', ''),
        'fileUrl', COALESCE(document.value ->> 'url', ''),
        'storagePath', COALESCE(document.value ->> 'path', ''),
        'storedInCloud', true,
        'reportData', jsonb_build_object(
          'title', COALESCE(document.value ->> 'documentTitle', document.value ->> 'documentType', 'Clinic Upload'),
          'reportType', COALESCE(document.value ->> 'documentType', 'Other'),
          'description', COALESCE(document.value ->> 'notes', ''),
          'source', 'clinic_upload'
        ),
        'uploadedAt', COALESCE(document.value ->> 'uploadedAt', cd.created_at::text),
        'createdAt', cd.created_at,
        'title', COALESCE(document.value ->> 'documentTitle', document.value ->> 'originalName', 'Clinic Upload')
      ) AS report
    FROM public.clinical_documentation cd
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(cd.file_urls) = 'object' THEN cd.file_urls ELSE '{}'::jsonb END) AS document
    LEFT JOIN public.patients p ON p.id = cd.patient_id
    LEFT JOIN public.clinics c ON c.id = cd.clinic_id
    WHERE (p_clinic_id IS NULL OR cd.clinic_id = p_clinic_id)
      AND (p_patient_id IS NULL OR cd.patient_id = p_patient_id)

    UNION ALL

    SELECT
      ar.patient_id,
      ar.clinic_id,
      ar.created_at,
      jsonb_build_object(
        'id', 'algo_' || ar.id::text,
        'clinicId', ar.clinic_id,
        'patientId', ar.patient_id,
        'patientName', COALESCE(p.full_name, p.name, 'Unknown Patient'),
        'patientUid', p.external_id,
        'clinicName', COALESCE(c.name, 'Unknown Clinic'),
        'fileName', 'NeuroSense Report - ' || COALESCE(p.full_name, p.name, 'Patient'),
        'filePath', ar.pdf_url,
        'fileUrl', ar.pdf_url,
        'storagePath', ar.pdf_url,
        'storedInCloud', true,
        'reportData', jsonb_build_object('title', 'NeuroSense Algorithm Report', 'reportType', 'NeuroSense', 'source', 'algorithm_results'),
        'uploadedAt', ar.created_at,
        'createdAt', ar.created_at,
        'title', 'NeuroSense Report - ' || COALESCE(p.full_name, p.name, 'Patient')
      ) AS report
    FROM public.algorithm_results ar
    LEFT JOIN public.patients p ON p.id = ar.patient_id
    LEFT JOIN public.clinics c ON c.id = ar.clinic_id
    WHERE ar.status = 'completed'
      AND ar.pdf_url IS NOT NULL
      AND (p_clinic_id IS NULL OR ar.clinic_id = p_clinic_id)
      AND (p_patient_id IS NULL OR ar.patient_id = p_patient_id)
  ), filtered_items AS (
    SELECT *
    FROM report_items
    WHERE p_search IS NULL
       OR p_search = ''
       OR report ->> 'patientName' ILIKE '%' || p_search || '%'
       OR report ->> 'clinicName' ILIKE '%' || p_search || '%'
       OR report ->> 'fileName' ILIKE '%' || p_search || '%'
  ), patient_groups AS (
    SELECT
      patient_id,
      MAX(created_at) AS latest_upload,
      jsonb_agg(report ORDER BY created_at DESC) AS reports
    FROM filtered_items
    GROUP BY patient_id
  ), totals AS (
    SELECT COUNT(*)::bigint AS total_patients, COALESCE(SUM(jsonb_array_length(reports)), 0)::bigint AS total_reports
    FROM patient_groups
  )
  SELECT patient_groups.reports, totals.total_patients, totals.total_reports
  FROM patient_groups
  CROSS JOIN totals
  ORDER BY
    CASE WHEN p_ascending THEN patient_groups.latest_upload END ASC,
    CASE WHEN NOT p_ascending THEN patient_groups.latest_upload END DESC
  OFFSET GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 10), 50)
  LIMIT LEAST(GREATEST(p_page_size, 10), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.admin_report_page(integer, integer, uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_page(integer, integer, uuid, uuid, text, boolean) TO service_role;
