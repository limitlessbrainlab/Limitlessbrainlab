const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createRoutedClient } = require('../dbRouter');

// Routed per-request (prod vs staging by origin) so JWT verification
// (supabase.auth.getUser) hits the same DB the request's data queries use.
// Returns the plain prod client when staging env vars are not configured.
const supabase = createRoutedClient();
const verifiedTokenCache = new Map();
const VERIFIED_TOKEN_CACHE_TTL_MS = 30_000;
const MAX_VERIFIED_TOKENS = 500;

const tokenCacheKey = (token) => crypto.createHash('sha256').update(token).digest('base64url');

const rememberVerifiedUser = (key, user) => {
  if (verifiedTokenCache.size >= MAX_VERIFIED_TOKENS) {
    const firstKey = verifiedTokenCache.keys().next().value;
    if (firstKey) verifiedTokenCache.delete(firstKey);
  }
  verifiedTokenCache.set(key, { user, expiresAt: Date.now() + VERIFIED_TOKEN_CACHE_TTL_MS });
};

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
    const cacheKey = tokenCacheKey(token);
    const cached = verifiedTokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) {
      req.user = cached.user;
      req.authDurationMs = performance.now() - startedAt;
      return next();
    }
    if (cached) verifiedTokenCache.delete(cacheKey);

    // Verify signed claims locally when Supabase's cached JWKS is available.
    // `getUser()` always performs a remote Auth request and was holding up every
    // admin page request even after its data query had completed.
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    let user = claimsData?.claims ? {
      id: claimsData.claims.sub,
      email: claimsData.claims.email,
      user_metadata: claimsData.claims.user_metadata
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
    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || 'patient'
    };
    // A verified token is safe to reuse briefly; the raw token is never stored.
    rememberVerifiedUser(cacheKey, req.user);
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
        req.user = {
          id: user.id,
          email: user.email,
          role: user.user_metadata?.role || 'patient'
        };
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
