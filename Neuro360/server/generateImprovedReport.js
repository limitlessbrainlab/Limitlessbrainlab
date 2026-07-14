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
  body { font-family: 'Segoe UI', Arial, sans-serif; background: white; }

  /* PAGE BREAKS */
  .page { width: 794px; min-height: 1123px; position: relative; overflow: hidden; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }

  /* ========== PAGE 1: COVER ========== */
  .cover { background: linear-gradient(160deg, #001863 0%, #0031C9 50%, #1565C0 100%); }
  .cover-top { display: flex; align-items: center; padding: 28px 36px; }
  .cover-logo-box { background: white; border-radius: 12px; padding: 10px 18px; margin-right: 20px; }
  .cover-logo-box img { height: 50px; }
  .cover-logo-text { color: white; }
  .cover-logo-text h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
  .cover-logo-text p { font-size: 14px; font-weight: 400; opacity: 0.85; margin-top: 2px; }

  .cover-hero { position: relative; margin: 0 36px; border-radius: 20px; overflow: hidden; height: 340px; background: linear-gradient(135deg, #0d47a1 0%, #1976d2 100%); display: flex; align-items: flex-end; justify-content: center; }
  .cover-cross { position: absolute; opacity: 0.18; }
  .cover-cross.c1 { top: -30px; left: -30px; width: 180px; height: 180px; background: white; clip-path: polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%); }
  .cover-cross.c2 { top: -20px; right: 80px; width: 140px; height: 140px; background: white; clip-path: polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%); }
  .cover-cross.c3 { bottom: 60px; right: -20px; width: 160px; height: 160px; background: white; clip-path: polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%); }
  .cover-report-label { position: absolute; bottom: 20px; color: white; font-size: 22px; letter-spacing: 6px; font-weight: 300; }

  .cover-info-card { margin: 24px 36px 0; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); border-radius: 20px; padding: 28px 32px; backdrop-filter: blur(10px); }
  .cover-info-name { color: white; font-size: 28px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
  .cover-info-name span.icon { background: rgba(255,255,255,0.15); border-radius: 50%; width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; }
  .cover-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .cover-info-item { background: rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 16px; }
  .cover-info-label { color: rgba(255,255,255,0.6); font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; }
  .cover-info-value { color: white; font-size: 15px; font-weight: 600; }

  .cover-footer { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.25); padding: 12px 36px; display: flex; justify-content: space-between; align-items: center; }
  .cover-footer p { color: rgba(255,255,255,0.6); font-size: 10px; }

  /* ========== PAGE 2: INTRODUCTION ========== */
  .intro { background: #f8faff; }
  .page-header { background: white; padding: 22px 40px; border-bottom: 3px solid #0031C9; display: flex; justify-content: space-between; align-items: center; }
  .page-header-logo { font-size: 16px; font-weight: 700; color: #001863; letter-spacing: -0.3px; }
  .page-header-logo span { color: #0031C9; }
  .page-tag { background: #0031C9; color: white; font-size: 10px; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; }

  .page-content { padding: 36px 40px; }
  .section-heading { font-size: 30px; font-weight: 800; color: #001863; margin-bottom: 14px; line-height: 1.1; }
  .section-heading span { color: #0031C9; }
  .divider-line { width: 60px; height: 4px; background: linear-gradient(to right, #0031C9, #42A5F5); border-radius: 2px; margin-bottom: 20px; }
  .body-text { font-size: 12px; line-height: 1.8; color: #444; margin-bottom: 14px; }

  .info-box { background: white; border-left: 4px solid #0031C9; border-radius: 0 12px 12px 0; padding: 16px 20px; margin: 20px 0; box-shadow: 0 2px 12px rgba(0,49,201,0.08); }
  .info-box h3 { font-size: 14px; color: #001863; font-weight: 700; margin-bottom: 6px; }
  .info-box p { font-size: 11px; color: #555; line-height: 1.7; }

  .eeg-image-placeholder { background: linear-gradient(135deg, #e8f0fe, #c5d8f7); border-radius: 12px; height: 160px; display: flex; align-items: center; justify-content: center; margin: 20px 0; position: relative; overflow: hidden; }
  .eeg-wave { position: absolute; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 20px; }
  .wave-line { height: 2px; background: rgba(0,49,201,0.3); border-radius: 1px; position: relative; }
  .wave-line::after { content: ''; position: absolute; top: -6px; left: 0; right: 0; height: 14px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 14'%3E%3Cpath d='M0 7 Q20 0 40 7 Q60 14 80 7 Q100 0 120 7 Q140 14 160 7 Q180 0 200 7 Q220 14 240 7 Q260 0 280 7 Q300 14 320 7 Q340 0 360 7 Q380 14 400 7' stroke='%230031C9' fill='none' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat center / cover; opacity: 0.5; }
  .eeg-label { position: absolute; right: 20px; bottom: 15px; font-size: 11px; color: #0031C9; font-weight: 600; }

  /* ========== PAGE 3: BRAIN MARKERS ========== */
  .markers { background: #f8faff; }
  .markers-hero { background: linear-gradient(135deg, #001863 0%, #1565C0 100%); padding: 36px 40px; position: relative; overflow: hidden; }
  .markers-hero h1 { color: white; font-size: 36px; font-weight: 800; position: relative; z-index: 1; }
  .markers-hero p { color: rgba(255,255,255,0.75); font-size: 13px; margin-top: 8px; position: relative; z-index: 1; }
  .hero-circle { position: absolute; border-radius: 50%; border: 2px solid rgba(255,255,255,0.1); }
  .hero-circle.h1 { width: 200px; height: 200px; top: -80px; right: 40px; }
  .hero-circle.h2 { width: 140px; height: 140px; top: -20px; right: 160px; }

  .markers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 28px 40px; }
  .marker-card { background: white; border-radius: 16px; padding: 22px; box-shadow: 0 4px 20px rgba(0,49,201,0.08); border: 1px solid #e8eeff; position: relative; overflow: hidden; }
  .marker-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(to right, #0031C9, #42A5F5); }
  .marker-icon { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #e8f0fe, #c5d8f7); display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 12px; }
  .marker-title { font-size: 15px; font-weight: 700; color: #001863; margin-bottom: 8px; }
  .marker-desc { font-size: 11px; color: #666; line-height: 1.7; }

  .marker-card.full { grid-column: 1 / -1; }
  .marker-card.full .marker-content { display: flex; align-items: flex-start; gap: 16px; }

  /* ========== PAGE 4: PERFORMANCE SCORES ========== */
  .scores { background: #f8faff; }
  .scores-intro { background: white; margin: 28px 40px 0; border-radius: 16px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .overall-score { text-align: center; }
  .overall-score .number { font-size: 52px; font-weight: 800; color: #0031C9; line-height: 1; }
  .overall-score .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  .scores-note { font-size: 12px; color: #555; max-width: 420px; line-height: 1.7; }
  .scores-note strong { color: #001863; }

  .scores-list { padding: 20px 40px; display: flex; flex-direction: column; gap: 14px; }
  .score-row { background: white; border-radius: 14px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
  .score-emoji { font-size: 26px; width: 44px; text-align: center; }
  .score-info { flex: 1; }
  .score-name { font-size: 14px; font-weight: 700; color: #001863; }
  .score-sub { font-size: 11px; color: #888; margin-top: 2px; }
  .score-bar-wrap { flex: 2; }
  .score-bar-track { background: #f0f4ff; border-radius: 8px; height: 10px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 8px; }
  .score-bar-fill.high { background: linear-gradient(to right, #0031C9, #42A5F5); }
  .score-bar-fill.medium { background: linear-gradient(to right, #F59E0B, #FBBF24); }
  .score-bar-fill.low { background: linear-gradient(to right, #EF4444, #F87171); }
  .score-badge { min-width: 80px; text-align: center; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; }
  .badge-high { background: #e0f2fe; color: #0369a1; }
  .badge-medium { background: #fef3c7; color: #92400e; }
  .badge-low { background: #fee2e2; color: #991b1b; }

  /* ========== PAGE 5: BRAINWAVE PROFILES ========== */
  .brainwaves { background: #f8faff; }
  .brainwave-intro { padding: 28px 40px 0; }
  .brainwave-intro p { font-size: 12px; color: #555; line-height: 1.8; }
  .wave-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 20px 40px; }
  .wave-card { background: white; border-radius: 16px; padding: 22px; box-shadow: 0 4px 16px rgba(0,49,201,0.07); }
  .wave-card-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
  .wave-badge { padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .beta-badge { background: #dbeafe; color: #1e40af; }
  .alpha-badge { background: #d1fae5; color: #065f46; }
  .theta-badge { background: #ede9fe; color: #5b21b6; }
  .delta-badge { background: #fce7f3; color: #9d174d; }
  .wave-freq { font-size: 20px; font-weight: 800; color: #001863; }
  .wave-freq span { font-size: 12px; font-weight: 400; color: #888; }
  .wave-role { font-size: 11px; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .wave-items { list-style: none; }
  .wave-items li { font-size: 11px; color: #666; padding: 4px 0; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 6px; }
  .wave-items li::before { content: '→'; color: #0031C9; font-weight: bold; }
  .wave-items li:last-child { border-bottom: none; }

  /* ========== PAGE 6: RECOMMENDATIONS ========== */
  .reco { background: linear-gradient(160deg, #001863 0%, #0a3a8f 40%, #f8faff 40%); }
  .reco-top { padding: 36px 40px; }
  .reco-top h1 { color: white; font-size: 32px; font-weight: 800; }
  .reco-top p { color: rgba(255,255,255,0.75); font-size: 13px; margin-top: 8px; }
  .reco-cards { padding: 20px 40px; display: flex; flex-direction: column; gap: 14px; }
  .reco-card { background: white; border-radius: 14px; padding: 18px 22px; display: flex; align-items: flex-start; gap: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
  .reco-num { background: linear-gradient(135deg, #0031C9, #42A5F5); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .reco-text h3 { font-size: 14px; font-weight: 700; color: #001863; margin-bottom: 4px; }
  .reco-text p { font-size: 11px; color: #666; line-height: 1.7; }

  /* SHARED FOOTER */
  .page-footer { position: absolute; bottom: 0; left: 0; right: 0; background: #26A69A; padding: 10px 40px; display: flex; justify-content: space-between; align-items: center; }
  .page-footer p { color: rgba(255,255,255,0.8); font-size: 9px; }
  .page-footer .pnum { color: white; font-weight: 700; font-size: 11px; }
</style>
</head>
<body>

<!-- ========== PAGE 1: COVER ========== -->
<div class="page cover">
  <div class="cover-top">
    <div class="cover-logo-box">
      <div style="font-size:20px; font-weight:900; color:#001863; letter-spacing:-0.5px;">Neuro<span style="color:#0031C9;">Sense</span></div>
      <div style="font-size:9px; color:#666; margin-top:2px;">Smart EEG Intelligence</div>
    </div>
    <div class="cover-logo-text">
      <h1>Neurosense Brain Health<br>Optimization Report</h1>
      <p>Powered by Smart EEG Intelligence</p>
    </div>
  </div>

  <div class="cover-hero">
    <div class="cover-cross c1"></div>
    <div class="cover-cross c2"></div>
    <div class="cover-cross c3"></div>
    <div style="position:absolute; inset:0; background:linear-gradient(to bottom, transparent 50%, rgba(0,24,99,0.6) 100%);"></div>
    <div style="text-align:center; padding-bottom:30px; position:relative; z-index:1;">
      <div style="font-size:60px; margin-bottom:6px;">🧠</div>
      <div style="color:rgba(255,255,255,0.7); font-size:13px; letter-spacing:2px;">PERSONALIZED BRAIN ASSESSMENT</div>
    </div>
    <div class="cover-report-label">REPORT</div>
  </div>

  <div class="cover-info-card">
    <div class="cover-info-name">
      <span class="icon">👤</span>
      Rakesh Kumar
    </div>
    <div class="cover-info-grid">
      <div class="cover-info-item">
        <div class="cover-info-label">Date of Birth</div>
        <div class="cover-info-value">2004-01-26</div>
      </div>
      <div class="cover-info-item">
        <div class="cover-info-label">Date of Assessment</div>
        <div class="cover-info-value">26/03/2026</div>
      </div>
      <div class="cover-info-item">
        <div class="cover-info-label">Age</div>
        <div class="cover-info-value">22 Years</div>
      </div>
      <div class="cover-info-item">
        <div class="cover-info-label">Profession</div>
        <div class="cover-info-value">BOSS</div>
      </div>
    </div>
  </div>

  <div class="cover-footer">
    <p>Report generated by NeuroSense AI | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 1 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- ========== PAGE 2: INTRODUCTION ========== -->
<div class="page intro">
  <div class="page-header">
    <div class="page-header-logo">Neuro<span>Sense</span></div>
    <div class="page-tag">INTRODUCTION</div>
  </div>
  <div class="page-content">
    <h2 class="section-heading">INTRODUCTION</h2>
    <div class="divider-line"></div>
    <p class="body-text">The qEEG report provided by NeuroSense EEG is intended for informational, educational, and wellness purposes only. It is designed to help individuals and neurofeedback professionals better understand brainwave patterns and to support decisions related to neurofeedback training for non-medical cognitive enhancement.</p>
    <p class="body-text">This report is not intended to diagnose, treat, cure, mitigate, or prevent any medical condition, and it should not be used as a substitute for consultation with a licensed healthcare provider.</p>

    <div class="info-box">
      <h3>Important Disclaimer</h3>
      <p>Users are encouraged to consult with a qualified healthcare provider regarding any medical concerns or before starting any new treatment or therapy. NeuroSense EEG's qEEG analysis application is not a replacement for the individualized care provided by medical professionals.</p>
    </div>

    <h2 class="section-heading" style="margin-top:24px; font-size:26px;">EEG <span>RECORDING</span></h2>
    <div class="divider-line"></div>
    <p class="body-text">The 10-20 system is the internationally recognized method used for placing electrodes on the scalp during an EEG recording. It is named for the standardized distances between electrode positions, which are either 10% or 20% of the total front-to-back or right-to-left measurement of the head.</p>

    <div class="eeg-image-placeholder">
      <div class="eeg-wave">
        ${Array(8).fill('').map((_, i) => `<div class="wave-line" style="opacity:${0.3 + i*0.08}"></div>`).join('')}
      </div>
      <div class="eeg-label">19-electrode EEG Signal (Eyes Closed)</div>
    </div>

    <p class="body-text" style="font-size:10px; color:#888; margin-top:8px;">A segment of raw EEG signal from the 19 electrode locations in the Eyes Closed condition showing typical brainwave activity patterns.</p>
  </div>

  <div class="page-footer">
    <p>Report generated on: 26/03/2026 | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 2 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- ========== PAGE 3: BRAIN MARKERS ========== -->
<div class="page markers">
  <div class="markers-hero">
    <div class="hero-circle h1"></div>
    <div class="hero-circle h2"></div>
    <h1>Your Brain Markers</h1>
    <p>Key cognitive and emotional performance indicators from your QEEG assessment</p>
  </div>

  <div class="markers-grid">
    <div class="marker-card">
      <div class="marker-icon">🎯</div>
      <div class="marker-title">Focus &amp; Attention</div>
      <div class="marker-desc">Your ability to concentrate, stay on task, filter out distractions, and shift focus smoothly when needed. Reflects theta-beta balance in frontal regions.</div>
    </div>
    <div class="marker-card">
      <div class="marker-icon">💡</div>
      <div class="marker-title">Cognition</div>
      <div class="marker-desc">How efficiently your brain thinks and works, covering clarity, speed of processing, memory, learning, and problem solving ability.</div>
    </div>
    <div class="marker-card">
      <div class="marker-icon">❤️</div>
      <div class="marker-title">Emotional Regulation</div>
      <div class="marker-desc">Your ability to stay emotionally steady, manage triggers and self soothe. Return to calm after stress through alpha wave modulation.</div>
    </div>
    <div class="marker-card">
      <div class="marker-icon">🔋</div>
      <div class="marker-title">Brain Burn Out</div>
      <div class="marker-desc">The level of mental depletion in your system, reflecting recovery, resilience, and capacity to keep performing without feeling overwhelmed.</div>
    </div>
    <div class="marker-card full">
      <div class="marker-content">
        <div class="marker-icon" style="flex-shrink:0;">⚡</div>
        <div>
          <div class="marker-title">Stress &amp; Mental Overload</div>
          <div class="marker-desc">The overall stress your mind and body are experiencing, reflecting whether pressure is building up or being handled comfortably. High beta activity in frontal-central regions indicates elevated stress response. Monitoring this marker helps identify early warning signs of burnout.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <p>Report generated on: 26/03/2026 | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 3 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- ========== PAGE 4: PERFORMANCE SCORES ========== -->
<div class="page scores">
  <div class="page-header">
    <div class="page-header-logo">Neuro<span>Sense</span></div>
    <div class="page-tag">YOUR NUMBERS</div>
  </div>

  <div class="scores-intro">
    <div class="overall-score">
      <div class="number">14</div>
      <div class="label">Overall Score</div>
      <div style="font-size:10px; color:#0031C9; margin-top:4px;">/21 Maximum</div>
    </div>
    <div class="scores-note">
      <strong>Understanding Your Brain Performance Scores</strong><br>
      Each parameter is scored on a scale of 0–3 based on your EEG brainwave data. <strong>Higher scores</strong> indicate stronger performance in Focus, Cognition, Emotional Regulation, Learning and Creativity. <strong>Lower scores</strong> are better for Stress and Burnout.
    </div>
  </div>

  <div class="scores-list">
    <div class="score-row">
      <div class="score-emoji">🎯</div>
      <div class="score-info">
        <div class="score-name">Focus &amp; Attention</div>
        <div class="score-sub">Theta:Beta ratio, frontal activation</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill high" style="width:75%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 2/3</div>
      </div>
      <div class="score-badge badge-high">Good</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">💡</div>
      <div class="score-info">
        <div class="score-name">Cognition</div>
        <div class="score-sub">Alpha peak, processing speed</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill medium" style="width:50%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 1.5/3</div>
      </div>
      <div class="score-badge badge-medium">Average</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">❤️</div>
      <div class="score-info">
        <div class="score-name">Emotional Regulation</div>
        <div class="score-sub">Alpha asymmetry, frontal balance</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill high" style="width:85%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 2.5/3</div>
      </div>
      <div class="score-badge badge-high">Excellent</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">⚡</div>
      <div class="score-info">
        <div class="score-name">Stress &amp; Mental Overload</div>
        <div class="score-sub">HiBeta/Alpha ratio — lower is better</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill low" style="width:60%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 2/3 (lower = better)</div>
      </div>
      <div class="score-badge badge-medium">Moderate</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">🔋</div>
      <div class="score-info">
        <div class="score-name">Burnout &amp; Fatigue</div>
        <div class="score-sub">Delta activity, fatigue markers</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill high" style="width:65%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 1/3 (lower = better)</div>
      </div>
      <div class="score-badge badge-high">Good</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">📚</div>
      <div class="score-info">
        <div class="score-name">Learning</div>
        <div class="score-sub">Theta coherence, memory encoding</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill high" style="width:70%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 2/3</div>
      </div>
      <div class="score-badge badge-high">Good</div>
    </div>

    <div class="score-row">
      <div class="score-emoji">🎨</div>
      <div class="score-info">
        <div class="score-name">Creativity</div>
        <div class="score-sub">Alpha/Theta balance, right hemisphere</div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track"><div class="score-bar-fill medium" style="width:55%"></div></div>
        <div style="font-size:9px; color:#888; margin-top:3px;">Score: 1.5/3</div>
      </div>
      <div class="score-badge badge-medium">Average</div>
    </div>
  </div>

  <div class="page-footer">
    <p>Report generated on: 26/03/2026 | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 4 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- ========== PAGE 5: BRAINWAVE PROFILES ========== -->
<div class="page brainwaves">
  <div class="page-header">
    <div class="page-header-logo">Neuro<span>Sense</span></div>
    <div class="page-tag">BRAINWAVE PROFILES</div>
  </div>

  <div class="brainwave-intro">
    <h2 class="section-heading" style="font-size:26px; margin-bottom:8px;">Brainwave <span>Profiles</span></h2>
    <div class="divider-line"></div>
    <p>Brainwaves are the electrical impulses generated by the brain, reflecting its activity and various mental and emotional states. Each frequency band plays a unique role in your cognitive and emotional functioning.</p>
  </div>

  <div class="wave-grid">
    <div class="wave-card">
      <div class="wave-card-header">
        <div class="wave-badge beta-badge">Beta Waves</div>
        <div class="wave-freq">13–30 <span>Hz</span></div>
      </div>
      <div class="wave-role">Active Thinking &amp; Focus</div>
      <ul class="wave-items">
        <li>Support logical thinking and decision-making</li>
        <li>Task-oriented focus and alertness</li>
        <li>Managing daily responsibilities</li>
        <li><strong>Excessive:</strong> Stress and anxiety symptoms</li>
      </ul>
    </div>

    <div class="wave-card">
      <div class="wave-card-header">
        <div class="wave-badge alpha-badge">Alpha Waves</div>
        <div class="wave-freq">8–12 <span>Hz</span></div>
      </div>
      <div class="wave-role">Relaxation &amp; Calm Focus</div>
      <ul class="wave-items">
        <li>Facilitate relaxation and calm</li>
        <li>Emotional stability and clarity</li>
        <li>Bridge between focus and rest</li>
        <li><strong>Excessive:</strong> Restlessness and agitation</li>
      </ul>
    </div>

    <div class="wave-card">
      <div class="wave-card-header">
        <div class="wave-badge theta-badge">Theta Waves</div>
        <div class="wave-freq">4–7 <span>Hz</span></div>
      </div>
      <div class="wave-role">Creativity &amp; Deep Processing</div>
      <ul class="wave-items">
        <li>Drive creativity and intuition</li>
        <li>Deep relaxation states</li>
        <li>Subconscious processing</li>
        <li><strong>Excessive:</strong> Difficulty maintaining focus</li>
      </ul>
    </div>

    <div class="wave-card">
      <div class="wave-card-header">
        <div class="wave-badge delta-badge">Delta Waves</div>
        <div class="wave-freq">0.5–4 <span>Hz</span></div>
      </div>
      <div class="wave-role">Deep Sleep &amp; Recovery</div>
      <ul class="wave-items">
        <li>Deep restorative sleep</li>
        <li>Physical and mental recovery</li>
        <li>Immune system restoration</li>
        <li><strong>Excessive (awake):</strong> Brain fog and fatigue</li>
      </ul>
    </div>
  </div>

  <div class="page-footer">
    <p>Report generated on: 26/03/2026 | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 5 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

<!-- ========== PAGE 6: RECOMMENDATIONS ========== -->
<div class="page reco">
  <div class="reco-top">
    <h1>Personalized Recommendations</h1>
    <p>Based on your QEEG results — tailored to improve your brain performance</p>
  </div>

  <div class="reco-cards">
    <div class="reco-card">
      <div class="reco-num">1</div>
      <div class="reco-text">
        <h3>Mindfulness Meditation — 15 mins daily</h3>
        <p>Focused breathing and mindfulness meditation helps increase alpha wave production, improving emotional regulation and reducing the stress response. Start with guided sessions in the morning before work.</p>
      </div>
    </div>
    <div class="reco-card">
      <div class="reco-num">2</div>
      <div class="reco-text">
        <h3>Consistent Sleep Schedule (7–8 hours)</h3>
        <p>Your delta wave activity suggests the need for deeper sleep cycles. Maintain a consistent sleep/wake time to regulate your circadian rhythm and improve overnight brain restoration and memory consolidation.</p>
      </div>
    </div>
    <div class="reco-card">
      <div class="reco-num">3</div>
      <div class="reco-text">
        <h3>Neurofeedback Training — 2x per week</h3>
        <p>Targeted neurofeedback sessions focusing on theta-beta ratio training will directly improve your Focus and Attention scores. Recommend 20–30 sessions for measurable performance changes.</p>
      </div>
    </div>
    <div class="reco-card">
      <div class="reco-num">4</div>
      <div class="reco-text">
        <h3>Physical Exercise — 30 mins, 4x per week</h3>
        <p>Aerobic exercise significantly boosts BDNF (Brain-Derived Neurotrophic Factor), enhancing neuroplasticity, improving cognitive processing speed, and reducing cortisol-related stress markers in the EEG.</p>
      </div>
    </div>
    <div class="reco-card">
      <div class="reco-num">5</div>
      <div class="reco-text">
        <h3>Omega-3 &amp; Magnesium Supplementation</h3>
        <p>Evidence-based supplementation to support brain membrane integrity and healthy neurotransmitter function. Consult your physician before starting any supplementation protocol.</p>
      </div>
    </div>
  </div>

  <div class="page-footer">
    <p>Report generated on: 26/03/2026 | This AI generated report is not diagnostic. Please consult your doctor.</p>
    <p class="pnum">Page 6 &nbsp;|&nbsp; limitlessbrainlab-eight.vercel.app</p>
  </div>
</div>

</body>
</html>`;

async function generate() {
  console.log('🚀 Generating improved NeuroSense Brain Report...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

  const filepath = path.join(downloadsPath, 'NeuroSense_Brain_Report_Improved.pdf');
  await page.pdf({
    path: filepath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await browser.close();
  console.log(`\n✅ Report saved: ${filepath}`);
}

generate().catch(console.error);
