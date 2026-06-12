/**
 * Global error handling middleware
 * Catches all unhandled errors and returns standardized error responses
 */

const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('[Error Handler]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  // Never expose raw technical error text to users in production —
  // use a plain-language message instead (raw details stay in the logs above)
  let message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong on the server. Please try again in a few moments.'
    : (err.message || 'An unexpected error occurred');

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Request validation failed';
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Authentication failed';
  }

  if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    message = 'Access denied';
  }

  if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = 'Resource not found';
  }

  if (err.message.includes('ENOENT')) {
    statusCode = 404;
    errorCode = 'FILE_NOT_FOUND';
    message = 'File not found';
  }

  if (err.message.includes('EACCES')) {
    statusCode = 403;
    errorCode = 'PERMISSION_DENIED';
    message = 'Permission denied';
  }

  // Don't expose stack traces in production
  const response = {
    success: false,
    error: message,
    code: errorCode,
    timestamp: new Date().toISOString()
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Async route wrapper to catch async errors
 * @param {function} fn - Async route handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found handler (404)
 */
const notFoundHandler = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.path}`);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  next(err);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler
};
