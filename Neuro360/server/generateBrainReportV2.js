const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');

const downloadsPath = path.join(os.homedir(), 'Downloads');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; }
  .page { width: 794px; height: 1123px; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; position: relative; }
  .page:last-child { page-break-after: avoid; }
  @page { size: A4; margin: 0; }
  @media print { .page { page-break-after: always; } }

  /* ===== PAGE 1: COVER ===== */
  .p1 { background: #ffffff; }

  /* Header */
  .p1-header { padding: 20px 36px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e8f0fe; }
  .p1-logo { display: flex; flex-direction: column; }
  .p1-logo .brand { font-size: 20px; font-weight: 900; color: #001453; letter-spacing: -0.5px; }
  .p1-logo .brand span { color: #1565C0; }
  .p1-logo .tagline { font-size: 8.5px; color: #999; letter-spacing: 0.8px; margin-top: 2px; text-transform: uppercase; }
  .p1-header-right { text-align: right; font-size: 9.5px; color: #aaa; line-height: 1.6; }

  /* Blue title banner */
  .p1-banner { margin: 22px 36px 0; background: linear-gradient(110deg, #001453 0%, #1565C0 70%, #1976D2 100%); border-radius: 14px; padding: 24px 32px; position: relative; overflow: hidden; }
  .p1-banner::after { content: ''; position: absolute; top: -30px; right: -30px; width: 140px; height: 140px; background: rgba(255,255,255,0.06); border-radius: 50%; }
  .p1-banner::before { content: ''; position: absolute; bottom: -20px; right: 80px; width: 80px; height: 80px; background: rgba(255,255,255,0.04); border-radius: 50%; }
  .p1-banner-label { font-size: 9px; letter-spacing: 4px; color: rgba(255,255,255,0.5); text-transform: uppercase; margin-bottom: 8px; }
  .p1-banner h1 { font-size: 30px; font-weight: 900; color: white; line-height: 1.2; letter-spacing: -0.3px; position: relative; z-index: 1; }

  /* Hero visual area */
  .p1-hero { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #f8fbff; margin: 18px 36px 0; border-radius: 14px; overflow: hidden; }
  .p1-hero-blobs { position: absolute; inset: 0; pointer-events: none; }
  .p1-hero-content { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .p1-scan-label { font-size: 9px; letter-spacing: 5px; color: #1565C0; text-transform: uppercase; font-weight: 600; }

  /* Patient section */
  .p1-patient { margin: 14px 36px 0; background: #001453; border-radius: 16px; padding: 20px 28px; }
  .p1-patient-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  .p1-patient-header .pname { font-size: 20px; font-weight: 800; color: white; }
  .p1-patient-header .preport { font-size: 9px; letter-spacing: 2px; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 2px; }
  .p1-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .p1-field { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 14px; }
  .p1-field-icon { flex-shrink: 0; opacity: 0.6; }
  .p1-field-label { font-size: 8px; text-transform: uppercase; letter-spacing: 1.2px; color: rgba(255,255,255,0.45); }
  .p1-field-value { font-size: 13px; font-weight: 700; color: white; margin-top: 3px; }

  /* Footer */
  .p1-footer { padding: 12px 36px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e8f0fe; margin-top: 14px; }
  .p1-footer p { font-size: 8.5px; color: #bbb; }
  .p1-footer .pgnum { font-size: 9px; font-weight: 700; color: #001453; }

  /* ===== PAGE 2: INTRO ===== */
  .p2 { background: #f7f9ff; }
  .pg-header { background: white; padding: 18px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1565C0; }
  .pg-brand { font-size: 15px; font-weight: 900; color: #001453; }
  .pg-brand span { color: #1565C0; }
  .pg-badge { background: #1565C0; color: white; font-size: 9px; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; font-weight: 600; }

  .pg-body { flex: 1; padding: 28px 40px; display: flex; flex-direction: column; }
  .big-heading { font-size: 32px; font-weight: 900; color: #001453; margin-bottom: 6px; }
  .big-heading span { color: #1565C0; }
  .accent-bar { width: 50px; height: 4px; background: #1565C0; border-radius: 2px; margin-bottom: 18px; }
  .body-p { font-size: 11.5px; line-height: 1.85; color: #444; margin-bottom: 12px; }

  .blue-box { background: white; border-left: 4px solid #1565C0; border-radius: 0 10px 10px 0; padding: 14px 18px; margin: 6px 0 18px; box-shadow: 0 2px 10px rgba(21,101,192,0.09); }
  .blue-box h3 { font-size: 13px; color: #001453; font-weight: 700; margin-bottom: 5px; }
  .blue-box p { font-size: 11px; color: #555; line-height: 1.7; }

  .eeg-box { background: linear-gradient(135deg, #dde8fc 0%, #c3d7f7 100%); border-radius: 12px; flex: 1; min-height: 140px; display: flex; flex-direction: column; justify-content: flex-end; padding: 16px 20px; position: relative; overflow: hidden; }
  .eeg-lines { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-evenly; padding: 12px 0; }
  .eeg-line { height: 1.5px; background: rgba(21,101,192,0.25); margin: 0 16px; position: relative; }
  .eeg-svg { position: absolute; inset: 0; }
  .eeg-caption { font-size: 10px; color: #1565C0; font-weight: 600; position: relative; z-index: 1; }

  .refs { margin-top: 14px; }
  .refs p { font-size: 9px; color: #999; line-height: 1.6; }

  .pg-footer { background: #1565C0; padding: 10px 40px; display: flex; justify-content: space-between; align-items: center; }
  .pg-footer p { color: rgba(255,255,255,0.7); font-size: 9px; }
  .pg-footer .pgnum { color: white; font-weight: 700; font-size: 10px; }

  /* ===== PAGE 3: CONGRATS ===== */
  .p3 { background: linear-gradient(160deg, #5b21b6 0%, #1d4ed8 50%, #0369a1 100%); }
  .p3-body { flex: 1; padding: 40px 44px 20px; display: flex; flex-direction: column; }
  .p3-heading { color: white; font-size: 36px; font-weight: 800; line-height: 1.2; text-align: center; margin-bottom: 8px; }
  .p3-sub { color: rgba(255,255,255,0.7); font-size: 13px; text-align: center; margin-bottom: 32px; }
  .p3-cards { flex: 1; display: flex; flex-direction: column; gap: 14px; }
  .p3-card { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 18px 22px; display: flex; align-items: flex-start; gap: 16px; }
  .p3-icon-wrap { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0; }
  .p3-card-text h3 { color: white; font-size: 15px; font-weight: 700; margin-bottom: 6px; }
  .p3-card-text p { color: rgba(255,255,255,0.75); font-size: 11.5px; line-height: 1.7; }
  .p3-footer-note { background: rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 18px; text-align: center; margin-top: 14px; }
  .p3-footer-note p { color: rgba(255,255,255,0.7); font-size: 11px; line-height: 1.6; }
  .p3-footer { background: rgba(0,0,0,0.2); padding: 10px 44px; display: flex; justify-content: space-between; align-items: center; }
  .p3-footer p { color: rgba(255,255,255,0.5); font-size: 9px; }
  .p3-footer .pgnum { color: white; font-weight: 700; font-size: 10px; }

  /* ===== PAGE 4: BRAIN MARKERS ===== */
  .p4 { background: #f7f9ff; }
  .p4-hero { background: linear-gradient(135deg, #001453 0%, #1565C0 100%); padding: 28px 40px 24px; position: relative; overflow: hidden; }
  .p4-hero h1 { color: white; font-size: 30px; font-weight: 800; position: relative; z-index: 1; }
  .p4-hero p { color: rgba(255,255,255,0.7); font-size: 12px; margin-top: 6px; position: relative; z-index: 1; }
  .p4-hero-deco { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); display: flex; gap: 12px; opacity: 0.15; }
  .p4-hero-deco .circle { width: 80px; height: 80px; border-radius: 50%; border: 2px solid white; }
  .p4-hero-deco .circle.sm { width: 50px; height: 50px; align-self: center; }

  .p4-grid { flex: 1; padding: 20px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .p4-card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 3px 14px rgba(0,0,0,0.07); border-top: 3px solid #1565C0; display: flex; flex-direction: column; gap: 10px; }
  .p4-card.accent-green { border-top-color: #16a34a; }
  .p4-card.accent-purple { border-top-color: #7c3aed; }
  .p4-card.accent-orange { border-top-color: #ea580c; }
  .p4-card.full { grid-column: 1 / -1; flex-direction: row; align-items: flex-start; }
  .p4-icon { font-size: 28px; }
  .p4-card-title { font-size: 15px; font-weight: 800; color: #001453; }
  .p4-card-desc { font-size: 11px; color: #555; line-height: 1.75; flex: 1; }
  .p4-card-tag { display: inline-block; background: #e8f0fe; color: #1565C0; font-size: 9px; font-weight: 700; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.5px; align-self: flex-start; }

  /* ===== PAGE 5: YOUR NUMBERS ===== */
  .p5 { background: #f7f9ff; }
  .p5-score-banner { background: linear-gradient(to right, #001453, #1565C0); margin: 20px 40px 0; border-radius: 14px; padding: 20px 28px; display: flex; align-items: center; gap: 24px; }
  .p5-overall { text-align: center; min-width: 90px; }
  .p5-overall .num { font-size: 56px; font-weight: 900; color: white; line-height: 1; }
  .p5-overall .lbl { color: rgba(255,255,255,0.6); font-size: 9px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .p5-overall .out-of { color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 2px; }
  .divider-v { width: 1px; background: rgba(255,255,255,0.2); align-self: stretch; }
  .p5-note { color: rgba(255,255,255,0.8); font-size: 11.5px; line-height: 1.7; }
  .p5-note strong { color: white; }

  .p5-list { flex: 1; padding: 16px 40px 0; display: flex; flex-direction: column; gap: 10px; }
  .p5-row { background: white; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  .p5-emoji { font-size: 24px; width: 36px; text-align: center; }
  .p5-meta { width: 160px; }
  .p5-meta .name { font-size: 13px; font-weight: 700; color: #001453; }
  .p5-meta .sub { font-size: 9.5px; color: #999; margin-top: 2px; }
  .p5-bar-area { flex: 1; }
  .p5-bar-bg { background: #f0f4ff; border-radius: 6px; height: 8px; overflow: hidden; }
  .p5-bar-fg { height: 100%; border-radius: 6px; }
  .bar-blue { background: linear-gradient(to right, #1565C0, #42A5F5); }
  .bar-amber { background: linear-gradient(to right, #d97706, #fbbf24); }
  .bar-red { background: linear-gradient(to right, #dc2626, #f87171); }
  .p5-bar-label { font-size: 9px; color: #aaa; margin-top: 3px; }
  .p5-badge { width: 74px; text-align: center; padding: 5px 0; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .b-good { background: #dbeafe; color: #1e40af; }
  .b-avg { background: #fef3c7; color: #92400e; }
  .b-low { background: #fee2e2; color: #991b1b; }

  /* ===== PAGE 6: BRAINWAVE PROFILES ===== */
  .p6 { background: #f7f9ff; }
  .p6-intro { padding: 20px 40px 0; }
  .p6-desc { font-size: 12px; color: #555; line-height: 1.8; margin-top: 10px; }
  .p6-grid { flex: 1; padding: 16px 40px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .p6-card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 3px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 8px; }
  .p6-wave-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .p6-wave-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .wb-beta { background: #dbeafe; color: #1e40af; }
  .wb-alpha { background: #d1fae5; color: #065f46; }
  .wb-theta { background: #ede9fe; color: #5b21b6; }
  .wb-delta { background: #fce7f3; color: #9d174d; }
  .p6-freq { font-size: 22px; font-weight: 900; color: #001453; }
  .p6-freq span { font-size: 11px; font-weight: 400; color: #999; }
  .p6-role-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
  .p6-items { list-style: none; flex: 1; }
  .p6-items li { font-size: 10.5px; color: #555; padding: 5px 0; border-bottom: 1px solid #f4f4f4; display: flex; align-items: flex-start; gap: 6px; line-height: 1.5; }
  .p6-items li:last-child { border-bottom: none; }
  .p6-items li::before { content: '›'; color: #1565C0; font-weight: 700; font-size: 14px; line-height: 1.2; flex-shrink: 0; }
  .p6-excess { background: #fef2f2; border-radius: 6px; padding: 7px 10px; font-size: 10px; color: #991b1b; }
  .p6-excess strong { font-weight: 700; }

  /* ===== PAGE 7: RECOMMENDATIONS ===== */
  .p7 { background: #001453; }
  .p7-top { padding: 32px 44px 20px; }
  .p7-top h1 { color: white; font-size: 30px; font-weight: 800; }
  .p7-top p { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 6px; }
  .p7-cards { flex: 1; padding: 8px 44px 16px; display: flex; flex-direction: column; gap: 12px; }
  .p7-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 16px 20px; display: flex; align-items: flex-start; gap: 14px; }
  .p7-num { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #1565C0, #42A5F5); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
  .p7-text h3 { color: white; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .p7-text p { color: rgba(255,255,255,0.65); font-size: 11px; line-height: 1.7; }
  .p7-footer { background: rgba(0,0,0,0.3); padding: 10px 44px; display: flex; justify-content: space-between; align-items: center; }
  .p7-footer p { color: rgba(255,255,255,0.45); font-size: 9px; }
  .p7-footer .pgnum { color: rgba(255,255,255,0.85); font-weight: 700; font-size: 10px; }
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<div class="page p1">

  <!-- Header -->
  <div class="p1-header">
    <div class="p1-logo">
      <div class="brand">Neuro<span>Sense</span></div>
      <div class="tagline">Smart EEG Intelligence</div>
    </div>
    <div class="p1-header-right">
      <div>limitlessbrainlab-eight.vercel.app</div>
      <div>Assessment: 26/03/2026</div>
    </div>
  </div>

  <!-- Blue title banner -->
  <div class="p1-banner">
    <div class="p1-banner-label">Personalized Brain Assessment</div>
    <h1>Neurosense Brain Health<br>Optimization Report</h1>
  </div>

  <!-- Hero visual -->
  <div class="p1-hero">
    <!-- Background soft blobs -->
    <div class="p1-hero-blobs">
      <svg width="722" height="100%" viewBox="0 0 722 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="170" rx="180" ry="130" fill="#dde8fc" opacity="0.5"/>
        <ellipse cx="642" cy="170" rx="180" ry="130" fill="#dde8fc" opacity="0.5"/>
        <ellipse cx="361" cy="170" rx="140" ry="100" fill="#e8f2ff" opacity="0.6"/>
      </svg>
    </div>
    <!-- Neural network brain-scan SVG -->
    <div class="p1-hero-content">
      <div class="p1-scan-label">Neural Activity Map</div>
      <svg width="320" height="240" viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Scan rings -->
        <circle cx="160" cy="118" r="112" stroke="#c3d7f7" stroke-width="1" fill="none"/>
        <circle cx="160" cy="118" r="86"  stroke="#b0c9f5" stroke-width="1" fill="none"/>
        <circle cx="160" cy="118" r="60"  stroke="#90b4f0" stroke-width="1.5" fill="none"/>
        <circle cx="160" cy="118" r="36"  stroke="#1565C0" stroke-width="1" fill="none" opacity="0.4"/>
        <!-- Tick marks on outer ring -->
        <line x1="160" y1="6"   x2="160" y2="18"  stroke="#90b4f0" stroke-width="1.5"/>
        <line x1="160" y1="218" x2="160" y2="230" stroke="#90b4f0" stroke-width="1.5"/>
        <line x1="48"  y1="118" x2="60"  y2="118" stroke="#90b4f0" stroke-width="1.5"/>
        <line x1="260" y1="118" x2="272" y2="118" stroke="#90b4f0" stroke-width="1.5"/>
        <!-- Connection lines between nodes (opacity 0.25) -->
        <line x1="160" y1="34"  x2="108" y2="66"  stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="160" y1="34"  x2="212" y2="66"  stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="108" y1="66"  x2="80"  y2="110" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="212" y1="66"  x2="240" y2="110" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="80"  y1="110" x2="90"  y2="158" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="240" y1="110" x2="230" y2="158" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="90"  y1="158" x2="130" y2="192" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="230" y1="158" x2="190" y2="192" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="130" y1="192" x2="190" y2="192" stroke="#1565C0" stroke-width="1" opacity="0.25"/>
        <line x1="108" y1="66"  x2="160" y2="86"  stroke="#1565C0" stroke-width="1" opacity="0.2"/>
        <line x1="212" y1="66"  x2="160" y2="86"  stroke="#1565C0" stroke-width="1" opacity="0.2"/>
        <line x1="80"  y1="110" x2="130" y2="118" stroke="#1565C0" stroke-width="1" opacity="0.2"/>
        <line x1="240" y1="110" x2="190" y2="118" stroke="#1565C0" stroke-width="1" opacity="0.2"/>
        <line x1="160" y1="86"  x2="160" y2="118" stroke="#1565C0" stroke-width="1" opacity="0.3"/>
        <!-- EEG wave line across mid -->
        <path d="M52 148 L74 148 L82 132 L90 164 L98 132 L106 164 L114 140 L122 148 L140 148 L148 138 L156 158 L164 138 L172 158 L180 148 L200 148 L208 132 L216 164 L224 148 L268 148" stroke="#1565C0" stroke-width="1.5" fill="none" opacity="0.5"/>
        <!-- Neural nodes -->
        <circle cx="160" cy="34"  r="5" fill="#1565C0"/>
        <circle cx="108" cy="66"  r="4" fill="#1976D2"/>
        <circle cx="212" cy="66"  r="4" fill="#1976D2"/>
        <circle cx="80"  cy="110" r="4" fill="#1976D2"/>
        <circle cx="240" cy="110" r="4" fill="#1976D2"/>
        <circle cx="160" cy="86"  r="3.5" fill="#42A5F5"/>
        <circle cx="130" cy="118" r="3.5" fill="#42A5F5"/>
        <circle cx="190" cy="118" r="3.5" fill="#42A5F5"/>
        <circle cx="160" cy="118" r="5" fill="#1565C0"/>
        <circle cx="90"  cy="158" r="3.5" fill="#1976D2"/>
        <circle cx="230" cy="158" r="3.5" fill="#1976D2"/>
        <circle cx="130" cy="192" r="4" fill="#1565C0"/>
        <circle cx="190" cy="192" r="4" fill="#1565C0"/>
        <!-- Highlighted active nodes with glow rings -->
        <circle cx="160" cy="34"  r="9" stroke="#1565C0" stroke-width="1.5" fill="none" opacity="0.35"/>
        <circle cx="160" cy="118" r="9" stroke="#1565C0" stroke-width="1.5" fill="none" opacity="0.35"/>
        <circle cx="160" cy="192" r="9" stroke="#1565C0" stroke-width="1.5" fill="none" opacity="0.25"/>
      </svg>
    </div>
  </div>

  <!-- Patient section -->
  <div class="p1-patient">
    <div class="p1-patient-header">
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="19" cy="19" r="19" fill="rgba(255,255,255,0.12)"/>
        <circle cx="19" cy="15" r="6" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" fill="none"/>
        <path d="M7 31 C7 24 12 20 19 20 C26 20 31 24 31 31" stroke="rgba(255,255,255,0.8)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>
      <div>
        <div class="pname">Rakesh Kumar</div>
        <div class="preport">Patient Report</div>
      </div>
    </div>
    <div class="p1-fields">
      <div class="p1-field">
        <div class="p1-field-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="3" width="14" height="13" rx="2" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/><line x1="6" y1="1" x2="6" y2="5" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round"/><line x1="12" y1="1" x2="12" y2="5" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="7" x2="16" y2="7" stroke="rgba(255,255,255,0.4)" stroke-width="1"/></svg>
        </div>
        <div>
          <div class="p1-field-label">Date of Birth</div>
          <div class="p1-field-value">2004-01-26</div>
        </div>
      </div>
      <div class="p1-field">
        <div class="p1-field-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/><line x1="9" y1="5" x2="9" y2="9" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round"/><line x1="9" y1="9" x2="12" y2="12" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" stroke-linecap="round"/></svg>
        </div>
        <div>
          <div class="p1-field-label">Date of Assessment</div>
          <div class="p1-field-value">26/03/2026</div>
        </div>
      </div>
      <div class="p1-field">
        <div class="p1-field-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2 C5.7 2 3 4.7 3 8 C3 12.5 9 16 9 16 C9 16 15 12.5 15 8 C15 4.7 12.3 2 9 2Z" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/><circle cx="9" cy="8" r="2.5" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/></svg>
        </div>
        <div>
          <div class="p1-field-label">Age</div>
          <div class="p1-field-value">22 Years</div>
        </div>
      </div>
      <div class="p1-field">
        <div class="p1-field-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="8" width="14" height="8" rx="2" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/><path d="M6 8 L6 5 C6 3.3 7.3 2 9 2 C10.7 2 12 3.3 12 5 L12 8" stroke="rgba(255,255,255,0.7)" stroke-width="1.3" fill="none"/></svg>
        </div>
        <div>
          <div class="p1-field-label">Profession</div>
          <div class="p1-field-value">BOSS</div>
        </div>
      </div>
    </div>
  </div>

  <div class="p1-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 1 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 2: INTRODUCTION -->
<div class="page p2">
  <div class="pg-header">
    <div class="pg-brand">Neuro<span>Sense</span></div>
    <div class="pg-badge">INTRODUCTION</div>
  </div>
  <div class="pg-body">
    <h2 class="big-heading">INTRODUCTION</h2>
    <div class="accent-bar"></div>
    <p class="body-p">The qEEG report provided by NeuroSense EEG is intended for informational, educational, and wellness purposes only. It is designed to help individuals and neurofeedback professionals better understand brainwave patterns and to support decisions related to neurofeedback training for non-medical cognitive enhancement.</p>
    <p class="body-p">This report is not intended to diagnose, treat, cure, mitigate, or prevent any medical condition, and it should not be used as a substitute for consultation with a licensed healthcare provider.</p>

    <div class="blue-box">
      <h3>Important Disclaimer</h3>
      <p>Users are encouraged to consult with a qualified healthcare provider regarding any medical concerns or before starting any new treatment or therapy. NeuroSense EEG's qEEG analysis application is not a replacement for the individualized care provided by medical professionals.</p>
    </div>

    <h2 class="big-heading" style="font-size:26px;">EEG <span>RECORDING</span></h2>
    <div class="accent-bar"></div>
    <p class="body-p">The 10-20 system is the internationally recognized method used for placing electrodes on the scalp during an EEG recording. It is named for the standardized distances between electrode positions, which are either 10% or 20% of the total front-to-back or right-to-left measurement of the head. This system ensures consistent and reproducible electrode placement.</p>

    <div class="eeg-box">
      <svg class="eeg-svg" viewBox="0 0 700 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        ${[0,16,32,48,64,80,96,112].map((y, i) => `<path d="M0 ${y+10} Q35 ${y+2} 70 ${y+10} Q105 ${y+18} 140 ${y+10} Q175 ${y+2} 210 ${y+10} Q245 ${y+18} 280 ${y+10} Q315 ${y+2} 350 ${y+10} Q385 ${y+18} 420 ${y+10} Q455 ${y+2} 490 ${y+10} Q525 ${y+18} 560 ${y+10} Q595 ${y+2} 630 ${y+10} Q665 ${y+18} 700 ${y+10}" stroke="rgba(21,101,192,${0.2 + i*0.04})" fill="none" stroke-width="1.5"/>`).join('')}
      </svg>
      <div class="eeg-caption">19-electrode EEG Signal &nbsp;|&nbsp; Eyes Closed Condition</div>
    </div>

    <div class="refs">
      <p>1. Arms, M., de Ridder, S., Strehl, U. (2009). Efficacy of neurofeedback treatment in ADHD. Clinical EEG and Neuroscience, 40(3), 180-189.</p>
      <p>2. Micoulaud-Franchi, J.A., Geoffroy, P.A., Fond, G. (2014). EEG neurofeedback treatments in children with ADHD. Frontiers in Human Neuroscience, 8(906).</p>
      <p>3. Gruzelier, John H. (2014). EEG-Neurofeedback for Optimising Performance. Neuroscience & Biobehavioral Reviews, Pergamon.</p>
    </div>
  </div>
  <div class="pg-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 2 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 3: CONGRATULATIONS -->
<div class="page p3">
  <div class="p3-body">
    <div style="text-align:center; font-size:42px; margin-bottom:16px;">&#127881;</div>
    <h1 class="p3-heading">Congratulations On Getting Your<br>Personalized Brain and Mental<br>Well-Being Report</h1>
    <p class="p3-sub">Your journey to optimal brain health begins here</p>

    <div class="p3-cards">
      <div class="p3-card">
        <div class="p3-icon-wrap">&#129504;</div>
        <div class="p3-card-text">
          <h3>Personalized Cognitive Insights</h3>
          <p>Every individual has unique cognitive and emotional patterns. Understanding brainwave activity allows for the creation of personalized self-care routines, relaxation techniques, and mental well-being practices that align with your natural tendencies.</p>
        </div>
      </div>
      <div class="p3-card">
        <div class="p3-icon-wrap">&#9200;</div>
        <div class="p3-card-text">
          <h3>Early Detection & Prevention</h3>
          <p>Recognizing early signs of stress, emotional imbalance, or cognitive exhaustion helps prevent long-term mental health struggles. Timely interventions can build resilience, improve emotional intelligence, and enhance overall quality of life.</p>
        </div>
      </div>
      <div class="p3-card">
        <div class="p3-icon-wrap">&#128200;</div>
        <div class="p3-card-text">
          <h3>Optimize Mental Performance</h3>
          <p>By identifying dominant brainwave patterns — such as theta waves for relaxation or beta waves for high alertness — you can optimize mental clarity, productivity, and emotional balance through targeted neurofeedback training.</p>
        </div>
      </div>
      <div class="p3-card">
        <div class="p3-icon-wrap">&#9878;</div>
        <div class="p3-card-text">
          <h3>Long-Term Brain Health</h3>
          <p>Balanced brain activity is crucial for long-term mental and physical health. Developing stability and adaptability helps individuals navigate personal and professional challenges with confidence and emotional control.</p>
        </div>
      </div>
    </div>
  </div>
  <div class="p3-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 3 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 4: BRAIN MARKERS -->
<div class="page p4">
  <div class="p4-hero">
    <div class="p4-hero-deco">
      <div class="circle"></div>
      <div class="circle sm"></div>
    </div>
    <h1>Your Brain Markers</h1>
    <p>Key cognitive and emotional performance indicators derived from your QEEG brainwave assessment</p>
  </div>

  <div class="p4-grid">
    <div class="p4-card">
      <div class="p4-icon">&#127919;</div>
      <div class="p4-card-title">Focus &amp; Attention</div>
      <div class="p4-card-desc">Your ability to concentrate, stay on task, filter out distractions, and shift focus smoothly when needed. Derived from the Theta:Beta ratio in frontal brain regions (Fz, Cz). A lower ratio indicates stronger, sustained focus capacity.</div>
      <span class="p4-card-tag">FRONTAL THETA:BETA</span>
    </div>
    <div class="p4-card accent-green">
      <div class="p4-icon">&#128161;</div>
      <div class="p4-card-title">Cognition</div>
      <div class="p4-card-desc">How efficiently your brain thinks and works, covering clarity, speed of processing, memory, learning, and problem solving. Linked to alpha peak frequency and overall cortical activation patterns across all 19 channels.</div>
      <span class="p4-card-tag" style="background:#dcfce7;color:#166534;">ALPHA PEAK HZ</span>
    </div>
    <div class="p4-card accent-purple">
      <div class="p4-icon">&#10084;&#65039;</div>
      <div class="p4-card-title">Emotional Regulation</div>
      <div class="p4-card-desc">Your ability to stay emotionally steady, manage triggers and self-soothe. Return to calm after stress. Reflected in frontal alpha asymmetry (F3 vs F4 Alpha balance) — a key marker of emotional resilience and mood stability.</div>
      <span class="p4-card-tag" style="background:#ede9fe;color:#5b21b6;">ALPHA ASYMMETRY</span>
    </div>
    <div class="p4-card accent-orange">
      <div class="p4-icon">&#128267;</div>
      <div class="p4-card-title">Brain Burn Out</div>
      <div class="p4-card-desc">The level of mental depletion in your system, reflecting recovery, resilience, and capacity to keep performing without feeling overwhelmed. Measured through delta wave activity in posterior regions during waking state.</div>
      <span class="p4-card-tag" style="background:#ffedd5;color:#9a3412;">DELTA ACTIVITY</span>
    </div>
    <div class="p4-card full">
      <div class="p4-icon">&#9889;</div>
      <div>
        <div class="p4-card-title" style="margin-bottom:6px;">Stress &amp; Mental Overload</div>
        <div class="p4-card-desc">The overall stress your mind and body are experiencing, reflecting whether pressure is building up or being handled comfortably. Elevated HiBeta activity (30Hz+) in frontal-central regions (Fz, Cz, F3, F4) is a reliable biomarker for heightened cognitive stress. Regular monitoring can help prevent burnout before it becomes chronic.</div>
        <span class="p4-card-tag" style="margin-top:8px;">HI-BETA FRONTAL</span>
      </div>
    </div>
  </div>

  <div class="pg-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 4 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 5: YOUR NUMBERS -->
<div class="page p5">
  <div class="pg-header">
    <div class="pg-brand">Neuro<span>Sense</span></div>
    <div class="pg-badge">YOUR NUMBERS</div>
  </div>

  <div class="p5-score-banner">
    <div class="p5-overall">
      <div class="num">14</div>
      <div class="lbl">Overall Score</div>
      <div class="out-of">/ 21 max</div>
    </div>
    <div class="divider-v"></div>
    <div class="p5-note">
      <strong>Understanding Your Scores</strong><br>
      Each of the 7 parameters is scored 0–3 based on your EEG data. For Focus, Cognition, Emotional Regulation, Learning and Creativity — <strong>higher is better</strong>. For Stress and Burnout — <strong>lower is better</strong>. Your overall score of 14/21 places you in the <strong>Good</strong> performance range.
    </div>
  </div>

  <div class="p5-list">
    <div class="p5-row">
      <div class="p5-emoji">&#127919;</div>
      <div class="p5-meta"><div class="name">Focus &amp; Attention</div><div class="sub">Theta:Beta ratio — frontal</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-blue" style="width:75%"></div></div><div class="p5-bar-label">Score: 2 / 3 &nbsp;&nbsp; Percentile: 75th</div></div>
      <div class="p5-badge b-good">Good</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#128161;</div>
      <div class="p5-meta"><div class="name">Cognition</div><div class="sub">Alpha peak frequency</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-amber" style="width:50%"></div></div><div class="p5-bar-label">Score: 1.5 / 3 &nbsp;&nbsp; Percentile: 50th</div></div>
      <div class="p5-badge b-avg">Average</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#10084;&#65039;</div>
      <div class="p5-meta"><div class="name">Emotional Regulation</div><div class="sub">Frontal alpha asymmetry</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-blue" style="width:85%"></div></div><div class="p5-bar-label">Score: 2.5 / 3 &nbsp;&nbsp; Percentile: 82nd</div></div>
      <div class="p5-badge b-good">Excellent</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#9889;</div>
      <div class="p5-meta"><div class="name">Stress &amp; Mental Overload</div><div class="sub">HiBeta/Alpha — lower better</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-amber" style="width:60%"></div></div><div class="p5-bar-label">Score: 2 / 3 &nbsp;&nbsp; Moderate stress level</div></div>
      <div class="p5-badge b-avg">Moderate</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#128267;</div>
      <div class="p5-meta"><div class="name">Burnout &amp; Fatigue</div><div class="sub">Delta activity — lower better</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-blue" style="width:35%"></div></div><div class="p5-bar-label">Score: 1 / 3 &nbsp;&nbsp; Low burnout detected</div></div>
      <div class="p5-badge b-good">Good</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#128218;</div>
      <div class="p5-meta"><div class="name">Learning</div><div class="sub">Theta coherence — memory</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-blue" style="width:70%"></div></div><div class="p5-bar-label">Score: 2 / 3 &nbsp;&nbsp; Percentile: 68th</div></div>
      <div class="p5-badge b-good">Good</div>
    </div>
    <div class="p5-row">
      <div class="p5-emoji">&#127912;</div>
      <div class="p5-meta"><div class="name">Creativity</div><div class="sub">Alpha/Theta balance</div></div>
      <div class="p5-bar-area"><div class="p5-bar-bg"><div class="p5-bar-fg bar-amber" style="width:55%"></div></div><div class="p5-bar-label">Score: 1.5 / 3 &nbsp;&nbsp; Percentile: 52nd</div></div>
      <div class="p5-badge b-avg">Average</div>
    </div>
  </div>
  <div style="height:14px;"></div>
  <div class="pg-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 5 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 6: BRAINWAVE PROFILES -->
<div class="page p6">
  <div class="pg-header">
    <div class="pg-brand">Neuro<span>Sense</span></div>
    <div class="pg-badge">BRAINWAVE PROFILES</div>
  </div>
  <div class="p6-intro">
    <h2 class="big-heading" style="font-size:26px;">Brainwave <span>Profiles</span></h2>
    <div class="accent-bar"></div>
    <p class="p6-desc">Brainwaves are the electrical impulses generated by the brain, reflecting its activity and various mental and emotional states. Each frequency band plays a distinct role in your cognitive and emotional well-being. Understanding your dominant brainwave patterns is the foundation of personalised neurofeedback training.</p>
  </div>
  <div class="p6-grid">
    <div class="p6-card">
      <div class="p6-wave-header">
        <div class="p6-wave-badge wb-beta">Beta Waves</div>
        <div class="p6-freq">13–30 <span>Hz</span></div>
      </div>
      <div class="p6-role-label">Active Thinking &amp; Alertness</div>
      <ul class="p6-items">
        <li>Support logical thinking and decision-making</li>
        <li>Task-oriented focus and sustained alertness</li>
        <li>Managing daily responsibilities and problem-solving</li>
        <li>When Balanced: Enhanced focus, clear mental performance</li>
      </ul>
      <div class="p6-excess"><strong>When Excessive:</strong> Stress, anxiety symptoms, cognitive exhaustion, difficulty relaxing</div>
    </div>
    <div class="p6-card">
      <div class="p6-wave-header">
        <div class="p6-wave-badge wb-alpha">Alpha Waves</div>
        <div class="p6-freq">8–12 <span>Hz</span></div>
      </div>
      <div class="p6-role-label">Calm Focus &amp; Relaxation</div>
      <ul class="p6-items">
        <li>Facilitate relaxation and present-moment awareness</li>
        <li>Emotional stability, clarity, and resilience</li>
        <li>Bridge between active thinking and deep rest states</li>
        <li>When Balanced: Stress recovery, mindfulness, creativity</li>
      </ul>
      <div class="p6-excess"><strong>When Excessive:</strong> Restlessness, agitation, difficulty unwinding properly</div>
    </div>
    <div class="p6-card">
      <div class="p6-wave-header">
        <div class="p6-wave-badge wb-theta">Theta Waves</div>
        <div class="p6-freq">4–7 <span>Hz</span></div>
      </div>
      <div class="p6-role-label">Creativity &amp; Deep Processing</div>
      <ul class="p6-items">
        <li>Drive creativity, imagination, and intuitive thinking</li>
        <li>Associated with deep relaxation and meditation states</li>
        <li>Memory consolidation and subconscious processing</li>
        <li>When Balanced: Enhanced creativity, emotional processing</li>
      </ul>
      <div class="p6-excess"><strong>When Excessive:</strong> Mental fog, excessive daydreaming, difficulty focusing</div>
    </div>
    <div class="p6-card">
      <div class="p6-wave-header">
        <div class="p6-wave-badge wb-delta">Delta Waves</div>
        <div class="p6-freq">0.5–4 <span>Hz</span></div>
      </div>
      <div class="p6-role-label">Deep Sleep &amp; Recovery</div>
      <ul class="p6-items">
        <li>Dominant during deep, restorative slow-wave sleep</li>
        <li>Physical regeneration and immune system restoration</li>
        <li>Hormonal regulation and cellular repair processes</li>
        <li>When Balanced: Deep recovery, physical restoration</li>
      </ul>
      <div class="p6-excess"><strong>When Excessive (awake):</strong> Brain fog, heavy fatigue, cognitive slowing</div>
    </div>
  </div>
  <div style="height:14px;"></div>
  <div class="pg-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pgnum">Page 6 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- PAGE 7: RECOMMENDATIONS -->
<div class="page p7">
  <div class="p7-top">
    <div style="font-size:32px; margin-bottom:12px;">&#127775;</div>
    <h1>Personalized Recommendations</h1>
    <p>Based on your QEEG brainwave results — tailored specifically for your brain performance profile</p>
  </div>
  <div class="p7-cards">
    <div class="p7-card">
      <div class="p7-num">1</div>
      <div class="p7-text">
        <h3>Mindfulness Meditation — 15 mins daily</h3>
        <p>Focused breathing and mindfulness meditation increases alpha wave production, directly improving your emotional regulation score. Start with guided morning sessions. Headspace or Calm app are recommended starting points for building a consistent practice.</p>
      </div>
    </div>
    <div class="p7-card">
      <div class="p7-num">2</div>
      <div class="p7-text">
        <h3>Consistent Sleep Schedule — 7 to 8 hours</h3>
        <p>Your delta wave activity indicates a need for deeper, more restorative sleep cycles. Maintain a fixed sleep and wake time to regulate your circadian rhythm. Avoid screens 60 minutes before bed to improve deep sleep architecture and overnight brain restoration.</p>
      </div>
    </div>
    <div class="p7-card">
      <div class="p7-num">3</div>
      <div class="p7-text">
        <h3>Neurofeedback Training — 2 sessions per week</h3>
        <p>Targeted neurofeedback focusing on theta-beta ratio training will directly improve your Focus and Attention scores. Recommend 20 to 30 sessions for measurable, lasting performance improvements. Each session trains your brain to self-regulate more efficiently.</p>
      </div>
    </div>
    <div class="p7-card">
      <div class="p7-num">4</div>
      <div class="p7-text">
        <h3>Aerobic Exercise — 30 mins, 4 times per week</h3>
        <p>Regular aerobic exercise significantly boosts BDNF (Brain-Derived Neurotrophic Factor), enhancing neuroplasticity, improving cognitive processing speed, and reducing cortisol-related stress markers visible in your EEG frontal regions.</p>
      </div>
    </div>
    <div class="p7-card">
      <div class="p7-num">5</div>
      <div class="p7-text">
        <h3>Omega-3 and Magnesium Supplementation</h3>
        <p>Evidence-based supplementation to support brain membrane integrity, healthy neurotransmitter function, and stress regulation. Omega-3 (DHA/EPA) supports cognitive performance. Magnesium glycinate supports sleep quality and stress resilience. Consult your physician before starting.</p>
      </div>
    </div>
  </div>
  <div class="p7-footer">
    <p>Report generated on: 26/03/2026 &nbsp;|&nbsp; This AI generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.</p>
    <p class="pgnum">Page 7 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

</body>
</html>`;

async function generate() {
  console.log('Generating NeuroSense Brain Report V2...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });
  await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
  const filepath = path.join(downloadsPath, 'NeuroSense_Brain_Report_V2.pdf');
  await page.pdf({
    path: filepath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  console.log('Saved: ' + filepath);
}

generate().catch(console.error);
