-- Synthetic storage metadata only; never creates files and always rolls back.
BEGIN;
DO $$
DECLARE c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); file text:=gen_random_uuid()||'/report space.pdf';
BEGIN
 PERFORM set_config('test.doc_clinic',c::text,true); PERFORM set_config('test.doc_patient',p::text,true);
 PERFORM set_config('test.doc_other_patient',other_p::text,true); PERFORM set_config('test.doc_path',file,true);
 INSERT INTO auth.users(id,email) VALUES(u,u||'@security-test.invalid');
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(session,u,now(),now());
 INSERT INTO public.clinics(id,name,email,is_active,subscription_status,auth_user_id)
 VALUES(c,'Document fixture',c||'@security-test.invalid',true,'active',u);
 INSERT INTO public.organizations(id,name) VALUES(c,'Document fixture') ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
 VALUES(p,'Document fixture',p||'@security-test.invalid',c,c,'1990-01-01','other'),
 (other_p,'Other document fixture',other_p||'@security-test.invalid',c,c,'1990-01-01','other');
 INSERT INTO storage.objects(bucket_id,name) VALUES('patients_documents',file);
 ASSERT EXISTS(SELECT 1 FROM private.document_reference('https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/sign/patients_documents/'||replace(file,' ','%20')||'?token=synthetic','neurosense-reports') r
 WHERE r.bucket='patients_documents' AND r.path=file),'Signed URL must normalize to existing raw path';
 ASSERT NOT EXISTS(SELECT 1 FROM private.document_reference('https://evil.invalid/storage/v1/object/public/patients_documents/a','patients_documents')),'Foreign non-storage URL must be rejected';
 ASSERT NOT EXISTS(SELECT 1 FROM private.document_reference('https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/public/patients_documents/%2e%2e/secret','patients_documents')),'Encoded traversal must be rejected';
 ASSERT NOT EXISTS(SELECT 1 FROM private.document_reference('https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/public/patients_documents/bad%ZZ','patients_documents')),'Malformed escape must be rejected';
 ASSERT EXISTS(SELECT 1 FROM private.document_references('clinical_documentation',jsonb_build_object('file_urls',to_jsonb(jsonb_build_object('report',jsonb_build_object('path',file,'bucket','patients_documents'))::text))) r WHERE r.path=file),'String-encoded historical JSON must parse';
 INSERT INTO storage.objects(bucket_id,name) VALUES('patients_documents','clinic-only/'||file);
 INSERT INTO private.document_ownership(bucket,path,object_id,clinic_id)
 SELECT bucket_id,name,id,c FROM storage.objects WHERE bucket_id='patients_documents' AND name='clinic-only/'||file;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',session,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE service_role;
SELECT public.register_document_owner('patients_documents',current_setting('test.doc_path'),current_setting('test.doc_patient')::uuid);
SELECT public.register_document_owner('patients_documents',current_setting('test.doc_path'),current_setting('test.doc_patient')::uuid);
DO $$ BEGIN
 ASSERT public.resolve_document_clinic('patients_documents','clinic-only/'||current_setting('test.doc_path'))=current_setting('test.doc_clinic')::uuid,'Clinic-only owner must resolve';
 ASSERT public.resolve_document_owner('patients_documents','clinic-only/'||current_setting('test.doc_path')) IS NULL,'Clinic-only object must not invent patient';
 ASSERT public.resolve_document_owner('patients_documents',current_setting('test.doc_path'))=current_setting('test.doc_patient')::uuid,'Registered owner must resolve';
 BEGIN
  PERFORM public.register_document_owner('patients_documents',current_setting('test.doc_path'),current_setting('test.doc_other_patient')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: document owner reassigned';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.register_document_owner('patients_documents','missing/'||current_setting('test.doc_path'),current_setting('test.doc_patient')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: missing object registered';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE data jsonb:=jsonb_build_object('report',jsonb_build_object('path',current_setting('test.doc_path'),'bucket','patients_documents'));
BEGIN
 ASSERT private.clinic_id()=current_setting('test.doc_clinic')::uuid,'Native clinic fixture must resolve';
 BEGIN
  PERFORM public.register_document_owner('patients_documents',current_setting('test.doc_path'),current_setting('test.doc_other_patient')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: browser registered ownership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.resolve_document_owner('patients_documents',current_setting('test.doc_path'));
  RAISE EXCEPTION 'SECURITY FAILURE: browser resolved service-only ownership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.clinical_documentation(patient_id,clinic_id,file_urls)
 VALUES(current_setting('test.doc_patient')::uuid,current_setting('test.doc_clinic')::uuid,data);
 INSERT INTO public.reports(clinic_id,file_path,file_name,status)
 VALUES(current_setting('test.doc_clinic')::uuid,'https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/public/patients_documents/clinic-only/'||replace(current_setting('test.doc_path'),' ','%20'),'fixture.pdf','completed');
 INSERT INTO public.reports(patient_id,clinic_id,file_path,file_name,status)
 VALUES(current_setting('test.doc_patient')::uuid,current_setting('test.doc_clinic')::uuid,'https://ukmggjcvjvjodksopngs.supabase.co/storage/v1/object/sign/patients_documents/'||replace(current_setting('test.doc_path'),' ','%20')||'?token=synthetic','fixture.pdf','completed');
 BEGIN
  INSERT INTO public.reports(clinic_id,file_path,file_name,status)
  VALUES(current_setting('test.doc_clinic')::uuid,'unregistered/'||current_setting('test.doc_path'),'fixture.pdf','completed');
  RAISE EXCEPTION 'SECURITY FAILURE: NULL patient bypassed registered reference check';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 BEGIN
  INSERT INTO public.clinical_documentation(patient_id,clinic_id,file_urls)
  VALUES(current_setting('test.doc_other_patient')::uuid,current_setting('test.doc_clinic')::uuid,data);
  RAISE EXCEPTION 'SECURITY FAILURE: browser asserted other patient object ownership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE storage.objects SET name='renamed/'||name WHERE bucket_id='patients_documents' AND name=current_setting('test.doc_path');
DO $$ BEGIN
 ASSERT public.resolve_document_owner('patients_documents',current_setting('test.doc_path')) IS NULL,'Moved object must no longer resolve at its old path';
END $$;
ROLLBACK;
