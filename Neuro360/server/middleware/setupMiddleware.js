const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const express = require('express');

const { authMiddleware, optionalAuth } = require('./authMiddleware');
const { requireRole } = require('./rbac');
const { errorHandler, asyncHandler, notFoundHandler } = require('./errorHandler');
const {
  apiLimiter,
  loginLimiter,
  uploadLimiter,
  emailLimiter,
  reportLimiter,
  passwordResetLimiter
} = require('./rateLimiter');

/**
 * Setup all middleware for the Express app
 * @param {Express} app - Express application instance
 * @param {array} allowedOrigins - CORS allowed origins
 */
const setupMiddleware = (app, allowedOrigins) => {
  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https:'],
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS Configuration
  const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (/^https:\/\/limitlessbrainlab[^.]*\.vercel\.app$/.test(origin)) return true;
    if (allowedOrigins.indexOf(origin) !== -1) return true;
    return false;
  };

  // Handle OPTIONS preflight manually — before rate limiter and before cors() package.
  // Direct header-setting avoids any edge cases in the cors npm package callback chain.
  app.options('*', (req, res) => {
    const origin = req.headers.origin || '';
    if (isAllowedOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return res.status(200).end();
    }
    return res.status(403).json({ error: 'Not allowed by CORS' });
  });

  const corsOptions = {
    origin: function (origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  app.use(cors(corsOptions));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // General API rate limiter (applies to all routes)
  app.use(apiLimiter);

  console.log('[Middleware] All security and utility middleware initialized');
};

/**
 * Setup route-specific rate limiters
 * @param {Express} app - Express application instance
 */
const setupRateLimiters = (app) => {
  return {
    loginLimiter,
    uploadLimiter,
    emailLimiter,
    reportLimiter,
    passwordResetLimiter
  };
};

/**
 * Setup auth middleware for protected routes
 */
const protectedRoutes = {
  authRequired: authMiddleware,
  optionalAuth: optionalAuth,
  adminOnly: [authMiddleware, requireRole('admin')],
  clinicOnly: [authMiddleware, requireRole('clinic')],
  patientOnly: [authMiddleware, requireRole('patient')],
  clinicOrAdmin: [authMiddleware, requireRole(['clinic', 'admin'])]
};

/**
 * Setup error handling (must be last)
 */
const setupErrorHandling = (app) => {
  // 404 Not Found handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  console.log('[Middleware] Error handling middleware initialized');
};

module.exports = {
  setupMiddleware,
  setupRateLimiters,
  protectedRoutes,
  setupErrorHandling,
  asyncHandler
};
