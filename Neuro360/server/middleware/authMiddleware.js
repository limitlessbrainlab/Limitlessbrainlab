const jwt = require('jsonwebtoken');
const { createRoutedClient } = require('../dbRouter');

// Routed per-request (prod vs staging by origin) so JWT verification
// (supabase.auth.getUser) hits the same DB the request's data queries use.
// Returns the plain prod client when staging env vars are not configured.
const supabase = createRoutedClient();
async function resolveVerifiedUser(user, claims) {
  if (!claims?.session_id || claims.sub !== user.id) return null;
  const { data, error } = await supabase.rpc('resolve_portal_identity', {
    p_user_id: user.id, p_session_id: claims.session_id
  });
  if (error) throw error;
  return data;
}

/**
 * Middleware to verify JWT token and attach user to request
 * Checks Authorization header for Bearer token or Supabase session
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    const startedAt = performance.now();
    // Verify signed claims locally when Supabase's cached JWKS is available.
    // `getUser()` always performs a remote Auth request and was holding up every
    // admin page request even after its data query had completed.
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    let user = claimsData?.claims ? {
      id: claimsData.claims.sub,
      email: claimsData.claims.email,
      app_metadata: claimsData.claims.app_metadata
    } : null;
    let error = claimsError;

    // Safe compatibility fallback for projects still using legacy symmetric JWTs.
    if (!user) {
      const result = await supabase.auth.getUser(token);
      user = result.data.user;
      error = result.error;
    }

    if (error || !user) {
      console.error('[AuthMiddleware] Supabase error:', JSON.stringify(error), '| SUPABASE_URL set:', !!process.env.SUPABASE_URL, '| KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user to request for downstream use
    req.user = await resolveVerifiedUser(user, claimsData?.claims || jwt.decode(token));
    if (!req.user) return res.status(401).json({ success: false, error: 'Invalid or expired session', code: 'INVALID_TOKEN' });
    req.authDurationMs = performance.now() - startedAt;

    next();
  } catch (error) {
    console.error('[AuthMiddleware Error]', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for endpoints that work for both authenticated and unauthenticated users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        req.user = await resolveVerifiedUser(user, jwt.decode(token));
      }
    }

    next();
  } catch (error) {
    console.error('[OptionalAuth Error]', error.message);
    next(); // Continue even if auth fails
  }
};

module.exports = {
  authMiddleware,
  optionalAuth
};
