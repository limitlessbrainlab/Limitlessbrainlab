/**
 * Cover page preview — Page1.png bg + Ellipse 4 + Frame 15 + dynamic data
 * node server/test-cover-preview.js
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const patient = { name: 'John Smith', age: '35', dateOfBirth: '15/03/1990', gender: 'Male', assessmentDate: '21/02/2026', patientId: 'PREVIEW-001' };
const genAt = '12/01/2025, 12:17 pm';

(function() {
  const out = path.join(__dirname, 'cover-preview-v101.pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const ws = fs.createWriteStream(out);
  doc.pipe(ws);

  const PW = 595, PH = 842;

  // ===== LAYER 1: PAGE1.PNG — FULL BACKGROUND =====
  const bgPaths = [
    path.join(__dirname, '../public/assets/Page1.png'),
    path.resolve('public/assets/Page1.png')
  ];
  for (const bp of bgPaths) {
    try {
      if (fs.existsSync(bp)) {
        doc.image(bp, 0, 0, { width: PW, height: PH });
        break;
      }
    } catch(e) {}
  }

  // ===== LAYER 2: ELLIPSE 4.PNG =====
  const ellipsePaths = [
    path.join(__dirname, '../public/assets/Ellipse 4.png'),
    path.resolve('public/assets/Ellipse 4.png')
  ];
  for (const ep of ellipsePaths) {
    try {
      if (fs.existsSync(ep)) {
        const ellipseW = 680;
        const ellipseX = (PW - ellipseW) / 2;
        const ellipseY = 525;
        doc.image(ep, ellipseX, ellipseY, { width: ellipseW });
        break;
      }
    } catch(e) {}
  }

  // ===== LAYER 3: "REPORT" TEXT =====
  doc.fontSize(21).fillColor('#FFF').font('Helvetica-Bold')
     .text('REPORT', 0, 555, { width: PW, align: 'center', characterSpacing: 0.21, lineBreak: false });

  // ===== LAYER 4: FRAME 15 (1).PNG =====
  const frameW = 458, frameH = 180;
  const frameX = (PW - frameW) / 2;
  const frameY = 603;

  const framePaths = [
    path.join(__dirname, '../public/assets/Frame 15 (1).png'),
    path.resolve('public/assets/Frame 15 (1).png')
  ];
  // Outer oval/capsule border around frame
  const borderPadX = 10, borderPadY = 7;
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

  for (const fp of framePaths) {
    try {
      if (fs.existsSync(fp)) {
        doc.image(fp, frameX, frameY, { width: frameW });
        break;
      }
    } catch(e) {}
  }

  // ===== LAYER 5: DYNAMIC PATIENT DATA (values only — labels in Frame 15 image) =====
  // Row 1: NAME value (centered in name bubble)
  doc.fontSize(10).fillColor('#333333').font('Helvetica-Bold')
     .text(patient.name, frameX + 195, frameY + 26, { width: 160, lineBreak: false });

  // Row 2: DATE OF BIRTH (left) + DATE OF ASSESSMENT (right)
  const row2Y = frameY + 90;
  const colL = frameX + 82;
  const colR = frameX + 282;

  doc.fontSize(10).fillColor('#333333').font('Helvetica-Bold')
     .text(patient.dateOfBirth, colL, row2Y, { width: 160, lineBreak: false });
  doc.fontSize(10).fillColor('#333333').font('Helvetica-Bold')
     .text(patient.assessmentDate, colR, row2Y, { width: 160, lineBreak: false });

  // Row 3: AGE (left) + PROFESSION (right)
  const row3Y = frameY + 146;

  doc.fontSize(10).fillColor('#333333').font('Helvetica-Bold')
     .text(patient.age, colL, row3Y, { width: 160, lineBreak: false });
  doc.fontSize(10).fillColor('#333333').font('Helvetica-Bold')
     .text(patient.gender, colR, row3Y, { width: 160, lineBreak: false });

  // ===== LAYER 6: FOOTER =====
  doc.fontSize(6.5).fillColor('#FFF').fillOpacity(0.7).font('Helvetica')
     .text(`Report generated on: ${(function(){ var n=new Date(),d=String(n.getDate()).padStart(2,'0'),m=String(n.getMonth()+1).padStart(2,'0'),y=n.getFullYear(),h=n.getHours(),mn=String(n.getMinutes()).padStart(2,'0'),ap=h>=12?'pm':'am'; h=h%12||12; return d+'/'+m+'/'+y+', '+h+':'+mn+' '+ap; })()} by ${patient.patientId}`, 22, PH-30, { lineBreak: false });
  doc.fillOpacity(1);
  doc.fontSize(7.5).fillColor('#FFF').font('Helvetica-Bold').text('Page 1', PW-52, PH-30, { lineBreak: false });
  doc.fontSize(7).fillColor('#FFF').fillOpacity(0.8).font('Helvetica')
     .text('limitlessbrainlab-eight.vercel.app', PW-160, PH-15, { width: 148, align: 'right', lineBreak: false });
  doc.fillOpacity(1);
  doc.fontSize(5.5).fillColor('#FFF').fillOpacity(0.5).font('Helvetica-Oblique')
     .text('This AI generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 22, PH-15, { lineBreak: false });
  doc.fillOpacity(1);

  doc.end();
  ws.on('finish', () => console.log('Done!', out, `(${(fs.statSync(out).size/1024).toFixed(0)} KB)`));
})();
