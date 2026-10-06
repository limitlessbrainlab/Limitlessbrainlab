const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const source = readFileSync(require.resolve('../services/geminiPdfGenerator'), 'utf8');
assert.match(source, /const allSubParams = this\.algorithmResults\.parameters\.flatMap/, 'score scales must use calculated metric values');
assert.match(source, /'ALPHA ASYMMETRY': 'Alpha Asymmetry \(Frontal\)'/, 'alpha asymmetry must match its calculated metric');
assert.match(source, /'ALPHA ASYMMETRY':\s+\{ min: -5, max: 5/, 'page 28 alpha asymmetry must receive its numeric scale');
console.log('scoreScaleMetricSource.test.js: ok');
