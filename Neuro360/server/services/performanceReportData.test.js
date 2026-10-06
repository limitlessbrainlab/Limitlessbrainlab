const assert = require('node:assert/strict');
const { buildNeuroSenseMarkdown } = require('./neurosenseMarkdown');
const { buildReportDataFromNeuroSenseMd } = require('./performanceReportData');
const { renderReportHtml } = require('../templates/brainReport12Page');

const source = {
  overall: { score: 15, percentage: 72 },
  markers: {
    stressRegulation: 67,
    cognition: 67,
    focusAttention: 67,
    learning: 67,
    burnoutResistance: 100,
    emotionalRegulation: 67,
    creativity: 67,
  },
  deepDive: {},
  brainwave: {},
};

const algorithmResults = [
  { parameter: 'Cognition', rawScore: '3/3', status: 'High', metrics: [{ name: 'Alpha Peak', value: 11.7 }] },
  { parameter: 'Stress', rawScore: '0/3', status: 'Low', metrics: [{ name: 'Arousal Score', value: 0.8 }] },
  { parameter: 'Focus & Attention', rawScore: '2/3', status: 'Medium', metrics: [] },
  { parameter: 'Learning', rawScore: '2/3', status: 'Medium', metrics: [] },
  { parameter: 'Burnout & Fatigue', rawScore: '3/3', status: 'Severe', metrics: [] },
  { parameter: 'Emotional Regulation', rawScore: '2/3', status: 'Medium', metrics: [] },
  { parameter: 'Creativity', rawScore: '2/3', status: 'Medium', metrics: [] },
];

const data = buildReportDataFromNeuroSenseMd(buildNeuroSenseMarkdown(source, algorithmResults), {}, algorithmResults);
assert.equal(data.overall, 72, 'Performance overall must preserve the NeuroSense overall percentage');
assert.equal(data.bars.find((bar) => bar.key === 'cognition').percent, 90, 'Saved algorithm scores must override PDF transcription');
assert.equal(data.deepDive.alphaPeak.value, 11.7, 'Saved algorithm metrics must override PDF transcription');
assert.equal(data.bars.find((bar) => bar.key === 'burnout').label, 'Burnout & Fatigue');
assert.match(renderReportHtml(data, {}), /Stress and burnout are severity markers/i, 'Performance copy must not reverse Stress/Burnout meaning');
console.log('performance report value-parity test ok');
