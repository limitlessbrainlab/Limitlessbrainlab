const jwt = require('jsonwebtoken');

async function verifiedPortalUser(db, token) {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  // Decode only after Supabase verifies the signature; live SQL rejects revoked sessions.
  const claims = jwt.decode(token);
  if (!claims?.session_id || claims.sub !== data.user.id) return null;
  const { data: identity, error: identityError } = await db.rpc('resolve_portal_identity', {
    p_user_id: data.user.id, p_session_id: claims.session_id
  });
  if (identityError) throw identityError;
  return identity || null;
}
module.exports = { verifiedPortalUser };
