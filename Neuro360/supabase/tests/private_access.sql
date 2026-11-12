-- Synthetic native identities and permission checks; always rollback fixtures.
BEGIN;
DO $$
DECLARE c uuid:=gen_random_uuid(); oc uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); op uuid:=gen_random_uuid();
 cu uuid:=gen_random_uuid(); pu uuid:=gen_random_uuid(); cs uuid:=gen_random_uuid(); ps uuid:=gen_random_uuid(); w uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('test.c',c::text,true); PERFORM set_config('test.oc',oc::text,true);
 PERFORM set_config('test.p',p::text,true); PERFORM set_config('test.op',op::text,true);
 PERFORM set_config('test.cu',cu::text,true); PERFORM set_config('test.cs',cs::text,true);
 PERFORM set_config('test.w',w::text,true);
 INSERT INTO auth.users(id,email) VALUES(cu,cu||'@security-test.invalid');
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(cs,cu,now(),now());
 INSERT INTO public.clinics(id,name,email,is_active,subscription_status,auth_user_id)
 VALUES(c,'Synthetic clinic',c||'@security-test.invalid',true,'active',cu),(oc,'Other fixture',oc||'@security-test.invalid',true,'active',NULL);
 INSERT INTO public.organizations(id,name) VALUES(c,'Synthetic clinic'),(oc,'Other fixture') ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
 VALUES(p,'Synthetic patient',p||'@security-test.invalid',c,c,'1990-01-01','other'),(op,'Other fixture',op||'@security-test.invalid',oc,oc,'1990-01-01','other');
 INSERT INTO auth.users(id,email) VALUES(pu,p||'@security-test.invalid');
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES(ps,pu,now(),now());
 UPDATE public.patients SET auth_user_id=pu WHERE id=p;
 INSERT INTO public.wallet_subscriptions(id,patient_email,patient_id,plan_name,status)
 VALUES(w,p||'@security-test.invalid',p,'Fixture plan','Active');
 INSERT INTO storage.objects(bucket_id,name) VALUES('neurosense-reports','security-test/'||p||'.pdf'),('neurosense-reports','security-test/'||op||'.pdf');
 PERFORM public.register_document_owner('neurosense-reports','security-test/'||p||'.pdf',p);
 PERFORM public.register_document_owner('neurosense-reports','security-test/'||op||'.pdf',op);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'session_id',ps,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE w uuid:=current_setting('test.w')::uuid; n integer;
BEGIN
 ASSERT private.patient_id()=current_setting('test.p')::uuid,'Patient fixture must resolve';
 UPDATE public.wallet_subscriptions SET status='Paused' WHERE id=w;
 GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1,'Pause must update one own row';
 UPDATE public.wallet_subscriptions SET status='Active' WHERE id=w;
 ASSERT EXISTS(SELECT 1 FROM public.wallet_subscriptions WHERE id=w AND status='Active'),'Resume must persist';
 BEGIN
  UPDATE public.wallet_subscriptions SET status=NULL WHERE id=w;
  RAISE EXCEPTION 'SECURITY FAILURE: NULL status accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.wallet_subscriptions SET plan_name='Forged plan' WHERE id=w;
  RAISE EXCEPTION 'SECURITY FAILURE: plan mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.wallet_subscriptions SET status='Cancelled' WHERE id=w;
 BEGIN
  UPDATE public.wallet_subscriptions SET status='Active' WHERE id=w;
  RAISE EXCEPTION 'SECURITY FAILURE: cancelled plan revived';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.cu'),'session_id',current_setting('test.cs'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c uuid:=current_setting('test.c')::uuid; p uuid:=current_setting('test.p')::uuid; entry uuid;
        newp uuid:=gen_random_uuid(); newemail text:=gen_random_uuid()||'@security-test.invalid';
BEGIN
 ASSERT private.clinic_id()=c,'Clinic fixture must resolve';
 -- Browser clinic insert .select() needs a row-local SELECT policy; avoid a
 -- self-query through owns_patient() because INSERT RETURNING cannot see its row.
 INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
 VALUES(newp,'New clinic patient',newemail,c,c,'1990-01-01','other') RETURNING id INTO entry;
 ASSERT entry=newp,'Clinic patient INSERT RETURNING must succeed';
 PERFORM public.claim_credentials_for_new_account('patients',newemail,'Synthetic-password-1');
 PERFORM public.set_patient_password_by_clinic(c,newp,'Changed-password-2');
 BEGIN
  INSERT INTO public.patients(id,full_name,email,clinic_id,org_id,date_of_birth,gender)
  VALUES(gen_random_uuid(),'Foreign clinic patient',gen_random_uuid()||'@security-test.invalid',current_setting('test.oc')::uuid,current_setting('test.oc')::uuid,'1990-01-01','other');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign clinic patient insert accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.reports(clinic_id,patient_id,file_name,file_path,status) VALUES(c,p,'fixture.pdf','security-test/'||p||'.pdf','completed');
 BEGIN
  INSERT INTO public.reports(clinic_id,patient_id,file_name,file_path,status)
  VALUES(c,current_setting('test.op')::uuid,'fixture.pdf','security-test/'||current_setting('test.op')||'.pdf','completed');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign patient accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.reports(clinic_id,patient_id,file_name,file_path,status)
  VALUES(current_setting('test.oc')::uuid,p,'fixture.pdf','security-test/'||p||'.pdf','completed');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign clinic accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.audit_logs(user_id,user_email,user_role,action,entity_type,entity_id,description)
 VALUES(gen_random_uuid(),'forged@example.invalid','super_admin','UPDATE','patient',p::text,'Synthetic audit') RETURNING id INTO entry;
 ASSERT EXISTS(SELECT 1 FROM public.audit_logs WHERE id=entry AND user_id=auth.uid() AND user_role='clinic_admin'
 AND user_email=c||'@security-test.invalid'),'Audit identity must be stamped';
 INSERT INTO public.admin_notifications(type,category,title,message,clinic_id,is_read,created_by)
 VALUES('profile_change','clinic','Synthetic notice','Synthetic notice',c,false,c||'@security-test.invalid') RETURNING id INTO entry;
 ASSERT entry IS NOT NULL,'Clinic notice must persist';
 BEGIN
  INSERT INTO public.admin_notifications(type,category,title,message,clinic_id,is_read,created_by)
  VALUES('payment_received','payment','Forged notice','Forged notice',c,false,c||'@security-test.invalid');
  RAISE EXCEPTION 'SECURITY FAILURE: forged payment notice accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.admin_notifications(type,category,title,message,clinic_id,is_read,created_by)
  VALUES('profile_change','clinic','Forged notice','Forged notice',current_setting('test.oc')::uuid,false,c||'@security-test.invalid');
  RAISE EXCEPTION 'SECURITY FAILURE: foreign clinic notice accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
