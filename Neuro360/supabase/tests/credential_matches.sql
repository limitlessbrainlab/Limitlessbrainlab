-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/credential_matches.sql
DO $$
DECLARE
  -- bcryptjs hash of login-regression-✓ (includes non-ASCII input).
  hash text := '$2b$10$.AWyBfE8YUgUQpAE6uaJY.7ny0T8UkieWS5TU7f8NLHuBIjq9FsnS';
  variant text;
BEGIN
  FOREACH variant IN ARRAY ARRAY['a', 'b', 'y'] LOOP
    hash := overlay(hash placing variant from 3 for 1);
    ASSERT public.credential_matches('login-regression-✓', hash) IS TRUE,
      'Correct bcrypt password rejected: ' || variant;
    ASSERT public.credential_matches('wrong-password', hash) IS FALSE,
      'Incorrect bcrypt password accepted: ' || variant;
  END LOOP;
  ASSERT public.credential_matches(' legacy ', 'legacy') IS TRUE;
  ASSERT public.credential_matches('wrong', 'legacy') IS FALSE;
  ASSERT public.credential_matches('password', NULL) IS NOT TRUE;
END;
$$;
