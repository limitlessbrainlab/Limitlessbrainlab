const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase admin client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

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
