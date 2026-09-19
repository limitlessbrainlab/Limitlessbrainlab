const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// Pure-JS 12-page Performance Report renderer — the DEFAULT (PDF_RENDERER unset
// or 'pdfkit'). Deliberately browser-free: rendering a Chromium PDF needs
// ~300-400MB on top of Node, which froze/killed the 512MB Render free-tier
// instance outright (health checks, app-version polls and SSE all went dark
// mid-render). This renderer is a faithful vector port of the reference HTML
// design in templates/brainReport12Page.js — same gradients, cards, progress
// bars, badges and page furniture — drawn directly with PDFKit at a fraction
// of the memory. Set PDF_RENDERER=puppeteer (after a plan upgrade) for the
// HTML/Chromium layout instead — see performanceReportBuilder.js.

const COLORS = {
  navy: '#15315f',
  blue: '#1e63b4',
  badgeBlue: '#2f7ff0',
  cyan: '#1f93c4',
  text: '#1f2a44',
  body: '#41506c',
  muted: '#5b6b86',
  faint: '#8aa0c0',
  ghost: '#9aa8c0',
  line: '#e5e9f0',
  track: '#eef1f6',
  darkA: '#123a76',
  darkB: '#1e63b4',
  green: '#16a34a',
  blueMid: '#2563eb',
  orange: '#ea580c',
  red: '#dc2626',
};

// Status-kind palettes (badges, tone cards) — mirrors statusKind()/KIND_* in
// the HTML template.
const KIND = {
  good: { color: '#16a34a', bg: '#dcfce7', fg: '#15803d' },
  warn: { color: '#d97706', bg: '#fef3c7', fg: '#b45309' },
  bad: { color: '#ea580c', bg: '#ffedd5', fg: '#c2410c' },
};

// Tinted signal/strengths/watch-zone/callout card palettes (TONE in template).
const TONE = {
  good: { bg: '#f0fdf4', bd: '#bbf7d0', dot: '#16a34a', h: '#15803d' },
  warn: { bg: '#fffbeb', bd: '#fde68a', dot: '#d97706', h: '#b45309' },
  info: { bg: '#eff6ff', bd: '#bfdbfe', dot: '#2563eb', h: '#1e40af' },
  plain: { bg: '#f8fafc', bd: '#e5e9f0', dot: '#64748b', h: '#334155' },
};

// Fixed band palette for the brainwave profile rows (profileRows in template).
const WAVE_COLORS = {
  Delta: '#2b6cb0',
  Theta: '#3b82f6',
  Alpha: '#14b8c4',
  Beta: '#94a3c8',
  'Hi-Beta': '#94a3c8',
};

// PDFKit has no colour-emoji font. Reuse the installed Twemoji artwork so the
// PDFKit report carries the same marker icons as the approved HTML template.
const EMOJI_FILES = {
  '⚡': '26a1', '🧠': '1f9e0', '🎯': '1f3af', '📚': '1f4da',
  '🔋': '1f50b', '💗': '1f497', '🎨': '1f3a8', '✳️': '2733',
  '🟠': '1f7e0', '🛡️': '1f6e1', '🥗': '1f957', '🏃': '1f3c3',
  '😴': '1f634', '🧬': '1f9ec', '⭐': '2b50', '✨': '2728', '🔍': '1f50d',
};
const emojiPngs = new Map();

async function prepareEmojiPngs() {
  await Promise.all(Object.entries(EMOJI_FILES).map(async ([emoji, file]) => {
    if (emojiPngs.has(emoji)) return;
    try {
      // Twemoji SVGs rely on a viewBox; node-canvas requires explicit dimensions.
      const svg = fs.readFileSync(require.resolve(`@twemoji/svg/${file}.svg`), 'utf8')
        .replace('<svg ', '<svg width="48" height="48" ');
      const image = await loadImage(Buffer.from(svg));
      const canvas = createCanvas(48, 48);
      canvas.getContext('2d').drawImage(image, 0, 0, 48, 48);
      emojiPngs.set(emoji, canvas.toBuffer('image/png'));
    } catch (_) { /* keep the text-only fallback if an asset is unavailable */ }
  }));
}

// The five NeuroSense types, in classifier id order (brainType5Classifier).
const FIVE_TYPES = [
  { id: 1, name: 'Steady', desc: 'The well-regulated, balanced brain - calm under load and consistent day to day.' },
  { id: 2, name: 'Explorer', desc: 'The creative, novelty-seeking brain - idea-rich but easily pulled off track.' },
  { id: 3, name: 'Driver', desc: 'The driven, goal-focused brain - high output that can run past its recovery.' },
  { id: 4, name: 'Empath', desc: 'The deeply feeling, relationship-driven brain - reads everything, absorbs much.' },
  { id: 5, name: 'Sentinel', desc: 'The vigilant, prepared brain - always scanning, rarely fully off duty.' },
];

// Stress & Burnout are inverted parameters: the displayed number is the LEVEL
// (low stress = good), so their colour is driven by the inverted value —
// matching the template's INVERTED_KEYS/colorPct.
function invertedKey(b) {
  const k = String((b && b.key) || '').toLowerCase();
  const lbl = String((b && b.label) || '').toLowerCase();
  return k === 'stress' || k === 'burnout' || lbl.startsWith('stress') || lbl.startsWith('burnout');
}
function colorPct(b) {
  const p = Number(b && b.percent) || 0;
  return invertedKey(b) ? 100 - p : p;
}
function statusKind(status) {
  const s = String(status || '').toLowerCase();
  if (/(excellent|strong|healthy|good|balanced|normal|optimal)/.test(s)) return 'good';
  if (/(moderate|mild|borderline|right-shifted|left-shifted|average|fair)/.test(s)) return 'warn';
  return 'bad';
}
function pctColor(p) {
  const n = Math.max(0, Math.min(100, Number(p) || 0));
  if (n >= 75) return COLORS.green;
  if (n >= 40) return COLORS.blueMid;
  if (n >= 15) return COLORS.orange;
  return COLORS.red;
}
function pctTint(p) {
  const n = Math.max(0, Math.min(100, Number(p) || 0));
  if (n >= 75) return '#dcfce7';
  if (n >= 40) return '#dbeafe';
  if (n >= 15) return '#ffedd5';
  return '#fee2e2';
}
function pctFg(p) {
  const n = Math.max(0, Math.min(100, Number(p) || 0));
  if (n >= 75) return '#15803d';
  if (n >= 40) return '#1e40af';
  if (n >= 15) return '#c2410c';
  return '#b91c1c';
}

// Text is drawn with embedded faces (see registerFont in makeRenderer):
// Liberation Sans — the face the reference PDFs actually carry (the template's
// 'Helvetica Neue',Helvetica,Arial,'Liberation Sans' stack resolves to it on
// the Linux render box; pdffonts on both reference PDFs shows LiberationSans)
// — plus DejaVu Sans for the symbols Liberation lacks (✓ ◉ ⚠ ⚡ ⚖ ★). Emoji
// have no embedded face (Chromium draws them as color bitmaps, which PDFKit
// cannot embed), so they are dropped; ✅/⭐/✨ map to DejaVu glyphs. En/em
// dashes, curly quotes, • and · are real glyphs in both faces and are kept.
const SYM_RE = /[\u2192\u2500\u25C9\u2605\u2696\u26A0\u26A1\u2713]/;
function ascii(value) {
  return String(value == null ? '' : value)
    .replace(/\u2705/g, '\u2713')
    .replace(/[\u2B50\u2728]/g, '\u2605')
    // keep ASCII, Latin letters/punctuation, and the whitelisted symbols
    .replace(/[^\x09\x0A\x0D\x20-\u007E\u00A0-\u024F\u2010-\u2027\u2032-\u203A\u20AC\u2122\u2500\u25C9\u2605\u2696\u26A0\u26A1\u2713]/g, '');
}
// Pick the face for a text run: DejaVu when it carries glyphs Liberation lacks.
function fontFor(str, bold) {
  return SYM_RE.test(String(str)) ? (bold ? 'Sym-Bold' : 'Sym') : (bold ? 'RS-Bold' : 'RS');
}

function fmt(value, unit = '') {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') {
    const label = { fz: 'Fz', cz: 'Cz', pz: 'Pz' };
    return ['fz', 'cz', 'pz'].filter((k) => value[k] != null)
      .map((k) => `${label[k] || k.toUpperCase()}: ${typeof value[k] === 'number' ? Math.round(value[k] * 100) / 100 : value[k]}`)
      .join(', ') || '-';
  }
  const n = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
  if (!unit) return `${n}`;
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

function splitDash(line) {
  const s = ascii(line);
  const m = s.match(/^(.*?)\s[-\u2013\u2014]\s(.+)$/);
  if (m) return { title: m[1].trim(), body: m[2].trim() };
  return { title: s.trim(), body: '' };
}

function makeRenderer(reportData, narrative = {}, onProgress) {
  const d = reportData;
  const p = d.patient || {};
  const bt = d.brainType?.primary || d.brainType || {};
  const secondary = d.brainType?.secondary;
  const n = narrative || {};
  const bars = Array.isArray(d.bars) ? d.bars : [];
  const profile = d.profile || {};
  const dd = d.deepDive || {};
  const performance = d.performance || {};
  const inner = d.innerBandwidth || {};

  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true, compress: true });
  // Embedded faces matching the reference PDFs: Liberation Sans (Regular +
  // Bold — the reference carries no italic/extrabold faces; Chromium renders
  // its font-weight:800 headings with the Bold face) and DejaVu Sans as the
  // symbol fallback. Files live in server/fonts so they ship with deploys.
  const FONTS_DIR = path.join(__dirname, '..', 'fonts');
  doc.registerFont('RS', path.join(FONTS_DIR, 'LiberationSans-Regular.ttf'));
  doc.registerFont('RS-Bold', path.join(FONTS_DIR, 'LiberationSans-Bold.ttf'));
  doc.registerFont('Sym', path.join(FONTS_DIR, 'DejaVuSans.ttf'));
  doc.registerFont('Sym-Bold', path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'));
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  const W = 595.28;
  const H = 841.89;
  const M = 43; // ~15mm side padding (template: 15mm)

  // ---------- page furniture ----------
  function addPage() {
    doc.addPage();
    doc.rect(0, 0, W, H).fill('#ffffff');
  }
  // .dark: linear-gradient(135deg,#123a76,#1e63b4)
  function darkPage(withGlow = false) {
    doc.addPage();
    const grad = doc.linearGradient(0, 0, W, H);
    grad.stop(0, COLORS.darkA).stop(1, COLORS.darkB);
    doc.rect(0, 0, W, H).fill(grad);
    // .glow: radial highlight, top-right corner
    if (withGlow) {
      const cx = W - 20;
      const cy = 40;
      const rg = doc.radialGradient(cx, cy, 10, cx, cy, 260);
      rg.stop(0, '#78afff', 0.40).stop(1, '#78afff', 0);
      doc.rect(cx - 260, cy - 260, 520, 520).fill(rg);
    }
  }

  // White brain glyph drawn as a cloud of overlapping circles — reads as the
  // lucide brain mark at badge sizes (no SVG engine available in PDFKit).
  function brainGlyph(cx, cy, size, color = '#ffffff', opacity = 1) {
    const s = size / 24; // design space is 24x24
    doc.save();
    doc.fillColor(color);
    if (opacity < 1) doc.fillOpacity(opacity);
    const lobe = (mx) => {
      doc.circle(cx + mx * 1.6 * s, cy - 4.4 * s, 3.4 * s).fill();
      doc.circle(cx + mx * 4.6 * s, cy - 5.8 * s, 2.9 * s).fill();
      doc.circle(cx + mx * 6.6 * s, cy - 2.2 * s, 3.1 * s).fill();
      doc.circle(cx + mx * 5.6 * s, cy + 2.6 * s, 3.0 * s).fill();
      doc.circle(cx + mx * 2.6 * s, cy + 4.6 * s, 2.7 * s).fill();
    };
    lobe(-1);
    lobe(1);
    doc.circle(cx, cy + 5.4 * s, 2.2 * s).fill();
    if (opacity < 1) doc.fillOpacity(1);
    doc.restore();
  }

  function emoji(icon, x, y, size, opacity = 1) {
    const png = emojiPngs.get(icon);
    if (!png) return false;
    doc.save();
    if (opacity < 1) doc.opacity(opacity);
    doc.image(png, x, y, { width: size, height: size });
    doc.restore();
    return true;
  }

  // Blue rounded-square logo badge with the white brain mark (.lmark).
  function brandBadge(x, y, box) {
    doc.roundedRect(x, y, box, box, box * 0.3).fill(COLORS.badgeBlue);
    brainGlyph(x + box / 2, y + box / 2 - box * 0.04, box * 0.62);
  }

  function fit(value, x, y, width, size, color, opts = {}, minSize = 6.2) {
    // Shrink-to-fit paragraph: keeps narrative text inside its card.
    let s = size;
    const str = ascii(value);
    while (s > minSize) {
      doc.font(fontFor(str, opts.bold)).fontSize(s);
      if (doc.heightOfString(str, { width, lineGap: opts.lineGap ?? 1.6 }) <= opts.maxHeight) break;
      s -= 0.4;
    }
    doc.font(fontFor(str, opts.bold)).fontSize(s).fillColor(color)
      .text(str, x, y, { width, lineGap: opts.lineGap ?? 1.6, align: opts.align || 'left' });
  }

  function text(value, x, y, width, size = 10, color = COLORS.text, opts = {}) {
    const str = ascii(value);
    doc.font(fontFor(str, opts.bold)).fontSize(size).fillColor(color)
      .text(str, x, y, { width, lineGap: opts.lineGap ?? 2, align: opts.align || 'left', characterSpacing: opts.ls || 0 });
  }

  // .phead — brand lockup + "NN / SECTION" + hairline
  function header(section, label) {
    brandBadge(M, 44, 22.5);
    text('NeuroSense Brain Health', M + 31, 46, 200, 9.8, COLORS.navy, { bold: true });
    text('SMART EEG INTELLIGENCE', M + 31, 59, 200, 6, COLORS.faint, { bold: true, ls: 1.5 });
    text(`${section} / ${label}`, W - M - 220, 50, 220, 8.3, COLORS.faint, { bold: true, align: 'right', ls: 2.2 });
    doc.moveTo(M, 82).lineTo(W - M, 82).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  }

  // .pfoot — "NeuroSense • Limitless Brain Lab • site" + "Page N • Label"
  function footer(number, label) {
    doc.moveTo(M, H - 45).lineTo(W - M, H - 45).strokeColor(COLORS.track).lineWidth(0.8).stroke();
    text('NeuroSense \u2022 Limitless Brain Lab \u2022 limitlessbrainlab.com', M, H - 37, 360, 7.5, COLORS.ghost);
    text(`Page ${number} \u2022 ${label}`, W - M - 180, H - 37, 180, 7.5, COLORS.ghost, { align: 'right' });
  }

  // ---------- typography kit ----------
  function eyebrow(str, x = M, y = 102, color = COLORS.faint) {
    text(String(str).toUpperCase(), x, y, W - 2 * M, 8.3, color, { bold: true, ls: 2.2 });
  }
  // h2 with a cyan-highlighted middle segment: h2('Your brain at a', 'glance')
  function h2(pre, hl, post = '', x = M, y = 116, size = 22) {
    doc.font(fontFor(`${pre}${hl || ''}`, true)).fontSize(size);
    const wPre = hl ? doc.widthOfString(ascii(`${pre} `)) : 0;
    const wHl = hl ? doc.widthOfString(ascii(hl)) : 0;
    if (pre) text(pre, x, y, W - 2 * M, size, COLORS.navy, { bold: true, lineGap: 0 });
    if (hl) text(hl, x + wPre, y, W - 2 * M - wPre, size, COLORS.cyan, { bold: true, lineGap: 0 });
    if (post) text(post, x + wPre + wHl, y, W - 2 * M - wPre - wHl, size, COLORS.navy, { bold: true, lineGap: 0 });
  }
  // .lead
  function lead(str, x = M, y = 148, width = W - 2 * M, size = 10.2, color = COLORS.muted) {
    fit(str, x, y, width, size, color, { maxHeight: 90 });
  }
  function h3(str, x = M, y) {
    text(str, x, y, W - 2 * M, 12.8, COLORS.navy, { bold: true });
  }

  // ---------- component kit ----------
  function card(x, y, w, h, fill = '#ffffff', stroke = '#e8edf5', radius = 10.5, strokeWidth = 0.9) {
    doc.roundedRect(x, y, w, h, radius).lineWidth(strokeWidth).fillAndStroke(fill, stroke);
  }
  // Measured pill (badges, tags, traits).
  function pill(str, x, y, bg, fg, size = 7.1, padX = 7.5, h = 13.5) {
    const label = ascii(String(str).toUpperCase());
    doc.font(fontFor(label, true)).fontSize(size);
    const w = doc.widthOfString(label) + padX * 2;
    doc.roundedRect(x, y, w, h, h / 2).fill(bg);
    text(label, x + padX, y + h / 2 - size / 2 - 0.5, w - padX, size, fg, { bold: true });
    return w;
  }
  // .ptrack/.pfill — rounded progress bar.
  function track(x, y, w, h, percent, color) {
    const pr = Math.max(0, Math.min(100, Number(percent) || 0));
    doc.roundedRect(x, y, w, h, h / 2).fill(COLORS.track);
    if (pr > 0.5) doc.roundedRect(x, y, Math.max(h, w * pr / 100), h, h / 2).fill(color);
  }
  // Bulleted list with wrapping dots (tcard/tone-card bullets).
  function bullets(items, x, y, width, tone, useMark = false, size = 7.9, gap = 4.5, maxItems = 6) {
    const t = TONE[tone] || TONE.plain;
    let cy = y;
    (Array.isArray(items) ? items : []).slice(0, maxItems).forEach((raw) => {
      const item = ascii(raw);
      if (!item) return;
      doc.font(fontFor(item)).fontSize(size);
      const h = doc.heightOfString(item, { width: width - 14, lineGap: 1.4 });
      if (useMark) {
        text(tone === 'good' ? '✓' : '!', x, cy - 0.5, 8, size + 0.7, t.dot, { bold: true });
      } else {
        doc.circle(x + 2.6, cy + size * 0.42, 2.2).fill(t.dot);
      }
      doc.font(fontFor(item)).fontSize(size).fillColor(COLORS.body)
        .text(item, x + 12, cy, { width: width - 14, lineGap: 1.4 });
      cy += h + gap;
    });
    return cy;
  }
  // .tcard — tinted card with coloured heading + dot bullets.
  function toneCard(x, y, w, h, tone, title, items, useMark = false) {
    const t = TONE[tone] || TONE.plain;
    card(x, y, w, h, t.bg, t.bd, 9);
    const heading = ascii(title);
    doc.font(fontFor(heading, true)).fontSize(9.4);
    const headingHeight = doc.heightOfString(heading, { width: w - 22, lineGap: 2 });
    text(heading, x + 11, y + 10, w - 22, 9.4, t.h, { bold: true });
    bullets(items, x + 11, y + 14 + headingHeight, w - 22, tone, useMark);
  }
  // .callout — full-width tinted box (title + paragraph).
  function callout(x, y, w, h, tone, title, body) {
    const t = TONE[tone] || TONE.plain;
    card(x, y, w, h, t.bg, t.bd, 9);
    let cy = y + 10;
    if (title) {
      text(ascii(title), x + 12, cy, w - 24, 9.4, t.h, { bold: true });
      cy += 16;
    }
    fit(body, x + 12, cy, w - 24, 8.6, COLORS.body, { maxHeight: y + h - cy - 8 });
  }
  // .card with .mini-title/.mini-body (plain white card, small heading + body).
  function miniCard(x, y, w, h, title, body, icon = '') {
    card(x, y, w, h);
    const hasIcon = emoji(icon, x + 12, y + 10, 10);
    text(ascii(title), x + (hasIcon ? 26 : 12), y + 10, w - (hasIcon ? 38 : 24), 9.8, COLORS.navy, { bold: true });
    fit(body, x + 12, y + 25, w - 24, 8.3, COLORS.muted, { maxHeight: y + h - (y + 25) - 8 });
  }

  // ================= PAGE 1 — COVER =================
  darkPage(true);
  brandBadge(M, 44, 30);
  text('NeuroSense', M + 40, 46, 220, 15, '#ffffff', { bold: true });
  doc.fillOpacity(0.7); // sub uses .7 opacity per template
  text('SMART EEG INTELLIGENCE', M + 40, 63, 220, 6.8, '#ffffff', { ls: 2.2 });
  doc.fillOpacity(1);

  eyebrow('Personalized Neuro-Profile', M, 208, '#9ec2f0');
  text('Your Brain', M, 228, 500, 39, '#ffffff', { bold: true, lineGap: 0 });
  text('Type & Performance', M, 270, 500, 39, '#ffffff', { bold: true, lineGap: 0 });
  text('Report', M, 312, 500, 39, '#ffffff', { bold: true, lineGap: 0 });
  fit('A complete map of your brainwave activity, cognitive performance, and dominant brain type - built from 19-channel qEEG analysis and the NeuroSense five-type framework.', M, 372, 430, 10.2, '#cfe0f7', { maxHeight: 70 });

  // .info-cards — 4 frosted glass cards
  const infoCards = [
    ['NAME', p.name], ['ASSESSMENT', p.assessmentDate], ['BRAIN TYPE', bt.name], ['REPORT ID', p.reportId],
  ];
  {
    const gap = 9;
    const cw = (W - 2 * M - gap * 3) / 4;
    infoCards.forEach(([k, v], i) => {
      const x = M + i * (cw + gap);
      const y = 676;
      const h = 62;
      doc.save();
      doc.roundedRect(x, y, cw, h, 9).fillColor('#ffffff').fillOpacity(0.10).fill();
      doc.roundedRect(x, y, cw, h, 9).lineWidth(0.9).strokeColor('#ffffff').strokeOpacity(0.20).stroke();
      doc.restore();
      text(k, x + 10, y + 10, cw - 20, 6.8, '#ffffff', { ls: 1.5 });
      text(v || '-', x + 10, y + 24, cw - 20, 9.4, '#ffffff', { bold: true });
    });
  }
  {
    let foot = '';
    if (p.generatedOn) foot += `Report generated on: ${ascii(p.generatedOn)} by Limitless Brain Lab\n`;
    foot += `${p.clinicName || 'Limitless Brain Lab'} \u2022 This AI-generated report is for informational and wellness purposes only and is not a medical diagnosis.\nlimitlessbrainlab.com`;
    text(foot, M, 762, W - 2 * M, 7.1, '#ffffff', { align: 'center' });
    doc.fillOpacity(0.6);
    text(foot, M, 762, W - 2 * M, 7.1, '#ffffff', { align: 'center' });
    doc.fillOpacity(1);
  }

  // ================= PAGE 2 — WELCOME / CONTENTS =================
  addPage();
  header('01', 'WELCOME');
  eyebrow(`Welcome, ${p.firstName || p.name || 'there'}`);
  h2("What's inside this", 'report');
  lead("This is a complete walkthrough of how your brain works - from the dominant brainwave patterns recorded across 19 EEG channels, to your unique brain type, to a personalized 30-day plan. Every section translates raw neuroscience into something you can actually use.");

  const toc = [
    ['Your Snapshot - at-a-glance score & key signals', 'PAGE 3'],
    ['Brainwave Profile - Delta, Theta, Alpha, Beta, hi-Beta', 'PAGE 4'],
    ['Your Brain Type - the NeuroSense five-type framework', 'PAGE 5\u20136'],
    ['Type-Specific Strategy Guide', 'PAGE 7'],
    ['Performance Markers - Cognition, Focus, Stress, Burnout', 'PAGE 8'],
    ['Emotional Regulation, Learning & Creativity', 'PAGE 9'],
    ['Deep-Dive Neuro-Metrics', 'PAGE 10'],
    ['Your 30-Day Brain Optimization Plan', 'PAGE 11'],
  ];
  toc.forEach(([t, pg], i) => {
    const y = 196 + i * 32;
    text(String(i + 1), M, y + 4, 20, 11.3, COLORS.blue, { bold: true, align: 'center' });
    text(t, M + 32, y + 5, 360, 9.8, COLORS.text, { bold: true });
    text(pg, W - M - 70, y + 6, 70, 7.9, COLORS.ghost, { bold: true, align: 'right', ls: 1 });
    doc.moveTo(M, y + 26).lineTo(W - M, y + 26).strokeColor(COLORS.track).lineWidth(0.7).stroke();
  });

  miniCard(M, 470, W - 2 * M, 78, 'How to read this report',
    "Each metric is shown as a percentile or raw EEG value. Higher isn't always better - for stress regulation, higher means calmer. Look for the colored status badges (Excellent -> Needs Attention) on every metric card. Your Brain Type on page 5 is the lens through which every score should be interpreted.");
  footer(2, 'Welcome');

  // ================= PAGE 3 — SNAPSHOT =================
  addPage();
  header('02', 'SNAPSHOT');
  eyebrow('Section 1 - Quick Read');
  h2('Your brain at a', 'glance');
  lead(n.snapshotSummary || 'A quick view of where you stand right now, including your standout strength and main growth zone.');

  // .snap — gradient score card (left) + snapshot rows (right)
  {
    const gap = 13.5;
    // Match the reference template's 0.85fr / 1.35fr snapshot grid.
    const lw = (W - 2 * M - gap) * (0.85 / 2.2);
    const rw = (W - 2 * M - gap) - lw;
    const top = 192;
    // Seven rows need the same vertical space as the reference HTML layout;
    // 210pt makes each label collide with its progress bar.
    const gridH = 360;

    // .score-card
    doc.save();
    const sg = doc.linearGradient(0, top, 0, top + gridH);
    sg.stop(0, COLORS.blue).stop(1, COLORS.darkA);
    doc.roundedRect(M, top, lw, gridH, 12).fill(sg);
    doc.restore();
    doc.fillOpacity(0.85);
    text('OVERALL BRAIN PERFORMANCE', M + 16, top + 18, lw - 32, 7.5, '#ffffff', { bold: true, ls: 2 });
    doc.fillOpacity(1);
    const overallText = `${d.overall != null ? d.overall : '-'}`;
    doc.font('RS-Bold').fontSize(44);
    const overallWidth = doc.widthOfString(overallText);
    text(overallText, M + 16, top + 42, lw - 32, 44, '#ffffff', { bold: true, lineGap: 0 });
    text('/100', M + 18 + overallWidth, top + 68, lw - 32 - overallWidth, 14, '#cfe0f7', { bold: true, lineGap: 0 });
    fit(n.overallSummary || 'A composite of your seven performance markers. The growth zones are where small, consistent daily practices move the numbers most — recovery-first habits shift these fastest.', M + 16, top + 108, lw - 32, 8.4, '#e2efff', { maxHeight: gridH - 118 });

    // .scard rows
    const rows = bars.slice(0, 7);
    const rh = (gridH - 6 * 7) / rows.length;
    rows.forEach((b, i) => {
      const y = top + i * (rh + 7);
      const x = M + lw + gap;
      card(x, y, rw, rh, '#ffffff', '#e8edf5', 9);
      const c = pctColor(colorPct(b));
      const hasIcon = emoji(b.icon, x + 11, y + 7, 10);
      text(b.label || b.key, x + (hasIcon ? 25 : 11), y + 6, rw - (hasIcon ? 104 : 90), 9.4, '#33405c', { bold: true });
      text(`${Number(b.percent) || 0}%`, x + rw - 48, y + 5.5, 38, 10.5, c, { bold: true, align: 'right' });
      track(x + 11, y + rh - 12, rw - 22, 6, b.percent, c);
    });
  }

  h3('YOUR THREE BIGGEST SIGNALS', M, 576);
  {
    const gap = 9;
    const cw = (W - 2 * M - gap * 2) / 3;
    const cy = 598;
    const ch = 128;
    toneCard(M, cy, cw, ch, 'good', `TOP STRENGTH: ${n.topStrength?.title || 'Strength'}`,
      n.topStrength?.points || bt.strengths || ['Consistent strengths across your profile.']);
    toneCard(M + cw + gap, cy, cw, ch, 'warn', `WATCH ZONE: ${n.watchZone?.title || 'Growth area'}`,
      n.watchZone?.points || bt.watchZones || ['Areas with the most room to grow.']);
    toneCard(M + (cw + gap) * 2, cy, cw, ch, 'info', `BRAIN TYPE: Type ${bt.id || '-'} - ${bt.name || '-'}`,
      [bt.tagline || 'Your dominant NeuroSense profile.']);
  }
  footer(3, 'Snapshot');

  // ================= PAGE 4 — BRAINWAVES =================
  addPage();
  header('03', 'BRAINWAVES');
  eyebrow('Section 2 - The Five Bands');
  h2('Your brainwave', 'profile');
  lead(n.brainwaveIntro || 'Your brain produces five distinct rhythms simultaneously, each tied to a different mental state. The mix tells us what kind of brain you have. Below is your relative power across the spectrum (eyes-closed, posterior average).');

  const waves = [
    ['Delta', profile.delta, '0.5-4 Hz - Deep rest', fmt(profile.delta, '%')],
    ['Theta', profile.theta, '4-7 Hz - Creativity', fmt(profile.theta, '%')],
    ['Alpha', profile.alpha, '8-12 Hz - Calm focus', `Peak ${fmt(profile.alphaPeakHz, 'Hz')}`],
    ['Beta', profile.beta, '13-30 Hz - Active thinking', fmt(profile.beta, '%')],
    ['Hi-Beta', profile.hiBeta, '20-30 Hz - Vigilance', fmt(profile.hiBeta, '%')],
  ];
  waves.forEach(([label, val, sub, valText], i) => {
    const y = 200 + i * 40;
    const lw = 122;
    text(label, M, y + 2, lw, 9.8, COLORS.text, { bold: true });
    text(sub, M, y + 16, lw, 7.5, COLORS.ghost);
    const tx = M + lw + 10;
    const tw = W - M - tx - 70;
    track(tx, y + 4, tw, 8.3, val, WAVE_COLORS[label] || COLORS.blue);
    text(valText, W - M - 66, y + 2, 66, 9.8, COLORS.text, { bold: true, align: 'right' });
  });

  h3('WHAT THIS MEANS FOR YOU', M, 428);
  {
    const bwDefaults = [
      { title: `Strong alpha (peak ${fmt(profile.alphaPeakHz, 'Hz')})`, tone: 'good', body: `Your alpha rhythm is robust (${fmt(profile.alpha, '%')}) and peaks in the optimal range - it supports clear thinking, memory and the ability to enter relaxed focus. A genuine asset.` },
      { title: 'Elevated delta - recovery debt', tone: 'warn', body: `Daytime delta reads ${fmt(dd.daytimeDelta && dd.daytimeDelta.value, '%')}. Combined with low regeneration, this points to accumulated recovery debt rather than a primary issue - sleep quality needs a close look.` },
      { title: 'Moderate theta & alpha:theta', tone: 'info', body: `Theta sits at ${fmt(profile.theta, '%')} - a workable zone for memory and learning. A foundation that spaced repetition will use well.` },
      { title: 'Beta & hi-beta profile', tone: 'warn', body: `Fast-wave activity (beta ${fmt(profile.beta, '%')}, hi-beta ${fmt(profile.hiBeta, '%')}) shapes your vigilance and active-thinking bandwidth. Watch it alongside your arousal markers.` },
    ];
    const cards = (Array.isArray(n.brainwaveCards) && n.brainwaveCards.length ? n.brainwaveCards : bwDefaults).slice(0, 4);
    const gap = 13.5;
    const cw = (W - 2 * M - gap) / 2;
    cards.forEach((c, i) => {
      const x = M + (i % 2) * (cw + gap);
      const y = 448 + Math.floor(i / 2) * 118;
      const tone = c.tone || ['good', 'warn', 'info', 'warn'][i] || 'plain';
      const t = TONE[tone] || TONE.plain;
      card(x, y, cw, 104, t.bg, t.bd, 9);
      text(c.title, x + 11, y + 10, cw - 22, 9.4, t.h, { bold: true });
      fit(c.body, x + 11, y + 26, cw - 22, 8.3, COLORS.body, { maxHeight: 70 });
    });
  }
  footer(4, 'Brainwaves');

  // ================= PAGE 5 — FIVE TYPES =================
  addPage();
  header('04', 'BRAIN TYPE');
  eyebrow('Section 3 - The NeuroSense Framework');
  h2('The five', 'brain types');
  lead("Decades of brain imaging and qEEG research show that brains organize themselves into recognizable patterns - distinct combinations of arousal, regulation and reactivity that shape personality, behavior and how people respond to stress. Knowing your type isn't a label - it's a lens. It tells you which strategies will actually work for your brain.");

  {
    const gap = 7.5;
    const cw = (W - 2 * M - gap * 4) / 5;
    const top = 196;
    const ch = 148;
    FIVE_TYPES.forEach((t, i) => {
      const x = M + i * (cw + gap);
      const active = t.id === Number(bt.id);
      if (active) {
        // .type-card.active — 2px blue border + shadow + floating tag
        doc.save();
        doc.roundedRect(x - 1, top + 7, cw + 2, ch, 9).fillColor('#ffffff').fill();
        doc.roundedRect(x - 1, top + 7, cw + 2, ch, 9).lineWidth(2).strokeColor(COLORS.blue).stroke();
        doc.restore();
        pill('YOUR TYPE', x + 9, top, COLORS.blue, '#ffffff', 6, 6, 11);
      } else {
        card(x, top + 7, cw, ch);
      }
      text(`TYPE ${t.id}`, x + 9, top + 18, cw - 18, 6.8, COLORS.ghost, { bold: true, ls: 1 });
      text(t.name, x + 9, top + 32, cw - 18, 11.3, active ? COLORS.blue : COLORS.navy, { bold: true });
      fit(t.desc, x + 9, top + 50, cw - 18, 7.1, '#6b7a94', { maxHeight: ch - 58 });
    });
  }

  // How we determined your type (info callout with dot bullets)
  {
    const y = 380;
    const h = 150;
    card(M, y, W - 2 * M, h, TONE.info.bg, TONE.info.bd, 9);
    text('How we determined your type', M + 12, y + 10, W - 2 * M - 24, 9.4, TONE.info.h, { bold: true });
    const reason = (Array.isArray(n.brainTypeReason) && n.brainTypeReason.length ? n.brainTypeReason : bt.strengths) || [];
    const intro = `Your qEEG showed signatures that map onto the ${bt.name || '-'} (Type ${bt.id || '-'}) profile${secondary ? `, with secondary ${secondary.name || ''} features` : ''}:`;
    doc.font(fontFor(ascii(intro))).fontSize(8.6).fillColor(COLORS.body)
      .text(ascii(intro), M + 12, y + 27, { width: W - 2 * M - 24, lineGap: 1.4 });
    bullets(reason, M + 12, y + 44, W - 2 * M - 24, 'info', false, 8.3, 4.5, 4);
  }
  miniCard(M, 546, W - 2 * M, 62, 'A word on brain types',
    `No type is "good" or "bad." Each comes with strengths and tendencies. The goal is not to change your type - it's to work with it. The next page is a deep dive on what your ${bt.name || ''} brain looks like from the inside.`);
  footer(5, 'Brain Types Overview');

  // ================= PAGE 6 — YOUR TYPE DEEP DIVE =================
  addPage();
  header('04', 'YOUR TYPE');
  {
    // .hero — gradient panel with ghost brain glyph + trait pills
    const top = 102;
    const hh = 158;
    doc.save();
    const hg = doc.linearGradient(0, top, 0, top + hh);
    hg.stop(0, COLORS.blue).stop(1, COLORS.darkA);
    doc.roundedRect(M, top, W - 2 * M, hh, 12).fill(hg);
    doc.restore();
    if (!emoji(bt.icon, W - M - 92, top + 38, 62, 0.16)) brainGlyph(W - M - 55, top + hh / 2, 76, '#ffffff', 0.16);
    eyebrow(`${p.firstName || p.name || 'Your'}'s Brain Type`, M + 18, top + 14, '#9ec2f0');
    text(`Type ${bt.id || '-'} - The ${bt.name || ''} Brain`, M + 18, top + 32, W - 2 * M - 100, 19, '#ffffff', { bold: true });
    fit(`${bt.tagline || ''}.`, M + 18, top + 58, W - 2 * M - 100, 9.4, '#cfe0f7', { maxHeight: 26 });
    const traits = (bt.traits && bt.traits.length ? bt.traits : (bt.strengths || []).slice(0, 3)).slice(0, 5);
    let px = M + 18;
    const maxPillW = W - M - 18 - px;
    traits.forEach((t) => {
      doc.font(fontFor(ascii(t), true)).fontSize(7.5);
      const pw = Math.min(doc.widthOfString(ascii(t)) + 16, maxPillW);
      doc.save();
      doc.roundedRect(px, top + 112, pw, 16, 8).fillColor('#ffffff').fillOpacity(0.12).fill();
      doc.roundedRect(px, top + 112, pw, 16, 8).lineWidth(0.8).strokeColor('#ffffff').strokeOpacity(0.22).stroke();
      doc.restore();
      text(t, px + 8, top + 116.5, pw - 10, 7.5, '#ffffff', { bold: true });
      px += pw + 8;
    });
  }

  h3("What's happening in your brain", M, 282);
  miniCard(M, 302, (W - 2 * M - 13.5) / 2, 96, 'The neuroscience', bt.neuroscience || '', '🧬');
  miniCard(M + (W - 2 * M - 13.5) / 2 + 13.5, 302, (W - 2 * M - 13.5) / 2, 96, "Why it's a strength", bt.whyStrength || '', '⭐');

  h3('Your strengths & watch-zones', M, 418);
  const colW = (W - 2 * M - 13.5) / 2;
  toneCard(M, 438, colW, 150, 'good', `${bt.name || ''}-Brain Strengths`, bt.strengths, true);
  toneCard(M + colW + 13.5, 438, colW, 150, 'warn', `${bt.name || ''}-Brain Watch-Zones`, bt.watchZones, true);
  footer(6, 'Your Type Deep Dive');

  // ================= PAGE 7 — TYPE STRATEGY =================
  addPage();
  header('04', 'TYPE STRATEGY');
  eyebrow('What Works For Your Type');
  h2(`${bt.name || 'Your'}-brain`, 'strategy guide');
  lead(`Generic advice often fails this type. Here's what actually moves the needle for a ${bt.name || ''} brain - the lifestyle, nutrition and mental practices matched to how your nervous system is wired.`);

  const strategy = bt.strategy || {};
  h3(`Lifestyle & nutrition (Type ${bt.id || '-'} protocol)`, M, 182);
  {
    const gap = 13.5;
    const cw = (W - 2 * M - gap * 2) / 3;
    miniCard(M, 202, cw, 112, 'Eat for your type', strategy.eat || '', '🥗');
    miniCard(M + cw + gap, 202, cw, 112, 'Move', strategy.move || '', '🏃');
    miniCard(M + (cw + gap) * 2, 202, cw, 112, 'Sleep', strategy.sleep || '', '😴');
  }

  h3('Mind & emotional practices', M, 336);
  toneCard(M, 356, colW, 168, 'good', 'Do more of', strategy.doMore, true);
  toneCard(M + colW + 13.5, 356, colW, 168, 'warn', 'Less of', strategy.lessOf, true);

  callout(M, 538, W - 2 * M, 62, 'info', `The Type ${bt.id || '-'} superpower (when supported)`,
    n.typeSuperpower || bt.whyStrength || 'When this brain gets the recovery it needs, its natural wiring becomes a genuine performance advantage.');
  footer(7, 'Type-Specific Strategy');

  // ================= PAGE 8 — PERFORMANCE MARKERS =================
  addPage();
  header('05', 'PERFORMANCE');
  eyebrow('Section 4 - Performance Markers');
  h2('Cognition &', 'stress');
  lead('These are the two engines of daily performance - how clearly you think and how well you handle pressure. Together they determine whether your brain is helping you or working against you.');
  callout(M, 180, W - 2 * M, 76, 'warn', 'Why these markers matter',
    n.performanceFeature || 'Cognition and focus tell you how clearly you think; stress regulation and burnout resistance tell you whether your brain is helping or working against you. When arousal runs high and recovery runs low, the same drive that fuels performance starts feeding fatigue. The good news: these are the most reversible scores of all - they tend to move first when recovery habits go in.');

  const perfSub = {
    cognition: 'Thinking \u00B7 Memory \u00B7 Processing',
    stress: 'Recovery \u00B7 Resilience',
    focus: 'Concentration \u00B7 Distraction filter',
    burnout: 'Mental fuel \u00B7 Stamina',
  };
  {
    const perfItems = [performance.cognition, performance.stress, performance.focus, performance.burnout];
    const subs = [perfSub.cognition, perfSub.stress, perfSub.focus, perfSub.burnout];
    const fallbackLabels = ['Cognition', 'Stress Regulation', 'Focus & Attention', 'Burnout Resistance'];
    const bodies = [n.performance?.cognition, n.performance?.stress, n.performance?.focus, n.performance?.burnout];
    const gap = 13.5;
    const cw = (W - 2 * M - gap) / 2;
    perfItems.forEach((b, i) => {
      const x = M + (i % 2) * (cw + gap);
      const y = 272 + Math.floor(i / 2) * 128;
      const mark = b || {};
      const cp = colorPct(mark);
      const c = pctColor(cp);
      card(x, y, cw, 114);
      text(mark.label || fallbackLabels[i], x + 13, y + 12, cw - 100, 11.3, COLORS.navy, { bold: true });
      text(subs[i], x + 13, y + 27, cw - 100, 7.5, COLORS.ghost);
      text(`${Number(mark.percent) || 0}%`, x + cw - 76, y + 10, 62, 24, c, { bold: true, align: 'right', lineGap: 0 });
      pill(mark.status || '-', x + 13, y + 42, pctTint(cp), pctFg(cp));
      fit(bodies[i] || '', x + 13, y + 62, cw - 26, 8.3, COLORS.muted, { maxHeight: 46 });
    });
  }
  footer(8, 'Cognition & Stress');

  // ================= PAGE 9 — INNER BANDWIDTH =================
  addPage();
  header('05', 'INNER BANDWIDTH');
  eyebrow('Section 5 - Inner Bandwidth');
  h2('Emotion, learning &', 'creativity');
  lead("When the nervous system is busy scanning for threat and running on empty, it has less bandwidth left for emotional flexibility, divergent thinking and the open-mode states that drive creativity. This is exactly the pattern your data shows - and it's also the most reversible.");

  {
    const items = [
      ['Emotional Regulation', inner.emotional, n.innerBandwidth?.emotional],
      ['Learning Capacity', inner.learning, n.innerBandwidth?.learning],
      ['Creativity', inner.creativity, n.innerBandwidth?.creativity],
    ];
    const gap = 9;
    const cw = (W - 2 * M - gap * 2) / 3;
    items.forEach(([label, b, body], i) => {
      const x = M + i * (cw + gap);
      const y = 200;
      const mark = b || {};
      const cp = colorPct(mark);
      const c = pctColor(cp);
      card(x, y, cw, 138);
      text(label, x + 12, y + 12, cw - 24, 9.4, COLORS.navy, { bold: true });
      text(`${Number(mark.percent) || 0}%`, x + 12, y + 28, cw - 24, 22, c, { bold: true, lineGap: 0 });
      pill(mark.status || '-', x + 12, y + 56, pctTint(cp), pctFg(cp));
      fit(body || '', x + 12, y + 76, cw - 24, 7.9, COLORS.muted, { maxHeight: 54 });
    });
  }

  h3(`For your type - Type ${bt.id || '-'} specific advice`, M, 362);
  {
    const emotionAdvice = n.innerBandwidth?.emotionalAdvice || [
      'Daily "name it to tame it" - label what you\'re feeling before reacting.',
      'Slow-exhale breathing (longer out than in) calms the nervous system.',
      'Response-gap training - pause before reacting; reframe the situation.',
      'Limit news / social media in the first and last hour of the day.',
    ];
    const learningAdvice = n.innerBandwidth?.learningAdvice || [
      'Use spaced repetition - review material across days, not in one block.',
      'Schedule short "no-input" breaks - ideas surface when the brain is idle.',
      'Change your environment once a week for fresh thinking.',
      'Separate brainstorming from editing - never do both at once.',
    ];
    text('Emotional regulation', M, 382, colW, 9.4, COLORS.navy, { bold: true });
    bullets(emotionAdvice, M, 398, colW, 'info', false, 8.3, 5);
    text('Learning & creativity', M + colW + 13.5, 382, colW, 9.4, COLORS.navy, { bold: true });
    bullets(learningAdvice, M + colW + 13.5, 398, colW, 'info', false, 8.3, 5);
  }

  callout(M, 560, W - 2 * M, 72, 'info', 'The hidden link between these three',
    n.innerBandwidth?.link || "Emotional regulation, creative thinking and durable learning all depend on the same underlying state: low arousal plus alert alpha. When the nervous system runs hot and depleted, all three drop together. When you give the brain real recovery, all three rise - usually together. That's why the plan focuses on calming and recovering, not on adding more.");
  footer(9, 'Inner Bandwidth');

  // ================= PAGE 10 — DEEP-DIVE METRICS =================
  addPage();
  header('06', 'DEEP DIVE');
  eyebrow('Section 6 - The Numbers Behind The Story');
  h2('Deep-dive', 'neuro metrics');
  lead('For those who want to see the actual EEG values behind every score above. These are the metrics your clinician will reference.');
  callout(M, 176, W - 2 * M, 66, 'plain', 'Reading these numbers',
    n.deepDive?.readingPattern || 'No single metric tells the story - look at the pattern they form together. High arousal + low relaxation + low regeneration + excessive delta + a shifted frontal asymmetry describe an overloaded, vigilant brain that has run past its recovery capacity.');

  {
    const metrics = [
      ['alphaPeak', 'Alpha Peak', dd.alphaPeak], ['arousal', 'Arousal', dd.arousal],
      ['relaxation', 'Relaxation', dd.relaxation], ['regeneration', 'Regeneration', dd.regeneration],
      ['frontalAsymmetry', 'Frontal Asymmetry', dd.frontalAsymmetry], ['daytimeDelta', 'Daytime Delta', dd.daytimeDelta],
      ['focusScore', 'Focus Score', dd.focusScore], ['alphaTheta', 'Alpha:Theta Balance', dd.alphaTheta],
    ];
    const metricDescriptions = {
      alphaPeak: 'A healthy alpha peak sits in the optimal band and supports clear information processing and relaxed focus — genuine cognitive horsepower to build on.',
      arousal: 'Your nervous-system baseline. Higher values mean it runs hot; lowering it is central to recovery, sleep and calmer focus.',
      relaxation: 'How readily you drop into a relaxed state — the mirror image of arousal. Breathwork and HRV training raise it directly.',
      regeneration: 'Brain recovery capacity — how fast you replenish what you spend. Protect sleep and add daily downtime to move this number.',
      frontalAsymmetry: 'Right-shifted values are linked to vigilance, worry and slower emotional recovery. Goal-activation routines rebuild the left side.',
      daytimeDelta: 'Elevated waking delta points to recovery debt and fatigue rather than a primary issue. Sleep optimisation addresses it.',
      focusScore: 'A theta:beta focus marker — above target is consistent with attention pulled sideways by vigilance. Pomodoro intervals and reduced threat-input help anchor sustained focus.',
      alphaTheta: 'A workable ratio for memory and learning. This is the foundation that makes spaced repetition and active recall effective for you.',
    };
    const gap = 13.5;
    const cw = (W - 2 * M - gap) / 2;
    metrics.forEach(([key, label, m], i) => {
      const x = M + (i % 2) * (cw + gap);
      const y = 260 + Math.floor(i / 2) * 106;
      const mark = m || {};
      const kind = statusKind(mark.status);
      const c = KIND[kind] ? KIND[kind].color : COLORS.blue;
      card(x, y, cw, 92);
      text(mark.label || label, x + 13, y + 11, cw - 110, 10.1, COLORS.navy, { bold: true });
      text(`Optimal: ${mark.optimal || '-'}`, x + 13, y + 26, cw - 110, 7.5, COLORS.ghost);
      text(fmt(mark.value, mark.unit), x + cw - 100, y + 10, 87, 19.5, c, { bold: true, align: 'right', lineGap: 0 });
      fit(mark.description || n.deepDive?.[key] || n.deepDive?.descriptions?.[key] || metricDescriptions[key], x + 13, y + 44, cw - 26, 7.9, COLORS.muted, { maxHeight: 42 });
    });
  }
  footer(10, 'Deep-Dive Metrics');

  // ================= PAGE 11 — 30-DAY PLAN =================
  addPage();
  header('07', 'ACTION PLAN');
  eyebrow('Section 7 - Your Personalized Plan');
  h2('Your 30-day', 'brain plan');
  lead(n.plan?.intro || 'Small daily inputs compound quickly when they are type-specific. Start with the anchors below - they are chosen for how your brain is wired.');

  const anchorTags = ['Anchor habit', 'Recovery', 'Calm baseline', 'Movement'];
  h3('Daily non-negotiables (start tomorrow)', M, 178);
  {
    const anchors = (strategy.doMore || []).slice(0, 4);
    const gap = 13.5;
    const cw = (W - 2 * M - gap) / 2;
    anchors.forEach((a, i) => {
      const x = M + (i % 2) * (cw + gap);
      const y = 198 + Math.floor(i / 2) * 66;
      const { title, body } = splitDash(a);
      card(x, y, cw, 58);
      doc.roundedRect(x + 11, y + 11, 20, 20, 6).fill(COLORS.blue);
      text(String(i + 1), x + 11, y + 15, 20, 10.5, '#ffffff', { bold: true, align: 'center' });
      text(title, x + 40, y + 10, cw - 52, 9.4, COLORS.navy, { bold: true });
      fit(body, x + 40, y + 24, cw - 52, 7.9, COLORS.muted, { maxHeight: 20 });
      pill(anchorTags[i] || 'Daily', x + 40, y + 42, '#e8f0fe', '#1e40af', 6.8, 6, 11);
    });
  }

  h3('Week-by-week build', M, 342);
  {
    const weeks = [
      { label: 'WEEK 1 - CALM FIRST', title: 'Lock in the daily anchors', body: 'Just the anchors above, plus a short daily nervous-system reset. Prove to your brain that calm is safe and consistent.' },
      { label: 'WEEK 2 - CONTAIN', title: 'Add structure & containment', body: 'A short evening wind-down and a 3-item morning priority list. Contain the open loops before they run in the background.' },
      { label: 'WEEK 3 - RECOVER', title: 'Add one weekly true-rest session', body: '90 minutes of no productivity, no input, no goal. Through the week, alternate high-effort and lighter tasks so the brain is not overloaded.' },
      { label: 'WEEK 4 - ACTIVATE', title: 'Layer in performance work', body: 'A daily goal-activation routine - one small task-start, one intention, one thing you are looking forward to. Add spaced repetition for anything you are learning.' },
    ];
    weeks.forEach((w, i) => {
      const y = 362 + i * 52;
      doc.save();
      doc.roundedRect(M + 3, y, W - 2 * M - 3, 46, 6).fill('#eff6ff');
      doc.restore();
      doc.rect(M, y, 3, 46).fill('#2563eb');
      text(w.label, M + 14, y + 7, 220, 7.5, COLORS.blue, { bold: true, ls: 1.5 });
      text(w.title, M + 14, y + 18, 220, 9.8, COLORS.navy, { bold: true });
      fit(w.body, M + 230, y + 7, W - M - 230 - 12, 7.5, COLORS.muted, { maxHeight: 36 });
    });

    callout(M, 584, W - 2 * M, 56, 'info', 'After 30 days',
      n.plan?.after30 || 'Repeat the qEEG and review which markers shifted first. Most brains respond first on arousal and relaxation - then the performance scores follow.');
  }
  footer(11, '30-Day Plan');

  // ================= PAGE 12 — CLOSING / CONTACT =================
  darkPage(false);
  text('\u25C9', 0, 184, W, 24, '#ffffff', { align: 'center' });
  text('Your brain is unique.', 0, 258, W, 30, '#ffffff', { bold: true, align: 'center', lineGap: 0 });
  text('Your plan should be too.', 0, 296, W, 30, '#ffffff', { bold: true, align: 'center', lineGap: 0 });
  fit(n.closing || "This report is a starting point, not a finish line. Small, consistent shifts in lifestyle, sleep, and self-regulation produce measurable changes in your EEG within weeks. We're here to walk that path with you.", 60, 356, W - 120, 9.7, '#cfe0f7', { maxHeight: 60, align: 'center' });

  {
    // glass contact card (rgba white .10 fill / .18 border, like the template)
    const cw = 255;
    const cx = (W - cw) / 2;
    const cy = 448;
    const ch = 86;
    doc.save();
    doc.roundedRect(cx, cy, cw, ch, 10).fillColor('#ffffff').fillOpacity(0.10).fill();
    doc.roundedRect(cx, cy, cw, ch, 10).lineWidth(0.9).strokeColor('#ffffff').strokeOpacity(0.18).stroke();
    doc.restore();
    doc.fillOpacity(0.75);
    text('GET IN TOUCH', cx, cy + 12, cw, 7.5, '#ffffff', { bold: true, align: 'center', ls: 2 });
    doc.fillOpacity(1);
    text('+971 58 560 2551', cx, cy + 28, cw, 16.5, '#ffffff', { bold: true, align: 'center' });
    text('www.limitlessbrainlab.com', cx, cy + 56, cw, 9.7, '#9ec2f0', { align: 'center' });
  }

  doc.fillOpacity(0.65);
  text('This AI-generated qEEG report is provided for informational, educational, and wellness purposes only. It is not intended to diagnose, treat, cure, mitigate, or prevent any medical condition and is not a substitute for the individualized care of a licensed healthcare professional. The five brain-type framework is the NeuroSense interpretation of common qEEG patterns and is used for educational context only.', 62, H - 96, W - 124, 6.8, '#ffffff', { align: 'left' });
  doc.fillOpacity(1);

  if (typeof onProgress === 'function') onProgress('render');
  doc.end();
  return done;
}

async function renderReportDataToPdf(reportData, narrative, onProgress) {
  await prepareEmojiPngs();
  return makeRenderer(reportData, narrative, onProgress);
}

module.exports = { renderReportDataToPdf };

