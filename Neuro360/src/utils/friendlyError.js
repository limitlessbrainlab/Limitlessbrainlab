/**
 * Translates any error (Error object, Supabase error, axios error, fetch
 * Response status, backend `{ message }` string, etc.) into a plain-language
 * message a non-technical user can understand. Never surfaces HTTP status
 * numbers, stack traces, or database/internal jargon.
 *
 * Usage:
 *   toast.error(getFriendlyErrorMessage(error, 'Upload failed. Please try again.'))
 */
export function getFriendlyErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const status =
    error?.response?.status ??
    error?.status ??
    error?.statusCode ??
    null;

  const raw = String(
    (typeof error === 'string' ? error : null) ??
      error?.response?.data?.message ??
      error?.response?.data?.error ??
      error?.message ??
      error?.error_description ??
      error?.error ??
      ''
  );
  const text = raw.toLowerCase();

  // ---- Connectivity ----
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Please check your internet connection and try again.';
  }
  if (
    error?.code === 'ERR_NETWORK' ||
    text.includes('failed to fetch') ||
    text.includes('network error') ||
    text.includes('networkerror') ||
    text.includes('load failed') ||
    text.includes('err_connection') ||
    text.includes('econnrefused')
  ) {
    return 'We are unable to reach the server right now. It may be starting up or temporarily unavailable — please try again in a moment.';
  }
  if (
    error?.code === 'ECONNABORTED' ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    status === 408 ||
    status === 504
  ) {
    return 'The server is taking longer than usual to respond. Please wait a moment and try again.';
  }

  // ---- Common auth messages (keep these specific and helpful) ----
  if (text.includes('invalid login credentials') || text.includes('invalid email or password')) {
    return 'The email or password you entered is incorrect. Please try again.';
  }
  if (text.includes('email not confirmed')) {
    return 'Please verify your email address before logging in. Check your inbox for the confirmation link.';
  }
  if (text.includes('user already registered') || text.includes('already been registered')) {
    return 'An account with this email already exists. Please log in instead.';
  }
  if (text.includes('email rate limit') || text.includes('rate limit') || status === 429) {
    return 'Too many attempts in a short time. Please wait a minute and try again.';
  }
  if (
    text.includes('jwt expired') ||
    text.includes('token expired') ||
    text.includes('session expired') ||
    text.includes('refresh token') ||
    text.includes('invalid token')
  ) {
    return 'Your session has expired. Please log in again to continue.';
  }

  // ---- File / upload problems ----
  if (
    status === 413 ||
    text.includes('payload too large') ||
    text.includes('exceeded the maximum allowed size') ||
    text.includes('file too large')
  ) {
    return 'This file is too large to upload. Please use a smaller file and try again.';
  }
  if (text.includes('bucket') || text.includes('storage')) {
    return 'There was a problem with file storage on the server. Please try again, or contact support if it keeps happening.';
  }

  // ---- Payment problems ----
  if (
    text.includes('razorpay') ||
    text.includes('stripe') ||
    text.includes('payment') ||
    text.includes('checkout')
  ) {
    return 'The payment could not be completed. You have not been charged — please try again or use a different payment method.';
  }

  // ---- Database problems (Supabase / Postgres jargon) ----
  if (text.includes('duplicate key') || text.includes('already exists')) {
    return 'This record already exists in the system, so it was not added again.';
  }
  if (
    text.includes('row-level security') ||
    text.includes('permission denied') ||
    text.includes('violates') ||
    text.includes('foreign key') ||
    text.includes('not-null constraint') ||
    text.includes('pgrst') ||
    text.includes('schema cache') ||
    /relation .* does not exist/.test(text) ||
    /column .* does not exist/.test(text) ||
    text.includes('database') ||
    text.includes('postgres') ||
    text.includes('supabase')
  ) {
    return 'There was a database issue while processing your request. Please try again, or contact support if it keeps happening.';
  }

  // ---- HTTP status based (also catches "HTTP 500" style text) ----
  const statusInText = raw.match(/\b(4\d\d|5\d\d)\b/);
  const effectiveStatus = status ?? (statusInText ? Number(statusInText[1]) : null);
  if (effectiveStatus) {
    if (effectiveStatus === 401 || effectiveStatus === 403) {
      return 'You are not authorized to do this. Your session may have expired — please log in again.';
    }
    if (effectiveStatus === 404) {
      return 'The requested information could not be found. It may have been moved or deleted.';
    }
    if (effectiveStatus >= 500) {
      return 'Something went wrong on the server. Please try again in a few moments.';
    }
    if (effectiveStatus >= 400) {
      return 'The request could not be completed. Please check the information you entered and try again.';
    }
  }

  // Anything else that still looks technical (code-ish tokens, stack traces,
  // long messages) gets replaced with the caller-provided fallback.
  return fallback;
}

export default getFriendlyErrorMessage;
