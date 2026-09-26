/**
 * Brain Map Comparison Page Generator
 * Displays side-by-side Z-score analysis brain maps from Eyes Closed and Eyes Open PDFs
 * Uses pdfjs-dist for PDF rendering (pure JavaScript, no system dependencies)
 */

const { COLORS, FONTS, LAYOUT, addPageFooter, drawRoundedRect } = require('./pdfStyles');
const path = require('path');
const { getReportUploadDir } = require('../reportRuntime');
const fs = require('fs');

// Use shared colors from pdfStyles - Using consistent deep navy blue throughout PDF
const TEAL = '#121e36';           // Deep navy blue for consistency
const PRIMARY_BLUE = '#121e36';
const LIGHT_BLUE = COLORS.lightBlue;
const DARK_GRAY = COLORS.darkGray;
const WHITE = COLORS.white;

/**
 * Extract RELIABILITY ASSESSMENT from page 1 of PDF and count red (bad) channels.
 * The table has channel names (Fp1, Fp2, F3...) with Split-Half Reliability scores (0.0 - 1.0).
 * Channels with reliability score < 0.90 are considered noisy/red.
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<{redChannels: string[], count: number}>} Red channel names and count
 */
async function extractReliabilityAssessment(pdfPath) {
  const RELIABILITY_THRESHOLD = 0.90; // Channels below this are considered noisy/red

  try {
    console.log(`   🔍 Checking RELIABILITY ASSESSMENT in: ${path.basename(pdfPath)}`);

    // Dynamic import for pdfjs-dist
    let pdfjsLib;
    try {
      pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch (e) {
      console.log('   ⚠️  pdfjs-dist not available:', e.message);
      return { redChannels: [], count: 0 };
    }

    // Read PDF file
    const dataBuffer = fs.readFileSync(pdfPath);

    // Load PDF
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      standardFontDataUrl: null,
      useSystemFonts: true
    });

    const pdfDoc = await loadingTask.promise;

    // Get page 1
    const page = await pdfDoc.getPage(1);
    const textContent = await page.getTextContent();

    // Collect all text items
    let pageText = '';
    textContent.items.forEach((item) => {
      if (item.str) {
        pageText += item.str + ' ';
      }
    });

    console.log(`   📄 Page 1 text length: ${pageText.length} chars`);

    // Check if text contains RELIABILITY ASSESSMENT section
    const hasReliabilitySection = /RELIABILITY[\s\S]*ASSESSMENT/i.test(pageText);

    if (!hasReliabilitySection) {
      console.log('   ⚠️  No RELIABILITY ASSESSMENT section found on page 1');
      return { redChannels: [], count: 0 };
    }

    console.log('   ✅ Found RELIABILITY ASSESSMENT section');

    // Known EEG channel names
    const channelNames = ['FP1','FP2','F3','F4','C3','C4','P3','P4','O1','O2','F7','F8','T3','T4','T5','T6','FZ','CZ','PZ','A1','A2','T7','T8','P7','P8'];

    // Parse channel-score pairs from the text
    // The table text typically appears as: "Fp1 0.87 Fp2 0.9 F3 0.94 ..."
    // Match patterns like: ChannelName followed by a decimal number (0.xx)
    const redChannels = [];
    const channelScorePattern = /\b(Fp1|Fp2|F3|F4|C3|C4|P3|P4|O1|O2|F7|F8|T3|T4|T5|T6|Fz|Cz|Pz|A1|A2|T7|T8|P7|P8)\b\s*(0?\.\d+|1\.0{0,2}|0|1)/gi;

    let match;
    while ((match = channelScorePattern.exec(pageText)) !== null) {
      const chName = match[1].toUpperCase();
      const score = parseFloat(match[2]);

      if (!isNaN(score) && score < RELIABILITY_THRESHOLD) {
        if (!redChannels.includes(chName)) {
          redChannels.push(chName);
          console.log(`   🔴 ${chName}: ${score} (below ${RELIABILITY_THRESHOLD})`);
        }
      }
    }

    console.log(`   📊 Red channels (score < ${RELIABILITY_THRESHOLD}): ${redChannels.length > 0 ? redChannels.join(', ') : 'None'}`);

    return { redChannels, count: redChannels.length };

  } catch (error) {
    console.error(`   ❌ Error checking reliability:`, error.message);
    return { redChannels: [], count: 0 };
  }
}

/**
 * Extract page 2 image from a PDF file using pdf-to-img
 * Crops the header portion to show only the brain map channels grid
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputDir - Directory to save the extracted image
 * @param {string} prefix - Prefix for the output filename
 * @returns {Promise<string|null>} Path to the extracted image or null
 */
async function extractPageImage(pdfPath, outputDir, prefix) {
  try {
    console.log(`📄 Extracting page 2 from: ${path.basename(pdfPath)}`);

    // Dynamic imports
    let pdfToImg;
    let canvasModule;
    try {
      pdfToImg = await import('pdf-to-img');
      canvasModule = require('canvas');
      console.log('   ✅ pdf-to-img and canvas loaded successfully');
    } catch (e) {
      console.log('⚠️  Required packages not available:', e.message);
      return null;
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert PDF pages with scale for good quality
    console.log('   📖 Loading PDF document...');
    const document = await pdfToImg.pdf(pdfPath, { scale: 2.0 });

    // Iterate through pages to get page 2
    let pageNum = 0;
    let outputPath = null;

    for await (const imageBuffer of document) {
      pageNum++;
      if (pageNum === 2) {
        console.log(`   📊 Original image size: ${Math.round(imageBuffer.length / 1024)} KB`);

        // Load image into canvas for cropping
        const img = await canvasModule.loadImage(imageBuffer);
        const originalWidth = img.width;
        const originalHeight = img.height;

        console.log(`   📐 Original dimensions: ${originalWidth} x ${originalHeight}`);

        // Crop settings - remove top 18% (header with EEG ID, title, etc.)
        // and bottom 8% (page number and color legend)
        const cropTopPercent = 0.18;  // Remove header
        const cropBottomPercent = 0.08;  // Remove footer

        const cropTop = Math.round(originalHeight * cropTopPercent);
        const cropBottom = Math.round(originalHeight * cropBottomPercent);
        const newHeight = originalHeight - cropTop - cropBottom;

        console.log(`   ✂️  Cropping: top=${cropTop}px, bottom=${cropBottom}px`);
        console.log(`   📐 New dimensions: ${originalWidth} x ${newHeight}`);

        // Create cropped canvas
        const croppedCanvas = canvasModule.createCanvas(originalWidth, newHeight);
        const ctx = croppedCanvas.getContext('2d');

        // Draw the cropped portion (skip header, keep brain maps)
        ctx.drawImage(
          img,
          0, cropTop,                    // Source x, y (start after header)
          originalWidth, newHeight,       // Source width, height
          0, 0,                           // Destination x, y
          originalWidth, newHeight        // Destination width, height
        );

        // Save cropped image as PNG
        outputPath = path.join(outputDir, `${prefix}.png`);
        const croppedBuffer = croppedCanvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, croppedBuffer);

        console.log(`   ✅ Page 2 cropped and saved to: ${outputPath}`);
        console.log(`   📊 Cropped image size: ${Math.round(croppedBuffer.length / 1024)} KB`);
        break;
      }
    }

    if (!outputPath) {
      console.log(`   ⚠️  PDF has only ${pageNum} page(s), need at least 2`);
      return null;
    }

    return outputPath;

  } catch (error) {
    console.error(`❌ Error extracting image from ${pdfPath}:`, error.message);
    return null;
  }
}

/**
 * Generate the Brain Map Comparison page
 * @param {Object} doc - PDFKit document
 * @param {Object} inputPdfPaths - Object containing paths to input PDFs
 * @param {string} inputPdfPaths.eyesOpen - Path to Eyes Open PDF
 * @param {string} inputPdfPaths.eyesClosed - Path to Eyes Closed PDF
 */
async function generateBrainMapComparisonPage(doc, inputPdfPaths = {}) {
  console.log('\n🗺️  Generating Brain Map Comparison Page...');
  console.log('   Input PDF paths:', JSON.stringify(inputPdfPaths, null, 2));

  // Logo is already added by addPageHeader in geminiPdfGenerator.js - don't add again

  // Title - centered, no background, shifted down
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor(PRIMARY_BLUE)
     .text('YOUR NUMBERS AT A GLANCE', 0, 45, { width: 595, align: 'center' });

  let yPos = 85;  // More space between heading and content box

  // qEEG explanation text box
  const explanationText = 'In Quantitative EEG (qEEG) analysis, studying the brain\'s activity under both eyes open and eyes closed conditions provides crucial insights into brain function and neural dynamics. When the eyes are closed, the brain typically generates more alpha waves (8-13 Hz), especially in the occipital region, reflecting a relaxed, resting state. This allows clinicians to assess the brain\'s baseline activity, which is helpful for understanding how the brain functions in a low-stimulus environment. Conversely, with eyes open, the brain shifts to higher frequency activity, such as beta waves (13-30 Hz), as it processes visual input and engages in active.';

  // Draw light blue background for explanation - bigger box
  doc.roundedRect(40, yPos, 515, 85, 8)
     .fillColor(LIGHT_BLUE)
     .fill();

  doc.fontSize(10)  // Increased font size
     .font('Helvetica')
     .fillColor(DARK_GRAY)
     .text(explanationText, 50, yPos + 10, { width: 495, align: 'justify', lineGap: 3 });

  yPos += 105;  // Adjusted spacing

  // Two column layout for brain maps
  const colWidth = 240;
  const colGap = 15;
  const leftColX = 50;
  const rightColX = leftColX + colWidth + colGap;

  // Column headers
  doc.fontSize(13.09)
     .font('Helvetica-Bold')
     .fillColor(PRIMARY_BLUE);

  doc.text('Eyes-closed condition', leftColX, yPos, { width: colWidth, align: 'center' });
  doc.text('Eyes-opened condition', rightColX, yPos, { width: colWidth, align: 'center' });

  yPos += 20;  // Reduced space between heading and images

  // Check if we have input PDF paths and try to extract images
  let eyesClosedImagePath = null;
  let eyesOpenImagePath = null;

  if (inputPdfPaths && inputPdfPaths.eyesClosed && inputPdfPaths.eyesOpen) {
    console.log('   📁 PDF paths provided, extracting page 2 images...');

    const tempDir = path.join(getReportUploadDir(), 'temp');

    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();

    // Try to extract images in parallel
    try {
      const [ecImage, eoImage] = await Promise.all([
        extractPageImage(
          inputPdfPaths.eyesClosed,
          tempDir,
          `ec_brain_map_${timestamp}`
        ),
        extractPageImage(
          inputPdfPaths.eyesOpen,
          tempDir,
          `eo_brain_map_${timestamp}`
        )
      ]);

      eyesClosedImagePath = ecImage;
      eyesOpenImagePath = eoImage;

      console.log('   📸 Extraction results:');
      console.log(`      Eyes Closed: ${eyesClosedImagePath ? '✅ Success' : '❌ Failed'}`);
      console.log(`      Eyes Open: ${eyesOpenImagePath ? '✅ Success' : '❌ Failed'}`);
    } catch (extractError) {
      console.error('   ❌ Error during extraction:', extractError.message);
    }
  } else {
    console.log('   ⚠️  No PDF paths provided or incomplete paths');
  }

  // Image dimensions - sized to fit on page
  const imageWidth = 220;
  const imageHeight = 400;  // Adjusted for better spacing

  // Draw images or placeholders
  if (eyesClosedImagePath && fs.existsSync(eyesClosedImagePath)) {
    // Draw the extracted Eyes Closed image
    try {
      console.log('   🖼️  Embedding Eyes Closed image...');
      doc.image(eyesClosedImagePath, leftColX + 10, yPos, {
        width: imageWidth,
        height: imageHeight,
        fit: [imageWidth, imageHeight],
        align: 'center',
        valign: 'center'
      });
      console.log('   ✅ Eyes Closed image embedded');
    } catch (imgError) {
      console.error('   ❌ Error embedding Eyes Closed image:', imgError.message);
      drawPlaceholder(doc, leftColX + 10, yPos, imageWidth, imageHeight, 'Eyes Closed Z-Score Map\n\nError loading image');
    }
  } else {
    // Draw placeholder for Eyes Closed
    console.log('   ⚠️  Using placeholder for Eyes Closed');
    drawPlaceholder(doc, leftColX + 10, yPos, imageWidth, imageHeight, 'Eyes Closed\nZ-Score Analysis\n\n(Image from uploaded PDF\nPage 2)');
  }

  if (eyesOpenImagePath && fs.existsSync(eyesOpenImagePath)) {
    // Draw the extracted Eyes Open image
    try {
      console.log('   🖼️  Embedding Eyes Open image...');
      doc.image(eyesOpenImagePath, rightColX + 10, yPos, {
        width: imageWidth,
        height: imageHeight,
        fit: [imageWidth, imageHeight],
        align: 'center',
        valign: 'center'
      });
      console.log('   ✅ Eyes Open image embedded');
    } catch (imgError) {
      console.error('   ❌ Error embedding Eyes Open image:', imgError.message);
      drawPlaceholder(doc, rightColX + 10, yPos, imageWidth, imageHeight, 'Eyes Open Z-Score Map\n\nError loading image');
    }
  } else {
    // Draw placeholder for Eyes Open
    console.log('   ⚠️  Using placeholder for Eyes Open');
    drawPlaceholder(doc, rightColX + 10, yPos, imageWidth, imageHeight, 'Eyes Open\nZ-Score Analysis\n\n(Image from uploaded PDF\nPage 2)');
  }

  yPos += imageHeight + 10;  // Reduced space between images and legend

  // Color legend label
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .fillColor(DARK_GRAY)
     .text('Color Legend (z-scores)', leftColX, yPos, { width: 495, align: 'center' });

  yPos += 12;

  // Draw color legend bar
  drawColorLegend(doc, 175, yPos, 245);

  yPos += 30; // Space after legend

  // Check RELIABILITY ASSESSMENT from both PDFs
  let totalRedChannels = 0;
  let allRedChannels = [];

  if (inputPdfPaths && inputPdfPaths.eyesClosed && inputPdfPaths.eyesOpen) {
    try {
      console.log('\n   🔍 Checking RELIABILITY ASSESSMENT for red channels...');

      const [ecReliability, eoReliability] = await Promise.all([
        extractReliabilityAssessment(inputPdfPaths.eyesClosed),
        extractReliabilityAssessment(inputPdfPaths.eyesOpen)
      ]);

      // Combine red channels from both PDFs (unique)
      const combinedChannels = [...new Set([...ecReliability.redChannels, ...eoReliability.redChannels])];
      totalRedChannels = combinedChannels.length;
      allRedChannels = combinedChannels;

      console.log(`   📊 Eyes Closed red channels: ${ecReliability.count}`);
      console.log(`   📊 Eyes Open red channels: ${eoReliability.count}`);
      console.log(`   📊 Total unique red channels: ${totalRedChannels}`);

    } catch (reliabilityError) {
      console.error('   ❌ Error checking reliability:', reliabilityError.message);
    }
  }

  // Add note if 3 or more red channels found
  if (totalRedChannels >= 3) {
    console.log(`   📝 Adding reliability note (${totalRedChannels} red channels found)`);

    const noteText = `Noisy Channels Noted. Interpret With Cancellation Algorithms.`;

    // Draw note box - matching content colors
    doc.roundedRect(40, yPos, 515, 45, 6)
       .fillColor(LIGHT_BLUE)  // Light blue background (same as explanation box)
       .fill();

    doc.roundedRect(40, yPos, 515, 45, 6)
       .strokeColor(PRIMARY_BLUE)  // Deep navy border
       .lineWidth(1)
       .stroke();

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor(DARK_GRAY)  // Dark gray text (same as content)
       .text(noteText, 50, yPos + 10, { width: 495, align: 'left', lineGap: 2 });

    yPos += 55;
  }

  // Cleanup temporary images
  if (eyesClosedImagePath && fs.existsSync(eyesClosedImagePath)) {
    try {
      fs.unlinkSync(eyesClosedImagePath);
      console.log('   🗑️  Cleaned up Eyes Closed temp image');
    } catch (e) {}
  }
  if (eyesOpenImagePath && fs.existsSync(eyesOpenImagePath)) {
    try {
      fs.unlinkSync(eyesOpenImagePath);
      console.log('   🗑️  Cleaned up Eyes Open temp image');
    } catch (e) {}
  }

  console.log('   ✅ Brain Map Comparison page complete\n');
}

/**
 * Draw a placeholder box when image extraction is not available
 */
function drawPlaceholder(doc, x, y, width, height, text) {
  // Draw border
  doc.roundedRect(x, y, width, height, 5)
     .strokeColor('#CCCCCC')
     .lineWidth(2)
     .stroke();

  // Draw diagonal lines (placeholder pattern)
  doc.save();
  doc.rect(x, y, width, height).clip();

  for (let i = -height; i < width; i += 20) {
    doc.moveTo(x + i, y)
       .lineTo(x + i + height, y + height)
       .strokeColor('#EEEEEE')
       .lineWidth(1)
       .stroke();
  }
  doc.restore();

  // Draw text
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#000000')
     .text(text, x, y + height/2 - 30, {
       width: width,
       align: 'center',
       lineGap: 3
     });
}

/**
 * Draw color legend for Z-scores
 */
function drawColorLegend(doc, x, y, width) {
  const height = 15;
  const colors = [
    { color: '#0000FF', label: '-3' },  // Blue (low)
    { color: '#00FFFF', label: '-2' },  // Cyan
    { color: '#00FF00', label: '-1' },  // Green
    { color: '#FFFF00', label: '0' },   // Yellow (neutral)
    { color: '#FFA500', label: '1' },   // Orange
    { color: '#FF0000', label: '2' },   // Red
    { color: '#800000', label: '3' }    // Dark Red (high)
  ];

  const segmentWidth = width / colors.length;

  colors.forEach((item, index) => {
    const segX = x + (index * segmentWidth);

    // Draw color segment
    doc.rect(segX, y, segmentWidth, height)
       .fillColor(item.color)
       .fill();

    // Draw label below
    doc.fontSize(7)
       .font('Helvetica')
       .fillColor(DARK_GRAY)
       .text(item.label, segX, y + height + 3, {
         width: segmentWidth,
         align: 'center'
       });
  });

  // Border around the legend
  doc.rect(x, y, width, height)
     .strokeColor('#333333')
     .lineWidth(0.5)
     .stroke();
}

/**
 * Synchronous version that just creates the page layout
 * (without extracting images from PDFs)
 */
function generateBrainMapComparisonPageSync(doc, algorithmResults = null) {
  // Logo is already added by addPageHeader in geminiPdfGenerator.js - don't add again

  // Title - centered, no background, shifted down
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor(PRIMARY_BLUE)
     .text('YOUR NUMBERS AT A GLANCE', 0, 45, { width: 595, align: 'center' });

  let yPos = 85;  // More space between heading and content box

  // qEEG explanation text box
  const explanationText = 'In Quantitative EEG (qEEG) analysis, studying the brain\'s activity under both eyes open and eyes closed conditions provides crucial insights into brain function and neural dynamics. When the eyes are closed, the brain typically generates more alpha waves (8-13 Hz), especially in the occipital region, reflecting a relaxed, resting state. This allows clinicians to assess the brain\'s baseline activity, which is helpful for understanding how the brain functions in a low-stimulus environment. Conversely, with eyes open, the brain shifts to higher frequency activity, such as beta waves (13-30 Hz), as it processes visual input and engages in active.';

  // Draw light blue background for explanation - bigger box
  doc.roundedRect(40, yPos, 515, 85, 8)
     .fillColor(LIGHT_BLUE)
     .fill();

  doc.fontSize(10)  // Increased font size
     .font('Helvetica')
     .fillColor(DARK_GRAY)
     .text(explanationText, 50, yPos + 10, { width: 495, align: 'justify', lineGap: 3 });

  yPos += 105;  // Adjusted spacing

  // Two column layout for brain maps
  const colWidth = 240;
  const colGap = 15;
  const leftColX = 50;
  const rightColX = leftColX + colWidth + colGap;

  // Column headers
  doc.fontSize(13.09)
     .font('Helvetica-Bold')
     .fillColor(PRIMARY_BLUE);

  doc.text('Eyes-closed condition', leftColX, yPos, { width: colWidth, align: 'center' });
  doc.text('Eyes-opened condition', rightColX, yPos, { width: colWidth, align: 'center' });

  yPos += 20;  // Reduced space between heading and images

  // Image placeholder dimensions - sized to fit on page
  const imageWidth = 220;
  const imageHeight = 400;  // Adjusted for better spacing

  // Draw placeholders
  drawPlaceholder(doc, leftColX + 10, yPos, imageWidth, imageHeight, 'Eyes Closed\nZ-Score Analysis\n\nSummary of the Z-score\nanalyses');
  drawPlaceholder(doc, rightColX + 10, yPos, imageWidth, imageHeight, 'Eyes Open\nZ-Score Analysis\n\nSummary of the Z-score\nanalyses');

  yPos += imageHeight + 10;  // Reduced space between images and legend

  // Color legend label
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .fillColor(DARK_GRAY)
     .text('Color Legend (z-scores)', leftColX, yPos, { width: 495, align: 'center' });

  yPos += 12;

  // Draw color legend bar
  drawColorLegend(doc, 175, yPos, 245);
}

module.exports = {
  generateBrainMapComparisonPage,
  generateBrainMapComparisonPageSync,
  extractPageImage,
  extractReliabilityAssessment
};
