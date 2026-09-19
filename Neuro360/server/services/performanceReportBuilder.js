/**
 * Report orchestrator — turns the deterministic qEEG report data into the
 * polished 12-page "Brain Type & Performance Report" PDF.
 *
 *   reportData (numbers, from algorithmCalculator + buildReportData)
 *      → Gemini narrative (prose only)
 *      → PDF render
 *
 * Renderers (PDF_RENDERER env, see render.yaml):
 *   'pdfkit'    (default) pure-JS PDFKit — NO Chromium, tiny memory footprint.
 *               The 512MB Render free tier cannot fit Node + Chromium: renders
 *               froze/killed the whole instance mid-PDF. This mode is immune.
 *   'puppeteer' the reference HTML/CSS layout rendered by Chromium — pixel-
 *               perfect, but needs ~600MB+ total. Enable ONLY after upgrading
 *               the Render plan; the route re-enables the engine warm-up stage
 *               automatically in this mode.
 *
 * Gemini never computes or alters numbers — see performanceReportService.generateReportNarrative.
 */

const { generateReportNarrative, renderReportHtmlToPdf, postLesson } = require('./performanceReportService');
const { renderReportHtml } = require('../templates/brainReport12Page');
const { inlineEmojis } = require('../utils/inlineEmojis');
const { renderReportDataToPdf } = require('./performanceReportPdfKit');

const RENDERER_MODE = process.env.PDF_RENDERER === 'puppeteer' ? 'puppeteer' : 'pdfkit';

/**
 * Whether the chosen renderer needs the Chromium engine warm-up stage.
 * PDFKit needs no engine — the route skips the warm-up entirely in that mode.
 */
function engineWarmupRequired() {
  return RENDERER_MODE === 'puppeteer';
}

/**
 * @param {object} reportData  Output of buildReportData() (numbers + brain type).
 * @param {object} [narrative] Pre-fetched narrative. If provided, the internal
 *   narrate call is skipped (used by the upload path, where extraction + narrative
 *   come from a single gateway call). If omitted, the narrative is fetched here.
 * @param {function} [onProgress] Optional callback fired with a stage key
 *   ('narrative' | 'render') just before that step starts, so callers can stream
 *   live progress. No-op if omitted.
 * @param {function} [onQueueUpdate] Optional callback fired with the render
 * queue position while waiting for a Puppeteer slot.
 * @returns {Promise<{ pdf: Buffer, narrative: object }>}
 */
async function generateBrainReportPdf(reportData, narrative, onProgress, onQueueUpdate) {
  if (!reportData || !reportData.brainType || !reportData.patient) {
    throw new Error('Invalid reportData: expected the structured object from buildReportData().');
  }

  // Narrative is best-effort — the template falls back to framework copy if it's
  // missing, so a Claude hiccup never blocks the report.
  let prose = narrative && typeof narrative === 'object' ? narrative : null;
  if (!prose) {
    try {
      if (typeof onProgress === 'function') onProgress('narrative');
      prose = await generateReportNarrative(reportData);
    } catch (e) {
      console.warn('[Performance Report] Narrative generation failed, using framework defaults:', e.message);
      postLesson('narrative', e.message,
        `Narrative generation failed: "${e.message}". Ensure the JSON schema is followed exactly and output has no markdown fences.`);
      prose = {};
    }
  }

  if (typeof onProgress === 'function') onProgress('render');
  let pdf;
  if (RENDERER_MODE === 'puppeteer') {
    // Reference HTML/CSS layout rendered by Chromium (requires a bigger plan).
    // The renderer has its own PDF timeout and Chrome cleanup safeguards in
    // performanceReportService.
    const html = inlineEmojis(renderReportHtml(reportData, prose));
    pdf = await renderReportHtmlToPdf(html, onQueueUpdate);
  } else {
    // Default: pure-JS PDFKit render — no browser, no memory cliff.
    pdf = await renderReportDataToPdf(reportData, prose);
  }
  return { pdf, narrative: prose };
}

module.exports = { generateBrainReportPdf, engineWarmupRequired };
