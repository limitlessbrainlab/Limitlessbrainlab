export const MEDICAL_BUCKETS = ['patients_documents', 'neurosense-reports', 'patient-reports', 'edf-files', 'qeeg-uploads'];

export function documentLocation(value, defaultBucket = null) {
  if (typeof value !== 'string' || !value) throw new Error('Document path is required');
  let bucket = defaultBucket;
  let path = value;
  let origin = null;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match || !MEDICAL_BUCKETS.includes(match[1])) return null;
    bucket = match[1]; path = decodeURIComponent(match[2]); origin = url.origin;
  } else {
    const first = value.split('/')[0];
    if (MEDICAL_BUCKETS.includes(first)) { bucket = first; path = value.slice(first.length + 1); }
  }
  if (!MEDICAL_BUCKETS.includes(bucket) || !path || path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('Invalid document location');
  }
  return { bucket, path, origin };
}
