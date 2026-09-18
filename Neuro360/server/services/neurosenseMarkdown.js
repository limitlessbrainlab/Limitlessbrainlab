/**
 * NeuroSense Report -> Markdown bridge.
 *
 * Converts the values transcribed from an ALREADY-GENERATED NeuroSense report
 * (the `source` object produced by performanceReportService.extractReportSource, which
 * holds the exact numbers printed on the NeuroSense PDF) into a structured
 * Markdown document, and parses that document back into a plain object.
 *
 * The 12-page performance report consumes the PARSED object VERBATIM — it does
 * NO recalculation of scores, percentages, overall, or statuses. Every number
 * shown on the performance report therefore comes straight from the NeuroSense
 * report, as-is. The only non-numeric step left to the report builder is the
 * 5-type brain classification (a static framework lookup, see brainType5Classifier).
 */

const { classifyBrainType5 } = require('./brainType5Classifier');

// Canonical 7-parameter order + display metadata (matches brainReport12Page bars).
// `markerKey` is the key used in `source.markers` (extractReportSource schema).
const PARAMS = [
  { key: 'stress', label: 'Stress', icon: '⚡', markerKey: 'stressRegulation', inverted: true },
  { key: 'cognition', label: 'Cognition', icon: '🧠', markerKey: 'cognition' },
  { key: 'focus', label: 'Focus & Attention', icon: '🎯', markerKey: 'focusAttention' },
  { key: 'learning', label: 'Learning', icon: '📚', markerKey: 'learning' },
  { key: 'burnout', label: 'Burnout & Fatigue', icon: '🔋', markerKey: 'burnoutResistance', inverted: true },
  { key: 'emotional', label: 'Emotional Regulation', icon: '💗', markerKey: 'emotionalRegulation' },
  { key: 'creativity', label: 'Creativity', icon: '🎨', markerKey: 'creativity' },
];

// Deep-dive metric definitions: sourceKey is the key in `source.deepDive`.
const DD_FIELDS = [
  { key: 'alphaPeak', label: 'Alpha Peak Frequency', unit: 'Hz', optimal: '9.5 – 11.5 Hz', sourceKey: 'alphaPeak' },
  { key: 'arousal', label: 'Arousal Score', unit: '', optimal: '< 1.0', sourceKey: 'arousal' },
  { key: 'relaxation', label: 'Relaxation Score', unit: '', optimal: '> 8', sourceKey: 'relaxation' },
  { key: 'regeneration', label: 'Regeneration (Alpha Modulation)', unit: '%', optimal: '> 30%', sourceKey: 'regeneration' },
  { key: 'frontalAsymmetry', label: 'Frontal Alpha Asymmetry', unit: '', optimal: 'Balanced (near 0)', sourceKey: 'frontalAsymmetry' },
  { key: 'daytimeDelta', label: 'Excessive / Daytime Delta', unit: '%', optimal: '< 20%', sourceKey: 'daytimeDelta' },
  { key: 'focusScore', label: 'Focus Score', unit: '', optimal: '< 1.5', sourceKey: 'focusScore' },
  { key: 'alphaTheta', label: 'Alpha:Theta Balance', unit: '', optimal: '> 1.0 (healthy)', sourceKey: 'alphaTheta' },
];

function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  return null;
}

/**
 * NeuroSense classification label from a gauge percentage.
 * NeuroSense gauges print: Low=20%, Medium/Mild/Moderate=55%, High/Severe=90%.
 * Inverted params (Stress/Burnout) use the level vocabulary (Low/Moderate/Severe).
 */
function classFromPercent(percent, inverted) {
  const p = num(percent);
  if (p == null) return 'N/A';
  if (p <= 30) return 'Low';
  if (p <= 70) return inverted ? 'Moderate' : 'Medium';
  return inverted ? 'Severe' : 'High';
}

/**
 * Deep-dive status label from the raw value. Thresholds mirror the NeuroSense
 * report's metric interpretations so the badge matches what NeuroSense shows.
 */
function ddStatus(label, value) {
  const v = num(value);
  const name = String(label || '').toLowerCase();
  // Alpha:Theta Balance can arrive as a {fz,cz,pz} object — the order is healthy
  // when fz < cz < pz. Resolve it before the numeric null-guard below.
  if (name.includes('theta') && value && typeof value === 'object') {
    const f = Number(value.fz), c = Number(value.cz), p = Number(value.pz);
    if ([f, c, p].every(Number.isFinite)) return (f < c && c < p) ? 'Healthy' : 'Low';
    return 'N/A';
  }
  if (v == null) return value === 'Indeterminate' ? 'N/A' : 'N/A';
  if (name.includes('alpha peak')) return v > 9 ? 'Healthy' : 'Low';
  if (name.includes('arousal')) return v < 1 ? 'Balanced' : 'Elevated';
  if (name.includes('relaxation')) return v > 8 ? 'Good' : 'Low';
  if (name.includes('regeneration')) return v > 30 ? 'Healthy' : 'Low';
  if (name.includes('asymmetry')) return v < 0 ? 'Right-Shifted' : v > 0 ? 'Left-Shifted' : 'Balanced';
  if (name.includes('delta')) return v < 20 ? 'Normal' : v <= 30 ? 'Borderline' : 'Elevated';
  if (name.includes('focus')) return v < 1.5 ? 'Good' : 'Above Target';
  if (name.includes('theta')) return v >= 1 ? 'Healthy' : 'Low';
  return 'N/A';
}

function fmtVal(v) {
  const n = num(v);
  if (n != null) return String(n);
  if (v === 'Indeterminate') return 'Indeterminate';
  return 'null';
}

// Deep-dive values can be an object (Alpha:Theta Balance = {fz,cz,pz}); serialize it
// as JSON so it survives the pipe-delimited Markdown round-trip. A JSON object of
// numeric ratios contains no '|', so it stays pipe-safe on the deepdive| line.
function fmtDDVal(v) {
  if (v && typeof v === 'object') return JSON.stringify(v);
  return fmtVal(v);
}

/**
 * Normalize the algorithmResults that arrive from the admin frontend (an array
 * of { parameter, rawScore: "x/3", status, metrics }) into the shape
 * classifyBrainType5 expects ({ parameters: [{ name, score, maxScore, ... }] }).
 * Pass-through if already in the object shape.
 */
function normalizeForType(algorithmResults) {
  if (!algorithmResults) return null;
  if (Array.isArray(algorithmResults)) {
    return {
      parameters: algorithmResults.map((r) => {
        const parts = String(r.rawScore || r.raw_score || '').split('/');
        const score = Number(parts[0]);
        const maxScore = Number(parts[1]) || 3;
        return {
          name: r.parameter || r.name,
          score: isFinite(score) ? score : 0,
          maxScore: isFinite(maxScore) && maxScore > 0 ? maxScore : 3,
          classification: r.status || r.classification,
          metrics: r.metrics || [],
        };
      }),
    };
  }
  return algorithmResults;
}

/**
 * Build the NeuroSense-values Markdown document.
 * @param {object} source           extractReportSource output: { patient, markers, deepDive, brainwave, overall? }
 * @param {object} algorithmResults optional — used only for the 5-type brain classification.
 * @param {object} patient          { name, clinicName, processedAt/assessmentDate } fallbacks.
 * @returns {string} markdown
 */
function buildNeuroSenseMarkdown(source, algorithmResults, patient = {}) {
  const s = source || {};
  const markers = s.markers || {};
  const dd = s.deepDive || {};
  const bw = s.brainwave || {};
  const ov = s.overall || {};

  const patName = (s.patient && s.patient.name) || patient.name || 'Patient';
  const patDate = (s.patient && s.patient.assessmentDate) || patient.assessmentDate || patient.processedAt || '';

  let brainTypeId = '';
  let brainTypeName = '';
  try {
    const classified = classifyBrainType5(normalizeForType(algorithmResults));
    brainTypeId = classified?.primary?.id || '';
    brainTypeName = classified?.primary?.name || '';
  } catch (_) {
    /* leave blank — report builder falls back to TYPES lookup */
  }

  const lines = [];
  lines.push('# NeuroSense Report Values');
  lines.push('patient_name: ' + patName);
  lines.push('assessment_date: ' + (patDate || ''));
  lines.push('brain_type_id: ' + (brainTypeId !== '' ? brainTypeId : 'null'));
  lines.push('brain_type: ' + brainTypeName);
  lines.push('');
  lines.push('## Overall');
  lines.push('overall_score: ' + (num(ov.score) != null ? num(ov.score) : 'null'));
  lines.push('overall_percentage: ' + (num(ov.percentage) != null ? num(ov.percentage) : 'null'));
  lines.push('');
  lines.push('## Parameters');
  for (const p of PARAMS) {
    const pct = num(markers[p.markerKey]);
    const classification = classFromPercent(pct, p.inverted);
    lines.push('param|' + p.key + '|' + p.label + '|' + p.icon + '|' + (p.inverted ? 1 : 0) + '|' + (pct != null ? pct : 'null') + '|' + classification);
  }
  lines.push('');
  lines.push('## Deep Dive');
  for (const f of DD_FIELDS) {
    const v = dd[f.sourceKey];
    const status = ddStatus(f.label, v);
    lines.push('deepdive|' + f.key + '|' + f.label + '|' + fmtDDVal(v) + '|' + f.unit + '|' + f.optimal + '|' + status);
  }
  lines.push('');
  lines.push('## Brainwave');
  lines.push('brainwave|delta|' + fmtVal(bw.delta));
  lines.push('brainwave|theta|' + fmtVal(bw.theta));
  lines.push('brainwave|alpha|' + fmtVal(bw.alpha));
  lines.push('brainwave|beta|' + fmtVal(bw.beta));
  lines.push('brainwave|hiBeta|' + fmtVal(bw.hiBeta));
  lines.push('brainwave|alphaPeakHz|' + fmtVal(bw.alphaPeakHz));
  lines.push('');
  lines.push('## End');
  return lines.join('\n');
}

function parsePrefixed(line, prefix) {
  if (!line.startsWith(prefix)) return null;
  return line.slice(prefix.length).split('|');
}

function toVal(s) {
  if (s == null) return null;
  const str = String(s).trim();
  if (str === '' || str === 'null') return null;
  if (str === 'Indeterminate') return 'Indeterminate';
  const n = Number(str);
  return isFinite(n) ? n : null;
}

// Deep-dive counterpart to toVal that also decodes a JSON object value
// (Alpha:Theta Balance = {fz,cz,pz}); everything else defers to toVal.
function toDDVal(s) {
  const str = String(s == null ? '' : s).trim();
  if (str.startsWith('{')) { try { return JSON.parse(str); } catch { return null; } }
  return toVal(str);
}

/**
 * Parse a NeuroSense-values Markdown document back into a plain object.
 * @param {string} md
 * @returns {object}
 */
function parseNeuroSenseMarkdown(md) {
  const lines = String(md || '').split('\n');
  const out = {
    patient: { name: '', assessmentDate: '' },
    brainTypeId: null,
    brainType: '',
    overall: { score: null, percentage: null },
    parameters: [],
    deepDive: {},
    brainwave: {},
  };

  const kv = (line, key) => (line.startsWith(key + ':') ? line.slice((key + ':').length).trim() : undefined);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    let v;
    if ((v = kv(line, 'patient_name')) !== undefined) { out.patient.name = v; continue; }
    if ((v = kv(line, 'assessment_date')) !== undefined) { out.patient.assessmentDate = v; continue; }
    if ((v = kv(line, 'brain_type_id')) !== undefined) { out.brainTypeId = toVal(v); continue; }
    if ((v = kv(line, 'brain_type')) !== undefined) { out.brainType = v; continue; }
    if ((v = kv(line, 'overall_score')) !== undefined) { out.overall.score = toVal(v); continue; }
    if ((v = kv(line, 'overall_percentage')) !== undefined) { out.overall.percentage = toVal(v); continue; }

    const p = parsePrefixed(line, 'param|');
    if (p) {
      out.parameters.push({
        key: p[0],
        label: p[1],
        icon: p[2],
        inverted: p[3] === '1',
        percent: toVal(p[4]),
        status: p[5] || 'N/A',
      });
      continue;
    }
    const d = parsePrefixed(line, 'deepdive|');
    if (d) {
      out.deepDive[d[0]] = { key: d[0], label: d[1], value: toDDVal(d[2]), unit: d[3] || '', optimal: d[4] || '', status: d[5] || 'N/A' };
      continue;
    }
    const w = parsePrefixed(line, 'brainwave|');
    if (w) { out.brainwave[w[0]] = toVal(w[1]); continue; }
  }
  return out;
}

module.exports = { buildNeuroSenseMarkdown, parseNeuroSenseMarkdown };
