const axios = require('axios');
const GeminiService = require('./geminiService');

/**
 * Performance Report AI + rendering support.
 *
 * Gemini transcribes the qEEG PDF values and writes the narrative. The Nexaproc
 * gateway remains responsible for learned-example storage and primary HTML-to-PDF
 * rendering, with local Puppeteer as the existing render fallback.
 *
 * Neuro's backend is the "sidecar": the browser never talks to the VPS
 * directly — it calls our route, which forwards to the gateway here.
 */

const GATEWAY_URL = process.env.NEXAPROC_GATEWAY_URL || 'http://187.127.176.1/neuro-sidecar';
const MASTER_KEY = process.env.NEXAPROC_MASTER_KEY || '';
// Gateway caps the JSON body at 1MB; keep the extracted text well under it.
const MAX_TEXT_CHARS = 200000;

/**
 * Build the doctor-readable narrative prompt from the deterministic report data.
 * Gemini writes ONLY prose — it must echo every number exactly as given and never
 * recompute or invent values.
 */

// Verbatim prose excerpts from Sagar Ahiwale's real report — used as the hardcoded style reference.
// Gemini matches this style/tone/structure; it does NOT copy these numbers for new patients.
const SAGAR_TEMPLATE_EXAMPLE = `PATIENT: Sagar Ahiwale | Brain Type: Cautious (Type 5) | Date: 17 Mar 2026

snapshotSummary: "A quick view of where you stand right now. Your stress regulation is exceptional and your cognitive engine runs strong, but your nervous system is sitting on a high arousal baseline — the signature of a driven, vigilant brain that doesn't fully switch off."

topStrength:
  title: "Excellent stress regulation"
  points:
    - "Your brain activates and deactivates the stress response cleanly — pressure does not break you."
    - "Healthy alpha peak frequency (11.6 Hz) supports clear thinking and learning."

watchZone:
  title: "Low recovery capacity"
  points:
    - "Low recovery capacity (Regeneration 20%). Your brain runs hot but doesn't fully cool down at rest."
    - "Right-shifted frontal alpha asymmetry suggests overthinking and worry tendency."

brainTypeReason:
  - "Right-shifted frontal alpha asymmetry (-9.97) — associated with stress vigilance, emotional monitoring, and 'what could go wrong' thinking. A core marker of the Cautious type."
  - "High arousal score (2.24) with low relaxation (2.47) — the nervous system is on, even at rest. Strongly correlates with Cautious-type SPECT findings of overactive basal ganglia and amygdala."
  - "Excellent stress regulation (100%) with elevated beta — you don't crumble under pressure; you channel it. This is the Persistent overlay: driven, thorough, follows through."
  - "Healthy cognition and alpha peak — rules out a low-PFC pattern (Type 2 / Spontaneous)."

brainwaveIntro: "Your brain produces five distinct rhythms simultaneously, each tied to a different mental state. The mix tells us what kind of brain you have. Below is your relative power across the spectrum, recorded in the eyes-closed condition."

brainwaveCards:
  - title: "Strong, healthy alpha peak (11.6 Hz)"
    body: "Your alpha rhythm peaks where it should — in the upper-alpha range. This supports good cognitive processing, working memory, and the ability to enter 'relaxed focus.' It's a real asset."
  - title: "Elevated beta & hi-beta"
    body: "Higher fast-wave activity suggests the brain is constantly 'on' — running thoughts, scanning for problems, planning. Productive in short bursts; depleting when sustained."
  - title: "Moderate theta — well-regulated"
    body: "Theta sits at a healthy level (16%). Not so high that you drift into mental fog; not so low that creativity is starved. The Alpha:Theta balance is in a strong zone for memory and learning."
  - title: "Delta — borderline, watch this"
    body: "Daytime delta of 22% is on the higher end of normal. Combined with low regeneration (20%), it suggests recovery debt. Sleep quality may need a closer look."

performance.cognition: "Solid cognitive engine. Memory, learning, and reasoning all working well, with room to optimize. Healthy alpha peak (11.6 Hz) and balanced alpha:theta ratio support clear thinking."
performance.stress: "A standout strength. Your brain activates and deactivates the stress response cleanly. You stay clear-headed under pressure — most Cautious-type brains struggle here, yours doesn't."
performance.focus: "Good baseline focus. The risk for your type is that vigilance pulls attention sideways — onto worries rather than the task. Pomodoro intervals will help anchor you."
performance.burnout: "Mild burnout markers. You're managing — but recovery isn't keeping pace with output. Combined with low regeneration, this is the metric to watch."

performanceFeature: "This is unusual and worth understanding. Cautious-type brains typically show poor stress regulation because the limbic system is overactive. Your data is different — and that matters. Your high arousal (2.24) sits alongside high stress regulation (100%). The interpretation: you're not overwhelmed by stress, you're fueled by it. You've learned, somewhere along the way, to convert anxious energy into productive action. This is the Persistent overlay in your profile — the strong-willed, finish-the-thing wiring. The catch: burning rocket fuel works until it doesn't. Without active recovery, the same arousal that powers your performance becomes the source of insomnia, irritability, and eventual burnout. Your job isn't to lower your drive — it's to add the recovery your current system is missing."

innerBandwidth.emotional: "The right-frontal alpha asymmetry (-9.97) suggests you experience heightened reactivity and slower emotional recovery. This is common in Cautious-brain types."
innerBandwidth.learning: "Good. Your alpha peak and alpha:theta balance support memory consolidation. Spaced repetition and active recall will work very well for you."
innerBandwidth.creativity: "Creativity needs an open, low-arousal mode. Your high-beta dominance keeps the brain in execute-mode. Daily downtime unlocks this."
innerBandwidth.link: "Emotional regulation, creative thinking, and durable learning all depend on the same underlying state: low arousal + alert alpha. When your nervous system is running hot, all three drop. When you give the brain real recovery, all three rise — usually together. This is why the action plan focuses on calming, not on adding more."

deepDive.alphaPeak: "A slightly fast but healthy alpha peak. Supports rapid information processing and clear thinking. This is real cognitive horsepower."
deepDive.arousal: "Your nervous system is on a high-alert baseline. This is what powers your drive — and what blocks recovery. Lowering this is the central goal."
deepDive.relaxation: "Difficulty entering and holding the relaxed state. Mirrors the high arousal score — two sides of the same coin. Breathwork and HRV training are direct interventions."
deepDive.regeneration: "The single most important number on this page. Your brain isn't recovering as fast as it's working. Protect sleep. Add daily downtime. Non-negotiable."
deepDive.frontalAsymmetry: "Right-frontal dominance suggests heightened threat-monitoring and overthinking — a Cautious-type signature. Goal-activation routines build the left side back up."
deepDive.daytimeDelta: "Slightly elevated but within normal range. Combined with low regeneration, points to recovery debt rather than a primary issue. Sleep optimization addresses both."
deepDive.readingPattern: "No single metric tells the story — look at the pattern: high arousal + low relaxation + low regeneration + right-frontal alpha asymmetry — the classic Cautious-brain signature."

plan.intro: "Your 30-day plan targets your core pattern: a nervous system that runs hot, recovers slowly, and channels energy well. Small daily inputs compound fast when they're type-specific."
plan.after30: "Regeneration and relaxation scores typically shift first — expect clearer mornings and easier wind-downs within 2-3 weeks. Emotional regulation and creativity follow as your baseline arousal lowers."

closing: "You are starting from a position of real strength. Your brain type has genuine advantages — reliability, focus under fire, follow-through. The work ahead isn't about fixing what's broken; it's about adding recovery to an already high-performing system. Your 30-day plan is the lever. Pull it consistently."`;

// The doctor-readable narrative JSON schema used by the Gemini narrative prompt.
const NARRATIVE_SCHEMA = `{
  "snapshotSummary": "2-3 sentences: where the patient stands overall, referencing the overall score and their standout strength + main watch-zone.",
  "topStrength": { "title": "short", "points": ["2 bullets grounded in the data"] },
  "watchZone": { "title": "short", "points": ["2 bullets grounded in the data"] },
  "brainTypeReason": ["3-4 bullets: the qEEG signatures that map to this brain type, each citing a real value"],
  "brainwaveIntro": "1-2 sentences introducing the relative-power profile (eyes-closed).",
  "brainwaveCards": [ { "title": "short", "body": "1-2 sentences" } ],
  "performance": { "cognition": "1-2 sentences", "stress": "1-2 sentences", "focus": "1-2 sentences", "burnout": "1-2 sentences" },
  "performanceFeature": "A short paragraph (3-4 sentences) on the single most clinically interesting finding.",
  "innerBandwidth": { "emotional": "1-2 sentences", "learning": "1-2 sentences", "creativity": "1-2 sentences", "link": "1-2 sentences on how the three move together." },
  "deepDive": { "alphaPeak": "1 sentence", "arousal": "1 sentence", "relaxation": "1 sentence", "regeneration": "1 sentence", "frontalAsymmetry": "1 sentence", "daytimeDelta": "1 sentence", "readingPattern": "1-2 sentences on the overall pattern." },
  "plan": { "intro": "1-2 sentences framing the 30-day plan.", "after30": "1-2 sentences on which markers shift first." },
  "closing": "2-3 sentences, encouraging and forward-looking."
}`;

function buildNarrativePrompt(reportData, learnedExamples = []) {
  const safe = JSON.stringify(reportData, null, 2);

  const learnedSection = learnedExamples.length > 0
    ? `\n=== ADDITIONAL LEARNED EXAMPLES (from real generated reports — match this style too) ===\n${learnedExamples.slice(0, 3).join('\n\n--- next example ---\n\n')}\n=== END LEARNED EXAMPLES ===\n`
    : '';

  return `You are a clinical neuroscience writer producing the narrative prose for a
"Neuro Performance Report" that a DOCTOR will read alongside a patient.

Below is a REFERENCE EXAMPLE showing exactly the style, tone, and level of detail required.
This is from a real Sagar Ahiwale Neuro Performance Report. Match this style exactly —
warm, clinical, grounded in the actual numbers, 1-3 sentences per field.
Do NOT copy the specific numbers from the example. Use only the numbers from this patient's data.

=== REFERENCE REPORT (Sagar Ahiwale — Cautious Brain, Type 5) ===
${SAGAR_TEMPLATE_EXAMPLE}
=== END REFERENCE ===${learnedSection}
Match the above and create a similar brain type report like sagar ahiwale performance report.
Do it on the similar lines only — do not change anything, read the data exactly as is.

You are given a JSON object with ALL the computed numbers and the patient's brain
type (from a deterministic qEEG algorithm). Your job is ONLY to write clear,
warm, clinically-grounded prose that explains these numbers.

ABSOLUTE RULES:
- NEVER change, round, or invent any number. Use the values exactly as provided.
- Do NOT add medical diagnoses or treatment claims. Wellness/educational tone.
- Write for an intelligent lay patient; a doctor should find it accurate.
- Keep each field concise (1-3 sentences unless a list is requested).
- Return PURE JSON only (no markdown, no code fences), matching this schema:

${NARRATIVE_SCHEMA}

Here is the report data for this patient:
${safe}`;
}

/**
 * Parse the gateway's wrapped CLI output into an object. With useJson:true the
 * JSON lands in `parsed`; otherwise raw text is in `stdout`. Returns {} on failure.
 */
function parseGatewayJson(responseData) {
  const data = responseData || {};
  if (data.parsed && typeof data.parsed === 'object' && !Array.isArray(data.parsed)) {
    return data.parsed;
  }
  const raw = data.stdout ?? data.result ?? data.output ?? (typeof data === 'string' ? data : '');
  if (raw && typeof raw === 'string') {
    let cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Fetch the last N saved report examples from the VPS for few-shot prompting.
 * Returns [] on any error — never blocks report generation.
 */
// Reports generated while the scoring bug was live described stress/burnout as
// "0% / zero regulation / critically low recovery". Those narratives were saved
// to the VPS example store and would otherwise be fed back as "match this style"
// few-shot examples, propagating the broken framing even after the numbers are
// fixed. Drop any such poisoned example before it reaches the prompt.
function isPoisonedExample(ex) {
  const s = typeof ex === 'string' ? ex : JSON.stringify(ex || '');
  return /zero stress regulation|stress regulation at 0|burnout resistance at 0|0%\s*means|critically low recovery/i.test(s);
}

async function fetchReportExamples() {
  if (!MASTER_KEY || !GATEWAY_URL) return [];
  try {
    const response = await axios.get(`${GATEWAY_URL}/api/report-examples`, {
      headers: { 'X-Nexaproc-Key': MASTER_KEY },
      timeout: 10000,
    });
    const examples = Array.isArray(response.data?.examples) ? response.data.examples : [];
    const clean = examples.filter((ex) => !isPoisonedExample(ex));
    if (clean.length !== examples.length) {
      console.warn(`[fetchReportExamples] dropped ${examples.length - clean.length} poisoned (0%-stress) example(s) from few-shot set`);
    }
    return clean;
  } catch (e) {
    console.warn('[fetchReportExamples] could not fetch examples:', e.message);
    return [];
  }
}

/**
 * Fire-and-forget: save a generated narrative as a learned example on the VPS.
 * Never throws — never blocks the caller.
 */
function saveReportExample(narrative, patient) {
  if (!MASTER_KEY || !GATEWAY_URL) return;
  // Never feed a broken 0%-stress narrative back into the learned-example store.
  if (isPoisonedExample(narrative)) {
    console.warn('[saveReportExample] skipped saving a poisoned (0%-stress) narrative as a learned example');
    return;
  }
  axios.post(
    `${GATEWAY_URL}/api/save-example`,
    { narrative, patient },
    { headers: { 'X-Nexaproc-Key': MASTER_KEY, 'Content-Type': 'application/json' }, timeout: 10000 }
  ).catch((e) => console.warn('[saveReportExample] failed to save example:', e.message));
}

/**
 * Ask Gemini for the report narrative blocks.
 * Fetches learned examples first for few-shot prompting; saves the result afterwards.
 * @param {object} reportData  Output of buildReportData().
 * @returns {Promise<object>}  Parsed narrative ({} on failure → template falls back).
 */
async function generateReportNarrative(reportData) {
  // Fetch previously-learned examples (fail-safe — returns [] on any error)
  const learnedExamples = await fetchReportExamples();

  const payload = buildNarrativePrompt(reportData, learnedExamples);

  // One retry when Gemini rejects the request with 429. Other failures keep the
  // existing best-effort behavior: the template falls back to framework copy.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await GeminiService.generateText(payload);
      const narrative = parseGatewayJson({ stdout: raw });

      // Fire-and-forget: save this narrative as a learned example for future reports
      saveReportExample(narrative, {
        name: reportData.patient?.name || 'Unknown',
        assessmentDate: reportData.patient?.assessmentDate || '',
        brainType: reportData.brainType?.name || '',
      });

      return narrative;
    } catch (err) {
      const status = err.status || err.response?.status;
      if (attempt === 0 && status === 429) {
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Read an ALREADY-GENERATED brain/qEEG report's text and TRANSCRIBE its numbers
 * verbatim into the `source` object. We never recompute — the uploaded report
 * already prints these values; Gemini only transcribes them. The doctor-readable
 * prose is fetched separately via generateReportNarrative.
 * @param {string} pdfText  Text extracted (pdf-parse) from the uploaded report.
 * @returns {Promise<object|null>}  The `source` object (or null on failure).
 */
async function extractReportSource(pdfText) {
  const payload = `You are given the raw text of an EXISTING brain / qEEG performance report for a
single patient. It already prints the patient's scores and EEG metric values.

TRANSCRIBE the numbers EXACTLY as they appear. Do NOT compute, invert, infer, or
invent anything — just copy what is printed. If a value is not present, use null.
Return ONE pure JSON object (no markdown, no code fences, no prose):

{
  "patient": { "name": "<patient name or null>", "assessmentDate": "<date string or null>" },
  "overall": { "score": "<Overall Brain Health Score numerator 0-21 or null>", "percentage": "<overall percentage 0-100 or null>" },
  "markers": {
    "stressRegulation": <0-100 or null>,
    "cognition": <0-100 or null>,
    "focusAttention": <0-100 or null>,
    "learning": <0-100 or null>,
    "burnoutResistance": <0-100 or null>,
    "emotionalRegulation": <0-100 or null>,
    "creativity": <0-100 or null>
  },
  "deepDive": {
    "alphaPeak": <Hz or null>,
    "arousal": <number or null>,
    "relaxation": <number or null>,
    "regeneration": <percent or null>,
    "frontalAsymmetry": <number, keep sign, or null>,
    "daytimeDelta": <percent or null>,
    "focusScore": <Focus Score (Theta:Beta) ratio number, e.g. 1.20, or null>,
    "alphaTheta": { "fz": <ratio number or null>, "cz": <ratio number or null>, "pz": <ratio number or null> }
  },
  "brainwave": { "delta": <% or null>, "theta": <% or null>, "alpha": <% or null>, "beta": <% or null>, "hiBeta": <% or null>, "alphaPeakHz": <Hz or null> }
}

Rules:
- "overall" is the Overall Brain Health Score printed on the report (e.g.
  "Overall Brain Health Score: 14/21 (67%)"). Copy the numerator into "score"
  and the percentage into "percentage" exactly as printed. If absent, use null.
- "markers" are the seven performance percentages exactly as shown on the report's
  snapshot/markers pages (e.g. "Stress Regulation 100%", "Cognition 67%", "Burnout
  Resistance 67%", "Emotional Regulation 33%"). Copy the number shown — do NOT invert
  or recompute. If the report shows a 0-3 score instead of a %, convert 3→100, 2→67,
  1→33, 0→0.
- "deepDive" values are raw numbers wherever they appear (Alpha Peak in Hz, Arousal,
  Relaxation, Regeneration %, Frontal Alpha Asymmetry keeping its +/- sign, Daytime
  or Excessive Delta %).
- "focusScore" is the single "Focus Score (Theta:Beta)" ratio printed on the report
  (e.g. 1.20). "alphaTheta" is the Alpha:Theta Balance printed as "Fz: .., Cz: .., Pz: .."
  — copy each channel's number into fz/cz/pz. If the report prints only
  "Indeterminate"/"Normal"/"Abnormal" with no per-channel numbers, set "alphaTheta" to null.
  Copy verbatim; never compute.

Here is the report text:
${pdfText}`;

  const raw = await GeminiService.generateText(payload);
  const parsed = parseGatewayJson({ stdout: raw });
  // The extraction IS the object; tolerate a {source:{...}} wrapper too.
  if (parsed && (parsed.markers || parsed.deepDive)) return parsed;
  if (parsed && parsed.source) return parsed.source;
  return null;
}

/**
 * Render an HTML string to a PDF Buffer using the Puppeteer Chrome installed on
 * THIS backend at build time (`npx puppeteer browsers install chrome`, cached in
 * PUPPETEER_CACHE_DIR). Used as the fallback when the VPS render endpoint is
 * down. The 12-page report template is authored for A4 portrait, margin 0, with
 * printBackground (see templates/brainReport12Page.js).
 * @param {string} html  Complete HTML document string.
 * @returns {Promise<Buffer>}  PDF bytes.
 */
async function renderHtmlLocally(html) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Render a fully-built HTML string to a PDF, VPS-first with a local fallback.
 * Primary: the VPS gateway's headless Chromium (keeps this free-tier backend
 * light). Fallback: if the VPS render is unavailable (e.g. its Chromium worker
 * is down → nginx 502), render locally with this backend's bundled Puppeteer so
 * a VPS outage doesn't break report generation.
 * @param {string} html  Complete HTML document string.
 * @returns {Promise<Buffer>}  PDF bytes.
 */
async function renderHtmlOnVps(html) {
  if (MASTER_KEY) {
    const opts = {
      headers: { 'X-Nexaproc-Key': MASTER_KEY, 'Content-Type': 'application/json' },
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      responseType: 'arraybuffer',
    };
    try {
      const response = await axios.post(`${GATEWAY_URL}/api/html-to-pdf`, { html }, opts);
      return Buffer.from(response.data);
    } catch (err) {
      console.warn(`[renderHtmlOnVps] VPS render failed (${err.response?.status || ''} ${err.message}); falling back to local Puppeteer render.`);
    }
  }
  try {
    return await renderHtmlLocally(html);
  } catch (localErr) {
    throw new Error(`PDF render failed (VPS unavailable and local Puppeteer render failed: ${localErr.message}).`);
  }
}

/**
 * Fire-and-forget: post an error lesson to the VPS gateway so Claude CLI
 * learns from it via CLAUDE.md on the next invocation. Never throws.
 */
function postLesson(stage, error, lesson) {
  if (!MASTER_KEY || !GATEWAY_URL) return;
  axios.post(
    `${GATEWAY_URL}/api/report-lesson`,
    { stage, error: String(error).slice(0, 300), lesson },
    { headers: { 'X-Nexaproc-Key': MASTER_KEY, 'Content-Type': 'application/json' }, timeout: 5000 }
  ).catch((e) => console.warn('[postLesson] failed to save lesson:', e.message));
}

module.exports = {
  generateReportNarrative,
  extractReportSource,
  renderHtmlOnVps,
  postLesson,
  fetchReportExamples,
  saveReportExample,
  GATEWAY_URL,
};
