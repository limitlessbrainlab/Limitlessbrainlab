/**
 * Report orchestrator — turns the deterministic qEEG report data into the
 * polished 12-page "Brain Type & Performance Report" PDF.
 *
 *   reportData (numbers, from algorithmCalculator + buildReportData)
 *      → Gemini narrative (prose only)
 *      → 12-page HTML template (numbers filled deterministically)
 *      → Puppeteer renders the reference HTML/CSS layout to PDF
 *
 * Gemini never computes or alters numbers — see nexaprocService.generateReportNarrative.
 */

const { generateReportNarrative, renderReportHtmlToPdf, postLesson } = require('./nexaprocService');
const { renderReportHtml } = require('../templates/brainReport12Page');
const { inlineEmojis } = require('../utils/inlineEmojis');

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
      console.warn('[Claude Report] Narrative generation failed, using framework defaults:', e.message);
      postLesson('narrative', e.message,
        `Narrative generation failed: "${e.message}". Ensure the JSON schema is followed exactly and output has no markdown fences.`);
      prose = {};
    }
  }

  if (typeof onProgress === 'function') onProgress('render');
  // Use the original HTML/CSS template so the generated report matches the
  // approved 12-page reference PDF. The renderer has its own PDF timeout and
  // Chrome cleanup safeguards in nexaprocService.
  const html = inlineEmojis(renderReportHtml(reportData, prose));
  const pdf = await renderReportHtmlToPdf(html, onQueueUpdate);
  return { pdf, narrative: prose };
}

module.exports = { generateBrainReportPdf };
