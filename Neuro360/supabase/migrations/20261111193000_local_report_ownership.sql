-- Local report ownership is snapshotted, never inferred from editable report URLs at download time.
BEGIN;
CREATE TABLE IF NOT EXISTS private.local_report_ownership (
 filename text PRIMARY KEY,
 patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.local_report_ownership ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.local_report_ownership FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.local_report_ownership TO service_role;
CREATE OR REPLACE FUNCTION public.register_local_report_owner(p_filename text,p_patient_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
 IF p_filename IS NULL OR length(p_filename)>255 OR p_filename ~ '[/\\]' OR p_filename !~* '\.(pdf|txt|json)$' OR p_patient_id IS NULL THEN
  RAISE EXCEPTION 'Invalid local report reference' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.local_report_ownership(filename,patient_id) VALUES(p_filename,p_patient_id) ON CONFLICT(filename) DO NOTHING;
 SELECT patient_id INTO owner FROM private.local_report_ownership WHERE filename=p_filename;
 IF owner IS DISTINCT FROM p_patient_id THEN RAISE EXCEPTION 'Local report already has another owner' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.resolve_local_report_owner(p_filename text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT patient_id FROM private.local_report_ownership WHERE filename=p_filename
$$;
REVOKE ALL ON FUNCTION public.register_local_report_owner(text,uuid),public.resolve_local_report_owner(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_local_report_owner(text,uuid),public.resolve_local_report_owner(text) TO service_role;

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
NOTIFY pgrst,'reload schema';
COMMIT;
