const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/authMiddleware');
const { randomUUID } = require('node:crypto');
const { createRoutedClient } = require('../dbRouter');
const { requirePatientAccess, requireClinicAccess } = require('../utils/patientAccess');
const SupabaseStorage = require('../services/supabaseStorage');

function createPatientDocumentRouter({ db = createRoutedClient(), storageService = SupabaseStorage, authenticate = authMiddleware } = {}) {
const router = express.Router();

const BUCKET = 'patients_documents';
const BUCKETS = ['patients_documents', 'neurosense-reports', 'patient-reports', 'edf-files', 'qeeg-uploads'];

// Upload to a temp file, then push to Supabase and delete the temp copy.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `patient-doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Re-sanitize each path segment server-side — never trust the client path verbatim.
function sanitizeStoragePath(filePath) {
  return String(filePath || '')
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

/**
 * POST /api/patient-documents/upload
 * Field "file" + body { filePath }. Uploads to the PRIVATE patients_documents
 * bucket via the service-role key (bypasses RLS). Returns the storage path only
 * (no public URL — reads go through /signed-url).
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'A file (field "file") is required.' });
    }

    const patient = await requirePatientAccess(req.user, req.body?.patientId, null, db);
    const bucket = req.body.bucket || BUCKET;
    if (!BUCKETS.includes(bucket)) return res.status(400).json({ success:false, error:'Invalid document bucket' });
    const requestedPath = sanitizeStoragePath(req.body.filePath);
    const storagePath = requestedPath ? `${patient.id}/${randomUUID()}/${requestedPath}` : '';
    if (!storagePath) {
      return res.status(400).json({ success: false, error: 'A valid filePath is required.' });
    }

    const result = await storageService.uploadFile(
      tempPath,
      bucket,
      storagePath,
      /officedocument|msword|ms-excel|ms-powerpoint/.test(req.file.mimetype) ? 'application/octet-stream' : req.file.mimetype, db, patient.id
    );

    return res.json({ success: true, path: result.path, bucket });
  } catch (error) {
    if (!error.status) console.error('Patient document upload failed');
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Document operation failed. Please try again.' });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlink(tempPath, () => {});
    }
  }
});

async function ownedDocument(req) {
  const { path: filePath, bucket = BUCKET, patientId } = req.body || {};
  if (!BUCKETS.includes(bucket) ||
      typeof filePath !== 'string' || !filePath || filePath.length > 2048 ||
      filePath.includes('\\') || filePath.includes('\0') || filePath.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw Object.assign(new Error('Invalid document path or bucket'), { status: 400 });
  }
  const { data: owner, error } = await db.rpc('resolve_document_owner', { p_bucket: bucket, p_path: filePath });
  if (error) throw error;
  if (!owner) {
    const { data: clinicOwner, error: clinicError } = await db.rpc('resolve_document_clinic', { p_bucket: bucket, p_path: filePath });
    if (clinicError) throw clinicError;
    if (clinicOwner) { requireClinicAccess(req.user, clinicOwner); return { filePath, bucket }; }
  }
  // Historical ownerless objects remain admin-readable only; signing checks object existence.
  if (!owner && req.user?.role === 'super_admin' && req.path === '/signed-url') return { filePath, bucket };
  if (!owner || (patientId && owner !== patientId)) throw Object.assign(new Error('Document access denied'), { status: 403 });
  await requirePatientAccess(req.user, owner, null, db);
  return { filePath, bucket };
}

/**
 * POST /api/patient-documents/signed-url
 * Body { path, bucket?, expiresIn? } -> { signedUrl } for a private file.
 */
router.post('/signed-url', authenticate, async (req, res) => {
  try {
    const { filePath, bucket } = await ownedDocument(req);
    const requestedExpiry = Number(req.body?.expiresIn) || 300;
    const expiresIn = Math.min(3600, Math.max(1, requestedExpiry));
    const result = await storageService.getSignedUrl(bucket, filePath, expiresIn, db);
    return res.json({ success: true, signedUrl: result.signedUrl });
  } catch (error) {
    if (!error.status) console.error('Patient document signed URL failed');
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Document operation failed. Please try again.' });
  }
});

/**
 * POST /api/patient-documents/delete
 * Body { path, bucket? } -> removes the file from the bucket.
 */
router.post('/delete', authenticate, async (req, res) => {
  try {
    const { filePath, bucket } = await ownedDocument(req);
    await storageService.deleteFile(filePath, bucket, db);
    return res.json({ success: true });
  } catch (error) {
    if (!error.status) console.error('Patient document deletion failed');
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Document operation failed. Please try again.' });
  }
});

return router;
}

module.exports = createPatientDocumentRouter();
module.exports.createPatientDocumentRouter = createPatientDocumentRouter;
