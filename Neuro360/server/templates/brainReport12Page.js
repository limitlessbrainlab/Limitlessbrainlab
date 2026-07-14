/**
 * 11-page "Your Brain Type & Performance Report" HTML template
 * (NeuroSense / Limitless Brain Lab).
 *
 * renderReportHtml(reportData, narrative) returns a complete A4 HTML document
 * that reproduces the reference report design exactly (cover + 10 content pages).
 * All NUMBERS come from reportData (deterministic, from the qEEG algorithm).
 * All PROSE comes from `narrative` (Claude), falling back to the brain-type
 * framework copy in reportData.brainType when a narrative field is missing — so
 * the report is always complete even if the narrative call returns little.
 *
 * Render to PDF with headless Chromium using `printBackground: true`, format 'A4'.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(value, unit) {
  if (value == null) return '—';
  if (value && typeof value === 'object') {
    const keys = ['fz', 'cz', 'pz'].filter((k) => value[k] != null);
    const entries = keys.length ? keys.map((k) => [k, value[k]]) : Object.entries(value);
    const label = { fz: 'Fz', cz: 'Cz', pz: 'Pz' };
    return entries.map(([k, v]) => `${label[k] || k}:${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(', ');
  }
  const n = typeof value === 'number' ? (Math.round(value * 100) / 100) : value;
  if (!unit) return `${n}`;
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

// Map a status word to a colour family used across badges, values and bars.
function statusKind(status) {
  const s = String(status || '').toLowerCase();
  if (/(excellent|strong|healthy|good|balanced|normal)/.test(s)) return 'good';
  if (/(moderate|mild|borderline|right-shifted|left-shifted)/.test(s)) return 'warn';
  return 'bad'; // needs attention / low / elevated / high load
}
const KIND_COLOR = { good: '#16a34a', warn: '#d97706', bad: '#ea580c' };
const KIND_BG = { good: '#dcfce7', warn: '#fef3c7', bad: '#ffedd5' };
const KIND_FG = { good: '#15803d', warn: '#b45309', bad: '#c2410c' };

// Percent-driven colour scale used for the performance markers (matches the
// reference report): high = green, mid = blue, low = orange, very low = red.
function pctColor(p) {
  const n = Number(p) || 0;
  if (n >= 75) return '#16a34a';
  if (n >= 40) return '#2563eb';
  if (n >= 15) return '#ea580c';
  return '#dc2626';
}
function pctTint(p) {
  const n = Number(p) || 0;
  if (n >= 75) return '#dcfce7';
  if (n >= 40) return '#dbeafe';
  if (n >= 15) return '#ffedd5';
  return '#fee2e2';
}
function pctFg(p) {
  const n = Number(p) || 0;
  if (n >= 75) return '#15803d';
  if (n >= 40) return '#1e40af';
  if (n >= 15) return '#c2410c';
  return '#b91c1c';
}
function pctBadge(text, p) {
  return `<span class="badge" style="background:${pctTint(p)};color:${pctFg(p)}">${esc(String(text).toUpperCase())}</span>`;
}

// Stress & Burnout are inverted parameters: the displayed number is the LEVEL
// (low stress = 20%), but low = good. So their COLOUR is driven by the inverted
// value, matching the NeuroSense report (geminiPdfGenerator getBucketColor) where
// low stress = green. Positive parameters colour directly by percent.
const INVERTED_KEYS = new Set(['stress', 'burnout']);
function colorPct(b) {
  const p = Number(b && b.percent) || 0;
  return (b && INVERTED_KEYS.has(b.key)) ? (100 - p) : p;
}

// White brain glyph used inside the blue logo badge ({S} = pixel size).
const BRAIN_SVG =
  '<svg width="{S}" height="{S}" viewBox="0 0 24 24" fill="none" stroke="#fff" ' +
  'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>' +
  '<path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>' +
  '<path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>';

function logoMark(box) {
  const icon = Math.round(box * 0.58);
  return `<span class="lmark" style="width:${box}px;height:${box}px;">${BRAIN_SVG.replace(/\{S\}/g, icon)}</span>`;
}

// Clinic's uploaded logo (data URI) — set per render by renderReportHtml.
// When present it replaces the whole NeuroSense brand lockup (badge + text).
let CLINIC_LOGO = null;

function brandLockup(box, textHtml) {
  if (CLINIC_LOGO) {
    const h = Math.round(box * 1.4);
    // White chip behind the logo keeps it visible on the dark cover page.
    return `<img src="${CLINIC_LOGO}" alt="Clinic logo" style="height:${h}px;max-width:${box * 6}px;object-fit:contain;background:#fff;border-radius:8px;padding:3px 6px;"/>`;
  }
  return `${logoMark(box)}${textHtml}`;
}

function badge(text, kind) {
  return `<span class="badge" style="background:${KIND_BG[kind]};color:${KIND_FG[kind]}">${esc(String(text).toUpperCase())}</span>`;
}

// Snapshot marker row — each in its own bordered card with a value and a bar.
function snapCard(b) {
  const c = pctColor(colorPct(b));
  return `<div class="scard">
    <div class="scard-top"><span class="scard-lbl">${esc(b.icon)} ${esc(b.label)}</span><span class="scard-pct" style="color:${c}">${Number(b.percent) || 0}%</span></div>
    <div class="ptrack"><div class="pfill" style="width:${Math.max(2, Math.min(100, Number(b.percent) || 0))}%;background:${c}"></div></div>
  </div>`;
}

// Brainwave relative-power row (fixed band palette, not status-driven).
function waveRow(label, sub, valueText, pct, color) {
  return `<div class="wrow">
    <div class="wlabel"><strong>${esc(label)}</strong><span class="wsub">${esc(sub)}</span></div>
    <div class="ptrack big"><div class="pfill" style="width:${Math.max(2, Math.min(100, pct))}%;background:${color}"></div></div>
    <div class="wval">${esc(valueText)}</div>
  </div>`;
}

// Tinted signal / strengths / watch-zone card with coloured dot bullets.
const TONE = {
  good: { bg: '#f0fdf4', bd: '#bbf7d0', dot: '#16a34a', h: '#15803d', mk: '✓' },
  warn: { bg: '#fffbeb', bd: '#fde68a', dot: '#d97706', h: '#b45309', mk: '!' },
  info: { bg: '#eff6ff', bd: '#bfdbfe', dot: '#2563eb', h: '#1e40af', mk: '•' },
  plain: { bg: '#f8fafc', bd: '#e5e9f0', dot: '#64748b', h: '#334155', mk: '•' },
};
function toneCard(title, items, tone, useMark) {
  const t = TONE[tone];
  return `<div class="tcard" style="background:${t.bg};border-color:${t.bd}">
    <h4 style="color:${t.h}">${esc(title)}</h4>
    <ul>${(items || []).map((i) => `<li><span class="dot" style="${useMark ? `color:${t.dot};background:none;font-weight:800;` : `background:${t.dot};`}">${useMark ? t.mk : ''}</span><span>${esc(i)}</span></li>`).join('')}</ul>
  </div>`;
}

// Full-width tinted callout box (title + paragraph).
function calloutBox(title, body, tone) {
  const t = TONE[tone];
  return `<div class="callout" style="background:${t.bg};border-color:${t.bd}">
    ${title ? `<h4 style="color:${t.h}">${esc(title)}</h4>` : ''}
    <p>${esc(body)}</p>
  </div>`;
}

function pageHeader(num, section) {
  return `<div class="phead">
    <div class="brand">${brandLockup(30, '<div class="brand-txt"><div class="brand-name">NeuroSense Brain Health</div><div class="brand-sub">SMART EEG INTELLIGENCE</div></div>')}</div>
    <div class="phead-r">${esc(num)} / ${esc(section)}</div>
  </div>`;
}
function pageFooter(label) {
  return `<div class="pfoot"><span>NeuroSense • Limitless Brain Lab • limitlessbrainlab-eight.vercel.app</span><span>${esc(label)}</span></div>`;
}

// Split a strategy line ("4-7-8 breathing — twice daily...") into title/body on
// the em/en dash (hyphens without spaces, e.g. "4-7-8", are left intact).
function splitDash(s) {
  const parts = String(s).split(/\s+[—–]\s+/);
  if (parts.length >= 2) return { title: parts[0], body: parts.slice(1).join(' — ') };
  const dot = String(s).indexOf('. ');
  if (dot > 0) return { title: String(s).slice(0, dot), body: String(s).slice(dot + 2) };
  return { title: s, body: '' };
}

// Small icon shown before each brain-type trait pill on the "Your Type" hero.
const TRAIT_ICON = {
  Vigilant: '👁️', Prepared: '🎯', 'Deeply Feeling': '💗', 'Risk-Aware': '🛡️', 'High Arousal': '⚡',
  'Goal-Oriented': '🏁', 'High Drive': '🔥', Reliable: '✅', Balanced: '⚖️', 'Even-keeled': '😌', Adaptable: '🔄',
  Creative: '🎨', Curious: '🔍', Spontaneous: '✨', Divergent: '🌱', Driven: '⚡', Focused: '🎯', 'Strong-willed': '💪',
  Empathetic: '💗', Sensitive: '🌦️', Intuitive: '🔮', Expressive: '🎭',
};

function renderReportHtml(reportData, narrative = {}) {
  const d = reportData;
  const bt = d.brainType.primary;
  const secondary = d.brainType.secondary;
  const p = d.patient;
  const n = narrative || {};

  // Clinic logo swap — only accept an image data URI (never raw HTML/URLs).
  CLINIC_LOGO = (typeof p.clinicLogoDataUri === 'string' && p.clinicLogoDataUri.startsWith('data:image/'))
    ? p.clinicLogoDataUri
    : null;

  // ── Deterministic defaults merged with Claude narrative ────────────────────
  const topStrength = n.topStrength || { title: 'Top Strength', points: bt.strengths.slice(0, 2) };
  const watchZone = n.watchZone || { title: 'Watch Zone', points: bt.watchZones.slice(0, 2) };
  const brainTypeReason = n.brainTypeReason || bt.strengths;
  const planIntro = n.plan?.intro || `A staged, ${bt.name}-brain-friendly plan. The order matters: calm the nervous system first, then layer in performance work.`;
  const after30 = n.plan?.after30 || 'Repeat the qEEG after 30 days — the markers most likely to shift first are arousal, regeneration, and frontal asymmetry.';
  const typeSuperpower = n.typeSuperpower || bt.whyStrength;

  const dd = d.deepDive;
  const prof = d.profile;

  // Five-type cards (highlight the patient's primary type).
  const { TYPES } = require('../services/brainType5Classifier');
  const typeCards = [1, 2, 3, 4, 5].map((id) => {
    const t = TYPES[id];
    const active = id === bt.id;
    return `<div class="type-card ${active ? 'active' : ''}">
      ${active ? '<div class="type-tag">YOUR TYPE</div>' : ''}
      <div class="type-num">TYPE ${id}</div>
      <div class="type-name" ${active ? 'style="color:#1e63b4"' : ''}>${esc(t.name)}</div>
      <div class="type-card-desc">${esc(t.card)}</div>
    </div>`;
  }).join('');

  // Brainwave "what this means" cards (coloured titles by tone).
  const brainwaveCards = (n.brainwaveCards && n.brainwaveCards.length)
    ? n.brainwaveCards
    : [
        { title: `Strong alpha (peak ${fmt(prof.alphaPeakHz, 'Hz')})`, tone: 'good', body: `Your alpha rhythm is robust (${fmt(prof.alpha, '%')}) and peaks in the optimal range — it supports clear thinking, memory and the ability to enter relaxed focus. A genuine asset.` },
        { title: 'Elevated delta — recovery debt', tone: 'warn', body: `Daytime delta reads ${fmt(dd.daytimeDelta.value, '%')}. Combined with low regeneration, this points to accumulated recovery debt rather than a primary issue — sleep quality needs a close look.` },
        { title: 'Moderate theta & alpha:theta', tone: 'info', body: `Theta sits at ${fmt(prof.theta, '%')} — a workable zone for memory and learning. A foundation that spaced repetition will use well.` },
        { title: 'Beta & hi-beta profile', tone: 'warn', body: `Fast-wave activity (beta ${fmt(prof.beta, '%')}, hi-beta ${fmt(prof.hiBeta, '%')}) shapes your vigilance and active-thinking bandwidth. Watch it alongside your arousal markers.` },
      ];
  const bwTone = ['good', 'warn', 'info', 'warn'];

  // Brainwave relative-power distribution (fixed band palette).
  const profileRows = [
    waveRow('Delta', '0.5–4 Hz · Deep rest', fmt(prof.delta, '%'), prof.delta, '#2b6cb0'),
    waveRow('Theta', '4–7 Hz · Creativity', fmt(prof.theta, '%'), prof.theta, '#3b82f6'),
    waveRow('Alpha', '8–12 Hz · Calm focus', `Peak ${fmt(prof.alphaPeakHz, 'Hz')}`, prof.alpha, '#14b8c4'),
    waveRow('Beta', '13–30 Hz · Active thinking', fmt(prof.beta, '%'), prof.beta, '#94a3c8'),
    waveRow('Hi-Beta', '20–30 Hz · Vigilance', fmt(prof.hiBeta, '%'), prof.hiBeta, '#94a3c8'),
  ].join('');

  // Performance markers (page 8) — sub-labels per marker.
  const perfSub = {
    cognition: 'Thinking · Memory · Processing',
    stress: 'Recovery · Resilience',
    focus: 'Concentration · Distraction filter',
    burnout: 'Mental fuel · Stamina',
  };
  const perfCard = (b, sub, body) => {
    const c = pctColor(colorPct(b));
    return `<div class="card perf2">
      <div class="perf2-top"><div><div class="perf2-title">${esc(b.label)}</div><div class="perf2-sub">${esc(sub)}</div></div><div class="perf2-pct" style="color:${c}">${Number(b.percent) || 0}%</div></div>
      ${pctBadge(b.status, colorPct(b))}
      <p class="perf2-body">${esc(body || '')}</p>
    </div>`;
  };

  // Inner-bandwidth cards (page 9).
  const innerCard = (label, b, body) => {
    const c = pctColor(colorPct(b));
    return `<div class="card">
      <div class="perf2-title">${esc(label)}</div>
      <div class="inner-pct" style="color:${c}">${Number(b.percent) || 0}%</div>
      ${pctBadge(b.status, colorPct(b))}
      <p class="perf2-body" style="margin-top:6px;">${esc(body || '')}</p>
    </div>`;
  };
  const emotionAdvice = n.innerBandwidth?.emotionalAdvice || [
    'Daily "name it to tame it" — label what you\'re feeling before reacting.',
    'Slow-exhale breathing (longer out than in) calms the nervous system.',
    'Response-gap training — pause before reacting; reframe the situation.',
    'Limit news / social media in the first and last hour of the day.',
  ];
  const learningAdvice = n.innerBandwidth?.learningAdvice || [
    'Use spaced repetition — review material across days, not in one block.',
    'Schedule short "no-input" breaks — ideas surface when the brain is idle.',
    'Change your environment once a week for fresh thinking.',
    'Separate brainstorming from editing — never do both at once.',
  ];

  // Deep-dive metric descriptions (page 10) — narrative override or default.
  const ddDesc = n.deepDive?.descriptions || {};
  const ddDefault = {
    alphaPeak: 'A healthy alpha peak sits in the optimal band and supports clear information processing and relaxed focus — genuine cognitive horsepower to build on.',
    arousal: 'Your nervous-system baseline. Higher values mean it runs hot; lowering it is central to recovery, sleep and calmer focus.',
    relaxation: 'How readily you drop into a relaxed state — the mirror image of arousal. Breathwork and HRV training raise it directly.',
    regeneration: 'Brain recovery capacity — how fast you replenish what you spend. Protect sleep and add daily downtime to move this number.',
    frontalAsymmetry: 'Right-shifted values are linked to vigilance, worry and slower emotional recovery. Goal-activation routines rebuild the left side.',
    daytimeDelta: 'Elevated waking delta points to recovery debt and fatigue rather than a primary issue. Sleep optimisation addresses it.',
    focusScore: 'A theta:beta focus marker — above target is consistent with attention pulled sideways by vigilance. Pomodoro intervals and reduced threat-input help anchor sustained focus.',
    alphaTheta: 'A workable ratio for memory and learning. This is the foundation that makes spaced repetition and active recall effective for you.',
  };
  const metricCard = (key, m) => {
    const kind = statusKind(m.status);
    const c = KIND_COLOR[kind];
    return `<div class="card metric2">
      <div class="metric2-top"><div><div class="metric2-title">${esc(m.label)}</div><div class="metric2-sub">Optimal: ${esc(m.optimal)}</div></div><div class="metric2-val" style="color:${c}">${esc(fmt(m.value, m.unit))}</div></div>
      <p class="metric2-desc">${esc(ddDesc[key] || ddDefault[key] || '')}</p>
    </div>`;
  };

  // 30-day daily anchors (title/body split from the type's strategy).
  const anchorTags = ['Anchor habit', 'Recovery', 'Calm baseline', 'Movement'];
  const anchors = (bt.strategy.doMore || []).slice(0, 4).map((a, i) => {
    const { title, body } = splitDash(a);
    return `<div class="card anchor"><div class="anum">${i + 1}</div><div class="atxt"><div class="atitle">${esc(title)}</div><p class="abody">${esc(body)}</p><span class="atag">${esc(anchorTags[i] || 'Daily')}</span></div></div>`;
  }).join('');

  const weeks = [
    { label: 'WEEK 1 — CALM FIRST', title: 'Lock in the daily anchors', body: 'Just the anchors above, plus a short daily nervous-system reset. Prove to your brain that calm is safe and consistent.' },
    { label: 'WEEK 2 — CONTAIN', title: 'Add structure & containment', body: 'A short evening wind-down and a 3-item morning priority list. Contain the open loops before they run in the background.' },
    { label: 'WEEK 3 — RECOVER', title: 'Add one weekly true-rest session', body: '90 minutes of no productivity, no input, no goal. Through the week, alternate high-effort and lighter tasks so the brain is not overloaded.' },
    { label: 'WEEK 4 — ACTIVATE', title: 'Layer in performance work', body: 'A daily goal-activation routine — one small task-start, one intention, one thing you are looking forward to. Add spaced repetition for anything you are learning.' },
  ];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>NeuroSense Performance Report</title><style>
  @page { size: A4 portrait; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  img.emoji { height:1em; width:1em; margin:0 .05em; vertical-align:-.12em; display:inline-block; }
  body { font-family:'Helvetica Neue',Helvetica,Arial,'Liberation Sans',sans-serif; color:#1f2a44; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { position:relative; width:210mm; height:297mm; padding:16mm 15mm; page-break-after:always; overflow:hidden; }
  .page:last-child { page-break-after:auto; }
  .dark { background:linear-gradient(135deg,#123a76 0%,#1e63b4 100%); color:#fff; }
  h1 { font-size:44px; line-height:1.05; font-weight:800; letter-spacing:-0.5px; }
  h2 { font-size:30px; font-weight:800; color:#15315f; letter-spacing:-0.3px; }
  h2 .hl { color:#1f93c4; }
  .eyebrow { letter-spacing:3px; font-size:11px; font-weight:700; color:#8aa0c0; text-transform:uppercase; margin-bottom:8px; }
  .lead { color:#5b6b86; font-size:13.5px; line-height:1.6; margin-top:10px; max-width:660px; }
  /* brand + header/footer */
  .lmark { display:inline-flex; align-items:center; justify-content:center; border-radius:9px; background:#2f7ff0; flex:none; }
  .brand { display:flex; align-items:center; gap:9px; }
  .brand-name { font-weight:800; font-size:13px; color:#15315f; line-height:1.1; }
  .brand-sub { font-size:8px; letter-spacing:2px; color:#8aa0c0; font-weight:600; margin-top:2px; }
  .phead { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e5e9f0; padding-bottom:10px; margin-bottom:22px; }
  .phead-r { letter-spacing:3px; font-size:11px; color:#8aa0c0; font-weight:700; }
  .pfoot { position:absolute; bottom:11mm; left:15mm; right:15mm; display:flex; justify-content:space-between; font-size:10px; color:#9aa8c0; border-top:1px solid #eef1f6; padding-top:8px; }
  .card { background:#fff; border:1px solid #e8edf5; border-radius:14px; padding:16px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
  .badge { display:inline-block; font-size:9.5px; font-weight:800; letter-spacing:.5px; padding:4px 10px; border-radius:20px; margin:6px 0; }
  .ptrack { height:8px; background:#eef1f6; border-radius:6px; overflow:hidden; }
  .ptrack.big { height:11px; }
  .pfill { height:100%; border-radius:6px; }
  .mt8{margin-top:8px;} .mt14{margin-top:14px;} .mt18{margin-top:18px;} .mt24{margin-top:24px;}
  .h3 { font-size:17px; font-weight:800; color:#15315f; margin:20px 0 12px; }
  /* cover */
  .glow { position:absolute; top:-140px; right:-120px; width:520px; height:520px; border-radius:50%; background:radial-gradient(circle, rgba(120,175,255,.40), rgba(120,175,255,0) 70%); }
  .cover-brand-name { font-weight:800; font-size:20px; color:#fff; }
  .cover-brand-sub { font-size:9px; letter-spacing:3px; color:rgba(255,255,255,.7); font-weight:500; margin-top:2px; }
  .info-cards { position:absolute; bottom:24mm; left:15mm; right:15mm; display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .info-card { background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.20); border-radius:12px; padding:13px 15px; }
  .info-card .k { font-size:9px; letter-spacing:2px; opacity:.72; } .info-card .v{font-weight:700;font-size:15px;margin-top:6px;}
  .cover-foot { position:absolute; bottom:12mm; left:15mm; right:15mm; text-align:center; font-size:9.5px; color:rgba(255,255,255,.6); }
  /* table of contents */
  .toc-row { display:flex; align-items:center; gap:16px; padding:14px 2px; border-bottom:1px solid #eef1f6; }
  .toc-num { width:22px; text-align:center; color:#1e63b4; font-weight:800; font-size:15px; flex:none; }
  .toc-row .t { flex:1; font-weight:700; font-size:13px; color:#1f2a44; }
  .toc-row .pg { font-size:10.5px; letter-spacing:1px; color:#9aa8c0; font-weight:600; }
  /* snapshot */
  .snap { display:grid; grid-template-columns:0.85fr 1.35fr; gap:18px; }
  .score-card { background:linear-gradient(160deg,#1e63b4,#123a76); color:#fff; border-radius:16px; padding:22px; }
  .score-card .lbl { letter-spacing:3px; font-size:10px; opacity:.85; font-weight:700; text-transform:uppercase; }
  .score-card .big { font-size:60px; font-weight:800; line-height:1; margin-top:10px; }
  .scard { border:1px solid #e8edf5; border-radius:12px; padding:12px 14px; margin-bottom:9px; }
  .scard-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:9px; }
  .scard-lbl { font-weight:700; font-size:12.5px; color:#33405c; }
  .scard-pct { font-weight:800; font-size:14px; }
  .signals { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  .tcard { border:1px solid; border-radius:12px; padding:14px; }
  .tcard h4 { font-size:12.5px; margin-bottom:9px; }
  .tcard ul { list-style:none; } .tcard li { display:flex; gap:8px; font-size:10.5px; line-height:1.5; margin:7px 0; color:#41506c; }
  .dot { width:6px; height:6px; border-radius:50%; margin-top:5px; flex:none; display:inline-block; text-align:center; }
  /* callout */
  .callout { border:1px solid; border-radius:12px; padding:14px 16px; }
  .callout h4 { font-size:12.5px; margin-bottom:6px; }
  .callout p { font-size:11.5px; color:#41506c; line-height:1.6; }
  /* brainwaves */
  .wrow { display:flex; align-items:center; gap:14px; margin:12px 0; }
  .wrow .ptrack { flex:1; }
  .wlabel { width:170px; } .wlabel strong{font-size:13px;color:#1f2a44;} .wlabel .wsub{display:block;font-size:10px;color:#9aa8c0;margin-top:2px;}
  .wval { width:92px; text-align:right; font-weight:800; font-size:13px; color:#1f2a44; }
  .bw-card { } .bw-card .bt{font-weight:800;font-size:12.5px;margin-bottom:6px;} .bw-card p{font-size:11px;color:#5b6b86;line-height:1.5;}
  /* type cards */
  .types { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-top:18px; }
  .type-card { position:relative; border:1px solid #e8edf5; border-radius:12px; padding:16px 11px; }
  .type-card.active { border:2px solid #1e63b4; box-shadow:0 6px 18px rgba(30,99,180,.16); }
  .type-tag { position:absolute; top:-9px; left:11px; background:#1e63b4; color:#fff; font-size:8px; letter-spacing:1px; font-weight:800; padding:3px 9px; border-radius:10px; }
  .type-num { font-size:9px; letter-spacing:1px; color:#9aa8c0; font-weight:700; } .type-name{font-weight:800;font-size:15px;margin:4px 0 8px;color:#15315f;}
  .type-card-desc { font-size:9.5px; color:#6b7a94; line-height:1.5; }
  /* type hero */
  .hero { position:relative; border-radius:16px; background:linear-gradient(160deg,#1e63b4,#123a76); color:#fff; padding:24px; overflow:hidden; }
  .hero .hero-icon { position:absolute; right:22px; top:50%; transform:translateY(-50%); font-size:96px; opacity:.16; }
  .hero .eyebrow { color:#9ec2f0; }
  .pill { display:inline-block; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:18px; padding:5px 13px; font-size:11px; margin:6px 7px 0 0; }
  .mini-title { font-weight:800; font-size:13px; margin-bottom:6px; color:#15315f; }
  .mini-body { font-size:11px; color:#5b6b86; line-height:1.55; }
  /* performance */
  .perf2-top { display:flex; justify-content:space-between; align-items:flex-start; }
  .perf2-title { font-weight:800; font-size:15px; color:#15315f; } .perf2-sub{font-size:10px;color:#9aa8c0;margin-top:3px;}
  .perf2-pct { font-size:34px; font-weight:800; line-height:1; }
  .perf2-body { font-size:11px; color:#5b6b86; line-height:1.55; margin-top:8px; }
  .inner-pct { font-size:30px; font-weight:800; margin:6px 0 2px; }
  .advice-col h5 { font-size:12.5px; font-weight:800; color:#15315f; margin-bottom:8px; }
  .advice-col ul { list-style:none; } .advice-col li{display:flex;gap:8px;font-size:11px;line-height:1.5;color:#41506c;margin:6px 0;}
  .advice-col .dot { background:#2563eb; }
  /* deep-dive metrics */
  .metric2-top { display:flex; justify-content:space-between; align-items:flex-start; }
  .metric2-title { font-weight:800; font-size:13.5px; color:#15315f; } .metric2-sub{font-size:10px;color:#9aa8c0;margin-top:3px;}
  .metric2-val { font-size:26px; font-weight:800; line-height:1; }
  .metric2-desc { font-size:10.5px; color:#5b6b86; line-height:1.5; margin-top:9px; }
  /* 30-day plan */
  .anchor { display:flex; gap:12px; }
  .anum { width:26px; height:26px; border-radius:8px; background:#1e63b4; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; flex:none; }
  .atitle { font-weight:800; font-size:12.5px; color:#15315f; }
  .abody { font-size:10.5px; color:#5b6b86; line-height:1.5; margin:5px 0 8px; }
  .atag { display:inline-block; background:#e8f0fe; color:#1e40af; font-size:9px; font-weight:700; padding:3px 9px; border-radius:10px; }
  .week { background:#eff6ff; border-left:4px solid #2563eb; border-radius:0 10px 10px 0; padding:11px 16px; margin:9px 0; }
  .week-lbl { letter-spacing:2px; font-size:10px; font-weight:800; color:#1e63b4; }
  .week-title { font-weight:800; font-size:13px; color:#15315f; margin:2px 0 3px; }
  .week-body { font-size:10.5px; color:#5b6b86; line-height:1.5; }
  </style></head><body>

  <!-- PAGE 1 — COVER -->
  <section class="page dark">
    <div class="glow"></div>
    <div class="brand">${brandLockup(40, '<div><div class="cover-brand-name">NeuroSense</div><div class="cover-brand-sub">SMART EEG INTELLIGENCE</div></div>')}</div>
    <div style="margin-top:150px;">
      <div class="eyebrow" style="color:#9ec2f0;">Personalized Neuro-Profile</div>
      <h1 style="font-size:52px;line-height:1.06;">Your Brain<br>Type &amp; Performance<br>Report</h1>
      <p class="lead" style="color:#cfe0f7;">A complete map of your brainwave activity, cognitive performance, and dominant brain type — built from 19-channel qEEG analysis and the NeuroSense five-type framework.</p>
    </div>
    <div class="info-cards">
      <div class="info-card"><div class="k">NAME</div><div class="v">${esc(p.name)}</div></div>
      <div class="info-card"><div class="k">ASSESSMENT</div><div class="v">${esc(p.assessmentDate)}</div></div>
      <div class="info-card"><div class="k">BRAIN TYPE</div><div class="v">${esc(bt.name)}</div></div>
      <div class="info-card"><div class="k">REPORT ID</div><div class="v">${esc(p.reportId)}</div></div>
    </div>
    <div class="cover-foot">${p.generatedOn ? `Report generated on: ${esc(p.generatedOn)} by Limitless Brain Lab<br>` : ''}${esc(p.clinicName)} • This AI-generated report is for informational and wellness purposes only and is not a medical diagnosis.<br>limitlessbrainlab-eight.vercel.app</div>
  </section>

  <!-- PAGE 2 — WELCOME / CONTENTS -->
  <section class="page">
    ${pageHeader('01', 'WELCOME')}
    <div class="eyebrow">Welcome, ${esc(p.firstName)}</div>
    <h2>What's inside this <span class="hl">report</span></h2>
    <p class="lead">This is a complete walkthrough of how your brain works — from the dominant brainwave patterns recorded across 19 EEG channels, to your unique brain type, to a personalized 30-day plan. Every section translates raw neuroscience into something you can actually use.</p>
    <div class="mt18">
      <div class="toc-row"><div class="toc-num">1</div><div class="t">Your Snapshot — at-a-glance score &amp; key signals</div><div class="pg">PAGE 3</div></div>
      <div class="toc-row"><div class="toc-num">2</div><div class="t">Brainwave Profile — Delta, Theta, Alpha, Beta, hi-Beta</div><div class="pg">PAGE 4</div></div>
      <div class="toc-row"><div class="toc-num">3</div><div class="t">Your Brain Type — the NeuroSense five-type framework</div><div class="pg">PAGE 5–6</div></div>
      <div class="toc-row"><div class="toc-num">4</div><div class="t">Type-Specific Strategy Guide</div><div class="pg">PAGE 7</div></div>
      <div class="toc-row"><div class="toc-num">5</div><div class="t">Performance Markers — Cognition, Focus, Stress, Burnout</div><div class="pg">PAGE 8</div></div>
      <div class="toc-row"><div class="toc-num">6</div><div class="t">Emotional Regulation, Learning &amp; Creativity</div><div class="pg">PAGE 9</div></div>
      <div class="toc-row"><div class="toc-num">7</div><div class="t">Deep-Dive Neuro-Metrics</div><div class="pg">PAGE 10</div></div>
      <div class="toc-row"><div class="toc-num">8</div><div class="t">Your 30-Day Brain Optimization Plan</div><div class="pg">PAGE 11</div></div>
    </div>
    <div class="card mt24" style="background:#f8fafc;">
      <div class="mini-title">How to read this report</div>
      <p class="mini-body">Each metric is shown as a percentile or raw EEG value. Higher isn't always better — for stress regulation, higher means calmer. Look for the colored status badges (Excellent → Needs Attention) on every metric card. Your Brain Type on page 5 is the lens through which every score should be interpreted.</p>
    </div>
    ${pageFooter('Page 2 • Welcome')}
  </section>

  <!-- PAGE 3 — SNAPSHOT -->
  <section class="page">
    ${pageHeader('02', 'SNAPSHOT')}
    <div class="eyebrow">Section 1 — Quick Read</div>
    <h2>Your brain at a <span class="hl">glance</span></h2>
    <p class="lead">${esc(n.snapshotSummary || 'A quick view of where you stand right now. Your standout strength and your main growth zone are highlighted below — the signals that point to where small daily practices will yield the biggest gains.')}</p>
    <div class="snap mt18">
      <div class="score-card">
        <div class="lbl">Overall Brain Performance</div>
        <div class="big">${d.overall}<span style="font-size:22px;opacity:.7;">/100</span></div>
        <p style="font-size:11px;opacity:.92;margin-top:14px;line-height:1.55;">${esc(n.overallSummary || 'A composite of your seven performance markers. The growth zones are where small, consistent daily practices move the numbers most — recovery-first habits shift these fastest.')}</p>
      </div>
      <div>${d.bars.map(snapCard).join('')}</div>
    </div>
    <h3 class="h3">Your three biggest signals</h3>
    <div class="signals">
      ${toneCard(`💪 ${topStrength.title}`, topStrength.points, 'good', false)}
      ${toneCard(`⚠️ ${watchZone.title}`, watchZone.points, 'warn', false)}
      ${toneCard(`🎯 Brain Type`, [`Type ${bt.id} — ${bt.name}${secondary ? `, with secondary ${secondary.name} traits.` : '.'}`, bt.tagline], 'info', false)}
    </div>
    ${pageFooter('Page 3 • Snapshot')}
  </section>

  <!-- PAGE 4 — BRAINWAVE PROFILE -->
  <section class="page">
    ${pageHeader('03', 'BRAINWAVES')}
    <div class="eyebrow">Section 2 — The Five Bands</div>
    <h2>Your brainwave <span class="hl">profile</span></h2>
    <p class="lead">${esc(n.brainwaveIntro || 'Your brain produces five distinct rhythms simultaneously, each tied to a different mental state. The mix tells us what kind of brain you have. Below is your relative power across the spectrum (eyes-closed, posterior average).')}</p>
    <h3 class="h3">Relative Power Distribution</h3>
    ${profileRows}
    <h3 class="h3">What this means for you</h3>
    <div class="grid2">${brainwaveCards.slice(0, 4).map((c, i) => { const tone = TONE[c.tone] || TONE[bwTone[i]] || TONE.info; return `<div class="card bw-card"><div class="bt" style="color:${tone.h}">${esc(c.title)}</div><p>${esc(c.body)}</p></div>`; }).join('')}</div>
    ${pageFooter('Page 4 • Brainwaves')}
  </section>

  <!-- PAGE 5 — FIVE TYPES -->
  <section class="page">
    ${pageHeader('04', 'BRAIN TYPE')}
    <div class="eyebrow">Section 3 — The NeuroSense Framework</div>
    <h2>The five <span class="hl">brain types</span></h2>
    <p class="lead">Decades of brain imaging and qEEG research show that brains organize themselves into recognizable patterns — distinct combinations of arousal, regulation and reactivity that shape personality, behavior and how people respond to stress. Knowing your type isn't a label — it's a lens. It tells you which strategies will actually work for your brain.</p>
    <div class="types">${typeCards}</div>
    <div class="callout mt24" style="background:${TONE.info.bg};border-color:${TONE.info.bd}">
      <h4 style="color:${TONE.info.h}">How we determined your type</h4>
      <p style="margin-bottom:8px;">Your qEEG showed signatures that map onto the <strong>${esc(bt.name)} (Type ${bt.id})</strong> profile${secondary ? `, with secondary <strong>${esc(secondary.name)}</strong> features` : ''}:</p>
      <ul style="list-style:none;">${brainTypeReason.map((r) => `<li style="display:flex;gap:8px;font-size:11px;line-height:1.55;color:#41506c;margin:6px 0;"><span class="dot" style="background:#2563eb;"></span><span>${esc(r)}</span></li>`).join('')}</ul>
    </div>
    <div class="card mt14" style="background:#f8fafc;">
      <div class="mini-title">A word on brain types</div>
      <p class="mini-body">No type is "good" or "bad." Each comes with strengths and tendencies. The goal is not to change your type — it's to work with it. The next page is a deep dive on what your ${esc(bt.name)} brain looks like from the inside.</p>
    </div>
    ${pageFooter('Page 5 • Brain Types Overview')}
  </section>

  <!-- PAGE 6 — YOUR TYPE DEEP DIVE -->
  <section class="page">
    ${pageHeader('04', 'YOUR TYPE')}
    <div class="hero">
      <div class="hero-icon">${esc(bt.icon)}</div>
      <div class="eyebrow">${esc(p.firstName)}'s Brain Type</div>
      <h1 style="font-size:30px;">Type ${bt.id} — The ${esc(bt.name)} Brain</h1>
      <p class="lead" style="color:#cfe0f7;">${esc(bt.tagline)}.</p>
      <div class="mt14">${bt.traits.map((t) => `<span class="pill">${TRAIT_ICON[t] ? esc(TRAIT_ICON[t]) + ' ' : ''}${esc(t)}</span>`).join('')}</div>
    </div>
    <h3 class="h3">What's happening in your brain</h3>
    <div class="grid2">
      <div class="card"><div class="mini-title">🧬 The neuroscience</div><p class="mini-body">${esc(bt.neuroscience)}</p></div>
      <div class="card"><div class="mini-title">⭐ Why it's a strength</div><p class="mini-body">${esc(bt.whyStrength)}</p></div>
    </div>
    <h3 class="h3">Your strengths &amp; watch-zones</h3>
    <div class="grid2">
      ${toneCard(`✨ ${bt.name}-Brain Strengths`, bt.strengths, 'good', true)}
      ${toneCard(`🔍 ${bt.name}-Brain Watch-Zones`, bt.watchZones, 'warn', true)}
    </div>
    ${pageFooter('Page 6 • Your Type Deep Dive')}
  </section>

  <!-- PAGE 7 — STRATEGY GUIDE -->
  <section class="page">
    ${pageHeader('04', 'TYPE STRATEGY')}
    <div class="eyebrow">What Works For Your Type</div>
    <h2>${esc(bt.name)}-brain <span class="hl">strategy guide</span></h2>
    <p class="lead">Generic advice often fails this type. Here's what actually moves the needle for a ${esc(bt.name)} brain — the lifestyle, nutrition and mental practices matched to how your nervous system is wired.</p>
    <h3 class="h3">Lifestyle &amp; nutrition (Type ${bt.id} protocol)</h3>
    <div class="grid3">
      <div class="card"><div class="mini-title">🥗 Eat for your type</div><p class="mini-body">${esc(bt.strategy.eat)}</p></div>
      <div class="card"><div class="mini-title">🏃 Move</div><p class="mini-body">${esc(bt.strategy.move)}</p></div>
      <div class="card"><div class="mini-title">😴 Sleep</div><p class="mini-body">${esc(bt.strategy.sleep)}</p></div>
    </div>
    <h3 class="h3">Mind &amp; emotional practices</h3>
    <div class="grid2">${toneCard('✓ Do more of', bt.strategy.doMore, 'good', true)}${toneCard('! Less of', bt.strategy.lessOf, 'warn', true)}</div>
    ${calloutBox(`The Type ${bt.id} superpower (when supported)`, typeSuperpower, 'info')}
    ${pageFooter('Page 7 • Type-Specific Strategy')}
  </section>

  <!-- PAGE 8 — PERFORMANCE MARKERS -->
  <section class="page">
    ${pageHeader('05', 'PERFORMANCE')}
    <div class="eyebrow">Section 4 — Performance Markers</div>
    <h2>Cognition &amp; <span class="hl">stress</span></h2>
    <p class="lead">These are the two engines of daily performance — how clearly you think and how well you handle pressure. Together they determine whether your brain is helping you or working against you.</p>
    ${calloutBox('Why these markers matter', n.performanceFeature || 'Cognition and focus tell you how clearly you think; stress regulation and burnout resistance tell you whether your brain is helping or working against you. When arousal runs high and recovery runs low, the same drive that fuels performance starts feeding fatigue. The good news: these are the most reversible scores of all — they tend to move first when recovery habits go in.', 'warn')}
    <div class="grid2 mt18">
      ${perfCard(d.performance.cognition, perfSub.cognition, n.performance?.cognition)}
      ${perfCard(d.performance.stress, perfSub.stress, n.performance?.stress)}
      ${perfCard(d.performance.focus, perfSub.focus, n.performance?.focus)}
      ${perfCard(d.performance.burnout, perfSub.burnout, n.performance?.burnout)}
    </div>
    ${pageFooter('Page 8 • Cognition & Stress')}
  </section>

  <!-- PAGE 9 — EMOTION / LEARNING / CREATIVITY -->
  <section class="page">
    ${pageHeader('05', 'INNER BANDWIDTH')}
    <div class="eyebrow">Section 5 — Inner Bandwidth</div>
    <h2>Emotion, learning &amp; <span class="hl">creativity</span></h2>
    <p class="lead">When the nervous system is busy scanning for threat and running on empty, it has less bandwidth left for emotional flexibility, divergent thinking and the open-mode states that drive creativity. This is exactly the pattern your data shows — and it's also the most reversible.</p>
    <div class="grid3 mt18">
      ${innerCard('💗 Emotional Regulation', d.innerBandwidth.emotional, n.innerBandwidth?.emotional)}
      ${innerCard('📚 Learning Capacity', d.innerBandwidth.learning, n.innerBandwidth?.learning)}
      ${innerCard('🎨 Creativity', d.innerBandwidth.creativity, n.innerBandwidth?.creativity)}
    </div>
    ${calloutBox('The hidden link between these three', n.innerBandwidth?.link || 'Emotional regulation, creative thinking and durable learning all depend on the same underlying state: low arousal plus alert alpha. When the nervous system runs hot and depleted, all three drop together. When you give the brain real recovery, all three rise — usually together. That\'s why the plan focuses on calming and recovering, not on adding more.', 'info')}
    <h3 class="h3">For your type — Type ${bt.id} specific advice</h3>
    <div class="grid2">
      <div class="advice-col"><h5>Emotional regulation</h5><ul>${emotionAdvice.map((i) => `<li><span class="dot"></span><span>${esc(i)}</span></li>`).join('')}</ul></div>
      <div class="advice-col"><h5>Learning &amp; creativity</h5><ul>${learningAdvice.map((i) => `<li><span class="dot"></span><span>${esc(i)}</span></li>`).join('')}</ul></div>
    </div>
    ${pageFooter('Page 9 • Inner Bandwidth')}
  </section>

  <!-- PAGE 10 — DEEP-DIVE METRICS -->
  <section class="page">
    ${pageHeader('06', 'DEEP DIVE')}
    <div class="eyebrow">Section 6 — The Numbers Behind The Story</div>
    <h2>Deep-dive <span class="hl">neuro metrics</span></h2>
    <p class="lead">For those who want to see the actual EEG values behind every score above. These are the metrics your clinician will reference.</p>
    ${calloutBox('Reading these numbers', n.deepDive?.readingPattern || 'No single metric tells the story — look at the pattern they form together. High arousal + low relaxation + low regeneration + excessive delta + a shifted frontal asymmetry describe an overloaded, vigilant brain that has run past its recovery capacity.', 'plain')}
    <div class="grid2 mt18">
      ${metricCard('alphaPeak', dd.alphaPeak)}${metricCard('arousal', dd.arousal)}
      ${metricCard('relaxation', dd.relaxation)}${metricCard('regeneration', dd.regeneration)}
      ${metricCard('frontalAsymmetry', dd.frontalAsymmetry)}${metricCard('daytimeDelta', dd.daytimeDelta)}
      ${metricCard('focusScore', dd.focusScore)}${metricCard('alphaTheta', dd.alphaTheta)}
    </div>
    ${pageFooter('Page 10 • Deep-Dive Metrics')}
  </section>

  <!-- PAGE 11 — 30-DAY PLAN -->
  <section class="page">
    ${pageHeader('07', 'ACTION PLAN')}
    <div class="eyebrow">Section 7 — Your Personalized Plan</div>
    <h2>Your 30-day <span class="hl">brain plan</span></h2>
    <p class="lead">${esc(planIntro)}</p>
    <h3 class="h3">Daily non-negotiables (start tomorrow)</h3>
    <div class="grid2">${anchors}</div>
    <h3 class="h3">Week-by-week build</h3>
    ${weeks.map((w) => `<div class="week"><div class="week-lbl">${esc(w.label)}</div><div class="week-title">${esc(w.title)}</div><p class="week-body">${esc(w.body)}</p></div>`).join('')}
    ${calloutBox('After 30 days', after30, 'info')}
    ${pageFooter('Page 11 • 30-Day Plan')}
  </section>

  <!-- PAGE 12 — CLOSING / CONTACT -->
  <section class="page dark" style="text-align:center;position:relative;">
    <div style="margin-top:150px;">
      <div style="font-size:40px;">◉</div>
      <h1 style="margin-top:20px;">Your brain is unique.<br>Your plan should be too.</h1>
      <p class="lead" style="color:#cfe0f7;margin:20px auto 0;">${esc(n.closing || 'This report is a starting point, not a finish line. Small, consistent shifts in lifestyle, sleep, and self-regulation produce measurable changes in your EEG within weeks. We\'re here to walk that path with you.')}</p>
      <div class="card" style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);max-width:340px;margin:34px auto 0;color:#fff;">
        <div style="letter-spacing:2px;font-size:11px;opacity:.75;">GET IN TOUCH</div>
        <div style="font-weight:800;font-size:22px;margin:8px 0;">+971 58 560 2551</div>
        <div style="color:#9ec2f0;font-size:13px;">limitlessbrainlab-eight.vercel.app</div>
      </div>
    </div>
    <div style="position:absolute;bottom:24mm;left:16mm;right:16mm;font-size:9px;line-height:1.5;color:rgba(255,255,255,.65);text-align:left;">This AI-generated qEEG report is provided for informational, educational, and wellness purposes only. It is not intended to diagnose, treat, cure, mitigate, or prevent any medical condition and is not a substitute for the individualized care of a licensed healthcare professional. The five brain-type framework is the NeuroSense interpretation of common qEEG patterns and is used for educational context only.</div>
  </section>

  </body></html>`;
}

module.exports = { renderReportHtml };
