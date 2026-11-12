-- Apply after the compatible application is deployed and verified.
BEGIN;
LOCK TABLE public.clinical_documentation,public.clinical_reports,public.reports,public.algorithm_results IN SHARE ROW EXCLUSIVE MODE;

-- Catch references saved by old clients after the additive migration ran.
DROP TABLE IF EXISTS pg_temp.document_owner_candidates;
CREATE TEMP TABLE document_owner_candidates ON COMMIT DROP AS
SELECT refs.bucket,refs.path,p.id AS patient_id,c.id AS clinic_id,o.id AS object_id
FROM (
  SELECT 'clinical_documentation' AS table_name,patient_id,clinic_id,to_jsonb(d) AS row_data FROM public.clinical_documentation d
  UNION ALL SELECT 'clinical_reports',patient_id,org_id,to_jsonb(r) FROM public.clinical_reports r
  UNION ALL SELECT 'reports',patient_id,clinic_id,to_jsonb(r) FROM public.reports r
  UNION ALL SELECT 'algorithm_results',patient_id,clinic_id,to_jsonb(a) FROM public.algorithm_results a
) source
CROSS JOIN LATERAL private.document_references(source.table_name,source.row_data) refs
JOIN storage.objects o ON o.bucket_id=refs.bucket AND o.name=refs.path
LEFT JOIN public.patients p ON p.id=source.patient_id
LEFT JOIN public.clinics c ON c.id=source.clinic_id;
INSERT INTO private.document_ownership(bucket,path,object_id,patient_id,clinic_id)
SELECT bucket,path,min(object_id::text)::uuid,min(patient_id::text)::uuid,
  CASE WHEN count(DISTINCT patient_id)=0 THEN min(clinic_id::text)::uuid END
FROM document_owner_candidates GROUP BY bucket,path
HAVING count(DISTINCT patient_id)=1 OR (count(DISTINCT patient_id)=0 AND count(DISTINCT clinic_id)=1)
ON CONFLICT(bucket,path) DO NOTHING;

-- Register local uploads saved by the old backend after the additive snapshot ran.
WITH refs AS (
 SELECT patient_id,pdf_url AS url FROM public.algorithm_results
 UNION ALL SELECT patient_id,claude_report_url FROM public.algorithm_results
 UNION ALL SELECT patient_id,file_path FROM public.reports
 UNION ALL SELECT patient_id,private.document_json(report_data)->>'fileUrl' FROM public.reports
), candidates AS (
 SELECT p.id AS patient_id,normalized.path AS filename FROM refs r JOIN public.patients p ON p.id=r.patient_id
 CROSS JOIN LATERAL regexp_match(r.url,'^(?:https?://[^/]+)?/uploads/([^/?#]+)(?:[?#].*)?$') AS match(parts)
 CROSS JOIN LATERAL private.document_reference('https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/public/patients_documents/'||match.parts[1],'patients_documents') normalized
 WHERE normalized.path !~ '[/\\]' AND length(normalized.path)<=255 AND normalized.path ~* '\.(pdf|txt|json)$'
)
INSERT INTO private.local_report_ownership(filename,patient_id)
SELECT filename,min(patient_id::text)::uuid FROM candidates GROUP BY filename HAVING count(DISTINCT patient_id)=1
ON CONFLICT(filename) DO NOTHING;

DROP TRIGGER IF EXISTS protect_document_references ON public.clinical_documentation;
CREATE TRIGGER protect_document_references BEFORE INSERT OR UPDATE OF patient_id,file_urls ON public.clinical_documentation
FOR EACH ROW EXECUTE FUNCTION private.protect_document_references();
DROP TRIGGER IF EXISTS protect_document_references ON public.clinical_reports;
CREATE TRIGGER protect_document_references BEFORE INSERT OR UPDATE OF patient_id,uploaded_documents ON public.clinical_reports
FOR EACH ROW EXECUTE FUNCTION private.protect_document_references();
DROP TRIGGER IF EXISTS protect_document_references ON public.reports;
CREATE TRIGGER protect_document_references BEFORE INSERT OR UPDATE OF patient_id,file_path,report_data ON public.reports
FOR EACH ROW EXECUTE FUNCTION private.protect_document_references();
NOTIFY pgrst,'reload schema';
COMMIT;
