-- pgcrypto supports bcrypt variant 2a; bcryptjs writes compatible 2b hashes.
-- Normalize only the comparison salt, leaving all stored credentials unchanged.
CREATE OR REPLACE FUNCTION public.credential_matches(p_plain text, p_stored text)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_stored LIKE '$2a$%' OR p_stored LIKE '$2b$%' OR p_stored LIKE '$2y$%'
      THEN extensions.crypt(trim(p_plain), overlay(p_stored placing 'a' from 3 for 1))
        = overlay(p_stored placing 'a' from 3 for 1)
    ELSE trim(p_plain) = trim(coalesce(p_stored, ''))
  END
$$;
