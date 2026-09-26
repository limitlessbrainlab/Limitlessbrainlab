import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'qeeg-uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const json = (res, status, body) => res.status(status).json(body);

function serverClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireSuperAdmin(token, supabase) {
  const { data } = await supabase.auth.getUser(token);
  if (!data?.user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  return profile?.role === 'super_admin' ? data.user : null;
}

function safeName(name) {
  return path.basename(String(name || 'qeeg.pdf')).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function prepareUploads(req, res, supabase, user) {
  const files = Array.isArray(req.body?.files) ? req.body.files : [];
  if (files.length !== 2 || files.some((file) => !file?.name || file.size > MAX_FILE_SIZE)) {
    return json(res, 400, { message: 'Exactly two files up to 50MB each are required' });
  }
  const uploads = [];
  for (const file of files) {
    const objectPath = `qeeg-staging/${user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectPath);
    if (error) throw error;
    uploads.push({ path: objectPath, token: data.token });
  }
  return json(res, 200, { uploads });
}

async function downloadInput(supabase, userId, objectPath, fieldName, originalName) {
  if (!String(objectPath || '').startsWith(`qeeg-staging/${userId}/`)) throw new Error('Invalid input file path');
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error) throw error;
  if (!data || data.size > MAX_FILE_SIZE) throw new Error('Input file exceeds 50MB');
  const dir = '/tmp/neuro360-uploads';
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${fieldName}-${crypto.randomUUID()}${path.extname(originalName || '.pdf')}`;
  const localPath = path.join(dir, filename);
  fs.writeFileSync(localPath, Buffer.from(await data.arrayBuffer()));
  return { fieldname: fieldName, originalname: safeName(originalName), filename, path: localPath, size: data.size, mimetype: data.type || 'application/pdf' };
}

async function processReport(req, res, supabase, user) {
  const inputs = req.body?.inputs || {};
  const fields = req.body?.fields || {};
  if (!inputs.eyesOpen?.path || !inputs.eyesClosed?.path || !fields.patientId) {
    return json(res, 400, { message: 'Eyes-open, eyes-closed and patient data are required' });
  }

  const [eyesOpen, eyesClosed] = await Promise.all([
    downloadInput(supabase, user.id, inputs.eyesOpen.path, 'eyesOpen', inputs.eyesOpen.name),
    downloadInput(supabase, user.id, inputs.eyesClosed.path, 'eyesClosed', inputs.eyesClosed.name),
  ]);
  req.body = fields;
  req.files = { eyesOpen: [eyesOpen], eyesClosed: [eyesClosed] };

  try {
    const { default: router } = await import('../server/routes/qeegRoutes.js');
    await router.processQeegRequest(req, res);
  } finally {
    await supabase.storage.from(BUCKET).remove([inputs.eyesOpen.path, inputs.eyesClosed.path]);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication is required' });

  try {
    const supabase = serverClient();
    const user = await requireSuperAdmin(token, supabase);
    if (!user) return json(res, 403, { message: 'Super admin access is required' });
    if (req.body?.action === 'prepare') return await prepareUploads(req, res, supabase, user);
    if (req.body?.action === 'process') return await processReport(req, res, supabase, user);
    return json(res, 400, { message: 'Unknown action' });
  } catch (error) {
    console.error('Vercel NeuroSense processing failed:', error);
    if (!res.headersSent) return json(res, 500, { message: error.message || 'NeuroSense processing failed' });
  }
}
