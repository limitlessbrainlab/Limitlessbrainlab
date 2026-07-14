/**
 * PDF Styles and Constants
 * Shared styling configuration for the NeuroSense report
 */

const path = require('path');
const fs = require('fs');

// Logo paths - using path.resolve for better Windows compatibility
const LOGO_PATH_PRIMARY = path.resolve(__dirname, '../../../public/assets/Layer_1.png');
const LOGO_PATH_HEADER = path.resolve(__dirname, '../../../public/header logo.png');

// Use primary logo if exists, otherwise fallback to header logo
let LOGO_PATH = LOGO_PATH_PRIMARY;
if (!fs.existsSync(LOGO_PATH_PRIMARY) && fs.existsSync(LOGO_PATH_HEADER)) {
  LOGO_PATH = LOGO_PATH_HEADER;
}
console.log('Using LOGO_PATH:', LOGO_PATH);

/**
 * Logo to draw on report pages — the clinic's uploaded logo when set on the
 * doc (doc._clinicLogoPath, populated by geminiPdfGenerator), else the
 * NeuroSense default. Returns { path, isClinic }.
 */
function reportLogo(doc) {
  try {
    if (doc && doc._clinicLogoPath && fs.existsSync(doc._clinicLogoPath)) {
      return { path: doc._clinicLogoPath, isClinic: true };
    }
  } catch (e) { /* fall through to default */ }
  return { path: LOGO_PATH, isClinic: false };
}

/**
 * Draw the clinic's uploaded logo inside a fit box, on a white rounded chip
 * so it stays readable on dark page backgrounds (invisible on white pages).
 */
function drawClinicLogo(doc, logoPath, x, y, w, h) {
  doc.save();
  doc.roundedRect(x - 4, y - 4, w + 8, h + 8, 6).fill('#FFFFFF');
  doc.restore();
  doc.image(logoPath, x, y, { fit: [w, h], align: 'center', valign: 'center' });
}

const COLORS = {
  // Primary brand colors (NeuroSense Blue - consistent across header/footer)
  primary: '#121e36',      // NeuroSense Blue (header/footer color)
  primaryDark: '#1B2E5A',  // Dark Navy Blue (logo color)
  primaryLight: '#121e36', // Blue (for header/footer)

  // Secondary/Accent colors
  teal: '#121e36',         // Changed to blue (matching header/footer)
  tealLight: '#121e36',    // Blue
  tealDark: '#1B2E5A',     // Navy blue for contrast

  // Info box backgrounds
  lightBlue: '#E3F2FD',    // Light blue for info boxes
  veryLightBlue: '#F0F7FF', // Very light blue background
  pageBackground: '#EAF4FC', // Faint blue page background (matches logo color)

  // Branding colors
  navy: '#1B2E5A',         // Navy blue (from logo)
  turquoise: '#121e36',    // Blue accent

  // Status/classification colors
  orange: '#FF9800',
  green: '#4CAF50',
  red: '#F44336',
  purple: '#9C27B0',

  // Classification colors for scores
  low: '#FF9800',      // Orange - Low
  medium: '#4A90E2',   // Blue - Medium
  high: '#4CAF50',     // Green - High

  // Grayscale
  black: '#000000',
  darkGray: '#000000',
  gray: '#000000',
  mediumGray: '#000000',
  lightGray: '#CCCCCC',
  veryLightGray: '#F5F5F5',
  white: '#FFFFFF',

  // Brain wave gradient (for topography maps)
  gradient: {
    low: '#0000FF',     // Blue
    mid: '#00FF00',     // Green
    high: '#FF0000'     // Red
  }
};

// Outfit font paths
const OUTFIT_REGULAR_PATH = path.resolve(__dirname, '../../fonts/Outfit-Regular.ttf');
const OUTFIT_SEMIBOLD_PATH = path.resolve(__dirname, '../../fonts/Outfit-SemiBold.ttf');
const OUTFIT_BOLD_PATH = path.resolve(__dirname, '../../fonts/Outfit-Bold.ttf');

const FONTS = {
  // Font sizes
  title: 24,
  heading1: 20,
  heading2: 16,
  heading3: 14,
  body: 11,
  small: 9,
  tiny: 8,

  // Font families (PDFKit built-in)
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',

  // Outfit font paths
  outfitRegular: OUTFIT_REGULAR_PATH,
  outfitSemiBold: OUTFIT_SEMIBOLD_PATH,
  outfitBold: OUTFIT_BOLD_PATH
};

/**
 * Register Outfit fonts with a PDFKit document
 */
function registerOutfitFonts(doc) {
  if (fs.existsSync(OUTFIT_REGULAR_PATH)) {
    doc.registerFont('Outfit', OUTFIT_REGULAR_PATH);
  }
  if (fs.existsSync(OUTFIT_SEMIBOLD_PATH)) {
    doc.registerFont('Outfit-SemiBold', OUTFIT_SEMIBOLD_PATH);
  }
  if (fs.existsSync(OUTFIT_BOLD_PATH)) {
    doc.registerFont('Outfit-Bold', OUTFIT_BOLD_PATH);
  }
}

const LAYOUT = {
  // Page dimensions (A4)
  pageWidth: 595.28,
  pageHeight: 841.89,

  // Margins
  margin: {
    top: 50,
    bottom: 50,
    left: 50,
    right: 50
  },

  // Content area
  contentWidth: 495.28, // pageWidth - left - right margins
  contentHeight: 741.89, // pageHeight - top - bottom margins

  // Spacing
  lineHeight: 1.5,
  paragraphSpacing: 12,
  sectionSpacing: 24
};

// ===== COVER PAGE STYLES (Reference Design) =====
const COVER_STYLES = {
  // Page backgrounds
  whiteBackground: '#FFFFFF',

  // Decorative blue cross/puzzle shapes — Figma exact: X=15, Y=181, W=563, H=373, R=23
  crossShapes: {
    x: 15,
    y: 181,
    width: 563,
    height: 373,
    radius: 23
  },

  // Title panel (full-width gradient rectangle)
  titlePanel: {
    x: 10,
    y: 15,
    width: 569,
    height: 120,
    radius: 20,
    // Gradient: #001863 (dark navy) -> #0031C9 (bright blue), ~172deg (nearly top-to-bottom)
    gradientStart: '#001863',
    gradientEnd: '#0031C9'
  },

  // Bottom ellipse section
  ellipseSection: {
    x: -5,
    y: 548,
    width: 600,
    height: 450
  },

  // REPORT text
  reportText: {
    y: 600,
    fontSize: 21,
    characterSpacing: 0.21
  },

  // Glass container frame — tight
  glassContainer: {
    x: 68,
    y: 623,
    width: 458,
    height: 148,
    radius: 74
  },

  // Glass bubble styling (subtle, transparent glass pills)
  glassBubble: {
    fillColor: '#FFFFFF',
    fillOpacity: 0.08,
    strokeColor: '#FFFFFF',
    strokeOpacity: 0.18,
    lineWidth: 0.6,
    radius: 'pill'
  },

  // Compact bubble positions (1-2-2 grid) — minimal spacing
  // Calculated: FY=565, FH=148, bH=27, vGap=(148-81)/4=16.75
  // row1Y=565+17=582, row2Y=582+27+17=626, row3Y=626+27+17=670
  // colL=68+(458-358)/2=118, colR=118+170+18=306
  bubbles: {
    name: { x: 205, y: 640, width: 185, height: 27 },
    dob: { x: 118, y: 684, width: 170, height: 27 },
    assessment: { x: 306, y: 684, width: 170, height: 27 },
    age: { x: 118, y: 728, width: 170, height: 27 },
    profession: { x: 306, y: 728, width: 170, height: 27 }
  }
};

// Brain wave frequency bands
const BRAIN_WAVES = {
  delta: {
    name: 'Delta',
    range: '1-3 Hz',
    description: 'Deep sleep, restoration, healing',
    color: COLORS.purple
  },
  theta: {
    name: 'Theta',
    range: '4-8 Hz',
    description: 'Relaxation, creativity, meditation',
    color: COLORS.primary
  },
  alpha: {
    name: 'Alpha',
    range: '8-12 Hz',
    description: 'Calm, focused state, relaxed awareness',
    color: COLORS.teal
  },
  smr: {
    name: 'SMR',
    range: '12-15 Hz',
    description: 'Sensorimotor rhythm, focused relaxation',
    color: COLORS.lightGreen
  },
  beta: {
    name: 'Beta',
    range: '15-30 Hz',
    description: 'Active thinking, alertness, concentration',
    color: COLORS.orange
  },
  hiBeta: {
    name: 'High Beta',
    range: '25-30 Hz',
    description: 'High alertness, anxiety, stress',
    color: COLORS.danger
  }
};

// Symptom checklist (from sample PDF)
const SYMPTOMS_CHECKLIST = [
  'ADHD',
  'Depression',
  'Anxiety',
  'OCD',
  'Autism',
  'Schizophrenia',
  'Memory Issues',
  'Insomnia',
  'Epilepsy',
  'Substance Use Disorder',
  'Traumatic Brain Injury',
  'Tinnitus',
  'Dyslexia'
];

/**
 * Helper function to draw a rounded rectangle
 */
function drawRoundedRect(doc, x, y, width, height, radius, fillColor, strokeColor = null) {
  doc.save();

  if (fillColor) {
    doc.fillColor(fillColor);
  }

  if (strokeColor) {
    doc.strokeColor(strokeColor);
  }

  doc.roundedRect(x, y, width, height, radius);

  if (fillColor && strokeColor) {
    doc.fillAndStroke();
  } else if (fillColor) {
    doc.fill();
  } else if (strokeColor) {
    doc.stroke();
  }

  doc.restore();
}

/**
 * Helper function to draw a progress bar
 */
function drawProgressBar(doc, x, y, width, height, percentage, color) {
  // Background
  drawRoundedRect(doc, x, y, width, height, 3, COLORS.veryLightGray);

  // Fill
  const fillWidth = width * (percentage / 100);
  if (fillWidth > 0) {
    drawRoundedRect(doc, x, y, fillWidth, height, 3, color);
  }
}

/**
 * Helper function to add a page header with logo in top right corner
 */
function addPageHeader(doc, title) {
  const fs = require('fs');

  // Logo - top right corner, Figma: 87.85 x 59.58 at x:494, y:12
  const logoWidth = 88;
  const logoX = 494;
  const logoY = 12;

  try {
    const logo = reportLogo(doc);
    if (fs.existsSync(logo.path)) {
      if (logo.isClinic) {
        // Clinic logos have arbitrary aspect ratios — fit inside the header box.
        drawClinicLogo(doc, logo.path, logoX, logoY, logoWidth, 60);
      } else {
        // Use only width - no fit parameter for proper sizing
        doc.image(logo.path, logoX, logoY, {
          width: logoWidth
        });
      }
    }
  } catch (error) {
    console.log('Logo not found, skipping header logo');
  }
}

/**
 * Helper function to add a page footer - Teal bar style
 */
function addPageFooter(doc, text = '') {
  const footerY = 795;

  // Teal footer bar
  doc.rect(0, footerY, LAYOUT.pageWidth, 47).fill('#26A69A');

  // Disclaimer text (white, left side)
  doc.fillColor(COLORS.white)
     .font(FONTS.regular)
     .fontSize(7)
     .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.',
           LAYOUT.margin.left, footerY + 17, { width: 350 });

  // Website (white, right side)
  doc.fillColor(COLORS.white)
     .font(FONTS.bold)
     .fontSize(9)
     .text('limitlessbrainlab-eight.vercel.app', 450, footerY + 17);
}

/**
 * Helper function to draw faint blue page background
 */
function drawPageBackground(doc) {
  doc.save();
  doc.rect(0, 0, LAYOUT.pageWidth, LAYOUT.pageHeight)
     .fillColor(COLORS.pageBackground)
     .fill();
  doc.restore();
}

/**
 * Helper function to start a new section
 */
function startNewSection(doc, title, addHeader = true) {
  doc.addPage();

  // Add faint blue page background
  drawPageBackground(doc);

  if (addHeader) {
    addPageHeader(doc, title);
  }

  return LAYOUT.margin.top;
}

/**
 * Draw a glass-morphism bubble on dark background
 * Semi-transparent fill with thin white border and large border radius
 */
function drawGlassBubble(doc, x, y, width, height, radius) {
  const style = COVER_STYLES.glassBubble;
  const r = radius || height / 2;  // pill shape by default

  doc.save();
  doc.roundedRect(x, y, width, height, r)
     .fillColor(style.fillColor)
     .fillOpacity(style.fillOpacity)
     .fill();
  doc.roundedRect(x, y, width, height, r)
     .strokeColor(style.strokeColor)
     .strokeOpacity(style.strokeOpacity)
     .lineWidth(style.lineWidth)
     .stroke();
  doc.fillOpacity(1);
  doc.strokeOpacity(1);
  doc.restore();
}

/**
 * Draw decorative blue cross/puzzle shapes
 * Figma exact: X=15, Y=181, W=563, H=373, R=23
 * Fill: Linear gradient 180° (top→bottom), Drop shadow
 * Layered back-to-front: center vert → left arm → right arm → horizontal bar
 */
function drawCoverCrossShapes(doc) {
  var cs = COVER_STYLES.crossShapes;
  var bx = cs.x, by = cs.y, bw = cs.width, bh = cs.height, br = cs.radius;
  var cx = bx + bw / 2;       // 296.5
  var bottom = by + bh;        // 554

  // Cross piece dimensions
  var hBarH = 120;              // horizontal bar height
  var vBarW = 175;              // vertical center bar width
  var vBarX = cx - vBarW / 2;  // ~209
  var armW = 215;               // side arm width
  var armY = by + 105;          // arms start below h-bar overlap

  // Draw order: back-to-front for proper puzzle layering
  // 1. Center vertical (behind everything — darkest)
  // 2. Left arm
  // 3. Right arm
  // 4. Horizontal bar (on top — brightest)
  var layers = [
    { x: vBarX,            y: by,   w: vBarW,  h: bh * 0.80 },   // center vertical
    { x: bx,               y: armY, w: armW,   h: 193 },          // left arm
    { x: bx + bw - armW,   y: armY, w: armW,   h: 183 },          // right arm
    { x: bx,               y: by,   w: bw,     h: hBarH }          // horizontal bar (top)
  ];

  // --- Outer glow / shine ---
  doc.save();
  layers.forEach(function(l) {
    doc.roundedRect(l.x - 3, l.y - 3, l.w + 6, l.h + 6, br + 2)
       .fillColor('#A8C8FF').fillOpacity(0.15).fill();
  });
  doc.fillOpacity(1);
  doc.restore();

  // --- Drop shadow ---
  doc.save();
  layers.forEach(function(l) {
    doc.roundedRect(l.x + 4, l.y + 5, l.w, l.h, br)
       .fillColor('#000000').fillOpacity(0.18).fill();
  });
  doc.fillOpacity(1);
  doc.restore();

  // --- Draw each piece with the unified gradient (180° top→bottom) ---
  // Same absolute gradient coords → each piece picks up its natural shade
  doc.save();
  layers.forEach(function(l) {
    var grad = doc.linearGradient(0, by, 0, bottom);
    grad.stop(0, '#4A93FF')    // bright blue at top
        .stop(0.25, '#2D72E8')
        .stop(0.50, '#1A55C0')
        .stop(0.75, '#103FA0')
        .stop(1, '#0A2A70');   // deep navy at bottom
    doc.roundedRect(l.x, l.y, l.w, l.h, br).fill(grad);
  });
  doc.restore();
}

/**
 * Draw the NeuroSense brain logo (programmatic - brain icon + text)
 * Matches the reference design with brain neural network icon
 */
function drawNeuroSenseLogo(doc, logoX, logoY) {
  // Brain icon - circle with neural network brain inside
  const iconCx = logoX + 42;
  const iconCy = logoY + 22;
  const iconR = 22;

  doc.save();

  // Outer circle background
  doc.circle(iconCx, iconCy, iconR)
     .fillColor('#FFFFFF').fillOpacity(0.1).fill();
  doc.fillOpacity(1);

  // Outer circle border
  doc.circle(iconCx, iconCy, iconR)
     .strokeColor('#FFFFFF').lineWidth(1.8).stroke();

  // Brain left hemisphere outline
  doc.moveTo(iconCx, iconCy - iconR * 0.75)
     .bezierCurveTo(
       iconCx - iconR * 0.35, iconCy - iconR * 0.82,
       iconCx - iconR * 0.78, iconCy - iconR * 0.55,
       iconCx - iconR * 0.78, iconCy - iconR * 0.05
     )
     .bezierCurveTo(
       iconCx - iconR * 0.8, iconCy + iconR * 0.4,
       iconCx - iconR * 0.45, iconCy + iconR * 0.75,
       iconCx, iconCy + iconR * 0.75
     )
     .strokeColor('#FFFFFF').lineWidth(1.3).stroke();

  // Brain right hemisphere outline
  doc.moveTo(iconCx, iconCy - iconR * 0.75)
     .bezierCurveTo(
       iconCx + iconR * 0.35, iconCy - iconR * 0.82,
       iconCx + iconR * 0.78, iconCy - iconR * 0.55,
       iconCx + iconR * 0.78, iconCy - iconR * 0.05
     )
     .bezierCurveTo(
       iconCx + iconR * 0.8, iconCy + iconR * 0.4,
       iconCx + iconR * 0.45, iconCy + iconR * 0.75,
       iconCx, iconCy + iconR * 0.75
     )
     .strokeColor('#FFFFFF').lineWidth(1.3).stroke();

  // Brain fold - left horizontal
  doc.moveTo(iconCx - iconR * 0.65, iconCy - iconR * 0.1)
     .bezierCurveTo(
       iconCx - iconR * 0.3, iconCy - iconR * 0.25,
       iconCx - iconR * 0.15, iconCy - iconR * 0.05,
       iconCx, iconCy - iconR * 0.12
     )
     .strokeColor('#FFFFFF').lineWidth(0.9).stroke();

  // Brain fold - right horizontal
  doc.moveTo(iconCx + iconR * 0.65, iconCy - iconR * 0.1)
     .bezierCurveTo(
       iconCx + iconR * 0.3, iconCy - iconR * 0.25,
       iconCx + iconR * 0.15, iconCy - iconR * 0.05,
       iconCx, iconCy - iconR * 0.12
     )
     .strokeColor('#FFFFFF').lineWidth(0.9).stroke();

  // Neural connection dots
  var nodes = [
    [iconCx - iconR * 0.4, iconCy - iconR * 0.35],
    [iconCx - iconR * 0.25, iconCy + iconR * 0.2],
    [iconCx - iconR * 0.5, iconCy + iconR * 0.35],
    [iconCx + iconR * 0.4, iconCy - iconR * 0.35],
    [iconCx + iconR * 0.25, iconCy + iconR * 0.2],
    [iconCx + iconR * 0.5, iconCy + iconR * 0.35],
    [iconCx, iconCy - iconR * 0.5],
    [iconCx, iconCy + iconR * 0.45]
  ];

  // Draw neural connection lines
  doc.strokeColor('#FFFFFF').lineWidth(0.6).strokeOpacity(0.5);
  [[0,1],[1,2],[0,6],[3,4],[4,5],[3,6],[1,7],[4,7]].forEach(function(pair) {
    doc.moveTo(nodes[pair[0]][0], nodes[pair[0]][1])
       .lineTo(nodes[pair[1]][0], nodes[pair[1]][1]).stroke();
  });
  doc.strokeOpacity(1);

  // Draw neural dots
  nodes.forEach(function(n) {
    doc.circle(n[0], n[1], 1.8).fillColor('#FFFFFF').fill();
  });

  doc.restore();

  // "NeuroSense" text — centered under brain icon
  var textWidth = 120;
  var textX = iconCx - textWidth / 2;

  doc.fontSize(15)
     .fillColor('#FFFFFF')
     .font(FONTS.bold)
     .text('NeuroSense', textX, logoY + 48, {
       width: textWidth,
       align: 'center',
       lineBreak: false
     });

  // "Smart EEG Intelligence" tagline
  doc.fontSize(5.5)
     .fillColor('#FFFFFF')
     .fillOpacity(0.7)
     .font(FONTS.italic)
     .text('Smart EEG Intelligence', textX, logoY + 65, {
       width: textWidth,
       align: 'center',
       lineBreak: false
     });
  doc.fillOpacity(1);
}

/**
 * Draw the bottom curved section - ON TOP of doctor photo
 * Rounded rectangle approach matching Figma specs:
 * x=-21, y=peakY, w=637, h=fills to bottom, border-radius=23
 * Gradient: #227AFF (bright blue) -> dark navy
 * PLUS a quadratic curve overlay for the smooth top edge
 */
function drawCoverCurvedSection(doc, pageWidth, pageHeight) {
  var e = COVER_STYLES.ellipseSection;
  var ecx = e.x + e.width / 2;   // 297.5
  var ecy = e.y + e.height / 2;  // 803
  var erx = e.width / 2;          // 318.5
  var ery = e.height / 2;         // 282

  doc.save();
  // Gradient: dark navy at curve top, quickly transitions to bright blue
  var grad = doc.linearGradient(0, e.y, 0, pageHeight);
  grad.stop(0, '#001863').stop(0.15, '#0a3a8f').stop(0.35, '#1560c4').stop(0.55, '#1e6fdf').stop(1, '#227AFF');

  // Draw top arc of ellipse using true ellipse equation
  var startY = ecy - ery * Math.sqrt(Math.max(0, 1 - Math.pow((0 - ecx) / erx, 2)));
  doc.moveTo(0, startY);
  for (var i = 1; i <= 500; i++) {
    var x = (i / 500) * pageWidth;
    var t = (x - ecx) / erx;
    var tsq = t * t;
    if (tsq >= 1) continue;
    var y = ecy - ery * Math.sqrt(1 - tsq);
    doc.lineTo(x, y);
  }
  doc.lineTo(pageWidth, pageHeight);
  doc.lineTo(0, pageHeight);
  doc.closePath();
  doc.fill(grad);
  doc.restore();
}

/**
 * Draw gradient bridge - no longer needed
 */
function drawCoverGradientBridge(doc, pageWidth) {
  // No-op
}

/**
 * Draw a simple person/user icon (head + shoulders silhouette)
 */
function drawPersonIcon(doc, cx, cy, size, color) {
  doc.save();
  doc.fillColor(color);

  // Head (circle)
  doc.circle(cx, cy - size * 0.22, size * 0.3).fill();

  // Body/shoulders (arc shape)
  doc.moveTo(cx - size * 0.42, cy + size * 0.5)
     .quadraticCurveTo(cx - size * 0.42, cy + size * 0.08, cx, cy + size * 0.08)
     .quadraticCurveTo(cx + size * 0.42, cy + size * 0.08, cx + size * 0.42, cy + size * 0.5)
     .fill();

  doc.restore();
}

module.exports = {
  COLORS,
  FONTS,
  LAYOUT,
  COVER_STYLES,
  BRAIN_WAVES,
  SYMPTOMS_CHECKLIST,
  LOGO_PATH,
  reportLogo,
  drawClinicLogo,
  drawRoundedRect,
  drawGlassBubble,
  drawCoverCrossShapes,
  drawCoverCurvedSection,
  drawCoverGradientBridge,
  drawNeuroSenseLogo,
  drawPersonIcon,
  drawProgressBar,
  addPageHeader,
  addPageFooter,
  drawPageBackground,
  startNewSection,
  registerOutfitFonts
};
