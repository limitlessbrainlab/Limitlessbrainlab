const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const source = fs.readFileSync(path.resolve(__dirname, '../services/pdf/yourNumbersPage.js'), 'utf8');
const { extractPageImage } = require('../services/pdf/yourNumbersPage');

async function run() {
  assert.ok(source.includes("const { pdf } = await import('pdf-to-img');"));
  assert.ok(!source.includes("require('pdf-to-img')"));
  const pdfPath = path.join(os.tmpdir(), `page6-map-${process.pid}.pdf`);
  const doc = new PDFDocument();
  const output = fs.createWriteStream(pdfPath);
  doc.pipe(output);
  doc.text('page one');
  doc.addPage().text('page two brain map');
  doc.end();
  await new Promise((resolve, reject) => output.on('finish', resolve).on('error', reject));

  try {
    const image = await extractPageImage(pdfPath);
    assert.ok(Buffer.isBuffer(image));
    assert.deepStrictEqual([...image.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    console.log('page6MapExtraction.test.js: ok');
  } finally {
    fs.unlinkSync(pdfPath);
  }
}

run();
