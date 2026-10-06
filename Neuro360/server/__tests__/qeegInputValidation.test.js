const assert = require('assert');
const path = require('path');
const { validateQeegInputs, canonicalQeegFileName } = require('../services/qeegInputValidation');

const uploads = path.join(__dirname, '../uploads');
const eyesOpen = path.join(uploads, 'eyesOpen-1765440593801-365796249.pdf');
const eyesClosed = path.join(uploads, 'eyesClosed-1765440593871-741407982.pdf');

async function run() {
  assert.strictEqual(canonicalQeegFileName('Eyes Open', 'EyesClosed-SARAH TURNER.pdf'), 'EyesOpen.pdf');
  assert.strictEqual(canonicalQeegFileName('Eyes Closed', 'anything.PDF'), 'EyesClosed.pdf');
  await validateQeegInputs(eyesOpen, eyesClosed);
  await assert.rejects(() => validateQeegInputs(eyesOpen, eyesOpen), /identical/i);
  await assert.rejects(() => validateQeegInputs(eyesClosed, eyesOpen), /Eyes Open PDF is labelled Eyes Closed/i);
  console.log('qeegInputValidation.test.js: ok');
}

run();
