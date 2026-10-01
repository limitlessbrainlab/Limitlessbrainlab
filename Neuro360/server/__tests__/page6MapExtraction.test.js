const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { extractPageImage } = require('../services/pdf/yourNumbersPage');
(async () => {
  const pdfPath = path.join(os.tmpdir(), `page6-map-${process.pid}.pdf`);
  const doc = new PDFDocument();
  const output = fs.createWriteStream(pdfPath);
  doc.pipe(output); doc.text('one'); doc.addPage().text('two'); doc.end();
  await new Promise((resolve, reject) => output.on('finish', resolve).on('error', reject));
  try {
    const image = await extractPageImage(pdfPath);
    assert.ok(Buffer.isBuffer(image));
    assert.deepStrictEqual([...image.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    console.log('page6MapExtraction.test.js: ok');
  } finally { fs.unlinkSync(pdfPath); }
})();
