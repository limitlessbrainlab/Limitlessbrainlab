import { documentLocation } from '../utils/documentLocation.js';
import { supabase } from '../lib/supabaseClient';

// Private documents are authorized against the current patient's account on the server.
const DEFAULT_BUCKET = 'patients_documents';

function getBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000');
  return apiUrl.replace(/\/api\/?$/, '');
}

async function authHeaders(extra = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Please sign in again to access documents');
  return { ...extra, Authorization: `Bearer ${data.session.access_token}` };
}

/**
 * Upload a file to the private bucket.
 * @param {File} file
 * @param {string} filePath - desired path within the bucket (re-sanitized server-side)
 * @returns {Promise<{ path: string, bucket: string }>}
 */
export async function uploadPatientDocument(file, filePath, patientId, bucket = DEFAULT_BUCKET) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('filePath', filePath);
  formData.append('patientId', patientId);
  formData.append('bucket', bucket);

  const res = await fetch(`${getBaseUrl()}/api/patient-documents/upload`, {
    method: 'POST',
    headers: await authHeaders(), // do NOT set Content-Type; browser sets multipart boundary
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return { path: data.path, bucket: data.bucket || DEFAULT_BUCKET };
}

/**
 * Get a short-lived signed URL for a private file.
 * @returns {Promise<string|null>}
 */
export async function getPatientDocSignedUrl(bucket, path, expiresIn = 300, patientId) {
  const location = documentLocation(path, bucket || DEFAULT_BUCKET);
  if (!location || (location.origin && location.origin !== new URL(supabase.supabaseUrl).origin)) throw new Error('Document belongs to a different storage service');
  bucket = location.bucket; path = location.path;
  const res = await fetch(`${getBaseUrl()}/api/patient-documents/signed-url`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ bucket: bucket || DEFAULT_BUCKET, path, expiresIn, patientId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Signed URL failed (${res.status})`);
  }
  return data.signedUrl || null;
}

/**
 * Delete a file from the private bucket.
 */
export async function deletePatientDocument(bucket, path, patientId) {
  const location = documentLocation(path, bucket || DEFAULT_BUCKET);
  if (!location || (location.origin && location.origin !== new URL(supabase.supabaseUrl).origin)) throw new Error('Document belongs to a different storage service');
  bucket = location.bucket; path = location.path;
  const res = await fetch(`${getBaseUrl()}/api/patient-documents/delete`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ bucket: bucket || DEFAULT_BUCKET, path, patientId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
  return true;
}

// Historical public and expired signed URLs are references, never authorization.
export async function resolveReportUrl(url, patientId) {
  if (!url || /^(?:blob:|data:)/i.test(url)) return url;
  const base = getBaseUrl() || window.location.origin;
  const target = new URL(url, new URL(base, window.location.origin));
  const allowedOrigins = [window.location.origin, new URL(base, window.location.origin).origin];
  if (import.meta.env.VITE_DIRECT_BACKEND_URL) allowedOrigins.push(new URL(import.meta.env.VITE_DIRECT_BACKEND_URL).origin);
  if (target.pathname.startsWith('/uploads/') && allowedOrigins.includes(target.origin)) {
    const response = await fetch(target.href, { headers: await authHeaders() });
    if (!response.ok) throw new Error('Unable to access this report');
    const blobUrl = URL.createObjectURL(await response.blob());
    // Previews and download links need a URL; release the temporary bytes after use.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
    return blobUrl;
  }
  if (!/^https?:\/\//i.test(url)) return url;
  const location = documentLocation(url);
  if (!location) return url;
  return getPatientDocSignedUrl(location.bucket, url, 300, patientId);
}
