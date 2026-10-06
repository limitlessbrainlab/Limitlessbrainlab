const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const { generateWNeuroPdf, markerValue } = require('../services/wNeuroPdfGenerator');

async function main() {
  assert.equal(markerValue({ score: 3, maxScore: 3 }), 100);
  assert.equal(markerValue({ score: 2, maxScore: 3 }), 67);
  assert.equal(markerValue({ score: 0, maxScore: 3 }), 0);
  const output = path.join(os.tmpdir(), `w-neuro-check-${process.pid}.pdf`);
  const parameters = ['Stress', 'Burnout & Fatigue', 'Emotional Regulation', 'Cognition', 'Focus & Attention', 'Learning', 'Creativity']
    .map((name, index) => ({ name, score: index % 4, maxScore: 3, classification: index < 2 ? 'Severe' : 'Low', metrics: [] }));
  try {
    await generateWNeuroPdf(output, { name: 'Test Patient', age: 42, dateOfBirth: '1 Jan 1984' }, { parameters }, { EC: {}, EO: {} });
    const pdf = await pdfParse(fs.readFileSync(output));
    assert.equal(pdf.numpages, 17);
    assert.match(pdf.text, /Test Patient/);
    assert.match(pdf.text, /Your snapshot/);
    assert.match(pdf.text, /20\/100/);
    assert.doesNotMatch(pdf.text, /Learning Capacity|High Creativity/);
    console.log('W Neuro PDF: 17 pages, patient data and five markers verified');
  } finally {
    fs.rmSync(output, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
