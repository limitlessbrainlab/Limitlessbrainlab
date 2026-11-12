const crypto = require('node:crypto');
// Calendly signs `${timestamp}.${rawBody}` with the subscription's signing key.
function verifyCalendlySignature(req, res, next) {
  const secret = process.env.CALENDLY_WEBHOOK_SIGNING_KEY || process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ success:false,message:'Calendly webhook signing is not configured' });
  const parts = String(req.headers['calendly-webhook-signature'] || '').split(',').map(value => value.trim());
  const timestamp = parts.find(value => value.startsWith('t='))?.slice(2);
  const signatures = parts.filter(value => value.startsWith('v1=')).map(value => value.slice(3));
  if (!/^\d+$/.test(timestamp || '') || Math.abs(Date.now()/1000 - Number(timestamp)) > 180 || !Buffer.isBuffer(req.rawBody)) {
    return res.status(401).json({ success:false,message:'Invalid Calendly signature' });
  }
  const expected = crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(req.rawBody).digest();
  const valid = signatures.some(signature => /^[a-f0-9]{64}$/i.test(signature) && crypto.timingSafeEqual(expected,Buffer.from(signature,'hex')));
  if (!valid) return res.status(401).json({ success:false,message:'Invalid Calendly signature' });
  next();
}
module.exports = verifyCalendlySignature;
