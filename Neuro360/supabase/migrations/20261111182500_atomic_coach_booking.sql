-- Native-session verification happens at the HTTP boundary. Only service_role may call this RPC.
ALTER TABLE public.coach_bookings ADD COLUMN IF NOT EXISTS stripe_session_id text;
CREATE UNIQUE INDEX IF NOT EXISTS coach_bookings_stripe_session_unique ON public.coach_bookings(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_authorized_coach_booking(
  p_actor_id uuid, p_patient_email text, p_booking jsonb, p_credit_id uuid DEFAULT NULL, p_stripe_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_booking public.coach_bookings; v_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role::text='super_admin') INTO v_admin;
  IF NOT v_admin AND (NOT EXISTS(SELECT 1 FROM public.patients WHERE lower(email)=lower(p_patient_email)) OR EXISTS(
    SELECT 1 FROM public.patients p WHERE lower(p.email)=lower(p_patient_email) AND NOT (
      p.auth_user_id=p_actor_id OR EXISTS(SELECT 1 FROM public.clinics c WHERE c.id=coalesce(p.clinic_id,p.org_id)
        AND c.auth_user_id=p_actor_id AND c.is_active IS TRUE AND c.deleted_at IS NULL
        AND c.subscription_status IS DISTINCT FROM 'pending_approval')
    ) IS TRUE
  )) THEN RAISE EXCEPTION 'Patient access denied' USING ERRCODE='42501'; END IF;
  IF p_stripe_session_id IS NOT NULL THEN
    -- Service caller has verified the Stripe session. Serialize retries before insertion.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_stripe_session_id,0));
    SELECT * INTO v_booking FROM public.coach_bookings WHERE stripe_session_id=p_stripe_session_id;
    IF FOUND THEN
      IF lower(v_booking.patient_email)<>lower(p_patient_email) THEN RAISE EXCEPTION 'Purchase owner mismatch'; END IF;
      RETURN to_jsonb(v_booking);
    END IF;
  ELSIF NOT v_admin THEN
    UPDATE public.patient_coaching_credits SET credits_available=credits_available-1,
      credits_used=coalesce(credits_used,0)+1,updated_at=now()
    WHERE id=p_credit_id AND lower(patient_email)=lower(p_patient_email) AND credits_available>0 AND expires_at>now();
    IF NOT FOUND THEN RAISE EXCEPTION 'No available coaching credit' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.coach_bookings(patient_email,patient_name,coach_id,coach_name,coach_email,event_name,
    start_time,end_time,duration_minutes,status,location,notes,stripe_session_id)
  VALUES(lower(p_patient_email),p_booking->>'patient_name',(p_booking->>'coach_id')::uuid,p_booking->>'coach_name',
    p_booking->>'coach_email',p_booking->>'event_name',(p_booking->>'start_time')::timestamptz,
    (p_booking->>'end_time')::timestamptz,30,'scheduled','Online',p_booking->>'notes',p_stripe_session_id)
  RETURNING * INTO v_booking;
  RETURN to_jsonb(v_booking);
END $$;
REVOKE ALL ON FUNCTION public.create_authorized_coach_booking(uuid,text,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_authorized_coach_booking(uuid,text,jsonb,uuid,text) TO service_role;
