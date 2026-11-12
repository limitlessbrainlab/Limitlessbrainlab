BEGIN;
DO $$
DECLARE c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid(); filename text:=gen_random_uuid()||'.pdf';
BEGIN
 PERFORM set_config('test.local_patient',p::text,true);PERFORM set_config('test.local_other',other_p::text,true);PERFORM set_config('test.local_file',filename,true);
 INSERT INTO public.clinics(id,name,email,is_active) VALUES(c,'Local file fixture',c||'@security-test.invalid',true);
 INSERT INTO public.organizations(id,name) VALUES(c,'Local file fixture') ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
 VALUES(p,'Local file fixture',p||'@security-test.invalid',c,c,'1990-01-01','other'),
 (other_p,'Other file fixture',other_p||'@security-test.invalid',c,c,'1990-01-01','other');
END $$;
SET LOCAL ROLE service_role;
DO $$
BEGIN
 PERFORM public.register_local_report_owner(current_setting('test.local_file'),current_setting('test.local_patient')::uuid);
 PERFORM public.register_local_report_owner(current_setting('test.local_file'),current_setting('test.local_patient')::uuid);
 ASSERT public.resolve_local_report_owner(current_setting('test.local_file'))=current_setting('test.local_patient')::uuid,'Local owner must resolve';
 BEGIN
  PERFORM public.register_local_report_owner(current_setting('test.local_file'),current_setting('test.local_other')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: filename collision changed owner';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.register_local_report_owner('../fixture.pdf',current_setting('test.local_patient')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: traversal path accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.register_local_report_owner(current_setting('test.local_file'),current_setting('test.local_patient')::uuid);
  RAISE EXCEPTION 'SECURITY FAILURE: browser registered local filename';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.resolve_local_report_owner(current_setting('test.local_file'));
  RAISE EXCEPTION 'SECURITY FAILURE: browser called resolver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
