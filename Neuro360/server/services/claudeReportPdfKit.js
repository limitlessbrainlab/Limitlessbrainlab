const PDFDocument = require('pdfkit');

// This renderer intentionally uses PDFKit instead of a browser. The report
// endpoint runs on Render's small instance, where launching Chromium for every
// request can exhaust memory and terminate the SSE connection.
const COLORS = {
  navy: '#15315f',
  blue: '#1e63b4',
  cyan: '#1f93c4',
  text: '#1f2a44',
  muted: '#5b6b86',
  pale: '#eef3f9',
  line: '#e5e9f0',
  green: '#16a34a',
  orange: '#d97706',
  red: '#dc2626',
};

function ascii(value) {
  return String(value == null ? '' : value)
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, ' - ')
    .replace(/[^\x00-\x7F]/g, '');
}

function fmt(value, unit = '') {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') {
    return ['fz', 'cz', 'pz'].filter((k) => value[k] != null)
      .map((k) => `${k.toUpperCase()}: ${value[k]}`).join(', ') || '-';
  }
  return `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
}

function pct(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function colorFor(value) {
  const n = pct(value);
  return n >= 75 ? COLORS.green : n >= 40 ? COLORS.blue : n >= 15 ? COLORS.orange : COLORS.red;
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
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  const W = 595.28;
  const H = 841.89;
  const M = 43;

  function page(dark = false) {
    doc.addPage();
    if (dark) doc.rect(0, 0, W, H).fill(COLORS.navy);
    else doc.rect(0, 0, W, H).fill('#ffffff');
  }
  function text(value, x, y, width, size = 10, color = COLORS.text, opts = {}) {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
      .text(ascii(value), x, y, { width, lineGap: opts.lineGap ?? 2, align: opts.align || 'left' });
  }
  function header(section, label) {
    text('NEUROSENSE', M, 34, 180, 10, COLORS.blue, { bold: true });
    text(`${section}  /  ${label}`, 350, 35, W - M - 350, 8, '#8aa0c0', { bold: true, align: 'right' });
    doc.moveTo(M, 58).lineTo(W - M, 58).strokeColor(COLORS.line).lineWidth(0.7).stroke();
  }
  function footer(number) {
    doc.moveTo(M, H - 48).lineTo(W - M, H - 48).strokeColor(COLORS.line).lineWidth(0.7).stroke();
    text(`Limitless Brain Lab  |  Page ${number}`, M, H - 37, 250, 8, '#9aa8c0');
    text(ascii(p.name || ''), W - M - 180, H - 37, 180, 8, '#9aa8c0', { align: 'right' });
  }
  function title(kicker, heading, y = 84) {
    text(kicker.toUpperCase(), M, y, W - 2 * M, 8, '#8aa0c0', { bold: true });
    text(heading, M, y + 18, W - 2 * M, 25, COLORS.navy, { bold: true, lineGap: 0 });
  }
  function paragraph(value, x = M, y = 145, width = W - 2 * M, size = 10.5, color = COLORS.muted) {
    text(value, x, y, width, size, color, { lineGap: 3 });
  }
  function card(x, y, w, h, fill = '#ffffff', stroke = COLORS.line) {
    doc.roundedRect(x, y, w, h, 8).fillAndStroke(fill, stroke);
  }
  function badge(value, x, y, color = COLORS.blue) {
    doc.roundedRect(x, y, Math.max(60, String(value).length * 5.8 + 18), 18, 9).fill(color);
    text(String(value).toUpperCase(), x + 8, y + 5, 140, 7, '#ffffff', { bold: true });
  }
  function bar(label, value, x, y, width = 210) {
    text(label, x, y, width - 50, 9.5, COLORS.text, { bold: true });
    text(`${value}%`, x + width - 44, y, 44, 9.5, colorFor(value), { bold: true, align: 'right' });
    doc.roundedRect(x, y + 16, width, 7, 3).fill('#eef1f6');
    doc.roundedRect(x, y + 16, width * pct(value) / 100, 7, 3).fill(colorFor(value));
  }
  function list(items, x, y, width, color = COLORS.muted, gap = 24) {
    (Array.isArray(items) ? items : []).slice(0, 6).forEach((item, i) => {
      doc.circle(x + 3, y + i * gap + 6, 2.5).fill(COLORS.blue);
      text(item, x + 12, y + i * gap, width - 12, 9, color, { lineGap: 2 });
    });
  }
  function sectionCard(label, value, x, y, w, h = 105) {
    card(x, y, w, h, '#ffffff');
    text(label, x + 13, y + 13, w - 26, 11, COLORS.navy, { bold: true });
    text(value, x + 13, y + 34, w - 26, 9.2, COLORS.muted, { lineGap: 3 });
  }
  function metric(label, m, x, y, w = 247) {
    const value = m || {};
    const h = 100;
    card(x, y, w, h);
    text(label, x + 13, y + 13, w - 110, 10.5, COLORS.navy, { bold: true });
    text(fmt(value.value, value.unit), x + w - 100, y + 12, 87, 15, colorFor(value.percent), { bold: true, align: 'right' });
    text(`Optimal: ${value.optimal || '-'}`, x + 13, y + 32, w - 26, 8, '#9aa8c0');
    text(value.description || n.deepDive?.descriptions?.[label] || '', x + 13, y + 50, w - 26, 8.5, COLORS.muted, { lineGap: 2 });
  }

  // Page 1: cover
  page(true);
  text('NEUROSENSE', M, 48, 250, 18, '#ffffff', { bold: true });
  text('SMART EEG INTELLIGENCE', M, 72, 250, 7, '#b9d1f2', { bold: true });
  text('PERSONALIZED NEURO-PROFILE', M, 205, 300, 9, '#9ec2f0', { bold: true });
  text('Your Brain\nType & Performance\nReport', M, 232, 500, 34, '#ffffff', { bold: true, lineGap: 0 });
  paragraph('A complete map of your brainwave activity, cognitive performance, and dominant brain type - built from 19-channel qEEG analysis.', M, 370, 430, 11, '#cfe0f7');
  const info = [['NAME', p.name], ['ASSESSMENT', p.assessmentDate], ['BRAIN TYPE', bt.name], ['REPORT ID', p.reportId]];
  info.forEach(([k, v], i) => { const x = M + i * 128; doc.roundedRect(x, 650, 117, 58, 7).fill('#28568e'); text(k, x + 10, 662, 100, 7, '#b9d1f2', { bold: true }); text(v || '-', x + 10, 679, 100, 9, '#ffffff', { bold: true }); });
  text(`${p.clinicName || 'Limitless Brain Lab'} - Wellness report only, not a medical diagnosis.`, M, 780, W - 2 * M, 8, '#b9d1f2', { align: 'center' });

  // Page 2: contents
  page(); header('01', 'WELCOME'); title('Welcome', `What's inside this report`);
  paragraph(`This is a complete walkthrough of how ${p.firstName || p.name || 'your'} brain works - from brainwave patterns to your unique brain type and a personalized 30-day plan.`);
  const contents = ['Your Snapshot - score and key signals', 'Brainwave Profile - five EEG bands', 'Your Brain Type - the five-type framework', 'Type-Specific Strategy Guide', 'Performance Markers', 'Inner Bandwidth - emotion, learning and creativity', 'Deep-Dive Neuro-Metrics', 'Your 30-Day Brain Optimization Plan'];
  contents.forEach((item, i) => { const y = 210 + i * 48; doc.moveTo(M, y + 25).lineTo(W - M, y + 25).strokeColor(COLORS.line).stroke(); text(String(i + 1), M, y, 25, 12, COLORS.blue, { bold: true }); text(item, M + 38, y, 420, 10.5, COLORS.text, { bold: true }); text(`PAGE ${i + 3}`, W - M - 55, y + 2, 55, 8, '#9aa8c0', { align: 'right' }); });
  card(M, 610, W - 2 * M, 95, '#f8fafc'); text('HOW TO READ THIS REPORT', M + 16, 626, 300, 10, COLORS.navy, { bold: true }); paragraph('Higher is not always better. Look for the colored status markers and read the numbers alongside the explanation on each page.', M + 16, 650, W - 2 * M - 32, 9.5);
  footer(2);

  // Page 3: snapshot
  page(); header('02', 'SNAPSHOT'); title('Section 1 - Quick Read', 'Your brain at a glance'); paragraph(n.snapshotSummary || 'A quick view of where you stand right now, including your standout strength and main growth zone.');
  card(M, 205, 185, 210, COLORS.blue, COLORS.blue); text('OVERALL BRAIN PERFORMANCE', M + 18, 228, 150, 8, '#cfe0f7', { bold: true }); text(`${d.overall || '-'} / 100`, M + 18, 260, 150, 31, '#ffffff', { bold: true }); paragraph(n.overallSummary || 'A composite of your seven performance markers.', M + 18, 320, 150, 9, '#e2efff');
  bars.slice(0, 7).forEach((b, i) => bar(b.label || b.key, b.percent, 250, 214 + i * 29, 300));
  text('YOUR THREE BIGGEST SIGNALS', M, 460, 300, 12, COLORS.navy, { bold: true });
  sectionCard(`TOP STRENGTH: ${n.topStrength?.title || 'Strength'}`, (n.topStrength?.points || bt.strengths || []).join(' '), M, 490, 160, 150);
  sectionCard(`WATCH ZONE: ${n.watchZone?.title || 'Growth area'}`, (n.watchZone?.points || bt.watchZones || []).join(' '), 217, 490, 160, 150);
  sectionCard(`BRAIN TYPE: ${bt.name || '-'}`, bt.tagline || '', 391, 490, 160, 150); footer(3);

  // Page 4: brainwaves
  page(); header('03', 'BRAINWAVES'); title('Section 2 - The Five Bands', 'Your brainwave profile'); paragraph(n.brainwaveIntro || 'Your brain produces five distinct rhythms simultaneously. The mix tells us how your brain operates.');
  const waves = [['Delta', profile.delta, '0.5-4 Hz - Deep rest'], ['Theta', profile.theta, '4-7 Hz - Creativity'], ['Alpha', profile.alpha, `8-12 Hz - Peak ${fmt(profile.alphaPeakHz, 'Hz')}`], ['Beta', profile.beta, '13-30 Hz - Active thinking'], ['Hi-Beta', profile.hiBeta, '20-30 Hz - Vigilance']];
  waves.forEach((w, i) => { const y = 205 + i * 48; text(w[0], M, y, 90, 11, COLORS.navy, { bold: true }); text(w[2], M, y + 16, 140, 8, '#9aa8c0'); doc.roundedRect(185, y + 5, 260, 9, 4).fill('#eef1f6'); doc.roundedRect(185, y + 5, 260 * pct(w[1]) / 100, 9, 4).fill(COLORS.blue); text(fmt(w[1], '%'), 460, y + 1, 90, 11, COLORS.text, { bold: true, align: 'right' }); });
  text('WHAT THIS MEANS FOR YOU', M, 470, 300, 12, COLORS.navy, { bold: true });
  const bw = n.brainwaveCards || []; for (let i = 0; i < 4; i++) sectionCard(bw[i]?.title || waves[i][0], bw[i]?.body || '', M + (i % 2) * 267, 500 + Math.floor(i / 2) * 120, 250, 100);
  footer(4);

  // Page 5: framework
  page(); header('04', 'BRAIN TYPE'); title('Section 3 - The NeuroSense Framework', 'The five brain types'); paragraph('Knowing your type is not a label. It is a lens for understanding which strategies are most likely to work for your nervous system.');
  const types = ['Spontaneous', 'Cautious', 'Persistent', 'Sensitive', 'Balanced'];
  types.forEach((name, i) => { const x = M + i * 103; card(x, 220, 94, 180, i + 1 === bt.id ? '#e8f0fe' : '#ffffff', i + 1 === bt.id ? COLORS.blue : COLORS.line); text(`TYPE ${i + 1}`, x + 10, 238, 74, 8, '#9aa8c0', { bold: true }); text(name, x + 10, 260, 74, 11, i + 1 === bt.id ? COLORS.blue : COLORS.navy, { bold: true }); text(i + 1 === bt.id ? 'YOUR TYPE' : 'NeuroSense profile', x + 10, 296, 74, 8, COLORS.muted); });
  card(M, 450, W - 2 * M, 220, '#f8fafc'); text(`HOW WE DETERMINED YOUR TYPE: ${bt.name || '-'}`, M + 16, 468, W - 2 * M - 32, 11, COLORS.navy, { bold: true }); list(n.brainTypeReason || bt.strengths || [], M + 18, 505, W - 2 * M - 36, COLORS.muted, 35); footer(5);

  // Page 6: type deep dive
  page(); header('04', 'YOUR TYPE'); title(`${p.firstName || p.name || 'Your'}'s Brain Type`, `Type ${bt.id || '-'} - The ${bt.name || 'Unknown'} Brain`); paragraph(bt.tagline || '', M, 155, W - 2 * M, 12, COLORS.blue);
  sectionCard('THE NEUROSCIENCE', bt.neuroscience || '', M, 220, 250, 135); sectionCard("WHY IT'S A STRENGTH", bt.whyStrength || '', 302, 220, 250, 135);
  text('YOUR STRENGTHS & WATCH-ZONES', M, 395, 350, 12, COLORS.navy, { bold: true });
  card(M, 425, 250, 210, '#f0fdf4', '#bbf7d0'); text(`${bt.name || ''} STRENGTHS`, M + 14, 443, 220, 11, COLORS.green, { bold: true }); list(bt.strengths, M + 16, 478, 220, COLORS.muted, 31);
  card(302, 425, 250, 210, '#fff7ed', '#fed7aa'); text(`${bt.name || ''} WATCH-ZONES`, 316, 443, 220, 11, COLORS.orange, { bold: true }); list(bt.watchZones, 318, 478, 220, COLORS.muted, 31); footer(6);

  // Page 7: strategy
  page(); header('04', 'TYPE STRATEGY'); title('What works for your type', `${bt.name || 'Your'}-brain strategy guide`); paragraph('Generic advice often fails this type. These strategies are matched to how your nervous system is wired.');
  const strategy = bt.strategy || {};
  sectionCard('EAT FOR YOUR TYPE', strategy.eat || '', M, 215, 160, 130); sectionCard('MOVE', strategy.move || '', 217, 215, 160, 130); sectionCard('SLEEP', strategy.sleep || '', 391, 215, 160, 130);
  text('MIND & EMOTIONAL PRACTICES', M, 390, 300, 12, COLORS.navy, { bold: true });
  card(M, 420, 250, 180, '#f0fdf4', '#bbf7d0'); text('DO MORE OF', M + 14, 438, 200, 11, COLORS.green, { bold: true }); list(strategy.doMore, M + 16, 472, 220, COLORS.muted, 28);
  card(302, 420, 250, 180, '#fff7ed', '#fed7aa'); text('LESS OF', 316, 438, 200, 11, COLORS.orange, { bold: true }); list(strategy.lessOf, 318, 472, 220, COLORS.muted, 28); footer(7);

  // Page 8: performance
  page(); header('05', 'PERFORMANCE'); title('Section 4 - Performance Markers', 'Cognition & stress'); paragraph('These markers show how clearly you think and how well your brain handles pressure and recovery.');
  paragraph(n.performanceFeature || '', M, 205, W - 2 * M, 10, COLORS.muted); const perf = [['Cognition', performance.cognition, n.performance?.cognition], ['Stress Regulation', performance.stress, n.performance?.stress], ['Focus & Attention', performance.focus, n.performance?.focus], ['Burnout Resistance', performance.burnout, n.performance?.burnout]];
  perf.forEach((item, i) => { const x = M + (i % 2) * 267; const y = 300 + Math.floor(i / 2) * 160; card(x, y, 250, 140); text(item[0], x + 14, y + 15, 170, 12, COLORS.navy, { bold: true }); text(`${item[1]?.percent || 0}%`, x + 180, y + 13, 55, 20, colorFor(item[1]?.percent), { bold: true, align: 'right' }); badge(item[1]?.status || '-', x + 14, y + 44, colorFor(item[1]?.percent)); paragraph(item[2] || '', x + 14, y + 78, 220, 8.8); }); footer(8);

  // Page 9: inner bandwidth
  page(); header('05', 'INNER BANDWIDTH'); title('Section 5 - Inner Bandwidth', 'Emotion, learning & creativity'); paragraph('These capacities share the same underlying state: low arousal plus alert alpha. Recovery helps all three rise together.');
  [['Emotional Regulation', inner.emotional, n.innerBandwidth?.emotional], ['Learning Capacity', inner.learning, n.innerBandwidth?.learning], ['Creativity', inner.creativity, n.innerBandwidth?.creativity]].forEach((item, i) => { const x = M + i * 174; card(x, 220, 160, 200); text(item[0], x + 12, 238, 136, 10, COLORS.navy, { bold: true }); text(`${item[1]?.percent || 0}%`, x + 12, 270, 136, 25, colorFor(item[1]?.percent), { bold: true }); badge(item[1]?.status || '-', x + 12, 310, colorFor(item[1]?.percent)); paragraph(item[2] || '', x + 12, 350, 136, 8.5); });
  sectionCard('THE HIDDEN LINK', n.innerBandwidth?.link || 'Emotional regulation, creative thinking and durable learning depend on recovery.', M, 465, W - 2 * M, 125); footer(9);

  // Page 10: deep dive
  page(); header('06', 'DEEP DIVE'); title('Section 6 - The Numbers Behind The Story', 'Deep-dive neuro metrics'); paragraph(n.deepDive?.readingPattern || 'No single metric tells the story - look at the pattern they form together.');
  const metrics = [['alphaPeak', 'Alpha Peak', dd.alphaPeak], ['arousal', 'Arousal', dd.arousal], ['relaxation', 'Relaxation', dd.relaxation], ['regeneration', 'Regeneration', dd.regeneration], ['frontalAsymmetry', 'Frontal Asymmetry', dd.frontalAsymmetry], ['daytimeDelta', 'Daytime Delta', dd.daytimeDelta], ['focusScore', 'Focus Score', dd.focusScore], ['alphaTheta', 'Alpha:Theta Balance', dd.alphaTheta]];
  metrics.forEach((m, i) => metric(m[1], m[2], M + (i % 2) * 267, 220 + Math.floor(i / 2) * 115)); footer(10);

  // Page 11: plan
  page(); header('07', 'ACTION PLAN'); title('Section 7 - Your Personalized Plan', 'Your 30-day brain plan'); paragraph(n.plan?.intro || 'Small daily inputs compound quickly when they are type-specific.');
  text('DAILY NON-NEGOTIABLES', M, 210, 300, 12, COLORS.navy, { bold: true }); list(strategy.doMore, M, 245, 500, COLORS.muted, 31);
  text('WEEK-BY-WEEK BUILD', M, 420, 300, 12, COLORS.navy, { bold: true });
  [['WEEK 1 - CALM FIRST', 'Lock in the daily anchors'], ['WEEK 2 - CONTAIN', 'Add structure and containment'], ['WEEK 3 - RECOVER', 'Add one weekly true-rest session'], ['WEEK 4 - ACTIVATE', 'Layer in performance work']].forEach((w, i) => { const y = 455 + i * 55; card(M, y, W - 2 * M, 43, '#eff6ff', '#dbeafe'); text(w[0], M + 12, y + 8, 170, 8, COLORS.blue, { bold: true }); text(w[1], M + 190, y + 8, 330, 10, COLORS.navy, { bold: true }); });
  sectionCard('AFTER 30 DAYS', n.plan?.after30 || 'Repeat the qEEG and review which markers shifted first.', M, 690, W - 2 * M, 70); footer(11);

  // Page 12: close
  page(true); text('NEUROSENSE', M, 50, 250, 18, '#ffffff', { bold: true }); text('Your brain is unique.\nYour plan should be too.', M, 260, 500, 32, '#ffffff', { bold: true, lineGap: 2 }); paragraph(n.closing || 'This report is a starting point, not a finish line. Small, consistent shifts produce measurable changes over time.', M, 390, 430, 11, '#cfe0f7'); doc.roundedRect(M, 535, W - 2 * M, 95, 8).fill('#28568e'); text('GET IN TOUCH', M + 18, 552, 200, 8, '#b9d1f2', { bold: true }); text('+971 58 560 2551', M + 18, 575, 300, 18, '#ffffff', { bold: true }); text('limitlessbrainlab-eight.vercel.app', M + 18, 603, 300, 9, '#cfe0f7'); text('This AI-generated qEEG report is for informational, educational and wellness purposes only. It is not a medical diagnosis or substitute for licensed professional care.', M, 755, W - 2 * M, 8, '#b9d1f2');

  if (typeof onProgress === 'function') onProgress('render');
  doc.end();
  return done;
}

async function renderReportDataToPdf(reportData, narrative, onProgress) {
  return makeRenderer(reportData, narrative, onProgress);
}

module.exports = { renderReportDataToPdf };
