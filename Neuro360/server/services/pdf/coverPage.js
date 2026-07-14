/**
 * Cover Page Generator
 * Layer 1: Page1.png (full background — title, logo, doctor, cross shapes)
 * Layer 2: Ellipse 4.png (blue curved section — replaces programmatic ellipse)
 * Layer 3: "REPORT" text
 * Layer 4: Frame 15 (1).png (glass bubble container image)
 * Layer 5: Dynamic patient data text overlaid on Frame 15
 * Layer 6: Footer
 */

const { FONTS, LAYOUT } = require('./pdfStyles');
const fs = require('fs');
const path = require('path');

function findAsset(name) {
  const candidates = [
    path.join(__dirname, '../../../public/assets/', name),
    path.join(__dirname, '../../public/assets/', name),
    path.resolve('public/assets/', name)
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

function generateCoverPage(doc, patientData, options) {
  if (!options || options.addPage !== false) {
    doc.addPage();
  }

  const PW = LAYOUT.pageWidth;   // 595.28
  const PH = LAYOUT.pageHeight;  // 841.89

  // ===== LAYER 1: PAGE1.PNG — FULL BACKGROUND =====
  const bgPath = findAsset('Page1.png');
  if (bgPath) {
    doc.image(bgPath, 0, 0, { width: PW, height: PH });
  }

  // Clinic's uploaded logo replaces the NeuroSense logo, which is baked into
  // the Page1.png background (top-left, white area) — white it out and draw
  // the clinic logo in its place.
  if (doc._clinicLogoPath && fs.existsSync(doc._clinicLogoPath)) {
    try {
      // Piecewise white-out: the blue title bubble's tab curl starts at
      // x≈144 above y≈84, but the baked wordmark tail reaches x≈155 below it.
      doc.rect(0, 0, 142, 132).fill('#FFFFFF');
      doc.rect(142, 84, 20, 48).fill('#FFFFFF');
      doc.image(doc._clinicLogoPath, 16, 16, { fit: [116, 100], align: 'center', valign: 'center' });
    } catch (e) {
      console.warn('   ⚠️ Cover clinic logo failed, keeping default:', e.message);
    }
  }

  // ===== LAYER 2: ELLIPSE 4.PNG — BLUE CURVED SECTION =====
  // Ellipse image: 637x564. Wider than page, top arc at doctor's waist level
  const ellipsePath = findAsset('Ellipse 4.png');
  if (ellipsePath) {
    const ellipseW = 680;
    const ellipseX = (PW - ellipseW) / 2;
    const ellipseY = 525;
    doc.image(ellipsePath, ellipseX, ellipseY, { width: ellipseW });
  }

  // ===== LAYER 3: "REPORT" TEXT =====
  doc.fontSize(21)
     .fillColor('#FFFFFF')
     .font(FONTS.bold)
     .text('REPORT', 0, 555, {
       width: PW,
       align: 'center',
       characterSpacing: 0.21,
       lineBreak: false
     });

  // ===== LAYER 4: FRAME 15 (1).PNG — GLASS BUBBLE CONTAINER =====
  // Frame 15 image: 458x187. Centered on page, compact below REPORT.
  const framePath = findAsset('Frame 15 (1).png');
  const frameW = 458;
  const frameH = 180;
  const frameX = (PW - frameW) / 2;  // ~47.5
  const frameY = 603;

  // Outer oval/capsule border around frame (like reference design)
  const borderPadX = 10;
  const borderPadY = 7;
  const outerX = frameX - borderPadX;
  const outerY = frameY - borderPadY;
  const outerW = frameW + borderPadX * 2;
  const outerH = frameH + borderPadY * 2;
  const outerR = outerH / 2;

  // Glass fill
  doc.save();
  doc.roundedRect(outerX, outerY, outerW, outerH, outerR)
     .fillColor('#FFFFFF').fillOpacity(0.06).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Glass border
  doc.save();
  doc.roundedRect(outerX, outerY, outerW, outerH, outerR)
     .strokeColor('#FFFFFF').strokeOpacity(0.25).lineWidth(1).stroke();
  doc.strokeOpacity(1);
  doc.restore();

  if (framePath) {
    doc.image(framePath, frameX, frameY, { width: frameW });
  }

  // ===== LAYER 5: DYNAMIC PATIENT DATA (values only — labels are in Frame 15 image) =====
  console.log('   📋 Cover page patient data:', JSON.stringify({
    name: patientData.name,
    dateOfBirth: patientData.dateOfBirth,
    assessmentDate: patientData.assessmentDate,
    dateOfRecording: patientData.dateOfRecording,
    age: patientData.age,
    gender: patientData.gender,
    profession: patientData.profession,
    occupation: patientData.occupation,
    patientId: patientData.patientId
  }));

  // Row 1: NAME value (centered in name bubble)
  drawBubbleValue(doc, patientData.name || 'N/A', frameX + 195, frameY + 26);

  // Row 2: DATE OF BIRTH (left) + DATE OF ASSESSMENT (right)
  const row2Y = frameY + 90;
  const colL = frameX + 82;
  const colR = frameX + 282;

  // Report date — prefer the original creation timestamp (passed on regeneration)
  // so rebuilt PDFs keep the original date for both assessment date and footer
  const parsedReportDate = patientData.reportGeneratedAt ? new Date(patientData.reportGeneratedAt) : null;
  const reportDate = parsedReportDate && !isNaN(parsedReportDate.getTime()) ? parsedReportDate : new Date();

  drawBubbleValue(doc, formatDateDDMMYYYY(patientData.dateOfBirth || patientData.dob) || 'N/A', colL, row2Y);
  drawBubbleValue(doc, patientData.assessmentDate || patientData.dateOfRecording || reportDate.toLocaleDateString('en-GB'), colR, row2Y);

  // Row 3: AGE (left) + PROFESSION (right)
  const row3Y = frameY + 146;

  drawBubbleValue(doc, patientData.age ? String(patientData.age) : 'N/A', colL, row3Y);
  drawBubbleValue(doc, patientData.profession || patientData.occupation || 'N/A', colR, row3Y);

  // ===== LAYER 6: FOOTER =====
  const now = reportDate;
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  var hrs = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'pm' : 'am';
  hrs = hrs % 12 || 12;
  const timestamp = `${dd}/${mm}/${yyyy}, ${hrs}:${mins} ${ampm}`;

  doc.fontSize(6.5)
     .fillColor('#FFFFFF')
     .fillOpacity(0.7)
     .font(FONTS.regular)
     .text(`Report generated on: ${timestamp} by Limitless Brain Lab`, 22, PH - 30, { lineBreak: false });
  doc.fillOpacity(1);

  doc.fontSize(7.5)
     .fillColor('#FFFFFF')
     .font(FONTS.bold)
     .text('Page 1', PW - 52, PH - 30, { lineBreak: false });

  doc.fontSize(7)
     .fillColor('#FFFFFF')
     .fillOpacity(0.8)
     .font(FONTS.regular)
     .text('limitlessbrainlab-eight.vercel.app', PW - 160, PH - 15, {
       width: 148,
       align: 'right',
       lineBreak: false
     });
  doc.fillOpacity(1);

  doc.fontSize(5.5)
     .fillColor('#FFFFFF')
     .fillOpacity(0.5)
     .font(FONTS.italic)
     .text('This AI generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 22, PH - 15, { lineBreak: false });
  doc.fillOpacity(1);
}

function drawBubbleValue(doc, value, x, y) {
  doc.fontSize(10)
     .fillColor('#FFFFFF')
     .font(FONTS.bold)
     .text(value, x, y, {
       width: 170,
       lineBreak: false
     });
}

// Patient DOB arrives as the raw DB value (ISO yyyy-mm-dd) — render day-first.
// Anything else (already dd/mm/yyyy, 'Not specified', empty) passes through.
function formatDateDDMMYYYY(value) {
  const s = String(value || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
}

module.exports = { generateCoverPage, formatDateDDMMYYYY };
