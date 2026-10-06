const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const source = readFileSync(require.resolve('../services/geminiPdfGenerator'), 'utf8');
assert.match(source, /const allSubParams = this\.algorithmResults\.parameters\.flatMap/, 'score scales must use calculated metric values');
console.log('scoreScaleMetricSource.test.js: ok');
