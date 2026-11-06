const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Parser = require('../services/qeegParser');
const limiter = require('../services/geminiRateLimiter');

test('classifies visible tables, rejects unknown PDFs, and retains mismatch validation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeeg-type-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = { originalname: 'report.pdf', path: path.join(dir, 'report.pdf') };
  const pdf = new PDFDocument();
  const chunks = [];
  const finished = new Promise(resolve => pdf.on('end', resolve));
  pdf.on('data', chunk => chunks.push(chunk));
  pdf.text('Extreme Z-score Development: Z-score Z-score');
  pdf.end();
  await finished;
  fs.writeFileSync(file.path, Buffer.concat(chunks));
  t.mock.method(Parser, 'validateAPIKey', () => true);
  t.mock.method(Parser, 'fetchAvailableModels', async () => [{ name: 'gemini-test-flash' }]);
  t.mock.method(limiter, 'waitForRateLimit', async () => {});
  t.mock.method(limiter, 'recordRequest', () => {});
  let response = { raw: true, zscore: true };
  t.mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => ({
    generateContent: async () => {
      if (response instanceof Error) throw response;
      return { response: { text: () => JSON.stringify(response) } };
    }
  }));

  // Image tables can contain raw columns despite Z-score-only searchable text.
  assert.equal(await Parser.detectReportType(file, true), 'raw');
  response = { raw: false, zscore: true };
  assert.equal(await Parser.detectReportType(file, true), 'zscore');
  response = { raw: true, zscore: false };
  assert.equal(await Parser.detectReportType(file, true), 'raw');
  for (const invalid of [{ raw: false, zscore: false }, { raw: 'true', zscore: false }, {}, new Error('API unavailable')]) {
    response = invalid;
    await assert.rejects(() => Parser.detectReportType(file, true));
  }
  assert.equal(await Parser.detectReportType({ originalname: 'data.csv' }), 'raw');
  t.mock.method(Parser, 'detectReportType', async (input) => input === file ? 'raw' : 'zscore');
  await assert.rejects(() => Parser.parse(file, { originalname: 'other.pdf' }), { code: 'REPORT_TYPE_MISMATCH' });
});


test('matching text reports need no visual calls; unclear or mismatched pairs are checked once each', async (t) => {
  const eo = { originalname: 'eo.pdf' };
  const ec = { originalname: 'ec.pdf' };
  let textTypes = ['raw', 'raw'];
  let visualTypes = ['raw', 'raw'];
  let visualCalls = 0;
  t.mock.method(Parser, 'detectReportType', async (file, visual = false) => {
    const index = file === eo ? 0 : 1;
    if (visual) visualCalls++;
    return (visual ? visualTypes : textTypes)[index];
  });
  t.mock.method(Parser, 'parseFile', async () => ({ extracted: true }));
  for (const type of ['raw', 'zscore']) {
    textTypes = [type, type];
    assert.equal((await Parser.parse(eo, ec)).dataType, type);
    assert.equal(visualCalls, 0);
  }
  for (const types of [['zscore', null], ['raw', 'zscore'], [null, null]]) {
    textTypes = types;
    visualCalls = 0;
    const parsed = await Parser.parse(eo, ec);
    assert.equal(parsed.dataType, 'raw');
    assert.deepEqual(parsed.EO, { extracted: true });
    assert.equal(visualCalls, 2);
  }
  textTypes = ['raw', 'zscore'];
  visualTypes = ['raw', 'zscore'];
  await assert.rejects(() => Parser.parse(eo, ec), { code: 'REPORT_TYPE_MISMATCH' });
});
