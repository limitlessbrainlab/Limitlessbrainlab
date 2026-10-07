const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '../..');
const source = readFileSync(path.join(appRoot, 'src/components/patient/PatientDashboard.jsx'), 'utf8');

assert.match(source, /const YOGA_NIDRA_URL = driveEmbed\('1G7M7EiWU7tHzFkb0Gy6KIPNwUt1p3pn8'\)/, 'Ultimate Yoga Nidra must use its approved video');
assert.match(source, /num: 17[\s\S]{0,260}embedUrl: driveEmbed\('1Q6FU41CNB3hMzZUcTUkYCJ9UGXxXc2pB'\)/, 'Advanced Yoga Nidra must keep its own video');

for (const number of [13, 14, 15, 16, 17, 18]) {
  assert.match(source, new RegExp(`num: ${number}[\\s\\S]{0,260}thumb: '/meditation-thumbs/thumb-${number}\\.(?:jpg|png)'`), `meditation ${number} must use a local thumbnail`);
  assert.ok(existsSync(path.join(appRoot, 'public/meditation-thumbs', `thumb-${number}.jpg`)) || existsSync(path.join(appRoot, 'public/meditation-thumbs', `thumb-${number}.png`)), `thumbnail ${number} must exist`);
}

console.log('meditationThumbnailAssets.test.js: ok');
