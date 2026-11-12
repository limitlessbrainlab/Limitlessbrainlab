-- Deploy with server registration of newly uploaded documents/reports.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.document_ownership (
  bucket text NOT NULL,
  path text NOT NULL,
  object_id uuid NOT NULL UNIQUE REFERENCES storage.objects(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(bucket,path)
);
ALTER TABLE private.document_ownership ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE private.document_ownership ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE;
ALTER TABLE private.document_ownership DROP CONSTRAINT IF EXISTS document_owner_required;
ALTER TABLE private.document_ownership ADD CONSTRAINT document_owner_required CHECK (patient_id IS NOT NULL OR clinic_id IS NOT NULL);
ALTER TABLE private.document_ownership ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_ownership FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.document_ownership TO service_role;

CREATE OR REPLACE FUNCTION private.document_json(value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(value)='string' THEN RETURN (value #>> '{}')::jsonb; END IF;
  RETURN value;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;

-- Decode URL escapes once; raw storage object names are never URL-decoded.
CREATE OR REPLACE FUNCTION private.document_reference(value text, default_bucket text)
RETURNS TABLE(bucket text,path text) LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE parts text[]; encoded text; bytes bytea:=''::bytea; i integer:=1; ch text;
BEGIN
  IF value IS NULL OR value='' THEN RETURN; END IF;
  IF value ~ '^https://' THEN
    parts:=regexp_match(value,'^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/([^?#]+)(?:[?#].*)?$');
    IF parts IS NULL THEN RETURN; END IF;
    bucket:=parts[1]; encoded:=parts[2];
    WHILE i<=length(encoded) LOOP
      ch:=substr(encoded,i,1);
      IF ch='%' THEN
        IF substr(encoded,i+1,2) !~ '^[0-9A-Fa-f]{2}$' THEN RETURN; END IF;
        bytes:=bytes||decode(substr(encoded,i+1,2),'hex'); i:=i+3;
      ELSE bytes:=bytes||convert_to(ch,'UTF8'); i:=i+1;
      END IF;
    END LOOP;
    path:=convert_from(bytes,'UTF8');
  ELSE bucket:=default_bucket; path:=value;
  END IF;
  IF bucket NOT IN ('patients_documents','neurosense-reports','patient-reports','edf-files','qeeg-uploads')
    OR bucket IS NULL OR path IS NULL OR length(path)>2048 OR path ~ '(^|/)(\.{1,2})?(/|$)' OR position(E'\\' IN path)>0 THEN RETURN; END IF;
  RETURN NEXT;
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION private.document_references(table_name text,row_data jsonb)
RETURNS TABLE(bucket text,path text) LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE payload jsonb; entry jsonb; candidate text;
BEGIN
  IF table_name='clinical_documentation' THEN
    payload:=private.document_json(row_data->'file_urls');
    IF jsonb_typeof(payload)='object' THEN
      FOR entry IN SELECT value FROM jsonb_each(payload) LOOP
        RETURN QUERY SELECT * FROM private.document_reference(coalesce(entry->>'path',entry->>'filePath',entry->>'url'),coalesce(entry->>'bucket','patients_documents'));
      END LOOP;
    END IF;
  ELSIF table_name='clinical_reports' THEN
    payload:=private.document_json(row_data->'uploaded_documents');
    IF jsonb_typeof(payload)='array' THEN
      FOR entry IN SELECT value FROM jsonb_array_elements(payload) LOOP
        RETURN QUERY SELECT * FROM private.document_reference(coalesce(entry->>'filePath',entry->>'path',entry->>'url'),coalesce(entry->>'bucket','patients_documents'));
      END LOOP;
    END IF;
  ELSIF table_name='reports' THEN
    RETURN QUERY SELECT * FROM private.document_reference(row_data->>'file_path','neurosense-reports');
    payload:=private.document_json(row_data->'report_data');
    RETURN QUERY SELECT * FROM private.document_reference(payload->>'fileUrl','neurosense-reports');
  ELSIF table_name='algorithm_results' THEN
    RETURN QUERY SELECT * FROM private.document_reference(row_data->>'pdf_url','neurosense-reports');
    RETURN QUERY SELECT * FROM private.document_reference(row_data->>'claude_report_url','neurosense-reports');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_document_owner(p_bucket text,p_path text,p_patient_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE obj uuid; owner uuid;
BEGIN
  IF p_patient_id IS NULL THEN RAISE EXCEPTION 'Patient owner is required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.document_reference(p_path,p_bucket) r WHERE r.bucket=p_bucket AND r.path=p_path) THEN
    RAISE EXCEPTION 'Invalid document reference' USING ERRCODE='22023';
  END IF;
  SELECT id INTO obj FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path;
  IF obj IS NULL THEN RAISE EXCEPTION 'Document object does not exist' USING ERRCODE='22023'; END IF;
  INSERT INTO private.document_ownership(bucket,path,object_id,patient_id) VALUES(p_bucket,p_path,obj,p_patient_id)
  ON CONFLICT(bucket,path) DO NOTHING;
  SELECT patient_id INTO owner FROM private.document_ownership WHERE bucket=p_bucket AND path=p_path;
  IF owner IS DISTINCT FROM p_patient_id THEN RAISE EXCEPTION 'Document already belongs to another patient' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.resolve_document_owner(p_bucket text,p_path text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT d.patient_id FROM private.document_ownership d JOIN storage.objects o
  ON o.id=d.object_id AND o.bucket_id=d.bucket AND o.name=d.path
  WHERE d.bucket=p_bucket AND d.path=p_path
$$;
CREATE OR REPLACE FUNCTION public.resolve_document_clinic(p_bucket text,p_path text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT d.clinic_id FROM private.document_ownership d JOIN storage.objects o
  ON o.id=d.object_id AND o.bucket_id=d.bucket AND o.name=d.path
  WHERE d.bucket=p_bucket AND d.path=p_path AND d.patient_id IS NULL
$$;
REVOKE ALL ON FUNCTION public.resolve_document_clinic(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_document_clinic(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.register_document_owner(text,text,uuid),public.resolve_document_owner(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_document_owner(text,text,uuid),public.resolve_document_owner(text,text) TO service_role;

-- Backfill real objects with one patient, or one clinic when no patient survives.
-- No runtime fallback trusts browser-editable JSON to establish ownership.
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

CREATE OR REPLACE FUNCTION private.protect_document_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref record; clinic uuid; owner uuid;
BEGIN
  IF current_setting('role',true) IN ('anon','authenticated') THEN
    FOR ref IN SELECT * FROM private.document_references(TG_TABLE_NAME,to_jsonb(NEW)) LOOP
      owner:=public.resolve_document_owner(ref.bucket,ref.path);
      clinic:=public.resolve_document_clinic(ref.bucket,ref.path);
      IF NOT coalesce((NEW.patient_id IS NOT NULL AND owner=NEW.patient_id) OR
        (NEW.patient_id IS NULL AND clinic IS NOT NULL AND clinic=coalesce(to_jsonb(NEW)->>'clinic_id',to_jsonb(NEW)->>'org_id')::uuid),false) THEN
        RAISE EXCEPTION 'Document reference is not registered to this patient' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.document_json(jsonb),private.document_reference(text,text),private.document_references(text,jsonb),private.protect_document_references() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
