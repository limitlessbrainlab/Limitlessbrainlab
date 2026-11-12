-- Transaction-only fixtures; run through psql -v ON_ERROR_STOP=1 or apply-sql-file.js.
BEGIN;
DO $$
DECLARE actor uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('test.actor_id', actor::text, true);
  INSERT INTO auth.users(id, email) VALUES (actor, actor || '@security-test.invalid');
  INSERT INTO public.profiles(id, email, full_name, role)
    VALUES (actor, actor || '@security-test.invalid', 'Security test', 'patient');
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'super_admin' WHERE id = current_setting('test.actor_id')::uuid;
    RAISE EXCEPTION 'SECURITY FAILURE: patient could grant itself super admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.profiles SET full_name = 'Edited test name' WHERE id = current_setting('test.actor_id')::uuid;
  ASSERT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_setting('test.actor_id')::uuid
    AND full_name = 'Edited test name' AND role = 'patient'), 'Own profile editing must still work';
END $$;
ROLLBACK;
