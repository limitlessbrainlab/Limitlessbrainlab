const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const conditionIn = (text) => {
  const match = String(text).match(/Condition:\s*Eyes\s*(Open|Closed)/i);
  return match && `Eyes ${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
};

const fileHash = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const canonicalQeegFileName = (condition, originalName) =>
  `${String(condition).replace(/\s+/g, '')}${path.extname(originalName).toLowerCase() || '.pdf'}`;

async function validateQeegInputs(eyesOpenPath, eyesClosedPath) {
  if (fileHash(eyesOpenPath) === fileHash(eyesClosedPath)) {
    throw new Error('Eyes Open and Eyes Closed PDFs are identical. Upload two distinct condition recordings.');
  }
  for (const [filePath, expected] of [[eyesOpenPath, 'Eyes Open'], [eyesClosedPath, 'Eyes Closed']]) {
    if (path.extname(filePath).toLowerCase() !== '.pdf') continue;
    const { text } = await pdf(fs.readFileSync(filePath));
    const actual = conditionIn(text);
    if (!actual) throw new Error(`${expected} PDF does not contain a readable condition label.`);
    if (actual !== expected) throw new Error(`${expected} PDF is labelled ${actual}. Upload the correct condition recording.`);
  }
}

module.exports = { validateQeegInputs, canonicalQeegFileName };
