const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const { sidecarAuth } = require('../middleware/sidecarAuth');
const { extractReportSource, postLesson, GATEWAY_URL } = require('../services/nexaprocService');
const { buildReportDataFromSource, buildReportDataFromNeuroSenseMd } = require('../services/claudeReportData');
const { buildNeuroSenseMarkdown } = require('../services/neurosenseMarkdown');
const { generateBrainReportPdf } = require('../services/claudeReportGenerator');
const SupabaseStorage = require('../services/supabaseStorage');

const router = express.Router();

// GET /api/qeeg/claude-report/health — proxy VPS sidecar health (no auth, read-only)
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${GATEWAY_URL}/health`, { timeout: 6000 });
    res.json({ ok: true, ...response.data });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

// Gateway caps the JSON body ~1MB; keep extracted text well under it.
const MAX_TEXT_CHARS = 200000;

// PDF upload to a temp file (text extracted, then deleted).
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `claude-report-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /api/qeeg/claude-report
 * Upload an ALREADY-GENERATED brain/qEEG report PDF (field "pdf"). We read its
 * text, have Gemini transcribe the numbers + write the narrative, build the
 * report data deterministically, and return the polished 12-page "Brain Type &
 * Performance Report" PDF. Auth: static long-lived CLAUDE_REPORT_TOKEN.
 */
// Human-readable label for each streamed stage (frontend shows these verbatim).
const STAGE_LABELS = {
  reading: 'Reading the document…',
  extract: 'Gemini is reading your numbers…',
  build: 'Building your report…',
  narrative: 'Gemini is writing your report…',
  render: 'Rendering the 12-page PDF…',
  saving: 'Saving your report…',
};
const STAGE_PCT = { reading: 10, extract: 25, build: 55, narrative: 60, render: 88, saving: 95 };

router.post('/', sidecarAuth, upload.single('pdf'), async (req, res) => {
  const tempPath = req.file?.path;

  // The "no file" guard stays plain JSON — emitted BEFORE we switch to SSE.
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A PDF file (field "pdf") is required.' });
  }

  // Switch the response to Server-Sent Events so the frontend can show live,
  // stage-by-stage progress instead of a featureless spinner. Once these headers
  // are flushed we can no longer set an HTTP status, so ALL outcomes (including
  // errors) travel as `event:` frames; the client treats `error`/no-`done` as failure.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (Render/nginx) so events stream live
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* client gone — ignore */ }
  };
  const progress = (stage) => send('progress', { stage, label: STAGE_LABELS[stage], pct: STAGE_PCT[stage] });

  // Keep the connection alive through the long (30-60s) Gemini calls so the
  // proxy doesn't drop an idle stream.
  const heartbeat = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch (_) { /* ignore */ }
  }, 15000);
  let clientGone = false;
  req.on('close', () => { clientGone = true; clearInterval(heartbeat); });

  try {
    // Extract the uploaded report's text (fast; the values are textual).
    progress('reading');
    let text;
    try {
      const parsed = await pdfParse(fs.readFileSync(tempPath));
      // Strip NUL bytes and other C0 control chars (except newline/tab) — pdf-parse
      // can emit \0 from certain PDFs and corrupt the model input.
      text = (parsed.text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    } catch (e) {
      throw new Error(`Failed to read the PDF: ${e.message}`);
    }
    if (!text) {
      throw new Error('No extractable text found in the PDF (it may be a scanned image).');
    }
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);

    // Call 1: transcribe the numbers off the uploaded report (fast, small output).
    progress('extract');
    const source = await extractReportSource(text);

    let algorithmResults = null;
    if (req.body && req.body.algorithmResults) {
      try { algorithmResults = JSON.parse(req.body.algorithmResults); } catch (_) { algorithmResults = null; }
    }

    const patientMeta = {
      name: (req.body && req.body.patientName) || undefined,
      clinicName: (req.body && req.body.clinicName) || undefined,
      id: (req.body && req.body.patientId) || undefined,
      // Upload/creation date of the source NeuroSense report — makes the
      // Performance report's Date of Assessment match the NeuroSense report,
      // and feeds the "Report generated on … by <patientId>" cover line.
      assessmentDate: (req.body && req.body.assessmentDate) || undefined,
      processedAt: (req.body && req.body.assessmentDate) || undefined,
      generatedAt: (req.body && req.body.generatedAt) || undefined,
    };

    // Deterministic build. The performance report imports EVERY value verbatim
    // from the NeuroSense report: the transcribed numbers are written into a
    // NeuroSense-values Markdown document, then buildReportDataFromNeuroSenseMd
    // copies them out as-is — no re-bucketing of gauge percentages, no overall
    // averaging, no status re-derivation. (buildReportDataFromSource is kept as
    // a fallback only if the MD path ever throws.)
    progress('build');
    let reportData;
    try {
      const neurosenseMd = buildNeuroSenseMarkdown(source, algorithmResults, patientMeta);
      console.log('[Claude Report] NeuroSense values Markdown:\n' + neurosenseMd);
      reportData = buildReportDataFromNeuroSenseMd(neurosenseMd, patientMeta, algorithmResults);
    } catch (mdErr) {
      console.warn('[Claude Report] NeuroSense MD path failed, falling back to source build:', mdErr.message);
      reportData = buildReportDataFromSource(source, patientMeta, algorithmResults);
    }

    // Resolve the latest saved clinic logo so replacement uploads are used.
    const clinicLogoUrl = (req.body && req.body.clinicLogoUrl) || '';
    try {
      const { resolveClinicLogoToPath } = require('../services/clinicLogoService');
      const logoPath = await resolveClinicLogoToPath(req.body && req.body.clinicId, clinicLogoUrl);
      if (logoPath) {
        const fs = require('fs');
        reportData.patient.clinicLogoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;
        try { fs.unlinkSync(logoPath); } catch (_) { /* best effort cleanup */ }
        console.log('[Claude Report] 🎨 Using latest clinic logo');
      }
    } catch (logoErr) {
      console.warn('[Claude Report] Clinic logo resolution failed (using default):', logoErr.message);
    }

    // Call 2 (inside): fetch the doctor-readable narrative, then render to PDF.
    // onProgress fires 'narrative' then 'render' from inside the generator.
    let { pdf } = await generateBrainReportPdf(reportData, undefined, progress);

    // Storage key + download name use the report id (e.g. NS-1773769 -> 1773769)
    // so files are short and unique per patient+assessment: NPR-<id>-<ts>.pdf.
    const reportIdDigits = String(reportData.patient.reportId || '').replace(/\D/g, '');
    const base = reportIdDigits
      ? `NPR-${reportIdDigits}`
      : (reportData.patient.name || req.file.originalname || 'report').replace(/[^a-z0-9]/gi, '-');

    // Stamp PDF Title metadata with the download name (NPR-<id>-<YYYYMMDD>.pdf,
    // same as the frontend's buildNprFilename) so the browser tab shows it
    // instead of "about:blank" when the file is opened. The VPS Chromium
    // renderer returns the PDF without any Title metadata. Best-effort only —
    // a stamping failure must never block the report.
    try {
      const { PDFDocument } = require('pdf-lib');
      const stampDate = patientMeta.generatedAt ? new Date(patientMeta.generatedAt) : new Date();
      const ymd = isNaN(stampDate.getTime())
        ? new Date().toISOString().slice(0, 10).replace(/-/g, '')
        : stampDate.toISOString().slice(0, 10).replace(/-/g, '');
      const pdfDoc = await PDFDocument.load(pdf);
      pdfDoc.setTitle(`${base}-${ymd}.pdf`);
      pdfDoc.setAuthor('Limitless Brain Lab');
      pdfDoc.setCreator('Limitless Brain Lab');
      pdf = Buffer.from(await pdfDoc.save());
    } catch (metaErr) {
      console.warn('[Claude Report] PDF title stamping failed (using unstamped PDF):', metaErr.message);
    }

    // Upload the generated PDF to the same 'neurosense-reports' bucket the QEEG
    // flow uses, then stream its public URL in the terminal `done` event. A
    // shareable URL lets the Claude report flow through the same addReport +
    // email path as NeuroSense. (uploadFile reads from disk, so write first.)
    progress('saving');
    const outPath = path.join(__dirname, '../uploads', `claude-report-out-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`);
    try {
      fs.writeFileSync(outPath, pdf);
      const uploadResult = await SupabaseStorage.uploadFile(outPath, 'neurosense-reports', `claude-reports/${base}-${Date.now()}.pdf`);
      if (!uploadResult || !uploadResult.url) {
        throw new Error('Supabase upload returned an invalid result');
      }
      console.log('🔗 Claude Report uploaded to Supabase:', uploadResult.url);
      send('done', { success: true, pdfUrl: uploadResult.url, reportId: reportData.patient.reportId });
    } finally {
      fs.unlink(outPath, () => {});
    }
  } catch (error) {
    console.error('[Claude Report] Error:', error.message);
    postLesson('report-generation', error.message,
      `Report generation failed: "${error.message}". Investigate root cause and prevent recurrence.`);
    if (!clientGone) send('error', { success: false, message: error.message });
  } finally {
    clearInterval(heartbeat);
    if (tempPath) fs.unlink(tempPath, () => {});
    try { res.end(); } catch (_) { /* ignore */ }
  }
});

module.exports = router;
