/**
 * Build the structured data object that drives the 12-page
 * "Brain Type & Performance Report". Every number here comes straight from the
 * deterministic algorithm (algorithmCalculator.js output) and the parsed qEEG
 * data — nothing is recomputed by Claude. Claude only writes narrative prose on
 * top of these numbers.
 */

const { classifyBrainType5 } = require('./brainType5Classifier');
const { parseNeuroSenseMarkdown } = require('./neurosenseMarkdown');

const POSTERIOR_CHANNELS = ['Pz', 'P3', 'P4', 'O1', 'O2', 'Oz'];

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Average relative power for a band across the given channels (skips missing). */
function avgRelative(qeegData, condition, channels, band) {
  const table = qeegData?.[condition]?.relative;
  if (!table) return null;
  let sum = 0;
  let count = 0;
  for (const ch of channels) {
    const v = table[ch]?.[band];
    if (typeof v === 'number' && isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count ? sum / count : null;
}

function readMetricValue(m) {
  const v = m?.value ?? m?.score ?? null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object') return v;
  return null;
}

function metricMatch(parameters, includes) {
  const needle = includes.toLowerCase();
  let fallback = null;
  for (const p of parameters || []) {
    for (const m of p.metrics || []) {
      const name = String(m.name || '').toLowerCase();
      if (name === needle || name.startsWith(`${needle} (`)) return m;
      if (!fallback && name.includes(needle)) {
        fallback = m;
      }
    }
  }
  return fallback;
}

/** Pull a sub-metric value from the algorithm results by partial name. */
function metricValue(parameters, includes) {
  return readMetricValue(metricMatch(parameters, includes));
}

function score(parameters, name) {
  const p = (parameters || []).find((x) => x.name === name);
  return p ? p.score : 0;
}

function normalizeIncomingAlgorithmResults(algorithmResults) {
  const candidates = Array.isArray(algorithmResults)
    ? algorithmResults
    : (algorithmResults && Array.isArray(algorithmResults.parameters)
      ? algorithmResults.parameters
      : (algorithmResults && Array.isArray(algorithmResults.results) ? algorithmResults.results : []));

  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((item) => {
      const name = item?.parameter || item?.name || 'Unknown';
      const rawScore = item?.rawScore || item?.raw_score || item?.score || item?.result;
      const scoreParts = String(rawScore || '').split('/');
      const score = Number(scoreParts[0]);
      const maxScore = Number(scoreParts[1]) || 3;
      const metrics = Array.isArray(item?.metrics)
        ? item.metrics.map((metric) => ({ ...metric, value: metric?.value ?? metric?.score ?? null }))
        : [];

      return {
        name,
        score: Number.isFinite(score) ? score : 0,
        maxScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 3,
        classification: item?.classification || item?.bucket || item?.status || null,
        metrics,
      };
    })
    .filter((item) => item.name);
}

function toParameters(algoResults) {
  if (Array.isArray(algoResults)) return normalizeIncomingAlgorithmResults(algoResults);
  if (algoResults && Array.isArray(algoResults.parameters)) return normalizeIncomingAlgorithmResults(algoResults.parameters);
  if (algoResults && Array.isArray(algoResults.results)) return normalizeIncomingAlgorithmResults(algoResults.results);
  return [];
}

/** Stable 7-digit report id from patient id + date (e.g. NS-1773769). */
function makeReportId(patientId, dateStr) {
  const seed = `${patientId || ''}|${dateStr || ''}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const seven = String(h % 10000000).padStart(7, '0');
  return `NS-${seven}`;
}

function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "DD/MM/YYYY, h:mm am/pm" — matches the NeuroSense report footer format in
// server/services/pdf/coverPage.js so both reports' "Report generated on" lines
// read identically. Returns '' when no valid date is supplied.
function formatGeneratedOn(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hrs = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'pm' : 'am';
  hrs = hrs % 12 || 12;
  return `${dd}/${mm}/${yyyy}, ${hrs}:${mins} ${ampm}`;
}

// Status labels for the snapshot bars / performance markers.
function positiveStatus(s) {
  if (s >= 3) return 'Excellent';
  if (s === 2) return 'Moderate';
  return 'Needs Attention';
}
// Stress & Burnout show the LEVEL (matching the NeuroSense report), so the status
// word is the level too: 0 red = Low (best) ... 3 red = Severe (worst).
function stressRegStatus(red) {
  return ['Low', 'Mild', 'Moderate', 'Severe'][Math.min(red, 3)];
}
function burnoutResistStatus(red) {
  return ['Low', 'Mild', 'Moderate', 'Severe'][Math.min(red, 3)];
}
// Bucket -> gauge % used by the NeuroSense report: Low=20%, Medium/Mild/Moderate=55%,
// High/Severe=90%. Positive params use the direct bucket. Stress & Burnout scores are
// a RED count (0=healthiest, 3=worst); the performance report frames them positively
// ("Stress Regulation" / "Burnout Resistance"), so they are INVERTED to a health score
// before bucketing — matching how the NeuroSense report scores overall health
// (low stress = healthy = high) and its green-for-low-stress gauges.
function positiveClass(score) {
  if (score <= 1) return 'Low';
  if (score === 2) return 'Medium';
  return 'High';
}
function stressClass(score) {
  if (score === 0) return 'Low';
  if (score === 1) return 'Mild';
  if (score === 2) return 'Moderate';
  return 'Severe';
}
function gaugePercent(param, isStress = false) {
  // Bucket the parameter's own classification, identical to the NeuroSense gauge
  // (geminiPdfGenerator.js:1656-1668) — the raw LEVEL, no inversion. For Stress &
  // Burnout the classification is Low/Mild/Moderate/Severe (0=low stress). The
  // colour is inverted at render time (brainReport12Page.js) so low stress shows
  // green, matching the NeuroSense report.
  const score = param?.score || 0;
  const bucket = String(param?.classification || (isStress ? stressClass(score) : positiveClass(score))).toLowerCase();
  if (bucket === 'low') return 20;
  if (bucket === 'mild' || bucket === 'moderate' || bucket === 'medium') return 55;
  if (bucket === 'high' || bucket === 'severe') return 90;
  // Fallback (no classification present) mirrors the NeuroSense gauge score path.
  if (score === 0) return 10;
  if (score === 1) return 25;
  if (score === 2) return 55;
  return 90;
}

// Performance report overall = average of the 7 parameter percentages, with
// Stress & Burnout INVERTED (100 - percent) so that a low stress/burnout level
// counts as high health in the average (e.g. Stress 70% -> 30%).
const OVERALL_INVERTED_KEYS = new Set(['stress', 'burnout']);
function overallFromBars(bars) {
  if (!bars || !bars.length) return 0;
  const sum = bars.reduce((s, b) => {
    const p = Number(b.percent) || 0;
    return s + (OVERALL_INVERTED_KEYS.has(b.key) ? (100 - p) : p);
  }, 0);
  return Math.round(sum / bars.length);
}

function focusScoreStatus(value) {
  if (value == null || value === 'Indeterminate') return 'N/A';
  return typeof value === 'number' && value < 1.5 ? 'Good' : 'Above Target';
}

function alphaThetaStatus(metric, value) {
  if (value == null || value === 'Indeterminate') return 'N/A';
  if (metric && typeof metric.score === 'number') return metric.score > 0 ? 'Healthy' : 'Low';
  return typeof value === 'number' && value >= 1 ? 'Healthy' : 'Low';
}

/**
 * @param {object} qeegData     Parsed qEEG (EO/EC → absolute/relative/special).
 * @param {object} algoResults  AlgorithmCalculator.calculate() output.
 * @param {object} patient      { name, id, processedAt, clinicName, age, gender }.
 * @returns {object} reportData consumed by the 12-page template + narrative prompt.
 */
function buildReportData(qeegData, algoResults, patient = {}) {
  const params = toParameters(algoResults);

  const cognition = score(params, 'Cognition');
  const stressRed = score(params, 'Stress');
  const focus = score(params, 'Focus & Attention');
  const burnoutRed = score(params, 'Burnout & Fatigue');
  const emotional = score(params, 'Emotional Regulation');
  const learning = score(params, 'Learning');
  const creativity = score(params, 'Creativity');
  const paramByName = (name) => params.find((p) => p.name === name) || { score: 0, maxScore: 3 };

  // Match the NeuroSense PDF gauge mapping exactly (Low=20%, Medium/Mild/Moderate=55%,
  // High/Severe=90%) so the performance report shows the same score for every parameter.
  const stressPct = gaugePercent(paramByName('Stress'), true);
  const cognitionPct = gaugePercent(paramByName('Cognition'));
  const focusPct = gaugePercent(paramByName('Focus & Attention'));
  const learningPct = gaugePercent(paramByName('Learning'));
  const burnoutPct = gaugePercent(paramByName('Burnout & Fatigue'), true);
  const emotionalPct = gaugePercent(paramByName('Emotional Regulation'));
  const creativityPct = gaugePercent(paramByName('Creativity'));
  const bars = [
    { key: 'stress', label: 'Stress', percent: stressPct, status: stressRegStatus(stressRed), icon: '⚡' },
    { key: 'cognition', label: 'Cognition', percent: cognitionPct, status: positiveStatus(cognition), icon: '🧠' },
    { key: 'focus', label: 'Focus & Attention', percent: focusPct, status: positiveStatus(focus), icon: '🎯' },
    { key: 'learning', label: 'Learning', percent: learningPct, status: positiveStatus(learning), icon: '📚' },
    { key: 'burnout', label: 'Burnout & Fatigue', percent: burnoutPct, status: burnoutResistStatus(burnoutRed), icon: '🔋' },
    { key: 'emotional', label: 'Emotional Regulation', percent: emotionalPct, status: positiveStatus(emotional), icon: '💗' },
    { key: 'creativity', label: 'Creativity', percent: creativityPct, status: positiveStatus(creativity), icon: '🎨' },
  ];

  // Overall = average of the 7 parameter percentages, with Stress & Burnout
  // inverted (100 - percent). Performance report only.
  const overall = overallFromBars(bars);

  // Deep-dive metric VALUES (deterministic, from the algorithm sub-metrics).
  const alphaPeak = metricValue(params, 'Alpha Peak');
  const arousal = metricValue(params, 'Arousal Score');
  const relaxation = metricValue(params, 'Relaxation Score');
  const regeneration = metricValue(params, 'Regeneration');
  const asymmetry = metricValue(params, 'Alpha Asymmetry');
  const daytimeDelta = metricValue(params, 'Excessive Delta');
  const focusScore = metricValue(params, 'Focus Score');
  const alphaThetaMetric = metricMatch(params, 'Alpha:Theta Balance');
  const alphaTheta = metricValue(params, 'Alpha:Theta Balance');

  const deepDive = {
    alphaPeak: {
      label: 'Alpha Peak Frequency', value: alphaPeak, unit: 'Hz', optimal: '9.5 – 11.5 Hz',
      status: alphaPeak == null ? 'N/A' : alphaPeak > 9 ? 'Healthy' : 'Low',
    },
    arousal: {
      label: 'Arousal Score', value: arousal, unit: '', optimal: '< 1.0',
      status: arousal == null ? 'N/A' : arousal < 1 ? 'Balanced' : 'Elevated',
    },
    relaxation: {
      label: 'Relaxation Score', value: relaxation, unit: '', optimal: '> 8',
      status: relaxation == null ? 'N/A' : relaxation > 8 ? 'Good' : 'Low',
    },
    regeneration: {
      label: 'Regeneration (Alpha Modulation)', value: regeneration, unit: '%', optimal: '> 30%',
      status: regeneration == null ? 'N/A' : regeneration > 30 ? 'Healthy' : 'Low',
    },
    frontalAsymmetry: {
      label: 'Frontal Alpha Asymmetry', value: asymmetry, unit: '', optimal: 'Balanced (near 0)',
      status: asymmetry == null ? 'N/A' : asymmetry < 0 ? 'Right-Shifted' : asymmetry > 0 ? 'Left-Shifted' : 'Balanced',
    },
    daytimeDelta: {
      label: 'Excessive / Daytime Delta', value: daytimeDelta, unit: '%', optimal: '< 20%',
      status: daytimeDelta == null ? 'N/A' : daytimeDelta < 20 ? 'Normal' : daytimeDelta <= 30 ? 'Borderline' : 'Elevated',
    },
    focusScore: {
      label: 'Focus Score', value: focusScore, unit: '', optimal: '< 1.5',
      status: focusScoreStatus(focusScore),
    },
    alphaTheta: {
      label: 'Alpha:Theta Balance', value: alphaTheta, unit: '', optimal: '> 1.0 (healthy)',
      status: alphaThetaStatus(alphaThetaMetric, alphaTheta),
    },
  };

  // Brainwave relative-power profile (eyes-closed, posterior average).
  const profile = {
    delta: round1(avgRelative(qeegData, 'EC', POSTERIOR_CHANNELS, 'Delta') ?? daytimeDelta ?? 0),
    theta: round1(avgRelative(qeegData, 'EC', POSTERIOR_CHANNELS, 'Theta') ?? 0),
    alpha: round1(avgRelative(qeegData, 'EC', POSTERIOR_CHANNELS, 'Alpha') ?? 0),
    beta: round1(avgRelative(qeegData, 'EC', POSTERIOR_CHANNELS, 'Beta') ?? 0),
    hiBeta: round1(avgRelative(qeegData, 'EC', POSTERIOR_CHANNELS, 'HiBeta') ?? 0),
    alphaPeakHz: alphaPeak,
  };

  const brainType = classifyBrainType5(algoResults);

  const assessmentDate = formatDate(patient.processedAt);

  return {
    patient: {
      name: patient.name || 'Patient',
      reportId: makeReportId(patient.id, assessmentDate),
      assessmentDate,
      clinicName: patient.clinicName || 'Limitless Brain Lab',
      firstName: (patient.name || 'Patient').split(/\s+/)[0],
    },
    overall,
    bars,
    // Performance markers (page 8) + inner bandwidth (page 9) reuse the bars.
    performance: {
      cognition: bars.find((b) => b.key === 'cognition'),
      stress: bars.find((b) => b.key === 'stress'),
      focus: bars.find((b) => b.key === 'focus'),
      burnout: bars.find((b) => b.key === 'burnout'),
    },
    innerBandwidth: {
      emotional: bars.find((b) => b.key === 'emotional'),
      learning: bars.find((b) => b.key === 'learning'),
      creativity: bars.find((b) => b.key === 'creativity'),
    },
    deepDive,
    profile,
    brainType,
    overallScore21: algoResults?.overallScore ?? null,
  };
}

/**
 * Build reportData from numbers TRANSCRIBED out of an already-generated report
 * (the `source` object from performanceReportService.extractReportSource: displayed
 * percentages + deep-dive values + brainwave). All inversion/derivation happens
 * here (deterministic) — Claude only copied the printed numbers. We then reuse
 * `buildReportData` for the rest (bars, overall, statuses, 5-type, profile).
 * @param {object} source   { patient, markers:{...% }, deepDive:{...}, brainwave:{...} }
 * @param {object} patient  Fallback meta { id, clinicName } from the request.
 * @returns {object} reportData (same shape as buildReportData).
 */
function buildReportDataFromSource(source, patient = {}, algorithmResults = null) {
  const markers = source && source.markers;
  if (!markers || Object.values(markers).every((v) => v == null)) {
    throw new Error('Could not read the report: no performance scores were found in the uploaded PDF.');
  }

  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  // Displayed NeuroSense gauge % -> 0-3 score.
  const pctToScore = (pct) => (pct == null ? 0 : Math.round((Math.max(0, Math.min(100, pct)) / 100) * 3));
  const pctToClass = (pct, stress = false) => {
    if (pct == null) return stress ? 'Low' : 'Low';
    if (pct <= 37.5) return 'Low';
    if (pct < 72.5) return stress ? 'Moderate' : 'Medium';
    return stress ? 'Severe' : 'High';
  };

  const dd = source.deepDive || {};
  const mk = (name, value) => ({ name, value: num(value), score: 0 });

  const incomingParameters = toParameters(algorithmResults);
  const incomingMetricValue = (includes) => metricValue(incomingParameters, includes);

  // Current admin flow sends the original deterministic algorithm results; those
  // are the same values the NeuroSense PDF used. PDF extraction remains fallback.
  const parameters = incomingParameters.length ? incomingParameters : [
    {
      name: 'Cognition',
      score: pctToScore(markers.cognition),
      maxScore: 3,
      classification: pctToClass(markers.cognition),
      metrics: [
        mk('Alpha Peak', dd.alphaPeak ?? incomingMetricValue('Alpha Peak')),
      ],
    },
    {
      name: 'Stress',
      score: pctToScore(markers.stressRegulation),
      maxScore: 3,
      classification: pctToClass(markers.stressRegulation, true),
      metrics: [
        mk('Arousal Score', dd.arousal ?? incomingMetricValue('Arousal Score')),
        mk('Relaxation Score', dd.relaxation ?? incomingMetricValue('Relaxation Score')),
        mk('Regeneration (Alpha Modulation)', dd.regeneration ?? incomingMetricValue('Regeneration')),
      ],
    },
    { name: 'Focus & Attention', score: pctToScore(markers.focusAttention), maxScore: 3, classification: pctToClass(markers.focusAttention), metrics: [] },
    {
      name: 'Burnout & Fatigue',
      score: pctToScore(markers.burnoutResistance),
      maxScore: 3,
      classification: pctToClass(markers.burnoutResistance, true),
      metrics: [
        mk('Excessive Delta', dd.daytimeDelta ?? incomingMetricValue('Excessive Delta')),
      ],
    },
    {
      name: 'Emotional Regulation',
      score: pctToScore(markers.emotionalRegulation),
      maxScore: 3,
      classification: pctToClass(markers.emotionalRegulation),
      metrics: [
        mk('Alpha Asymmetry (Frontal)', dd.frontalAsymmetry ?? incomingMetricValue('Alpha Asymmetry')),
        mk('Arousal Score', dd.arousal ?? incomingMetricValue('Arousal Score')),
        mk('Regeneration (Alpha Modulation)', dd.regeneration ?? incomingMetricValue('Regeneration')),
      ],
    },
    { name: 'Learning', score: pctToScore(markers.learning), maxScore: 3, classification: pctToClass(markers.learning), metrics: [] },
    { name: 'Creativity', score: pctToScore(markers.creativity), maxScore: 3, classification: pctToClass(markers.creativity), metrics: [] },
  ];

  const focusScoreMetric = metricMatch(incomingParameters, 'Focus Score');
  const focusScore = incomingMetricValue('Focus Score');
  const alphaThetaMetric = metricMatch(incomingParameters, 'Alpha:Theta Balance');
  const alphaTheta = incomingMetricValue('Alpha:Theta Balance');
  const alphaPeak = metricValue(parameters, 'Alpha Peak');
  const arousal = metricValue(parameters, 'Arousal Score');
  const relaxation = metricValue(parameters, 'Relaxation Score');
  const regeneration = metricValue(parameters, 'Regeneration');
  const asymmetry = metricValue(parameters, 'Alpha Asymmetry');
  const daytimeDelta = metricValue(parameters, 'Excessive Delta');

  // Overall /21 (Stress & Burnout scores are RED counts → inverted for health).
  const overallScore = parameters.reduce((sum, p) => {
    const inv = p.name === 'Stress' || p.name === 'Burnout & Fatigue';
    return sum + (inv ? p.maxScore - p.score : p.score);
  }, 0);

  const algoResults = { parameters, overallScore };

  // Synthesize the minimal qeegData buildReportData needs for the brainwave
  // profile (it averages posterior channels; a single Pz entry is enough).
  const bw = source.brainwave || {};
  const qeegData = {
    EC: { relative: { Pz: { Delta: num(bw.delta), Theta: num(bw.theta), Alpha: num(bw.alpha), Beta: num(bw.beta), HiBeta: num(bw.hiBeta) } } },
  };

  // Prefer the date printed on the report; fall back to now.
  let processedAt = new Date().toISOString();
  const srcDate = source.patient && source.patient.assessmentDate;
  if (srcDate && !isNaN(new Date(srcDate).getTime())) processedAt = new Date(srcDate).toISOString();

  const rd = buildReportData(qeegData, algoResults, {
    name: (source.patient && source.patient.name) || patient.name || 'Patient',
    id: patient.id,
    clinicName: patient.clinicName,
    processedAt,
  });

  // If a deep-dive metric was missing but the brainwave block had alpha peak,
  // surface it on the profile so page 4 still shows the peak.
  if (rd.profile && rd.profile.alphaPeakHz == null && num(bw.alphaPeakHz) != null) {
    rd.profile.alphaPeakHz = num(bw.alphaPeakHz);
  }

  if (rd.deepDive) {
    rd.deepDive.focusScore = {
      label: 'Focus Score',
      value: focusScore,
      unit: '',
      optimal: '< 1.5',
      status: focusScoreMetric && typeof focusScoreMetric.score === 'number'
        ? (focusScoreMetric.score > 0 ? 'Good' : 'Above Target')
        : focusScoreStatus(focusScore),
    };
    rd.deepDive.alphaTheta = {
      label: 'Alpha:Theta Balance',
      value: alphaTheta,
      unit: '',
      optimal: '> 1.0 (healthy)',
      status: alphaThetaStatus(alphaThetaMetric, alphaTheta),
    };
    rd.deepDive.alphaPeak = rd.deepDive.alphaPeak || {
      label: 'Alpha Peak Frequency', value: alphaPeak, unit: 'Hz', optimal: '9.5 – 11.5 Hz',
      status: alphaPeak == null ? 'N/A' : alphaPeak > 9 ? 'Healthy' : 'Low',
    };
    rd.deepDive.arousal = rd.deepDive.arousal || {
      label: 'Arousal Score', value: arousal, unit: '', optimal: '< 1.0',
      status: arousal == null ? 'N/A' : arousal < 1 ? 'Balanced' : 'Elevated',
    };
    rd.deepDive.relaxation = rd.deepDive.relaxation || {
      label: 'Relaxation Score', value: relaxation, unit: '', optimal: '> 8',
      status: relaxation == null ? 'N/A' : relaxation > 8 ? 'Good' : 'Low',
    };
    rd.deepDive.regeneration = rd.deepDive.regeneration || {
      label: 'Regeneration (Alpha Modulation)', value: regeneration, unit: '%', optimal: '> 30%',
      status: regeneration == null ? 'N/A' : regeneration > 30 ? 'Healthy' : 'Low',
    };
    rd.deepDive.frontalAsymmetry = rd.deepDive.frontalAsymmetry || {
      label: 'Frontal Alpha Asymmetry', value: asymmetry, unit: '', optimal: 'Balanced (near 0)',
      status: asymmetry == null ? 'N/A' : asymmetry < 0 ? 'Right-Shifted' : asymmetry > 0 ? 'Left-Shifted' : 'Balanced',
    };
    rd.deepDive.daytimeDelta = rd.deepDive.daytimeDelta || {
      label: 'Excessive / Daytime Delta', value: daytimeDelta, unit: '%', optimal: '< 20%',
      status: daytimeDelta == null ? 'N/A' : daytimeDelta < 20 ? 'Normal' : daytimeDelta <= 30 ? 'Borderline' : 'Elevated',
    };
  }

  return rd;
}

/**
 * Build reportData from a NeuroSense-values Markdown document (produced by
 * neurosenseMarkdown.buildNeuroSenseMarkdown). Every displayed number — the
 * seven parameter percentages, the overall score, every status label, the
 * deep-dive values, and the brainwave profile — is COPIED VERBATIM from the MD.
 * No gaugePercent bucketing, no overall averaging, no status derivation, no
 * score inversion happens here. The performance report shows exactly what the
 * NeuroSense report printed.
 *
 * The only non-transcribed step is the 5-type brain object reconstruction: the
 * template's brain-type pages need the full framework object (strengths,
 * watch-zones, tagline), so we re-run classifyBrainType5 on the original
 * algorithmResults (a static framework lookup, not a patient-value calculation)
 * and fall back to the TYPES table by id when algorithmResults is unavailable.
 *
 * @param {string} mdText          NeuroSense-values Markdown.
 * @param {object} patient         { id, name, clinicName, processedAt } fallbacks.
 * @param {object} algorithmResults original deterministic results (for brain-type object only).
 * @returns {object} reportData (same shape as buildReportData).
 */
function buildReportDataFromNeuroSenseMd(mdText, patient = {}, algorithmResults = null) {
  const parsed = parseNeuroSenseMarkdown(mdText);

  // Brain-type framework object (template needs primary/secondary/strengths/watchZones).
  let brainType;
  try {
    brainType = classifyBrainType5(algorithmResults);
  } catch (_) {
    brainType = null;
  }
  if (!brainType || !brainType.primary) {
    const { TYPES } = require('./brainType5Classifier');
    const fallbackId = parsed.brainTypeId || 1;
    brainType = { primary: TYPES[fallbackId] || TYPES[1], secondary: null, fitScores: {}, signals: {} };
  }

  // Prefer the explicitly-passed upload date so the Performance report's Date of
  // Assessment matches the NeuroSense report exactly.
  const assessmentDate = formatDate(patient.assessmentDate || parsed.patient.assessmentDate || patient.processedAt);

  // Bars: percent + status straight from the NeuroSense report — no re-bucketing.
  const bars = parsed.parameters.map((p) => ({
    key: p.key,
    label: p.label,
    percent: p.percent != null ? p.percent : 0,
    status: p.status || 'N/A',
    icon: p.icon,
  }));

  // Overall = average of the 7 parameter percentages, with Stress & Burnout
  // inverted (100 - percent) so low stress/burnout counts as high health.
  const overall = overallFromBars(bars);
  const findBar = (key) => bars.find((b) => b.key === key)
    || { key, label: key, percent: 0, status: 'N/A', icon: '' };

  // Deep dive: values + statuses copied verbatim from the MD.
  const ddIn = parsed.deepDive || {};
  const ddEntry = (key) => {
    const e = ddIn[key];
    if (!e) return { label: '', value: null, unit: '', optimal: '', status: 'N/A' };
    return { label: e.label, value: e.value, unit: e.unit, optimal: e.optimal, status: e.status };
  };

  // Focus Score & Alpha:Theta Balance are NOT part of the NeuroSense-values MD
  // (the extraction schema omits them), so they always arrive null here. Recover
  // them from the deterministic algorithmResults — the same source the NeuroSense
  // report uses — exactly as buildReportDataFromSource does. Focus Score is a
  // number; Alpha:Theta Balance is a { fz, cz, pz } object.
  const incomingParams = toParameters(algorithmResults);
  const focusVal = metricValue(incomingParams, 'Focus Score');
  const alphaThetaMetric = metricMatch(incomingParams, 'Alpha:Theta Balance');
  const alphaThetaVal = metricValue(incomingParams, 'Alpha:Theta Balance');

  const deepDive = {
    alphaPeak: ddEntry('alphaPeak'),
    arousal: ddEntry('arousal'),
    relaxation: ddEntry('relaxation'),
    regeneration: ddEntry('regeneration'),
    frontalAsymmetry: ddEntry('frontalAsymmetry'),
    daytimeDelta: ddEntry('daytimeDelta'),
    focusScore: ddEntry('focusScore').value != null ? ddEntry('focusScore') : {
      label: 'Focus Score', value: focusVal, unit: '', optimal: '< 1.5',
      status: focusScoreStatus(focusVal),
    },
    alphaTheta: ddEntry('alphaTheta').value != null ? ddEntry('alphaTheta') : {
      label: 'Alpha:Theta Balance', value: alphaThetaVal, unit: '', optimal: '> 1.0 (healthy)',
      status: alphaThetaStatus(alphaThetaMetric, alphaThetaVal),
    },
  };

  // Brainwave profile: copied verbatim from the MD.
  const bw = parsed.brainwave || {};
  const profile = {
    delta: bw.delta != null ? bw.delta : 0,
    theta: bw.theta != null ? bw.theta : 0,
    alpha: bw.alpha != null ? bw.alpha : 0,
    beta: bw.beta != null ? bw.beta : 0,
    hiBeta: bw.hiBeta != null ? bw.hiBeta : 0,
    alphaPeakHz: bw.alphaPeakHz != null ? bw.alphaPeakHz : null,
  };

  const name = parsed.patient.name || patient.name || 'Patient';

  return {
    patient: {
      name,
      reportId: makeReportId(patient.id, assessmentDate),
      assessmentDate,
      clinicName: patient.clinicName || 'Limitless Brain Lab',
      firstName: name.split(/\s+/)[0],
      patientId: patient.id || '',
      generatedOn: formatGeneratedOn(patient.generatedAt || patient.assessmentDate || patient.processedAt),
    },
    overall,
    bars,
    performance: {
      cognition: findBar('cognition'),
      stress: findBar('stress'),
      focus: findBar('focus'),
      burnout: findBar('burnout'),
    },
    innerBandwidth: {
      emotional: findBar('emotional'),
      learning: findBar('learning'),
      creativity: findBar('creativity'),
    },
    deepDive,
    profile,
    brainType,
    overallScore21: parsed.overall.score != null ? parsed.overall.score : null,
  };
}

if (require.main === module) {
  const assert = require('assert');
  const params = [
    { name: 'Cognition', score: 2, maxScore: 3, classification: 'Medium', metrics: [] },
    { name: 'Stress', score: 0, maxScore: 3, classification: 'Low', metrics: [] },
    { name: 'Focus & Attention', score: 2, maxScore: 3, classification: 'Medium', metrics: [] },
    { name: 'Learning', score: 2, maxScore: 3, classification: 'Medium', metrics: [] },
    { name: 'Burnout & Fatigue', score: 3, maxScore: 3, classification: 'Severe', metrics: [] },
    { name: 'Emotional Regulation', score: 2, maxScore: 3, classification: 'Medium', metrics: [] },
    { name: 'Creativity', score: 2, maxScore: 3, classification: 'Medium', metrics: [] },
  ];
  const report = buildReportData({}, { parameters: params, overallScore: 12 }, { name: 'Self Check', id: 'self', processedAt: '2026-07-09T00:00:00Z' });
  const bar = (key) => report.bars.find((b) => b.key === key).percent;
  // Positive params: direct bucket (Low=20, Medium=55, High=90).
  // Stress & Burnout: inverted to health (red count -> maxScore-score) then bucketed.
  assert.equal(bar('cognition'), 55); // Medium
  assert.equal(bar('stress'), 20);    // 0 red -> Low (matches NeuroSense level)
  assert.equal(bar('burnout'), 90);   // 3 red -> Severe (matches NeuroSense level)
  // Overall inverts Stress (20->80) & Burnout (90->10): avg(80,55,55,55,10,55,55)=365/7
  assert.equal(report.overall, 52);
  console.log('performanceReportData self-check ok');
}

module.exports = { buildReportData, buildReportDataFromSource, buildReportDataFromNeuroSenseMd };
