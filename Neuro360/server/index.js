const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const nodemailer = require('nodemailer');
const compression = require('compression');
const qeegRoutes = require('./routes/qeegRoutes');
const claudeReportRoutes = require('./routes/claudeReportRoutes');
const ssoRoutes = require('./routes/ssoRoutes');
const claudeRoutes = require('./routes/claudeRoutes');
const { createClient } = require('@supabase/supabase-js');

// Import middleware
const { setupMiddleware, setupRateLimiters, protectedRoutes, setupErrorHandling, asyncHandler } = require('./middleware/setupMiddleware');
const { authMiddleware, optionalAuth } = require('./middleware/authMiddleware');
const { requireRole, requireOwnership } = require('./middleware/rbac');
const logger = require('./services/logger');

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
} else {
}

// Initialize Stripe (conditionally)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Email transporter — Brevo SMTP relay (works on Render; Gmail SMTP is blocked by cloud providers)
// Fallback to Gmail if BREVO_SMTP_USER not set
const emailTransporter = nodemailer.createTransport(
  process.env.BREVO_SMTP_USER
    ? {
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.BREVO_SMTP_USER,
          pass: process.env.BREVO_SMTP_KEY
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
      }
    : {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
      }
);

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

const rawSendMail = emailTransporter.sendMail.bind(emailTransporter);
emailTransporter.sendMail = (mailOptions, ...rest) => {
  const enhanced = { ...mailOptions };
  if (enhanced.html && !enhanced.text) {
    enhanced.text = htmlToPlainText(enhanced.html);
  }
  if (!enhanced.replyTo && process.env.EMAIL_REPLY_TO) {
    enhanced.replyTo = process.env.EMAIL_REPLY_TO;
  }
  return rawSendMail(enhanced, ...rest);
};

// Verify email transporter on startup
emailTransporter.verify((error, success) => {
  if (error) {
    console.error('EMAIL TRANSPORTER ERROR:', error.message);
    console.error('EMAIL_USER:', process.env.EMAIL_USER);
    console.error('EMAIL_PASS length:', (process.env.EMAIL_PASS || '').length);
    console.error('EMAIL_PASS first 4 chars:', (process.env.EMAIL_PASS || '').substring(0, 4));
    console.error('EMAIL_PASS has spaces:', (process.env.EMAIL_PASS || '').includes(' '));
  } else {
    console.log('Email transporter ready - connected to', process.env.EMAIL_USER);
  }
});

const app = express();
const PORT = process.env.PORT || 5000;

// Outbound email "From" address (all emails to users/patients/clinics)
const EMAIL_FROM = `"Limitless Brain Lab" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;

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

// Generate a random system password
const generateSystemPassword = () => {
  const length = 12;
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = lowercase + uppercase + numbers + symbols;
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = 0; i < length - 2; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
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
                <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/login" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 36px; border-radius: 8px; font-weight: 600; font-size: 15px;">Login to Portal →</a>
              </div>
              <p style="color: #555; font-size: 14px; margin: 0 0 4px;">Best regards,</p>
              <p style="color: #323956; font-size: 14px; font-weight: 600; margin: 0 0 2px;">Support Team,</p>
              <p style="color: #323956; font-size: 14px; margin: 0;">Limitlessbrainlab.com</p>
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
              <p style="color: #aaa; margin: 0; font-size: 11px;">Limitlessbrainlab.com &nbsp;|&nbsp; limitlessbrainlab@gmail.com</p>
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
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Account Name</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">Chinmaya Brainforia</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Account Number</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">922020022903427</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Bank Name</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">Axis Bank</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Bank Address</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">Jamnagar</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">IFSC Code</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">UTIB0000175</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">MICR Code</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">361211001</td></tr>
                <tr><td style="color: #888; font-size: 12px; padding: 4px 16px;">Customer ID</td><td style="color: #323956; font-size: 13px; font-weight: 600; padding: 4px 0;">940319994</td></tr>
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
              <p style="color: #aaa; margin: 0; font-size: 11px;">Limitlessbrainlab.com &nbsp;|&nbsp; limitlessbrainlab@gmail.com</p>
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
              <p style="color: #aaa; margin: 0; font-size: 11px;">Limitlessbrainlab.com &nbsp;|&nbsp; limitlessbrainlab@gmail.com</p>
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
  'https://neurosense360.site', // Production
  'https://www.neurosense360.site', // Production with www
  'http://neurosense360.site',  // Production HTTP
  'http://www.neurosense360.site', // Production HTTP with www
  'https://limitlessbrainlab-eight.vercel.app', // Staging
...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

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

// Custom route to serve PDFs with download headers
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ===== PROTECTED ROUTES (Auth Required) =====

// Claude Report (AIaaS sidecar) - has its own auth (long-lived sidecar token OR
// Supabase token). Mounted BEFORE /api/qeeg so this specific path wins and is
// not gated by the hourly Supabase-only authRequired middleware.
app.use('/api/qeeg/claude-report', claudeReportRoutes);

// QEEG routes - Require authentication
app.use('/api/qeeg', protectedRoutes.authRequired, qeegRoutes);

// SSO routes - Optional auth
app.use('/api/sso', protectedRoutes.optionalAuth, ssoRoutes);

// Claude API test endpoint - NO AUTH (for testing VPS connection)
app.use('/api/test', claudeRoutes);

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

    // Send success response immediately
    res.json({
      success: true,
      message: 'Message received successfully'
    });

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

    emailTransporter.sendMail(mailOptions)
      .catch((emailError) => {
        console.error('Email sending failed:', emailError.message);
      });

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
    emailTransporter.sendMail(userConfirmation)
      .catch((err) => console.error('User confirmation email failed:', err.message));

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

// Claude API routes - auth handled per-route inside claudeRoutes
app.use('/api', claudeRoutes);

// EDF Upload Notification Email - triggered after QEEG processing
app.post('/api/edf-upload-notification', async (req, res) => {
  try {
    const { patientName, patientId, clinicName, overallScore, pdfUrl, processedAt } = req.body;

    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `📊 New EDF Report Processed - ${patientName || 'Unknown Patient'}`,
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
    const { email, contact_number } = req.body;

    if (!email || !contact_number) {
      return res.status(400).json({
        success: false,
        message: 'Email and contact number are required'
      });
    }

    // Send email notification
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `Partnership Inquiry - Limitless Brain Lab`,
      html: getAdminNotificationHtml('Partnership Inquiry', [
        { label: 'Email', value: email },
        { label: 'Contact Number', value: contact_number }
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
      'partnership': 'franchise_inquiries',
      'professional': 'professional_onboarding',
      'program': 'program_inquiries'
    };

    const tableName = tableMap[req.params.type];
    if (!tableName) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry type' });
    }

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

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
      'partnership': 'franchise_inquiries',
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

    // Sort all by date descending
    allPayments.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ success: true, data: allPayments });
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
    const starDisplay = rating ? '⭐'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated';
    const categoryDisplay = category || 'General';

    // Send email notification asynchronously
    const mailOptions = {
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `📝 Patient Feedback - ${categoryDisplay} ${rating ? `(${rating}/5 Stars)` : ''}`,
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
                              <p style="color: #ffffff; margin: 3px 0 0; font-size: 13px; font-weight: 600;">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
                        <p style="color: #92400e; margin: 0 0 8px; font-size: 14px; font-weight: 600;">💬 Feedback Message</p>
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
                        ✨ This feedback was received from <strong style="color: #323956;">Limitless Brain Lab</strong> Patient Dashboard
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
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: isBundle ? 'Complete Frequency Bundle (All 6 Packs)' : `${packName} - Frequency Pack`,
              description: isBundle
                ? 'Unlock all 6 brainwave frequency packs: Delta, Theta, Alpha, Beta, Gamma, and Solfeggio frequencies for complete brain optimization.'
                : `Unlock the full ${packName} frequency pack for enhanced brain performance.`,
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
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
      success_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/frequencies?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/frequencies?payment=cancelled`,
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
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: isBundle ? 'Complete Meditation Bundle (All 6 Packs)' : `${packName} - Meditation Pack`,
              description: isBundle
                ? 'Unlock all 6 guided meditation packs: Morning Awakening, Stress Relief, Focus & Clarity, Deep Sleep, Gratitude & Joy, and Body Healing.'
                : `Unlock the full ${packName} meditation pack for enhanced mental wellness.`,
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
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
      success_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard/meditations?meditation_payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard/meditations?meditation_payment=cancelled`,
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
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      success_url: successUrl || `${req.headers.origin}/dashboard?payment=success&tier=${tierId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/dashboard/subscription?payment=cancelled`,
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
            images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/favicon.ico`]
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

      res.json({
        success: true,
        status: session.payment_status,
        customerEmail: customerEmail,
        tier: session.metadata?.tier,
        amount: session.amount_total / 100,
        currency: session.currency?.toUpperCase()
      });

      // Save payment record to database
      if (supabase) {
        try {
          if (paymentType === 'assessment') {
            const { error } = await supabase
              .from('assessment_purchases')
              .upsert({
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
              }, { onConflict: 'stripe_session_id' });

            if (error) console.error('DB save error (assessment):', error.message);
          } else if (paymentType === 'subscription') {
            const { error } = await supabase
              .from('payment_history')
              .upsert({
                patient_email: customerEmail?.toLowerCase(),
                payment_type: 'subscription',
                tier: session.metadata?.tier,
                amount: session.amount_total / 100,
                currency: session.currency?.toUpperCase(),
                payment_provider: 'stripe',
                stripe_session_id: sessionId,
                stripe_payment_intent: session.payment_intent,
                status: 'completed',
                created_at: new Date().toISOString()
              }, { onConflict: 'stripe_session_id' });

            if (error) console.error('DB save error (subscription):', error.message);
          } else {
            // Frequency or meditation
            const tableName = (session.metadata?.pack_id?.startsWith('solfeggio_') || session.metadata?.pack_id?.includes('meditation'))
              ? 'meditation_purchases' : 'frequency_purchases';

            const { error } = await supabase
              .from(tableName)
              .upsert({
                patient_email: customerEmail?.toLowerCase(),
                pack_id: session.metadata?.pack_id,
                pack_name: session.metadata?.pack_id,
                is_bundle: session.metadata?.is_bundle === 'true',
                stripe_session_id: sessionId,
                stripe_payment_intent: session.payment_intent,
                amount_paid: session.amount_total / 100,
                currency: session.currency?.toUpperCase(),
                status: 'completed',
                purchased_at: new Date().toISOString()
              }, { onConflict: 'stripe_session_id' });

            if (error) console.error(`DB save error (${tableName}):`, error.message);
          }
        } catch (dbErr) {
          console.error('DB save error:', dbErr.message);
        }
      }

      // Send confirmation email to user after successful payment
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS && customerEmail) {
        let emailSubject = '';
        let assessmentLink = '';
        let productName = '';

        if (paymentType === 'assessment') {
          productName = session.metadata?.assessment_name || 'Brain Assessment';
          assessmentLink = session.metadata?.assessment_link || '';
          emailSubject = `Payment Confirmation - ${productName} - Limitless Brain Lab`;
        } else if (paymentType === 'subscription') {
          productName = `${session.metadata?.tier || ''} Subscription`;
          emailSubject = `Payment Confirmation - ${productName} - Limitless Brain Lab`;
        } else {
          productName = session.metadata?.pack_id || 'Purchase';
          emailSubject = `Payment Confirmation - Limitless Brain Lab`;
        }

        const confirmationMail = {
          from: EMAIL_FROM,
          to: customerEmail,
          subject: emailSubject,
          html: getUserConfirmationHtml(customerName || 'User').replace(
            'Thank you for submitting your application. We have successfully received it, and our team will get in touch with you within <strong style="color: #323956;">two working days</strong> to guide you through the next steps.',
            `Thank you for your payment! Your purchase of <strong style="color: #323956;">${productName}</strong> has been confirmed.<br><br>
            <strong>Amount Paid:</strong> ${amountPaid}<br>
            <strong>Order ID:</strong> ${sessionId.slice(-12)}
            ${assessmentLink ? `<br><br><div style="text-align: center; margin: 20px 0;">
              <a href="${assessmentLink}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">Take Your Assessment Now</a>
              <p style="color: #888; font-size: 12px; margin: 8px 0 0;">Or copy: <a href="${assessmentLink}" style="color: #323956;">${assessmentLink}</a></p>
            </div>` : ''}`
          ),
          attachments: getFullAttachments()
        };

        emailTransporter.sendMail(confirmationMail)
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
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${packageName} - ${reports} EEG Reports`,
              description: `Purchase ${reports} EEG brain reports for your clinic`,
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
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
      success_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic/subscription?payment=success&reports=${reports}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic/subscription?payment=cancelled`,
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

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Brain Coaching Session with ${coachName}`,
              description: '30-minute online brain coaching session',
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
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
      success_url: `${FRONTEND_URL}/dashboard/brain-coach?payment=success&coach=${encodeURIComponent(coachName)}&calendly=${encodeURIComponent(resolvedCalendlyUrl)}&session_id={CHECKOUT_SESSION_ID}`,
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

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';

    // Use custom URLs if provided (for public pages), otherwise default to dashboard
    const finalSuccessUrl = successUrl || `${FRONTEND_URL}/dashboard/about-brain?payment=success&assessment=${assessmentId}&session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${FRONTEND_URL}/dashboard/about-brain?payment=cancelled`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${assessmentName} - Brain Assessment`,
              description: `Unlock your ${assessmentName} to understand your brain health better.`,
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
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
app.post('/api/send-assessment-email', async (req, res) => {
  try {
    let { customerEmail, customerName, assessmentName, assessmentLink, amountPaid, currency, transactionId, source, clinicName, clinicId, patientPhone, patientDob, patientGender, patientUid } = req.body;

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

    const links = (assessmentLink || '').split(',').filter(l => l.trim());
    const assessmentNames = {
      'https://form.jotform.com/233250136675151': 'Brain Fitness Score',
      'https://form.jotform.com/260117244562148': 'Brain Burnout Score',
      'https://form.jotform.com/252245065792056': 'Neuro Age Estimator',
      'https://form.jotform.com/260034749079159': 'Dementia Probability Index'
    };

    const linkButtonsHtml = links.length <= 1
      ? `
        <tr>
          <td style="padding: 0 32px 8px;" align="center">
            <a href="${assessmentLink}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px;">
              Take Your Assessment Now
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 32px 24px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              Or copy this link: <a href="${assessmentLink}" style="color: #4A6FA5;">${assessmentLink}</a>
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
      subject: `Your ${assessmentName} is Ready! - Limitless Brain Lab`,
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
                      <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
                        <span style="font-size: 40px; color: #ffffff;">&#10003;</span>
                      </div>
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
                        Thank you for choosing Limitless Brain Lab! If you have any questions, contact us at limitlessbrainlab@gmail.com
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

    if (!skipCustomerEmail) {
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

      await emailTransporter.sendMail(adminNotificationMail);
      console.log('SUCCESS: Admin payment notification sent to limitlessbrainlab@gmail.com');
    } catch (adminErr) {
      console.warn('Admin notification email failed:', adminErr.message);
    }

    res.json({ success: true, message: 'Assessment email sent successfully' });
  } catch (error) {
    console.error('Assessment email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
  }
});

// Create Stripe Checkout Session for Frequency Pack Purchases
app.post('/api/create-frequency-checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe is not configured. Please set STRIPE_SECRET_KEY.'
      });
    }

    const { packId, packName, customerEmail, currency = 'USD', amount, successUrl, cancelUrl } = req.body;

    if (!customerEmail || !amount || !packId) {
      return res.status(400).json({
        success: false,
        message: 'Customer email, amount, and pack ID are required'
      });
    }

    const currencyMultipliers = { 'INR': 100, 'USD': 100, 'GBP': 100, 'EUR': 100, 'AED': 100 };
    const multiplier = currencyMultipliers[currency] || 100;
    const amountInSmallestUnit = Math.round(amount * multiplier);

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${packName} Binaural Beats - Frequency Pack`,
              description: `Unlock ${packName} frequency audio for brain optimization.`,
              images: [`${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/IBW%20Logo.png`],
              metadata: { pack_id: packId, type: 'frequency' }
            },
            unit_amount: amountInSmallestUnit,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      success_url: successUrl && successUrl.includes('{CHECKOUT_SESSION_ID}')
        ? successUrl
        : `${(successUrl || '').split('?')[0] || FRONTEND_URL + '/dashboard/frequencies'}?payment=success&pack=${packId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${FRONTEND_URL}/dashboard/frequencies?payment=cancelled`,
      metadata: {
        pack_id: packId,
        pack_name: packName,
        customer_email: customerEmail,
        type: 'frequency'
      }
    });

    // Save purchase record to Supabase after session creation
    if (supabase) {
      supabase.from('frequency_purchases').insert([{
        patient_email: customerEmail.toLowerCase(),
        pack_id: packId,
        stripe_session_id: session.id,
        status: 'pending'
      }]).then(({ error }) => {
        if (error) console.error('Error saving frequency purchase:', error.message);
      });
    }


    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Frequency checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create checkout session',
      error: error.message
    });
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

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // For testing without webhook secret
      event = JSON.parse(req.body);
    }
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
        const savePatientPayment = async (email, type, itemName, amount, currency) => {
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

        // Handle subscription payments
        if (paymentType === 'subscription') {
          const tier = session.metadata?.tier;

          // Update patient subscription
          const { error: updateError } = await supabase
            .from('patients')
            .update({
              subscription_tier: tier?.toLowerCase(),
              subscription_status: 'active',
              dashboard_access: true,
              updated_at: new Date().toISOString()
            })
            .eq('email', session.customer_email.toLowerCase());

          if (updateError) {
            console.error('Error updating subscription:', updateError);
          } else {
          }

          // Log the payment
          const { error: paymentError } = await supabase
            .from('payment_history')
            .insert({
              patient_email: session.customer_email.toLowerCase(),
              payment_type: 'subscription',
              tier: tier,
              amount: session.amount_total / 100,
              currency: session.currency?.toUpperCase(),
              payment_provider: 'stripe',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              status: 'completed',
              created_at: new Date().toISOString()
            });

          if (paymentError) {
            console.error('Error logging payment:', paymentError);
          }

          // Log admin notification for payment
          await supabase.from('admin_notifications').insert({
            type: 'success',
            category: 'payment',
            title: 'Subscription Payment Received',
            message: `${session.customer_email} subscribed to ${tier} plan ($${(session.amount_total / 100).toFixed(2)} ${session.currency?.toUpperCase() || 'USD'}).`,
            patient_name: session.customer_email,
            action: 'view_payment',
            action_data: { tier, amount: session.amount_total / 100, email: session.customer_email },
            is_read: false
          }).then(({ error: ne }) => { if (ne) console.error('Notification insert error:', ne); });

          // Also save to payments table for SuperAdmin dashboard
          await supabase.from('payments').insert({
            clinic_id: null,
            patient_email: session.customer_email.toLowerCase(),
            amount: session.amount_total / 100,
            currency: session.currency?.toUpperCase() || 'USD',
            status: 'completed',
            type: 'patient_subscription',
            package_name: `${tier} Subscription`,
            payment_method: 'stripe',
            payment_id: session.payment_intent || session.id,
            stripe_payment_id: session.payment_intent || session.id,
            stripe_session_id: session.id,
            created_at: new Date().toISOString()
          }).catch(err => console.warn('payments table insert skipped:', err.message));

          // Save to patient_payments (per-clinic tracking)
          await savePatientPayment(session.customer_email, 'subscription', `${tier} Subscription`, session.amount_total / 100, session.currency?.toUpperCase());

          // Send confirmation email
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const mailOptions = {
              from: EMAIL_FROM,
              to: session.customer_email,
              subject: `🎉 Welcome to Limitless Brain Lab ${tier}!`,
              attachments: getLogoAttachment(),
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                    <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
                    <h1 style="color: #ffffff; margin: 10px 0 0;">Welcome to Limitless Brain Lab ${tier}!</h1>
                  </div>
                  <p>Thank you for upgrading your subscription.</p>
                  <p>You now have access to all ${tier} features including:</p>
                  <ul>
                    ${tier === 'PREMIUM' ? '<li>Brain Coach Access</li><li>Home Neurofeedback</li><li>All Assessments</li>' : ''}
                    ${tier === 'PRO' || tier === 'PREMIUM' ? '<li>Frequencies Library</li><li>Meditations</li><li>Supplements Guide</li>' : ''}
                    ${tier === 'BASIC' || tier === 'PRO' || tier === 'PREMIUM' ? '<li>ANS Reset Protocol</li><li>MOVERS Exercises</li><li>Five Pillars</li>' : ''}
                  </ul>
                  <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard" style="display: inline-block; background: #323956; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Go to Dashboard</a>
                </div>
              `
            };

            emailTransporter.sendMail(mailOptions, (err, info) => {
              if (err) {
                console.error('Error sending subscription email:', err);
              } else {
              }
            });

            // Notify admin (Limitless Brain Lab) about the subscription purchase
            const adminSubMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `💰 New Subscription Purchase: ${tier}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px;">
                  <h2 style="color: #323956;">New Subscription Purchase</h2>
                  <p><strong>Customer:</strong> ${session.customer_email}</p>
                  <p><strong>Tier:</strong> ${tier}</p>
                  <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                  <p><strong>Session ID:</strong> ${session.id}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                </div>
              `
            };

            emailTransporter.sendMail(adminSubMailOptions)
              .catch(err => console.error('Admin subscription email failed:', err.message));
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

          // Send assessment link email to customer
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS && assessmentLink) {
            const assessmentMailOptions = {
              from: EMAIL_FROM,
              to: session.customer_email,
              subject: `🧠 Your ${assessmentName} is Ready! - Limitless Brain Lab`,
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
                              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
                                <span style="font-size: 40px; color: #ffffff;">&#10003;</span>
                              </div>
                              <h2 style="color: #323956; margin: 0 0 8px; font-size: 24px;">Payment Successful!</h2>
                              <p style="color: #666; margin: 0; font-size: 15px;">
                                ${customerName ? `Hi ${customerName},` : 'Hi,'} your <strong>${assessmentName}</strong> is now ready to take.
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
                                    <td style="padding: 8px 0; color: #323956; font-weight: 600; text-align: right;">${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0; color: #666;">Order ID:</td>
                                    <td style="padding: 8px 0; color: #666; font-size: 12px; text-align: right;">${session.id.slice(-12)}</td>
                                  </tr>
                                </table>
                              </div>
                            </td>
                          </tr>

                          <!-- Assessment Link Button(s) -->
                          ${(() => {
                            const links = (assessmentLink || '').split(',').filter(l => l.trim());
                            if (links.length <= 1) {
                              return `
                              <tr>
                                <td style="padding: 0 32px 8px;" align="center">
                                  <a href="${assessmentLink}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px;">
                                    Take Your Assessment Now
                                  </a>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 32px 24px; text-align: center;">
                                  <p style="color: #999; font-size: 12px; margin: 0;">
                                    Or copy this link: <a href="${assessmentLink}" style="color: #4A6FA5;">${assessmentLink}</a>
                                  </p>
                                </td>
                              </tr>`;
                            }
                            return `
                              <tr>
                                <td style="padding: 0 32px 24px;">
                                  <h3 style="color: #323956; margin: 0 0 16px; font-size: 16px; text-align: center;">Your Assessment Links</h3>
                                  ${links.map((link, i) => `
                                    <div style="margin-bottom: 12px; text-align: center;">
                                      <a href="${link.trim()}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #4A6FA5 100%); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 10px; font-weight: 600; font-size: 14px; width: 80%; max-width: 400px;">
                                        Assessment ${i + 1}
                                      </a>
                                    </div>
                                  `).join('')}
                                </td>
                              </tr>`;
                          })()}

                          <!-- Footer -->
                          <tr>
                            <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                              <p style="color: #888; margin: 0; font-size: 12px; text-align: center;">
                                Thank you for choosing Limitless Brain Lab! If you have any questions, contact us at limitlessbrainlab@gmail.com
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

            emailTransporter.sendMail(assessmentMailOptions)
              .catch(err => console.error('Assessment email sending failed:', err.message));
          }

          // Also notify admin about the purchase
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const adminMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `💰 New Assessment Purchase: ${assessmentName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px;">
                  <h2 style="color: #323956;">New Assessment Purchase</h2>
                  <p><strong>Customer:</strong> ${customerName || 'N/A'} (${session.customer_email})</p>
                  <p><strong>Assessment:</strong> ${assessmentName}</p>
                  <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                  <p><strong>Session ID:</strong> ${session.id}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
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
          const customerName = session.metadata?.customer_name || '';

          console.log(`PAYMENT: Clinic report purchase - clinicId: ${clinicId}, reports: ${reports}, amount: ${session.amount_total / 100}`);

          if (clinicId) {
            // 1. Update clinic's reports_allowed and subscription_status in clinics table
            const { data: clinicData, error: fetchError } = await supabase
              .from('clinics')
              .select('reports_allowed')
              .eq('id', clinicId)
              .single();

            const currentAllowed = clinicData?.reports_allowed || 0;
            const newAllowed = currentAllowed + reports;

            // Update both clinics and organizations tables - reset reports_used on renewal
            const { error: updateError } = await supabase
              .from('clinics')
              .update({
                reports_allowed: newAllowed,
                reports_used: 0,
                subscription_status: 'active',
                is_active: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', clinicId);

            if (updateError) {
              console.error('Error updating clinics table:', updateError);
            } else {
              console.log(`SUCCESS: Clinic ${clinicId} reports updated: ${currentAllowed} -> ${newAllowed}`);
            }

            // Also update organizations table for SubscriptionTab stats
            await supabase
              .from('organizations')
              .update({
                reports_allowed: newAllowed,
                reports_used: 0,
                subscription_status: 'active',
                updated_at: new Date().toISOString()
              })
              .eq('id', clinicId)
              .catch(err => console.warn('organizations update skipped:', err.message));

            // 2. Save to payments table for SuperAdmin Payment History
            const { error: paymentError } = await supabase
              .from('payments')
              .insert({
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
              });

            if (paymentError) {
              console.error('Error saving clinic payment record:', paymentError);
            } else {
              console.log('SUCCESS: Clinic payment record saved for SuperAdmin dashboard');
            }
          }

          // Send confirmation email to clinic — reorder vs first purchase
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS && session.customer_email) {
            const isReorder = currentAllowed > 0;
            const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';

            const clinicMailOptions = isReorder
              ? {
                  from: EMAIL_FROM,
                  to: session.customer_email,
                  subject: `🔄 Package Reorder Successful - ${reports} EEG Reports Added!`,
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
                              <td style="color: #374151; font-weight: 600; font-size: 14px; text-align: right;">${currentAllowed} Reports</td>
                            </tr>
                            <tr style="border-top: 1px solid #bbf7d0;">
                              <td style="color: #333; font-size: 15px; font-weight: 700; padding: 8px 0;">New Total Balance</td>
                              <td style="color: #166534; font-weight: 700; font-size: 15px; text-align: right;">${newAllowed} Reports</td>
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
                        <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; limitlessbrainlab@gmail.com</p>
                      </div>
                    </div>
                  `
                }
              : {
                  from: EMAIL_FROM,
                  to: session.customer_email,
                  subject: `✅ Payment Successful - ${reports} EEG Reports Added!`,
                  attachments: getLogoAttachment(),
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                        <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
                        <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 20px;">Payment Successful!</h1>
                      </div>
                      <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #333;">Hi ${customerName || 'Clinic Admin'},</p>
                        <p style="color: #555;">Your payment of <strong>${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</strong> has been processed successfully.</p>
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                          <p style="margin: 0; color: #166534; font-weight: 600;">✅ ${reports} EEG Report Credits have been added to your account.</p>
                        </div>
                        <p style="color: #555; font-size: 13px;">You can now access your clinic dashboard and start generating reports.</p>
                        <div style="text-align: center; margin: 24px 0;">
                          <a href="${FRONTEND_URL}/clinic" style="display: inline-block; background: #323956; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Go to Dashboard</a>
                        </div>
                        <p style="color: #999; font-size: 12px; text-align: center;">Thank you for choosing Limitless Brain Lab!</p>
                      </div>
                    </div>
                  `
                };

            emailTransporter.sendMail(clinicMailOptions)
              .catch(err => console.error('Clinic payment email failed:', err.message));

            // Notify admin (Limitless Brain Lab) about clinic report purchase
            const adminClinicMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `💰 New Clinic Report Purchase: ${reports} Reports`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px;">
                  <h2 style="color: #323956;">New Clinic Report Purchase</h2>
                  <p><strong>Clinic ID:</strong> ${clinicId}</p>
                  <p><strong>Customer:</strong> ${customerName || 'N/A'} (${session.customer_email})</p>
                  <p><strong>Reports:</strong> ${reports} EEG Reports</p>
                  <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                  <p><strong>Session ID:</strong> ${session.id}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                </div>
              `
            };

            emailTransporter.sendMail(adminClinicMailOptions)
              .catch(err => console.error('Admin clinic report email failed:', err.message));
          }

        } else {
          // Handle frequency/meditation purchases

          // Check if this is a meditation purchase (has type: 'meditation' in product metadata)
          const isMeditationPurchase = session.metadata?.pack_id?.startsWith('solfeggio_') ||
                                       session.metadata?.pack_id?.includes('meditation');

          if (isMeditationPurchase) {
            // Save to meditation_purchases table
            const meditationPurchaseData = {
              patient_email: session.customer_email.toLowerCase(),
              meditation_id: session.metadata.pack_id,
              is_bundle: session.metadata.is_bundle === 'true',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              amount_paid: session.amount_total / 100,
              currency: session.currency.toUpperCase(),
              purchased_at: new Date().toISOString()
            };

            const { error: medError } = await supabase
              .from('meditation_purchases')
              .insert(meditationPurchaseData);

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
            await savePatientPayment(session.customer_email, 'meditation', session.metadata.pack_id?.replace(/_/g, ' ') || 'Meditation Pack', session.amount_total / 100, session.currency?.toUpperCase());
          } else {
            // Save to frequency_purchases table
            const frequencyPurchaseData = {
              user_id: session.metadata?.user_id || null,
              patient_email: session.customer_email.toLowerCase(),
              pack_id: session.metadata.pack_id,
              is_bundle: session.metadata.is_bundle === 'true',
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent,
              amount_paid: session.amount_total / 100,
              currency: session.currency.toUpperCase(),
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
            await savePatientPayment(session.customer_email, 'frequency', session.metadata.pack_id?.replace(/_/g, ' ') || 'Frequency Pack', session.amount_total / 100, session.currency?.toUpperCase());
          }

          // Send confirmation email
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const packName = session.metadata.is_bundle === 'true'
              ? (isMeditationPurchase ? 'Complete Meditation Bundle' : 'Complete Frequency Bundle')
              : session.metadata.pack_id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

          const mailOptions = {
            from: EMAIL_FROM,
            to: session.customer_email,
            subject: `${isMeditationPurchase ? '🧘' : '🎵'} Your ${packName} is Ready! - Limitless Brain Lab`,
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
                            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 20px; line-height: 80px;">
                              <span style="font-size: 40px;">✓</span>
                            </div>
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
                            <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/${isMeditationPurchase ? 'dashboard' : 'frequencies'}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                              ${isMeditationPurchase ? '🧘 Access Your Meditations' : '🎵 Access Your Frequencies'}
                            </a>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                            <p style="color: #888; margin: 0; font-size: 12px;">
                              Thank you for your purchase! If you have any questions, contact us at limitlessbrainlab@gmail.com
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
          if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const itemType = isMeditationPurchase ? 'Meditation' : 'Frequency';
            const itemName = session.metadata.is_bundle === 'true'
              ? (isMeditationPurchase ? 'Complete Meditation Bundle' : 'Complete Frequency Bundle')
              : session.metadata.pack_id?.replace(/_/g, ' ') || `${itemType} Pack`;

            const adminFreqMailOptions = {
              from: EMAIL_FROM,
              to: process.env.EMAIL_TO || process.env.EMAIL_USER,
              subject: `💰 New ${itemType} Purchase: ${itemName}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px;">
                  <h2 style="color: #323956;">New ${itemType} Purchase</h2>
                  <p><strong>Customer:</strong> ${session.customer_email}</p>
                  <p><strong>Item:</strong> ${itemName}</p>
                  <p><strong>Bundle:</strong> ${session.metadata.is_bundle === 'true' ? 'Yes' : 'No'}</p>
                  <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                  <p><strong>Session ID:</strong> ${session.id}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
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

        // Save coaching payment record
        await supabase.from('coaching_payments').upsert({
          patient_email: patientEmail?.toLowerCase(),
          patient_name: patientName,
          coach_id: coachId,
          coach_name: coachName,
          amount: session.amount_total / 100,
          currency: session.currency,
          stripe_session_id: session.id,
          calendly_url: calendlyUrl || null,
          status: 'paid',
          created_at: new Date().toISOString()
        }, { onConflict: 'stripe_session_id' }).then(() => {}).catch(() => {});

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

          emailTransporter.sendMail(mailOptions)
            .catch(err => console.error('Coaching email failed:', err.message));
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

          emailTransporter.sendMail(coachMailOptions)
            .catch(err => console.error('Coach coaching email failed:', err.message));
        }

        // Notify admin (Limitless Brain Lab) about coaching session purchase
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
          const adminCoachMailOptions = {
            from: EMAIL_FROM,
            to: process.env.EMAIL_TO || process.env.EMAIL_USER,
            subject: `💰 New Coaching Session Purchase: ${coachName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px;">
                <h2 style="color: #323956;">New Coaching Session Purchase</h2>
                <p><strong>Patient:</strong> ${patientName} (${patientEmail})</p>
                <p><strong>Coach:</strong> ${coachName}</p>
                <p><strong>Amount:</strong> ${session.currency?.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}</p>
                <p><strong>Calendly:</strong> ${calendlyUrl || 'N/A'}</p>
                <p><strong>Session ID:</strong> ${session.id}</p>
                <p><strong>Date:</strong> ${new Date().toISOString()}</p>
              </div>
            `
          };

          emailTransporter.sendMail(adminCoachMailOptions)
            .catch(err => console.error('Admin coaching email failed:', err.message));
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

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && customerEmail) {
      const renewalMail = {
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `✅ Subscription Renewed Successfully - Limitless Brain Lab`,
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
                <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Go to Dashboard</a>
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

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && customerEmail) {
      const failedMail = {
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: `⚠️ Payment Failed - Action Required - Limitless Brain Lab`,
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
                <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard/subscription" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">Update Payment Method</a>
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Neuro360 Backend Server is running',
    timestamp: new Date().toISOString(),
    env: {
      geminiApiKey: !!process.env.GEMINI_API_KEY,
      openaiApiKey: !!process.env.OPENAI_API_KEY,
      supabaseUrl: !!process.env.SUPABASE_URL,
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      stripeKeyPreview: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 8) + '...' : 'NOT SET',
      allStripeEnvKeys: Object.keys(process.env).filter(k => k.toLowerCase().includes('stripe'))
    }
  });
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
    const { clinicName, email, contactPerson, password, otp } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
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
                      <h2 style="color: #323956; margin: 0 0 8px; font-size: 24px;">Welcome, ${contactPerson || clinicName || 'Clinic Admin'}! 🎉</h2>
                      <p style="color: #666; margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
                        Thank you for registering with <strong>Limitless Brain Lab</strong>! We are thrilled to have you onboard and look forward to a long-term association filled with health, happiness, and growth.
                      </p>
                      <p style="color: #666; margin: 0 0 12px; font-size: 14px; line-height: 1.6;">
                        Your clinic account <strong>${clinicName || ''}</strong> has been activated. Below are your login credentials. Please login and choose your plan to get started.
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
                                  <p style="color: #ffffff; margin: 4px 0 0; font-size: 16px; font-weight: 600;">${email}</p>
                                </td>
                              </tr>
                            </table>

                            <table width="100%" style="background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 12px;">
                              <tr>
                                <td style="padding: 12px 16px;">
                                  <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 11px;">PASSWORD</p>
                                  <p style="color: #ffffff; margin: 4px 0 0; font-size: 16px; font-weight: 600; font-family: monospace;">${password}</p>
                                </td>
                              </tr>
                            </table>

                            ${otp ? `
                            <table width="100%" style="background: rgba(255,255,255,0.15); border-radius: 8px;">
                              <tr>
                                <td style="padding: 12px 16px;">
                                  <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 11px;">ACTIVATION OTP (Valid for 15 mins)</p>
                                  <p style="color: #F5D05D; margin: 4px 0 0; font-size: 24px; font-weight: 700; letter-spacing: 4px;">${otp}</p>
                                </td>
                              </tr>
                            </table>
                            ` : ''}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Login Button -->
                  <tr>
                    <td style="padding: 0 32px 24px;" align="center">
                      <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic-login" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                        🔐 Login to Your Clinic Portal
                      </a>
                    </td>
                  </tr>

                  <!-- Security Note -->
                  <tr>
                    <td style="padding: 0 32px 24px;">
                      <div style="background: #fef3c7; border-radius: 8px; padding: 16px; border-left: 4px solid #f59e0b;">
                        <p style="color: #92400e; margin: 0; font-size: 13px; line-height: 1.5;">
                          <strong>⚠️ Security Note:</strong> Please change your password after your first login. Keep your credentials secure and do not share them with anyone.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                      <p style="color: #888; margin: 0; font-size: 12px;">
                        ✨ Thank you for choosing <strong style="color: #323956;">Limitless Brain Lab</strong>
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

    await emailTransporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Clinic credentials email sent successfully'
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
                          <p style="color:#742a2a;margin:0;font-size:14px;line-height:1.6;">${remark}</p>
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
        subject: `✅ Registration Successful - Welcome to Limitless Brain Lab!`,
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
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 40px; line-height: 80px;">✓</span>
                        </div>
                        <h2 style="color: #323956; margin: 0 0 8px; font-size: 26px;">Welcome, ${displayName}! 🎉</h2>
                        <p style="color: #666; margin: 0; font-size: 15px; line-height: 1.6;">
                          Your clinic registration has been successfully completed.
                        </p>
                      </td>
                    </tr>

                    <!-- What's Next -->
                    <tr>
                      <td style="padding: 0 32px 24px;">
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; border: 1px solid #bbf7d0;">
                          <h3 style="color: #166534; margin: 0 0 12px; font-size: 16px;">📋 What's Next?</h3>
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
                            Need help? Contact us at <a href="mailto:limitlessbrainlab@gmail.com" style="color: #1e40af; font-weight: 600;">limitlessbrainlab@gmail.com</a>
                          </p>
                        </div>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
                        <p style="color: #888; margin: 0; font-size: 12px;">
                          ✨ Thank you for choosing <strong style="color: #323956;">Limitless Brain Lab</strong>
                        </p>
                        <p style="color: #aaa; margin: 6px 0 0; font-size: 11px;">
                          ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                        <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
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
    const { email, name } = req.body;

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
                      <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
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
                            <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/dashboard/brain-coach" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
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
      subject: '🔐 Email Verification OTP - Limitless Brain Lab',
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

    // OTP verified - remove from store
    otpStore.delete(email.toLowerCase());

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

// =====================================================
// EMAIL 5 — PASSWORD RESET (token-based, for ResetPasswordForm)
// =====================================================

// In-memory password reset token store
const passwordResetStore = new Map();

// Generate password reset token
const generateResetToken = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Forgot Password - Generate reset token and send email
app.post('/api/send-password-reset', async (req, res) => {
  try {
    const { email, name, resetLink } = req.body;

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
      subject: 'Reset your password',
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
                      <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Password Reset</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 36px 32px;">
                      <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${name},</h2>
                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 24px;">
                        We received a request to reset the password for your Limitless Brain Lab account. Click the link below to choose a new one:
                      </p>

                      <!-- CTA Button -->
                      <div style="text-align: center; margin: 0 0 24px;">
                        <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                          Reset My Password
                        </a>
                      </div>

                      <!-- Expiry Notice -->
                      <div style="background: #fef3c7; border-radius: 12px; padding: 16px; border-left: 4px solid #f59e0b; margin: 0 0 24px;">
                        <p style="color: #92400e; margin: 0; font-size: 13px;">
                          ⏰ <strong>This link expires in 30 minutes.</strong> If it expires before you use it, just head back to the login page and request another.
                        </p>
                      </div>

                      <!-- Security Tips -->
                      <div style="background: #f8f9fc; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
                        <h3 style="color: #323956; margin: 0 0 12px; font-size: 15px; font-weight: 600;">A few things to keep in mind:</h3>
                        <ul style="color: #555; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                          <li>Choose a password you haven't used before</li>
                          <li>Use at least 8 characters with a mix of letters, numbers, and symbols</li>
                          <li>Never share your password with anyone, including our team</li>
                        </ul>
                      </div>

                      <!-- Reassurance -->
                      <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0;">
                        Didn't request this? You can safely ignore this email — your password won't change unless you click the link above. If you're seeing repeated reset emails you didn't ask for, please reply to let us know so we can secure your account.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                      <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">Stay safe,</p>
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

    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });

  } catch (error) {
    console.error('Password reset email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reset email',
      error: error.message
    });
  }
});

// Send new password to registered email after password change
app.post('/api/send-password-email', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.json({ success: false, message: 'Email not configured' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your Password Has Been Changed - Limitless Brain Lab',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover;" />
            <h1 style="color: #ffffff; margin: 10px 0 0; font-size: 20px;">Password Changed Successfully</h1>
          </div>
          <div style="padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #333;">Hi ${name || 'User'},</p>
            <p style="color: #555;">Your password has been successfully changed. Here are your updated login credentials:</p>
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0; color: #333;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 4px 0; color: #333;"><strong>New Password:</strong> ${password}</p>
            </div>
            <p style="color: #999; font-size: 12px;">If you did not make this change, please contact support immediately.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/login" style="display: inline-block; background: #323956; color: #fff; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Login Now</a>
            </div>
          </div>
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
    const { patientName, email, password, clinicName, clinicSmtpEmail, clinicSmtpPassword } = req.body;
    console.log('📧 send-welcome-email called:', { patientName, email, clinicName, hasClinicSmtp: !!(clinicSmtpEmail && clinicSmtpPassword) });

    if (!email || !password || !patientName) {
      console.log('❌ Missing required fields:', { email: !!email, password: !!password, patientName: !!patientName });
      return res.status(400).json({
        success: false,
        message: 'Patient name, email and password are required'
      });
    }

    // Use clinic's own SMTP if configured, otherwise use default
    let transporter = emailTransporter;
    let fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    console.log('✅ Using fromEmail:', fromEmail);

    if (clinicSmtpEmail && clinicSmtpPassword) {
      try {
        transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: clinicSmtpEmail,
            pass: clinicSmtpPassword
          },
          connectionTimeout: 120000,
          greetingTimeout: 60000,
          socketTimeout: 120000,
          tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
        });
        fromEmail = clinicSmtpEmail;
        console.log('✅ Using clinic SMTP:', clinicSmtpEmail);
      } catch (smtpError) {
        console.error('❌ Clinic SMTP setup failed, falling back to default:', smtpError.message);
        transporter = emailTransporter;
        fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
      }
    } else if (clinicSmtpEmail || clinicSmtpPassword) {
      console.warn('⚠️ Clinic SMTP incomplete - missing email or password, using default');
    } else {
      console.log('ℹ️ Using default email service for patient welcome email');
    }

    const loginUrl = `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/login`;

    const mailOptions = {
      from: fromEmail,
      to: email,
      subject: '🎉 Welcome to Limitless Brain Lab - Your Login Credentials',
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
                <h3 style="color: #323956; margin: 0 0 15px; font-size: 16px;">🔐 Your Login Credentials</h3>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Email</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${email}</p>
                </div>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; border-left: 4px solid #10b981;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Password</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600; font-family: monospace;">${password}</p>
                </div>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Login Now →
                </a>
              </div>

              <div style="background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 12px;">
                  ⚠️ <strong>Security Tip:</strong> Please change your password after first login and keep your credentials safe.
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
      clinicSmtpUsed: !!(clinicSmtpEmail && clinicSmtpPassword),
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
    const { patientName, newEmail, clinicName, clinicUrl, clinicSmtpEmail, clinicSmtpPassword } = req.body;
    console.log('📧 send-email-update-notification called:', { patientName, newEmail, clinicName });

    if (!newEmail || !patientName) {
      console.log('❌ Missing required fields:', { email: !!newEmail, patientName: !!patientName });
      return res.status(400).json({
        success: false,
        message: 'Patient name and new email are required'
      });
    }

    // Use clinic's own SMTP if configured, otherwise use default
    let transporter = emailTransporter;
    let fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    if (clinicSmtpEmail && clinicSmtpPassword) {
      try {
        transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: clinicSmtpEmail,
            pass: clinicSmtpPassword
          },
          connectionTimeout: 120000,
          greetingTimeout: 60000,
          socketTimeout: 120000,
          tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
        });
        fromEmail = clinicSmtpEmail;
        console.log('✅ Using clinic SMTP:', clinicSmtpEmail);
      } catch (smtpError) {
        console.error('❌ Clinic SMTP setup failed, falling back to default:', smtpError.message);
        transporter = emailTransporter;
        fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
      }
    }

    // Generate system password
    const systemPassword = generateSystemPassword();
    const loginUrl = `${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/login`;

    const mailOptions = {
      from: fromEmail,
      to: newEmail,
      subject: 'Your email ID updated — Limitless Brain Lab Portal',
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
              <h1 style="color: white; margin: 0; font-size: 22px;">Email Updated</h1>
              <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Your Limitless Brain Lab Portal Access</p>
            </div>

            <div style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${patientName}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                A quick update: your email ID registered with <strong>${clinicName || 'your clinic'}</strong> has been updated.
              </p>

              <div style="background: #f8f9fc; border-radius: 10px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #323956; margin: 0 0 15px; font-size: 16px;">📧 Updated Information</h3>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Updated Email ID</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${newEmail}</p>
                </div>

                <div style="background: white; border-radius: 8px; padding: 12px 15px; border-left: 4px solid #10b981;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">System Generated Password</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600; font-family: monospace;">${systemPassword}</p>
                </div>
              </div>

              <div style="text-align: center; margin: 25px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Login to Portal →
                </a>
              </div>

              <div style="background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 12px;">
                  ⚠️ <strong>Security Tip:</strong> Please change your password after first login and keep your credentials safe.
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
    console.log('✅ Email update notification sent successfully:', { to: newEmail, messageId: sendResult?.messageId, password: systemPassword });

    res.json({
      success: true,
      message: 'Email update notification sent successfully',
      password: systemPassword
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
    const { patientName, patientEmail, clinicName, clinicEmail, reportUrl, reportFileName } = req.body;

    if (!patientEmail || !clinicEmail || !reportUrl) {
      return res.status(400).json({
        success: false,
        message: 'Patient email, clinic email, and report URL are required'
      });
    }

    if (!emailTransporter) {
      return res.status(500).json({
        success: false,
        message: 'Email service not configured'
      });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';
    const loginUrl = `${FRONTEND_URL}/login`;

    const reportTitle = `QEEG Analysis Report - ${patientName}`;
    const reportName = reportFileName || 'neurosense-report.pdf';
    // When the Super Admin sends the Claude-generated report, use a distinct
    // "Brain Type & Performance Report" template instead of the NeuroSense one.
    const isClaude = (req.body.reportType === 'claude');

    // Attach the actual report PDF to the email (download it from reportUrl).
    // Degrades to link-only if the fetch fails so the email still sends.
    let reportAttachment = [];
    try {
      const pdfRes = await fetch(reportUrl);
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        reportAttachment = [{ filename: reportName, content: buf, contentType: 'application/pdf' }];
      } else {
        console.warn('send-report-email: could not fetch report PDF, sending link only. status', pdfRes.status);
      }
    } catch (e) {
      console.warn('send-report-email: report PDF fetch failed, sending link only:', e.message);
    }

    // Security: when the PDF is attached, do NOT put the public Supabase link in
    // the email body. Only fall back to a link if the attachment could not be built.
    const attached = reportAttachment.length > 0;
    const attachedNotice = `<div style="background:#eef6ff;border:1px solid #cfe2ff;border-radius:8px;padding:14px 18px;margin:0 0 24px;text-align:center;"><p style="color:#15315f;margin:0;font-size:14px;font-weight:600;">📎 Your report is attached to this email as a PDF.</p></div>`;

    const claudePatientHtml = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f7fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 20px;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
                <tr><td style="background:linear-gradient(135deg,#1e63b4 0%,#0f2a5e 100%);padding:24px 32px;text-align:center;">
                  <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:90px;height:90px;border-radius:50%;object-fit:cover;margin-bottom:10px;" />
                  <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Neuro Performance Report</h1>
                  <p style="color:#9ec2f0;margin:6px 0 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Personalized 12-Page Neuro-Profile</p>
                </td></tr>
                <tr><td style="padding:36px 32px;">
                  <h2 style="color:#15315f;margin:0 0 20px;font-size:22px;font-weight:600;">Hi ${patientName},</h2>
                  <p style="color:#555;font-size:15px;line-height:1.8;margin:0 0 16px;">Your personalized <strong>Neuro Performance Report</strong> is ready — a complete map of your brainwave activity, cognitive performance, and your dominant brain type, built from your qEEG analysis.</p>
                  <p style="color:#555;font-size:15px;line-height:1.8;margin:0 0 20px;">Inside you'll find your brain-type profile, your seven performance markers, the deep-dive neuro-metrics your clinician will reference, and a personalized 30-day plan.</p>
                  ${attached ? attachedNotice : `<div style="text-align:center;margin:0 0 24px;"><a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#1e63b4 0%,#0f2a5e 100%);color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:14px;">View My Neuro Performance Report</a></div>`}
                  <div style="text-align:center;margin:0 0 24px;">
                    <a href="${loginUrl}" style="display:inline-block;background:#ffffff;color:#1e63b4;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:14px;border:2px solid #1e63b4;">Login</a>
                  </div>
                  <p style="color:#555;font-size:15px;line-height:1.8;margin:0;">This report is a starting point, not a finish line. If anything sparks a question, we're just a reply away.</p>
                </td></tr>
                <tr><td style="background:#f8f9fc;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
                  <p style="color:#555;margin:0 0 8px;font-size:15px;font-weight:600;">To unlocking what's possible,</p>
                  <p style="color:#15315f;margin:0;font-size:15px;font-weight:700;">The Limitless Brain Lab Team</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>`;

    const claudeClinicHtml = `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:20px;font-family:Arial,sans-serif;background-color:#f4f7fa;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
            <div style="background:linear-gradient(135deg,#1e63b4 0%,#0f2a5e 100%);padding:25px;text-align:center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:10px;" />
              <h1 style="color:white;margin:0;font-size:24px;">Neuro Performance Report</h1>
              <p style="color:#9ec2f0;margin:8px 0 0;font-size:14px;">Patient Brain-Type Profile &amp; Review</p>
            </div>
            <div style="padding:30px;">
              <p style="color:#333;font-size:16px;margin:0 0 20px;">Hello <strong>${clinicName}</strong>,</p>
              <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 20px;">The <strong>Neuro Performance Report</strong> for <strong>${patientName}</strong> is ready for clinical review. The patient has also received a copy.</p>
              <div style="background:#f8f9fc;border-radius:10px;padding:20px;margin:20px 0;">
                <h3 style="color:#15315f;margin:0 0 15px;font-size:16px;">📋 Report Information</h3>
                <div style="background:white;border-radius:8px;padding:15px;margin-bottom:10px;border-left:4px solid #1e63b4;"><p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Patient Name</p><p style="color:#15315f;margin:4px 0 0;font-size:15px;font-weight:600;">${patientName}</p></div>
                <div style="background:white;border-radius:8px;padding:15px;border-left:4px solid #2dbf9c;"><p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Report Type</p><p style="color:#15315f;margin:4px 0 0;font-size:15px;font-weight:600;">Neuro Performance Report (12-page)</p></div>
              </div>
              ${attached ? attachedNotice : `<div style="text-align:center;margin:25px 0;"><a href="${reportUrl}" style="display:inline-block;background:linear-gradient(135deg,#1e63b4 0%,#0f2a5e 100%);color:white;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:600;font-size:14px;">📥 Download Report</a></div>`}
            </div>
            <div style="background:#f8f9fc;padding:15px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#888;margin:0;font-size:11px;">© ${new Date().getFullYear()} Limitless Brain Lab | Brain &amp; Mental Wellness</p></div>
          </div>
        </body></html>`;

    // Email to Patient
    const patientMailOptions = {
      from: EMAIL_FROM,
      to: patientEmail,
      replyTo: process.env.EMAIL_USER,
      headers: {
        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
        'X-Mailer': 'Limitless Brain Lab Mailer'
      },
      subject: isClaude ? `Your Neuro Performance Report is Ready` : `Your report is ready — unlock your hidden brain powers`,
      text: isClaude
        ? `Hi ${patientName},\n\nYour Neuro Performance Report is ready.\n\nLog in to your dashboard to view it: ${loginUrl}\n\nThe Limitless Brain Lab Team`
        : `Hi ${patientName},\n\nYour brain report is ready. Log in to access your results: ${loginUrl}\n\nThe Limitless Brain Lab Team`,
      attachments: [...getLogoAttachment(), ...reportAttachment],
      html: isClaude ? claudePatientHtml : `
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
                      <p style="color: #F5D05D; margin: 6px 0 0; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600;">Your Report Is Ready</p>
                    </td>
                  </tr>

                  <!-- Main Content -->
                  <tr>
                    <td style="padding: 36px 32px;">
                      <h2 style="color: #323956; margin: 0 0 20px; font-size: 22px; font-weight: 600;">Hi ${patientName},</h2>
                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
                        Great news — your report is ready.
                      </p>
                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 20px;">
                        Log in to your dashboard now to access your personalised results and start exploring the hidden powers of your brain. What you'll find inside is a deeper look at how your mind works, where your strengths lie, and the untapped potential waiting to be unlocked.
                      </p>

                      <!-- CTA Button / attachment notice -->
                      ${attached ? attachedNotice : `<div style="text-align: center; margin: 0 0 24px;">
                        <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                          View My Report
                        </a>
                      </div>`}

                      <!-- Next Steps -->
                      <div style="background: #f8f9fc; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
                        <h3 style="color: #323956; margin: 0 0 15px; font-size: 15px; font-weight: 600;">Here's what to do next:</h3>
                        <ul style="color: #555; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                          <li>Open your report and take your time with it</li>
                          <li>Review the key insights and recommendations</li>
                          <li>Decide which next step feels right for you — whether that's booking a coach or exploring more on your own</li>
                        </ul>
                      </div>

                      <p style="color: #555; font-size: 15px; line-height: 1.8; margin: 0;">
                        This is where the real journey begins. Your brain has more to offer than you might realise, and this report is your map. If anything in your report sparks a question or you'd like guidance interpreting it, we're just a reply away.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background: #f8f9fc; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
                      <p style="color: #555; margin: 0 0 8px; font-size: 15px; font-weight: 600;">To unlocking what's possible,</p>
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

    // Email to Clinic
    const clinicMailOptions = {
      from: EMAIL_FROM,
      to: clinicEmail,
      subject: isClaude ? `Neuro Performance Report — ${patientName}` : `QEEG Report Ready for Review - ${patientName}`,
      attachments: [...getLogoAttachment(), ...reportAttachment],
      html: isClaude ? claudeClinicHtml : `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f7fa;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); padding: 25px; text-align: center;">
              <img src="cid:company-logo" alt="Limitless Brain Lab" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 10px;" />
              <h1 style="color: white; margin: 0; font-size: 24px;">QEEG Report Ready</h1>
              <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">Patient Analysis & Review</p>
            </div>

            <div style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${clinicName}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                The QEEG analysis report for <strong>${patientName}</strong> has been completed and is ready for clinical review. The patient has also received a copy for their records.
              </p>

              <div style="background: #f8f9fc; border-radius: 10px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #323956; margin: 0 0 15px; font-size: 16px;">📋 Report Information</h3>
                <div style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #10b981;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Patient Name</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${patientName}</p>
                </div>
                <div style="background: white; border-radius: 8px; padding: 15px; border-left: 4px solid #f59e0b;">
                  <p style="color: #888; margin: 0; font-size: 11px; text-transform: uppercase;">Report File</p>
                  <p style="color: #323956; margin: 4px 0 0; font-size: 15px; font-weight: 600;">${reportName}</p>
                </div>
              </div>

              ${attached ? attachedNotice : `<div style="text-align: center; margin: 25px 0;">
                <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #323956 0%, #1a1f36 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  📥 Download Report
                </a>
              </div>`}

              <div style="background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-top: 20px;">
                <p style="color: #92400e; margin: 0; font-size: 12px;">
                  ✅ <strong>Action Required:</strong> Review the report and prepare clinical recommendations for the patient consultation.
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

    // Send both emails in parallel
    await Promise.all([
      emailTransporter.sendMail(patientMailOptions),
      emailTransporter.sendMail(clinicMailOptions)
    ]);

    console.log('✅ Report emails sent successfully:', { patientEmail, clinicEmail });

    res.json({
      success: true,
      message: 'Report emails sent to clinic and patient successfully'
    });

  } catch (error) {
    console.error('❌ Error sending report emails:', error);
    res.status(500).json({
      success: false,
      message: `Email send failed: ${error.message || 'Unknown error'}`
    });
  }
});

// Send Calendly Scheduling Link Email to Patient after coaching payment
app.post('/api/send-coaching-link', async (req, res) => {
  try {
    const COMMON_CALENDLY = 'https://calendly.com/admin-bettroi/30min';
    const { patientName, patientEmail, coachName, calendlyUrl, coachEmail } = req.body;

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
    const hasCalendly = true;

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
              <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                Hello <strong>${patientName || 'there'}</strong>,
              </p>

              <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Your payment for a brain coaching session with <strong>${coachName}</strong> has been received successfully.
                ${hasCalendly ? 'Please click the button below to schedule your session at a convenient time.' : 'Our team will contact you shortly to schedule your session.'}
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
                  The coach will reach out to you within 24 hours to schedule your session.
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

    await emailTransporter.sendMail(mailOptions);

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
                <p style="color: #F5D05D; margin: 8px 0 0; font-size: 14px;">A patient has paid and scheduled with you</p>
              </div>
              <div style="padding: 30px;">
                <p style="color: #333; font-size: 16px; margin: 0 0 20px;">
                  Hello <strong>${coachName}</strong>,
                </p>
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                  <strong>${patientName || 'A patient'}</strong> (${patientEmail}) has successfully paid for a brain coaching session with you and scheduled a time via Calendly.
                </p>
                <div style="background: #f0f9ff; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                  <p style="color: #1e40af; margin: 0; font-size: 13px; font-weight: 600;">Patient Details</p>
                  <p style="color: #1e40af; margin: 4px 0 0; font-size: 13px;">Name: <strong>${patientName || 'N/A'}</strong></p>
                  <p style="color: #1e40af; margin: 4px 0 0; font-size: 13px;">Email: <strong>${patientEmail}</strong></p>
                </div>
                <p style="color: #666; font-size: 13px; line-height: 1.6;">
                  Please check your Calendly calendar for the confirmed session time. The patient will receive a calendar invite from Calendly.
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
      await emailTransporter.sendMail(coachMailOptions).catch(err => console.error('Coach notification email failed:', err.message));
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

    await emailTransporter.sendMail({
      from: EMAIL_FROM,
      to: process.env.EMAIL_TO || process.env.EMAIL_USER,
      subject: `📄 Demo Report Request - ${email}`,
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
                              <p style="color: #ffffff; margin: 3px 0 0; font-size: 13px; font-weight: 600;">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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
                        ✨ This inquiry was received from <strong style="color: #323956;">Limitless Brain Lab</strong> - Demo Report Request Form
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
    });

    res.json({ success: true, message: 'Demo report request submitted successfully' });
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

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ success: false, message: 'Email not configured' });
    }

    const displayName = patientName || 'there';
    const displayReport = reportType || 'Brain Wellness Report';
    const displayClinic = clinicName || 'your clinic';
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';

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
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; limitlessbrainlab@gmail.com</p>
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
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; limitlessbrainlab@gmail.com</p>
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
    const { clinicEmail, clinicName, clinicType } = req.body;

    if (!clinicEmail) {
      return res.status(400).json({ success: false, message: 'Clinic email is required' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ success: false, message: 'Email not configured' });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app';
    const displayName = clinicName || 'Clinic Admin';
    const accountType = clinicType === 'lbl_partner' ? 'Partner' : 'Clinic';
    const dashboardPath = clinicType === 'lbl_partner' ? '/clinic/subscription' : '/clinic/subscription';

    const mailOptions = {
      from: EMAIL_FROM,
      to: clinicEmail,
      subject: `⚠️ No Report Credits Remaining - Action Required - Limitless Brain Lab`,
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
              <p style="margin: 0; color: #c2410c; font-weight: 600; font-size: 14px;">⚠️ Action Required: Purchase a report package to continue adding patients.</p>
            </div>
            <p style="color: #555; font-size: 14px; line-height: 1.6;">To purchase more credits, visit your Subscription tab in the dashboard and choose a package that suits your needs.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${FRONTEND_URL}${dashboardPath}" style="display: inline-block; background: #323956; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">Buy More Credits</a>
            </div>
            <p style="color: #999; font-size: 12px; line-height: 1.6;">If you need assistance, please contact us at <a href="mailto:limitlessbrainlab@gmail.com" style="color: #323956;">limitlessbrainlab@gmail.com</a></p>
          </div>
          <div style="background: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">Limitless Brain Lab &bull; limitlessbrainlab@gmail.com</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✉️ No-credit email sent to ${clinicEmail}`);

    res.json({ success: true, message: 'No credit notification email sent' });
  } catch (error) {
    console.error('❌ Error sending no-credit email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// EMAIL DUPLICATE CHECK - CLINIC & PARTNER BOTH
// ════════════════════════════════════════════════════════════════════════════════

app.post('/api/check-email-exists', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check in patients table
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('id, email, patient_name')
      .eq('email', normalizedEmail)
      .limit(1);

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
        message: `⚠️ Email already registered as a patient`
      });
    }

    // Check if clinic exists
    if (clinicData && clinicData.length > 0) {
      const clinicType = clinicData[0].clinic_type === 'lbl_partner' ? 'Partner' : 'Clinic';
      return res.json({
        success: true,
        exists: true,
        type: 'clinic',
        message: `⚠️ Email already registered as a ${clinicType}`
      });
    }

    // Email is available
    return res.json({
      success: true,
      exists: false,
      message: '✅ Email is available for registration'
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

    // Check if email already exists in patients table
    const { data: existingPatient, error: patientCheckError } = await supabase
      .from('patients')
      .select('id, patient_name')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingPatient && existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Email already registered as patient: ${existingPatient[0].patient_name}`
      });
    }

    // Check if email already exists in clinics table
    const { data: existingClinic, error: clinicCheckError } = await supabase
      .from('clinics')
      .select('id, name')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingClinic && existingClinic.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Email already registered as clinic: ${existingClinic[0].name}`
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
        created_by: 'clinic_admin'
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

    // Check if email already exists in patients table
    const { data: existingPatient, error: patientCheckError } = await supabase
      .from('patients')
      .select('id, patient_name')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingPatient && existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Email already registered as patient: ${existingPatient[0].patient_name}`
      });
    }

    // Check if email already exists in clinics table
    const { data: existingClinic, error: clinicCheckError } = await supabase
      .from('clinics')
      .select('id, name')
      .eq('email', normalizedEmail)
      .limit(1);

    if (existingClinic && existingClinic.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Email already registered as clinic: ${existingClinic[0].name}`
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
        created_by: 'partner_admin'
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
      subject: '🎉 Welcome to Limitless Brain Lab - Partner Account Activated',
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
              <h3 style="color: #333; margin: 0 0 18px; font-size: 15px; font-weight: 700;">🔐 Your Login Credentials</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; margin-bottom: 10px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${email}</p>
              </div>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #1E3A5F;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Password</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600; font-family: 'Courier New', monospace;">${password}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Access Partner Dashboard →</a>
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
      subject: isReorder ? `🔄 Package Reorder Successful - ${reports} EEG Reports Added!` : `✅ Payment Successful - ${reports} EEG Reports Added!`,
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
              <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Go to Dashboard</a>
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
              <h3 style="color: #333; margin: 0 0 15px; font-size: 14px; font-weight: 700;">📋 Report Information</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Report File</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${reportFileName || 'report.pdf'}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">📥 Download Report</a>
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
      subject: `⚠️ No Report Credits Remaining - Action Required`,
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
              <p style="margin: 0; color: #C2410C; font-weight: 600; font-size: 14px;">⚠️ Action Required: Purchase a report package</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/clinic/subscription" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Buy More Credits</a>
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
    const { patientName, email, password, partnerName } = req.body;

    if (!email || !password || !patientName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: '🎉 Welcome to Limitless Brain Lab - Your Login Credentials',
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
              <h3 style="color: #333; margin: 0 0 18px; font-size: 15px; font-weight: 700;">🔐 Your Login Credentials</h3>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; margin-bottom: 10px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${email}</p>
              </div>
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #1E3A5F;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Password</p>
                <p style="color: #333; margin: 5px 0 0; font-size: 14px; font-weight: 600; font-family: 'Courier New', monospace;">${password}</p>
              </div>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'https://limitlessbrainlab-eight.vercel.app'}/login" style="display: inline-block; background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); color: white; text-decoration: none; padding: 13px 35px; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 8px rgba(46, 91, 168, 0.4);">Login Now →</a>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Patient welcome email sent' });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. PARTNER EMAIL UPDATE
app.post('/api/send-partner-email-update', async (req, res) => {
  try {
    const { partnerName, newEmail } = req.body;

    if (!newEmail || !partnerName) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const newPassword = generateSystemPassword();

    const mailOptions = {
      from: EMAIL_FROM,
      to: newEmail,
      subject: 'Your email ID updated — Limitless Brain Lab Partner Portal',
      attachments: getLogoAttachment(),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #2E5BA8 0%, #1E3A5F 100%); padding: 45px 30px; text-align: center;">
            <img src="cid:company-logo" alt="LBL" style="width: 75px; height: 75px; border-radius: 50%; margin-bottom: 18px;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Email Updated</h1>
          </div>
          <div style="padding: 35px 30px;">
            <p style="color: #333; font-size: 15px; margin: 0 0 15px;">Hello <strong>${partnerName}</strong>,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 25px;">Your email address has been successfully updated.</p>
            <div style="background: #f0f7ff; border-radius: 10px; padding: 18px 20px; margin: 25px 0; border: 1px solid #d4e9ff;">
              <div style="background: white; border-radius: 8px; padding: 13px 15px; border-left: 4px solid #2E5BA8;">
                <p style="color: #888; margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Updated Email</p>
                <p style="color: #1E3A5F; margin: 5px 0 0; font-size: 14px; font-weight: 600;">${newEmail}</p>
              </div>
            </div>
          </div>
          <div style="background: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Limitless Brain Lab</p>
          </div>
        </div>
      `
    };

    await emailTransporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Email update notification sent', password: newPassword });

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
});

module.exports = app;
