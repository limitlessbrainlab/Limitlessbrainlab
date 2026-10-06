/**
 * Your Numbers At a Glance Page Generator (Page 6)
 * Mixed-radius image shape at top, title + description, two EEG condition panels,
 * color legend, references
 *
 * Supports dynamic image extraction from uploaded QEEG PDFs (eyes-open / eyes-closed)
 * and dynamic noisy channel notes from parameterNotes
 */

const { FONTS, LAYOUT } = require('./pdfStyles');
const fs = require('fs');
const path = require('path');
const { extractReliabilityAssessment } = require('./brainMapComparisonPage');

// Image paths
const PAGE6_IMG = path.resolve(__dirname, '../../../public/assets/Imagepage6.png');
const BRAIN_BG_PATH = path.resolve(__dirname, '../../../public/assets/Group (1).png');

// Colors
const BLUE = '#227AFF';
const DARK_TEXT = '#000000';
const BODY_TEXT = '#000000';
const REF_GRAY = '#000000';

/**
 * Extract page 2 image from a PDF file using pdf-to-img
 * Crops the header portion to show only the brain map channels grid
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Buffer|null>} Rendered page image or null
 */
async function extractPageImage(pdfPath) {
  try {
    console.log('   Extracting page 2 from: ' + path.basename(pdfPath));

    // Dynamic imports
    var pdfToImg;
    try {
      pdfToImg = await import('pdf-to-img');
      console.log('   pdf-to-img loaded successfully');
    } catch (e) {
      console.error('   pdf-to-img unavailable:', e.message);
      return null;
    }

    // Convert PDF pages with scale for good quality
    console.log('   Loading PDF document...');
    var document = await pdfToImg.pdf(pdfPath, { scale: 2.0 });

    // Iterate through pages to get page 2
    var pageNum = 0;
    for await (var imageBuffer of document) {
      pageNum++;
      if (pageNum === 2) {
        console.log('   Original image size: ' + Math.round(imageBuffer.length / 1024) + ' KB');
        return imageBuffer;
      }
    }

    console.error('   PDF has only ' + pageNum + ' page(s), need at least 2');
    return null;

  } catch (error) {
    console.error('   Error extracting image from ' + pdfPath + ':', error.message);
    return null;
  }
}

/**
 * Generate "Your Numbers At a Glance" page (Page 6) — ASYNC version
 * Extracts brain map images from uploaded QEEG PDFs
 * @param {object} doc - PDFKit document
 * @param {object} [inputPdfPaths] - { eyesOpen: path, eyesClosed: path }
 * @param {string} [parameterNotes] - Noisy channel notes from user
 */
async function generateYourNumbersPageAsync(doc, inputPdfPaths, parameterNotes) {
  var pw = LAYOUT.pageWidth;
  var ph = LAYOUT.pageHeight;

  // White background
  doc.rect(0, 0, pw, ph).fill('#FFFFFF');

  // Brain watermark
  try {
    if (fs.existsSync(BRAIN_BG_PATH)) {
      doc.save();
      doc.opacity(0.55);
      doc.image(BRAIN_BG_PATH, -100, 200, { width: 400 });
      doc.opacity(1);
      doc.restore();
    }
  } catch (e) { /* skip */ }

  // ===== 1. TOP IMAGE — Mixed-radius shape =====
  drawTopImage(doc);

  // ===== 2. TITLE + DESCRIPTION SECTION =====
  drawTitleSection(doc);

  // ===== 3. TWO PANELS — Eyes-closed / Eyes-opened =====
  var panelW = 241;
  var panelH = 256;
  var panelGap = 18;
  var panelX1 = 53;
  var panelY = 398;
  var panelX2 = panelX1 + panelW + panelGap;

  // Try to extract images from uploaded PDFs
  var eyesClosedImagePath = null;
  var eyesOpenImagePath = null;

  if (inputPdfPaths && inputPdfPaths.eyesClosed && inputPdfPaths.eyesOpen) {
    console.log('   PDF paths provided, extracting brain map images...');
    try {
      var results = await Promise.all([
        extractPageImage(inputPdfPaths.eyesClosed),
        extractPageImage(inputPdfPaths.eyesOpen)
      ]);

      eyesClosedImagePath = results[0];
      eyesOpenImagePath = results[1];

      console.log('   Eyes Closed: ' + (eyesClosedImagePath ? 'Success' : 'Failed'));
      console.log('   Eyes Open: ' + (eyesOpenImagePath ? 'Success' : 'Failed'));
    } catch (extractError) {
      console.error('   Error during extraction:', extractError.message);
    }
  }

  // Panel 1: Eyes-closed condition
  drawConditionPanel(doc, panelX1, panelY, panelW, panelH, 'Eyes-closed condition', eyesClosedImagePath);

  // Panel 2: Eyes-opened condition
  drawConditionPanel(doc, panelX2, panelY, panelW, panelH, 'Eyes-opened condition', eyesOpenImagePath);

  // ===== 4. COLOR LEGEND =====
  drawColorLegend(doc);

  // ===== 5. NOISY CHANNELS NOTE =====
  // Auto-detect from QEEG PDFs: check RELIABILITY ASSESSMENT on page 1
  var noisyNoteText = null;

  if (inputPdfPaths && inputPdfPaths.eyesClosed && inputPdfPaths.eyesOpen) {
    try {
      console.log('   Checking RELIABILITY ASSESSMENT for noisy channels...');
      var reliabilityResults = await Promise.all([
        extractReliabilityAssessment(inputPdfPaths.eyesClosed),
        extractReliabilityAssessment(inputPdfPaths.eyesOpen)
      ]);
      var combinedChannels = [...new Set([
        ...reliabilityResults[0].redChannels,
        ...reliabilityResults[1].redChannels
      ])];
      var totalRedChannels = combinedChannels.length;
      console.log('   Total unique red channels: ' + totalRedChannels);

      if (totalRedChannels >= 3) {
        noisyNoteText = 'Noisy Channels Noted. Interpret With Cancellation Algorithms.';
        console.log('   Adding noisy channels note (' + totalRedChannels + ' red channels)');
      }
    } catch (relErr) {
      console.error('   Error checking reliability:', relErr.message);
    }
  }

  // Fallback: also show if parameterNotes was passed manually
  if (!noisyNoteText && parameterNotes && parameterNotes.trim().length > 0) {
    noisyNoteText = parameterNotes.trim();
  }

  if (noisyNoteText) {
    doc.save();
    doc.font(FONTS.regular).fontSize(8).fillColor('#000000')
       .text('*' + noisyNoteText.toLowerCase(), 174, 735, { width: 248, align: 'center' });
    doc.restore();
  }

  // ===== 6. REFERENCES =====
  drawReferences(doc);

}

/**
 * Generate "Your Numbers At a Glance" page (Page 6) — SYNC version (fallback/preview)
 * Uses placeholder circles when no PDF paths provided
 */
function generateYourNumbersPage(doc, inputPdfPaths, parameterNotes) {
  var pw = LAYOUT.pageWidth;
  var ph = LAYOUT.pageHeight;

  // White background
  doc.rect(0, 0, pw, ph).fill('#FFFFFF');

  // Brain watermark
  try {
    if (fs.existsSync(BRAIN_BG_PATH)) {
      doc.save();
      doc.opacity(0.55);
      doc.image(BRAIN_BG_PATH, -100, 200, { width: 400 });
      doc.opacity(1);
      doc.restore();
    }
  } catch (e) { /* skip */ }

  // ===== 1. TOP IMAGE =====
  drawTopImage(doc);

  // ===== 2. TITLE + DESCRIPTION =====
  drawTitleSection(doc);

  // ===== 3. TWO PANELS =====
  var panelW = 241;
  var panelH = 256;
  var panelGap = 18;
  var panelX1 = 53;
  var panelY = 398;
  var panelX2 = panelX1 + panelW + panelGap;

  // Panel 1: Eyes-closed condition (placeholder)
  drawConditionPanel(doc, panelX1, panelY, panelW, panelH, 'Eyes-closed condition', null);

  // Panel 2: Eyes-opened condition (placeholder)
  drawConditionPanel(doc, panelX2, panelY, panelW, panelH, 'Eyes-opened condition', null);

  // ===== 4. COLOR LEGEND =====
  drawColorLegend(doc);

  // ===== 5. NOISY CHANNELS NOTE — only show if parameterNotes has content =====
  if (parameterNotes && parameterNotes.trim().length > 0) {
    var noteText = parameterNotes.trim();
    doc.save();
    doc.font(FONTS.regular).fontSize(8).fillColor('#000000')
       .text('*' + noteText.toLowerCase(), 174, 735, { width: 248, align: 'center' });
    doc.restore();
  }

  // ===== 6. REFERENCES =====
  drawReferences(doc);
}

/**
 * Draw top mixed-radius image shape
 */
function drawTopImage(doc) {
  var phX = 30;
  var phY = 18;
  var phW = 530;
  var phH = 166;

  var rTL = 50, rTR = 0, rBR = 50, rBL = 0;

  var cTL = { x: phX + rTL, y: phY + rTL };
  var cTR = { x: phX + phW - rTR, y: phY + rTR };
  var cBR = { x: phX + phW - rBR, y: phY + phH - rBR };
  var cBL = { x: phX + rBL, y: phY + phH - rBL };

  function fillMixedShape(color, opacity) {
    doc.save();
    if (opacity) doc.fillOpacity(opacity);
    if (rTL > 0) doc.circle(cTL.x, cTL.y, rTL).fill(color);
    if (rTR > 0) doc.circle(cTR.x, cTR.y, rTR).fill(color);
    if (rBR > 0) doc.circle(cBR.x, cBR.y, rBR).fill(color);
    if (rBL > 0) doc.circle(cBL.x, cBL.y, rBL).fill(color);
    var topMax = Math.max(rTL, rTR);
    var botMax = Math.max(rBL, rBR);
    doc.rect(cTL.x, phY, cTR.x - cTL.x, topMax).fill(color);
    doc.rect(cBL.x, phY + phH - botMax, cBR.x - cBL.x, botMax).fill(color);
    doc.rect(phX, phY + topMax, phW, phH - topMax - botMax).fill(color);
    doc.rect(phX, cTL.y, Math.max(rTL, rBL), cBL.y - cTL.y).fill(color);
    doc.rect(phX + phW - Math.max(rTR, rBR), cTR.y, Math.max(rTR, rBR), cBR.y - cTR.y).fill(color);
    if (opacity) doc.fillOpacity(1);
    doc.restore();
  }

  // Gray placeholder fill
  fillMixedShape('#D9D9D9');

  // Clip image inside the mixed-radius shape
  var kTL = rTL * 0.5523, kTR = rTR * 0.5523, kBR = rBR * 0.5523, kBL = rBL * 0.5523;
  try {
    if (fs.existsSync(PAGE6_IMG)) {
      doc.save();
      doc.moveTo(cTL.x, phY).lineTo(cTR.x, phY)
         .bezierCurveTo(cTR.x + kTR, phY, phX + phW, cTR.y - kTR, phX + phW, cTR.y)
         .lineTo(phX + phW, cBR.y)
         .bezierCurveTo(phX + phW, cBR.y + kBR, cBR.x + kBR, phY + phH, cBR.x, phY + phH)
         .lineTo(cBL.x, phY + phH)
         .bezierCurveTo(cBL.x - kBL, phY + phH, phX, cBL.y + kBL, phX, cBL.y)
         .lineTo(phX, cTL.y)
         .bezierCurveTo(phX, cTL.y - kTL, cTL.x - kTL, phY, cTL.x, phY)
         .closePath().clip();
      doc.image(PAGE6_IMG, phX, phY, { width: phW, height: phH, cover: [phW, phH] });
      doc.restore();
    }
  } catch (e) {
    // Silently skip
  }
}

/**
 * Draw title + description section
 */
function drawTitleSection(doc) {
  doc.save();
  doc.font(FONTS.bold).fontSize(24).fillColor('#227AFF')
     .text('Your Numbers', 30, 205, { lineBreak: false, characterSpacing: -0.24 });
  doc.restore();
  doc.save();
  doc.font(FONTS.bold).fontSize(24).fillColor('#227AFF')
     .text('At a Glance', 30, 234, { lineBreak: false, characterSpacing: -0.24 });
  doc.restore();

  doc.save();
  doc.font(FONTS.regular).fontSize(10).fillColor('#000000')
     .text(
       'In Quantitative EEG (qEEG) analysis, studying the brain\'s activity under both eyes open and eyes closed conditions provides crucial insights into brain function and neural dynamics. When the eyes are closed, the brain typically generates more alpha waves (8-13 Hz), especially in the occipital region, reflecting a relaxed, resting state. This allows clinicians to assess the brain\'s baseline activity, which is helpful for understanding how the brain functions in a low-stimulus environment. Conversely, with eyes open, the brain shifts to higher frequency activity, such as beta waves (13-30 Hz), as it processes visual input and engages in active.',
       205, 208, { width: 360, align: 'left', lineGap: 5 }
     );
  doc.restore();
}

/**
 * Draw a condition panel (Eyes-closed / Eyes-opened)
 * If imagePath is provided, shows the extracted brain map image
 * Otherwise falls back to placeholder circles
 */
function drawConditionPanel(doc, x, y, w, h, title, imagePath) {
  // Outer glow
  doc.save();
  doc.roundedRect(x - 3, y - 3, w + 6, h + 6, 10)
     .fillColor('#A8C8FF').fillOpacity(0.12).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Panel background
  doc.save();
  doc.roundedRect(x, y, w, h, 8)
     .fillColor('#FFFFFF').fill();
  doc.restore();

  // Panel border
  doc.save();
  doc.roundedRect(x, y, w, h, 8)
     .strokeColor('#D0D5DD').lineWidth(0.5).stroke();
  doc.restore();

  // Title
  doc.save();
  doc.font(FONTS.bold).fontSize(13.09).fillColor('#121E35')
     .text(title, x, y + 14, { width: w, align: 'center' });
  doc.restore();

  // If we have an extracted image, use it
  if (imagePath) {
    try {
      var imgY = y + 28;
      var imgH = h - 42;
      var imgW = w - 10;
      var image = doc.openImage(imagePath);
      var scale = Math.min(imgW / image.width, imgH / (image.height * 0.74));
      var renderW = image.width * scale;
      var renderH = image.height * scale;

      doc.save();
      doc.rect(x + 5, imgY, imgW, imgH).clip();
      doc.image(imagePath, x + 5 + (imgW - renderW) / 2, imgY - renderH * 0.18, {
        width: renderW,
        height: renderH
      });
      doc.restore();
      console.log('   Embedded extracted page image');
      return;
    } catch (imgErr) {
      console.error('   Error embedding image:', imgErr.message);
      // Fall through to placeholder
    }
  }

  // No image available — show empty placeholder (no static fake data)
  doc.save();
  doc.font(FONTS.regular).fontSize(10).fillColor('#AAAAAA')
     .text('Z-Score Brain Map\n(from uploaded PDF)', x, y + h / 2 - 15, { width: w, align: 'center', lineGap: 4 });
  doc.restore();
}

/**
 * Draw the color legend bar (z-scores)
 */
function drawColorLegend(doc) {
  var legX = 173;
  var legY = 669;
  var legW = 245;

  doc.save();
  doc.font(FONTS.bold).fontSize(8).fillColor('#000000')
     .text('Color Legend (z-scores)', legX, legY, { width: legW, align: 'center' });
  doc.restore();

  var barX = legX;
  var barY = legY + 14;
  var barW = legW;
  var barH = 10;

  var grad = doc.linearGradient(barX, barY, barX + barW, barY);
  grad.stop(0, '#0000FF')
      .stop(0.17, '#0088FF')
      .stop(0.33, '#00CCCC')
      .stop(0.50, '#00CC00')
      .stop(0.67, '#CCCC00')
      .stop(0.83, '#FF8800')
      .stop(1, '#FF0000');

  doc.save();
  doc.roundedRect(barX, barY, barW, barH, 2).fill(grad);
  doc.restore();

  var labels = ['-3', '-2', '-1', '0', '1', '2', '3'];
  var labelSpacing = barW / (labels.length - 1);

  doc.save();
  doc.font(FONTS.bold).fontSize(7).fillColor('#000000');
  for (var i = 0; i < labels.length; i++) {
    var lx = barX + i * labelSpacing;
    doc.text(labels[i], lx - 6, barY + barH + 3, { width: 12, align: 'center' });
  }
  doc.restore();
}

/**
 * Draw references at bottom
 */
function drawReferences(doc) {
  var references = [
    'Ref: Keizer AW. Standardization and Personalized Medicine Using Quantitative EEG in Clinical Settings. Clin EEG Neurosci. 2021 Mar;52(2):82-89. doi: 10.1177/1550059419874945. Epub 2019 Sep 11. PMID: 31507225.',
    'Kopańska M, Ochojska D, Dejnowicz-Velitchkov A, Banaś-Ząbczyk A. Quantitative Electroencephalography (QEEG) as an Innovative Diagnostic Tool in Mental Disorders. Int J Environ Res Public Health. 2022 Feb 21;19(4):2465. doi: 10.3390/ijerph19042465. PMID: 35206651; PMCID: PMC8879113.',
    'Livint Popa L, Dragos H, Pantelemon C, Verisezan Rosu O, Strilciuc S. The Role of Quantitative EEG in the Diagnosis of Neuropsychiatric Disorders. J Med Life. 2020 Jan-Mar;13(1):8-15. doi: 10.25122/jml-2019-0085. PMID: 32341694; PMCID: PMC7175442.',
    'Yener G, Öz D. Innovations in Neurophysiology and Their Use in Neuropsychiatry. Noro Psikiyatr Ars. 2022 Oct 21;59(Suppl 1):S67-S74. doi: 10.29399/npa.28234. PMID: 36578987; PMCID: PMC9767126.'
  ];

  doc.save();
  doc.font(FONTS.regular).fontSize(5).fillColor('#000000');
  var refText = references.join(' ');
  doc.text(refText, 10, 755, { width: 577, lineGap: 2.5 });
  doc.restore();
}

module.exports = { generateYourNumbersPage, generateYourNumbersPageAsync, extractPageImage };
