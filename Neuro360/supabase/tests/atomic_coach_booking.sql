-- Synthetic transaction only; run: node apply-sql-file.js staging supabase/tests/atomic_coach_booking.sql
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); org uuid:=gen_random_uuid();
  patient uuid:=gen_random_uuid(); coach uuid:=gen_random_uuid(); credit uuid:=gen_random_uuid(); expired uuid:=gen_random_uuid();
  email text; payload jsonb; first_booking jsonb; retry_booking jsonb; count_before integer; paid_key text;
BEGIN
  email:=actor::text||'@booking-test.invalid'; paid_key:='fixture_'||actor::text;
  INSERT INTO auth.users(id,email) VALUES(actor,actor::text||'@auth-booking-test.invalid'),(other_actor,other_actor::text||'@auth-booking-test.invalid');
  INSERT INTO public.organizations(id,name) VALUES(org,'Synthetic booking transaction');
  INSERT INTO public.patients(id,org_id,full_name,date_of_birth,gender,email,auth_user_id)
    VALUES(patient,org,'Synthetic patient','1990-01-01','male',email,actor);
  INSERT INTO public.coaches(id,name,price,is_active) VALUES(coach,'Synthetic coach',90.50,true);
  INSERT INTO public.patient_coaching_credits(id,patient_email,credits_available,credits_used,expires_at)
    VALUES(credit,email,2,0,now()+interval '1 day'),(expired,email,1,0,now()-interval '1 day');
  payload:=jsonb_build_object('patient_name','Synthetic patient','coach_id',coach,'coach_name','Synthetic coach',
    'coach_email','coach@booking-test.invalid','event_name','Fixture session','start_time',now(),'end_time',now()+interval '30 minutes');
  ASSERT NOT has_function_privilege('anon','public.create_authorized_coach_booking(uuid,text,jsonb,uuid,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.create_authorized_coach_booking(uuid,text,jsonb,uuid,text)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.create_authorized_coach_booking(uuid,text,jsonb,uuid,text)','EXECUTE');
  first_booking:=public.create_authorized_coach_booking(actor,email,payload,credit,NULL);
  ASSERT (SELECT credits_available=1 AND credits_used=1 FROM public.patient_coaching_credits WHERE id=credit),'Credit must decrement exactly once';
  ASSERT first_booking->>'status'='scheduled','Booking status must be server controlled';
  SELECT count(*) INTO count_before FROM public.coach_bookings WHERE patient_email=email;
  BEGIN
    PERFORM public.create_authorized_coach_booking(actor,email,payload||jsonb_build_object('coach_id',gen_random_uuid()),credit,NULL);
    RAISE EXCEPTION 'Fixture expected FK rejection';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  ASSERT (SELECT credits_available=1 AND credits_used=1 FROM public.patient_coaching_credits WHERE id=credit),'Failed insert must roll back credit decrement';
  ASSERT (SELECT count(*)=count_before FROM public.coach_bookings WHERE patient_email=email),'Failed insert must not add booking';
  BEGIN
    PERFORM public.create_authorized_coach_booking(other_actor,email,payload,credit,NULL);
    RAISE EXCEPTION 'Fixture expected owner rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.create_authorized_coach_booking(actor,email,payload,expired,NULL);
    RAISE EXCEPTION 'Fixture expected expiry rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  first_booking:=public.create_authorized_coach_booking(actor,email,payload,NULL,paid_key);
  retry_booking:=public.create_authorized_coach_booking(actor,email,payload,NULL,paid_key);
  ASSERT first_booking->>'id'=retry_booking->>'id','Paid session retry must return existing booking';
  ASSERT (SELECT count(*)=1 FROM public.coach_bookings WHERE stripe_session_id=paid_key),'Paid session must create exactly one booking';
  ASSERT (SELECT credits_available=1 FROM public.patient_coaching_credits WHERE id=credit),'Paid booking must not consume free credit';
END $$;
ROLLBACK;
SELECT 'atomic booking ownership, credit rollback, expiry, and paid idempotency passed; fixtures rolled back' AS result;
