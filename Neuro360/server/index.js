const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const nodemailer = require('nodemailer');
const compression = require('compression');
const qeegRoutes = require('./routes/qeegRoutes');
const claudeReportRoutes = require('./routes/claudeReportRoutes');
const patientDocumentRoutes = require('./routes/patientDocumentRoutes');
const ssoRoutes = require('./routes/ssoRoutes');
const claudeRoutes = require('./routes/claudeRoutes');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { getReportEmailHtml, getNeuroSenseReportEmailHtml } = require('../shared/reportEmailTemplate.cjs');

// Import middleware
const { setupMiddleware, setupRateLimiters, protectedRoutes, setupErrorHandling, asyncHandler } = require('./middleware/setupMiddleware');
const { authMiddleware, optionalAuth } = require('./middleware/authMiddleware');
const { requireRole, requireOwnership } = require('./middleware/rbac');
const logger = require('./services/logger');

// Initialize Supabase client for server-side operations.
// Routed per-request (prod vs staging by origin) via dbRouter; returns the plain
// prod client when staging env vars are not configured (no behavior change).
const { createRoutedClient } = require('./dbRouter');
const supabase = createRoutedClient();

// Notification de-duplication. Claims a key the first time and returns true (send);
// returns false if the key was already claimed (skip). Backed by the
// sent_notifications table (unique dedupe_key) so it is atomic across both the
// frontend success handler and the Stripe webhook, and across server instances.
// Fail-open: on a missing key or any DB error we send rather than risk dropping
// a real notification.
async function claimNotificationOnce(key) {
  if (!key) return true;
  if (!supabase) return true;
  try {
    const { error } = await supabase.from('sent_notifications').insert({ dedupe_key: key });
    if (!error) return true;                  // first time -> send
    if (error.code === '23505') return false; // duplicate key -> skip
    console.warn('claimNotificationOnce error (sending anyway):', error.message);
    return true;
  } catch (e) {
    console.warn('claimNotificationOnce exception (sending anyway):', e.message);
    return true;
  }
}

// Initialize Stripe (conditionally)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Outbound mail uses Brevo's HTTP API on Render (no blocked SMTP ports).
// Gmail stays as a local fallback and supplies the IMAP credentials used elsewhere.
const brevoConfigured = !!process.env.BREVO_API_KEY;
const brevoSmtpConfigured = !!(process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY);
const gmailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const gmailFallbackConfigured = process.env.NODE_ENV !== 'production' && gmailConfigured;
const productionMailRelayUrl = (process.env.PRODUCTION_MAIL_BACKEND_URL || '').replace(/\/$/, '');
const productionMailRelaySecret = process.env.PRODUCTION_MAIL_RELAY_SECRET || '';
const productionMailRelayConfigured = !!(productionMailRelayUrl && productionMailRelaySecret);

function parseMailAddress(address) {
  if (!address) return null;
  if (typeof address === 'object') {
    const email = address.address || address.email;
    return email ? { ...(address.name ? { name: address.name } : {}), email: String(email).toLowerCase() } : null;
  }
  const value = String(address).trim();
  const match = value.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/);
  return match
    ? { ...(match[1].trim() ? { name: match[1].trim() } : {}), email: match[2].trim().toLowerCase() }
    : { email: value.toLowerCase() };
}

function toMailAddressList(value) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : String(value).split(',');
  return values.map(parseMailAddress).filter(Boolean);
}

function serializeMailAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.reduce((result, attachment) => {
    if (!attachment) return result;
    let content = null;
    if (Buffer.isBuffer(attachment.content)) content = attachment.content;
    else if (typeof attachment.content === 'string') content = Buffer.from(attachment.content);
    else if (attachment.path) {
      try { content = fs.readFileSync(attachment.path); } catch (_) { /* optional attachment */ }
    }
    if (!content) return result;
    result.push({ filename: attachment.filename || attachment.name || 'attachment', content: content.toString('base64'), ...(attachment.cid ? { cid: attachment.cid } : {}), ...(attachment.contentType ? { contentType: attachment.contentType } : {}) });
    return result;
  }, []);
}

// Mail-only staging relay: form data remains in staging, while delivery uses
// the production backend's verified sender and mail provider.
function createProductionMailRelayTransporter() {
  return {
    sendMail(mailOptions, callback) {
      const request = (async () => {
        const payload = { from: mailOptions.from, to: toMailAddressList(mailOptions.to), cc: toMailAddressList(mailOptions.cc), bcc: toMailAddressList(mailOptions.bcc), replyTo: parseMailAddress(mailOptions.replyTo), subject: mailOptions.subject || '(no subject)', html: mailOptions.html || '', text: mailOptions.text || '', headers: mailOptions.headers || {}, attachments: serializeMailAttachments(mailOptions.attachments) };
        if (!payload.to.length && !payload.cc.length && !payload.bcc.length) throw new Error('No recipients defined');
        const response = await fetch(`${productionMailRelayUrl}/api/internal/mail-relay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-production-mail-relay-secret': productionMailRelaySecret }, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Production mail relay error: HTTP ${response.status}`);
        return { accepted: data.accepted || payload.to.map(({ email }) => email), rejected: data.rejected || [], messageId: data.messageId || '', response: '250 2.0.0 Ok (production mail relay)' };
      })();
      if (typeof callback === 'function') request.then((info) => callback(null, info), callback);
      return request;
    },
    verify(callback) { if (typeof callback === 'function') callback(null, true); return Promise.resolve(true); },
  };
}

// Match nodemailer's sendMail(options[, callback]) contract so every existing
// email path can use Brevo without branching or changing its payload.
function createBrevoTransporter(apiKey) {
  return {
    sendMail(mailOptions, callback) {
      const request = (async () => {
        const sender = parseMailAddress(mailOptions.from) || parseMailAddress(process.env.EMAIL_FROM || process.env.EMAIL_USER);
        const to = toMailAddressList(mailOptions.to);
        if (!sender?.email) throw new Error('No sender defined');
        if (to.length === 0) throw new Error('No recipients defined');

        const payload = {
          sender,
          to,
          subject: mailOptions.subject || '(no subject)',
          htmlContent: mailOptions.html || '',
        };
        if (mailOptions.text) payload.textContent = mailOptions.text;
        const cc = toMailAddressList(mailOptions.cc); if (cc.length) payload.cc = cc;
        const bcc = toMailAddressList(mailOptions.bcc); if (bcc.length) payload.bcc = bcc;
        const replyTo = parseMailAddress(mailOptions.replyTo); if (replyTo) payload.replyTo = replyTo;
        if (mailOptions.headers) payload.headers = mailOptions.headers;

        if (Array.isArray(mailOptions.attachments) && mailOptions.attachments.length) {
          const attachments = [];
          for (const attachment of mailOptions.attachments) {
            let content = null;
            if (Buffer.isBuffer(attachment.content)) content = attachment.content;
            else if (typeof attachment.content === 'string') content = Buffer.from(attachment.content);
            else if (attachment.path) {
              try { content = fs.readFileSync(attachment.path); } catch (_) { /* skip missing optional attachment */ }
            }
            if (content) {
              const item = { name: attachment.filename || attachment.name || 'attachment', content: content.toString('base64') };
              if (attachment.cid) item.content_id = attachment.cid;
              attachments.push(item);
            }
          }
          if (attachments.length) payload.attachment = attachments;
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Brevo API error: HTTP ${response.status}`);
        return { accepted: to.map(({ email }) => email), rejected: [], messageId: data.messageId || '', response: '250 2.0.0 Ok (Brevo API)' };
      })();

      if (typeof callback === 'function') request.then((info) => callback(null, info), callback);
      return request;
    },
    verify(callback) { callback(null, true); },
  };
}

const activeTransporter = (() => {
  if (productionMailRelayConfigured && process.env.MAIL_TRANSPORT === 'production') return createProductionMailRelayTransporter();
  if (brevoConfigured) return createBrevoTransporter(process.env.BREVO_API_KEY);
  if (brevoSmtpConfigured) {
    return nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: Number(process.env.BREVO_SMTP_PORT) || 2525,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_KEY
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000
    });
  }
  if (gmailFallbackConfigured) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000
    });
  }

  return null;
})();

const emailTransporter = activeTransporter;
const mailerConfigured = productionMailRelayConfigured || brevoConfigured || brevoSmtpConfigured || gmailFallbackConfigured;
const ACTIVE_MAIL_PROVIDER = productionMailRelayConfigured && process.env.MAIL_TRANSPORT === 'production'
  ? 'production-relay'
  : (brevoConfigured
    ? 'brevo-api'
    : (brevoSmtpConfigured ? 'brevo-smtp' : (gmailFallbackConfigured ? 'gmail' : 'none')));

// Deliverability: HTML-only mail scores worse with spam filters, so derive a
// plain-text alternative for every outbound mail, and set Reply-To so replies
// to the noreply sender still reach a monitored inbox.
const htmlToPlainText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Shared brand footer attached to EVERY outgoing email (signature, academy link, WhatsApp, socials).
// The marker comment `lbl-email-footer` makes injection idempotent.
function getEmailFooterContentHtml() {
  const sig = fs.existsSync(SIGNATURE_PATH)
    ? `<img src="cid:${SIGNATURE_CID}" alt="Dr Sweta Adatia" width="190" style="display:block; width:190px; max-width:60%; height:auto; margin:8px 0 16px;" />`
    : '';
  return `
              <!-- lbl-email-footer -->
              <p style="margin:0; color:#1a1f36; font-size:15px; font-weight:700; line-height:1.5;">Team<br/>Limitless Brain Lab</p>
              <p style="margin:14px 0 0; color:#555; font-size:14px; font-style:italic;">&ldquo;A healthy brain is the foundation of a limitless life.&rdquo;</p>
              ${sig}
              <p style="margin:0 0 16px; color:#323956; font-size:14px;">Access all the brain health courses &nbsp;<a href="https://www.limitlessbrainacademy.com" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">www.limitlessbrainacademy.com</a></p>
              <p style="margin:0 0 12px; color:#323956; font-size:14px;">&#128222; &nbsp;WhatsApp: <a href="https://api.whatsapp.com/send?phone=919769696534&text=%F0%9F%98%8A" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">+91 9769696534</a></p>
              <p style="margin:0 0 10px; color:#323956; font-size:14px;">Social Media:</p>
              <!-- Text links (no remote images) keep the footer out of spam filters and render even when images are blocked. -->
              <p style="margin:0; color:#323956; font-size:14px; line-height:1.8;">
                <a href="https://www.instagram.com/drsweta.adatia/?hl=en" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">Instagram</a> &nbsp;&#183;&nbsp;
                <a href="https://www.facebook.com/sweta.adatia" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">Facebook</a> &nbsp;&#183;&nbsp;
                <a href="https://www.linkedin.com/in/drswetaadatia/" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">LinkedIn</a> &nbsp;&#183;&nbsp;
                <a href="https://www.youtube.com/@drsweta.adatia" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">YouTube (English)</a> &nbsp;&#183;&nbsp;
                <a href="https://www.youtube.com/@drsweta.adatiahindi" target="_blank" style="color:#1e63b4; font-weight:600; text-decoration:none;">YouTube (Hindi)</a>
              </p>`;
}

// Standalone footer card — used only as the last-resort fallback when the email
// HTML has no recognizable card to attach the footer to.
function getEmailFooterHtml() {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa; padding:0 20px 40px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="padding:28px 32px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${getEmailFooterContentHtml()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// Attach the brand footer INSIDE the email's main card so it reads as one
// continuous template, not a separate floating block below it.
function attachEmailFooter(html) {
  const content = getEmailFooterContentHtml();
  // Most templates end their card with a thin grey contact strip
  // ("Limitlessbrainlab.com | info@..."): background #f8f9fc/#f8fafc + border-top.
  // The footer must go ABOVE that strip so the strip stays the card's bottom bar —
  // footer-after-strip reads as two separate emails. The tempered middles
  // ((?!<tr)/(?!<div)) keep the match to that single trailing element.

  // Full-page table templates: page wrapper table -> width=600 card table.
  const tableTail = /(<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/body>)/i;
  if (tableTail.test(html)) {
    const row = `\n          <tr>\n            <td style="padding:28px 32px; background:#ffffff; border-top:1px solid #e5e7eb; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${content}\n            </td>\n          </tr>\n        `;
    const stripRowTail = /(<tr>\s*<td(?=[^>]*background:\s*#f8(?:f9fc|fafc))(?=[^>]*border-top)[^>]*>(?:(?!<\/?tr)[\s\S])*?<\/td>\s*<\/tr>)(\s*<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/body>)/i;
    if (stripRowTail.test(html)) return html.replace(stripRowTail, `${row}$1$2`);
    return html.replace(tableTail, `${row}$1`);
  }
  // Div-card templates inside a <body>: the last </div> before </body> closes the card.
  const divTail = /(<\/div>\s*<\/body>)/i;
  if (divTail.test(html)) {
    const section = `\n<div style="padding:28px 32px; background:#ffffff; border-top:1px solid #e5e7eb; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${content}\n</div>\n`;
    const stripDivTail = /(<div(?=[^>]*background:\s*#f8(?:f9fc|fafc))(?=[^>]*border-top)[^>]*>(?:(?!<div)[\s\S])*?<\/div>)(\s*<\/div>\s*<\/body>)/i;
    if (stripDivTail.test(html)) return html.replace(stripDivTail, `${section}$1$2`);
    return html.replace(divTail, `${section}$1`);
  }
  // Bare div-card templates (no <body>): put the footer above a trailing strip
  // when one exists, else move the card's bottom rounding onto the footer and
  // sit flush underneath it so the two read as one card.
  if (!/<\/body>/i.test(html)) {
    const stripDivEnd = /(<div(?=[^>]*background:\s*#f8(?:f9fc|fafc))(?=[^>]*border-top)[^>]*>(?:(?!<div)[\s\S])*?<\/div>)(\s*<\/div>\s*)$/i;
    if (stripDivEnd.test(html)) {
      const section = `\n<div style="padding:28px 32px; background:#ffffff; border-top:1px solid #e5e7eb; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${content}\n</div>\n`;
      return html.replace(stripDivEnd, `${section}$1$2`);
    }
    const unrounded = html.replace(/border-radius:\s*0\s+0\s+12px\s+12px/gi, 'border-radius: 0');
    return `${unrounded}\n<div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:0 0 12px 12px; padding:28px 32px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${content}\n</div>`;
  }
  // Unrecognized structure with a <body>: standalone footer card before </body>.
  return html.replace('</body>', `${getEmailFooterHtml()}\n</body>`);
}

// Enhance every outgoing email: append the brand footer (once), ensure the signature
// attachment the footer references is present, and keep the existing plain-text + reply-to behaviour.
function enhanceMailOptions(mailOptions) {
  const enhanced = { ...mailOptions };
  // Every outbound message uses the verified production sender. Individual
  // templates may provide a legacy `from` value, but it must never bypass the
  // shared Brevo sender used by report and payment emails.
  enhanced.from = EMAIL_FROM;
  if (enhanced.html && !enhanced.html.includes('lbl-email-footer')) {
    enhanced.html = attachEmailFooter(enhanced.html);
    if (fs.existsSync(SIGNATURE_PATH)) {
      const atts = Array.isArray(enhanced.attachments) ? [...enhanced.attachments] : [];
      if (!atts.some(a => a && a.cid === SIGNATURE_CID)) {
        atts.push({ filename: 'signature.png', path: SIGNATURE_PATH, cid: SIGNATURE_CID });
      }
      enhanced.attachments = atts;
    }
  }
  if (enhanced.html && !enhanced.text) {
    enhanced.text = htmlToPlainText(enhanced.html);
  }
  if (!enhanced.replyTo && process.env.EMAIL_REPLY_TO) {
    enhanced.replyTo = process.env.EMAIL_REPLY_TO;
  }
  // Ensure a display name on the From header. A few flows set `from` to a bare address
  // (invoice/renewal/payment-failed, or a clinic's own SMTP sender). A missing display name
  // weakens the brand/trust signal that spam filters look at. Wrap bare addresses; leave
  // already-named ("Name" <addr>) values untouched.
  if (enhanced.from && typeof enhanced.from === 'string' && !enhanced.from.includes('<')) {
    enhanced.from = `"Limitless Brain Lab" <${enhanced.from.trim()}>`;
  }
  // Add List-Unsubscribe to every message. Gmail/Outlook reward its presence with better
  // inbox placement. Idempotent: the report/OTP flows that already set it are left as-is.
  // (mailto form only — a one-click POST header would require a live https endpoint.)
  if (!enhanced.headers || (!enhanced.headers['List-Unsubscribe'] && !enhanced.headers['list-unsubscribe'])) {
    const unsubAddr = process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || 'info@limitlessbrainlab.com';
    enhanced.headers = { ...(enhanced.headers || {}), 'List-Unsubscribe': `<mailto:${unsubAddr}?subject=unsubscribe>` };
  }
  return enhanced;
}

// Patch any nodemailer transporter so every email it sends gets the shared footer/enhancements.
function patchSendMail(t) {
  const raw = t.sendMail.bind(t);
  t.sendMail = async (opts, ...rest) => {
    const enhanced = enhanceMailOptions(opts);
    return raw(enhanced, ...rest);
  };
  return t;
}
if (emailTransporter) {
  patchSendMail(emailTransporter);
}

if (emailTransporter) {
  emailTransporter.verify((error, success) => {
    if (error) {
      console.error('EMAIL TRANSPORTER ERROR:', error.message);
      console.error('Active provider:', ACTIVE_MAIL_PROVIDER);
      if (ACTIVE_MAIL_PROVIDER === 'gmail') console.error('Set BREVO_API_KEY or Brevo SMTP relay credentials on Render; Gmail SMTP ports are blocked there.');
      console.error('EMAIL_USER:', process.env.EMAIL_USER);
      console.error('EMAIL_PASS length:', (process.env.EMAIL_PASS || '').length);
      console.error('EMAIL_PASS has spaces:', (process.env.EMAIL_PASS || '').includes(' '));
    } else {
      console.log(`Email transporter ready - connected via ${ACTIVE_MAIL_PROVIDER}`);
    }
  });
} else {
  console.warn('Email transporter not configured. Set BREVO_API_KEY or Brevo SMTP relay credentials on Render.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Trust the first proxy hop (Render's load balancer / Vercel edge) so req.ip resolves to the
// real client IP instead of the shared upstream proxy IP. Without this, express-rate-limit keys
// every unauthenticated request into a single global bucket → the whole app gets 429'd. Use a
// specific hop count (1), not `true`, to satisfy express-rate-limit's proxy validation.
app.set('trust proxy', 1);

// Per-deploy backend version — changes whenever the deployed commit changes. The frontend
// polls /api/app-version and forces logout + reload when this changes since the user's
// session started.
const DEPLOY_SIGNATURE = process.env.DEPLOY_SIGNATURE ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  process.env.COMMIT_SHA ||
  `local-${Date.now()}`;
const SERVER_VERSION = DEPLOY_SIGNATURE;

// Outbound email "From" address (all emails to users/patients/clinics)
const EMAIL_FROM = `"Limitless Brain Lab" <${process.env.EMAIL_FROM || 'info@limitlessbrainlab.com'}>`;

// Internal audit copy: specific credential + report emails are CC'd here (visible to
// the recipient — deliberately CC, not BCC) so the business keeps a record of every
// login/credential/report mail sent to clinics, partners, and patients.
// Applied per-template (not globally) — see plan.
const INTERNAL_COPY_EMAIL = process.env.INTERNAL_COPY_EMAIL || 'limitlessbrainlab@gmail.com';

// Canonical STAGING URL for user-facing navigation/login links in emails.
// Hardcoded on purpose so login/dashboard CTAs and assessment take-links always
// land on the staging frontend, never production (limitlessbrainlab.com) or a
// stale *.vercel.app deployment, independent of which backend sends the mail.
// (Stripe success_url/cancel_url still use FRONTEND_URL — that is intentional.)
const APP_URL = 'https://limitlessbrainlab-eight.vercel.app';

// Standard grey contact strip — the bottom bar of every email card. attachEmailFooter
// detects this strip (background:#f8fafc + border-top) and welds the brand footer directly
// ABOVE it, so body + footer + strip read as one continuous card. Templates that end with
// this strip render integrated; bare fragments without it fall through to a detached
// floating footer. Keep it as the LAST inner element, containing only <p> (no nested <div>),
// so the stripDivEnd/stripRowTail matchers in attachEmailFooter can find it.
const CONTACT_STRIP_HTML = `<div style="background:#f8fafc; padding:16px 30px; text-align:center; border-top:1px solid #e5e7eb;">
            <p style="color:#94a3b8; margin:0; font-size:11px;">limitlessbrainlab-eight.vercel.app &nbsp;|&nbsp; info@limitlessbrainlab.com</p>
          </div>`;

// Escape user-supplied values before interpolating into email HTML. Without this,
// a typed password containing < > & or " renders corrupted in the mail client
// (e.g. "Br@in<Lab>2026" shows as "Br@in2026"), so the recipient copies the wrong
// password and login fails with "Invalid email or password".
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Consistent "date + time" formatter for email templates → e.g. "22 June 2026, 02:51 PM" (IST).
const fmtDateTime = (d = new Date()) => {
  const dt = d ? new Date(d) : new Date();
  const safe = isNaN(dt.getTime()) ? new Date() : dt;
  return safe.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

// Logo path for email attachments
const LOGO_PATH = path.join(__dirname, '..', 'public', 'IBW Logo.png');
const LOGO_CID = 'company-logo';

// Signature image path for email
const SIGNATURE_PATH = path.join(__dirname, '..', 'public', 'signatureemail.png');
const SIGNATURE_CID = 'email-signature';

// Helper: build attachments array only with files that exist (prevents email failure)
const getLogoAttachment = () => {
  if (fs.existsSync(LOGO_PATH)) {
    return [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }];
  }
  console.warn('Logo file not found:', LOGO_PATH);
  return [];
};
const getFullAttachments = () => {
  const attachments = [];
  if (fs.existsSync(LOGO_PATH)) {
    attachments.push({ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID });
  } else {
    console.warn('Logo file not found:', LOGO_PATH);
  }
  if (fs.existsSync(SIGNATURE_PATH)) {
    attachments.push({ filename: 'signature.png', path: SIGNATURE_PATH, cid: SIGNATURE_CID });
  } else {
    console.warn('Signature file not found:', SIGNATURE_PATH);
  }
  return attachments;
};

// Build a standard clinic/partner notification email (card layout, NEVER contains a password).
// Used to keep the clinic/partner informed about patient-account events. Returns mailOptions.
const buildClinicNotificationEmail = ({ to, subject, heading, subheading, greetingName, intro, rows = [], footerNote }) => {
  const accent = ['#3b82f6', '#10b981', '#F5D05D', '#8b5cf6'];
  const rowsHtml = rows.map((r, i) => `
    <div style="background:white;border-radius:8px;padding:12px 15px;margin-bottom:10px;border-left:4px solid ${accent[i % accent.length]};">
      <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">${r.label}</p>
      <p style="color:#323956;margin:4px 0 0;font-size:15px;font-weight:600;">${r.value}</p>
    </div>`).join('');
  return {
    from: EMAIL_FROM,
    to,
    // logo + Dr. Sweta signature so the brand footer's images resolve regardless of transport.
    attachments: getFullAttachments(),
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:20px;font-family:Arial,sans-serif;background-color:#f4f7fa;">
        <div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:25px;text-align:center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:10px;" />
            <h1 style="color:white;margin:0;font-size:24px;">${heading}</h1>
            <p style="color:#F5D05D;margin:8px 0 0;font-size:14px;">${subheading}</p>
          </div>
          <div style="padding:30px;">
            <p style="color:#333;font-size:16px;margin:0 0 20px;">Hello <strong>${greetingName || 'there'}</strong>,</p>
            <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 20px;">${intro}</p>
            ${rows.length ? `<div style="background:#f8f9fc;border-radius:10px;padding:20px;margin:20px 0;">${rowsHtml}</div>` : ''}
            ${footerNote ? `<p style="color:#999;font-size:12px;line-height:1.6;margin:0;">${footerNote}</p>` : ''}
          </div>
          <div style="padding:28px 32px;border-top:1px solid #e5e7eb;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">${getEmailFooterContentHtml()}
          </div>
          <div style="background:#f8f9fc;padding:15px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#888;margin:0;font-size:11px;">© ${new Date().getFullYear()} Limitless Brain Lab | Brain &amp; Mental Wellness</p>
          </div>
        </div>
      </body>
      </html>`
  };
};

// Reusable admin notification email template
const getAdminNotificationHtml = (formTitle, dataRows) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">${formTitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="color: #323956; font-size: 15px; margin: 0 0 20px;">Dear <strong>LBL Admin</strong>,</p>
              <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">A new <strong>${formTitle.toLowerCase()}</strong> has been received. Below are the details:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin: 0 0 20px;">
                <tr style="background: #f8f9fc;">
                  <td style="padding: 10px 16px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 1px solid #e5e7eb;" colspan="2">Submitted Details</td>
                </tr>
                ${dataRows.map((row, i) => `
                <tr>
                  <td style="padding: 10px 16px; font-size: 13px; color: #888; ${i < dataRows.length - 1 ? 'border-bottom: 1px solid #f0f0f0;' : ''} width: 160px;">${row.label}</td>
                  <td style="padding: 10px 16px; font-size: 14px; color: #323956; font-weight: 500; ${i < dataRows.length - 1 ? 'border-bottom: 1px solid #f0f0f0;' : ''}">${row.value || 'Not provided'}</td>
                </tr>`).join('')}
              </table>
              <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">Please login to your portal to review and approve.</p>
              <div style="text-align: center; margin: 0 0 24px;">
                <a href="${APP_URL}/admin/login" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 36px; border-radius: 8px; font-weight: 600; font-size: 15px;">Login to Portal →</a>
              </div>
              <p style="color: #555; font-size: 14px; margin: 0 0 4px;">Best regards,</p>
              <p style="color: #323956; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Support Team,</p>
              <p style="color: #323956; font-size: 14px; margin: 0;">limitlessbrainlab-eight.vercel.app</p>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #aaa; margin: 0; font-size: 11px;">${new Date().toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Reusable user confirmation email template (Academy-aligned, clean)
const getUserConfirmationHtml = (userName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 30px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 14px 0 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Health, Wealth &amp; Happiness for All</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px 24px;">
              <h2 style="color: #323956; margin: 0 0 20px; font-size: 20px; font-weight: 600;">Dear ${userName},</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 18px;">
                Greetings from <strong style="color: #323956;">Limitless Brain Lab</strong>!<br>
                Thank you for reaching out. We have successfully received your submission and our team will get in touch with you within <strong style="color: #323956;">two working days</strong>.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 24px;">
                We look forward to connecting with you soon!
              </p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0;">Team Limitless Brain Lab</p>
            </td>
          </tr>

          <!-- Brain Academy CTA -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); border-radius: 12px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="color: #F5D05D; margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Access all brain health courses</p>
                    <a href="https://www.limitlessbrainacademy.com" target="_blank" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; margin-bottom: 12px;">www.limitlessbrainacademy.com</a>
                    <br>
                    <a href="https://www.limitlessbrainacademy.com" target="_blank" style="display: inline-block; background: #F5D05D; color: #323956; text-decoration: none; padding: 10px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-top: 4px;">Visit Academy</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #aaa; margin: 0; font-size: 11px;">limitlessbrainlab-eight.vercel.app &nbsp;|&nbsp; info@limitlessbrainlab.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Post-purchase "your assessment is ready" email. Used by BOTH the Stripe
// webhook assessment branch and /api/stripe/verify-session (they share the
// `assessment:{sessionId}:emails` dedupe key, so whichever runs first must
// send this same email — never the generic confirmation with the Academy CTA).
// JotForm URL → display name, used to label per-assessment buttons in bundle emails
const ASSESSMENT_NAMES = {
  'https://form.jotform.com/233250136675151': 'Brain Fitness Score',
  'https://form.jotform.com/260117244562148': 'Brain Burnout Score',
  'https://form.jotform.com/252245065792056': 'Neuro Age Estimator',
  'https://form.jotform.com/260034749079159': 'Dementia Probability Index'
};

const getAssessmentReadyEmailHtml = ({ customerName, assessmentName, amountLabel, orderId, link }) => {
  // Normally `link` is the single one-time gate URL (bundles included — the gate
  // page lists the parts). Only the raw-link fallback can be a comma-joined
  // bundle string; render one button per link so none of them break.
  const links = String(link || '').split(',').map(l => l.trim()).filter(Boolean);
  const linkButtonsHtml = links.length <= 1 ? `
                          <tr>
                            <td style="padding: 0 32px 8px;" align="center">
                              <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px;">
                                Take Your Assessment Now
                              </a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 32px 24px; text-align: center;">
                              <p style="color: #999; font-size: 12px; margin: 0;">
                                Or copy this link: <a href="${link}" style="color: #4A6FA5;">${link}</a><br>
                                This link is for one-time use &mdash; it expires once the assessment is completed.
                              </p>
                            </td>
                          </tr>` : `
                          <tr>
                            <td style="padding: 0 32px 24px;">
                              <h3 style="color: #323956; margin: 0 0 16px; font-size: 16px; text-align: center;">Your Assessment Links</h3>
                              ${links.map((l, i) => `
                              <div style="margin-bottom: 12px; text-align: center;">
                                <a href="${l}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                                  ${ASSESSMENT_NAMES[l] || 'Assessment ' + (i + 1)}
                                </a>
                              </div>`).join('')}
                            </td>
                          </tr>`;
  return `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                    <tr>
                      <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                          <!-- Header -->
                          <tr>
                            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
                              <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                              <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                                ASSESSMENT ACCESS
                              </p>
                            </td>
                          </tr>

                          <!-- Success Message -->
                          <tr>
                            <td style="padding: 32px 32px 16px; text-align: center;">
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                  <td align="center" style="text-align: center;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 20px;">
                                      <tr>
                                        <td width="80" height="80" align="center" valign="middle" style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 40px; line-height: 1; color: #ffffff;">&#10003;</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                              <h2 style="color: #323956; margin: 0 0 8px; font-size: 24px;">Payment Successful!</h2>
                              <p style="color: #666; margin: 0; font-size: 15px;">
                                ${customerName ? `Hi ${customerName},` : 'Hi,'} you purchased <strong>${assessmentName}</strong> &mdash; it is now ready to take.
                              </p>
                            </td>
                          </tr>

                          <!-- Order Details -->
                          <tr>
                            <td style="padding: 0 32px 24px;">
                              <div style="background: #f8f9fc; border-radius: 12px; padding: 20px;">
                                <h3 style="color: #323956; margin: 0 0 16px; font-size: 16px;">Order Details</h3>
                                <table width="100%">
                                  <tr>
                                    <td style="padding: 8px 0; color: #666;">Assessment:</td>
                                    <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${assessmentName}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0; color: #666;">Amount Paid:</td>
                                    <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${amountLabel}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0; color: #666;">Date &amp; Time:</td>
                                    <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0; color: #666;">Order ID:</td>
                                    <td style="padding: 8px 0; color: #666; font-size: 12px; text-align: right;">${orderId}</td>
                                  </tr>
                                </table>
                              </div>
                            </td>
                          </tr>

                          <!-- Assessment Link Button — normally the one-time gate URL
                               (for bundles the gate page lists the individual parts) -->
${linkButtonsHtml}

                          <!-- Footer -->
                          <tr>
                            <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                              <p style="color: #888; margin: 0; font-size: 12px; text-align: center;">
                                Thank you for choosing Limitless Brain Lab! If you have any questions, contact us at info@limitlessbrainlab.com
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
              `;
};

const getReportReceivedHtml = (patientName, clinicName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 30px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 14px 0 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Health, Wealth &amp; Happiness for All</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px 24px;">
              <h2 style="color: #323956; margin: 0 0 20px; font-size: 20px; font-weight: 600;">Dear ${patientName || 'Patient'},</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 18px;">
                We have successfully received your report${clinicName ? ` from <strong style="color: #323956;">${clinicName}</strong>` : ''}, and our analysis has now started.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 24px;">
                You will be notified by email as soon as your report is ready. No action is needed from your side right now.
              </p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0;">Team Limitless Brain Lab</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #aaa; margin: 0; font-size: 11px;">limitlessbrainlab-eight.vercel.app &nbsp;|&nbsp; info@limitlessbrainlab.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getProtectMyBrainEmailHtml = (userName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 30px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 14px 0 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Health, Wealth &amp; Happiness for All</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px 8px;">
              <h2 style="color: #323956; margin: 0 0 20px; font-size: 20px; font-weight: 600;">Dear ${userName},</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                Thank you for choosing the <strong style="color: #323956;">Protect My Brain Package</strong> from Limitless Brain Lab. We are pleased to support you on your journey toward enhanced brain health and cognitive well-being.
              </p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0 0 16px;">Your package includes the following components:</p>

              <!-- Package Items -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 10px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">1. Digital Brain Assessment</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">A comprehensive online evaluation designed to assess your attention, focus, memory, and cognitive performance. This assessment can be completed at your convenience.</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">2. Lifestyle Questionnaire</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">You will receive a detailed lifestyle questionnaire separately. This will help us better understand factors such as your sleep patterns, nutrition, stress levels, daily routines, and overall well-being.</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">3. NeuroSense Brain Scan</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">An advanced brain health assessment that provides deeper insights into your brain function and cognitive wellness.</p>
                  </td>
                </tr>
              </table>

              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                To help you understand the process and outcomes, we have attached sample reports for your reference.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 20px;">
                Once all assessments have been completed, one of our <strong style="color: #323956;">NeuroSense Coaches</strong> will conduct a personalized consultation session to review your results. Based on these findings, you will receive a detailed action plan tailored to your specific needs, goals, and brain health profile.
              </p>

              <!-- Package Fee -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center;">
                    <p style="color: #F5D05D; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Package Fee</p>
                    <p style="color: #ffffff; margin: 6px 0 0; font-size: 22px; font-weight: 700;">INR 15,500</p>
                  </td>
                </tr>
              </table>

              <!-- Bank Details -->
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0 0 12px;">Bank Details</p>
              <table width="100%" cellpadding="0" cellspacing="4" style="background: #f8f9fc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Account Name</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_ACCOUNT_NAME || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Account Number</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_ACCOUNT_NUMBER || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Bank Name</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_NAME || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Bank Address</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_ADDRESS || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">IFSC Code</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_IFSC_CODE || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">MICR Code</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_MICR_CODE || ''}</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Customer ID</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">${process.env.BANK_CUSTOMER_ID || ''}</td></tr>
              </table>

              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                Should you have any questions or require any assistance during the process, please feel free to reach out to our team.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 8px;">
                We look forward to supporting you on your brain health journey.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 4px;">Warm regards,</p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0 0 32px;">Team Limitless Brain Lab</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #aaa; margin: 0; font-size: 11px;">limitlessbrainlab-eight.vercel.app &nbsp;|&nbsp; info@limitlessbrainlab.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const getTreatMyBrainEmailHtml = (userName) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 30px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 14px 0 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Health, Wealth &amp; Happiness for All</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 32px 8px;">
              <h2 style="color: #323956; margin: 0 0 20px; font-size: 20px; font-weight: 600;">Dear ${userName},</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                Thank you for choosing the <strong style="color: #323956;">Treat My Brain</strong> package. We're delighted to support you on your journey toward better brain health. Here's an overview of what your program includes and what happens next.
              </p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0 0 16px;">Your package covers:</p>

              <!-- Package Items -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">1. Digital Brain Assessment</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">A comprehensive evaluation of your attention and cognition, completed online at your convenience.</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">2. Lifestyle Questionnaire</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">This will be sent to you separately to help us understand your daily habits, sleep, nutrition, stress, and overall wellbeing.</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">3. NeuroSense Brain Scan</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">An in-depth scan that gives us deeper insight into your brain health.</p>
                  </td>
                </tr>
                <tr><td style="height: 10px;"></td></tr>
                <tr>
                  <td style="background: #f8f9fc; border-left: 4px solid #F5D05D; border-radius: 0 8px 8px 0; padding: 14px 16px; display: block;">
                    <p style="color: #323956; font-size: 14px; font-weight: 700; margin: 0 0 6px;">4. Neurologist Consultation</p>
                    <p style="color: #666; font-size: 13px; line-height: 1.7; margin: 0;">You will have a dedicated consultation with our neurologist to review your results and discuss your brain health in detail.</p>
                  </td>
                </tr>
              </table>

              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                To give you a sense of what to expect, we've attached two sample reports for your reference: a <strong style="color: #323956;">NeuroSense sample report</strong> and a <strong style="color: #323956;">cognition report sample</strong>.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 20px;">
                Once all the above are completed, we will conduct a <strong style="color: #323956;">personalised coaching session</strong> with you, followed by a detailed plan tailored to your results and goals.
              </p>

              <!-- Package Fee -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; text-align: center;">
                    <p style="color: #F5D05D; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Payment Due</p>
                    <p style="color: #ffffff; margin: 6px 0 0; font-size: 22px; font-weight: 700;">INR 10,500</p>
                  </td>
                </tr>
              </table>

              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">
                If you have any questions or would like help getting started, please don't hesitate to reach out. We look forward to working with you.
              </p>
              <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0 0 4px;">Warm regards,</p>
              <p style="color: #323956; font-size: 15px; font-weight: 700; margin: 0 0 32px;">Team Limitless Brain Lab</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #aaa; margin: 0; font-size: 11px;">limitlessbrainlab-eight.vercel.app &nbsp;|&nbsp; info@limitlessbrainlab.com</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ===== MIDDLEWARE SETUP =====
// Allow multiple origins (development + production)
const allowedOrigins = [
  'http://localhost:3000',      // Local dev - Vite primary
  'http://localhost:3001',      // Local dev - Vite alternate
  'http://localhost:3002',      // Local dev - Vite alternate
  'http://localhost:5173',      // Local dev - Vite default
  // Production origins removed on staging — this deployment only serves the staging frontend.
  'https://neurosense360.site', // Legacy
  'https://www.neurosense360.site', // Legacy with www
  'http://neurosense360.site',  // Legacy HTTP
  'http://www.neurosense360.site', // Legacy HTTP with www
  'https://limitlessbrainlab-eight.vercel.app', // Staging
...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

// ===== STRIPE CHECKOUT BRANDING =====
// Single source of truth for the look of every Stripe Checkout page, so the
// assessment / credits / frequencies / meditations / coaching / subscription
// flows cannot drift apart again.
const CHECKOUT_LOGO_PATH = '/LBL-Circular-Logo.png';

// Resolve the asset host from the origin the payment actually started on, validated
// against allowedOrigins so Stripe is never pointed at an attacker-supplied host.
// Falls back to FRONTEND_URL. Nothing is hardcoded, so staging and production each
// serve their own copy of the logo.
function resolveCheckoutBase(req) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) return origin;
  return process.env.FRONTEND_URL || '';
}

// Omit `images` entirely when no base resolves — Stripe rejects a relative URL, and a
// missing logo is better than a failed checkout session.
function checkoutProductImages(req) {
  const base = resolveCheckoutBase(req);
  return base ? [`${base}${CHECKOUT_LOGO_PATH}`] : [];
}

// Card + Link (Apple Pay rides on 'card'), prefilled email, cardholder name, country.
// No phone number and no forced billing address — keeps every checkout page to the
// same approved shape.
const CHECKOUT_UI = Object.freeze({
  payment_method_types: ['card', 'link'],
  billing_address_collection: 'auto',
  customer_creation: 'always', // invisible on the form; lets Link reuse saved cards
});

// Setup all security and utility middleware
setupMiddleware(app, allowedOrigins);

// Setup rate limiters
const rateLimiters = setupRateLimiters();

// Body parsing middleware (skip for Stripe webhook which needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe-webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  next();
});

// Wire route-specific rate limiters (previously defined but never applied).
// Placed after body parsing so email-keyed limiters can read req.body.
app.use([
  '/api/send-otp', '/api/verify-otp', '/api/send-password-email',
  '/api/send-welcome-email', '/api/send-assessment-email',
  '/api/send-no-credit-email', '/api/send-partner-welcome-email', '/api/send-partner-email-update',
  '/api/notifications/send', '/api/check-email-exists', '/api/wallet/invoice-email'
], rateLimiters.emailLimiter);
// Report emails get a dedicated, higher limit — sending several patients' reports in one
// sitting must not be throttled by the generic 5/hour email budget (OTP/welcome/etc.).
app.use(['/api/send-report-email'], rateLimiters.reportEmailLimiter);
app.use(['/api/send-password-email'], rateLimiters.passwordResetLimiter);
app.use([
  '/api/create-frequency-checkout', '/api/create-meditation-checkout', '/api/create-report-checkout',
  '/api/create-coaching-checkout', '/api/create-assessment-checkout',
  '/api/coaching-credits/grant', '/api/coaching-credits/use'
], rateLimiters.paymentLimiter);

// Custom route to serve PDFs with download headers
app.get('/uploads/:filename', (req, res) => {
  // Prevent path traversal: collapse any directory components and confine to uploads/
  const filename = path.basename(req.params.filename);
  const uploadsDir = path.join(__dirname, 'uploads');
  const filePath = path.join(uploadsDir, filename);
  if (filePath !== path.join(uploadsDir, path.basename(filePath)) ||
      !path.resolve(filePath).startsWith(path.resolve(uploadsDir) + path.sep)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set headers to force download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Send file
  res.sendFile(filePath);
});

// ===== PUBLIC ROUTES (No Auth Required) =====

// Fix double-/api prefix from stale frontend builds: /api/api/send-report-email → /api/send-report-email
// Handles ALL routes so users with cached old JS don't get 404s after a deploy.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mailProvider: ACTIVE_MAIL_PROVIDER,
    mailConfigured: !!emailTransporter,
    mailSender: EMAIL_FROM
  });
});

// Mail-only relay used by staging. It never writes production form/database data.
app.post('/api/internal/mail-relay', async (req, res) => {
  if (!productionMailRelaySecret || req.get('x-production-mail-relay-secret') !== productionMailRelaySecret) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { to, cc, bcc, subject, html, text, replyTo, headers, attachments } = req.body || {};
  if ((!Array.isArray(to) || !to.length) && (!Array.isArray(cc) || !cc.length) && (!Array.isArray(bcc) || !bcc.length)) {
    return res.status(400).json({ success: false, message: 'At least one recipient is required' });
  }
  if (!subject || (!html && !text)) return res.status(400).json({ success: false, message: 'Subject and message content are required' });
  if (!emailTransporter) return res.status(503).json({ success: false, message: 'Production mail is not configured' });
  try {
    const info = await emailTransporter.sendMail({
      from: EMAIL_FROM, to, cc, bcc, subject, html, text, replyTo, headers,
      attachments: Array.isArray(attachments) ? attachments.map((attachment) => ({
        filename: attachment.filename || attachment.name || 'attachment',
        content: Buffer.from(attachment.content || '', 'base64'),
        ...(attachment.cid ? { cid: attachment.cid } : {}),
        ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
      })) : [],
    });
    return res.status(200).json({ success: true, messageId: info.messageId || '', accepted: info.accepted || [] });
  } catch (error) {
    console.error('Production mail relay failed:', error.message);
    return res.status(502).json({ success: false, message: 'Production mail delivery failed' });
  }
});

// Per-deploy backend version — the frontend polls this to force logout on a new deploy.
app.get('/api/app-version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    version: SERVER_VERSION,
    deploySignature: DEPLOY_SIGNATURE,
    buildId: DEPLOY_SIGNATURE,
  });
});

// ===== PROTECTED ROUTES (Auth Required) =====

// Claude Report (AIaaS sidecar) - has its own auth (long-lived sidecar token OR
// Supabase token). Mounted BEFORE /api/qeeg so this specific path wins and is
// not gated by the hourly Supabase-only authRequired middleware.
app.use('/api/qeeg/claude-report', claudeReportRoutes);

// Patient documents (private patients_documents bucket) - has its own static
// token auth (PATIENT_DOCS_TOKEN); uploads/reads/deletes via service-role key.
app.use('/api/patient-documents', patientDocumentRoutes);

// QEEG routes - Require authentication
app.use('/api/qeeg', protectedRoutes.authRequired, qeegRoutes);

// SSO routes - Optional auth
app.use('/api/sso', protectedRoutes.optionalAuth, ssoRoutes);

// (claudeRoutes is mounted once under /api below — the old duplicate
// /api/test mount exposed the same handlers at a second path for no reason)

// Contact Form API endpoint - PUBLIC (no auth required)
app.post('/api/contact', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, city, message, source } = req.body;

    if (!firstName || !email || !phone || !city) {
      return res.status(400).json({
        success: false,
        message: 'First name, email, phone, and city are required'
      });
    }

    const fullName = `${firstName} ${lastName || ''}`.trim();
    const isProtectMyBrain = source === 'protect-my-brain';
    const isTreatMyBrain = source === 'treat-my-brain';

    // Persist the lead server-side (service-role key bypasses RLS) — this is the
    // source of truth for the inquiry, so it no longer depends on a browser-side
    // anon insert that can be blocked by ad-block/privacy filters or a network reject.
    // Best-effort: a DB hiccup must not stop the admin notification below.
    if (supabase) {
      const cleanSource = typeof source === 'string' && source.trim() ? source.trim() : null;
      const { error: dbError } = await supabase
        .from('contact_inquiries')
        .insert([{ name: fullName, email, phone, city, message: message || null, source: cleanSource }]);
      if (dbError) console.error('contact_inquiries insert failed:', dbError.message);
    }

    // Send admin notification email
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Customer Inquiry - ${fullName}`,
      html: getAdminNotificationHtml('Customer Inquiry', [
        { label: 'Name', value: fullName },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'City', value: city },
        { label: 'Message', value: message || 'No message provided' }
      ]),
      attachments: getLogoAttachment()
    };

    // Send confirmation email to user
    const userConfirmation = {
      from: EMAIL_FROM,
      to: email,
      subject: isProtectMyBrain
        ? `Your Protect My Brain Package - Limitless Brain Lab`
        : isTreatMyBrain
          ? `Your Treat My Brain Package - Limitless Brain Lab`
          : `Thank You for Contacting Us - Limitless Brain Lab`,
      html: isProtectMyBrain
        ? getProtectMyBrainEmailHtml(fullName)
        : isTreatMyBrain
          ? getTreatMyBrainEmailHtml(fullName)
          : getUserConfirmationHtml(fullName),
      attachments: getFullAttachments()
    };
    const [adminDelivery, userDelivery] = await Promise.allSettled([
      emailTransporter.sendMail(mailOptions),
      emailTransporter.sendMail(userConfirmation)
    ]);
    if (adminDelivery.status === 'rejected') {
      console.error('Email sending failed:', adminDelivery.reason?.message || adminDelivery.reason);
    }
    if (userDelivery.status === 'rejected') {
      throw userDelivery.reason;
    }

    res.json({
      success: true,
      message: 'Message received successfully',
      emailSent: true
    });

  } catch (error) {
    console.error('Error processing contact form:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: error.message
      });
    }
  }
});

// Clinic Request ("Request a Clinic" enquiry on the landing page) - PUBLIC (no auth).
// The browser used to insert straight into clinic_enquiries with the anon key, but
// that table's RLS blocks anonymous inserts, so every real submission failed with
// "Failed to submit enquiry". Persist server-side (service-role key bypasses RLS)
// and notify the admin — same pattern as /api/contact.
app.post('/api/clinic-enquiry', async (req, res) => {
  try {
    const { name, email, phone, city, message } = req.body;

    if (!name || !email || !city) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and city are required'
      });
    }

    // Persist the lead server-side (best-effort: a DB hiccup must not stop the
    // admin notification below).
    if (supabase) {
      const { error: dbError } = await supabase
        .from('clinic_enquiries')
        .insert([{ name, email, phone: phone || null, city, message: message || null, status: 'pending' }]);
      if (dbError) console.error('clinic_enquiries insert failed:', dbError.message);
    }

    // Send admin notification email
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Clinic Request - ${name}`,
      html: getAdminNotificationHtml('Clinic Request', [
        { label: 'Name', value: name },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone || 'Not provided' },
        { label: 'City / Region', value: city },
        { label: 'Message', value: message || 'No message provided' }
      ]),
      attachments: getLogoAttachment()
    };
    // Send confirmation email to user
    const userConfirmation = {
      from: EMAIL_FROM,
      to: email,
      subject: `Request Received - Limitless Brain Lab`,
      html: getUserConfirmationHtml(name),
      attachments: getFullAttachments()
    };
    const [adminDelivery, userDelivery] = await Promise.allSettled([
      emailTransporter.sendMail(mailOptions),
      emailTransporter.sendMail(userConfirmation)
    ]);
    if (adminDelivery.status === 'rejected') {
      console.error('Clinic request admin email failed:', adminDelivery.reason?.message || adminDelivery.reason);
    }
    if (userDelivery.status === 'rejected') {
      throw userDelivery.reason;
    }

    res.json({
      success: true,
      message: 'Request received successfully',
      emailSent: true
    });

  } catch (error) {
    console.error('Error processing clinic enquiry:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to submit request',
        error: error.message
      });
    }
  }
});

// Claude API routes - auth handled per-route inside claudeRoutes
app.use('/api', claudeRoutes);

// EDF Upload Notification Email - triggered after QEEG processing
app.post('/api/edf-upload-notification', async (req, res) => {
  try {
    const { patientName, patientId, clinicName, overallScore, pdfUrl, processedAt } = req.body;

    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `New EDF Report Processed - ${patientName || 'Unknown Patient'}`,
      html: getAdminNotificationHtml('EDF Report Upload & Processing', [
        { label: 'Patient Name', value: patientName || 'Not provided' },
        { label: 'Patient ID', value: patientId || 'Not provided' },
        { label: 'Clinic', value: clinicName || 'Not provided' },
        { label: 'Overall Score', value: `${overallScore || 0}/21` },
        { label: 'Report PDF', value: pdfUrl ? `<a href="${pdfUrl}">View Report</a>` : 'Not generated' },
        { label: 'Processed At', value: processedAt || new Date().toISOString() }
      ]),
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'EDF upload notification sent' });
  } catch (error) {
    console.error('EDF notification email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send EDF notification' });
  }
});

// Report Received Notification - emails the PATIENT that their report was
// received and analysis has started (triggered on report upload by the clinic).
app.post('/api/send-report-received', async (req, res) => {
  try {
    const { patientEmail, patientName, clinicName, clinicEmail } = req.body;

    if (!patientEmail) {
      return res.status(400).json({ success: false, message: 'patientEmail is required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: patientEmail,
      subject: 'We have received your report - Limitless Brain Lab',
      html: getReportReceivedHtml(patientName, clinicName),
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);

    // Also notify the clinic (non-fatal).
    if (clinicEmail) {
      try {
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: clinicEmail,
          subject: `Report Received: ${patientName || 'Patient'}`,
          heading: 'Report Received',
          subheading: 'Patient Report Notification',
          greetingName: clinicName || 'your clinic',
          intro: `We've received a report submission for your patient <strong>${patientName || 'your patient'}</strong>. It is now being processed — you'll be notified when the report is ready.`,
          rows: [
            { label: 'Patient Name', value: patientName || '—' },
            { label: 'Date Received', value: fmtDateTime(new Date()) }
          ],
          footerNote: 'No action is required.'
        }));
        console.log('✅ Clinic report-received notification sent:', clinicEmail);
      } catch (clinicMailErr) {
        console.error('⚠️ Clinic report-received notification failed (non-fatal):', clinicMailErr.message);
      }
    }

    res.json({ success: true, message: 'Report received notification sent' });
  } catch (error) {
    console.error('Report received email error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send report received notification' });
  }
});

// Avatar Upload API endpoint - uses service role to bypass RLS
app.post('/api/upload-avatar', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase not configured' });
    }

    const { base64, fileName, userId, userRole, contentType } = req.body;

    if (!base64 || !userId) {
      return res.status(400).json({ success: false, message: 'Missing base64 or userId' });
    }

    // Extract base64 data (remove data:image/...;base64, prefix)
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Create file path
    const ext = fileName?.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const filePath = `avatars/${userRole || 'user'}/${userId}/avatar_${timestamp}.${ext}`;

    // Upload to clinic-logos bucket using service role (bypasses RLS)
    const { data, error } = await supabase.storage
      .from('clinic-logos')
      .upload(filePath, buffer, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
        cacheControl: '3600'
      });

    if (error) {
      console.error('Avatar upload error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('clinic-logos')
      .getPublicUrl(data.path);

    res.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// General Image Upload API endpoint - for location images, etc.
app.post('/api/upload-image', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase not configured' });
    }

    const { base64, fileName, folder, contentType } = req.body;

    if (!base64) {
      return res.status(400).json({ success: false, message: 'Missing base64 data' });
    }

    const BUCKET = 'site-images';

    // Create bucket if it doesn't exist
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets?.some(b => b.name === BUCKET);
      if (!exists) {
        await supabase.storage.createBucket(BUCKET, {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          fileSizeLimit: 10 * 1024 * 1024 // 10MB
        });
      }
    } catch (bucketErr) {
    }

    // Extract base64 data
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Create file path
    const ext = fileName?.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const safeName = (fileName || 'image').replace(/[^a-zA-Z0-9.-]/g, '_').split('.')[0];
    const filePath = `${folder || 'general'}/${safeName}_${timestamp}.${ext}`;

    // Upload using service role (bypasses RLS)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
        cacheControl: '31536000' // 1 year cache
      });

    if (error) {
      console.error('Image upload error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(data.path);

    res.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Partnership Inquiry API endpoint
app.post('/api/partnership-inquiry', async (req, res) => {
  try {
    const { email, contact_number, inquiry_type } = req.body;

    if (!email || !contact_number) {
      return res.status(400).json({
        success: false,
        message: 'Email and contact number are required'
      });
    }

    const inquiryLabel = inquiry_type === 'investment' ? 'Investment Inquiry' : 'Partnership Inquiry';

    // Send email notification
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `${inquiryLabel} - Limitless Brain Lab`,
      html: getAdminNotificationHtml(inquiryLabel, [
        { label: 'Email', value: email },
        { label: 'Contact Number', value: contact_number },
        { label: 'Inquiry Type', value: inquiryLabel }
      ]),
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);

    // Send confirmation email to user
    const userConfirmation = {
      from: EMAIL_FROM,
      to: email,
      subject: `Thank You for Your Interest - Limitless Brain Lab`,
      html: getUserConfirmationHtml('User'),
      attachments: getFullAttachments()
    };
    emailTransporter.sendMail(userConfirmation)
      .catch((err) => console.error('User confirmation email failed:', err.message));

    res.json({
      success: true,
      message: 'Inquiry submitted successfully'
    });

  } catch (error) {
    console.error('Error processing partnership inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit inquiry',
      error: error.message
    });
  }
});

// ============ Website Inquiries Management API ============

// GET all inquiries from a specific table
app.get('/api/inquiries/:type', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Database not configured' });
    }

    const tableMap = {
      'contact': 'contact_inquiries',
      'clinic': 'clinic_enquiries',
      'partnership': 'franchise_inquiries',
      'investment': 'franchise_inquiries',
      'professional': 'professional_onboarding',
      'program': 'program_inquiries',
      'feedback': 'patient_feedback'
    };

    const tableName = tableMap[req.params.type];
    if (!tableName) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry type' });
    }

    // Partnership and investment share the franchise_inquiries table, split by inquiry_type.
    let query = supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });
    if (req.params.type === 'investment') {
      query = query.eq('inquiry_type', 'investment');
    } else if (req.params.type === 'partnership') {
      // Treat legacy/NULL rows as partnership.
      query = query.or('inquiry_type.eq.partnership,inquiry_type.is.null');
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching ${req.params.type} inquiries:`, error);
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE an inquiry by id
app.delete('/api/inquiries/:type/:id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Database not configured' });
    }

    const tableMap = {
      'contact': 'contact_inquiries',
      'clinic': 'clinic_enquiries',
      'partnership': 'franchise_inquiries',
      'investment': 'franchise_inquiries',
      'professional': 'professional_onboarding',
      'program': 'program_inquiries'
    };

    const tableName = tableMap[req.params.type];
    if (!tableName) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry type' });
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', req.params.id);

    if (error) {
      console.error(`Error deleting inquiry:`, error);
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, message: 'Inquiry deleted' });
  } catch (error) {
    console.error('Error deleting inquiry:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ Website Payment Records API ============

// GET all payment records from all purchase tables
app.get('/api/website-payments', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Database not configured' });
    }

    const allPayments = [];

    // Fetch assessment purchases
    const { data: assessments } = await supabase
      .from('assessment_purchases')
      .select('*')
      .order('purchased_at', { ascending: false });

    if (assessments) {
      assessments.forEach(item => {
        allPayments.push({
          id: item.id,
          type: 'Assessment',
          product: item.assessment_name || 'Brain Assessment',
          email: item.patient_email,
          amount: item.amount_paid,
          currency: item.currency || 'USD',
          status: item.status || 'completed',
          stripe_session_id: item.stripe_session_id,
          link: item.assessment_link,
          date: item.purchased_at || item.created_at
        });
      });
    }

    // Fetch frequency purchases
    const { data: frequencies } = await supabase
      .from('frequency_purchases')
      .select('*')
      .order('purchased_at', { ascending: false });

    if (frequencies) {
      frequencies.forEach(item => {
        allPayments.push({
          id: item.id,
          type: 'Frequency',
          product: item.pack_name || item.pack_id || 'Frequency Pack',
          email: item.patient_email,
          amount: item.amount_paid,
          currency: item.currency || 'USD',
          status: item.status || 'completed',
          stripe_session_id: item.stripe_session_id,
          date: item.purchased_at || item.created_at
        });
      });
    }

    // Fetch meditation purchases
    const { data: meditations } = await supabase
      .from('meditation_purchases')
      .select('*')
      .order('purchased_at', { ascending: false });

    if (meditations) {
      meditations.forEach(item => {
        allPayments.push({
          id: item.id,
          type: 'Meditation',
          product: item.pack_name || item.pack_id || 'Meditation Pack',
          email: item.patient_email,
          amount: item.amount_paid,
          currency: item.currency || 'USD',
          status: item.status || 'completed',
          stripe_session_id: item.stripe_session_id,
          date: item.purchased_at || item.created_at
        });
      });
    }

    // Fetch subscription payments
    const { data: subscriptions } = await supabase
      .from('payment_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (subscriptions) {
      subscriptions.forEach(item => {
        allPayments.push({
          id: item.id,
          type: 'Subscription',
          product: `${item.tier || ''} Plan`,
          email: item.patient_email,
          amount: item.amount,
          currency: item.currency || 'USD',
          status: item.status || 'completed',
          stripe_session_id: item.stripe_session_id,
          date: item.created_at
        });
      });
    }

    // Fetch patient_payments — the unified table EVERY patient purchase writes to
    // (coaching writes ONLY here, so without this it never appears in Website
    // Payments). Pushed last so the more specific *_purchases rows win during the
    // de-dup below.
    const ppType = (t) => ({
      coaching: 'Coaching', frequency: 'Frequency',
      meditation: 'Meditation', assessment: 'Assessment'
    }[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Purchase'));
    const { data: patientPayments } = await supabase
      .from('patient_payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (patientPayments) {
      patientPayments.forEach(item => {
        allPayments.push({
          id: item.id,
          type: ppType(item.type),
          product: item.item_name || (item.type ? `${item.type} purchase` : 'Purchase'),
          email: item.patient_email,
          amount: item.amount,
          currency: item.currency || 'USD',
          status: item.status || 'completed',
          stripe_session_id: item.stripe_session_id,
          date: item.created_at
        });
      });
    }

    // De-dup by Stripe session id — frequency/meditation purchases are written to
    // BOTH their *_purchases table and patient_payments, so they would otherwise
    // appear twice. Rows without a session id are always kept.
    const seenSessionIds = new Set();
    const dedupedPayments = allPayments.filter(p => {
      if (!p.stripe_session_id) return true;
      if (seenSessionIds.has(p.stripe_session_id)) return false;
      seenSessionIds.add(p.stripe_session_id);
      return true;
    });

    // Sort all by date descending
    dedupedPayments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ success: true, data: dedupedPayments });
  } catch (error) {
    console.error('Error fetching website payments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Patient Feedback API endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    const { patientName, patientEmail, rating, category, message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message is required'
      });
    }

    // Send success response immediately
    res.json({
      success: true,
      message: 'Feedback received successfully'
    });

    // Get star rating display
    const starDisplay = rating ? `${rating} / 5` : 'Not rated';
    const categoryDisplay = category || 'General';

    // Send email notification asynchronously
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Patient Feedback - ${categoryDisplay} ${rating ? `(${rating}/5 Stars)` : ''}`,
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">

                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px;">
                      <table width="100%">
                        <tr>
                          <td>
                            <table>
                              <tr>
                                <td style="vertical-align: middle;">
                                  <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover;" />
                                </td>
                                <td style="vertical-align: middle; padding-left: 12px;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                            <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                              PATIENT FEEDBACK
                            </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td align="right" style="vertical-align: middle;">
                            <div style="background: rgba(255,255,255,0.12); border-radius: 10px; padding: 10px 14px; display: inline-block;">
                              <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 10px; text-transform: uppercase;">Received on</p>
                              <p style="color: #ffffff; margin: 3px 0 0; font-size: 13px; font-weight: 600;">${fmtDateTime(new Date())}</p>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Rating Display -->
                  <tr>
                    <td style="padding: 24px 32px 16px;">
                      <table width="100%" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px;">
                        <tr>
                          <td style="padding: 20px 24px; text-align: center;">
                            <p style="color: rgba(255,255,255,0.9); margin: 0 0 8px; font-size: 14px; font-weight: 600;">Rating</p>
                            <p style="color: #ffffff; margin: 0; font-size: 28px;">${starDisplay}</p>
                            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 16px; font-weight: 600;">${rating ? rating + ' out of 5' : 'No rating provided'}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Patient Info -->
                  <tr>
                    <td style="padding: 0 32px 16px;">
                      <table width="100%" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                        <tr>
                          <td style="padding: 16px; background: #f8f9fc; border-bottom: 1px solid #e5e7eb;">
                            <p style="color: #666; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Patient Details</p>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 16px;">
                            <table width="100%">
                              <tr>
                                <td style="padding: 8px 0;">
                                  <p style="color: #888; margin: 0; font-size: 12px;">Name</p>
                                  <p style="color: #333; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${patientName || 'Anonymous'}</p>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0;">
                                  <p style="color: #888; margin: 0; font-size: 12px;">Email</p>
                                  <p style="color: #333; margin: 4px 0 0; font-size: 15px;">${patientEmail || 'Not provided'}</p>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0;">
                                  <p style="color: #888; margin: 0; font-size: 12px;">Category</p>
                                  <p style="color: #333; margin: 4px 0 0; font-size: 15px;"><span style="background: #e0e7ff; color: #3730a3; padding: 4px 12px; border-radius: 20px; font-size: 13px;">${categoryDisplay}</span></p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Feedback Message -->
                  <tr>
                    <td style="padding: 0 32px 24px;">
                      <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px;">
                        <p style="color: #92400e; margin: 0 0 8px; font-size: 14px; font-weight: 600;">Feedback Message</p>
                        <p style="color: #78350f; margin: 0; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
                          ${message}
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #888; margin: 0; font-size: 12px;">
                        This feedback was received from <strong style="color: #323956;">Limitless Brain Lab</strong> Patient Dashboard
                      </p>
                      <p style="color: #aaa; margin: 6px 0 0; font-size: 11px;">
                        ${new Date().toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    // Send email in background
    emailTransporter.sendMail(mailOptions)
      .then(() => {
      })
      .catch((emailError) => {
        console.error('Feedback email sending failed:', emailError.message);
      });

  } catch (error) {
    console.error('Error processing feedback:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to submit feedback',
        error: error.message
      });
    }
  }
});

// Professional Application Form API endpoint
app.post('/api/professional-inquiry', async (req, res) => {
  try {
    const {
      fullName, email, phone, cityCountry, organization,
      certifications, professionalCategory, yearsExperience, clientSegments
    } = req.body;

    if (!fullName || !email || !phone || !cityCountry) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, phone, and city/country are required'
      });
    }

    const categoriesDisplay = Array.isArray(professionalCategory) ? professionalCategory.join(', ') : professionalCategory || 'Not provided';
    const segmentsDisplay = Array.isArray(clientSegments) ? clientSegments.join(', ') : clientSegments || 'Not provided';

    // Send email notification
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Professional Coach Application - ${fullName}`,
      html: getAdminNotificationHtml('Professional Coach Application', [
        { label: 'Full Name', value: fullName },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'City / Country', value: cityCountry },
        { label: 'Organization', value: organization },
        { label: 'Certifications', value: certifications },
        { label: 'Professional Category', value: categoriesDisplay },
        { label: 'Years of Experience', value: yearsExperience },
        { label: 'Client Segments', value: segmentsDisplay }
      ]),
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);

    // Send confirmation email to user
    const userConfirmation = {
      from: EMAIL_FROM,
      to: email,
      subject: `Application Received - Limitless Brain Lab`,
      html: getUserConfirmationHtml(fullName),
      attachments: getFullAttachments()
    };
    emailTransporter.sendMail(userConfirmation)
      .catch((err) => console.error('User confirmation email failed:', err.message));

    res.json({
      success: true,
      message: 'Application submitted successfully'
    });

  } catch (error) {
    console.error('Error processing professional application:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit application',
      error: error.message
    });
  }
});

// Program Join Form API endpoint
app.post('/api/program-inquiry', async (req, res) => {
  try {
    const {
      name, email, phone, message, profession,
      industry, brainFitnessScore, hasDoneBrainScan
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required'
      });
    }

    // Send email notification
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Professional Coach Application - ${name}`,
      html: getAdminNotificationHtml('Professional Coach Application', [
        { label: 'Name', value: name },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'Profession', value: profession },
        { label: 'Industry', value: industry },
        { label: 'Brain Fitness Score', value: brainFitnessScore },
        { label: 'Has Done Brain Scan', value: hasDoneBrainScan },
        { label: 'Message / Goals', value: message }
      ]),
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);

    // Send confirmation email to user
    const userConfirmation = {
      from: EMAIL_FROM,
      to: email,
      subject: `Application Received - Limitless Brain Lab`,
      html: getUserConfirmationHtml(name),
      attachments: getFullAttachments()
    };
    emailTransporter.sendMail(userConfirmation)
      .catch((err) => console.error('User confirmation email failed:', err.message));

    res.json({
      success: true,
      message: 'Inquiry submitted successfully'
    });

  } catch (error) {
    console.error('Error processing program inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit inquiry',
      error: error.message
    });
  }
});

// Google Geocoding API endpoint - Get address from coordinates
app.post('/api/geocode', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GOOGLE_API_KEY_HERE') {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key not configured'
      });
    }


    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      res.json({
        success: true,
        address: data.results[0].formatted_address,
        placeId: data.results[0].place_id
      });
    } else {
      res.status(400).json({
        success: false,
        message: data.error_message || `Google API Error: ${data.status}`
      });
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get address',
      error: error.message
    });
  }
});

// =====================================================
// STRIPE PAYMENT INTEGRATION - Frequency Music Packs
// =====================================================

// Create Stripe Checkout Session for Frequency Packs
app.post('/api/create-frequency-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const { packId, packName, customerEmail, customerName, currency, amount, isBundle } = req.body;

    if (!customerEmail || !amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Customer email, amount, and currency are required'
      });
    }

    // Convert amount to smallest currency unit (cents/paise)
    const currencyMultipliers = {
      'INR': 100, // paise
      'USD': 100, // cents
      'GBP': 100, // pence
      'EUR': 100, // cents
      'AED': 100, // fils
      'AUD': 100, // cents
      'CAD': 100, // cents
      'SGD': 100  // cents
    };

    const multiplier = currencyMultipliers[currency] || 100;
    const amountInSmallestUnit = Math.round(amount * multiplier);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ...CHECKOUT_UI,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: isBundle ? 'Complete Frequency Bundle (All 6 Packs)' : `${packName} - Frequency Pack`,
              description: isBundle
                ? 'Unlock all 6 brainwave frequency packs: Delta, Theta, Alpha, Beta, Gamma, and Solfeggio frequencies for complete brain optimization.'
                : `Unlock the full ${packName} frequency pack for enhanced brain performance.`,
              images: checkoutProductImages(req),
              metadata: {
                pack_id: packId,
                is_bundle: isBundle ? 'true' : 'false'
              }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      // Honor the caller's return URLs (patient portal on its own origin, e.g.
      // /dashboard/frequencies) instead of hardcoding the Vercel production URL.
      success_url: (req.body.successUrl && req.body.successUrl.includes('{CHECKOUT_SESSION_ID}'))
        ? req.body.successUrl
        : `${resolveCheckoutBase(req)}/dashboard/frequencies?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.body.cancelUrl || `${resolveCheckoutBase(req)}/dashboard/frequencies?payment=cancelled`,
      metadata: {
        pack_id: packId,
        customer_email: customerEmail,
        customer_name: customerName,
        is_bundle: isBundle ? 'true' : 'false'
      }
    });


    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// =====================================================
// STRIPE PAYMENT INTEGRATION - Meditation Packs
// =====================================================

// Create Stripe Checkout Session for Meditation Packs
app.post('/api/create-meditation-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const { packId, packName, customerEmail, customerName, currency, amount, isBundle } = req.body;

    if (!customerEmail || !amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Customer email, amount, and currency are required'
      });
    }

    // Convert amount to smallest currency unit (cents/paise)
    const currencyMultipliers = {
      'INR': 100, // paise
      'USD': 100, // cents
      'GBP': 100, // pence
      'EUR': 100, // cents
      'AED': 100, // fils
      'AUD': 100, // cents
      'CAD': 100, // cents
      'SGD': 100  // cents
    };

    const multiplier = currencyMultipliers[currency] || 100;
    const amountInSmallestUnit = Math.round(amount * multiplier);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ...CHECKOUT_UI,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: isBundle ? 'Complete Meditation Bundle (All 6 Packs)' : `${packName} - Meditation Pack`,
              description: isBundle
                ? 'Unlock all 6 guided meditation packs: Morning Awakening, Stress Relief, Focus & Clarity, Deep Sleep, Gratitude & Joy, and Body Healing.'
                : `Unlock the full ${packName} meditation pack for enhanced mental wellness.`,
              images: checkoutProductImages(req),
              metadata: {
                pack_id: packId,
                is_bundle: isBundle ? 'true' : 'false',
                type: 'meditation'
              }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      // Honor the caller's return URLs (patient portal on its own origin, e.g.
      // /dashboard/meditations) instead of hardcoding the frontend host.
      success_url: (req.body.successUrl && req.body.successUrl.includes('{CHECKOUT_SESSION_ID}'))
        ? req.body.successUrl
        : `${resolveCheckoutBase(req)}/dashboard/meditations?meditation_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.body.cancelUrl || `${resolveCheckoutBase(req)}/dashboard/meditations?meditation_payment=cancelled`,
      metadata: {
        pack_id: packId,
        customer_email: customerEmail,
        customer_name: customerName,
        is_bundle: isBundle ? 'true' : 'false',
        type: 'meditation'
      }
    });


    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Stripe meditation checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// ============================================
// STRIPE SUBSCRIPTION PAYMENTS
// ============================================

// Create Stripe Checkout Session for Subscription Upgrades
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const {
      tierId,
      tierName,
      price,
      currency = 'USD',
      customerEmail,
      customerName,
      successUrl,
      cancelUrl,
      priceId, // Optional: Pre-configured Stripe Price ID
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Customer email is required'
      });
    }

    let sessionConfig = {
      ...CHECKOUT_UI,
      mode: 'payment',
      customer_email: customerEmail,
      success_url: successUrl || `${resolveCheckoutBase(req)}/dashboard?payment=success&tier=${tierId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${resolveCheckoutBase(req)}/dashboard/subscription?payment=cancelled`,
      metadata: {
        tier: tierId,
        type: 'subscription',
        user_email: customerEmail,
        ...metadata
      }
    };

    // If a pre-configured Price ID is provided, use it
    if (priceId) {
      sessionConfig.line_items = [{
        price: priceId,
        quantity: 1
      }];
    } else {
      // Create a dynamic price
      sessionConfig.line_items = [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Limitless Brain Lab ${tierName} Subscription`,
            description: `Access to ${tierName} features - Monthly subscription`,
            images: checkoutProductImages(req)
          },
          unit_amount: Math.round(price * 100) // Convert to cents
        },
        quantity: 1
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);


    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe subscription checkout error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verify Stripe Session after redirect
app.get('/api/stripe/verify-session/:sessionId', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const paymentType = session.metadata?.type || 'frequency';
      const customerEmail = session.customer_email;
      const customerName = session.metadata?.customer_name || '';
      const amountPaid = `${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}`;

      // (response is sent after the DB save below so assessment purchases can
      // return their one-time gate URL, which needs the purchase row to exist)

      // Save payment record to database
      if (supabase) {
        try {
          if (paymentType === 'assessment') {
            // assessment_purchases has NO unique constraint on stripe_session_id,
            // so upsert(onConflict) always errored and the row was silently
            // dropped — check-then-insert keeps this webhook-fallback path
            // idempotent without a schema migration.
            const { data: existingAssessment } = await supabase
              .from('assessment_purchases')
              .select('id')
              .eq('stripe_session_id', sessionId)
              .limit(1);
            if (!existingAssessment?.length) {
              const { error } = await supabase
                .from('assessment_purchases')
                .insert({
                  patient_email: customerEmail?.toLowerCase(),
                  assessment_id: session.metadata?.assessment_id,
                  assessment_name: session.metadata?.assessment_name,
                  assessment_link: session.metadata?.assessment_link || '',
                  stripe_session_id: sessionId,
                  stripe_payment_intent: session.payment_intent,
                  amount_paid: session.amount_total / 100,
                  currency: session.currency?.toUpperCase(),
                  status: 'completed',
                  purchased_at: new Date().toISOString()
                });
              if (error) console.error('DB save error (assessment):', error.message);
            }

            // payments row for the SuperAdmin dashboard (unique stripe_session_id)
            const { error: assessPayErr } = await supabase.from('payments').upsert({
              clinic_id: session.metadata?.clinic_id || null,
              patient_email: customerEmail?.toLowerCase(),
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'assessment',
              package_name: session.metadata?.assessment_name || 'Brain Assessment',
              payment_method: 'stripe',
              payment_id: session.payment_intent || sessionId,
              stripe_payment_id: session.payment_intent || sessionId,
              stripe_session_id: sessionId,
              source: session.metadata?.source || 'website',
              created_at: new Date().toISOString()
            }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
            if (assessPayErr) console.error('DB save error (payments/assessment):', assessPayErr.message);
          } else if (paymentType === 'subscription') {
            // Full grant (patients tier/status/dashboard_access) + all payment
            // rows + welcome/admin emails — idempotent, shared with the webhook.
            // Previously this branch only logged payment_history, so a paid
            // subscription confirmed via this path granted no plan access.
            const subResult = await applySubscriptionPurchase(session);
            if (!subResult.ok) console.error('verify-session applySubscriptionPurchase failed:', subResult.message);
          } else if (paymentType === 'coaching_session') {
            // Coaching must NOT fall through to the frequency/meditation branch
            // (it used to create a spurious frequency_purchases row with an
            // undefined pack_id). Record in the shared payments ledger only;
            // the Calendly email + booking records come from the webhook /
            // brain-coach return page.
            const { error: coachErr } = await supabase.from('payments').upsert({
              clinic_id: session.metadata?.clinic_id || null,
              patient_email: customerEmail?.toLowerCase(),
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'coaching',
              package_name: session.metadata?.coach_name ? `Coaching Session - ${session.metadata.coach_name}` : 'Coaching Session',
              payment_method: 'stripe',
              payment_id: session.payment_intent || sessionId,
              stripe_payment_id: session.payment_intent || sessionId,
              stripe_session_id: sessionId,
              created_at: new Date().toISOString()
            }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
            if (coachErr) console.error('DB save error (payments/coaching):', coachErr.message);
          } else {
            // Frequency or meditation. The live tables are minimal —
            // meditation_purchases(patient_email, meditation_id, purchased_at)
            // and frequency_purchases(patient_email, frequency_id, pack_id,
            // purchased_at) — the old upsert used columns that don't exist and
            // always errored. The payments row (unique stripe_session_id) is
            // the idempotency anchor.
            const isMeditation = session.metadata?.pack_id?.startsWith('solfeggio_') || session.metadata?.pack_id?.includes('meditation');
            const packEmail = customerEmail?.toLowerCase();

            if (isMeditation) {
              const { error } = await supabase
                .from('meditation_purchases')
                .upsert({
                  patient_email: packEmail,
                  meditation_id: session.metadata?.pack_id,
                  purchased_at: new Date().toISOString()
                }, { onConflict: 'patient_email,meditation_id', ignoreDuplicates: true });
              if (error) console.error('DB save error (meditation_purchases):', error.message);
            } else {
              const { data: existingPack } = await supabase
                .from('frequency_purchases')
                .select('id')
                .eq('patient_email', packEmail)
                .eq('pack_id', session.metadata?.pack_id)
                .limit(1);
              if (!existingPack?.length) {
                const { error } = await supabase
                  .from('frequency_purchases')
                  .insert({
                    patient_email: packEmail,
                    pack_id: session.metadata?.pack_id,
                    frequency_id: session.metadata?.pack_id,
                    purchased_at: new Date().toISOString()
                  });
                if (error) console.error('DB save error (frequency_purchases):', error.message);
              }
            }

            const { error: packPayErr } = await supabase.from('payments').upsert({
              clinic_id: null,
              patient_email: packEmail,
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: isMeditation ? 'meditation' : 'frequency',
              package_name: session.metadata?.pack_id?.replace(/_/g, ' ') || 'Pack',
              payment_method: 'stripe',
              payment_id: session.payment_intent || sessionId,
              stripe_payment_id: session.payment_intent || sessionId,
              stripe_session_id: sessionId,
              created_at: new Date().toISOString()
            }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
            if (packPayErr) console.error('DB save error (payments/pack):', packPayErr.message);
          }
        } catch (dbErr) {
          console.error('DB save error:', dbErr.message);
        }
      }

      // One-time gate URL for assessments (replaces the raw JotForm link in
      // the response and the confirmation email)
      let takeUrl = null;
      if (paymentType === 'assessment') {
        try {
          takeUrl = await ensureAssessmentToken({
            sessionId,
            email: customerEmail,
            assessmentId: session.metadata?.assessment_id
          });
        } catch (tokenErr) {
          console.error('ensureAssessmentToken failed:', tokenErr.message);
        }
      }

      res.json({
        success: true,
        status: session.payment_status,
        customerEmail: customerEmail,
        tier: session.metadata?.tier,
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase(),
        assessmentName: session.metadata?.assessment_name || null,
        assessmentLink: session.metadata?.assessment_link || null,
        takeUrl
      });

      // Send confirmation email to user after successful payment.
      // Subscriptions are excluded: applySubscriptionPurchase already sends the
      // welcome + admin emails exactly once (claimNotificationOnce), so the
      // generic confirmation here would duplicate them on every verify call.
      // The claim below shares its key with the webhook branch for the same
      // type, so whichever path runs first sends the pair — never both.
      const emailClaimKey = paymentType === 'assessment'
        ? `assessment:${sessionId}:emails`
        : `pack:${sessionId}:emails`;
      // One-time gate URL, never the raw JotForm link. Resolved BEFORE the
      // send-once claim: an assessment email without a link must not consume
      // the claim, or the webhook path would be blocked from ever sending it.
      const assessmentLink = paymentType === 'assessment'
        ? (takeUrl || session.metadata?.assessment_link || '')
        : '';
      if (paymentType === 'assessment' && !assessmentLink) {
        console.error(`Assessment email skipped - no link available for session ${sessionId}`);
      }
      if (mailerConfigured && customerEmail && paymentType !== 'subscription'
          && (paymentType !== 'assessment' || assessmentLink)
          && await claimNotificationOnce(emailClaimKey)) {
        let emailSubject = '';
        let productName = '';

        if (paymentType === 'assessment') {
          productName = session.metadata?.assessment_name || 'Brain Assessment';
          emailSubject = `Your ${productName} is ready - Limitless Brain Lab`;
        } else if (paymentType === 'subscription') {
          productName = `${session.metadata?.tier || ''} Subscription`;
          emailSubject = `Payment Confirmation - ${productName} - Limitless Brain Lab`;
        } else {
          productName = session.metadata?.pack_id || 'Purchase';
          emailSubject = `Payment Confirmation - Limitless Brain Lab`;
        }

        // Assessments get the dedicated "ready to take" email (take-link CTA,
        // no Academy block) — same template the Stripe webhook branch sends.
        // Other purchases keep the generic confirmation with payment details.
        const confirmationMail = paymentType === 'assessment' ? {
          from: EMAIL_FROM,
          to: customerEmail,
          subject: emailSubject,
          html: getAssessmentReadyEmailHtml({
            customerName,
            assessmentName: productName,
            amountLabel: amountPaid,
            orderId: sessionId.slice(-12),
            link: assessmentLink
          }),
          attachments: getLogoAttachment()
        } : {
          from: EMAIL_FROM,
          to: customerEmail,
          subject: emailSubject,
          html: getUserConfirmationHtml(customerName || 'User').replace(
            'Thank you for reaching out. We have successfully received your submission and our team will get in touch with you within <strong style="color: #323956;">two working days</strong>.',
            `Thank you for your payment! You purchased <strong style="color: #323956;">${productName}</strong>.<br><br>
            <strong>Amount Paid:</strong> ${amountPaid}<br>
            <strong>Date:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST<br>
            <strong>Order ID:</strong> ${sessionId.slice(-12)}`
          ),
          attachments: getFullAttachments()
        };

        emailTransporter.sendMail(confirmationMail)
          .then(() => console.log(`SUCCESS: ${paymentType === 'assessment' ? 'Assessment' : 'Payment confirmation'} email sent to ${customerEmail} (verify-session)`))
          .catch(err => console.error('Payment confirmation email failed:', err.message));

        // Also notify admin
        const adminMail = {
          from: EMAIL_FROM,
          to: process.env.EMAIL_TO || process.env.EMAIL_USER,
          subject: `New Payment Received - ${productName}`,
          html: getAdminNotificationHtml('Payment Received', [
            { label: 'Customer', value: customerName || 'N/A' },
            { label: 'Email', value: customerEmail },
            { label: 'Product', value: productName },
            { label: 'Amount', value: amountPaid },
            { label: 'Order ID', value: sessionId },
            { label: 'Date', value: new Date().toLocaleString('en-IN') }
          ]),
          attachments: getLogoAttachment()
        };

        emailTransporter.sendMail(adminMail)
          .catch(err => console.error('Admin payment email failed:', err.message));
      }

    } else {
      res.json({
        success: false,
        status: session.payment_status
      });
    }

  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create Stripe Checkout Session for Clinic Report Purchases
app.post('/api/create-report-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const { packageId, packageName, reports, amount, currency, customerEmail, customerName, clinicId, clinicType } = req.body;

    // Return the clinic to the SAME origin it came from after payment, so the
    // per-origin auth session survives the round-trip (a cross-origin return drops
    // the session and bounces the clinic to /login). Fall back to the staging
    // frontend domain (this is the staging build).
    const baseUrl = resolveCheckoutBase(req);

    if (!customerEmail || !amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Customer email, amount, and currency are required'
      });
    }

    // Convert amount to smallest currency unit (cents/paise)
    const currencyMultipliers = {
      'INR': 100,
      'USD': 100,
      'GBP': 100,
      'EUR': 100,
      'AED': 100,
      'AUD': 100,
      'CAD': 100,
      'SGD': 100
    };

    const multiplier = currencyMultipliers[currency] || 100;
    const amountInSmallestUnit = Math.round(amount * multiplier);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ...CHECKOUT_UI,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${packageName} - ${reports} EEG Reports`,
              description: `Purchase ${reports} EEG brain reports for your clinic`,
              images: checkoutProductImages(req),
              metadata: {
                package_id: packageId,
                reports: reports.toString(),
                type: 'clinic_report'
              }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      success_url: `${baseUrl}/clinic/subscription?payment=success&reports=${reports}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/clinic/subscription?payment=cancelled`,
      metadata: {
        package_id: packageId,
        customer_email: customerEmail,
        customer_name: customerName,
        clinic_id: clinicId,
        clinic_type: clinicType || 'lbl_partner',
        reports: reports.toString(),
        type: 'clinic_report'
      }
    });


    res.json({
      success: true,
      sessionId: session.id,
      checkoutUrl: session.url
    });

  } catch (error) {
    console.error('Error creating clinic report checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// Authoritative, idempotent crediting of clinic report packs.
// Called by the clinic frontend on payment success AND mirrored by the Stripe
// webhook. Verifies the session is actually paid via Stripe, then increments
// reports_allowed server-side (service-role key bypasses RLS). The
// claimNotificationOnce guard (keyed by session id) ensures credits are added
// exactly once no matter how many callers fire (two dashboard components +
// webhook + retries).
// Clinic report-purchase confirmation emails (to the clinic + internal copy).
// Called from BOTH fulfillment paths via applyReportCredits (Stripe webhook and
// the frontend /api/confirm-report-credits fallback); the dedupe claim
// guarantees the pair is sent exactly once per checkout session regardless of
// which path (or how many retries) get here.
async function sendClinicReportPurchaseEmails(session, previousAllowed) {
  if (!mailerConfigured || !session?.customer_email) return;
  const firstTime = await claimNotificationOnce(`clinic_report:${session.id}:emails`);
  if (!firstTime) return;

  const clinicId = session.metadata?.clinic_id;
  const reports = parseInt(session.metadata?.reports || '0', 10);
  const customerName = session.metadata?.customer_name || '';
  const isReorder = previousAllowed > 0;
  const FRONTEND_URL = APP_URL;

  const clinicMailOptions = isReorder
    ? {
        from: EMAIL_FROM,
        to: session.customer_email,
        subject: `Package Reorder Successful - ${reports} EEG Reports Added`,
        attachments: getLogoAttachment(),
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">Package Reorder Successful!</h1>
            </div>
            <div style="padding: 28px 32px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">Dear <strong>${customerName || 'Clinic Admin'}</strong>,</p>
              <p style="color: #555; font-size: 15px; line-height: 1.6;">Thank you for reordering! Your payment of <strong>${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</strong> has been processed successfully.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #555; font-size: 14px; padding: 6px 0;">Credits Added</td>
                    <td style="color: #166534; font-weight: 700; font-size: 14px; text-align: right;">+${reports} Reports</td>
                  </tr>
                  <tr>
                    <td style="color: #555; font-size: 14px; padding: 6px 0;">Previous Balance</td>
                    <td style="color: #374151; font-weight: 600; font-size: 14px; text-align: right;">${previousAllowed} Reports</td>
                  </tr>
                  <tr style="border-top: 1px solid #bbf7d0;">
                    <td style="color: #333; font-size: 15px; font-weight: 700; padding: 8px 0;">New Total Balance</td>
                    <td style="color: #166534; font-weight: 700; font-size: 15px; text-align: right;">${previousAllowed + reports} Reports</td>
                  </tr>
                </table>
              </div>
              <p style="color: #555; font-size: 14px; line-height: 1.6;">You can now continue adding patients and generating reports from your dashboard.</p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${FRONTEND_URL}/clinic" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">Go to Dashboard</a>
              </div>
              <p style="color: #999; font-size: 12px; text-align: center;">Thank you for your continued trust in Limitless Brain Lab!</p>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; info@limitlessbrainlab.com</p>
            </div>
          </div>
        `
      }
    : {
        from: EMAIL_FROM,
        to: session.customer_email,
        subject: `Payment Successful - ${reports} EEG Reports Added`,
        attachments: getLogoAttachment(),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 20px;">Payment Successful!</h1>
            </div>
            <div style="padding: 24px; background: #ffffff;">
              <p style="color: #333;">Hi ${customerName || 'Clinic Admin'},</p>
              <p style="color: #555;">Your payment of <strong>${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</strong> has been processed successfully.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; color: #166534; font-weight: 600;">${reports} EEG Report Credits have been added to your account.</p>
              </div>
              <p style="color: #555; font-size: 13px;">You can now access your clinic dashboard and start generating reports.</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${FRONTEND_URL}/clinic" style="display: inline-block; background: #323956; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Go to Dashboard</a>
              </div>
              <p style="color: #999; font-size: 12px; text-align: center;">Thank you for choosing Limitless Brain Lab!</p>
            </div>
            ${CONTACT_STRIP_HTML}
          </div>
        `
      };

  emailTransporter.sendMail(clinicMailOptions)
    .catch(err => console.error('Clinic payment email failed:', err.message));

  // Notify admin (Limitless Brain Lab) about clinic report purchase
  const adminClinicMailOptions = {
    from: EMAIL_FROM,
    to: process.env.EMAIL_TO || process.env.EMAIL_USER,
    subject: `New Clinic Report Purchase: ${reports} Reports`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="padding: 24px 28px;">
          <h2 style="color: #323956; margin-top: 0;">New Clinic Report Purchase</h2>
          <p><strong>Clinic ID:</strong> ${clinicId}</p>
          <p><strong>Customer:</strong> ${customerName || 'N/A'} (${session.customer_email})</p>
          <p><strong>Reports:</strong> ${reports} EEG Reports</p>
          <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
          <p><strong>Session ID:</strong> ${session.id}</p>
          <p><strong>Date:</strong> ${new Date().toISOString()}</p>
        </div>
        ${CONTACT_STRIP_HTML}
      </div>
    `
  };

  emailTransporter.sendMail(adminClinicMailOptions)
    .catch(err => console.error('Admin clinic report email failed:', err.message));
}

async function applyReportCredits(sessionId) {
  if (!sessionId) return { ok: false, status: 400, message: 'sessionId required' };
  if (!stripe) return { ok: false, status: 500, message: 'Stripe not configured' };
  if (!supabase) return { ok: false, status: 500, message: 'Database not configured' };

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid' || session.metadata?.type !== 'clinic_report') {
    return { ok: false, status: 400, message: 'Session is not a paid clinic report purchase' };
  }
  const clinicId = session.metadata?.clinic_id;
  const reports = parseInt(session.metadata?.reports || '0', 10);
  if (!clinicId || !reports) {
    return { ok: false, status: 400, message: 'Session missing clinic_id / reports metadata' };
  }

  // Record the payment for Payment History. Written here (not only in the Stripe
  // webhook) so it lands on the frontend confirm path too — the webhook may not
  // reach staging/preview deployments. Kept INDEPENDENT of the credits claim
  // below and idempotent via upsert on the unique stripe_session_id, so every
  // caller (frontend confirm + webhook) can safely (re)attempt it — a failure
  // here never gets locked out by an already-spent credits claim.
  const { error: paymentError } = await supabase
    .from('payments')
    .upsert({
      clinic_id: clinicId,
      amount: session.amount_total / 100,
      currency: session.currency?.toUpperCase() || 'INR',
      status: 'completed',
      type: 'subscription',
      package_name: `${reports} EEG Reports`,
      reports_allowed: reports,
      payment_method: 'stripe',
      payment_id: session.payment_intent || session.id,
      stripe_payment_id: session.payment_intent || session.id,
      stripe_session_id: session.id,
      created_at: new Date().toISOString()
    }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
  if (paymentError) {
    console.error('applyReportCredits payment record error:', paymentError.message);
  }

  // Idempotent: only the first caller for this session actually adds credits.
  const firstTime = await claimNotificationOnce(`clinic_report:${sessionId}:credits`);
  if (!firstTime) {
    const { data } = await supabase.from('clinics').select('reports_allowed').eq('id', clinicId).single();
    const allowedNow = data?.reports_allowed ?? null;
    // Credits were applied by the other path — still attempt the confirmation
    // emails (claimed independently), so a purchase credited by a path that
    // never emailed still gets them here.
    sendClinicReportPurchaseEmails(session, Math.max(0, (allowedNow ?? reports) - reports))
      .catch(err => console.error('Clinic report purchase emails failed:', err.message));
    return { ok: true, alreadyApplied: true, reportsAllowed: allowedNow, added: 0 };
  }

  const { data: clinicData } = await supabase.from('clinics').select('reports_allowed').eq('id', clinicId).single();

  // Atomic increment via the DB function (reports_allowed = reports_allowed + N,
  // also sets subscription_status/is_active) — a read-modify-write here could
  // lose an increment when two purchases for the same clinic fulfill
  // concurrently. Falls back to the old read-modify-write if the rpc is
  // unavailable (deploy-order safety).
  let newAllowed;
  const { data: rpcAllowed, error: rpcErr } = await supabase
    .rpc('increment_clinic_report_credits', { p_clinic_id: clinicId, p_delta: reports });
  if (!rpcErr && rpcAllowed !== null && rpcAllowed !== undefined) {
    newAllowed = rpcAllowed;
  } else {
    if (rpcErr) console.warn('increment_clinic_report_credits rpc unavailable, falling back:', rpcErr.message);
    newAllowed = (clinicData?.reports_allowed || 0) + reports;
    const { error: updErr } = await supabase.from('clinics')
      .update({ reports_allowed: newAllowed, subscription_status: 'active', is_active: true, updated_at: new Date().toISOString() })
      .eq('id', clinicId);
    if (updErr) {
      console.error('applyReportCredits clinics update error:', updErr.message);
      return { ok: false, status: 500, message: updErr.message };
    }
  }
  // Mirror to organizations. NOTE: supabase-js reports failures via the
  // returned { error }, not by throwing — a .catch() here would never fire.
  // organizations has no subscription_status column, so only mirror the credits.
  const { error: orgErr } = await supabase.from('organizations')
    .update({ reports_allowed: newAllowed, updated_at: new Date().toISOString() })
    .eq('id', clinicId);
  if (orgErr) {
    console.warn('applyReportCredits organizations mirror failed:', orgErr.message);
  }

  sendClinicReportPurchaseEmails(session, clinicData?.reports_allowed || 0)
    .catch(err => console.error('Clinic report purchase emails failed:', err.message));

  console.log(`SUCCESS: applyReportCredits clinic ${clinicId} reports_allowed -> ${newAllowed} (+${reports})`);
  return { ok: true, reportsAllowed: newAllowed, added: reports };
}

// Authoritative, idempotent recording of a PATIENT subscription purchase.
// Called by the Stripe webhook AND by /api/stripe/verify-session (the frontend
// confirm path on return from checkout) — previously this logic lived only in
// the webhook, so when the webhook was unreachable/unconfigured a paid
// subscription granted nothing and sent no emails. Grant + payment rows are
// idempotent (update-to-same-values / upsert on stripe_session_id); the
// one-shot side effects (patient_payments, admin notification, emails) are
// guarded by claimNotificationOnce so they fire exactly once across callers.
async function applySubscriptionPurchase(session) {
  if (!supabase) return { ok: false, status: 500, message: 'Database not configured' };
  if (!session || session.payment_status !== 'paid' || session.metadata?.type !== 'subscription') {
    return { ok: false, status: 400, message: 'Session is not a paid subscription purchase' };
  }
  const tier = session.metadata?.tier;
  const email = (session.customer_email || session.customer_details?.email || '').toLowerCase();
  if (!tier || !email) {
    return { ok: false, status: 400, message: 'Session missing tier/email metadata' };
  }
  const amount = session.amount_total / 100;
  const currency = session.currency?.toUpperCase() || 'USD';

  // 1. Grant the plan on the patient row (safe to re-run — same values).
  const { error: updateError } = await supabase
    .from('patients')
    .update({
      subscription_tier: tier.toLowerCase(),
      subscription_status: 'active',
      dashboard_access: true,
      reports_unlocked: true, // Enable report access for paid subscriptions
      updated_at: new Date().toISOString()
    })
    .eq('email', email);
  if (updateError) {
    console.error('applySubscriptionPurchase patients update error:', updateError.message);
  }

  // 2. Payment rows — idempotent via upsert on the unique stripe_session_id.
  await supabase.from('payment_history').upsert({
    // payment_id is NOT NULL on this table (legacy Razorpay design) — omitting
    // it made every subscription insert fail silently, leaving the table empty.
    payment_id: session.payment_intent || session.id,
    patient_email: email,
    payment_type: 'subscription',
    tier: tier,
    amount,
    currency,
    payment_provider: 'stripe',
    provider: 'stripe',
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
    status: 'completed',
    created_at: new Date().toISOString()
  }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
    .then(({ error: e }) => { if (e) console.error('applySubscriptionPurchase payment_history error:', e.message); });

  await supabase.from('payments').upsert({
    clinic_id: null,
    patient_email: email,
    amount,
    currency,
    status: 'completed',
    type: 'patient_subscription',
    package_name: `${tier} Subscription`,
    payment_method: 'stripe',
    payment_id: session.payment_intent || session.id,
    stripe_payment_id: session.payment_intent || session.id,
    stripe_session_id: session.id,
    created_at: new Date().toISOString()
  }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
    .then(({ error: e }) => { if (e) console.warn('applySubscriptionPurchase payments insert skipped:', e.message); });

  // 3. One-shot side effects: only the first caller for this session runs them.
  const firstTime = await claimNotificationOnce(`subscription:${session.id}:granted`);
  if (!firstTime) {
    return { ok: true, tier, alreadyApplied: true };
  }

  // patient_payments (per-clinic tracking)
  try {
    let clinicId = session.metadata?.clinic_id || null;
    if (!clinicId) {
      const { data: patient } = await supabase
        .from('patients')
        .select('clinic_id')
        .eq('email', email)
        .limit(1)
        .single();
      clinicId = patient?.clinic_id || null;
    }
    await supabase.from('patient_payments').insert({
      clinic_id: clinicId,
      patient_email: email,
      patient_name: session.metadata?.customer_name || '',
      amount,
      currency,
      status: 'completed',
      type: 'subscription',
      item_name: `${tier} Subscription`,
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      source: 'Subscription',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('applySubscriptionPurchase patient_payments insert skipped:', err.message);
  }

  // 4. wallet_subscriptions row for Wallet UI display
  try {
    const tierNameMap = { 'basic': 'Basic', 'pro': 'Pro', 'premium': 'Premium' };

    await supabase.from('wallet_subscriptions').insert({
      patient_email: email,
      patient_id: session.metadata?.patient_id || null,
      plan_name: tierNameMap[tier.toLowerCase()] || `${tier} Plan`,
      status: 'Active',
      stripe_subscription_id: session.subscription_id || session.id
    });
  } catch (err) {
    console.warn('applySubscriptionPurchase wallet_subscriptions insert skipped:', err.message);
  }

  // Admin dashboard notification
  await supabase.from('admin_notifications').insert({
    type: 'success',
    category: 'payment',
    title: 'Subscription Payment Received',
    message: `${email} subscribed to ${tier} plan ($${amount.toFixed(2)} ${currency}).`,
    patient_name: email,
    action: 'view_payment',
    action_data: { tier, amount, email },
    is_read: false
  }).then(({ error: ne }) => { if (ne) console.error('applySubscriptionPurchase notification error:', ne.message); });

  // Emails: patient welcome + admin notification
  if (mailerConfigured) {
    const welcomeMail = {
      from: EMAIL_FROM,
      to: email,
      subject: `Welcome to Limitless Brain Lab ${tier}`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 20px; text-align: center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
            <h1 style="color: #ffffff; margin: 10px 0 0;">Welcome to Limitless Brain Lab ${tier}!</h1>
          </div>
          <div style="padding: 24px 28px; background: #ffffff;">
            <p style="margin-top: 0;">Thank you for upgrading your subscription.</p>
            <p><strong>Amount Paid:</strong> ${currency} ${amount.toFixed(2)}</p>
            <p>You now have access to all ${tier} features including:</p>
            <ul>
              ${tier === 'PREMIUM' ? '<li>Brain Coach Access</li><li>Home Neurofeedback</li><li>All Assessments</li>' : ''}
              ${tier === 'PRO' || tier === 'PREMIUM' ? '<li>Frequencies Library</li><li>Meditations</li><li>Supplements Guide</li>' : ''}
              ${tier === 'BASIC' || tier === 'PRO' || tier === 'PREMIUM' ? '<li>ANS Reset Protocol</li><li>MOVERS Exercises</li><li>Five Pillars</li>' : ''}
            </ul>
            <a href="${APP_URL}/dashboard" style="display: inline-block; background: #323956; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Go to Dashboard</a>
          </div>
          ${CONTACT_STRIP_HTML}
        </div>
      `
    };
    emailTransporter.sendMail(welcomeMail, (err) => {
      if (err) console.error('Error sending subscription email:', err);
    });

    const adminSubMailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `New Subscription Purchase: ${tier}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="padding: 24px 28px;">
            <h2 style="color: #323956; margin-top: 0;">New Subscription Purchase</h2>
            <p><strong>Customer:</strong> ${email}</p>
            <p><strong>Tier:</strong> ${tier}</p>
            <p><strong>Amount:</strong> ${currency} ${amount.toFixed(2)}</p>
            <p><strong>Session ID:</strong> ${session.id}</p>
            <p><strong>Date:</strong> ${new Date().toISOString()}</p>
          </div>
          ${CONTACT_STRIP_HTML}
        </div>
      `
    };
    emailTransporter.sendMail(adminSubMailOptions)
      .catch(err => console.error('Admin subscription email failed:', err.message));
  }

  console.log(`SUCCESS: applySubscriptionPurchase ${email} -> ${tier} (session ${session.id})`);
  return { ok: true, tier, alreadyApplied: false };
}

// ── One-time assessment gate links ─────────────────────────────────────────
// Each paid assessment purchase gets a random token. Buyers get
// ${APP_URL}/assessment/take/<token> (page + emails) instead of the raw
// JotForm URL; /api/assessment-link/consume validates state server-side and
// only then reveals the JotForm link(s). The link is spent only on a real
// submission signal (the gate page's /complete call or the JotForm webhook)
// or when link_expires_at passes — never on a mere re-open.
const ASSESSMENT_LINK_VALID_DAYS = 30;

async function ensureAssessmentToken({ sessionId, email, assessmentId } = {}) {
  if (!supabase) return null;
  let row = null;
  if (sessionId) {
    const { data } = await supabase.from('assessment_purchases')
      .select('id, link_token')
      .eq('stripe_session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1);
    row = data?.[0] || null;
  }
  if (!row && email && assessmentId) {
    const { data } = await supabase.from('assessment_purchases')
      .select('id, link_token')
      .eq('patient_email', email.toLowerCase())
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false })
      .limit(1);
    row = data?.[0] || null;
  }
  if (!row) return null;
  if (!row.link_token) {
    const token = require('crypto').randomBytes(24).toString('hex');
    const { error } = await supabase.from('assessment_purchases')
      .update({
        link_token: token,
        link_expires_at: new Date(Date.now() + ASSESSMENT_LINK_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('id', row.id)
      .is('link_token', null); // lose gracefully if a concurrent caller already set it
    if (error) {
      console.error('ensureAssessmentToken update failed:', error.message);
      return null;
    }
    const { data: fresh } = await supabase.from('assessment_purchases')
      .select('link_token').eq('id', row.id).single();
    row.link_token = fresh?.link_token || token;
  }
  return `${APP_URL}/assessment/take/${row.link_token}`;
}

// Account-level JotForm API key. Lets us pull a submission's answers from the
// JotForm REST API on completion, so results reach the admin view even when a
// form's submission WebHook isn't configured (one global key instead of a
// per-form webhook). The jotform-webhook below remains a fallback.
const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || '';

// Fetch a patient's latest submission for one JotForm form and shape it like
// the jotform-webhook payload ({ formID, submissionID, pretty, answers, ... })
// so AssessmentResults renders it identically. Returns null when unavailable
// (no key, no matching submission, or API error).
async function fetchJotformSubmission(formId, email) {
  if (!JOTFORM_API_KEY || !formId) return null;
  try {
    const url = `https://api.jotform.com/form/${encodeURIComponent(formId)}/submissions`
      + `?apiKey=${encodeURIComponent(JOTFORM_API_KEY)}&limit=30&orderby=created_at`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`fetchJotformSubmission: JotForm API ${resp.status} for form ${formId}`);
      return null;
    }
    const json = await resp.json();
    const subs = Array.isArray(json?.content) ? json.content : [];
    if (!subs.length) return null;

    // Newest first, then prefer the submission carrying this buyer's email.
    subs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const wantEmail = String(email || '').toLowerCase();
    const sub = (wantEmail
      && subs.find(s => JSON.stringify(s.answers || {}).toLowerCase().includes(wantEmail)))
      || subs[0];
    if (!sub) return null;

    // Build a "Q:A, Q:A" pretty string + { question: answer } map, skipping
    // control fields (headings, page breaks) and empty answers.
    const flat = (v) => (v && typeof v === 'object')
      ? Object.values(v).filter(Boolean).join(' ')
      : String(v);
    const entries = Object.values(sub.answers || {})
      .filter(a => a && a.text && a.answer != null && a.answer !== '')
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const answers = {};
    const prettyParts = [];
    for (const a of entries) {
      const q = String(a.text).trim();
      const val = flat(a.answer).trim();
      if (!val) continue;
      answers[q] = val;
      prettyParts.push(`${q}:${val}`);
    }
    if (!prettyParts.length) return null;
    const score = extractAssessmentScore(answers);
    return {
      formID: String(formId),
      submissionID: String(sub.id || ''),
      pretty: prettyParts.join(', '),
      answers,
      ...(score ? { score } : {}),
      source: 'jotform-api',
      submitted_at: sub.created_at || new Date().toISOString()
    };
  } catch (e) {
    console.error('fetchJotformSubmission error:', e.message);
    return null;
  }
}

// Some assessment links use JotForm's named alias (form.jotform.com/<user>/<slug>)
// while the whole capture pipeline keys on the numeric form id. Resolve an
// alias by fetching the form page once and reading the embedded formID;
// numeric links resolve without a network call. Cached for the process life.
const jotformFormIdCache = new Map();
async function resolveJotformFormId(link) {
  const url = String(link || '').split('?')[0].trim();
  if (!url) return '';
  const direct = url.match(/jotform\.com\/(?:form\/)?(\d{10,})/);
  if (direct) return direct[1];
  if (jotformFormIdCache.has(url)) return jotformFormIdCache.get(url);
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    const html = await resp.text();
    const m = html.match(/"formID"\s*:\s*"?(\d{10,})/) || html.match(/\bform\/(\d{10,})/);
    const id = m ? m[1] : '';
    if (id) jotformFormIdCache.set(url, id);
    else console.warn(`resolveJotformFormId: no numeric formID found at ${url}`);
    return id;
  } catch (e) {
    console.error(`resolveJotformFormId: fetch failed for ${url}:`, e.message);
    return '';
  }
}

// Submission matching/recording + score extraction live in the shared
// recorder so the webhook, the notification-email ingest and the backfill
// scripts all behave identically.
const { recordAssessmentSubmission, extractAssessmentScore } = require('./services/assessmentRecorder');

app.post('/api/assessment-link/consume', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error' });
    const token = String(req.body?.token || '').trim();
    if (!/^[a-f0-9]{24,64}$/.test(token)) return res.json({ status: 'invalid' });

    const { data: rows } = await supabase.from('assessment_purchases')
      .select('id, patient_email, assessment_name, assessment_link, link_expires_at, link_opened_at, assessment_completed_at')
      .eq('link_token', token)
      .limit(1);
    const row = rows?.[0];
    if (!row) return res.json({ status: 'invalid' });

    const assessmentName = row.assessment_name || 'your assessment';
    if (row.assessment_completed_at) return res.json({ status: 'completed', assessmentName });
    if (row.link_expires_at && new Date(row.link_expires_at) < new Date()) {
      return res.json({ status: 'expired', assessmentName });
    }

    // Prefill the buyer's email into the JotForm (standard `email` unique
    // name) so the submission carries it — the jotform-webhook matches
    // purchases email-first, which otherwise depends on the customer
    // retyping the exact purchase email into the form.
    const links = String(row.assessment_link || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(l => row.patient_email
        ? `${l}${l.includes('?') ? '&' : '?'}email=${encodeURIComponent(row.patient_email)}`
        : l);
    if (!links.length) return res.json({ status: 'invalid' });
    const isBundle = links.length > 1;

    if (!row.link_opened_at) {
      await supabase.from('assessment_purchases')
        .update({ link_opened_at: new Date().toISOString() }).eq('id', row.id);
    }

    return res.json({ status: 'ok', assessmentName, links, isBundle });
  } catch (e) {
    console.error('assessment-link consume error:', e.message);
    res.status(500).json({ status: 'error' });
  }
});

// Client-side completion signal from the gate page: when the embedded JotForm
// reports submission-completed, the page spends the one-time link immediately
// (works with zero JotForm-account configuration). Only the link holder knows
// the token, and the only effect is expiring their own link. The JotForm
// webhook below remains the richer path (it also captures the answers).
app.post('/api/assessment-link/complete', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error' });
    const token = String(req.body?.token || '').trim();
    const formId = String(req.body?.formId || '').replace(/\D/g, '');
    if (!/^[a-f0-9]{24,64}$/.test(token)) return res.json({ status: 'invalid' });

    const { data: rows } = await supabase.from('assessment_purchases')
      .select('id, patient_email, assessment_link, assessment_completed_at, submission_data')
      .eq('link_token', token)
      .limit(1);
    const row = rows?.[0];
    if (!row) return res.json({ status: 'invalid' });
    if (!row.assessment_completed_at) {
      await supabase.from('assessment_purchases')
        .update({ assessment_completed_at: new Date().toISOString() })
        .eq('id', row.id);
    }

    // Capture the answers server-side via the JotForm API so results appear in
    // the admin view even when the form's submission webhook isn't configured.
    // Only pull the form that belongs to this purchase, and never clobber a
    // submission the webhook may already have stored.
    if (JOTFORM_API_KEY && !row.submission_data) {
      // Trust the client-sent formId only when it matches this purchase's own
      // link; otherwise (alias links yield no numeric id client-side) resolve
      // the id from the stored link instead of skipping capture.
      let effectiveFormId = formId && String(row.assessment_link || '').includes(formId) ? formId : '';
      if (!effectiveFormId) {
        effectiveFormId = await resolveJotformFormId(String(row.assessment_link || '').split(',')[0]);
      }
      if (effectiveFormId) {
        let submission = await fetchJotformSubmission(effectiveFormId, row.patient_email);
        if (!submission) {
          // JotForm may not have persisted the submission yet — retry once.
          await new Promise(r => setTimeout(r, 2000));
          submission = await fetchJotformSubmission(effectiveFormId, row.patient_email);
        }
        if (submission) {
          const { error } = await supabase.from('assessment_purchases')
            .update({ submission_data: submission })
            .eq('id', row.id)
            .is('submission_data', null);
          if (error) console.error(`assessment-link complete: submission_data update failed for ${row.id}:`, error.message);
          else console.log(`assessment-link complete: captured JotForm submission for ${row.id} (form ${effectiveFormId})`);
        } else {
          console.warn(`assessment-link complete: no JotForm submission found for ${row.id} (form ${effectiveFormId}, ${row.patient_email})`);
        }
      } else {
        console.warn(`assessment-link complete: no resolvable formId for purchase ${row.id} (sent "${formId}", link "${row.assessment_link}") — skipping capture`);
      }
    }
    return res.json({ status: 'completed' });
  } catch (e) {
    console.error('assessment-link complete error:', e.message);
    res.status(500).json({ status: 'error' });
  }
});

// Bundle part-completion: capture one sub-form's answers into submission_data
// WITHOUT expiring the bundle link (the buyer still has other parts to take).
// Bundles store submission_data as { submissions: [...] } — one entry per form.
app.post('/api/assessment-link/capture', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error' });
    const token = String(req.body?.token || '').trim();
    const formId = String(req.body?.formId || '').replace(/\D/g, '');
    const partLink = String(req.body?.link || '').split('?')[0].trim();
    if (!/^[a-f0-9]{24,64}$/.test(token)) return res.json({ status: 'invalid' });
    res.json({ status: 'ok' }); // respond immediately; don't block the buyer's UI
    if (!JOTFORM_API_KEY) return;

    const { data: rows } = await supabase.from('assessment_purchases')
      .select('id, patient_email, assessment_link, submission_data')
      .eq('link_token', token)
      .limit(1);
    const row = rows?.[0];
    if (!row) return;
    // Trust the client-sent formId only when it matches this purchase's own
    // links; alias links have no numeric id client-side, so fall back to the
    // part link — but only if it is one of the purchase's stored links.
    let effectiveFormId = formId && String(row.assessment_link || '').includes(formId) ? formId : '';
    if (!effectiveFormId && partLink) {
      const ownLinks = String(row.assessment_link || '').split(',').map(s => s.trim().split('?')[0]).filter(Boolean);
      if (ownLinks.includes(partLink)) effectiveFormId = await resolveJotformFormId(partLink);
    }
    if (!effectiveFormId) {
      console.warn(`assessment-link capture: no resolvable formId for purchase ${row.id} (sent "${formId}", link "${partLink}")`);
      return;
    }
    let submission = await fetchJotformSubmission(effectiveFormId, row.patient_email);
    if (!submission) {
      await new Promise(r => setTimeout(r, 2000));
      submission = await fetchJotformSubmission(effectiveFormId, row.patient_email);
    }
    if (!submission) {
      console.warn(`assessment-link capture: no JotForm submission for ${row.id} (form ${effectiveFormId})`);
      return;
    }

    // Merge into the submissions array (upsert by formID), tolerating an
    // earlier flat webhook payload by wrapping it into the array.
    const existing = (row.submission_data && typeof row.submission_data === 'object') ? row.submission_data : null;
    const list = existing && Array.isArray(existing.submissions)
      ? existing.submissions.slice()
      : (existing ? [existing] : []);
    const idx = list.findIndex(s => String(s.formID) === String(effectiveFormId));
    if (idx >= 0) list[idx] = submission; else list.push(submission);
    const { error } = await supabase.from('assessment_purchases')
      .update({ submission_data: { submissions: list } })
      .eq('id', row.id);
    if (error) console.error(`assessment-link capture: update failed for ${row.id}:`, error.message);
    else console.log(`assessment-link capture: stored form ${effectiveFormId} for ${row.id} (${list.length} total)`);
  } catch (e) {
    console.error('assessment-link capture error:', e.message);
  }
});

// JotForm submission webhook. Add https://limitlessbrainlab-eight.vercel.app/api/jotform-webhook
// under each form's Settings → Integrations → WebHooks. JotForm POSTs
// multipart/form-data with formID, submissionID, pretty ("Q:A, Q:A") and
// rawRequest (JSON). Marks the matching purchase completed, stores the
// answers, and emails the full Q&A to the admin inbox.
app.post('/api/jotform-webhook', require('multer')().none(), async (req, res) => {
  // Always 200 — JotForm retries/disables on failures and there is no value
  // in retrying a submission we could not match.
  res.json({ received: true });
  try {
    if (!supabase) return;
    const formID = String(req.body?.formID || '').trim();
    const submissionID = String(req.body?.submissionID || '').trim();
    const pretty = String(req.body?.pretty || '');
    let answers = null;
    try { answers = JSON.parse(req.body?.rawRequest || 'null'); } catch (_) {}

    if (!formID || !submissionID) return;

    // Shared recorder: email-first matching, dedupe (`jotform:{submissionID}`),
    // completed_at + submission_data write — identical to the email-ingest path.
    const rec = await recordAssessmentSubmission({ formID, submissionID, pretty, answers, source: 'jotform-webhook' });
    if (rec.status === 'duplicate' || rec.status === 'skipped') return;
    const purchase = rec.purchase || null;
    const submitterEmail = rec.submitterEmail || null;

    // Q&A email to the admin inbox regardless of match
    if (mailerConfigured) {
      const qaRows = pretty
        ? pretty.split(', ').map(pair => {
            const idx = pair.indexOf(':');
            const q = idx > -1 ? pair.slice(0, idx) : pair;
            const a = idx > -1 ? pair.slice(idx + 1) : '';
            return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#555;font-size:13px;">${escapeHtml(q)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#111;font-size:13px;font-weight:600;">${escapeHtml(a)}</td></tr>`;
          }).join('')
        : `<tr><td colspan="2" style="padding:6px 10px;font-size:12px;color:#555;"><pre>${escapeHtml(JSON.stringify(answers, null, 2))}</pre></td></tr>`;

      emailTransporter.sendMail({
        from: EMAIL_FROM,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: `Assessment completed: ${purchase?.assessment_name || `form ${formID}`}${submitterEmail ? ` — ${submitterEmail}` : ''}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="padding: 24px 28px;">
              <h2 style="color: #323956; margin-top: 0;">Assessment Completed</h2>
              <p><strong>Assessment:</strong> ${purchase?.assessment_name || `JotForm ${formID}`}</p>
              <p><strong>Patient:</strong> ${submitterEmail || purchase?.patient_email || 'unknown'}</p>
              <p><strong>Submission ID:</strong> ${submissionID}</p>
              <p><strong>Date:</strong> ${new Date().toISOString()}</p>
              <h3 style="color: #323956; margin-top: 18px;">Questions &amp; Answers</h3>
              <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">${qaRows}</table>
            </div>
            ${CONTACT_STRIP_HTML}
          </div>
        `
      }).catch(err => console.error('JotForm completion email failed:', err.message));
    }
  } catch (e) {
    console.error('jotform-webhook error:', e.message);
  }
});

app.post('/api/confirm-report-credits', async (req, res) => {
  try {
    const result = await applyReportCredits(req.body?.sessionId);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, message: result.message });
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('confirm-report-credits error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Create Stripe Checkout for Brain Coaching Session
app.post('/api/create-coaching-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const COMMON_CALENDLY = 'https://calendly.com/admin-bettroi/30min';
    const { coachId, coachName, coachEmail, calendlyUrl = COMMON_CALENDLY, price, patientEmail, patientName, currency = 'inr' } = req.body;

    if (!patientEmail || !price) {
      return res.status(400).json({
        success: false,
        message: 'Patient email and price are required'
      });
    }

    const resolvedCalendlyUrl = calendlyUrl || COMMON_CALENDLY;

    // Convert amount to smallest currency unit (paise for INR, cents for USD)
    const multiplier = currency.toLowerCase() === 'inr' ? 100 : 100;
    const amountInSmallestUnit = Math.round(price * multiplier);

    // Send the patient back to the exact site they paid from (production,
    // staging, or local) instead of a fixed env URL. Otherwise a production
    // patient is bounced to staging after paying and the booking / "already
    // booked" state is recorded on the wrong environment. Validate the origin
    // against allowedOrigins to avoid an open redirect, and never fall back to
    // staging — default to production.
    let requestOrigin = req.get('origin');
    if (!requestOrigin && req.get('referer')) {
      try { requestOrigin = new URL(req.get('referer')).origin; } catch (e) { requestOrigin = null; }
    }
    const FRONTEND_URL = (requestOrigin && allowedOrigins.includes(requestOrigin))
      ? requestOrigin
      : resolveCheckoutBase(req);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ...CHECKOUT_UI,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Brain Coaching Session with ${coachName}`,
              description: '30-minute online brain coaching session',
              images: checkoutProductImages(req),
              metadata: {
                type: 'coaching_session',
                coach_id: coachId,
                coach_name: coachName
              }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        }
      ],
      mode: 'payment',
      customer_email: patientEmail,
      success_url: `${FRONTEND_URL}/dashboard/brain-coach?payment=success&coach=${encodeURIComponent(coachName)}&calendly=${encodeURIComponent(resolvedCalendlyUrl)}&amount=${price}&currency=${currency.toLowerCase()}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/dashboard/brain-coach?payment=cancelled`,
      metadata: {
        type: 'coaching_session',
        coach_id: coachId,
        coach_name: coachName,
        coach_email: coachEmail || '',
        calendly_url: resolvedCalendlyUrl,
        patient_email: patientEmail,
        patient_name: patientName || ''
      }
    });


    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Error creating coaching checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// =====================================================
// STRIPE PAYMENT INTEGRATION - Assessment Services
// =====================================================

// Create Stripe Checkout Session for Assessment Purchases
app.post('/api/create-assessment-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const { assessmentId, assessmentName, customerEmail, customerName, currency = 'USD', amount, assessmentLink, patientId, clinicId, source, successUrl, cancelUrl } = req.body;

    if (!customerEmail || !amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Customer email, amount, and currency are required'
      });
    }

    // Convert amount to smallest currency unit (cents/paise)
    const currencyMultipliers = {
      'INR': 100,
      'USD': 100,
      'GBP': 100,
      'EUR': 100,
      'AED': 100,
      'AUD': 100,
      'CAD': 100,
      'SGD': 100
    };

    const multiplier = currencyMultipliers[currency] || 100;
    const amountInSmallestUnit = Math.round(amount * multiplier);

    const FRONTEND_URL = resolveCheckoutBase(req);

    // Redirect back to the EXACT domain the payment was started from (req.headers.origin),
    // so a patient paying on limitlessbrainlab.com is not bounced to the Vercel URL — where
    // they have no session and get redirected to /login. Fall back to FRONTEND_URL only if
    // the Origin header is absent (e.g. server-to-server calls).
    const redirectBase = req.headers.origin || FRONTEND_URL;

    // Default return must be a PUBLIC page — /dashboard/* is login-protected,
    // so a guest buyer would be bounced to /login with no confirmation. The
    // booking page has a payment=success handler (verify-session + thank-you
    // modal). Authenticated callers (patient portal) pass their own successUrl.
    const finalSuccessUrl = successUrl || `${redirectBase}/neurosense-booking?payment=success&assessment=${assessmentId}&session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${redirectBase}/neurosense-booking?payment=cancelled`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      ...CHECKOUT_UI,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${assessmentName} - Brain Assessment`,
              description: `Unlock your ${assessmentName} to understand your brain health better.`,
              images: checkoutProductImages(req),
              metadata: {
                assessment_id: assessmentId,
                type: 'assessment'
              }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        assessment_id: assessmentId,
        assessment_name: assessmentName,
        assessment_link: assessmentLink || '',
        customer_email: customerEmail,
        customer_name: customerName || '',
        patient_id: patientId || '',
        clinic_id: clinicId || '',
        source: source || 'website',
        type: 'assessment'
      }
    });


    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Assessment checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
  }
});

// Send assessment JotForm link email after successful purchase
// Email a wallet invoice/receipt to the patient
app.post('/api/wallet/invoice-email', async (req, res) => {
  try {
    const { email, name, invoice } = req.body || {};
    if (!email || !invoice || !invoice.id) {
      return res.status(400).json({ success: false, message: 'email and invoice are required' });
    }

    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const amount = Number(invoice.amount) || 0;
    const issued = invoice.date
      ? new Date(invoice.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Your Neuro360 Invoice ${invoice.id}`,
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:20px;font-family:Arial,sans-serif;background:#f4f7fa;">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
            <div style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:24px;text-align:center;">
              <img src="cid:company-logo" alt="Neuro360" style="width:70px;height:70px;border-radius:50%;object-fit:cover;margin-bottom:8px;" />
              <h1 style="color:#fff;margin:0;font-size:20px;">Invoice ${esc(invoice.id)}</h1>
            </div>
            <div style="padding:24px;color:#1f2937;">
              <p style="margin:0 0 4px;">Hi ${esc(name || 'there')},</p>
              <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Here is your invoice from Neuro360, issued ${esc(issued)}.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">${esc(invoice.description || 'Purchase')}</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;">$${amount.toFixed(2)}</td></tr>
                <tr><td style="padding:12px 0;font-weight:700;">Total</td>
                    <td style="padding:12px 0;font-weight:700;text-align:right;">$${amount.toFixed(2)} USD</td></tr>
                <tr><td style="padding:4px 0;color:#6b7280;">Status</td>
                    <td style="padding:4px 0;text-align:right;color:#15803d;font-weight:600;">${esc(invoice.status || 'Paid')}</td></tr>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:12px;text-align:center;">Thank you for choosing Neuro360. This is a computer-generated invoice.</p>
            </div>
          </div>
        </body></html>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`SUCCESS: Wallet invoice ${invoice.id} emailed to ${email}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Wallet invoice email error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to send invoice email' });
  }
});

app.post('/api/send-assessment-email', async (req, res) => {
  try {
    let { customerEmail, customerName, assessmentName, assessmentLink, amountPaid, currency, transactionId, source, clinicName, clinicId, patientPhone, patientDob, patientGender, patientUid, adminOnly, dedupeKey } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const hideAccessLink = assessmentLink === 'no_link';
    const skipCustomerEmail = !assessmentLink && !hideAccessLink;

    // If clinic name not provided, look it up directly by clinic ID
    if ((!clinicName || clinicName === 'Loading...' || clinicName === '') && supabase) {
      try {
        // If clinicId provided, look up clinic name directly
        if (clinicId) {
          const { data: clinicRow } = await supabase
            .from('clinics')
            .select('name')
            .eq('id', clinicId)
            .single();
          clinicName = clinicRow?.name || '';
          console.log('DEBUG: Clinic name from clinicId:', clinicName);
        }

        // Fallback: find patient's most recent record by email
        if (!clinicName) {
          const { data: patients } = await supabase
            .from('patients')
            .select('clinic_id, org_id')
            .eq('email', customerEmail.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1);

          const patientRow = patients && patients.length > 0 ? patients[0] : null;
          const cId = patientRow?.clinic_id || patientRow?.org_id;
          if (cId) {
            const { data: clinicRow } = await supabase
              .from('clinics')
              .select('name')
              .eq('id', cId)
              .single();
            clinicName = clinicRow?.name || '';
          }
        }
      } catch (lookupErr) {
        console.warn('Clinic name lookup failed:', lookupErr.message);
      }
    }

    // One-time gate URL replaces the raw JotForm link(s) in the email; the
    // gate page handles bundles by listing the individual parts itself.
    let takeUrl = null;
    if (!hideAccessLink && assessmentLink) {
      try {
        takeUrl = await ensureAssessmentToken({
          sessionId: transactionId,
          email: customerEmail
        });
      } catch (tokenErr) {
        console.error('ensureAssessmentToken (send-assessment-email) failed:', tokenErr.message);
      }
    }
    const emailLink = takeUrl || assessmentLink;

    const links = takeUrl ? [takeUrl] : (assessmentLink || '').split(',').filter(l => l.trim());
    const assessmentNames = ASSESSMENT_NAMES;

    const linkButtonsHtml = links.length <= 1
      ? `
        <tr>
          <td style="padding: 0 32px 8px;" align="center">
            <a href="${emailLink}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px;">
              Take Your Assessment Now
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 32px 24px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Or copy this link: <a href="${emailLink}" style="color: #4A6FA5;">${emailLink}</a>${takeUrl ? '<br>This link is for one-time use — it expires once the assessment is completed.' : ''}
            </p>
          </td>
        </tr>`
      : `
        <tr>
          <td style="padding: 0 32px 24px;">
            <h3 style="color: #323956; margin: 0 0 16px; font-size: 16px; text-align: center;">Your Assessment Links</h3>
            ${links.map((link, i) => `
              <div style="margin-bottom: 12px; text-align: center;">
                <a href="${link.trim()}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  ${assessmentNames[link.trim()] || 'Assessment ' + (i + 1)}
                </a>
              </div>
            `).join('')}
          </td>
        </tr>`;

    const mailOptions = {
      from: EMAIL_FROM,
      to: customerEmail,
      subject: `Your ${assessmentName} is ready - Limitless Brain Lab`,
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                      <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
                      <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                      <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                        ASSESSMENT ACCESS
                      </p>
                    </td>
                  </tr>

                  <!-- Success Message -->
                  <tr>
                    <td style="padding: 32px 32px 16px; text-align: center;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="text-align: center;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 20px;">
                              <tr>
                                <td width="80" height="80" align="center" valign="middle" style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 40px; line-height: 1; color: #ffffff;">&#10003;</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      <h2 style="color: #323956; margin: 0 0 8px; font-size: 24px;">Payment Successful!</h2>
                      <p style="color: #666; margin: 0; font-size: 15px;">
                        ${customerName ? 'Hi ' + customerName + ',' : 'Hi,'} your <strong>${assessmentName}</strong> is now ready to take.
                      </p>
                    </td>
                  </tr>

                  <!-- Patient Details -->
                  <tr>
                    <td style="padding: 0 32px 16px;">
                      <div style="background: #f0f4ff; border-radius: 12px; padding: 20px; border-left: 4px solid #323956;">
                        <h3 style="color: #323956; margin: 0 0 14px; font-size: 15px;">Patient Details</h3>
                        <table width="100%" style="border-collapse: collapse;">
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Patient Name</td>
                            <td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">${customerName || 'N/A'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Email</td>
                            <td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">${customerEmail}</td>
                          </tr>
                          ${patientUid ? '<tr><td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Patient ID</td><td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">' + patientUid + '</td></tr>' : ''}
                          ${patientPhone ? '<tr><td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Phone</td><td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">' + patientPhone + '</td></tr>' : ''}
                          ${patientGender ? '<tr><td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Gender</td><td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">' + patientGender + '</td></tr>' : ''}
                          ${patientDob ? '<tr><td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e0e5f0;">Date of Birth</td><td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e0e5f0;">' + patientDob + '</td></tr>' : ''}
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px;">Clinic</td>
                            <td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px;">${clinicName || 'N/A'}</td>
                          </tr>
                        </table>
                      </div>
                    </td>
                  </tr>

                  <!-- Order Details -->
                  <tr>
                    <td style="padding: 0 32px 24px;">
                      <div style="background: #f8f9fc; border-radius: 12px; padding: 20px;">
                        <h3 style="color: #323956; margin: 0 0 14px; font-size: 15px;">Order Details</h3>
                        <table width="100%" style="border-collapse: collapse;">
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Assessment</td>
                            <td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${assessmentName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Amount Paid</td>
                            <td style="padding: 7px 0; color: #10b981; font-weight: 700; text-align: right; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${currency || 'USD'} ${amountPaid || '0.00'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 7px 0; color: #666; font-size: 13px; border-bottom: 1px solid #e5e7eb;">Date & Time</td>
                            <td style="padding: 7px 0; color: #323956; font-weight: 600; text-align: right; font-size: 13px; border-bottom: 1px solid #e5e7eb;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                          </tr>
                          ${transactionId ? '<tr><td style="padding: 7px 0; color: #666; font-size: 13px;">Transaction ID</td><td style="padding: 7px 0; color: #666; font-size: 11px; text-align: right; font-family: monospace;">' + transactionId.slice(-12) + '</td></tr>' : ''}
                        </table>
                      </div>
                    </td>
                  </tr>

                  <!-- Assessment Link Button(s) -->
                  ${hideAccessLink ? '' : linkButtonsHtml}

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #888; margin: 0; font-size: 12px; text-align: center;">
                        Thank you for choosing Limitless Brain Lab! If you have any questions, contact us at info@limitlessbrainlab.com
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    if (!skipCustomerEmail && !adminOnly) {
      await emailTransporter.sendMail(mailOptions);
      console.log('SUCCESS: Assessment email sent to', customerEmail);
    }

    // Send payment notification to admin (limitlessbrainlab@gmail.com)
    try {
      const purchaseSource = source === 'patient_dashboard' ? 'Patient Dashboard' : source === 'clinic' ? 'Clinic Dashboard' : 'Website';
      const adminNotificationMail = {
        from: EMAIL_FROM,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: `New Payment Received - ${assessmentName} (${currency || 'USD'} ${amountPaid || '0.00'})`,
        attachments: getLogoAttachment(),
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                        <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
                        <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 20px; font-weight: 700;">Limitless Brain Lab</h1>
                        <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                          PAYMENT NOTIFICATION
                        </p>
                      </td>
                    </tr>

                    <!-- Payment Alert -->
                    <tr>
                      <td style="padding: 28px 32px 16px; text-align: center;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 16px; line-height: 60px;">
                          <span style="font-size: 28px; color: #ffffff;">&#36;</span>
                        </div>
                        <h2 style="color: #323956; margin: 0 0 6px; font-size: 22px;">New Payment Received!</h2>
                        <p style="color: #10b981; margin: 0; font-size: 28px; font-weight: 800;">${currency || 'USD'} ${amountPaid || '0.00'}</p>
                      </td>
                    </tr>

                    <!-- Payment Details -->
                    <tr>
                      <td style="padding: 0 32px 24px;">
                        <div style="background: #f8f9fc; border-radius: 12px; padding: 20px;">
                          <h3 style="color: #323956; margin: 0 0 16px; font-size: 15px;">Payment Details</h3>
                          <table width="100%" style="border-collapse: collapse;">
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Patient Name</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${customerName || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Patient Email</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${customerEmail}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Clinic</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${clinicName || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Item Purchased</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${assessmentName}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Amount</td>
                              <td style="padding: 10px 0; color: #10b981; font-weight: 700; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${currency || 'USD'} ${amountPaid || '0.00'}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e7eb; font-size: 14px;">Purchase Source</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${purchaseSource}</td>
                            </tr>
                            <tr>
                              <td style="padding: 10px 0; color: #666; font-size: 14px;">Date & Time</td>
                              <td style="padding: 10px 0; color: #323956; font-weight: 600; text-align: right; font-size: 14px;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td>
                            </tr>
                            ${transactionId ? '<tr><td style="padding: 10px 0; color: #666; border-top: 1px solid #e5e7eb; font-size: 14px;">Transaction ID</td><td style="padding: 10px 0; color: #666; font-size: 11px; text-align: right; border-top: 1px solid #e5e7eb; font-family: monospace;">' + transactionId + '</td></tr>' : ''}
                          </table>
                        </div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8f9fc; padding: 16px 32px; border-top: 1px solid #e5e7eb;">
                        <p style="color: #aaa; margin: 0; font-size: 11px; text-align: center;">
                          This is an automated payment notification from Limitless Brain Lab.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      };

      if (await claimNotificationOnce(dedupeKey)) {
        await emailTransporter.sendMail(adminNotificationMail);
        console.log('SUCCESS: Admin payment notification sent to limitlessbrainlab@gmail.com');
      } else {
        console.log('Admin payment notification skipped (already sent):', dedupeKey);
      }
    } catch (adminErr) {
      console.warn('Admin notification email failed:', adminErr.message);
    }

    res.json({ success: true, message: 'Assessment email sent successfully', takeUrl });
  } catch (error) {
    console.error('Assessment email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
  }
});


// Create Customer Portal Session (for managing subscriptions)
app.post('/api/stripe/create-portal-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    const { customerEmail, returnUrl } = req.body;

    // Find or create customer
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1
    });

    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: customerEmail
      });
      customerId = customer.id;
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${req.headers.origin}/dashboard/subscription`
    });

    res.json({
      success: true,
      url: portalSession.url
    });

  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stripe Webhook to handle successful payments
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  if (!webhookSecret) {
    // Never trust an unsigned webhook body — refuse rather than process forged events.
    console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentType = session.metadata?.type || 'frequency'; // Default to frequency for backwards compatibility


    // Save purchase to database via Supabase
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Helper: save to patient_payments table (per-clinic patient payment tracking)
        const savePatientPayment = async (email, type, itemName, amount, currency, assessmentId = null) => {
          try {
            // Find patient's clinic_id
            let clinicId = session.metadata?.clinic_id || null;
            if (!clinicId && email) {
              const { data: patient } = await supabase
                .from('patients')
                .select('clinic_id')
                .eq('email', email.toLowerCase())
                .limit(1)
                .single();
              clinicId = patient?.clinic_id || null;
            }
            await supabase.from('patient_payments').insert({
              clinic_id: clinicId,
              patient_email: email.toLowerCase(),
              patient_name: session.metadata?.customer_name || '',
              amount: amount,
              currency: currency || 'USD',
              status: 'completed',
              type: type,
              item_name: itemName,
              assessment_id: assessmentId,
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              source: type === 'assessment' ? 'About the Brain' : type === 'frequency' ? 'Frequencies' : type === 'meditation' ? 'Meditations' : 'Webhook',
              created_at: new Date().toISOString()
            });
            console.log(`SUCCESS: Patient payment saved - ${type}: ${itemName} for ${email}`);
          } catch (err) {
            console.warn('patient_payments insert skipped:', err.message);
          }
        };

        // Handle subscription payments — full grant + payment rows + emails via
        // the shared idempotent helper (also called by /api/stripe/verify-session,
        // the frontend confirm path, so purchases record even when only one of
        // the two paths fires).
        if (paymentType === 'subscription') {
          const subResult = await applySubscriptionPurchase(session);
          if (!subResult.ok) {
            console.error('Webhook applySubscriptionPurchase failed:', subResult.message);
          }

        } else if (paymentType === 'assessment') {
          // Handle assessment purchases
          const assessmentId = session.metadata?.assessment_id;
          const assessmentName = session.metadata?.assessment_name;
          const assessmentLink = session.metadata?.assessment_link;
          const customerName = session.metadata?.customer_name || '';
          const purchaseSource = session.metadata?.source || 'website';
          const patientId = session.metadata?.patient_id || null;
          const metaClinicId = session.metadata?.clinic_id || null;

          if (purchaseSource === 'patient_dashboard') {
            // Patient Dashboard purchase → save to patient_payments with patient_id and clinic_id
            const patientPaymentData = {
              clinic_id: metaClinicId || null,
              patient_id: patientId || null,
              patient_email: session.customer_email.toLowerCase(),
              patient_name: customerName || '',
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'assessment',
              item_name: assessmentName || 'Brain Assessment',
              assessment_id: assessmentId,
              assessment_link: assessmentLink || '',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              source: 'About the Brain',
              created_at: new Date().toISOString()
            };

            let { error: patPayErr } = await supabase
              .from('patient_payments')
              .insert(patientPaymentData);

            // If insert fails (columns may not exist yet), retry with base columns only
            if (patPayErr) {
              console.warn('patient_payments insert failed with extended columns, retrying with base columns:', patPayErr.message);
              const basePaymentData = {
                clinic_id: metaClinicId || null,
                patient_email: session.customer_email.toLowerCase(),
                patient_name: customerName || '',
                amount: session.amount_total / 100,
                currency: session.currency?.toUpperCase() || 'USD',
                status: 'completed',
                type: 'assessment',
                item_name: assessmentName || 'Brain Assessment',
                stripe_session_id: session.id,
                stripe_payment_intent: session.payment_intent,
                created_at: new Date().toISOString()
              };
              const { error: retryErr } = await supabase
                .from('patient_payments')
                .insert(basePaymentData);
              if (retryErr) {
                console.error('Error saving patient_payments (retry):', retryErr);
              } else {
                console.log(`SUCCESS: Patient payment saved (base columns) - ${assessmentName} for ${session.customer_email}`);
              }
            } else {
              console.log(`SUCCESS: Patient dashboard assessment payment saved - ${assessmentName} for ${session.customer_email}`);
            }

            // Also save to assessment_purchases so the button shows "Get Assessment"
            await supabase.from('assessment_purchases').insert({
              patient_email: session.customer_email.toLowerCase(),
              assessment_id: assessmentId,
              assessment_name: assessmentName,
              assessment_link: assessmentLink || '',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              amount_paid: session.amount_total / 100,
              currency: session.currency?.toUpperCase(),
              status: 'completed',
              purchased_at: new Date().toISOString()
            }).catch(err => console.warn('assessment_purchases insert skipped:', err.message));

          } else {
            // Website purchase → save to assessment_purchases table
            const assessmentPurchaseData = {
              patient_email: session.customer_email.toLowerCase(),
              assessment_id: assessmentId,
              assessment_name: assessmentName,
              assessment_link: assessmentLink || '',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              amount_paid: session.amount_total / 100,
              currency: session.currency?.toUpperCase(),
              status: 'completed',
              purchased_at: new Date().toISOString()
            };

            const { error: assessError } = await supabase
              .from('assessment_purchases')
              .insert(assessmentPurchaseData);

            if (assessError) {
              console.error('Error saving assessment purchase:', assessError);
            }
          }

          // Save to payments table for SuperAdmin dashboard (both sources)
          await supabase.from('payments').insert({
            clinic_id: metaClinicId || null,
            patient_email: session.customer_email.toLowerCase(),
            amount: session.amount_total / 100,
            currency: session.currency?.toUpperCase() || 'USD',
            status: 'completed',
            type: 'assessment',
            package_name: assessmentName || 'Brain Assessment',
            payment_method: 'stripe',
            payment_id: session.payment_intent || session.id,
            stripe_payment_id: session.payment_intent || session.id,
            stripe_session_id: session.id,
            source: purchaseSource,
            created_at: new Date().toISOString()
          }).catch(err => console.warn('payments table insert skipped:', err.message));

          // One-time gate URL replaces the raw JotForm link in the email
          let assessmentTakeUrl = null;
          try {
            assessmentTakeUrl = await ensureAssessmentToken({
              sessionId: session.id,
              email: session.customer_email,
              assessmentId
            });
          } catch (tokenErr) {
            console.error('ensureAssessmentToken (webhook) failed:', tokenErr.message);
          }
          const assessmentEmailLink = assessmentTakeUrl || assessmentLink;

          // Send assessment link + admin emails exactly once across this
          // webhook and the /api/stripe/verify-session confirm path (shared
          // dedupe key) — whichever runs first sends the pair. Never claim
          // without a link in hand: that would block the other path from
          // sending while the customer got nothing.
          if (!assessmentEmailLink) {
            console.error(`Assessment email skipped - no link available for session ${session.id} (webhook)`);
          }
          const assessmentEmailsClaimed = (mailerConfigured && assessmentEmailLink)
            ? await claimNotificationOnce(`assessment:${session.id}:emails`)
            : false;

          // Send assessment link email to customer
          if (assessmentEmailsClaimed && assessmentEmailLink) {
            const assessmentMailOptions = {
              from: EMAIL_FROM,
              to: session.customer_email,
              subject: `Your ${assessmentName} is ready - Limitless Brain Lab`,
              attachments: getLogoAttachment(),
              html: getAssessmentReadyEmailHtml({
                customerName,
                assessmentName,
                amountLabel: `${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}`,
                orderId: session.id.slice(-12),
                link: assessmentEmailLink
              })
            };

            emailTransporter.sendMail(assessmentMailOptions)
              .then(() => console.log(`SUCCESS: Assessment email sent to ${session.customer_email} (webhook)`))
              .catch(err => console.error('Assessment email sending failed:', err.message));
          }

          // Also notify admin about the purchase
          if (assessmentEmailsClaimed) {
            const adminMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `New Assessment Purchase: ${assessmentName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                  <div style="padding: 24px 28px;">
                    <h2 style="color: #323956; margin-top: 0;">New Assessment Purchase</h2>
                    <p><strong>Customer:</strong> ${customerName || 'N/A'} (${session.customer_email})</p>
                    <p><strong>Assessment:</strong> ${assessmentName}</p>
                    <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                    <p><strong>Session ID:</strong> ${session.id}</p>
                    <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                  </div>
                  ${CONTACT_STRIP_HTML}
                </div>
              `
            };

            emailTransporter.sendMail(adminMailOptions)
              .catch(err => console.error('Admin email failed:', err.message));
          }

        } else if (paymentType === 'clinic_report') {
          // Handle clinic report package purchases
          const clinicId = session.metadata?.clinic_id;
          const reports = parseInt(session.metadata?.reports || '0', 10);
          const packageId = session.metadata?.package_id;
          const clinicTypeFromMeta = session.metadata?.clinic_type || 'lbl_partner';

          console.log(`PAYMENT: Clinic report purchase - clinicId: ${clinicId}, reports: ${reports}, amount: ${session.amount_total / 100}`);

          if (clinicId) {
            // 1. Add report credits (idempotent + service-role). Shared with the
            // /api/confirm-report-credits frontend path; only one of them actually
            // applies the credits for a given session. Does NOT reset reports_used
            // (buying a pack adds to the allowance, it must not wipe prior usage).
            try {
              const credit = await applyReportCredits(session.id);
              if (credit.ok) {
                console.log(`SUCCESS: Clinic ${clinicId} reports_allowed now ${credit.reportsAllowed}${credit.alreadyApplied ? ' (already applied)' : ` (+${credit.added})`}`);
              } else {
                console.error('Webhook applyReportCredits failed:', credit.message);
              }
            } catch (creditErr) {
              console.error('Webhook applyReportCredits threw:', creditErr.message);
            }

            // 2. The payments-table record is written inside applyReportCredits
            // (idempotently, shared with the frontend confirm path) so it lands
            // even when this webhook does not reach the deployment.
            // 3. The clinic confirmation + internal-copy emails are sent by
            // sendClinicReportPurchaseEmails inside applyReportCredits, claimed
            // once per session across this webhook and the frontend confirm path.
          }


        } else {
          // Handle frequency/meditation purchases

          // Check if this is a meditation purchase (has type: 'meditation' in product metadata)
          const isMeditationPurchase = session.metadata?.pack_id?.startsWith('solfeggio_') ||
                                       session.metadata?.pack_id?.includes('meditation');

          if (isMeditationPurchase) {
            // Save to meditation_purchases table. Columns must match the live
            // table (patient_email, meditation_id, purchased_at) or the insert
            // fails and the purchase is never recorded — same trap as the
            // frequency branch below. Idempotent via the (patient_email,
            // meditation_id) unique key.
            const meditationPurchaseData = {
              patient_email: session.customer_email.toLowerCase(),
              meditation_id: session.metadata.pack_id,
              purchased_at: new Date().toISOString()
            };

            const { error: medError } = await supabase
              .from('meditation_purchases')
              .upsert(meditationPurchaseData, { onConflict: 'patient_email,meditation_id', ignoreDuplicates: true });

            if (medError) {
              console.error('Error saving meditation purchase to database:', medError);
            }
            // Save to payments table for SuperAdmin
            await supabase.from('payments').insert({
              clinic_id: null,
              patient_email: session.customer_email.toLowerCase(),
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'meditation',
              package_name: session.metadata.pack_id?.replace(/_/g, ' ') || 'Meditation Pack',
              payment_method: 'stripe',
              payment_id: session.payment_intent || session.id,
              stripe_payment_id: session.payment_intent || session.id,
              stripe_session_id: session.id,
              created_at: new Date().toISOString()
            }).catch(err => console.warn('payments insert skipped:', err.message));
            // Save to patient_payments (per-clinic tracking)
            await savePatientPayment(session.customer_email, 'meditation', session.metadata.pack_id?.replace(/_/g, ' ') || 'Meditation Pack', session.amount_total / 100, session.currency?.toUpperCase(), session.metadata.pack_id || null);
          } else {
            // Save to frequency_purchases table. Columns must match the live
            // table (patient_email, frequency_id, pack_id, purchased_at) or the
            // insert fails and the purchase is never recorded -> pack shows
            // "Buy Now" after payment.
            const frequencyPurchaseData = {
              patient_email: session.customer_email.toLowerCase(),
              pack_id: session.metadata.pack_id,
              frequency_id: session.metadata.pack_id,
              purchased_at: new Date().toISOString()
            };

            const { error: freqError } = await supabase
              .from('frequency_purchases')
              .insert(frequencyPurchaseData);

            if (freqError) {
              console.error('Error saving frequency purchase to database:', freqError);
            }
            // Save to payments table for SuperAdmin
            await supabase.from('payments').insert({
              clinic_id: null,
              patient_email: session.customer_email.toLowerCase(),
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'frequency',
              package_name: session.metadata.pack_id?.replace(/_/g, ' ') || 'Frequency Pack',
              payment_method: 'stripe',
              payment_id: session.payment_intent || session.id,
              stripe_payment_id: session.payment_intent || session.id,
              stripe_session_id: session.id,
              created_at: new Date().toISOString()
            }).catch(err => console.warn('payments insert skipped:', err.message));
            // Save to patient_payments (per-clinic tracking)
            await savePatientPayment(session.customer_email, 'frequency', session.metadata.pack_id?.replace(/_/g, ' ') || 'Frequency Pack', session.amount_total / 100, session.currency?.toUpperCase(), session.metadata.pack_id || null);
          }

          // Send customer + admin emails exactly once across this webhook and
          // the /api/stripe/verify-session confirm path (shared dedupe key).
          const packEmailsClaimed = mailerConfigured
            ? await claimNotificationOnce(`pack:${session.id}:emails`)
            : false;

          // Send confirmation email
          if (packEmailsClaimed) {
            const packName = session.metadata.is_bundle === 'true'
              ? (isMeditationPurchase ? 'Complete Meditation Bundle' : 'Complete Frequency Bundle')
              : session.metadata.pack_id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

          const mailOptions = {
            from: EMAIL_FROM,
            to: session.customer_email,
            subject: `Your ${packName} is ready - Limitless Brain Lab`,
            attachments: getLogoAttachment(),
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px 32px;">
                            <table width="100%">
                              <tr>
                                <td>
                                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                                  <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                                    PURCHASE CONFIRMATION
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>

                        <!-- Success Message -->
                        <tr>
                          <td style="padding: 32px 32px 16px; text-align: center;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td align="center" style="text-align: center;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 20px;">
                                    <tr>
                                      <td width="80" height="80" align="center" valign="middle" style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 40px; line-height: 1; color: #ffffff;">&#10003;</td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                            <h2 style="color: #323956; margin: 0 0 8px; font-size: 26px;">Payment Successful!</h2>
                            <p style="color: #666; margin: 0; font-size: 15px;">
                              Your ${packName} is now unlocked and ready to use.
                            </p>
                          </td>
                        </tr>

                        <!-- Order Details -->
                        <tr>
                          <td style="padding: 0 32px 24px;">
                            <div style="background: #f8f9fc; border-radius: 12px; padding: 20px;">
                              <h3 style="color: #323956; margin: 0 0 16px; font-size: 16px;">Order Details</h3>
                              <table width="100%">
                                <tr>
                                  <td style="padding: 8px 0; color: #666;">Item:</td>
                                  <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${packName}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: #666;">Amount Paid:</td>
                                  <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${session.currency.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</td>
                                </tr>
                                <tr>
                                  <td style="padding: 8px 0; color: #666;">Order ID:</td>
                                  <td style="padding: 8px 0; color: #666; font-size: 12px; text-align: right;">${session.id.slice(-12)}</td>
                                </tr>
                              </table>
                            </div>
                          </td>
                        </tr>

                        <!-- Access Button -->
                        <tr>
                          <td style="padding: 0 32px 24px;" align="center">
                            <a href="${APP_URL}/${isMeditationPurchase ? 'dashboard' : 'frequencies'}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              ${isMeditationPurchase ? 'Access Your Meditations' : 'Access Your Frequencies'}
                            </a>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                            <p style="color: #888; margin: 0; font-size: 12px;">
                              Thank you for your purchase! If you have any questions, contact us at info@limitlessbrainlab.com
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
              </html>
            `
          };

          emailTransporter.sendMail(mailOptions)
            .catch(err => console.error('Email sending failed:', err.message));
        }

          // Notify admin (Limitless Brain Lab) about frequency/meditation purchase
          if (packEmailsClaimed) {
            const itemType = isMeditationPurchase ? 'Meditation' : 'Frequency';
            const itemName = session.metadata.is_bundle === 'true'
              ? (isMeditationPurchase ? 'Complete Meditation Bundle' : 'Complete Frequency Bundle')
              : session.metadata.pack_id?.replace(/_/g, ' ') || `${itemType} Pack`;

            const adminFreqMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `New ${itemType} Purchase: ${itemName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                  <div style="padding: 24px 28px;">
                    <h2 style="color: #323956; margin-top: 0;">New ${itemType} Purchase</h2>
                    <p><strong>Customer:</strong> ${session.customer_email}</p>
                    <p><strong>Item:</strong> ${itemName}</p>
                    <p><strong>Bundle:</strong> ${session.metadata.is_bundle === 'true' ? 'Yes' : 'No'}</p>
                    <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                    <p><strong>Session ID:</strong> ${session.id}</p>
                    <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                  </div>
                  ${CONTACT_STRIP_HTML}
                </div>
              `
            };

            emailTransporter.sendMail(adminFreqMailOptions)
              .catch(err => console.error('Admin frequency/meditation email failed:', err.message));
          }
        } // Close else block for frequency purchases
      }

      // Handle coaching session payment - send Calendly link email
      if (paymentType === 'coaching_session') {
        const COMMON_CALENDLY = 'https://calendly.com/admin-bettroi/30min';
        const coachName = session.metadata?.coach_name;
        const calendlyUrl = session.metadata?.calendly_url || COMMON_CALENDLY;
        const patientEmail = session.metadata?.patient_email || session.customer_email;
        const patientName = session.metadata?.patient_name || 'Patient';
        const coachId = session.metadata?.coach_id;

        // Save coaching payment record. NOTE: the old write targeted a
        // coaching_payments table that does not exist in the live DB and
        // swallowed the error — coaching purchases were never recorded on
        // this path. Record into the shared payments ledger + patient_payments
        // (what the Wallet and admin portals actually read).
        const { error: coachPayErr } = await supabase.from('payments').upsert({
          clinic_id: null,
          patient_email: patientEmail?.toLowerCase(),
          amount: session.amount_total / 100,
          currency: session.currency?.toUpperCase() || 'USD',
          status: 'completed',
          type: 'coaching',
          package_name: coachName ? `Coaching Session - ${coachName}` : 'Coaching Session',
          payment_method: 'stripe',
          payment_id: session.payment_intent || session.id,
          stripe_payment_id: session.payment_intent || session.id,
          stripe_session_id: session.id,
          created_at: new Date().toISOString()
        }, { onConflict: 'stripe_session_id', ignoreDuplicates: true });
        if (coachPayErr) console.error('Coaching payments insert failed:', coachPayErr.message);
        // patient_payments row so the coaching purchase shows in the Wallet
        // even when the buyer never returns to the brain-coach page
        // (savePatientPayment lives in an earlier block and is out of scope here)
        try {
          const { data: existingCoachPay } = await supabase.from('patient_payments')
            .select('id').eq('stripe_session_id', session.id).limit(1);
          if (!existingCoachPay?.length) {
            const { error: ppErr } = await supabase.from('patient_payments').insert({
              clinic_id: session.metadata?.clinic_id || null,
              patient_email: patientEmail?.toLowerCase(),
              patient_name: patientName || '',
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase() || 'USD',
              status: 'completed',
              type: 'coaching',
              item_name: coachName ? `Coaching Session - ${coachName}` : 'Coaching Session',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              source: 'Brain Coach',
              created_at: new Date().toISOString()
            });
            if (ppErr) console.warn('coaching patient_payments insert skipped:', ppErr.message);
          }
        } catch (ppCatch) {
          console.warn('coaching patient_payments insert skipped:', ppCatch.message);
        }

        // Send Calendly link email to patient
        if (emailTransporter && patientEmail) {
          const scheduleLink = calendlyUrl || '';
          const hasCalendly = !!calendlyUrl;

          const mailOptions = {
            from: EMAIL_FROM,
            to: patientEmail,
            subject: `Your Brain Coaching Session with ${coachName} - Schedule Now`,
            attachments: getLogoAttachment(),
            html: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"></head>
              <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
                    <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                    <h1 style="color: white; margin: 0; font-size: 22px;">Payment Successful!</h1>
                    <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Your Brain Coaching Session is Confirmed</p>
                  </div>
                  <div style="padding: 30px;">
                    <p style="color: #333; font-size: 16px; margin: 0 0 20px;">Hello <strong>${patientName}</strong>,</p>
                    <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                      Your payment for a brain coaching session with <strong>${coachName}</strong> has been received.
                      ${hasCalendly ? 'Click below to schedule your session.' : 'Our team will contact you to schedule your session.'}
                    </p>
                    ${hasCalendly ? `
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${scheduleLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">Schedule Your Session</a>
                    </div>
                    <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                      <p style="color: #1e40af; margin: 0; font-size: 13px;"><a href="${scheduleLink}" style="color: #2563eb; word-break: break-all;">${scheduleLink}</a></p>
                    </div>
                    ` : ''}
                    <div style="background: #f8f9fc; border-radius: 8px; padding: 15px; margin: 20px 0;">
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Coach: <strong>${coachName}</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Duration: <strong>30 minutes</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Mode: <strong>Online</strong></p>
                    </div>
                  </div>
                </div>
              </body>
              </html>
            `
          };

          if (await claimNotificationOnce(`coaching:${session.id}:patient`)) {
            emailTransporter.sendMail(mailOptions)
              .catch(err => console.error('Coaching email failed:', err.message));
          }
        }

        // Notify coach about new session booking
        const coachEmail = session.metadata?.coach_email;
        if (emailTransporter && coachEmail) {
          const coachMailOptions = {
            from: EMAIL_FROM,
            to: coachEmail,
            subject: `New Session Booking: ${patientName} - Limitless Brain Lab`,
            attachments: getLogoAttachment(),
            html: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"></head>
              <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
                <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
                    <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                    <h1 style="color: white; margin: 0; font-size: 22px;">New Session Booked!</h1>
                    <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">A patient has booked a session with you</p>
                  </div>
                  <div style="padding: 30px;">
                    <p style="color: #333; font-size: 16px; margin: 0 0 20px;">Hello <strong>${coachName}</strong>,</p>
                    <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                      A new session has been booked with you. Here are the details:
                    </p>
                    <div style="background: #f8f9fc; border-radius: 8px; padding: 15px; margin: 20px 0;">
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Patient: <strong>${patientName}</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Patient Email: <strong>${patientEmail}</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Duration: <strong>30 minutes</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Mode: <strong>Online</strong></p>
                      <p style="color: #666; margin: 4px 0; font-size: 13px;">Session ID: <strong>${session.id}</strong></p>
                    </div>
                    <p style="color: #666; font-size: 14px; line-height: 1.6;">
                      The patient will schedule their session timing via Calendly or contact you directly to finalize the appointment details.
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `
          };

          if (await claimNotificationOnce(`coaching:${session.id}:coach`)) {
            emailTransporter.sendMail(coachMailOptions)
              .catch(err => console.error('Coach coaching email failed:', err.message));
          }
        }

        // Notify admin (Limitless Brain Lab) about coaching session purchase
        if (mailerConfigured) {
          const adminCoachMailOptions = {
            from: EMAIL_FROM,
            to: process.env.EMAIL_TO || process.env.EMAIL_USER,
            subject: `New Coaching Session Purchase: ${coachName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="padding: 24px 28px;">
                  <h2 style="color: #323956; margin-top: 0;">New Coaching Session Purchase</h2>
                  <p><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
                  <p><strong>Coach:</strong> ${coachName}</p>
                  <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                  <p><strong>Calendly:</strong> ${calendlyUrl || 'N/A'}</p>
                  <p><strong>Session ID:</strong> ${session.id}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                </div>
                ${CONTACT_STRIP_HTML}
              </div>
            `
          };

          if (await claimNotificationOnce(`coaching:${session.id}:admin`)) {
            emailTransporter.sendMail(adminCoachMailOptions)
              .catch(err => console.error('Admin coaching email failed:', err.message));
          }
        }
      }

    } catch (dbError) {
      console.error('Database error:', dbError);
    }

  // Handle subscription renewal success
  } else if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    const customerEmail = invoice.customer_email;
    const amountPaid = (invoice.amount_paid / 100).toFixed(2);
    const currency = (invoice.currency || 'USD').toUpperCase();

    console.log(`✅ Subscription renewal successful for ${customerEmail} - ${currency} ${amountPaid}`);

    if (mailerConfigured && customerEmail) {
      const renewalMail = {
        from: EMAIL_FROM,
        to: customerEmail,
        subject: `Subscription Renewed Successfully - Limitless Brain Lab`,
        attachments: [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }],
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">Subscription Renewed</h1>
            </div>
            <div style="padding: 28px 32px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">Your Limitless Brain Lab subscription has been renewed successfully.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
                <p style="margin: 0; color: #166534; font-weight: 600;">Amount Charged: ${currency} ${amountPaid}</p>
              </div>
              <p style="color: #555; font-size: 14px;">Your access to all features continues uninterrupted. Thank you for being part of the Limitless Brain Lab community.</p>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${APP_URL}/dashboard" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Go to Dashboard</a>
              </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; Health, Wealth & Happiness for All</p>
            </div>
          </div>
        `
      };
      emailTransporter.sendMail(renewalMail)
        .then(() => console.log('✉️ Renewal confirmation email sent'))
        .catch(err => console.error('❌ Renewal email failed:', err.message));

      // Internal copy — renewals previously notified no one internally
      emailTransporter.sendMail({
        from: EMAIL_FROM,
        to: process.env.EMAIL_TO || process.env.EMAIL_USER,
        subject: `Subscription Renewal Received - ${customerEmail}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="padding: 24px 28px;">
              <h2 style="color: #323956; margin-top: 0;">Subscription Renewal</h2>
              <p><strong>Customer:</strong> ${customerEmail}</p>
              <p><strong>Amount:</strong> ${currency} ${amountPaid}</p>
              <p><strong>Invoice ID:</strong> ${invoice.id}</p>
              <p><strong>Date:</strong> ${new Date().toISOString()}</p>
            </div>
            ${CONTACT_STRIP_HTML}
          </div>
        `
      }).catch(err => console.error('Admin renewal email failed:', err.message));
    }

  // Handle failed payment
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const customerEmail = invoice.customer_email;
    const amountDue = (invoice.amount_due / 100).toFixed(2);
    const currency = (invoice.currency || 'USD').toUpperCase();
    const nextAttempt = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;

    console.log(`❌ Payment failed for ${customerEmail} - ${currency} ${amountDue}`);

    if (mailerConfigured && customerEmail) {
      const failedMail = {
        from: EMAIL_FROM,
        to: customerEmail,
        subject: `Payment Failed - Action Required - Limitless Brain Lab`,
        attachments: [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }],
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">Payment Failed</h1>
            </div>
            <div style="padding: 28px 32px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">We were unable to process your payment of <strong>${currency} ${amountDue}</strong> for your Limitless Brain Lab subscription.</p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">Please update your payment method to avoid service interruption.</p>
                ${nextAttempt ? `<p style="margin: 8px 0 0; color: #991b1b; font-size: 13px;">We will retry on ${nextAttempt}.</p>` : ''}
              </div>
              <p style="color: #555; font-size: 14px;">Common reasons for payment failure include expired card, insufficient funds, or card declined by your bank.</p>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${APP_URL}/dashboard/subscription" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Update Payment Method</a>
              </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; Health, Wealth & Happiness for All</p>
            </div>
          </div>
        `
      };
      emailTransporter.sendMail(failedMail)
        .then(() => console.log('✉️ Payment failed notification email sent'))
        .catch(err => console.error('❌ Failed payment email error:', err.message));
    }

  // Handle subscription cancellation/expiry
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    console.log(`🔴 Subscription cancelled/expired: ${subscription.id}`);

    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const customerEmail = subscription.customer_email || subscription.metadata?.customer_email;

        if (customerEmail) {
          await supabase
            .from('patients')
            .update({
              subscription_status: 'expired',
              updated_at: new Date().toISOString()
            })
            .eq('email', customerEmail.toLowerCase());

          console.log(`✅ Subscription status updated to expired for ${customerEmail}`);
        }
      }
    } catch (dbError) {
      console.error('❌ Subscription expiry DB error:', dbError);
    }
  }

  res.json({ received: true });
});

// =====================================================
// COACHING CREDITS API
// =====================================================

// Get patient coaching credits
app.get('/api/coaching-credits/:email', async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const { data, error } = await supabase
      .from('patient_coaching_credits')
      .select('*')
      .eq('patient_email', email.toLowerCase())
      .gt('credits_available', 0)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error fetching coaching credits:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch coaching credits',
        error: error.message
      });
    }

    const total = data?.reduce((sum, c) => sum + c.credits_available, 0) || 0;

    res.json({
      success: true,
      credits: data || [],
      total
    });
  } catch (error) {
    console.error('Error in coaching credits endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Grant coaching credit (called after assessment purchase or manually)
app.post('/api/coaching-credits/grant', async (req, res) => {
  try {
    const { patientEmail, source, sourceReferenceId, creditsAmount } = req.body;

    if (!patientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Patient email is required'
      });
    }

    const creditData = {
      patient_email: patientEmail.toLowerCase(),
      credits_available: creditsAmount || 1,
      credits_used: 0,
      source: source || 'assessment_purchase',
      source_reference_id: sourceReferenceId || null,
      granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
    };

    const { data, error } = await supabase
      .from('patient_coaching_credits')
      .insert([creditData])
      .select()
      .single();

    if (error) {
      console.error('Error granting coaching credit:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to grant coaching credit',
        error: error.message
      });
    }


    res.json({
      success: true,
      message: 'Coaching credit granted successfully',
      credit: data
    });
  } catch (error) {
    console.error('Error in grant coaching credit endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Use/redeem coaching credit
app.post('/api/coaching-credits/use', async (req, res) => {
  try {
    const { patientEmail, creditId, coachId, coachName } = req.body;

    if (!patientEmail || !creditId) {
      return res.status(400).json({
        success: false,
        message: 'Patient email and credit ID are required'
      });
    }

    // Get the credit record
    const { data: credit, error: fetchError } = await supabase
      .from('patient_coaching_credits')
      .select('*')
      .eq('id', creditId)
      .eq('patient_email', patientEmail.toLowerCase())
      .single();

    if (fetchError || !credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit not found or does not belong to this patient'
      });
    }

    if (credit.credits_available <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No credits available'
      });
    }

    // Decrement credit
    const { data: updated, error: updateError } = await supabase
      .from('patient_coaching_credits')
      .update({
        credits_available: credit.credits_available - 1,
        credits_used: credit.credits_used + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', creditId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to use credit',
        error: updateError.message
      });
    }


    res.json({
      success: true,
      message: 'Coaching credit redeemed successfully',
      credit: updated
    });
  } catch (error) {
    console.error('Error in use coaching credit endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});


// Gemini API test endpoint
app.get('/api/test-gemini', async (req, res) => {
  try {
    const GeminiService = require('./services/geminiService');

    const result = await GeminiService.testConnection();

    res.json({
      success: result.success,
      message: result.success ? 'Gemini API is working!' : 'Gemini API test failed',
      response: result.response || null,
      error: result.error || null
    });
  } catch (error) {
    console.error('Gemini test error:', error);
    res.status(500).json({
      success: false,
      message: 'Gemini API test failed',
      error: error.message
    });
  }
});

// Clinic Credentials Email API endpoint
app.post('/api/clinic-credentials', async (req, res) => {
  try {
    const { clinicName, contactPerson } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    // Login link always points to production, regardless of the origin that sent the request.
    const loginBase = APP_URL;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      cc: INTERNAL_COPY_EMAIL,
      subject: `Your Account created with LimitlessBrain Lab`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px;">
                      <table width="100%">
                        <tr>
                          <td>
                            <table>
                              <tr>
                                <td style="vertical-align: middle;">
                                  <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover;" />
                                </td>
                                <td style="vertical-align: middle; padding-left: 12px;">
                                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                                  <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                                    CLINIC CREDENTIALS
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Welcome Message -->
                  <tr>
                    <td style="padding: 32px 32px 16px;">
                      <h2 style="color: #323956; margin: 0 0 8px; font-size: 24px;">Welcome, ${escapeHtml(contactPerson || clinicName || 'Clinic Admin')}! </h2>
                      <p style="color: #666; margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
                        Thank you for registering with <strong>Limitless Brain Lab</strong>! We are thrilled to have you onboard and look forward to a long-term association filled with health, happiness, and growth.
                      </p>
                      <p style="color: #666; margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
                        Your clinic account <strong>${escapeHtml(clinicName || '')}</strong> has been activated. Below are your login credentials. Please login and choose your plan to get started.
                      </p>
                    </td>
                  </tr>

                  <!-- Credentials Box -->
                  <tr>
                    <td style="padding: 0 32px 24px;">
                      <table width="100%" style="background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%); border-radius: 12px;">
                        <tr>
                          <td style="padding: 24px;">
                            <p style="color: rgba(255,255,255,0.8); margin: 0 0 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">YOUR LOGIN CREDENTIALS</p>

                            <table width="100%" style="background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 12px;">
                              <tr>
                                <td style="padding: 12px 16px;">
                                  <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 11px;">USERNAME / EMAIL</p>
                                  <p style="color: #ffffff; margin: 4px 0 0; font-size: 16px; font-weight: 600;">${escapeHtml(email)}</p>
                                </td>
                              </tr>
                            </table>

                            <table width="100%" style="background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 12px;">
                              <tr>
                                <td style="padding: 12px 16px;">
                                  <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 11px;">PASSWORD</p>
                                  <p style="color: #ffffff; margin: 4px 0 0; font-size: 16px; font-weight: 600; font-family: monospace;">${escapeHtml(password)}</p>
                                </td>
                              </tr>
                            </table>

                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Login Button -->
                  <tr>
                    <td style="padding: 0 32px 24px;" align="center">
                      <a href="${loginBase}/clinic/login" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                        Login to Your Clinic Portal
                      </a>
                    </td>
                  </tr>

                  <!-- Security Note -->
                  <tr>
                    <td style="padding: 0 32px 24px;">
                      <div style="background: #fef3c7; border-radius: 8px; padding: 16px; border-left: 4px solid #f59e0b;">
                        <p style="color: #92400e; margin: 0; font-size: 13px; line-height: 1.5;">
                          <strong>Security Note:</strong> Please change your password after your first login. Keep your credentials secure and do not share them with anyone.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #888; margin: 0; font-size: 12px;">
                        Thank you for choosing <strong style="color: #323956;">Limitless Brain Lab</strong>
                      </p>
                      <p style="color: #aaa; margin: 6px 0 0; font-size: 11px;">
                        If you did not request this, please contact support immediately.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      attachments: getLogoAttachment()
    };

    if (!emailTransporter) {
      console.error('clinic-credentials: email transporter is null. BREVO_API_KEY set=%s', Boolean(process.env.BREVO_API_KEY));
      return res.status(503).json({
        success: false,
        message: 'Email service is not configured on the server. Set BREVO_API_KEY in the Render environment, then redeploy.'
      });
    }

    const info = await emailTransporter.sendMail(mailOptions);
    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      return res.status(502).json({
        success: false,
        message: `Credentials email rejected for: ${info.rejected.join(', ')}`
      });
    }
    if (Array.isArray(info.accepted) && info.accepted.length === 0) {
      return res.status(502).json({
        success: false,
        message: 'Credentials email was not accepted by the mail provider'
      });
    }

    res.json({
      success: true,
      message: 'Clinic credentials email sent successfully',
      accepted: info.accepted || []
    });

  } catch (error) {
    console.error('Clinic credentials email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send clinic credentials email',
      error: error.message
    });
  }
});

// Clinic Rejection Email API endpoint
app.post('/api/clinic-rejection', async (req, res) => {
  try {
    const { clinicName, email, contactPerson, remark } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Your Clinic Registration with Limitless Brain Lab`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:24px 32px;">
                      <table width="100%"><tr><td>
                        <table><tr>
                          <td style="vertical-align:middle;">
                            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:100px;height:100px;border-radius:50%;object-fit:cover;" />
                          </td>
                          <td style="vertical-align:middle;padding-left:12px;">
                            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Limitless Brain Lab</h1>
                            <p style="color:#F5D05D;margin:4px 0 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">REGISTRATION UPDATE</p>
                          </td>
                        </tr></table>
                      </td></tr></table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 32px 16px;">
                      <h2 style="color:#323956;margin:0 0 8px;font-size:24px;">Dear ${contactPerson || clinicName || 'Applicant'},</h2>
                      <p style="color:#666;margin:0 0 12px;font-size:14px;line-height:1.6;">
                        Thank you for your interest in registering <strong>${clinicName || 'your clinic'}</strong> with <strong>Limitless Brain Lab</strong>.
                      </p>
                      <p style="color:#666;margin:0 0 12px;font-size:14px;line-height:1.6;">
                        After reviewing your application, we regret to inform you that we are unable to approve your registration at this time.
                      </p>
                      ${remark ? `
                      <table width="100%" style="background:#fff5f5;border-left:4px solid #e53e3e;border-radius:8px;margin:16px 0;">
                        <tr><td style="padding:16px 20px;">
                          <p style="color:#c53030;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Reason</p>
                          <p style="color:#742a2a;margin:0;font-size:14px;line-height:1.6;">${escapeHtml(remark)}</p>
                        </td></tr>
                      </table>` : ''}
                      <p style="color:#666;margin:12px 0 0;font-size:14px;line-height:1.6;">
                        If you believe this is an error or would like to provide additional information, please contact us. We are happy to reconsider your application.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 32px 32px;">
                      <p style="color:#999;margin:0;font-size:12px;">Best regards,<br/><strong style="color:#323956;">Limitless Brain Lab Team</strong></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      attachments: getLogoAttachment()
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Rejection email sent successfully' });

  } catch (error) {
    console.error('Clinic rejection email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send rejection email', error: error.message });
  }
});

// Registration Confirmation Email API endpoint
app.post('/api/registration-confirmation', async (req, res) => {
  try {
    const { name, email, clinicName, type } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    const isClinic = type === 'clinic';
    const displayName = isClinic ? clinicName : name;

    let mailOptions;

    if (isClinic) {
      // Clinic registration email (unchanged)
      mailOptions = {
        from: EMAIL_FROM,
        to: email,
        subject: `Registration Successful - Welcome to Limitless Brain Lab`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px;">
                        <table width="100%">
                          <tr>
                            <td>
                              <table>
                                <tr>
                                  <td style="vertical-align: middle;">
                                    <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover;" />
                                  </td>
                                  <td style="vertical-align: middle; padding-left: 12px;">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                                    <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                                      REGISTRATION CONFIRMED
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Success Icon & Message -->
                    <tr>
                      <td style="padding: 32px 32px 16px; text-align: center;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td align="center" style="text-align: center;">
                              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 20px;">
                                <tr>
                                  <td width="80" height="80" align="center" valign="middle" style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; text-align: center; vertical-align: middle; font-size: 40px; line-height: 1; color: #ffffff;">&#10003;</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                        <h2 style="color: #323956; margin: 0 0 8px; font-size: 26px;">Welcome, ${displayName}! </h2>
                        <p style="color: #666; margin: 0; font-size: 15px; line-height: 1.6;">
                          Your clinic registration has been successfully completed.
                        </p>
                      </td>
                    </tr>

                    <!-- What's Next -->
                    <tr>
                      <td style="padding: 0 32px 24px;">
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; border: 1px solid #bbf7d0;">
                          <h3 style="color: #166534; margin: 0 0 12px; font-size: 16px;">What's Next?</h3>
                          <ul style="color: #166534; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                            <li>Your account is being reviewed by our admin team</li>
                            <li>You'll receive login credentials once approved</li>
                            <li>This usually takes 24-48 hours</li>
                          </ul>
                        </div>
                      </td>
                    </tr>

                    <!-- Contact Support -->
                    <tr>
                      <td style="padding: 0 32px 24px;">
                        <div style="background: #eff6ff; border-radius: 12px; padding: 16px; text-align: center;">
                          <p style="color: #1e40af; margin: 0; font-size: 13px;">
                            Need help? Contact us at <a href="mailto:info@limitlessbrainlab.com" style="color: #1e40af; font-weight: 600;">info@limitlessbrainlab.com</a>
                          </p>
                        </div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                        <p style="color: #888; margin: 0; font-size: 12px;">
                          Thank you for choosing <strong style="color: #323956;">Limitless Brain Lab</strong>
                        </p>
                        <p style="color: #aaa; margin: 6px 0 0; font-size: 11px;">
                          ${fmtDateTime(new Date())}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        attachments: getLogoAttachment()
      };
    } else {
      // Patient registration email (Email 1 from template)
      mailOptions = {
        from: EMAIL_FROM,
        to: email,
        subject: `Welcome aboard — your report is on the way`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                        <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
                        <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Your Journey Begins</p>
                      </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                      <td style="padding: 36px 32px;">
                        <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${name},</h2>
                        <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
                          Thanks for registering with us — you're officially in.
                        </p>
                        <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 20px;">
                          Your report is now being prepared. Please allow up to 24 hours for it to land on your dashboard. We'll send you a separate email the moment it's ready to view.
                        </p>

                        <!-- While You Wait -->
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; border-left: 4px solid #10b981; margin: 0 0 24px;">
                          <h3 style="color: #166534; margin: 0 0 12px; font-size: 15px; font-weight: 600;">A few things you can do while you wait:</h3>
                          <ul style="color: #166534; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                            <li>Complete your profile if you haven't already</li>
                            <li>Browse our knowledge library</li>
                            <li>Read up on what your report will cover</li>
                            <li>Explore your dashboard and get familiar with the features</li>
                          </ul>
                        </div>

                        <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0;">
                          If you have any questions before then, just reply to this email and we'll be happy to help.
                        </p>
                      </td>
                    </tr>

                    <!-- CTA Button -->
                    <tr>
                      <td style="padding: 0 32px 24px; text-align: center;">
                        <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                          Go to My Dashboard
                        </a>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                        <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Talk soon,</p>
                        <p style="color: #323956; margin: 0; font-size: 15px; font-weight: 700;">The Limitless Brain Lab Team</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
        attachments: getLogoAttachment()
      };
    }

    await emailTransporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Registration confirmation email sent successfully'
    });

  } catch (error) {
    console.error('Registration confirmation email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send registration confirmation email',
      error: error.message
    });
  }
});

// ==========================================
// CALENDLY WEBHOOK & BOOKING APIs
// ==========================================

// Calendly Webhook - receives booking events from Calendly
app.post('/api/calendly-webhook', async (req, res) => {
  try {
    const event = req.body;

    // Verify it's a valid Calendly event
    if (!event.event || !event.payload) {
      return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
    }

    const { event: eventType, payload } = event;

    // Handle different event types
    if (eventType === 'invitee.created') {
      // New booking created
      const bookingData = {
        patient_email: payload.email?.toLowerCase() || payload.invitee?.email?.toLowerCase(),
        patient_name: payload.name || payload.invitee?.name,
        patient_phone: payload.text_reminder_number || null,
        coach_name: payload.event_type?.profile?.name || 'Limitless Brain Lab Coach',
        coach_email: payload.event_type?.profile?.email || null,
        event_type: payload.event_type?.name || '30 Minute Meeting',
        event_name: payload.event_type?.name || 'Brain Coaching Session',
        start_time: payload.scheduled_event?.start_time || payload.event?.start_time,
        end_time: payload.scheduled_event?.end_time || payload.event?.end_time,
        duration_minutes: payload.event_type?.duration || 30,
        timezone: payload.timezone || 'Asia/Kolkata',
        calendly_event_id: payload.scheduled_event?.uri?.split('/').pop() || payload.uri?.split('/').pop(),
        calendly_invitee_id: payload.uri?.split('/').pop(),
        calendly_event_url: payload.scheduled_event?.uri || payload.event?.uri,
        calendly_cancel_url: payload.cancel_url,
        calendly_reschedule_url: payload.reschedule_url,
        meeting_url: payload.scheduled_event?.location?.join_url || null,
        location: payload.scheduled_event?.location?.type || 'Online',
        status: 'scheduled'
      };

      // Try to match with a coach in our database
      if (bookingData.coach_email) {
        const { data: coach } = await supabase
          .from('coaches')
          .select('id, name')
          .eq('email', bookingData.coach_email)
          .single();

        if (coach) {
          bookingData.coach_id = coach.id;
          bookingData.coach_name = coach.name;
        }
      }

      // Check if booking already exists (created by frontend) - avoid duplicates
      let booking;
      if (bookingData.patient_email && bookingData.calendly_event_id) {
        const { data: existing } = await supabase
          .from('coach_bookings')
          .select('id')
          .eq('calendly_event_id', bookingData.calendly_event_id)
          .maybeSingle();

        if (existing) {
          // Update existing booking with webhook data
          const { data: updated, error: updateError } = await supabase
            .from('coach_bookings')
            .update(bookingData)
            .eq('id', existing.id)
            .select()
            .single();
          if (updateError) throw updateError;
          booking = updated;
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from('coach_bookings')
            .insert([bookingData])
            .select()
            .single();
          if (insertError) throw insertError;
          booking = inserted;
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('coach_bookings')
          .insert([bookingData])
          .select()
          .single();
        if (insertError) throw insertError;
        booking = inserted;
      }


      // Send confirmation email to patient
      if (bookingData.patient_email && emailTransporter) {
        try {
          const startDate = new Date(bookingData.start_time);
          const formattedDate = startDate.toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });
          const formattedTime = startDate.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true
          });

          await emailTransporter.sendMail({
            from: EMAIL_FROM,
            to: bookingData.patient_email,
            subject: 'Thank you for booking — your session is confirmed',
            attachments: getLogoAttachment(),
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
                            <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Session Confirmed</p>
                          </td>
                        </tr>

                        <!-- Main Content -->
                        <tr>
                          <td style="padding: 36px 32px;">
                            <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${bookingData.patient_name || 'there'},</h2>
                            <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 24px;">
                              Thank you for booking ${bookingData.event_name || 'a session'} with us. We're genuinely grateful you've chosen to take this next step on your journey. Every session is an opportunity to go deeper, and we're looking forward to supporting you through it.
                            </p>

                            <!-- Booking Details -->
                            <div style="background: #f8f9fc; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
                              <h3 style="color: #323956; margin: 0 0 15px; font-size: 15px; font-weight: 600;">Your Booking Details</h3>
                              <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #10b981;">
                                <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 600;">Service</p>
                                <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${bookingData.event_name || 'Brain Coaching Session'}</p>
                              </div>
                              <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #f59e0b;">
                                <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 600;">Coach</p>
                                <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${bookingData.coach_name}</p>
                              </div>
                              <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                                <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 600;">Date & Time</p>
                                <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${formattedDate}, ${formattedTime}</p>
                              </div>
                              <div style="background: white; border-radius: 8px; padding: 15px; border-left: 4px solid #8b5cf6;">
                                <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase; font-weight: 600;">Location / Link</p>
                                <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${bookingData.location}</p>
                              </div>
                            </div>

                            ${bookingData.meeting_url ? `
                            <div style="text-align: center; margin: 0 0 24px;">
                              <a href="${bookingData.meeting_url}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                                Join Session
                              </a>
                            </div>
                            ` : ''}

                            <!-- Preparation Tips -->
                            <div style="background: #fef3c7; border-radius: 12px; padding: 20px; margin: 0 0 24px; border-left: 4px solid #f59e0b;">
                              <h3 style="color: #92400e; margin: 0 0 12px; font-size: 15px; font-weight: 600;">How to Prepare</h3>
                              <ul style="color: #92400e; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                                <li>Review your report beforehand if you haven't already</li>
                                <li>Jot down any questions or areas you'd like to focus on</li>
                                <li>Find a quiet, comfortable space where you won't be interrupted</li>
                              </ul>
                            </div>

                            <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0;">
                              If you need to reschedule, <a href="${bookingData.calendly_reschedule_url}" style="color: #323956; text-decoration: none; font-weight: 600;">reschedule here</a> or <a href="${bookingData.calendly_cancel_url}" style="color: #dc3545; text-decoration: none; font-weight: 600;">cancel</a> if needed.
                            </p>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Thanks again for trusting us with your journey — we'll see you soon.</p>
                            <p style="color: #323956; margin: 0; font-size: 15px; font-weight: 700;">Warmly, The Limitless Brain Lab Team</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
              </html>
            `
          });
        } catch (emailError) {
          console.error('Email error:', emailError);
        }
      }

      return res.json({ success: true, message: 'Booking saved', bookingId: booking.id });
    }

    if (eventType === 'invitee.canceled') {
      // Booking cancelled
      const calendlyEventId = payload.scheduled_event?.uri?.split('/').pop();

      if (calendlyEventId) {
        const { error } = await supabase
          .from('coach_bookings')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('calendly_event_id', calendlyEventId);

        if (error) {
          console.error('Error updating booking:', error);
        } else {
        }
      }

      return res.json({ success: true, message: 'Booking cancelled' });
    }

    // Unknown event type
    res.json({ success: true, message: 'Webhook received' });

  } catch (error) {
    console.error('Calendly webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed', error: error.message });
  }
});

// Email 2 — 24-Hour Reminder (manual admin trigger)
app.post('/api/send-24hr-reminder', async (req, res) => {
  try {
    const { email, name, clinicEmail, clinicName } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email and name are required'
      });
    }

    if (!emailTransporter) {
      return res.status(500).json({
        success: false,
        message: 'Email service not configured'
      });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Almost there — your report is being finalised',
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                      <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
                      <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Report In Progress</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 36px 32px;">
                      <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${name},</h2>
                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 20px;">
                        Just a quick note to let you know your report is in its final stages of preparation. You should see it on your dashboard very soon.
                      </p>

                      <!-- While You Wait -->
                      <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; border-left: 4px solid #10b981; margin: 0 0 24px;">
                        <h3 style="color: #166534; margin: 0 0 12px; font-size: 15px; font-weight: 600;">If you haven't yet, this is a great time to:</h3>
                        <ul style="color: #166534; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                          <li>Make sure your profile details are complete</li>
                          <li>Familiarise yourself with the dashboard layout</li>
                          <li>Check out the resources we've curated for you</li>
                        </ul>
                      </div>

                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0;">
                        We'll email you the moment your report is live.
                      </p>
                    </td>
                  </tr>

                  <!-- CTA Button -->
                  <tr>
                    <td style="padding: 0 32px 24px; text-align: center;">
                      <a href="${APP_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                        Explore Your Dashboard
                      </a>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                      <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Speak soon,</p>
                      <p style="color: #323956; margin: 0; font-size: 15px; font-weight: 700;">The Limitless Brain Lab Team</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    // Also notify the clinic that the patient's report is being finalised (non-fatal).
    if (clinicEmail) {
      try {
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: clinicEmail,
          subject: `Report Being Finalised: ${name}`,
          heading: 'Report Being Finalised',
          subheading: 'Patient Report Notification',
          greetingName: clinicName || 'your clinic',
          intro: `Your patient <strong>${name}</strong>'s report is being finalised and will be ready shortly. We'll email you as soon as it's available.`,
          rows: [
            { label: 'Patient Name', value: name },
            { label: 'Status', value: 'Being finalised' }
          ],
          footerNote: 'No action is required.'
        }));
        console.log('✅ Clinic report-finalising notification sent:', clinicEmail);
      } catch (clinicMailErr) {
        console.error('⚠️ Clinic report-finalising notification failed (non-fatal):', clinicMailErr.message);
      }
    }

    res.json({
      success: true,
      message: '24-hour reminder email sent successfully'
    });

  } catch (error) {
    console.error('24-hour reminder email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminder email',
      error: error.message
    });
  }
});

// Get bookings for a patient
app.get('/api/bookings/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { status, upcoming } = req.query;

    let query = supabase
      .from('coach_bookings')
      .select('*')
      .eq('patient_email', email.toLowerCase())
      .order('start_time', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    if (upcoming === 'true') {
      query = query.gte('start_time', new Date().toISOString());
      query = query.eq('status', 'scheduled');
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, bookings: data || [] });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings', error: error.message });
  }
});

// Get all bookings (for admin/coach dashboard)
app.get('/api/all-bookings', async (req, res) => {
  try {
    const { status, coachId, date } = req.query;

    let query = supabase
      .from('coach_bookings')
      .select('*')
      .order('start_time', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    if (coachId) {
      query = query.eq('coach_id', coachId);
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      query = query.gte('start_time', startOfDay.toISOString());
      query = query.lte('start_time', endOfDay.toISOString());
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, bookings: data || [] });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings', error: error.message });
  }
});

// Update booking status
app.put('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (notes) updateData.notes = notes;
    if (status === 'cancelled') updateData.cancelled_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('coach_bookings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Email 6 — Post-Session Follow-Up (fire when session is marked complete)
    if (status === 'completed' && data?.patient_email && emailTransporter) {
      try {
        const firstName = data.patient_name?.split(' ')[0] || 'there';
        const startDate = new Date(data.start_time);
        const formattedDate = startDate.toLocaleDateString('en-IN', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const followUpMailOptions = {
          from: EMAIL_FROM,
          to: data.patient_email,
          subject: 'How was your session? We\'d love to hear',
          attachments: getLogoAttachment(),
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
                          <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Limitless Brain Lab</h1>
                          <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Session Complete</p>
                        </td>
                      </tr>

                      <!-- Main Content -->
                      <tr>
                        <td style="padding: 36px 32px;">
                          <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${firstName},</h2>
                          <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 20px;">
                            Thanks for showing up to your session with ${data.coach_name || 'your coach'} today. We hope it gave you something valuable to sit with.
                          </p>

                          <!-- Momentum Tips -->
                          <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; border-left: 4px solid #10b981; margin: 0 0 24px;">
                            <h3 style="color: #166534; margin: 0 0 12px; font-size: 15px; font-weight: 600;">Real change happens between sessions, in the small choices and reflections that follow. Here are a few ways to keep the momentum:</h3>
                            <ul style="color: #166534; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                              <li>Take five minutes to note one insight from today's session</li>
                              <li>Pick one small action you can take this week</li>
                              <li>Revisit your report — you'll often see it differently after a session</li>
                            </ul>
                          </div>

                          <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 20px;">
                            If you'd like to share quick feedback on how the session went, just reply to this email — we read every response, and it helps us serve you better.
                          </p>

                          <!-- CTA Button -->
                          <div style="text-align: center; margin: 0 0 24px;">
                            <a href="${APP_URL}/dashboard/brain-coach" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              Book Your Next Session
                            </a>
                          </div>

                          <!-- Footer -->
                          <tr>
                            <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                              <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Here for whatever's next,</p>
                              <p style="color: #323956; margin: 0; font-size: 15px; font-weight: 700;">The Limitless Brain Lab Team</p>
                            </td>
                          </tr>
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                          <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Here for whatever's next,</p>
                          <p style="color: #323956; margin: 0; font-size: 15px; font-weight: 700;">The Limitless Brain Lab Team</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `
        };

        emailTransporter.sendMail(followUpMailOptions, (err) => {
          if (err) {
            console.error('Post-session follow-up email error:', err);
          } else {
            console.log('Post-session follow-up email sent to:', data.patient_email);
          }
        });
      } catch (emailError) {
        console.error('Error sending post-session email:', emailError);
      }
    }

    res.json({ success: true, booking: data });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ success: false, message: 'Failed to update booking', error: error.message });
  }
});

// Manual booking creation (for testing or manual entry)
app.post('/api/bookings', async (req, res) => {
  try {
    const bookingData = req.body;

    // Validate required fields
    if (!bookingData.patient_email || !bookingData.start_time || !bookingData.end_time) {
      return res.status(400).json({
        success: false,
        message: 'patient_email, start_time, and end_time are required'
      });
    }

    bookingData.patient_email = bookingData.patient_email.toLowerCase();
    bookingData.created_at = new Date().toISOString();
    bookingData.updated_at = new Date().toISOString();
    bookingData.status = bookingData.status || 'scheduled';

    // Ensure coach_id is valid UUID or null (foreign key constraint)
    if (bookingData.coach_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingData.coach_id)) {
      bookingData.coach_id = null;
    }

    const { data, error } = await supabase
      .from('coach_bookings')
      .insert([bookingData])
      .select()
      .single();

    if (error) throw error;

    // Notify the super admin portal of the new booking (shows in the notification bell)
    await supabase.from('admin_notifications').insert({
      type: 'info',
      category: 'booking',
      title: 'New Coaching Booking',
      message: `${bookingData.patient_name || bookingData.patient_email} booked a session with ${bookingData.coach_name || 'a coach'}.`,
      patient_name: bookingData.patient_name || bookingData.patient_email,
      action: 'view_booking',
      action_data: { patient_email: bookingData.patient_email, coach_name: bookingData.coach_name },
      is_read: false
    }).then(({ error: ne }) => { if (ne) console.error('Booking notification insert error:', ne); });

    res.json({ success: true, booking: data });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, message: 'Failed to create booking', error: error.message });
  }
});

// Audio Proxy - Stream from Google Drive (bypasses CORS)
app.get('/api/audio/stream/:driveId', async (req, res) => {
  try {
    const { driveId } = req.params;

    // Validate driveId format (Google Drive IDs are alphanumeric with dashes/underscores)
    if (!driveId || !/^[\w-]+$/.test(driveId)) {
      return res.status(400).json({ error: 'Invalid drive ID' });
    }

    const driveUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;

    const response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Audio proxy error: Google Drive returned ${response.status}`);
      return res.status(404).json({ error: 'Audio not found' });
    }

    // Set audio headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Get content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Pipe the audio stream to the response
    const reader = response.body.getReader();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(Buffer.from(value));
      }
    };

    pump().catch(err => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });

  } catch (error) {
    console.error('Audio proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
});

// =====================================================
// EMAIL OTP VERIFICATION - Patient Email Verification
// =====================================================

// In-memory OTP store (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to email
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt,
      attempts: 0
    });

    // Send OTP email
    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your Limitless Brain Lab verification code',
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
          <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 20px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
              <h1 style="color: white; margin: 0; font-size: 20px;">Limitless Brain Lab</h1>
              <p style="color: #F5D05D; margin: 5px 0 0; font-size: 12px;">Email Verification</p>
            </div>
            <div style="padding: 30px; text-align: center;">
              <p style="color: #666; margin: 0 0 20px;">Your verification code is:</p>
              <div style="background: #f0f4ff; border: 2px dashed #323956; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; color: #323956; letter-spacing: 8px;">${otp}</span>
              </div>
              <p style="color: #888; font-size: 13px; margin: 20px 0 0;">This code expires in 10 minutes.</p>
              <p style="color: #aaa; font-size: 11px; margin: 10px 0 0;">If you didn't request this, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const storedData = otpStore.get(email.toLowerCase());

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: 'OTP expired or not found. Please request a new OTP.'
      });
    }

    // Check expiry
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'Too many attempts. Please request a new OTP.'
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts++;
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${3 - storedData.attempts} attempts remaining.`
      });
    }

    // OTP verified. Keep it in the store (until it expires or the reset completes)
    // so POST /api/reset-password can re-validate the same code before writing the
    // new password. The password write is server-authoritative — verifying here and
    // then doing an unauthenticated client-side write would be both unreliable and
    // insecure.
    storedData.verified = true;

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// Reset a user's password after OTP verification. Server-authoritative and role-aware:
// updates the credential store(s) for whichever role owns the email — clinics.password,
// patients.password (+ Supabase Auth), or a super_admin profile (Supabase Auth +
// profiles.password). Runs with the service-role client so it bypasses RLS reliably and
// surfaces real errors instead of the old silent client-side anon write.
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Re-validate the OTP (same checks as verify-otp) so the write is gated server-side.
    const storedData = otpStore.get(normalizedEmail);
    if (!storedData) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new OTP.' });
    }
    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
    }
    if (storedData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Server is not configured to reset passwords right now.' });
    }

    // Same bcrypt/trim semantics as the client hashPassword() so login's comparePassword matches.
    const hashed = await bcrypt.hash(String(newPassword).trim(), 10);

    // Best-effort Supabase Auth sync (patients + super admins authenticate there or fall back to it).
    const syncSupabaseAuth = async () => {
      try {
        const { data: existingUsers } = await supabase.auth.admin.listUsers({ filter: normalizedEmail, perPage: 1 });
        const authUser = existingUsers?.users?.find(u => (u.email || '').toLowerCase() === normalizedEmail) || existingUsers?.users?.[0];
        if (authUser?.id) {
          await supabase.auth.admin.updateUserById(authUser.id, { password: newPassword });
        }
      } catch (authErr) {
        console.warn('reset-password: Supabase Auth sync skipped:', authErr?.message);
      }
    };

    let role = null;

    // 1) Clinic
    const { data: clinicRows, error: clinicErr } = await supabase
      .from('clinics').select('id').eq('email', normalizedEmail).limit(1);
    if (clinicErr) throw clinicErr;
    if (clinicRows && clinicRows.length > 0) {
      // Keep plaintext in sync so credential emails show the real current password, and bump
      // credentials_updated_at so the clinic's open session is force-logged-out.
      const { error: updErr } = await supabase.from('clinics').update({
        password: hashed,
        plain_password: newPassword,
        credentials_updated_at: new Date().toISOString()
      }).eq('id', clinicRows[0].id);
      if (updErr) throw updErr;
      role = 'clinic';
    }

    // 2) Patient
    if (!role) {
      const { data: patientRows, error: patientErr } = await supabase
        .from('patients').select('id').eq('email', normalizedEmail);
      if (patientErr) throw patientErr;
      if (patientRows && patientRows.length > 0) {
        // Keep plaintext in sync so credential/email-update emails show the real current
        // password, and bump credentials_updated_at to force-logout the patient's open session.
        const { error: updErr } = await supabase.from('patients').update({
          password: hashed,
          plain_password: newPassword,
          credentials_updated_at: new Date().toISOString()
        }).eq('email', normalizedEmail);
        if (updErr) throw updErr;
        await syncSupabaseAuth();
        role = 'patient';
      }
    }

    // 3) Super admin (profiles row with role super_admin; profiles.id === auth user id)
    if (!role) {
      const { data: adminRows, error: adminErr } = await supabase
        .from('profiles').select('id').eq('email', normalizedEmail).eq('role', 'super_admin').limit(1);
      if (adminErr) throw adminErr;
      if (adminRows && adminRows.length > 0) {
        const adminId = adminRows[0].id;
        // Supabase Auth is the authoritative (and only) credential for super admins.
        // Do NOT write profiles.password here: a populated profiles.password diverts login
        // onto a session-less local-bcrypt branch and breaks super-admin sessions.
        try {
          await supabase.auth.admin.updateUserById(adminId, { password: newPassword });
        } catch (authErr) {
          console.warn('reset-password: super_admin Auth update failed:', authErr?.message);
          await syncSupabaseAuth();
        }
        role = 'super_admin';
      }
    }

    if (!role) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    // Consume the OTP so it cannot be reused.
    otpStore.delete(normalizedEmail);

    res.json({ success: true, role, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Error resetting password:', error?.message || error);
    res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
});

// =====================================================
// SESSION VALIDITY CHECK (force-logout on credential change)
// =====================================================
// Clinic/patient sessions live only in the browser (fake local_token_/patient_token_) and are
// never otherwise re-checked against the DB. The frontend polls this endpoint on the existing
// version-poll interval; when an admin changes a clinic/partner's email or password (or a clinic
// changes a patient's), credentials_updated_at advances (and/or the email no longer matches),
// this returns { valid: false }, and the client wipes the session and sends the user to /login.
app.post('/api/validate-session', async (req, res) => {
  try {
    const { userId, role, email, credentialsUpdatedAt } = req.body || {};

    // Only clinic/patient sessions are validated here. Any other role (e.g. super_admin, which
    // is re-validated against Supabase Auth on load) is treated as still valid.
    const table = role === 'clinic_admin' ? 'clinics' : role === 'patient' ? 'patients' : null;
    if (!table || !userId) {
      return res.json({ valid: true });
    }

    // patients has no is_active column; clinics does — deactivation must end
    // live sessions, not just block the next login.
    const columns = table === 'clinics' ? 'id, email, credentials_updated_at, is_active' : 'id, email, credentials_updated_at';
    const { data: row, error } = await supabase
      .from(table)
      .select(columns)
      .eq('id', userId)
      .maybeSingle();

    // On a transient read error, keep the session (fail-open) so a blip never logs users out.
    if (error) {
      console.warn('validate-session read failed:', error?.message);
      return res.json({ valid: true });
    }

    // Row deleted → session no longer valid.
    if (!row) {
      return res.json({ valid: false });
    }

    // Deactivated clinic → end the session (previously only enforced at login).
    if (table === 'clinics' && row.is_active === false) {
      return res.json({ valid: false, reason: 'deactivated' });
    }

    const emailChanged = (row.email || '').trim().toLowerCase() !== (email || '').trim().toLowerCase();
    // A null baseline (session predates this feature) is "older than" any set DB value.
    const credChanged = !!row.credentials_updated_at &&
      (!credentialsUpdatedAt || new Date(row.credentials_updated_at) > new Date(credentialsUpdatedAt));

    return res.json({ valid: !(emailChanged || credChanged) });
  } catch (error) {
    console.error('validate-session error:', error?.message || error);
    // Fail-open on unexpected errors — never lock a valid user out on a server hiccup.
    return res.json({ valid: true });
  }
});
// Send new password to registered email after password change
app.post('/api/send-password-email', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (!mailerConfigured) {
      return res.json({ success: false, message: 'Email not configured' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      cc: INTERNAL_COPY_EMAIL,
      subject: 'Your Password Has Been Changed - Limitless Brain Lab',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px; text-align: center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
            <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 20px;">Password Changed Successfully</h1>
          </div>
          <div style="padding: 24px; background: #ffffff;">
            <p style="color: #333;">Hi ${name || 'User'},</p>
            <p style="color: #555;">Your password has been successfully changed. Here are your updated login credentials:</p>
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0; color: #333;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0; color: #333;"><strong>New Password:</strong> ${escapeHtml(password)}</p>
            </div>
            <p style="color: #999; font-size: 12px;">If you did not make this change, please contact support immediately.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}/login" style="display: inline-block; background: #323956; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Login Now</a>
            </div>
          </div>
          ${CONTACT_STRIP_HTML}
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Password email sent' });
  } catch (error) {
    console.error('Error sending password email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// Create Patient Auth Account (admin API - no confirmation email)
app.post('/api/create-patient-auth', async (req, res) => {
  try {
    const { email, password, metadata } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        message: 'Supabase admin client not configured'
      });
    }

    // Use admin API to create user - this skips confirmation email
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        ...metadata,
        role: 'patient',
        created_by: 'clinic_admin'
      }
    });

    if (error) {
      // If user already exists, fetch the existing user and return success
      if (error.message && error.message.includes('already been registered')) {
        // Use listUsers with filter instead of loading all users
        const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({
          filter: email,
          perPage: 1
        });
        if (!listError && existingUsers?.users?.length > 0) {
          return res.json({
            success: true,
            user: existingUsers.users[0],
            existing: true
          });
        }
      }
      console.error('Admin createUser error:', error);
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }


    // Also create profile record
    if (data.user) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            role: 'patient',
            full_name: metadata?.full_name || '',
            created_at: new Date().toISOString()
          }, { onConflict: 'id' });
      } catch (profileError) {
        console.error('Profile creation failed:', profileError.message);
      }
    }

    res.json({
      success: true,
      user: data.user
    });

  } catch (error) {
    console.error('Error creating patient auth:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create patient auth'
    });
  }
});

// Send Welcome Email with Login Credentials to Patient
app.post('/api/send-welcome-email', async (req, res) => {
  try {
    const { patientName, email, password, clinicName, clinicEmail } = req.body;
    console.log('📧 send-welcome-email called:', { patientName, email, clinicName, clinicEmail });

    if (!email || !password || !patientName) {
      console.log('❌ Missing required fields:', { email: !!email, password: !!password, patientName: !!patientName });
      return res.status(400).json({
        success: false,
        message: 'Patient name, email and password are required'
      });
    }

    // All outbound mail uses the production transporter and sender. Clinic SMTP
    // credentials are accepted for backward-compatible request payloads only and
    // are intentionally ignored so this flow cannot bypass Brevo in production.
    const transporter = emailTransporter;
    const fromEmail = EMAIL_FROM;
    console.log('✅ Using production email sender:', fromEmail);

    const loginUrl = `${APP_URL}/patient/login`;

    const mailOptions = {
      from: fromEmail,
      to: email,
      cc: INTERNAL_COPY_EMAIL,
      subject: 'Welcome to Limitless Brain Lab - Your Login Credentials',
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
              <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Limitless Brain Lab!</h1>
              <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Your Brain & Mental Wellness Partner</p>
            </div>

            <div style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${patientName}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Your account has been created by <strong>${clinicName || 'your clinic'}</strong>.
                You can now login to view your brain health reports and insights.
              </p>

              <div style="background: #f8f9fc; border-radius: 10px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #323956; margin: 0 0 15px; font-size: 16px;">Your Login Credentials</h3>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Email</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${email}</p>
                </div>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; border-left: 4px solid #10b981;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Password</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600; font-family: monospace;">${escapeHtml(password)}</p>
                </div>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Login Now →
                </a>
              </div>

              <div style="background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 12px;">
                  <strong>Security Tip:</strong> Please change your password after first login and keep your credentials safe.
                </p>
              </div>
            </div>

            <div style="background: #f8f9fc; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #888; margin: 0; font-size: 11px;">
                © ${new Date().getFullYear()} Limitless Brain Lab | Brain & Mental Wellness
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const sendResult = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent successfully:', { to: email, messageId: sendResult?.messageId });

    // Also notify the clinic that a new patient was created. Separate template with
    // NO password. Sent from the default system address (not clinic SMTP) so it reliably
    // lands in the clinic's inbox even when clinic SMTP isn't configured. Non-fatal —
    // a failure here must not break the patient welcome email.
    if (clinicEmail) {
      try {
        const dashboardUrl = `${APP_URL}/clinic/login`;
        const dateAdded = fmtDateTime(new Date());
        await emailTransporter.sendMail({
          from: EMAIL_FROM,
          to: clinicEmail,
          subject: `New Patient Added: ${patientName}`,
          attachments: getLogoAttachment(),
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="margin:0;padding:20px;font-family:Arial,sans-serif;background-color:#f4f7fa;">
              <div style="max-width:500px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                <div style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:25px;text-align:center;">
                  <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:10px;" />
                  <h1 style="color:white;margin:0;font-size:24px;">New Patient Added</h1>
                  <p style="color:#F5D05D;margin:8px 0 0;font-size:14px;">Patient Management Notification</p>
                </div>
                <div style="padding:30px;">
                  <p style="color:#333;font-size:16px;margin:0 0 20px;">Hello <strong>${clinicName || 'your clinic'}</strong>,</p>
                  <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 20px;">
                    A new patient has been created under your clinic on Limitless Brain Lab.
                    Their account is now active and login credentials have been sent to the patient directly.
                  </p>
                  <div style="background:#f8f9fc;border-radius:10px;padding:20px;margin:20px 0;">
                    <div style="background:white;border-radius:8px;padding:12px 15px;margin-bottom:10px;border-left:4px solid #3b82f6;">
                      <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Patient Name</p>
                      <p style="color:#323956;margin:4px 0 0;font-size:15px;font-weight:600;">${patientName}</p>
                    </div>
                    <div style="background:white;border-radius:8px;padding:12px 15px;margin-bottom:10px;border-left:4px solid #10b981;">
                      <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Email</p>
                      <p style="color:#323956;margin:4px 0 0;font-size:15px;font-weight:600;">${email}</p>
                    </div>
                    <div style="background:white;border-radius:8px;padding:12px 15px;border-left:4px solid #F5D05D;">
                      <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Date Added</p>
                      <p style="color:#323956;margin:4px 0 0;font-size:15px;font-weight:600;">${dateAdded}</p>
                    </div>
                  </div>
                  <div style="text-align:center;margin:25px 0;">
                    <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);color:white;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:600;font-size:14px;">
                      Open Clinic Dashboard →
                    </a>
                  </div>
                  <p style="color:#999;font-size:12px;line-height:1.6;margin:0;">
                    No action is required. You can view and manage this patient from your clinic dashboard.
                  </p>
                </div>
                <div style="background:#f8f9fc;padding:15px;text-align:center;border-top:1px solid #e5e7eb;">
                  <p style="color:#888;margin:0;font-size:11px;">© ${new Date().getFullYear()} Limitless Brain Lab | Brain &amp; Mental Wellness</p>
                </div>
              </div>
            </body>
            </html>
          `
        });
        console.log('✅ Clinic new-patient notification sent:', clinicEmail);
      } catch (clinicMailErr) {
        console.error('⚠️ Clinic notification failed (non-fatal):', clinicMailErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Welcome email sent successfully'
    });

  } catch (error) {
    const errorMsg = error?.message || 'Unknown error';
    console.error('❌ Error sending welcome email:', {
      message: errorMsg,
      code: error?.code,
      response: error?.response,
      defaultEmailUser: process.env.EMAIL_USER
    });
    res.status(500).json({
      success: false,
      message: `Email send failed: ${errorMsg}`
    });
  }
});

// Send Email Updated Notification
app.post('/api/send-email-update-notification', async (req, res) => {
  try {
    const { patientName, newEmail, password, emailChanged, passwordChanged, clinicName, clinicUrl, clinicEmail } = req.body;
    console.log('📧 send-email-update-notification called:', { patientName, newEmail, clinicName, emailChanged: !!emailChanged, passwordChanged: !!passwordChanged, clinicEmail });

    if (!newEmail || !patientName) {
      console.log('❌ Missing required fields:', { email: !!newEmail, patientName: !!patientName });
      return res.status(400).json({
        success: false,
        message: 'Patient name and new email are required'
      });
    }

    // Keep the sender consistent with report and payment emails. Clinic SMTP
    // credentials remain accepted in the payload for older clients, but are not
    // used for outbound delivery.
    const transporter = emailTransporter;
    const fromEmail = EMAIL_FROM;

    // Always show the plain-text password when one is provided. When the password was
    // changed this edit it's the new one; on an email-only edit the caller passes the
    // stored current password so the recipient still sees it. Only fall back to the
    // "unchanged" note when no plaintext is available (e.g. legacy patients).
    const hasPassword = !!password;
    const passwordLabel = passwordChanged ? 'New Password' : 'Current Password';
    const loginUrl = `${APP_URL}/patient/login`;

    const mailOptions = {
      from: fromEmail,
      to: newEmail,
      cc: INTERNAL_COPY_EMAIL,
      subject: 'Your login credentials were updated — Limitless Brain Lab Portal',
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
              <h1 style="color: white; margin: 0; font-size: 22px;">Credentials Updated</h1>
              <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Your Limitless Brain Lab Portal Access</p>
            </div>

            <div style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${patientName}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Your login details for <strong>${clinicName || 'your clinic'}</strong> have been updated. Your current portal credentials are below.
              </p>

              <div style="background: #f8f9fc; border-radius: 10px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #323956; margin: 0 0 15px; font-size: 16px;">Updated Information</h3>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Updated Email ID</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${newEmail}</p>
                </div>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; border-left: 4px solid #10b981;">
                  ${hasPassword
                    ? `<p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">${passwordLabel}</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600; font-family: monospace;">${escapeHtml(password)}</p>`
                    : `<p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Password</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 14px; font-weight: 500;">Unchanged — keep using your existing password.</p>`}
                </div>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Login to Portal →
                </a>
              </div>

              <div style="background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 12px;">
                  <strong>Security Tip:</strong> Please change your password after first login and keep your credentials safe.
                </p>
              </div>

              <p style="color: #666; font-size: 13px; line-height: 1.6; margin-top: 20px;">
                If you have any questions, please reply to this email and we'll be happy to help.
              </p>
            </div>

            <div style="background: #f8f9fc; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #888; margin: 0; font-size: 11px;">
                © ${new Date().getFullYear()} Limitless Brain Lab | Brain & Mental Wellness
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const sendResult = await transporter.sendMail(mailOptions);
    console.log('✅ Credentials update email sent successfully:', { to: newEmail, messageId: sendResult?.messageId, passwordChanged });

    // Also notify the clinic that a patient's login details changed (no password shown, non-fatal).
    if (clinicEmail) {
      try {
        const changed = [emailChanged ? 'Email' : null, passwordChanged ? 'Password' : null].filter(Boolean).join(' and ') || 'Login details';
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: clinicEmail,
          subject: `Patient Login Details Updated: ${patientName || 'Patient'}`,
          heading: 'Patient Login Details Updated',
          subheading: 'Patient Management Notification',
          greetingName: clinicName || 'your clinic',
          intro: `The login details for your patient <strong>${patientName || 'your patient'}</strong> were updated on Limitless Brain Lab. The updated credentials have been sent to the patient directly.`,
          rows: [
            { label: 'Patient Name', value: patientName || '—' },
            { label: 'New Email', value: newEmail || '—' },
            { label: 'What Changed', value: changed }
          ],
          footerNote: 'No action is required.'
        }));
        console.log('✅ Clinic credentials-update notification sent:', clinicEmail);
      } catch (clinicMailErr) {
        console.error('⚠️ Clinic credentials-update notification failed (non-fatal):', clinicMailErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Credentials update email sent successfully'
    });

  } catch (error) {
    const errorMsg = error?.message || 'Unknown error';
    console.error('❌ Error sending email update notification:', {
      message: errorMsg,
      code: error?.code,
      response: error?.response
    });
    res.status(500).json({
      success: false,
      message: `Email send failed: ${errorMsg}`
    });
  }
});

// Send QEEG Report Email to Clinic and Patient
app.post('/api/send-report-email', async (req, res) => {
  try {
    const {
      patientName,
      patientEmail,
      clinicName,
      clinicEmail,
      reportUrl,
      generatedAt,
      reportType
    } = req.body;

    console.log('📧 send-report-email called:', {
      patientName,
      patientEmail,
      clinicName,
      clinicEmail,
      reportUrl: reportUrl ? reportUrl.slice(0, 100) : undefined,
      generatedAt
    });

    // clinicEmail is OPTIONAL — the patient must always get the report; the clinic
    // copy is only sent when a real clinic email is supplied (never a fake fallback).
    if (!patientEmail || !reportUrl) {
      return res.status(400).json({
        success: false,
        message: 'Patient email and report URL are required'
      });
    }

    if (!emailTransporter) {
      console.error('❌ send-report-email failed: no email transporter configured');
      return res.status(500).json({
        success: false,
        message: 'Email service not configured'
      });
    }

    const transporter = emailTransporter;
    const fromEmail = EMAIL_FROM;

    const FRONTEND_URL = APP_URL;
    const patientLoginUrl = `${FRONTEND_URL}/patient/login`;
    const clinicLoginUrl = `${FRONTEND_URL}/clinic/login`;

    // NeuroSense Report (QEEG) uses its own template/subject; everything else keeps the
    // existing Neuro Performance Report template unchanged.
    const isNeuroSense = reportType === 'neurosense';
    const reportLabel = isNeuroSense ? 'NeuroSense Report' : 'Neuro Performance Report';
    const buildReportHtml = isNeuroSense ? getNeuroSenseReportEmailHtml : getReportEmailHtml;

    const reportHtmlPatient = buildReportHtml({ isClinic: false, patientName, clinicName, reportUrl, loginUrl: patientLoginUrl, generatedAt });
    const reportHtmlClinic = buildReportHtml({ isClinic: true, patientName, clinicName, reportUrl, loginUrl: clinicLoginUrl, generatedAt });

    const patientMailOptions = {
      from: fromEmail,
      to: patientEmail,
      cc: INTERNAL_COPY_EMAIL,
      replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || EMAIL_FROM,
      headers: {
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || 'noreply@limitlessbrainlab.com'}?subject=unsubscribe>`,
        'X-Mailer': 'Limitless Brain Lab Mailer'
      },
      subject: `Your ${reportLabel} is Ready`,
      text: `Hi ${patientName || 'there'},\n\nYour ${reportLabel} is ready.\n\nDownload your report (PDF): ${reportUrl}\nLog in to your portal: ${patientLoginUrl}\n\nThe Limitless Brain Lab Team`,
      attachments: getLogoAttachment(),
      html: reportHtmlPatient
    };

    let clinicEmailSent = false;

    // Always send to the patient first. The clinic copy is non-fatal.
    await transporter.sendMail(patientMailOptions);
    console.log('✉️ Patient report email sent:', patientEmail);

    if (clinicEmail) {
      const clinicMailOptions = {
        from: fromEmail,
        to: clinicEmail,
        cc: INTERNAL_COPY_EMAIL,
        subject: `${reportLabel} — ${patientName || 'Patient'}`,
        text: `Hello ${clinicName || 'Clinic'},\n\nThe ${reportLabel} for ${patientName || 'your patient'} is ready for clinical review.\n\nDownload the report (PDF): ${reportUrl}\nLog in to your portal: ${clinicLoginUrl}\n\nThe Limitless Brain Lab Team`,
        attachments: getLogoAttachment(),
        html: reportHtmlClinic
      };
      try {
        await transporter.sendMail(clinicMailOptions);
        clinicEmailSent = true;
        console.log('✉️ Clinic report email sent:', clinicEmail);
      } catch (clinicError) {
        console.error('⚠️ Clinic report email failed:', clinicError);
      }
    }

    const message = clinicEmail
      ? clinicEmailSent
        ? 'Report emails sent to clinic and patient successfully'
        : 'Patient email sent; clinic email failed'
      : 'Report email sent to patient successfully';

    return res.json({ success: true, message });

  } catch (error) {
    console.error('❌ Error sending report emails:', error);
    return res.status(500).json({
      success: false,
      message: `Email send failed: ${error.message || 'Unknown error'}`
    });
  }
});

// Send Calendly Scheduling Link Email to Patient after coaching payment
app.post('/api/send-coaching-link', async (req, res) => {
  try {
    const COMMON_CALENDLY = 'https://calendly.com/admin-bettroi/30min';
    const { patientName, patientEmail, coachName, calendlyUrl, coachEmail, sessionId } = req.body;

    if (!patientEmail || !coachName) {
      return res.status(400).json({
        success: false,
        message: 'Patient email and coach name are required'
      });
    }

    if (!emailTransporter) {
      return res.status(500).json({
        success: false,
        message: 'Email service not configured'
      });
    }

    const scheduleLink = calendlyUrl || COMMON_CALENDLY;
    // Calendly removed from the booking flow — the team emails the session link manually.
    const hasCalendly = false;

    const mailOptions = {
      from: EMAIL_FROM,
      to: patientEmail,
      subject: `Your Brain Coaching Session with ${coachName} - Booking Confirmed`,
      attachments: getLogoAttachment(),
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
              <h1 style="color: white; margin: 0; font-size: 22px;">Payment Successful!</h1>
              <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Your Brain Coaching Session is Confirmed</p>
            </div>

            <div style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${patientName || 'there'}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Thank you for your booking! Your payment for a brain coaching session with <strong>${coachName}</strong> has been received successfully.
                ${hasCalendly ? 'Please click the button below to schedule your session at a convenient time.' : 'Our team will email you the session link shortly.'}
              </p>

              ${hasCalendly ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${scheduleLink}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Schedule Your Session
                </a>
              </div>

              <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                <p style="color: #1e40af; margin: 0; font-size: 13px; font-weight: 600;">Scheduling Link</p>
                <p style="color: #1e40af; margin: 4px 0 0; font-size: 13px; word-break: break-all;">
                  <a href="${scheduleLink}" style="color: #2563eb;">${scheduleLink}</a>
                </p>
              </div>
              ` : `
              <div style="background: #fefce8; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #eab308;">
                <p style="color: #854d0e; margin: 0; font-size: 13px;">
                  Our team will email you the session link shortly. Thank you for your booking!
                </p>
              </div>
              `}

              <div style="background: #f8f9fc; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <h3 style="color: #323956; margin: 0 0 10px; font-size: 14px;">Session Details</h3>
                <p style="color: #666; margin: 4px 0; font-size: 13px;">Coach: <strong>${coachName}</strong></p>
                <p style="color: #666; margin: 4px 0; font-size: 13px;">Duration: <strong>30 minutes</strong></p>
                <p style="color: #666; margin: 4px 0; font-size: 13px;">Mode: <strong>Online</strong></p>
              </div>
            </div>

            <div style="background: #f8f9fc; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #888; margin: 0; font-size: 11px;">
                &copy; ${new Date().getFullYear()} Limitless Brain Lab | Brain & Mental Wellness
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    if (await claimNotificationOnce(sessionId ? `coaching:${sessionId}:patient` : null)) {
      await emailTransporter.sendMail(mailOptions);
    }

    // Notify coach if their email was provided
    if (coachEmail) {
      const coachMailOptions = {
        from: EMAIL_FROM,
        to: coachEmail,
        subject: `New Coaching Session Booked — ${patientName || 'A Patient'} has paid`,
        attachments: getLogoAttachment(),
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
                <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
                <h1 style="color: white; margin: 0; font-size: 22px;">New Session Booked!</h1>
                <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">A patient has booked and paid for a session with you</p>
              </div>
              <div style="padding: 30px;">
                <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                  Hello <strong>${coachName}</strong>,
                </p>
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                  <strong>${patientName || 'A patient'}</strong> (${patientEmail}) has successfully booked and paid for a brain coaching session with you.
                </p>
                <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                  <p style="color: #1e40af; margin: 0; font-size: 13px; font-weight: 600;">Patient Details</p>
                  <p style="color: #1e40af; margin: 4px 0 0; font-size: 13px;">Name: <strong>${patientName || 'N/A'}</strong></p>
                  <p style="color: #1e40af; margin: 4px 0 0; font-size: 13px;">Email: <strong>${patientEmail}</strong></p>
                </div>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                  Our team will share the session link with the patient. Please coordinate the session timing as needed.
                </p>
              </div>
              <div style="background: #f8f9fc; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #888; margin: 0; font-size: 11px;">
                  &copy; ${new Date().getFullYear()} Limitless Brain Lab | Brain &amp; Mental Wellness
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };
      if (await claimNotificationOnce(sessionId ? `coaching:${sessionId}:coach` : null)) {
        await emailTransporter.sendMail(coachMailOptions).catch(err => console.error('Coach notification email failed:', err.message));
      }
    }

    res.json({
      success: true,
      message: 'Coaching link email sent successfully'
    });

  } catch (error) {
    console.error('Error sending coaching link email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send coaching link email'
    });
  }
});

// Admin API: Fetch all data from any table (bypasses RLS using service role key)
app.get('/api/admin/table/:tableName', authMiddleware, async (req, res) => {
  try {
    // Role may live in profiles table rather than user_metadata (see AuthContext.jsx)
    let role = req.user?.role;
    if (role !== 'super_admin' && supabase && req.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .single();
      if (profile?.role) role = profile.role;
    }

    if (role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Super admin role required' });
    }

    const { tableName } = req.params;
    const allowedTables = ['reports', 'patients', 'clinics', 'subscriptions', 'organizations', 'superAdmins', 'coaches', 'clinical_reports', 'clinical_documentation', 'algorithm_results'];

    if (!allowedTables.includes(tableName)) {
      return res.status(400).json({ success: false, message: 'Table not allowed' });
    }

    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase not configured' });
    }

    // Fetch all data using service role key (bypasses RLS)
    let allData = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) {
        return res.status(500).json({ success: false, message: error.message });
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    res.json({ success: true, data: allData, count: allData.length });
  } catch (error) {
    console.error('Admin table fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: true,
    // Plain-language message for users — raw details stay in the server logs
    message: process.env.NODE_ENV === 'development'
      ? (err.message || 'Internal server error')
      : 'Something went wrong on the server. Please try again in a few moments.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Request Demo Report endpoint
app.post('/api/request-demo-report', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email || !phone) {
      return res.status(400).json({ success: false, message: 'Email and phone are required' });
    }

    // Persist server-side with the service-role client so this public form does
    // not depend on the browser's anonymous Supabase RLS policy.
    if (supabase) {
      const { error: dbError } = await supabase
        .from('demo_report_requests')
        .insert([{ email, phone }]);
      if (dbError) console.error('Demo report request persistence failed:', dbError.message);
    }

    await emailTransporter.sendMail({
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Demo Report Request - ${email}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px;">
                      <table width="100%">
                        <tr>
                          <td>
                            <table>
                              <tr>
                                <td style="vertical-align: middle;">
                                  <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover;" />
                                </td>
                                <td style="vertical-align: middle; padding-left: 12px;">
                                  <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Limitless Brain Lab</h1>
                                  <p style="color: #F5D05D; margin: 4px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">
                                    DEMO REPORT REQUEST
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td align="right" style="vertical-align: middle;">
                            <div style="background: rgba(255,255,255,0.12); border-radius: 10px; padding: 10px 14px; display: inline-block;">
                              <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Received on</p>
                              <p style="color: #ffffff; margin: 3px 0 0; font-size: 13px; font-weight: 600;">${fmtDateTime(new Date())}</p>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Contact Details -->
                  <tr>
                    <td style="padding: 24px 32px;">
                      <table width="100%" cellpadding="0" cellspacing="8">
                        <tr>
                          <td width="50%" style="background: #f8f9fc; border-radius: 8px; padding: 14px 16px;">
                            <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">EMAIL</p>
                            <p style="color: #323956; margin: 4px 0 0; font-size: 13px; font-weight: 500;">${email}</p>
                          </td>
                          <td width="50%" style="background: #f8f9fc; border-radius: 8px; padding: 14px 16px;">
                            <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">PHONE</p>
                            <p style="color: #323956; margin: 4px 0 0; font-size: 13px; font-weight: 500;">${phone}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #888; margin: 0; font-size: 12px;">
                        This inquiry was received from <strong style="color: #323956;">Limitless Brain Lab</strong> - Demo Report Request Form
                      </p>
                      <p style="color: #aaa; margin: 6px 0 0; font-size: 11px;">
                        ${new Date().toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      attachments: getLogoAttachment()
    }).catch((err) => console.error('Demo admin notification failed:', err.message));

    // Send the actual DEMO REPORTS to the user who requested them.
    const demoPerfReport = path.join(__dirname, 'assets', 'demo-reports', 'NeuroSense-Performance-Report.pdf');
    const demoNeuroReport = path.join(__dirname, 'assets', 'demo-reports', 'NeuroSense-Report.pdf');
    const demoAttachments = getLogoAttachment();
    if (fs.existsSync(demoPerfReport)) {
      demoAttachments.push({ filename: 'NeuroSense Performance Report.pdf', path: demoPerfReport });
    } else {
      console.warn('Demo performance report not found:', demoPerfReport);
    }
    if (fs.existsSync(demoNeuroReport)) {
      demoAttachments.push({ filename: 'NeuroSense Report.pdf', path: demoNeuroReport });
    } else {
      console.warn('Demo NeuroSense report not found:', demoNeuroReport);
    }

    await emailTransporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: 'Your NeuroSense Demo Reports - Limitless Brain Lab',
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;padding:40px 20px;"><tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
              <tr><td style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:28px 32px;text-align:center;">
                <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:80px;height:80px;border-radius:50%;object-fit:cover;" />
                <h1 style="color:#ffffff;margin:14px 0 0;font-size:22px;font-weight:700;">Your NeuroSense Demo Reports</h1>
              </td></tr>
              <tr><td style="padding:28px 32px;color:#444;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 14px;">Thank you for your interest in <strong style="color:#323956;">Limitless Brain Lab</strong>.</p>
                <p style="margin:0 0 12px;">Attached are two sample reports showing exactly what you receive with a NeuroSense brain assessment:</p>
                <ul style="margin:0 0 14px;padding-left:18px;">
                  <li style="margin-bottom:6px;"><strong>NeuroSense Performance Report</strong> &mdash; your 12-page brain-type &amp; performance breakdown.</li>
                  <li><strong>NeuroSense Report</strong> &mdash; the detailed QEEG brain health report.</li>
                </ul>
                <p style="margin:0 0 16px;color:#666;font-size:13px;">These are sample reports for demonstration. Your personalized reports are generated from your own brain scan.</p>
                <p style="margin:18px 0 0;">Warm regards,<br/><strong style="color:#323956;">Team Limitless Brain Lab</strong></p>
              </td></tr>
              <tr><td style="background:#f8f9fc;padding:18px 32px;border-top:1px solid #e5e7eb;color:#aaa;font-size:11px;">
                This demo report was sent from Limitless Brain Lab.
              </td></tr>
            </table>
          </td></tr></table>
        </body></html>
      `,
      attachments: demoAttachments
    });

    res.json({ success: true, message: 'Demo report sent to your email' });
  } catch (error) {
    console.error('Error sending demo report request email:', error);
    res.status(500).json({ success: false, message: 'Failed to submit request. Please try again.' });
  }
});

// =====================================================
// PATIENT REPORT NOTIFICATION
// =====================================================
app.post('/api/notify-patient-report', async (req, res) => {
  try {
    const { patientEmail, patientName, reportType, clinicName, clinicEmail } = req.body;

    if (!patientEmail && !clinicEmail) {
      return res.status(400).json({ success: false, message: 'At least patient or clinic email is required' });
    }

    if (!mailerConfigured) {
      return res.status(500).json({ success: false, message: 'Email not configured' });
    }

    const displayName = patientName || 'there';
    const displayReport = reportType || 'Brain Wellness Report';
    const displayClinic = clinicName || 'your clinic';
    const FRONTEND_URL = APP_URL;

    const emailsSent = [];

    // 1. Send email to patient
    if (patientEmail) {
      const patientMail = {
        from: EMAIL_FROM,
        to: patientEmail,
        subject: `Your ${displayReport} is Ready - Limitless Brain Lab`,
        attachments: [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }],
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">Your Report is Ready</h1>
            </div>
            <div style="padding: 28px 32px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">Hi <strong>${displayName}</strong>,</p>
              <p style="color: #333; font-size: 15px; line-height: 1.6;">Great news! Your <strong>${displayReport}</strong> has been prepared by <strong>${displayClinic}</strong> and is now available in your dashboard.</p>
              <div style="background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
                <p style="margin: 0; color: #3730a3; font-weight: 600;">Your personalized brain health insights are waiting for you.</p>
              </div>
              <p style="color: #555; font-size: 14px;">Log in to your dashboard to view your detailed report, brain health parameters, and personalized recommendations.</p>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">View My Report</a>
              </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; info@limitlessbrainlab.com</p>
            </div>
          </div>
        `
      };
      await emailTransporter.sendMail(patientMail);
      emailsSent.push(patientEmail);
      console.log(`✉️ Patient report notification sent to ${patientEmail}`);
    }

    // 2. Send email to clinic
    if (clinicEmail) {
      const clinicMail = {
        from: EMAIL_FROM,
        to: clinicEmail,
        subject: `Report Uploaded for Patient ${displayName} - Limitless Brain Lab`,
        attachments: [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }],
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
              <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">Report Uploaded</h1>
            </div>
            <div style="padding: 28px 32px;">
              <p style="color: #333; font-size: 15px; line-height: 1.6;">Dear <strong>${displayClinic}</strong>,</p>
              <p style="color: #333; font-size: 15px; line-height: 1.6;">A new <strong>${displayReport}</strong> has been uploaded for your patient <strong>${displayName}</strong> by the Limitless Brain Lab admin team.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
                <p style="margin: 0; color: #166534; font-weight: 600;">The report is now available in your clinic dashboard under Patient Reports.</p>
              </div>
              <p style="color: #555; font-size: 14px;">Please log in to review the report and share it with the patient as needed.</p>
              <div style="text-align: center; margin-top: 24px;">
                <a href="${FRONTEND_URL}/clinic/reports" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">View in Dashboard</a>
              </div>
            </div>
            <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; info@limitlessbrainlab.com</p>
            </div>
          </div>
        `
      };
      await emailTransporter.sendMail(clinicMail);
      emailsSent.push(clinicEmail);
      console.log(`✉️ Clinic report notification sent to ${clinicEmail}`);
    }

    // Log to admin_notifications
    if (supabase) {
      supabase.from('admin_notifications').insert({
        type: 'info',
        category: 'report_delivery',
        title: 'Report Notification Email Sent',
        message: `Email sent to ${emailsSent.join(', ')} about ${displayReport} for ${displayName} from ${displayClinic}.`,
        clinic_name: displayClinic,
        patient_name: displayName,
        action: 'email_sent',
        action_data: { patientEmail, clinicEmail, reportType: displayReport },
        is_read: false
      }).then(({ error: notifErr }) => {
        if (notifErr) console.error('Failed to log notification:', notifErr);
      });
    }

    res.json({ success: true, message: `Report notification sent to: ${emailsSent.join(', ')}` });
  } catch (error) {
    console.error('❌ Error sending report notification:', error);
    res.status(500).json({ success: false, message: 'Failed to send notification' });
  }
});

// =====================================================
// NO CREDIT EMAIL — Clinic/Partner out of report credits
// =====================================================
app.post('/api/send-no-credit-email', async (req, res) => {
  try {
    const { clinicEmail, clinicName, clinicType, notifyAdmin } = req.body;

    if (!clinicEmail) {
      return res.status(400).json({ success: false, message: 'Clinic email is required' });
    }

    if (!mailerConfigured) {
      return res.status(500).json({ success: false, message: 'Email not configured' });
    }

    const FRONTEND_URL = APP_URL;
    const displayName = clinicName || 'Clinic Admin';
    const accountType = clinicType === 'lbl_partner' ? 'Partner' : 'Clinic';
    const dashboardPath = clinicType === 'lbl_partner' ? '/clinic/subscription' : '/clinic/subscription';

    const mailOptions = {
      from: EMAIL_FROM,
      to: clinicEmail,
      subject: `No Report Credits Remaining - Action Required - Limitless Brain Lab`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px 32px; text-align: center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
            <h1 style="color: #ffffff; margin: 12px 0 0; font-size: 20px;">No Report Credits Remaining</h1>
          </div>
          <div style="padding: 28px 32px;">
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Dear <strong>${displayName}</strong>,</p>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">You have <strong>0 report credits</strong> remaining in your ${accountType} account. You will not be able to add new patients until you purchase a new package.</p>
            <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
              <p style="margin: 0; color: #c2410c; font-weight: 600; font-size: 14px;">Action Required: Purchase a report package to continue adding patients.</p>
            </div>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">To purchase more credits, visit your Subscription tab in the dashboard and choose a package that suits your needs.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${FRONTEND_URL}${dashboardPath}" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">Buy More Credits</a>
            </div>
            <p style="color: #999; font-size: 12px; line-height: 1.6;">If you need assistance, please contact us at <a href="mailto:info@limitlessbrainlab.com" style="color: #323956;">info@limitlessbrainlab.com</a></p>
          </div>
          <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; info@limitlessbrainlab.com</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✉️ No-credit email sent to ${clinicEmail}`);

    // Optionally copy the super-admin inbox (e.g. generation was blocked from the admin side).
    if (notifyAdmin) {
      const adminInbox = process.env.EMAIL_TO || process.env.EMAIL_USER;
      if (adminInbox) {
        try {
          await emailTransporter.sendMail({
            from: EMAIL_FROM,
            to: adminInbox,
            subject: `Report blocked — no credits: ${displayName}`,
            attachments: getLogoAttachment(),
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div style="padding: 24px 28px;">
                  <p style="color:#333;font-size:15px;margin-top:0;">A report generation was <strong>blocked</strong> because the ${accountType.toLowerCase()} has 0 report credits.</p>
                  <div style="background:#f8f9fc;border-radius:10px;padding:16px 20px;margin:16px 0;">
                    <p style="margin:0;color:#323956;font-size:14px;"><strong>${accountType}:</strong> ${displayName}</p>
                    <p style="margin:6px 0 0;color:#323956;font-size:14px;"><strong>Email:</strong> ${clinicEmail}</p>
                  </div>
                  <p style="color:#666;font-size:13px;">The ${accountType.toLowerCase()} has been notified to purchase more credits.</p>
                </div>
                ${CONTACT_STRIP_HTML}
              </div>`,
          });
          console.log(`✉️ No-credit admin copy sent to ${adminInbox}`);
        } catch (adminMailErr) {
          console.warn('No-credit admin copy failed (non-fatal):', adminMailErr.message);
        }
      }
    }

    res.json({ success: true, message: 'No credit notification email sent' });
  } catch (error) {
    console.error('❌ Error sending no-credit email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// REPORT-CREDIT THRESHOLD ALERTS — half / one-left / exhausted → clinic + admin
// Call after a report is created (credit consumed). The endpoint reads the LIVE
// reports_used/reports_allowed and fires the matching alert exactly when the
// threshold value is hit (used climbs by 1 per report, so each tier fires once).
// ════════════════════════════════════════════════════════════════════════════════
const DEFAULT_CLINIC_ID_ALERT = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30'; // LBL — unlimited

app.post('/api/send-credit-alert', async (req, res) => {
  try {
    const { clinicId } = req.body || {};
    if (!clinicId) return res.status(400).json({ success: false, message: 'clinicId is required' });
    if (clinicId === DEFAULT_CLINIC_ID_ALERT) return res.json({ success: true, sent: false, reason: 'default clinic (unlimited)' });
    if (!mailerConfigured) return res.status(500).json({ success: false, message: 'Email not configured' });

    const { data: clinic } = await supabase
      .from('clinics')
      .select('name, email, reports_used, reports_allowed, clinic_type')
      .eq('id', clinicId)
      .single();

    if (!clinic) return res.json({ success: true, sent: false, reason: 'clinic not found' });
    const allowed = Number(clinic.reports_allowed) || 0;
    const used = Number(clinic.reports_used) || 0;
    if (allowed <= 0) return res.json({ success: true, sent: false, reason: 'no allowance configured (treated as unlimited)' });
    const remaining = allowed - used;

    // Determine which threshold was hit (exact, so it fires once as used climbs by 1).
    // Band-crossing detection from the LIVE clinics values: fire a tier exactly once when this
    // report's single consumed credit pushed `remaining` into a more-severe band (compare current
    // remaining vs remaining+1 = the value before this report). Robust to odd allowances; no spam.
    const half = Math.floor(allowed / 2);
    const tierOf = (r) => (r <= 0 ? 'exhausted' : r <= 1 ? 'one_left' : (half >= 2 && r <= half) ? 'half' : 'none');
    const rank = { none: 0, half: 1, one_left: 2, exhausted: 3 };
    const cur = tierOf(remaining);
    const prev = tierOf(remaining + 1);
    const tier = (cur !== 'none' && rank[cur] > rank[prev]) ? cur : null;
    if (!tier) return res.json({ success: true, sent: false, reason: 'no threshold crossed', remaining });

    const FRONTEND_URL = APP_URL;
    const buyUrl = `${FRONTEND_URL}/clinic/subscription`;
    const clinicName = clinic.name || 'your clinic';
    const usageRows = [
      { label: 'Reports Used', value: `${used} of ${allowed}` },
      { label: 'Remaining', value: `${Math.max(0, remaining)}` },
    ];

    // Per-tier copy (clinic-facing).
    const TIERS = {
      half: {
        subject: `Half of your report credits used — Limitless Brain Lab`,
        heading: 'Half Credit Limit Reached',
        subheading: 'Report Credits Update',
        intro: `You've used <strong>half</strong> of your report credits. You can keep generating reports, but consider recharging soon to avoid interruption.`,
        footer: 'You can top up anytime from your Subscription page.',
      },
      one_left: {
        subject: `Only 1 report credit remaining — Limitless Brain Lab`,
        heading: 'Only 1 Report Credit Left',
        subheading: 'Action Recommended',
        intro: `You have <strong>only 1 report credit remaining</strong>. After the next report, you won't be able to generate more until you recharge.`,
        footer: 'Please recharge your credits to avoid interruption.',
      },
      exhausted: {
        subject: `Report credits exhausted — Action required — Limitless Brain Lab`,
        heading: 'Report Credits Exhausted',
        subheading: 'Action Required',
        intro: `Your report credits are <strong>fully exhausted (0 remaining)</strong>. Report generation is paused for this clinic until you recharge.`,
        footer: 'Please recharge your credits to continue generating reports.',
      },
    };
    const t = TIERS[tier];

    // 1) Clinic email.
    if (clinic.email) {
      try {
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: clinic.email,
          subject: t.subject,
          heading: t.heading,
          subheading: t.subheading,
          greetingName: clinicName,
          intro: t.intro,
          rows: usageRows,
          footerNote: `${t.footer}<br/><a href="${buyUrl}" style="color:#323956;font-weight:600;">Recharge credits →</a>`,
        }));
      } catch (e) { console.error('⚠️ Clinic credit alert failed (non-fatal):', e.message); }
    }

    // 2) Admin copy.
    const adminInbox = process.env.EMAIL_TO || process.env.EMAIL_USER;
    if (adminInbox) {
      try {
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: adminInbox,
          subject: `[Admin] ${clinicName}: ${t.heading}`,
          heading: t.heading,
          subheading: 'Clinic Credit Alert',
          greetingName: 'Admin',
          intro: `Clinic <strong>${clinicName}</strong> has hit a report-credit threshold (${tier.replace('_', ' ')}).`,
          rows: [{ label: 'Clinic', value: clinicName }, { label: 'Email', value: clinic.email || '—' }, ...usageRows],
          footerNote: 'Automated credit-threshold alert.',
        }));
      } catch (e) { console.error('⚠️ Admin credit alert failed (non-fatal):', e.message); }
    }

    console.log(`✉️ Credit alert (${tier}) sent for ${clinicName} → clinic + admin`);
    res.json({ success: true, sent: true, tier, remaining });
  } catch (error) {
    console.error('❌ Error sending credit alert:', error);
    res.status(500).json({ success: false, message: 'Failed to send credit alert' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// EMAIL DUPLICATE CHECK - CLINIC & PARTNER BOTH
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/check-email-exists', async (req, res) => {
  try {
    const { email, clinicId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check in patients table. Patient emails are unique per-clinic, not globally, so
    // when a clinicId is provided scope the lookup to that clinic — a match under a
    // different clinic must not count as "already registered" here.
    let patientQuery = supabase
      .from('patients')
      .select('id, email, full_name')
      .eq('email', normalizedEmail);
    if (clinicId) {
      patientQuery = patientQuery.or(`clinic_id.eq.${clinicId},org_id.eq.${clinicId}`);
    }
    const { data: patientData, error: patientError } = await patientQuery.limit(1);

    if (patientError) console.error('Patient query error:', patientError);

    // Check in clinics table
    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .select('id, email, name, clinic_type')
      .eq('email', normalizedEmail)
      .limit(1);

    if (clinicError) console.error('Clinic query error:', clinicError);

    // Check if patient exists
    if (patientData && patientData.length > 0) {
      return res.json({
        success: true,
        exists: true,
        type: 'patient',
        message: `Email already registered as a patient`
      });
    }

    // Check if clinic exists
    if (clinicData && clinicData.length > 0) {
      const clinicType = clinicData[0].clinic_type === 'lbl_partner' ? 'Partner' : 'Clinic';
      return res.json({
        success: true,
        exists: true,
        type: 'clinic',
        message: `Email already registered as a ${clinicType}`
      });
    }

    // Email is available
    return res.json({
      success: true,
      exists: false,
      message: 'Email is available for registration'
    });

  } catch (error) {
    console.error('❌ Error checking email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ADD PATIENT - CLINIC
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/clinic/add-patient', async (req, res) => {
  try {
    const { clinicId, fullName, email, password, phone, dateOfBirth, gender, address } = req.body;

    if (!clinicId || !fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify clinic exists and is clinic type
    const { data: clinic, error: clinicError } = await supabase
      .from('clinics')
      .select('id, clinic_type')
      .eq('id', clinicId)
      .eq('clinic_type', 'clinic')
      .single();

    if (clinicError || !clinic) {
      return res.status(400).json({ success: false, message: 'Invalid clinic' });
    }

    // Check if email already exists in patients table — scoped to THIS clinic.
    // Patient emails are unique per-clinic, not globally (no global unique constraint;
    // the same person may be a patient at multiple clinics), so a match under another
    // clinic must not block creation here.
    const { data: existingPatient, error: patientCheckError } = await supabase
      .from('patients')
      .select('id')
      .eq('email', normalizedEmail)
      .or(`clinic_id.eq.${clinicId},org_id.eq.${clinicId}`)
      .limit(1);

    if (existingPatient && existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A patient with this email already exists in your clinic'
      });
    }

    // Check if email already exists in clinics table
    const { data: existingClinic, error: clinicCheckError } = await supabase
      .from('clinics')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingClinic && existingClinic.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Insert patient
    const { data: patient, error: insertError } = await supabase
      .from('patients')
      .insert({
        patient_name: fullName,
        email: normalizedEmail,
        password: password, // Hash this in production!
        phone,
        date_of_birth: dateOfBirth,
        gender,
        address,
        clinic_id: clinicId,
        created_by: 'clinic_admin',
        origin_url: req.body.origin_url || req.headers.origin || null // Environment the patient was created from
      })
      .select();

    if (insertError) throw insertError;

    res.json({ success: true, message: 'Patient added successfully', patient: patient[0] });

  } catch (error) {
    console.error('❌ Error adding patient:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// ADD PATIENT - PARTNER
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/partner/add-patient', async (req, res) => {
  try {
    const { clinicId, fullName, email, password, phone, dateOfBirth, gender, address } = req.body;

    if (!clinicId || !fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify partner exists
    const { data: partner, error: partnerError } = await supabase
      .from('clinics')
      .select('id, clinic_type')
      .eq('id', clinicId)
      .eq('clinic_type', 'lbl_partner')
      .single();

    if (partnerError || !partner) {
      return res.status(400).json({ success: false, message: 'Invalid partner' });
    }

    // Check if email already exists in patients table — scoped to THIS clinic.
    // Patient emails are unique per-clinic, not globally (no global unique constraint;
    // the same person may be a patient at multiple clinics), so a match under another
    // clinic must not block creation here.
    const { data: existingPatient, error: patientCheckError } = await supabase
      .from('patients')
      .select('id')
      .eq('email', normalizedEmail)
      .or(`clinic_id.eq.${clinicId},org_id.eq.${clinicId}`)
      .limit(1);

    if (existingPatient && existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A patient with this email already exists in your clinic'
      });
    }

    // Check if email already exists in clinics table
    const { data: existingClinic, error: clinicCheckError } = await supabase
      .from('clinics')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingClinic && existingClinic.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Insert patient
    const { data: patient, error: insertError } = await supabase
      .from('patients')
      .insert({
        patient_name: fullName,
        email: normalizedEmail,
        password: password, // Hash this in production!
        phone,
        date_of_birth: dateOfBirth,
        gender,
        address,
        clinic_id: clinicId,
        created_by: 'partner_admin',
        origin_url: req.body.origin_url || req.headers.origin || null // Environment the patient was created from
      })
      .select();

    if (insertError) throw insertError;

    res.json({ success: true, message: 'Patient added successfully', patient: patient[0] });

  } catch (error) {
    console.error('❌ Error adding patient:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// PARTNER EMAILS - 7 ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════════

// 1. PARTNER WELCOME EMAIL
app.post('/api/send-partner-welcome-email', async (req, res) => {
  try {
    const { partnerName, email, password } = req.body;
    if (!email || !password || !partnerName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      cc: INTERNAL_COPY_EMAIL,
      subject: 'Welcome to Limitless Brain Lab - Partner Account Activated',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Limitless Brain Lab!</h1>
            <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0; font-size: 14px;">Your Brain & Wellness Distribution Partner</p>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Hello <strong>${partnerName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">Thank you for partnering with Limitless Brain Lab!</p>
            <div style="background: #f0f7ff; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #d4e9ff;">
              <h3 style="color: #333; margin: 0 0 18px; font-size: 15px; font-weight: 700;">Your Login Credentials</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; margin-bottom: 10px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${email}</p>
              </div>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #1E3A5F;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Password</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600; font-family: 'Courier New', monospace;">${escapeHtml(password)}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}/clinic" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Access Partner Dashboard →</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #999; margin: 0; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Partner welcome email sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. PARTNER PAYMENT SUCCESS EMAIL
app.post('/api/send-partner-payment-success', async (req, res) => {
  try {
    const { partnerName, partnerEmail, reports, amount, currency = 'INR', isReorder = false } = req.body;

    if (!partnerEmail || !reports) {
      return res.status(400).json({ success: false, message: 'Email and reports required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: partnerEmail,
      subject: isReorder ? `Package Reorder Successful - ${reports} EEG Reports Added` : `Payment Successful - ${reports} EEG Reports Added`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">${isReorder ? 'Package Reorder Successful!' : 'Payment Successful!'}</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Dear <strong>${partnerName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">Your payment has been processed successfully. Your account is now credited with the reports.</p>
            <div style="background: #f0f7ff; border: 1px solid #d4e9ff; border-radius: 12px; padding: 18px 20px; margin: 25px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #555; font-size: 14px; padding: 8px 0;">Credits Added</td>
                  <td style="color: #1E3A5F; font-weight: 700; font-size: 15px; text-align: right;">+${reports} Reports</td>
                </tr>
                <tr>
                  <td style="color: #555; font-size: 14px; padding: 8px 0; border-top: 1px solid #e5e7eb;">Amount Paid</td>
                  <td style="color: #1E3A5F; font-weight: 700; font-size: 15px; text-align: right; border-top: 1px solid #e5e7eb;">${currency} ${amount || 'N/A'}</td>
                </tr>
              </table>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}/clinic" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Go to Dashboard</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Payment success email sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. PARTNER REPORT READY EMAIL
app.post('/api/send-partner-report-notification', async (req, res) => {
  try {
    const { partnerName, partnerEmail, patientName, reportUrl, reportFileName } = req.body;

    if (!partnerEmail || !reportUrl) {
      return res.status(400).json({ success: false, message: 'Email and report URL required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: partnerEmail,
      subject: `QEEG Report Ready for Review - ${patientName}`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">QEEG Report Ready</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Hello <strong>${partnerName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">The QEEG analysis report for <strong>${patientName}</strong> is ready for clinical review.</p>
            <div style="background: #f0f7ff; border-radius: 10px; padding: 18px 20px; margin: 25px 0; border: 1px solid #d4e9ff;">
              <h3 style="color: #333; margin: 0 0 15px; font-size: 14px; font-weight: 700;">Report Information</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Report File</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${reportFileName || 'report.pdf'}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Download Report</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Report notification sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. PARTNER NO CREDITS ALERT
app.post('/api/send-partner-no-credit-alert', async (req, res) => {
  try {
    const { partnerEmail, partnerName } = req.body;

    if (!partnerEmail) {
      return res.status(400).json({ success: false, message: 'Partner email required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: partnerEmail,
      subject: `No Report Credits Remaining - Action Required`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">No Report Credits Remaining</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Dear <strong>${partnerName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">You have <strong>0 report credits</strong> remaining. Purchase a new package to continue generating QEEG reports.</p>
            <div style="background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 16px 20px; margin: 25px 0;">
              <p style="margin: 0; color: #C2410C; font-weight: 600; font-size: 14px;">Action Required: Purchase a report package</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}/clinic/subscription" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Buy More Credits</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'No credit alert sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. PARTNER PATIENT WELCOME
app.post('/api/send-partner-patient-welcome', async (req, res) => {
  try {
    const { patientName, email, password, partnerName, partnerEmail } = req.body;

    if (!email || !password || !patientName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome to Limitless Brain Lab - Your Login Credentials',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Welcome to Limitless Brain Lab!</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Hello <strong>${patientName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">Your account has been created by <strong>${partnerName}</strong>. Welcome to the Limitless Brain Lab community!</p>
            <div style="background: #f0f7ff; border-radius: 10px; padding: 20px; margin: 25px 0; border: 1px solid #d4e9ff;">
              <h3 style="color: #333; margin: 0 0 18px; font-size: 15px; font-weight: 700;">Your Login Credentials</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; margin-bottom: 10px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${email}</p>
              </div>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #1E3A5F;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Password</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600; font-family: 'Courier New', monospace;">${escapeHtml(password)}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${APP_URL}/patient/login" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Login Now →</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);

    // Also notify the partner that a new patient was created (no password, non-fatal).
    if (partnerEmail) {
      try {
        await emailTransporter.sendMail(buildClinicNotificationEmail({
          to: partnerEmail,
          subject: `New Patient Added: ${patientName}`,
          heading: 'New Patient Added',
          subheading: 'Patient Management Notification',
          greetingName: partnerName || 'Partner',
          intro: `A new patient has been created under your account on Limitless Brain Lab. Login credentials have been sent to the patient directly.`,
          rows: [
            { label: 'Patient Name', value: patientName },
            { label: 'Email', value: email },
            { label: 'Date Added', value: fmtDateTime(new Date()) }
          ],
          footerNote: 'No action is required. You can view and manage this patient from your dashboard.'
        }));
        console.log('✅ Partner new-patient notification sent:', partnerEmail);
      } catch (partnerMailErr) {
        console.error('⚠️ Partner new-patient notification failed (non-fatal):', partnerMailErr.message);
      }
    }

    res.json({ success: true, message: 'Patient welcome email sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. PARTNER EMAIL UPDATE
app.post('/api/send-partner-email-update', async (req, res) => {
  try {
    const { partnerName, oldEmail, newEmail, password } = req.body;

    if (!newEmail || !partnerName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    // Notify BOTH the previous and the updated address so whoever holds either
    // inbox sees the change. De-duplicate in case old === new.
    const recipients = [...new Set([newEmail, oldEmail].filter(Boolean))];

    // Only render a password block when a plain-text password is available.
    const passwordBlock = password
      ? `
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #2E5BA8; margin-top: 12px;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Password</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600; font-family: monospace;">${escapeHtml(password)}</p>
              </div>`
      : '';

    const mailOptions = {
      from: EMAIL_FROM,
      to: recipients,
      cc: INTERNAL_COPY_EMAIL,
      subject: 'Your email ID updated — Limitless Brain Lab Partner Portal',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Email Updated</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Hello <strong>${escapeHtml(partnerName)}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">This is your updated email ID and password for the Limitless Brain Lab Partner Portal. Please use these credentials to log in.</p>
            <div style="background: #f0f7ff; border-radius: 10px; padding: 18px 20px; margin: 25px 0; border: 1px solid #d4e9ff;">
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Updated Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${escapeHtml(newEmail)}</p>
              </div>${passwordBlock}
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    // Do not return the password in the API response; it is delivered by email only.
    res.json({ success: true, message: 'Email update notification sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. PARTNER REJECTION
app.post('/api/send-partner-rejection', async (req, res) => {
  try {
    const { partnerName, email, rejectionReason } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: `Your Partner Application with Limitless Brain Lab`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Application Update</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Dear ${partnerName || 'Applicant'},</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">After reviewing your application, we regret to inform you that we are unable to approve your partnership request at this time.</p>
            ${rejectionReason ? `
            <div style="background: #FFF5F5; border-left: 4px solid #E53E3E; border-radius: 8px; padding: 16px 20px; margin: 25px 0;">
              <p style="color: #C53030; margin: 0 0 6px; font-size: 12px; font-weight: 600;">REASON</p>
              <p style="color: #742A2A; margin: 0; font-size: 14px;">${rejectionReason}</p>
            </div>
            ` : ''}
            <p style="color: #555; font-size: 14px; margin-top: 20px;">If you would like to provide additional information or have any questions, please don't hesitate to contact us.</p>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Rejection email sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════
// ADMIN NOTIFICATION SEND — used by ClinicManagement.jsx
// ═══════════════════════════════════════════════════════
app.post('/api/notifications/send', async (req, res) => {
  try {
    const { to, clinicName, message, type } = req.body;

    if (!to || !message) {
      return res.status(400).json({ success: false, message: 'Recipient email and message are required' });
    }

    if (!emailTransporter) {
      return res.status(500).json({ success: false, message: 'Email service not configured' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to,
      subject: `Notification from Limitless Brain Lab${clinicName ? ` — ${clinicName}` : ''}`,
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#323956 0%,#1a1f36 100%);padding:24px 32px;text-align:center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:70px;height:70px;border-radius:50%;object-fit:cover;" />
            <h1 style="color:#ffffff;margin:12px 0 0;font-size:20px;">Limitless Brain Lab</h1>
          </div>
          <div style="padding:28px 32px;">
            <p style="color:#333;font-size:15px;line-height:1.7;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✉️ Admin notification sent to ${to}`);
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== ERROR HANDLING (Must be after all routes) =====
setupErrorHandling(app);

// ===== START SERVER =====
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { environment: process.env.NODE_ENV });
  logger.info(`CORS enabled for: ${allowedOrigins.join(', ')}`);

  // Keep-alive self-ping: Render's free tier spins the instance down after ~15 min of
  // no inbound requests (cold start of 50s+). Pinging our own PUBLIC url on a timer
  // counts as inbound activity and keeps the instance warm. Only active on Render
  // (RENDER_EXTERNAL_URL is injected there), so local/dev is unaffected. Zero added cost.
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
  if (keepAliveUrl) {
    const intervalMs = Number(process.env.KEEP_ALIVE_MS) || 10 * 60 * 1000; // default 10 min (< 15-min sleep window)
    setInterval(async () => {
      try {
        const res = await fetch(`${keepAliveUrl}/api/health`);
        logger.info(`Keep-alive ping ${res.status}`);
      } catch (err) {
        logger.warn(`Keep-alive ping failed: ${err.message}`);
      }
    }, intervalMs).unref();
    logger.info(`Keep-alive enabled: pinging ${keepAliveUrl}/api/health every ${intervalMs / 60000} min`);
  }

  // Capture assessment answers from JotForm notification emails (no API key
  // or webhook needed) — see services/jotformEmailIngest.js. No-op unless
  // EMAIL_USER/EMAIL_PASS are set; never crashes the server.
  try {
    require('./services/jotformEmailIngest').startJotformEmailIngest();
  } catch (e) {
    console.error('jotformEmailIngest failed to start:', e.message);
  }
});

module.exports = app;
