/**
 * Clinic Logo Service — extract a clinic's logo from an uploaded file and
 * resolve it again at report-generation time.
 *
 * Upload side: admins upload the logo as a PDF (typically an A4 page that is
 * mostly white with the logo somewhere on it) or as a PNG/JPG. We render the
 * PDF's first page, auto-crop to the non-white content bounding box, store the
 * PNG in the `clinic-logos` bucket and save the public URL on clinics.logo_url.
 *
 * Report side: the logo is NEVER looked up from stored state. The generation
 * request must carry the logoUrl returned by the upload in the SAME admin
 * session; resolveLogoUrlToPath(logoUrl) downloads that PNG to a temp file for
 * PDFKit / data-URI embedding. No upload → no logoUrl → reports keep the
 * default NeuroSense logo. Every failure returns null — reports must never
 * fail because of the logo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRoutedClient } = require('../dbRouter');

// Routed per-request (prod vs staging by origin); plain prod client otherwise.
const supabase = createRoutedClient();

const LOGO_BUCKET = 'clinic-logos';

/** Render page 1 of a PDF to a PNG buffer. pdf-to-img is ESM-only → dynamic import. */
async function renderPdfFirstPage(pdfPath) {
  const { pdf } = await import('pdf-to-img');
  const document = await pdf(pdfPath, { scale: 3 });
  for await (const image of document) {
    return image; // PNG buffer of page 1
  }
  return null;
}

/**
 * Crop a PNG buffer to the bounding box of its non-white, non-transparent
 * pixels (plus a small margin). Returns the cropped PNG buffer, or the
 * original when nothing to crop / canvas unavailable.
 */
function cropToContent(pngBuffer) {
  let createCanvas, loadImage;
  try {
    ({ createCanvas, loadImage } = require('canvas'));
  } catch (e) {
    console.warn('clinicLogo: canvas unavailable, skipping auto-crop:', e.message);
    return Promise.resolve(pngBuffer);
  }
  return (async () => {
    const img = await loadImage(pngBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);

    // A pixel is "content" when it is visible and not near-white.
    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const a = data[i + 3];
        if (a < 16) continue;
        if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0 || maxY < 0) return pngBuffer; // blank page — keep as-is

    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04) + 2;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(img.width, maxX + pad + 1) - sx;
    const sh = Math.min(img.height, maxY + pad + 1) - sy;

    const out = createCanvas(sw, sh);
    out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return out.toBuffer('image/png');
  })();
}

/**
 * Extract the logo from an uploaded file (.pdf/.png/.jpg/.jpeg), store it in
 * the clinic-logos bucket and persist the URL on clinics.logo_url.
 * Returns { logoUrl } or throws with a user-presentable message.
 */
async function setClinicLogoFromUpload(filePath, originalName, clinicId) {
  if (!supabase) throw new Error('Storage not configured');
  const ext = path.extname(originalName || filePath).toLowerCase();

  let pngBuffer;
  if (ext === '.pdf') {
    const rendered = await renderPdfFirstPage(filePath);
    if (!rendered) throw new Error('Could not read a page from the uploaded PDF');
    pngBuffer = await cropToContent(rendered);
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    pngBuffer = await cropToContent(fs.readFileSync(filePath));
  } else {
    throw new Error('Upload the logo as a PDF, PNG or JPG file');
  }

  const storagePath = `report-logos/${clinicId}.png`;
  const { error: upErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(storagePath, pngBuffer, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`Logo upload failed: ${upErr.message}`);

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(storagePath);
  // Cache-bust so the admin UI preview and future report fetches see the new file.
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await supabase.from('clinics')
    .update({ logo_url: logoUrl })
    .eq('id', clinicId);
  if (dbErr) throw new Error(`Could not save logo on clinic: ${dbErr.message}`);

  console.log(`SUCCESS: clinic logo updated for ${clinicId} -> ${storagePath}`);
  return { logoUrl };
}

/**
 * Download a just-uploaded logo to a temp file for report generation. Only
 * accepts URLs inside our own public clinic-logos bucket — the URL comes from
 * the client request, so anything else is rejected.
 * Returns an absolute file path, or null (no/foreign URL, any error).
 */
async function resolveLogoUrlToPath(logoUrl) {
  try {
    const url = String(logoUrl || '').trim();
    if (!url || !supabaseUrl) return null;
    const allowedPrefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${LOGO_BUCKET}/`;
    if (!url.startsWith(allowedPrefix)) {
      console.warn('clinicLogo: rejected logoUrl outside clinic-logos bucket');
      return null;
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`clinicLogo: fetch ${resp.status} for ${url}`);
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) return null;
    const tmpPath = path.join(os.tmpdir(), `clinic-logo-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  } catch (e) {
    console.warn('clinicLogo: resolve failed:', e.message);
    return null;
  }
}

/** Same as resolveLogoUrlToPath but returns a data URI for HTML reports. */
async function resolveClinicLogoDataUri(logoUrl) {
  const p = await resolveLogoUrlToPath(logoUrl);
  if (!p) return null;
  try {
    const b64 = fs.readFileSync(p).toString('base64');
    fs.unlinkSync(p);
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

module.exports = { setClinicLogoFromUpload, resolveLogoUrlToPath, resolveClinicLogoDataUri };
