const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * 1000 requests per hour per real client IP (or per authenticated user).
 *
 * NOTE: this only works correctly when `app.set('trust proxy', 1)` is configured (see
 * server/index.js) so req.ip is the real client, not the shared Render/Vercel proxy IP.
 * Lightweight endpoints that the frontend polls on a fixed interval (health + version checks,
 * ~2 req/min/tab) are skipped so they never exhaust the bucket.
 */
const POLLED_PATHS = new Set([
  '/api/health',
  '/api/app-version',
]);

const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  // Never rate-limit the high-frequency health/version pollers.
  skip: (req) => POLLED_PATHS.has(req.path) || req.path.endsWith('/version.json'),
  // Skip rate limiting for authenticated users (use their ID as the key)
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Strict rate limiter for login attempts
 * 5 attempts per 15 minutes
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: (req) => {
    // Rate limit by email address if provided, otherwise by IP
    return req.body?.email || req.ip;
  }
});

/**
 * File upload rate limiter
 * 10 uploads per hour per user
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    error: 'Upload limit exceeded. Maximum 10 uploads per hour',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Email sending rate limiter
 * 5 emails per hour per user
 */
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    error: 'Email limit exceeded. Maximum 5 emails per hour',
    code: 'EMAIL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Report email rate limiter
 * 60 report emails per hour per user — report delivery is a core admin function and
 * must NOT share the generic 5/hour email budget (which OTP/welcome/etc. also consume),
 * otherwise sending several patients' reports in one sitting gets throttled to a 429.
 */
const reportEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  message: {
    success: false,
    error: 'Report email limit exceeded. Maximum 60 per hour',
    code: 'REPORT_EMAIL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Payment processing rate limiter
 * 5 payments per hour per user
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    error: 'Payment rate limit exceeded',
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Report generation rate limiter
 * 3 reports per hour per user
 */
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Report generation limit exceeded. Maximum 3 per hour',
    code: 'REPORT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * Password reset rate limiter
 * 3 attempts per hour
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Too many password reset attempts',
    code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || req.ip
});

module.exports = {
  apiLimiter,
  loginLimiter,
  uploadLimiter,
  emailLimiter,
  reportEmailLimiter,
  paymentLimiter,
  reportLimiter,
  passwordResetLimiter
};
