const crypto = require('crypto');

// Static long-lived token for the Performance Report feature.
//
// No Supabase, no expiry. The frontend sends the token as a Bearer value; the
// backend compares it (timing-safe) against the same value in env.
// Reads PERFORMANCE_REPORT_TOKEN, falling back to the legacy CLAUDE_REPORT_TOKEN
// so existing Render dashboard values keep working during the rename.
const EXPECTED = (process.env.PERFORMANCE_REPORT_TOKEN || process.env.CLAUDE_REPORT_TOKEN || '').trim();

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const sidecarAuth = (req, res, next) => {
  if (!EXPECTED || EXPECTED.length < 16) {
    return res.status(500).json({
      success: false,
      error: 'PERFORMANCE_REPORT_TOKEN is not configured on the server (min 16 chars).',
      code: 'NO_SERVER_TOKEN',
    });
  }
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided', code: 'NO_TOKEN' });
  }
  if (!timingSafeEqualStr(token, EXPECTED)) {
    return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
  req.authVia = 'static-token';
  next();
};

module.exports = { sidecarAuth };
