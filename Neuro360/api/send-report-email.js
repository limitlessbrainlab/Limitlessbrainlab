import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import reportEmailTemplate from '../shared/reportEmailTemplate.cjs';

// Staging build: login/dashboard CTAs in emails must land on the staging frontend,
// never production (limitlessbrainlab.com) or a stale *.vercel.app deployment.
const FRONTEND_URL = 'https://limitlessbrainlab-eight.vercel.app';
const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'info@limitlessbrainlab.com';
const EMAIL_FROM = `"Limitless Brain Lab" <${FROM_ADDRESS}>`;
// Staging build: serve the logo from the staging frontend host (which serves /public),
// aligned with FRONTEND_URL above rather than the production brand domain.
const LOGO_URL = 'https://limitlessbrainlab-eight.vercel.app/IBW%20Logo.png';
const { getReportEmailHtml, getNeuroSenseReportEmailHtml } = reportEmailTemplate;

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

let supabase;

async function requireUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Auth service not configured');

  supabase ||= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data?.user || null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  try {
    const user = await requireUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { patientName, patientEmail, clinicName, clinicEmail, reportUrl, generatedAt, reportType } = getBody(req);

    // NeuroSense Report (QEEG) uses its own template/subject; anything else keeps the
    // existing Neuro Performance Report template unchanged.
    const isNeuroSense = reportType === 'neurosense';
    const reportLabel = isNeuroSense ? 'NeuroSense Report' : 'Neuro Performance Report';
    const buildReportHtml = isNeuroSense ? getNeuroSenseReportEmailHtml : getReportEmailHtml;

    if (!patientEmail || !reportUrl) {
      return res.status(400).json({ success: false, message: 'Patient email and report URL are required' });
    }
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({ success: false, message: 'Email service not configured' });
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
    });
    const fromEmail = EMAIL_FROM;

    const patientLoginUrl = `${FRONTEND_URL}/patient/login`;
    const clinicLoginUrl = `${FRONTEND_URL}/clinic/login`;
    const replyTo = () => process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER || FROM_ADDRESS;

    await transporter.sendMail({
      from: fromEmail,
      to: patientEmail,
      replyTo: replyTo(),
      headers: {
        'List-Unsubscribe': `<mailto:${replyTo()}?subject=unsubscribe>`,
        'X-Mailer': 'Limitless Brain Lab Mailer'
      },
      subject: `Your ${reportLabel} is Ready`,
      text: `Hi ${patientName || 'there'},\n\nYour ${reportLabel} is ready.\n\nDownload your report: ${reportUrl}\nLog in: ${patientLoginUrl}\n\nThe Limitless Brain Lab Team`,
      html: buildReportHtml({ isClinic: false, patientName, clinicName, reportUrl, loginUrl: patientLoginUrl, generatedAt, logoSrc: LOGO_URL }),
    });

    let clinicEmailSent = false;
    if (clinicEmail) {
      try {
        await transporter.sendMail({
          from: fromEmail,
          to: clinicEmail,
          replyTo: replyTo(),
          headers: {
            'List-Unsubscribe': `<mailto:${replyTo()}?subject=unsubscribe>`,
            'X-Mailer': 'Limitless Brain Lab Mailer'
          },
          subject: `${reportLabel} - ${patientName || 'Patient'}`,
          text: `Hello ${clinicName || 'Clinic'},\n\nThe ${reportLabel} for ${patientName || 'your patient'} is ready.\n\nDownload: ${reportUrl}\nLog in: ${clinicLoginUrl}\n\nThe Limitless Brain Lab Team`,
          html: buildReportHtml({ isClinic: true, patientName, clinicName, reportUrl, loginUrl: clinicLoginUrl, generatedAt, logoSrc: LOGO_URL }),
        });
        clinicEmailSent = true;
      } catch (error) {
        console.error('Clinic report email failed:', error.message);
      }
    }

    return res.json({
      success: true,
      message: clinicEmail
        ? (clinicEmailSent ? 'Report emails sent to clinic and patient successfully' : 'Patient email sent; clinic email failed')
        : 'Report email sent to patient successfully',
    });
  } catch (error) {
    console.error('Report email failed:', error.message);
    return res.status(500).json({ success: false, message: `Email send failed: ${error.message || 'Unknown error'}` });
  }
}
