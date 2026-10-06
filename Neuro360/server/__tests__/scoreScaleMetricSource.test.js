const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const source = readFileSync(require.resolve('../services/geminiPdfGenerator'), 'utf8');
assert.match(source, /p\.subparameters \|\| p\.metrics/, 'score scales must use persisted metric values');
console.log('scoreScaleMetricSource.test.js: ok');
