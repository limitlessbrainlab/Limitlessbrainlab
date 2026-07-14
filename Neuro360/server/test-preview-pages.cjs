const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Import NEW introduction page (no image fetching)
const { generateIntroductionPage } = require('./services/pdf/introductionPage');
const { generateCongratulationsPage } = require('./services/pdf/congratulationsPage');
const { generateBrainwaveProfilesPage } = require('./services/pdf/brainwaveProfilesPage');
const { generateYourNumbersPage } = require('./services/pdf/yourNumbersPage');
const { generateCognitionPage, generateCognitionPage2 } = require('./services/pdf/cognitionPage');
const { generateCoverPage } = require('./services/pdf/coverPage');

const PAGE5_IMG = path.join(__dirname, '../public/assets/Page5.png');
const LOGO_PATH = path.join(__dirname, '../public/assets/Layer_1.png');
const outPath = path.join(__dirname, 'preview-pages-v363.pdf');

// ===== Score-based description lookup (mirrors geminiPdfGenerator.getDetailedParameterDescription) =====
function getScoreDescription(paramName, score) {
  const name = paramName.toLowerCase();
  const isStressBurnout = name.includes('stress') || name.includes('burnout') || name.includes('fatigue');
  let scoreLevel;
  if (isStressBurnout) {
    // score = RED count: 0=Low(best), 1=Mild, 2=Moderate, 3=Severe(worst)
    scoreLevel = score === 0 ? 'low' : (score === 1 ? 'mild' : (score === 2 ? 'moderate' : 'severe'));
  } else {
    scoreLevel = score === 0 ? 'low' : (score === 1 ? 'mild' : (score === 2 ? 'moderate' : 'severe'));
  }
  const descriptions = {
    'cognition': {
      low: 'Your mental processing and focus ability show significant room for improvement. The analysis indicates challenges in information processing speed, working memory efficiency, and cognitive flexibility. These metrics suggest that your brain may benefit from targeted cognitive enhancement strategies, including mental exercises, proper nutrition, and adequate rest to optimize neural function.',
      mild: 'Your cognitive function shows mild performance, with some difficulty in processing speed and working memory. While your brain manages basic cognitive tasks, there are clear areas where efficiency can be improved. Targeted brain training, regular physical exercise, and optimizing sleep quality can help elevate your cognitive performance.',
      moderate: 'Your cognitive function demonstrates moderate performance with balanced mental processing capabilities. While your brain shows adequate information processing and memory function, there are opportunities to enhance cognitive efficiency. Targeted brain training, lifestyle adjustments, and stress management can help optimize your mental performance.',
      severe: 'Excellent cognitive performance! Your brain demonstrates strong mental processing abilities, efficient working memory, and excellent cognitive flexibility. Your neural patterns indicate optimal information processing and strong executive function. Continue maintaining these healthy brain habits.'
    },
    'stress': {
      severe: 'Severe stress levels detected. Your brain activity patterns indicate significantly weak stress regulation with prolonged and intense stress responses. The brain remains in a heightened alert state, leading to mental fatigue, emotional reactivity, and difficulty recovering. Immediate prioritization of daily resets, stress boundaries, body regulation through movement, and consistent recovery routines is strongly recommended.',
      moderate: 'Moderate stress levels detected in your brain activity patterns. While your brain manages everyday demands reasonably well, there are signs of tension that may affect cognitive performance under prolonged pressure. Incorporating regular relaxation techniques, mindfulness practices, and recovery breaks can help strengthen your stress resilience.',
      mild: 'Mild stress levels detected. Your brain shows generally good stress regulation with minor areas for improvement. You handle most daily demands well, though occasional tension may arise under prolonged pressure. Maintaining regular relaxation practices and recovery breaks will help sustain your stress resilience.',
      low: 'Your brain shows strong stress regulation with efficient activation and deactivation of stress responses. You can handle pressure without feeling overwhelmed, staying calm, focused, and productive even in demanding situations. Your neural patterns reflect a well-regulated stress response system that supports overall cognitive function and well-being.'
    },
    'focus & attention': {
      low: 'Your focus and attention metrics indicate significant challenges in maintaining concentration on tasks, resisting distractions, and sustaining mental effort over time. Attention is influenced by multiple brainwave states, particularly beta waves and theta waves. Implementing structured focus techniques such as the Pomodoro method, mindfulness meditation, and physical exercise can help improve these capabilities.',
      mild: 'Your focus and attention levels show mild performance, suggesting some difficulty sustaining concentration for extended periods. While your brain can engage with tasks, you may find it challenging to resist distractions or maintain mental effort consistently. Practicing focused attention exercises, reducing digital distractions, and incorporating regular breaks can help strengthen your attentional control.',
      moderate: 'Focus and attention are crucial for cognitive performance, learning, and productivity. Your metrics show moderate ability to maintain concentration on a task, resist distractions, and sustain mental effort over time. An optimal balance between beta waves (linked to active thinking) and theta waves (associated with deep concentration) can be enhanced through targeted training.',
      severe: 'Focus and attention are crucial for cognitive performance, learning, and productivity. Your metrics show strong ability to maintain concentration, resist distractions, and sustain mental effort over time. Your brainwave balance between beta and theta waves indicates excellent attentional control and sustained information retention.'
    },
    'burnout & fatigue': {
      severe: 'Severe burnout and fatigue levels detected. Your brain shows significant and persistent mental and physical exhaustion with greatly reduced motivation and very low stamina for tasks. You may feel overwhelmed easily and find it extremely difficult to stay consistent even with simple routines. Immediate prioritization of recovery breaks, sleep hygiene, energy pacing, and stress regulation is strongly recommended.',
      moderate: 'Moderate burnout and fatigue detected. Your brain manages demands reasonably well but shows signs of accumulated mental load that may affect sustained performance. Adding short recovery breaks between tasks, maintaining consistent sleep hygiene, and pacing energy throughout the day can help prevent further buildup.',
      mild: 'Mild burnout and fatigue detected. Your brain maintains reasonable energy levels with minor signs of accumulated load. You generally manage workload demands well, though occasional fatigue may arise during extended periods of effort. Maintaining recovery breaks and consistent sleep hygiene will help sustain your energy levels.',
      low: 'Your brain shows low burnout and fatigue levels, maintaining steadier energy levels and recovering well after stress. You sustain performance over longer periods and typically manage workload demands without prolonged exhaustion. This supports consistent productivity and stronger follow-through on goals.'
    },
    'emotional regulation': {
      low: 'Your brain may struggle significantly to balance impulsive responses with rational control, leading to mood swings, irritability, or withdrawal. Emotional recovery after stress may be considerably slower. Practicing daily awareness, breath regulation, and response gap training can help strengthen emotional balance.',
      mild: 'Your emotional regulation shows mild performance, with some difficulty maintaining consistent emotional balance. You may experience heightened reactivity in certain situations and find it takes longer to recover emotionally. Building daily awareness practices, breath regulation techniques, and constructive reframing can help improve your emotional resilience.',
      moderate: 'Moderate emotional regulation detected. Your brain manages everyday emotional demands reasonably well, but may show variability under prolonged pressure. Strengthening mindful emotional check-ins, breath regulation, and constructive reframing can enhance your emotional resilience and stability.',
      severe: 'Strong emotional regulation detected. Your brain efficiently balances emotional reactivity with thoughtful response. You can experience emotions fully without being overwhelmed, remain composed during challenges, and recover quickly after emotional stress. This supports clear thinking, confident decision-making, and healthy relationships.'
    },
    'learning': {
      low: 'Low learning capacity can show up as slower comprehension, reduced retention, and difficulty applying new concepts in real-life situations. You may need more repetition and structure to build confidence and consistency. Spaced repetition, active learning, chunking, and a consistency routine can help strengthen memory and focus.',
      mild: 'Your learning capacity shows mild performance, indicating some challenges with information retention and applying new concepts. While you can take in new material, it may require more effort and repetition to fully absorb and apply it. Structured learning techniques like spaced repetition, active recall, and chunking information can help enhance your learning efficiency.',
      moderate: 'Moderate learning capacity detected. Your brain takes in new information reasonably well but may show variability in retention and application. Strengthening learning through spaced repetition, active practice questions, chunking information, and maintaining a consistent study routine can enhance your learning efficiency.',
      severe: 'High learning capacity detected. You absorb new information quickly, recognize patterns easily, and apply concepts across different situations. You tend to adapt fast, retain what you learn, and improve with feedback. This supports strong performance in academic and professional settings.'
    },
    'creativity': {
      low: 'A lower creativity score may indicate significant difficulty in approaching problems from multiple angles or generating new ideas. You may rely heavily on structured, rule-based thinking and struggle with abstract or open-ended tasks. Scheduling no-input time, changing environments, and practicing the two-mode rule (brainstorm first, edit later) can help stimulate creative potential.',
      mild: 'Your creativity levels show mild performance, suggesting some difficulty with flexible thinking and generating novel ideas. While you can follow established patterns, you may find it challenging to think outside the box or approach problems from unconventional angles. Engaging in free-form brainstorming, exploring new environments, and separating idea generation from evaluation can help unlock creative potential.',
      moderate: 'Moderate creativity levels detected. Your brain shows balanced creative abilities with some capacity for divergent thinking and innovation. Enhancing creative output through no-input time, environment changes, and separating brainstorming from editing can help unlock greater creative expression and flexible thinking.',
      severe: 'High creativity levels detected. You exhibit strong divergent thinking, allowing you to generate multiple solutions to problems. You tend to excel in innovation, artistic expression, and flexible thinking. Creative thinkers thrive in dynamic environments where new ideas and perspectives are valued.'
    }
  };
  let paramKey = null;
  if (name.includes('cognition')) paramKey = 'cognition';
  else if (name.includes('stress')) paramKey = 'stress';
  else if (name.includes('focus') || name.includes('attention')) paramKey = 'focus & attention';
  else if (name.includes('burnout') || name.includes('fatigue')) paramKey = 'burnout & fatigue';
  else if (name.includes('emotional') || name.includes('regulation')) paramKey = 'emotional regulation';
  else if (name.includes('learning')) paramKey = 'learning';
  else if (name.includes('creativity')) paramKey = 'creativity';
  return (paramKey && descriptions[paramKey]) ? descriptions[paramKey][scoreLevel] : '';
}

// Score-based metric body text (mirrors geminiPdfGenerator.getMetricInterpretation)
function getMetricBody(metricName, score, value) {
  const n = (metricName || '').toLowerCase();
  if (n.includes('focus') && n.includes('theta') && n.includes('beta')) {
    return score === 1 ? 'Your frontal brain regions show balanced activity for sustained attention.' : 'Suggests areas for improving focus and sustained attention capacity.';
  }
  if (n.includes('focus') && n.includes('stimulation')) {
    return score === 1 ? 'Your frontal brain regions show balanced activity for sustained attention.' : 'Suggests areas for improving focus and sustained attention capacity.';
  }
  if (n.includes('alpha') && n.includes('peak')) {
    return score === 1 ? 'Healthy alpha peak supports good cognitive processing.' : 'Alpha peak frequency suggests room for cognitive optimization.';
  }
  if (n.includes('alpha') && n.includes('theta') && n.includes('balance')) {
    return score === 1 ? 'Healthy balance supporting optimal mental processing and memory formation.' : 'Suggests areas for optimizing mental processing and memory formation.';
  }
  if (n.includes('arousal')) {
    return score === 1 ? 'Your brain maintains healthy arousal levels, supporting calm alertness.' : 'Elevated arousal patterns suggest opportunities for stress management.';
  }
  if (n.includes('relaxation')) {
    return score === 1 ? 'Good relaxation capacity - your brain can shift into relaxed states, promoting calm.' : 'Suggests opportunities for enhancing relaxation and recovery capacity.';
  }
  if (n.includes('regeneration') || n.includes('alpha modulation')) {
    return score === 1 ? 'Strong regenerative capacity supports mental recovery and restoration.' : 'Opportunities exist for improving mental recovery during rest periods.';
  }
  if (n.includes('focus theta') || (n.includes('focus') && !n.includes('beta'))) {
    return score === 1 ? 'Theta activity is well-regulated, supporting clear thinking.' : 'Theta patterns suggest areas for improving mental clarity.';
  }
  if (n.includes('delta') || n.includes('excessive')) {
    return score === 1 ? 'Energy levels are well-maintained with no significant fatigue markers.' : 'Delta patterns suggest opportunities for improving energy and alertness.';
  }
  if (n.includes('asymmetry') || n.includes('frontal')) {
    return score === 1 ? 'Balanced frontal brain activity supporting emotional regulation.' : 'Asymmetry patterns suggest areas for emotional balance optimization.';
  }
  return score === 1 ? 'Within optimal range for healthy brain function.' : 'Suggests areas for potential improvement.';
}

// ===== Test scores for preview (varied to show different description levels) =====
const TEST_SCORES = {
  cognition:             { score: 2, maxScore: 3 },  // 67% → Moderate
  emotionalRegulation:   { score: 1, maxScore: 3 },  // 33% → Mild
  burnout:               { score: 0, maxScore: 3 },  // 0%  → Severe
  focusAttention:        { score: 2, maxScore: 3 },  // 67% → Moderate
  stress:                { score: 1, maxScore: 3 },  // 33% → Moderate (stress level)
  learning:              { score: 2, maxScore: 3 },  // 67% → Moderate
  creativity:            { score: 3, maxScore: 3 },  // 100% → Severe
};

// Helper: get gauge percentage from score — same logic for ALL parameters (no inversion)
function getGaugePercentage(score) {
  if (score === 0) return 10;
  if (score === 1) return 25;
  if (score === 2) return 55;
  return 90;
}

// Sub-parameter pill bar — positioned by ACTUAL EEG VALUE on the scale (not percentage)
// Each sub-param has a real value, a clinical range (min-max), and a threshold
const SUB_PARAM_DATA = {
  'PEAK ALPHA':                    { value: 10.40, min: 6,  max: 14,  threshold: 9,   direction: 'more' },  // Hz, > 9 = healthy
  'EXCESSIVE DELTA':               { value: 75,    min: 0,  max: 100, threshold: 20,  direction: 'less' },  // %, < 20 = healthy
  'AROUSAL SCORE':                 { value: 0.85,  min: 0,  max: 2.5, threshold: 1,   direction: 'less' },  // ratio, < 1 = healthy
  'FOCUS AND ATTENTION':           { value: 1.82,  min: 0,  max: 4,   threshold: 1.5, direction: 'less' },  // Theta:Beta ratio, < 1.5 = healthy
  'RELAXATION SCORE':              { value: 6.50,  min: 0,  max: 25,  threshold: 8,   direction: 'more' },  // Alpha:Beta ratio, > 8 = healthy
  'REGENERATION AND REPAIR SCORE': { value: 28,    min: 0,  max: 100, threshold: 30,  direction: 'more' },  // %, > 30 = healthy
  'ASYMMETRY EYE OPEN':            { value: 1.15,  min: 0,  max: 5,   threshold: 1,   direction: 'less' },  // ratio, < 1 = healthy
};
function getSubParamPillScore(subParamName) {
  const sp = SUB_PARAM_DATA[subParamName];
  if (!sp) return 50;
  return Math.max(0, Math.min(100, Math.round(((sp.value - sp.min) / (sp.max - sp.min)) * 100)));
}
function getSubParamPillScale(subParamName) {
  const sp = SUB_PARAM_DATA[subParamName];
  if (!sp) return null;
  const units = {
    'PEAK ALPHA': 'Hz', 'EXCESSIVE DELTA': '%', 'AROUSAL SCORE': '',
    'FOCUS AND ATTENTION': '', 'RELAXATION SCORE': '',
    'REGENERATION AND REPAIR SCORE': '%', 'ASYMMETRY EYE OPEN': ''
  };
  return { min: sp.min, max: sp.max, value: sp.value, unit: units[subParamName] || '', steps: 5 };
}

console.log('Generating preview PDF...');

const doc = new PDFDocument({
  size: 'A4',
  margin: 0,
  autoFirstPage: false
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

// Page 1: Cover Page
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 1: Cover Page...');
try {
  generateCoverPage(doc, {
    name: 'Sample Patient',
    dateOfBirth: '01/01/1990',
    assessmentDate: '25/02/2026',
    age: 36,
    profession: 'Engineer',
    patientId: '56d82a26-2b9b-43ac-b881-01472cba6218'
  }, { addPage: false });
} catch (e) {
  console.error('   Error generating Cover Page:', e.message, e.stack);
}

// Page 2: Introduction (fully programmatic)
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 2: Introduction (programmatic)...');
try {
  generateIntroductionPage(doc);
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
// Footer
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 2', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 3: Congratulations
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 3: Congratulations...');
try {
  generateCongratulationsPage(doc);
} catch (e) {
  console.error('   Error:', e.message);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 3', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 4: Brainwave Profiles
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 4: Brainwave Profiles...');
try {
  generateBrainwaveProfilesPage(doc);
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 4', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 5: Full page image
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 5: Full page image...');
try {
  if (fs.existsSync(PAGE5_IMG)) {
    doc.image(PAGE5_IMG, 0, 0, { width: 595.28, height: 841.89 });
  }
  // NeuroSense logo — Figma: X:494, Y:12, W:87.85, H:59.58
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 494, 12, { fit: [87.85, 59.58], align: 'center', valign: 'center' });
  }

  // "Your Brain Markers" — Figma: X:162, Y:50, W:271, H:35, Bold 32px, 110% LH, -2% LS
  // Fill: #FFFFFF + Linear gradient, Effects: Drop shadow
  // "Your Brain Markers" — Figma exact: X:162, Y:50, W:271, H:35
  // Typography: Outfit Bold 32px, 110% LH, -2% LS
  // Fill: #FFFFFF (100%) + Linear (100%), Effects: Drop shadow

  // Drop shadow
  doc.save();
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#000000').fillOpacity(0.20)
     .text('Your Brain Markers', 163, 55, { lineBreak: false, characterSpacing: -0.52 });
  doc.fillOpacity(1);
  doc.restore();

  // White text at exact Figma position
  doc.save();
  doc.font('Helvetica-Bold').fontSize(26).fillColor('#FFFFFF')
     .text('Your Brain Markers', 162, 53, { lineBreak: false, characterSpacing: -0.52 });
  doc.restore();

  // ===== BRAIN MARKER CARDS — each styled individually =====

  // Helper: draw a card frame with Figma specs
  // isDark = true for Focus & Attention card (dark blue-gray glass, white text)
  function drawBrainCard(cx, cy, cw, ch, cr, title, body, gradStops, isDark) {

    if (isDark) {
      // Drop shadow for dark cards only
      doc.save();
      doc.roundedRect(cx + 2, cy + 3, cw, ch, cr).fillColor('#000000').fillOpacity(0.08).fill();
      doc.fillOpacity(1); doc.restore();
      doc.save();
      doc.roundedRect(cx + 1, cy + 1, cw, ch, cr).fillColor('#000000').fillOpacity(0.04).fill();
      doc.fillOpacity(1); doc.restore();

      var grad = doc.linearGradient(cx, cy, cx + cw, cy + ch);
      grad.stop(0, '#3a4a5c', 0.70).stop(1, '#5a7a9c', 0.55);
      doc.save(); doc.roundedRect(cx, cy, cw, ch, cr).fill(grad); doc.restore();
      doc.save(); doc.roundedRect(cx, cy, cw, ch, cr).fillColor('#FFFFFF').fillOpacity(0.12).fill(); doc.fillOpacity(1); doc.restore();
      doc.save(); doc.roundedRect(cx + 3, cy + 3, cw - 6, ch * 0.3, cr).fillColor('#FFFFFF').fillOpacity(0.08).fill(); doc.fillOpacity(1); doc.restore();
      doc.save(); doc.roundedRect(cx, cy, cw, ch, cr).strokeColor('#FFFFFF').strokeOpacity(0.30).lineWidth(0.6).stroke(); doc.strokeOpacity(1); doc.restore();
    } else {
      // Light cards: drop shadow + solid white background + visible border
      // Drop shadow
      doc.save(); doc.roundedRect(cx + 2, cy + 3, cw, ch, cr).fillColor('#000000').fillOpacity(0.08).fill(); doc.fillOpacity(1); doc.restore();
      doc.save(); doc.roundedRect(cx + 1, cy + 1, cw, ch, cr).fillColor('#000000').fillOpacity(0.04).fill(); doc.fillOpacity(1); doc.restore();
      // White fill with transparency
      doc.save(); doc.roundedRect(cx, cy, cw, ch, cr).fillColor('#FFFFFF').fillOpacity(0.65).fill(); doc.fillOpacity(1); doc.restore();
      // Glass highlight — top edge shine
      doc.save(); doc.roundedRect(cx + 2, cy + 2, cw - 4, ch * 0.3, cr).fillColor('#FFFFFF').fillOpacity(0.25).fill(); doc.fillOpacity(1); doc.restore();
      // Outer glow border (light blue shine)
      doc.save(); doc.roundedRect(cx - 0.5, cy - 0.5, cw + 1, ch + 1, cr).strokeColor('#A8D4FF').strokeOpacity(0.40).lineWidth(1.5).stroke(); doc.strokeOpacity(1); doc.restore();
      // Inner shiny border
      doc.save(); doc.roundedRect(cx, cy, cw, ch, cr).strokeColor('#FFFFFF').strokeOpacity(0.80).lineWidth(0.8).stroke(); doc.strokeOpacity(1); doc.restore();
    }

    // ---- Text colors ----
    var headingColor = isDark ? '#FFFFFF' : '#227AFF';
    var bodyColor = isDark ? '#FFFFFF' : '#000000';

    // Title — Bold 18px
    var titleFS = 18;
    doc.font('Helvetica-Bold').fontSize(titleFS);
    var titleW = cw - 32;
    if (doc.widthOfString(title.replace('\n', ' ')) > titleW) {
      titleFS = 16;
    }
    doc.save();
    doc.font('Helvetica-Bold').fontSize(titleFS).fillColor(headingColor)
       .text(title, cx + 16, cy + 18, { width: titleW, align: 'left', lineGap: -2 });
    doc.restore();

    // Body text — Regular 12px, 150% LH
    doc.save();
    doc.font('Helvetica-Bold').fontSize(titleFS);
    var titleH = doc.heightOfString(title, { width: titleW, lineGap: -2 });
    doc.font('Helvetica').fontSize(12).fillColor(bodyColor)
       .text(body, cx + 16, cy + 18 + titleH + 8, { width: titleW, align: 'left', lineGap: 3.5 });
    doc.restore();
  }

  // Card 1: Emotional Regulation — Figma: X:50, Y:130, W:218, H:145, R:36
  drawBrainCard(50, 130, 218, 145, 36,
    'Emotional Regulation',
    'Your ability to stay emotionally steady, manage triggers and self soothe. Return to calm after stress.',
    null, false
  );

  // Card 2: Brain Burn Out — Figma: X:330, Y:130, W:216, H:169, R:36
  drawBrainCard(330, 130, 216, 169, 36,
    'Brain Burn Out',
    'The level of mental depletion in your system, reflecting recovery, resilience, and capacity to keep performing without feeling overwhelmed.',
    null, false
  );

  // Card 3: Focus & Attention — Figma: X:184, Y:363, W:226, H:151, R:36 (dark glass)
  drawBrainCard(184, 363, 226, 151, 36,
    'Focus & Attention',
    'Your ability to concentrate, stay on task, filter out distractions, and shift focus smoothly when needed.',
    null, true
  );

  // Card 4: Stress & Mental Overload — Figma: X:35, Y:537, W:218, H:170, R:36
  drawBrainCard(35, 537, 218, 170, 36,
    'Stress & Mental\nOverload',
    'The overall stress your mind and body are experiencing, reflecting whether pressure is building up or being handled comfortably.',
    null, false
  );

  // Card 5: Cognition — Figma: X:349, Y:570, W:205, H:145, R:36
  drawBrainCard(349, 570, 205, 145, 36,
    'Cognition',
    'How efficiently your brain thinks and works, covering clarity, speed of processing, memory, learning, and problem solving.',
    null, false
  );

} catch (e) {
  console.error('   Error:', e.message);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 5', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 6: Your Numbers At a Glance
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 6: Your Numbers At a Glance...');
try {
  // parameterNotes is dynamic — auto-detected from QEEG PDFs (3+ red channels)
  // No static text — only shows when actual noisy channels are detected
  generateYourNumbersPage(doc, null, '');
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 6', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== RADAR CHART HELPER — 3 discrete rings: Low, Medium, High =====
function drawRadarChart(doc, chartX, chartY, chartW, chartH, labels, datasets) {
  var cx = chartX + chartW / 2;    // center X
  var cy = chartY + chartH / 2;    // center Y
  var maxR = Math.min(chartW, chartH) / 2 - 30;  // max radius with padding for labels
  var sides = labels.length;
  var angleStep = (2 * Math.PI) / sides;
  var startAngle = -Math.PI / 2;  // start from top

  // Helper: get point on axis
  function getPoint(index, value) {
    var angle = startAngle + index * angleStep;
    var r = (value / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  // Draw 3 grid rings: Low (33.33%), Medium (66.67%), High (100%)
  var ringLevels = [
    { value: 33.33, label: 'Low' },
    { value: 66.67, label: 'Medium' },
    { value: 100,   label: 'High' }
  ];
  ringLevels.forEach(function(ring) {
    doc.save();
    var first = getPoint(0, ring.value);
    doc.moveTo(first.x, first.y);
    for (var i = 1; i < sides; i++) {
      var p = getPoint(i, ring.value);
      doc.lineTo(p.x, p.y);
    }
    doc.closePath();
    doc.strokeColor('#666666').strokeOpacity(0.8).lineWidth(0.7).stroke();
    doc.strokeOpacity(1);
    doc.restore();
    // Draw ring label next to the top axis
    var labelPoint = getPoint(0, ring.value);
    doc.save();
    doc.font('Helvetica').fontSize(6).fillColor('#888888')
       .text(ring.label, labelPoint.x + 4, labelPoint.y - 3, { width: 40, lineBreak: false });
    doc.restore();
  });

  // Draw axis lines from center to each vertex
  for (var i = 0; i < sides; i++) {
    var p = getPoint(i, 100);
    doc.save();
    doc.moveTo(cx, cy).lineTo(p.x, p.y)
       .strokeColor('#666666').strokeOpacity(0.8).lineWidth(0.6).stroke();
    doc.strokeOpacity(1);
    doc.restore();
  }

  // Draw data polygons
  datasets.forEach(function(ds) {
    // Fill
    doc.save();
    var f0 = getPoint(0, ds.values[0]);
    doc.moveTo(f0.x, f0.y);
    for (var i = 1; i < sides; i++) {
      var fp = getPoint(i, ds.values[i]);
      doc.lineTo(fp.x, fp.y);
    }
    doc.closePath();
    doc.fillColor(ds.color).fillOpacity(ds.fillOpacity).fill();
    doc.fillOpacity(1);
    doc.restore();

    // Stroke
    doc.save();
    var s0 = getPoint(0, ds.values[0]);
    doc.moveTo(s0.x, s0.y);
    for (var i = 1; i < sides; i++) {
      var sp = getPoint(i, ds.values[i]);
      doc.lineTo(sp.x, sp.y);
    }
    doc.closePath();
    doc.strokeColor(ds.color).strokeOpacity(ds.strokeOpacity).lineWidth(ds.lineWidth).stroke();
    doc.strokeOpacity(1);
    doc.restore();

    // Data points (larger dots for visibility on snapped positions)
    for (var i = 0; i < sides; i++) {
      var dp = getPoint(i, ds.values[i]);
      doc.save();
      doc.circle(dp.x, dp.y, 3.5).fillColor(ds.color).fill();
      doc.restore();
    }
  });

  // Draw labels at each axis
  for (var i = 0; i < sides; i++) {
    var angle = startAngle + i * angleStep;
    var labelR = maxR + 18;
    var lx = cx + labelR * Math.cos(angle);
    var ly = cy + labelR * Math.sin(angle);
    var labelW = 80;

    // Adjust alignment based on position
    var align = 'center';
    var xOffset = -labelW / 2;
    if (Math.cos(angle) < -0.3) { align = 'right'; xOffset = -labelW; }
    else if (Math.cos(angle) > 0.3) { align = 'left'; xOffset = 0; }

    doc.save();
    doc.font('Helvetica').fontSize(8).fillColor('#227AFF')
       .text(labels[i], lx + xOffset, ly - 5, { width: labelW, align: align, lineBreak: true });
    doc.restore();
  }
}

// Page 7: Full page image (Page7.png)
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 7: Full page image...');
try {
  var PAGE7_IMG = path.join(__dirname, '../public/assets/Page7.png');
  if (fs.existsSync(PAGE7_IMG)) {
    doc.image(PAGE7_IMG, 0, 0, { width: 595.28, height: 841.89 });
  }
  // NeuroSense logo — Figma: X:494, Y:12, W:87.85, H:59.58
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 494, 12, { fit: [87.85, 59.58], align: 'center', valign: 'center' });
  }

  // ===== RADAR CHART — Figma: X:103, Y:238, W:372, H:283.92 =====
  // Values snap to 3 levels: Low=33.33, Medium=66.67, High=100
  var radarLabels = ['Cognition', 'Burnout & Fatigue', 'Learning', 'Focus & Attention', 'Emotional Regulation', 'Stress', 'Creative'];
  var radarData = [
    { values: [100, 66.67, 100, 66.67, 33.33, 66.67, 66.67], color: '#0175FF', fillOpacity: 0.15, strokeOpacity: 1, lineWidth: 1.5 }
  ];

  drawRadarChart(doc, 103, 290, 372, 310, radarLabels, radarData);

} catch (e) {
  console.error('   Error:', e.message);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 7', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 8: Cognition (score-based)
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 8: Cognition...');
try {
  var cogScore = TEST_SCORES.cognition.score;
  generateCognitionPage(doc, {
    title: 'COGNITION',
    percentage: getGaugePercentage(cogScore),
    description: getScoreDescription('Cognition', cogScore),
    metrics: [
      { title: 'Focus Score Stimulation Control', body: getMetricBody('Focus Score Stimulation Control (Theta:Beta)', cogScore >= 1 ? 1 : 0), value: 'Value: 3.14' },
      { title: 'Alpha Peak', body: getMetricBody('Alpha Peak', cogScore >= 2 ? 1 : 0), value: 'Value: 10.2 Hz' },
      { title: 'Alpha:Theta Balance', body: getMetricBody('Alpha:Theta Balance', cogScore >= 3 ? 1 : 0), value: 'Value: fz: 1.06, cz: 2.84, pz: 7.50 (Fz < Cz < Pz is normal)' }
    ],
    references: [
      'Arns, Martijn, et al. "A Decade of EEG Theta/Beta Ratio Research in ADHD: a Meta-Analysis." Sage Journals, 2012.',
      'Klimesch, W. (1999). "EEG alpha and theta oscillations reflect cognitive and memory performance." Brain Research Reviews, 29(2-3), 169-195.',
      'Bazanova, O. M., & Vernon, D. (2014). "Interpreting EEG alpha activity." Neuroscience & Biobehavioral Reviews, 44, 94-110.',
      'Grandy, T. H., et al. (2013). "Peak individual alpha frequency qualifies as a stable neurophysiological trait marker." Psychophysiology, 50(6), 570-582.',
      'Angelakis, E., et al. (2004). "EEG neurofeedback: A brief overview and an example of peak alpha frequency training." The Clinical Neuropsychologist, 21(1), 110-129.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 10/01/2026, 12:17 pm by 56d82a26-2b9b-43ac-b881-01472cba6218', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 8', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// Page 9: Cognition Details (High/Low Cognition + How to Improve)
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 9: Cognition Details...');
try {
  generateCognitionPage2(doc);
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 10/01/2026, 12:17 pm by 56d82a26-2b9b-43ac-b881-01472cba6218', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 9', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 10: Emotional Regulation (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 10: Emotional Regulation...');
try {
  var emScore = TEST_SCORES.emotionalRegulation.score;
  generateCognitionPage(doc, {
    title: 'EMOTIONAL REGULATION',
    percentage: getGaugePercentage(emScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/emotionalregulation.png'),
    description: getScoreDescription('Emotional Regulation', emScore),
    metrics: [
      { title: 'Alpha Asymmetry (Frontal)', body: getMetricBody('Alpha Asymmetry (Frontal)', emScore >= 1 ? 1 : 0), value: 'Value: F3: 2.10, F4: 1.85' },
      { title: 'Arousal Score', body: getMetricBody('Arousal Score', emScore >= 2 ? 1 : 0), value: 'Value: 0.85' },
      { title: 'Regeneration (Alpha Modulation)', body: getMetricBody('Regeneration (Alpha Modulation)', emScore >= 3 ? 1 : 0), value: 'Value: 35.2%' }
    ],
    references: [
      'Davidson, R. J. (2004). "What does the prefrontal cortex do in affect: perspectives on frontal EEG asymmetry research." Biological Psychology, 67(1-2), 219-234.',
      'Harmon-Jones, E., & Gable, P. A. (2018). "On the role of asymmetric frontal cortical activity in approach and withdrawal motivation." Psychophysiology, 55(1), e12879.',
      'Coan, J. A., & Allen, J. J. (2004). "Frontal EEG asymmetry as a moderator and mediator of emotion." Biological Psychology, 67(1-2), 7-50.',
      'Gross, J. J. (2015). "Emotion regulation: Current status and future prospects." Psychological Inquiry, 26(1), 1-26.',
      'Etkin, A., Büchel, C., & Gross, J. J. (2015). "The neural bases of emotion regulation." Nature Reviews Neuroscience, 16(11), 693-700.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 10', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 11: Emotional Regulation Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 11: Emotional Regulation Details...');
try {
  generateCognitionPage2(doc, {
    title: 'EMOTIONAL REGULATION',
    description: 'Emotional Regulation refers to the brain\'s ability to manage, process, and respond to emotions in a balanced and appropriate manner. It reflects how effectively the brain integrates emotional signals from the limbic system with rational control from the frontal regions. Healthy emotional regulation supports stability, resilience, relationships, and decision-making under pressure.',
    highCognition: {
      title: 'Strong Emotional Regulation',
      paragraphs: [
        'Individuals with strong emotional regulation can experience emotions fully without being overwhelmed by them.',
        'Their brain efficiently balances emotional reactivity with thoughtful response. They remain composed during challenges and recover quickly after emotional stress.'
      ],
      implications: [
        'Stable emotional regulation supports clear thinking, confident decision-making, and healthy relationships.',
        'These individuals demonstrate resilience, patience, and adaptability in changing situations.',
        'Strong emotional balance enhances leadership capacity, communication skills, and overall well-being.'
      ]
    },
    lowCognition: {
      title: 'Weak Emotional Regulation',
      paragraphs: [
        'Individuals with weak emotional regulation may experience heightened emotional reactivity or emotional shutdown.',
        'The brain may struggle to balance impulsive responses with rational control, leading to mood swings, irritability, or withdrawal. Emotional recovery after stress may be slower.'
      ],
      implications: [
        'Emotional dysregulation can impact focus, judgment, and interpersonal relationships.',
        'Increased reactivity may lead to anxiety, frustration, or low mood.',
        'Difficulty managing emotions may reduce resilience and affect academic, professional, or social functioning.'
      ]
    },
    howToImprove: [
      'Daily Awareness practice: 5-10 minutes of mindful emotional check-ins to identify and label feelings.',
      'Breath regulation: Slow breathing techniques to calm limbic activation and restore balance.',
      'Response gap training: Pause before reacting; practice reframing situations constructively.',
      'Emotional recovery habits: Prioritize sleep, journaling, and supportive conversations to enhance resilience.'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 11', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 12: Brain Burn Out (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 12: Brain Burn Out...');
try {
  var burnScore = TEST_SCORES.burnout.score;
  generateCognitionPage(doc, {
    title: 'BURNOUT AND FATIGUE',
    percentage: getGaugePercentage(burnScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/burnoutandfatigue.png'),
    description: getScoreDescription('Burnout & Fatigue', burnScore),
    metrics: [
      { title: 'Arousal Score', body: getMetricBody('Arousal Score', burnScore >= 1 ? 1 : 0), value: 'Value: 1.45' },
      { title: 'Relaxation Score', body: getMetricBody('Relaxation Score', burnScore >= 2 ? 1 : 0), value: 'Value: 4.2' },
      { title: 'Excessive Delta', body: getMetricBody('Excessive Delta', burnScore >= 3 ? 1 : 0), value: 'Value: 82%' }
    ],
    references: [
      'Boksem, M. A., & Tops, M. (2008). "Mental fatigue: Costs and benefits." Brain Research Reviews, 59(1), 125-139.',
      'Wascher, E., et al. (2014). "Frontal theta activity reflects distinct aspects of mental fatigue." Biological Psychology, 96, 57-65.',
      'Lal, S. K., & Craig, A. (2001). "A critical review of the psychophysiology of driver fatigue." Biological Psychology, 55(3), 173-194.',
      'Arnsten, A. F. (2009). "Stress signalling pathways that impair prefrontal cortex structure and function." Nature Reviews Neuroscience, 10(6), 410-422.',
      'Tops, M., & Boksem, M. A. (2012). "What\'s that? What went wrong? Positive and negative surprise and the rostral-Loss posterior gradient in busyness and burnout." Psychophysiology, 49(4), 583-590.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 12', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 13: Brain Burn Out Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 13: Brain Burn Out Details...');
try {
  generateCognitionPage2(doc, {
    title: 'BURNOUT AND FATIGUE',
    description: 'Burnout & Fatigue show how tired the brain is from ongoing demands and stress. It reflects reduced mental energy, slower thinking, and difficulty staying motivated or focused. Adequate recovery helps restore balance and brain performance.',
    highCognition: {
      title: 'High Burnout & Fatigue',
      paragraphs: [
        'Individuals with high burnout and fatigue experience persistent mental and physical exhaustion, reduced motivation, and lower stamina for tasks.',
        'They may feel overwhelmed easily and find it harder to stay consistent, even with simple routines.'
      ],
      implications: [
        'Low energy can reduce productivity, making tasks feel heavier and take longer to complete.',
        'Increased stress sensitivity may impact emotional regulation, causing irritability and low resilience.',
        'Fatigue can reduce focus and memory, leading to more mistakes and difficulty staying engaged.'
      ]
    },
    lowCognition: {
      title: 'Low Burnout & Fatigue',
      paragraphs: [
        'Individuals with low burnout and fatigue maintain steadier energy levels, recover well after stress, and sustain performance over longer periods.',
        'They typically manage workload demands without prolonged exhaustion.'
      ],
      implications: [
        'Better energy stability supports consistent performance and stronger follow-through on goals.',
        'Improved resilience helps individuals handle pressure without emotional overwhelm.',
        'Stronger focus and recovery make it easier to maintain routines and stay motivated.'
      ]
    },
    howToImprove: [
      'Recovery Breaks: Add short resets between tasks (5-10 minutes) to reduce mental load and prevent burnout buildup.',
      'Sleep Hygiene: Maintain a consistent sleep schedule and a calming wind-down routine to improve recovery.',
      'Energy Pacing: Alternate high-effort tasks with lighter tasks to avoid overloading the brain.',
      'Stress Regulation: Use breath work, walking, stretching, or guided relaxation to support nervous system recovery.'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 13', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 14: Focus & Attention (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 14: Focus & Attention...');
try {
  var focusScore = TEST_SCORES.focusAttention.score;
  generateCognitionPage(doc, {
    title: 'FOCUS & ATTENTION',
    percentage: getGaugePercentage(focusScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/focusandattention.png'),
    description: getScoreDescription('Focus & Attention', focusScore),
    metrics: [
      { title: 'Focus Theta', body: getMetricBody('Focus Theta', focusScore >= 1 ? 1 : 0), value: 'Value: 15.3%' },
      { title: 'Alpha:Theta Balance', body: getMetricBody('Alpha:Theta Balance', focusScore >= 2 ? 1 : 0), value: 'Value: fz: 1.06, cz: 2.84, pz: 7.50 (Fz < Cz < Pz is normal)' },
      { title: 'Focus Score (Theta:Beta)', body: getMetricBody('Focus Score (Theta:Beta)', focusScore >= 3 ? 1 : 0), value: 'Value: 1.32' }
    ],
    references: [
      'Arns, M., et al. (2013). "A Decade of EEG Theta/Beta Ratio Research in ADHD: A Meta-Analysis." Journal of Attention Disorders, 17(5), 374-383.',
      'Egner, T., & Gruzelier, J. H. (2004). "EEG Biofeedback of low beta band components: frequency-specific effects on variables of attention and event-related brain potentials." Clinical Neurophysiology, 115(1), 131-139.',
      'Lubar, J. F. (1991). "Discourse on the development of EEG diagnostics and biofeedback for attention-deficit/hyperactivity disorders." Biofeedback and Self-Regulation, 16(3), 201-225.',
      'Sterman, M. B. (1996). "Physiological origins and functional correlates of EEG rhythmic activities." Psychophysiology, 33(5), 497-519.',
      'Vernon, D. J. (2005). "Can neurofeedback training enhance performance? An evaluation of the evidence." Applied Psychophysiology and Biofeedback, 30(4), 347-364.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 14', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 15: Focus & Attention Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 15: Focus & Attention Details...');
try {
  generateCognitionPage2(doc, {
    title: 'FOCUS AND ATTENTION',
    description: 'Focus and attention are crucial for cognitive performance, learning, and productivity. These metrics measure how well an individual can maintain concentration on a task, resist distractions, and sustain mental effort over time. Attention is influenced by multiple brainwave states, particularly beta waves (linked to active thinking) and theta waves (associated with focus in deep concentration). An optimal balance between these waves ensures sustained attention and information retention.',
    highCognition: {
      title: 'High Focus & Attention',
      paragraphs: [
        'Individuals with high attention scores can concentrate for extended periods, absorb new information efficiently, and exhibit strong executive functioning skills.',
        'They tend to be more productive and can manage cognitive demands without excessive fatigue.'
      ],
      implications: [
        'High-attention individuals can complete complex tasks efficiently, making them effective learners and problem solvers.',
        'Their ability to resist distractions leads to better academic and professional performance.',
        'They tend to have a greater working memory capacity, allowing them to process and recall information quickly.'
      ]
    },
    lowCognition: {
      title: 'Low Focus & Attention',
      paragraphs: [
        'Low attention levels can manifest as distractibility, difficulty sustaining effort on tasks, and frequent cognitive fatigue.',
        'Individuals with low focus scores may struggle with task completion, procrastination, and inefficiency in their work.'
      ],
      implications: [
        'Difficulty focusing can lead to frustration, reduced academic performance, and slower information retention.',
        'These individuals may find it harder to stay engaged in long conversations or complex problem-solving activities.',
        'A lack of sustained attention may contribute to frequent mistakes and overlooked details in tasks.'
      ]
    },
    howToImprove: [
      'Pomodoro Technique: Implement structured work and rest intervals (e.g., 25 minutes of focus followed by a 5-minute break) to train sustained attention.',
      'Mindfulness & Meditation: Practicing mindfulness strengthens the brain\'s ability to filter out distractions and sustain focus.',
      'Physical Exercise: Aerobic activities improve blood flow to the brain, supporting cognitive functions related to attention.',
      'Dietary Adjustments: Consuming omega-3 fatty acids, B vitamins, and hydration can enhance brain function and improve attention regulation.'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 15', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 16: Stress & Mental Overload (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 16: Stress & Mental Overload...');
try {
  var stressScore = TEST_SCORES.stress.score;
  generateCognitionPage(doc, {
    title: 'STRESS',
    percentage: getGaugePercentage(stressScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/stress.png'),
    description: getScoreDescription('Stress', stressScore),
    metrics: [
      { title: 'Arousal Score', body: getMetricBody('Arousal Score', stressScore >= 1 ? 1 : 0), value: 'Value: 0.92' },
      { title: 'Relaxation Score', body: getMetricBody('Relaxation Score', stressScore >= 2 ? 1 : 0), value: 'Value: 5.8' },
      { title: 'Regeneration (Alpha Modulation)', body: getMetricBody('Regeneration (Alpha Modulation)', stressScore >= 3 ? 1 : 0), value: 'Value: 22%' }
    ],
    references: [
      'Arnsten, A. F. (2009). "Stress signalling pathways that impair prefrontal cortex structure and function." Nature Reviews Neuroscience, 10(6), 410-422.',
      'McEwen, B. S. (2007). "Physiology and neurobiology of stress and adaptation: central role of the brain." Physiological Reviews, 87(3), 873-904.',
      'Lupien, S. J., et al. (2009). "Effects of stress throughout the lifespan on the brain, behaviour and cognition." Nature Reviews Neuroscience, 10(6), 434-445.',
      'Juster, R. P., McEwen, B. S., & Lupien, S. J. (2010). "Allostatic load biomarkers of chronic stress." Neuroscience & Biobehavioral Reviews, 35(1), 2-16.',
      'Hermans, E. J., et al. (2014). "Stress-related noradrenergic activity prompts large-scale neural network reconfiguration." Science, 334(6059), 1151-1153.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 16', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 17: Stress & Mental Overload Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 17: Stress & Mental Overload Details...');
try {
  generateCognitionPage2(doc, {
    title: 'STRESS',
    description: 'Stress refers to how the brain and body respond to internal and external demands such as workload, expectations, emotional pressure, and environmental challenges. Healthy stress regulation allows the brain to stay alert, focused, and adaptive. When stress becomes excessive or prolonged, it can impact cognition, emotional balance, physical health, and overall functioning.',
    highCognition: {
      title: 'Strong Stress Regulation',
      paragraphs: [
        'Individuals with strong stress regulation can handle pressure without feeling overwhelmed.',
        'Their brain efficiently activates and deactivates stress responses, allowing them to stay calm, focused, and productive even in demanding situations. They recover well after challenges and maintain emotional balance.'
      ],
      implications: [
        'Effective stress regulation supports sustained focus, decision-making, and emotional stability.',
        'These individuals adapt better to change and perform consistently under pressure.',
        'Balanced stress responses enhance resilience, learning capacity, and overall mental well-being.'
      ]
    },
    lowCognition: {
      title: 'Weak Stress Regulation',
      paragraphs: [
        'Individuals with weak stress regulation may experience prolonged or intense stress responses.',
        'The brain remains in a heightened alert state, leading to mental fatigue, emotional reactivity, or shutdown. This can interfere with thinking clarity, motivation, and recovery.'
      ],
      implications: [
        'Chronic stress may lead to anxiety, irritability, low motivation, or mental exhaustion.',
        'Prolonged stress can impair memory, attention, and learning efficiency.',
        'Poor stress regulation may affect sleep, emotional control, and physical health over time.'
      ]
    },
    howToImprove: [
      'Daily reset: 10-15 minutes of slow breathing, mindfulness, or quiet reflection to calm the nervous system.',
      'Stress boundaries: Limit continuous multitasking and schedule short recovery breaks during the day.',
      'Body regulation: Regular movement such as walking, stretching, or light exercise to release stored stress.',
      'Recovery routine: Prioritize sleep, reduce late-day stimulation, and maintain consistent daily rhythms.'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 17', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 18: Learning (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 18: Learning...');
try {
  var learnScore = TEST_SCORES.learning.score;
  generateCognitionPage(doc, {
    title: 'LEARNING',
    percentage: getGaugePercentage(learnScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/learning.png'),
    description: getScoreDescription('Learning', learnScore),
    metrics: [
      { title: 'Alpha Peak', body: getMetricBody('Alpha Peak', learnScore >= 1 ? 1 : 0), value: 'Value: 10.2 Hz' },
      { title: 'Focus Score (Theta:Beta)', body: getMetricBody('Focus Score (Theta:Beta)', learnScore >= 2 ? 1 : 0), value: 'Value: 1.32' },
      { title: 'Alpha:Theta Balance', body: getMetricBody('Alpha:Theta Balance', learnScore >= 3 ? 1 : 0), value: 'Value: fz: 1.06, cz: 2.84, pz: 7.50 (Fz < Cz < Pz is normal)' }
    ],
    references: [
      'Klimesch, W. (1999). "EEG alpha and theta oscillations reflect cognitive and memory performance." Brain Research Reviews, 29(2-3), 169-195.',
      'Gruber, M. J., et al. (2014). "States of curiosity modulate hippocampus-dependent learning via the dopaminergic circuit." Neuron, 84(2), 486-496.',
      'Doppelmayr, M., et al. (2005). "EEG alpha power and intelligence." Intelligence, 33(1), 35-46.',
      'Stern, Y. (2009). "Cognitive reserve." Neuropsychologia, 47(10), 2015-2028.',
      'Jaeggi, S. M., et al. (2008). "Improving fluid intelligence with training on working memory." PNAS, 105(19), 6829-6833.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 18', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 19: Learning Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 19: Learning Details...');
try {
  generateCognitionPage2(doc, {
    title: 'LEARNING',
    description: 'Learning Capacity shows how well the brain takes in new information and turns it into understanding. It reflects how quickly concepts are grasped, remembered, and used in real life. A healthy learning capacity helps the brain stay adaptable and confident while learning.',
    highCognition: {
      title: 'High Learning',
      paragraphs: [
        'Individuals with high learning capacity absorb new information quickly, recognize patterns easily, and apply concepts across different situations.',
        'They tend to adapt fast, retain what they learn, and improve with feedback.'
      ],
      implications: [
        'Quick learning improves performance in academic and professional settings where new skills are required.',
        'Strong retention supports better exam outcomes, faster mastery, and more confident decision-making.',
        'High adaptability allows individuals to switch strategies smoothly when challenges or expectations change.'
      ]
    },
    lowCognition: {
      title: 'Low Learning',
      paragraphs: [
        'Low learning capacity can show up as slower comprehension, reduced retention, and difficulty applying new concepts in real-life situations.',
        'Individuals may need more repetition and structure to build confidence and consistency.'
      ],
      implications: [
        'Difficulty processing new information may lead to frustration and reduced confidence in learning environments.',
        'Lower retention can make it harder to keep up with instructions, multi-step tasks, or fast-paced lessons.',
        'Challenges with applying concepts can impact problem-solving ability and increase reliance on guidance.'
      ]
    },
    howToImprove: [
      'Spaced Repetition: Review key concepts in short intervals across days to strengthen memory.',
      'Active Learning: Use practice questions, teach-back methods, and real examples to build understanding.',
      'Chunking: Break information into smaller sections with clear headings, summaries, and check-ins.',
      'Consistency Routine: Study or practice at the same time daily to train the brain for better recall and focus.'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 19', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 20: Creativity (Gauge) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 20: Creativity...');
try {
  var creatScore = TEST_SCORES.creativity.score;
  generateCognitionPage(doc, {
    title: 'CREATIVITY',
    percentage: getGaugePercentage(creatScore),
    gaugeImage: path.resolve(__dirname, '../public/assets/creativity.png'),
    description: getScoreDescription('Creativity', creatScore),
    metrics: [
      { title: 'Relaxation Score', body: getMetricBody('Relaxation Score', creatScore >= 1 ? 1 : 0), value: 'Value: 12.5' },
      { title: 'Focus Score (Theta:Beta)', body: getMetricBody('Focus Score (Theta:Beta)', creatScore >= 2 ? 1 : 0), value: 'Value: 1.18' },
      { title: 'Alpha Peak', body: getMetricBody('Alpha Peak', creatScore >= 3 ? 1 : 0), value: 'Value: 10.2 Hz' }
    ],
    references: [
      'Dietrich, A., & Kanso, R. (2010). "A review of EEG, ERP, and neuroimaging studies of creativity and insight." Psychological Bulletin, 136(5), 822-848.',
      'Fink, A., & Benedek, M. (2014). "EEG alpha power and creative ideation." Neuroscience & Biobehavioral Reviews, 44, 111-123.',
      'Beaty, R. E., et al. (2016). "Creative cognition and brain network dynamics." Trends in Cognitive Sciences, 20(2), 87-95.',
      'Jung, R. E., et al. (2013). "The structure of creative cognition in the human brain." Frontiers in Human Neuroscience, 7, 330.',
      'Kaufman, S. B., et al. (2016). "Openness to experience and intellect differentially predict creative achievement." Journal of Personality, 84(2), 222-236.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 20', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 21: Creativity Details =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 21: Creativity Details...');
try {
  generateCognitionPage2(doc, {
    title: 'CREATIVITY',
    description: 'Creativity refers to the brain\'s ability to generate novel ideas, think divergently, and connect unrelated concepts in innovative ways. It is closely linked to right-brain activity and requires a balance between structured thought (left brain) and fluid, free-associative thinking (right brain). Creativity plays a vital role in problem-solving, adaptability, and personal expression.',
    highCognition: {
      title: 'High Creativity Levels',
      paragraphs: [
        'Individuals with high creativity scores exhibit strong divergent thinking, allowing them to generate multiple solutions to a problem.',
        'They tend to excel in innovation, artistic expression, and flexible thinking.'
      ],
      implications: [
        'High creativity supports problem-solving by encouraging unique perspectives and out-of-the-box thinking.',
        'These individuals are more adaptable, as they can approach challenges with flexibility and innovation.',
        'Creative thinkers often thrive in dynamic environments where new ideas and perspectives are valued.'
      ]
    },
    lowCognition: {
      title: 'Low Creativity Levels',
      paragraphs: [
        'A lower creativity score may indicate difficulty in approaching problems from multiple angles or generating new ideas.',
        'These individuals may rely more on structured, rule-based thinking and struggle with abstract or open-ended tasks.'
      ],
      implications: [
        'Low creativity may lead to rigid problem-solving, making it harder to adapt to new challenges.',
        'These individuals may find brainstorming and conceptualizing new ideas difficult.',
        'Limited creative expression can result in frustration in artistic or idea-driven tasks.'
      ]
    },
    howToImprove: [
      'No-input time: 15mins/day with no phone for emergence of creativity.',
      'Creative switch: Change environment (cafe/nature) once a week for fresh thinking.',
      'Two-mode rule: Brainstorm messy first → edit later (never both at once).'
    ],
    references: []
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 21', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 22: Peak Alpha =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 22: Peak Alpha...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('PEAK ALPHA'),
    pillBarScale: getSubParamPillScale('PEAK ALPHA'),
    title: 'PEAK ALPHA',
    description: 'Peak alpha refers to the dominant frequency of alpha waves in the brain. Alpha waves (typically in the 8-12 Hz range) are associated with relaxation, mental clarity, and efficient cognitive processing. Peak alpha activity is a strong indicator of an individual\'s ability to learn, retain information, and transition between focused and relaxed mental states. When alpha waves are well-regulated, individuals experience enhanced problem-solving abilities and improved mental agility.',
    highCognition: {
      title: 'High Peak Alpha Activation',
      paragraphs: [
        'Individuals with optimal peak alpha function tend to learn quickly, comprehend information efficiently, and demonstrate mental flexibility.',
        'They can easily switch between deep focus and relaxation, allowing for balanced cognitive engagement.'
      ],
      implications: [
        'High peak alpha activation supports rapid learning and efficient information processing.',
        'Individuals with strong peak alpha function exhibit increased creativity and problem-solving skills.',
        'A well-regulated alpha state promotes resilience to stress and enhances emotional stability.'
      ]
    },
    lowCognition: {
      title: 'Low Peak Alpha Activation',
      paragraphs: [
        'Low peak alpha levels may indicate difficulties with information retention, slower cognitive processing, and struggles with transitioning between tasks.',
        'These individuals may experience mental fatigue more easily and find it challenging to stay in a state of relaxed focus.'
      ],
      implications: [
        'Slow peak alpha activity can result in sluggish cognitive performance and decreased mental agility.',
        'Low peak alpha is associated with higher stress levels and difficulty entering relaxed but alert states.',
        'Individuals may struggle to efficiently absorb new information, affecting academic and professional performance.'
      ]
    },
    howToImprove: [
      'Mindfulness and Meditation: Practicing meditation or guided visualization can enhance alpha wave production.',
      'Binaural Beats and Neuro feedback: Using brainwave entrainment tools can help optimize peak alpha activity.',
      'Engage in Flow Activities: Creative tasks, light exercise, and engaging hobbies can naturally enhance alpha waves.',
      'Improve Sleep Quality: Deep, restorative sleep supports optimal alpha wave function and mental clarity.'
    ],
    references: [
      'Arns, Martijn, et al. "A Decade of EEG Theta/Beta Ratio Research in ADHD: a Meta-Analysis." Sage Journals, 2012, https://journals.sagepub.com/doi/10.1177/1087054712460087.',
      'Clarkea, Adam R, et al. "Age and Sex Effects in the EEG: Development of the Normal Child." Clinical Neurophysiology, Elsevier, 27 Apr. 2001, https://www.sciencedirect.com/science/article/abs/pii/S1388245701004886.',
      'Gold, Christian, et al. "Validity and Reliability of Electroencephalographic Frontal Alpha Asymmetry and Frontal Midline Theta as Biomarkers for Depression." Wiley Online Library, 2012, https://onlinelibrary.wiley.com/doi/full/10.1111/sjop.12022.',
      'Kementrian Riset, Teknologi Dan Pendidikan Tinggi. "Electroencephalogram (EEG) Stress Analysis on Alpha/Beta Ratio and Theta/Beta Ratio." Garuda, Jan. 2020, https://garuda.kemdikbud.go.id/documents/detail/1669212.',
      'Picken, Christie, et al. "The Theta/Beta Ratio as an Index of Cognitive Processing in Adults with the Combined Type of Attention Deficit Hyperactivity Disorder." Sage Journals, 3 Dec. 2019, https://journals.sagepub.com/doi/10.1177/1550059419895142.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 22', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 23: Excessive Delta =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 23: Excessive Delta...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('EXCESSIVE DELTA'),
    pillBarScale: getSubParamPillScale('EXCESSIVE DELTA'),
    title: 'EXCESSIVE DELTA',
    description: 'Delta waves are the slowest brainwaves (typically in the 0.5-4 Hz range) and are most prominent during deep sleep and restorative states. A value below 20 is ideal, anything above is excessive. While essential for rest and recovery, excessive delta activity during waking hours can indicate cognitive sluggishness, brain fog, and difficulty maintaining alertness. A balance of delta waves is crucial for optimal cognitive performance, as too much activity can interfere with concentration and problem-solving abilities.',
    highCognition: {
      title: 'High Delta Activity',
      paragraphs: [
        'Individuals with excessive delta activity in awake states may struggle with mental clarity, slow reaction times, and difficulty sustaining attention.',
        'This condition can result from sleep deprivation, chronic stress, or underlying neurological imbalances.'
      ],
      implications: [
        'High delta activity during the day can lead to excessive drowsiness, poor focus, and a sense of mental fog.',
        'Cognitive processing speeds are slowed, making it challenging to follow conversations, absorb information, or engage in complex thinking.',
        'Excessive delta may indicate deeper issues such as poor sleep hygiene, chronic fatigue, or emotional exhaustion.'
      ]
    },
    lowCognition: {
      title: 'Low Delta Activity',
      paragraphs: [
        'While too much delta activity is undesirable during wakefulness, very low delta activity can indicate insufficient deep sleep or poor brain recovery processes.',
        'This can result in reduced memory retention and increased stress levels.'
      ],
      implications: [
        'Individuals with low delta waves may experience difficulty with emotional regulation and feel mentally fatigued despite sufficient sleep.',
        'A lack of restorative sleep cycles can impact immune function, physical health, and cognitive efficiency.',
        'Memory consolidation may be impaired, leading to forgetfulness and difficulty learning new information.'
      ]
    },
    howToImprove: [
      'Optimize Sleep Quality: Maintain a consistent sleep schedule and create a bedtime routine to enhance deep sleep.',
      'Reduce Screen Time Before Bed: Limit exposure to blue light from screens to promote natural delta wave production.',
      'Practice Deep Relaxation Techniques: Engage in activities such as yoga, deep breathing, and guided meditation to naturally regulate delta wave activity.',
      'Improve Nutrition and Hydration: Proper hydration and a balanced diet rich in magnesium and melatonin-supporting nutrients can promote healthy delta wave activity.'
    ],
    references: [
      'Frohlich, J., Toker, D., & Mon_, M. M. (2021). Consciousness among delta waves: a paradox?. Brain, 144(8), 2257-2277. https://academic.oup.com/brain/article/144/8/2257/6164959?login=false',
      'Penolazzi, B., Spironelli, C., & Angrilli, A. (2008). Delta EEG activity as a marker of dysfunctional linguistic processing in developmental dyslexia. Psychophysiology, 45(6), 1025-1033. https://onlinelibrary.wiley.com/doi/10.1111/j.1469-8986.2008.00709.x'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 23', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 24: Arousal Score =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 24: Arousal Score...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('AROUSAL SCORE'),
    pillBarScale: getSubParamPillScale('AROUSAL SCORE'),
    title: 'AROUSAL SCORE',
    description: 'Arousal refers to the brain\'s level of activation and alertness, which plays a crucial role in cognitive performance, emotional regulation, and overall well-being. Arousal score optimum is less than 1, anything above this score is heightened arousal. Stress and arousal are closely linked; an optimal level of arousal supports motivation and engagement, while excessive stress impairs cognitive function. The arousal score measures how well an individual manages their stress response and whether their nervous system is in a state of balance.',
    highCognition: {
      title: 'High Arousal (Excessive Stress)',
      paragraphs: [
        'Individuals with high arousal scores experience heightened alertness but may also struggle with anxiety, restlessness, and difficulty relaxing.',
        'While a certain level of stress is beneficial for productivity, excessive arousal can interfere with cognitive efficiency and emotional stability.'
      ],
      implications: [
        'High stress levels can lead to overstimulation, making it difficult to focus on tasks and regulate emotions.',
        'Chronic stress can cause physical symptoms such as muscle tension, headaches, and fatigue.',
        'Overactive stress responses may impair memory recall and decision-making abilities.'
      ]
    },
    lowCognition: {
      title: 'Low Arousal (Under stimulated)',
      paragraphs: [
        'On the other end of the spectrum, low arousal levels can cause fatigue, low motivation, and disengagement from activities.',
        'These individuals may struggle to maintain energy throughout the day and find it difficult to stay focused on tasks.'
      ],
      implications: [
        'Reduced cognitive alertness may lead to slower reaction times and difficulties with problem-solving.',
        'Low arousal can contribute to feelings of sluggishness and a lack of drive to complete tasks.',
        'Chronic under-stimulation can lead to feelings of apathy, reducing motivation for personal and professional growth.'
      ]
    },
    howToImprove: [
      'For High Arousal (Over-Stimulation):\n  \u2022 Engage in progressive muscle relaxation or guided meditation to lower cortisol levels.\n  \u2022 Implement structured relaxation techniques such as deep breathing or visualization exercises.\n  \u2022 Limit caffeine intake and establish a bedtime routine to avoid excessive nervous system stimulation.',
      'For Low Arousal (Under-Stimulation):\n  \u2022 Increase physical movement, such as brisk walking or short bursts of exercise, to boost energy levels.'
    ],
    references: [
      'Clarke, A. R., Barry, R. J., Dupuy, F. E., McCarthy, R., Selikowitz, M., & Johnstone, S. J. (2013). Excess beta activity in the EEG of children with attention-deficit/hyperactivity disorder: a disorder of arousal? International Journal of Psychophysiology, 89(3), 314-319. https://pubmed.ncbi.nlm.nih.gov/23619205/',
      'Garate, E., Maureira, F., & Flores, E. (2022a). Hurst entropy profiles for Beta Low and Beta High EEG sub-bands Part. I: Intragroup comparison. Procedia Computer Science, 199, 1416-1423. https://www.sciencedirect.com/science/article/pii/S1877050922001806?via%3Dihub',
      'Garate, E., Maureira, F., & Flores, E. (2022b). Hurst entropy profiles for Beta Low and Beta High EEG sub-bands II: Intergroup comparison. Procedia Computer Science, 199, 1424-1431. https://www.researchgate.net/publication/356755214_Hurst_entropy_profiles_for_Beta_Low_and_Beta_High_EEG_sub-bands_II_Intergroup_comparison'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 24', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 25: Focus and Attention (Sub-parameter) =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 25: Focus and Attention (Sub-param)...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('FOCUS AND ATTENTION'),
    pillBarScale: getSubParamPillScale('FOCUS AND ATTENTION'),
    title: 'FOCUS AND ATTENTION',
    description: 'Focus and attention are crucial for cognitive performance, learning, and productivity. Focus & Attention score should be less than 1.5. A score above this reflects poor focus and attention. These metrics measure how well an individual can maintain concentration on a task, resist distractions, and sustain mental effort over time. Attention is influenced by multiple brainwave states, particularly beta waves (linked to active thinking) and theta waves (associated with focus in deep concentration). An optimal balance between these waves ensures sustained attention and information retention.',
    highCognition: {
      title: 'High Focus + Attention',
      paragraphs: [
        'Individuals with high attention scores can concentrate for extended periods, absorb new information efficiently, and exhibit strong executive functioning skills.',
        'They tend to be more productive and can manage cognitive demands without excessive fatigue.'
      ],
      implications: [
        'High-attention individuals can complete complex tasks efficiently, making them effective learners and problem solvers.',
        'Their ability to resist distractions leads to better academic and professional performance.',
        'They tend to have a greater working memory capacity, allowing them to process and recall information quickly.'
      ]
    },
    lowCognition: {
      title: 'Low Focus + Attention',
      paragraphs: [
        'Low attention levels can manifest as distractibility, difficulty sustaining effort on tasks, and frequent cognitive fatigue.',
        'Individuals with low focus scores may struggle with task completion, procrastination, and inefficiency in their work.'
      ],
      implications: [
        'Difficulty focusing can lead to frustration, reduced academic performance, and slower information retention.',
        'These individuals may find it harder to stay engaged in long conversations or complex problem-solving activities.',
        'A lack of sustained attention may contribute to frequent mistakes or overlooked details in tasks.'
      ]
    },
    howToImprove: [
      'Pomodoro Technique: Implement structured work and rest intervals (e.g., 25 minutes of focus followed by a 5-minute break) to train sustained attention.',
      'Mindfulness & Meditation: Practicing mindfulness strengthens the brain\'s ability to filter out distractions and sustain focus.',
      'Physical Exercise: Aerobic activities improve blood flow to the brain, supporting cognitive functions related to attention.',
      'Dietary Adjustments: Consuming omega-3 fatty acids, B vitamins, and hydration can enhance brain function and improve attention regulation.'
    ],
    references: [
      'Hermens, D. F., Soei, E. X., Clarke, S. D., Kohn, M. R., Gordon, E., & Williams, L. M. (2005). Resting EEG theta activity predicts cognitive performance in attention-deficit hyperactivity disorder. Pediatric Neurology, 32(4), 248-256. https://doi.org/10.1016/j.pediatrneurol.2004.11.009',
      'Strijkstra, A. M., Beersma, D. G., Drayer, B., Halbesma, N., & Daan, S. (2003). Subjective sleepiness correlates negatively with global alpha (8-12 Hz) and positively with central frontal theta (4-8 Hz) frequencies in the human resting awake electroencephalogram. Neuroscience Letters, 340(1), 17-20. https://doi.org/10.1016/s0304-3940(03)00033-8'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 25', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 26: Relaxation Score =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 26: Relaxation Score...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('RELAXATION SCORE'),
    pillBarScale: getSubParamPillScale('RELAXATION SCORE'),
    title: 'RELAXATION SCORE',
    description: 'The ability to maintain a calm and relaxed state play a critical role in mental health, stress resilience, and overall well-being. A value above 8 is healthy, anything below reflects poor relaxation ability. Calmness is associated with increased alpha waves, which promote relaxation without inducing drowsiness. A well-regulated nervous system supports emotional balance, improved sleep, and better cognitive function.',
    highCognition: {
      title: 'High Relaxation Score',
      paragraphs: [
        'Individuals with high relaxation scores demonstrate strong emotional regulation, reduced stress responses, and better cognitive performance.',
        'They can navigate challenges with clarity and patience, maintaining focus even under pressure.'
      ],
      implications: [
        'These individuals experience less emotional reactivity, making them resilient in high-stress situations.',
        'High calmness is linked to better heart rate variability (HRV), indicating strong autonomic nervous system regulation.',
        'They can engage in deep, restorative sleep, further supporting cognitive function and emotional well-being.'
      ]
    },
    lowCognition: {
      title: 'Low Relaxation Score',
      paragraphs: [
        'Low relaxation score are associated with chronic stress, increased anxiety, and difficulty maintaining mental clarity.',
        'These individuals may struggle to regulate emotions effectively, leading to heightened frustration and cognitive fatigue.'
      ],
      implications: [
        'Increased cortisol levels due to chronic stress can impair memory and executive functioning.',
        'Low calmness can contribute to difficulty sleeping, leading to further cognitive impairments and emotional instability.',
        'Individuals with low relaxation scores may experience frequent overwhelm, making it harder to focus and complete tasks efficiently.'
      ]
    },
    howToImprove: [
      'Deep Breathing Exercises: Practices like diaphragmatic breathing and box breathing activate the parasympathetic nervous system, reducing stress responses.',
      'Yoga & Stretching: Engaging in physical relaxation techniques helps lower stress hormones and increase body awareness.',
      'Guided Meditation & Progressive Muscle Relaxation: These techniques train the brain to enter a relaxed state more efficiently, improving overall calmness.',
      'Nature Exposure: Spending time in green spaces or near water has been shown to reduce stress hormones and promote relaxation.'
    ],
    references: [
      'Attar, E. T. (2022). Review of electroencephalography signals approaches for mental stress assessment. Neurosciences (Riyadh, Saudi Arabia), 27(4), 209-215. https://doi.org/10.17712/nsj.2022.4.20220025',
      'Nicholson, A. A., Densmore, M., Frewen, P. A., Neufeld, R. W. J., Theberge, J., Jetly, R., Lanius, R. A., & Ros, T. (2023). Homeostatic normalization of alpha brain rhythms within the default-mode network and reduced symptoms in post-traumatic stress disorder following a randomized controlled trial of electroencephalogram neurofeedback. Brain Communications, 5(2), fcad068. https://doi.org/10.1093/braincomms/fcad068'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 26', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 27: Regeneration and Repair Score =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 27: Regeneration and Repair Score...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('REGENERATION AND REPAIR SCORE'),
    pillBarScale: getSubParamPillScale('REGENERATION AND REPAIR SCORE'),
    title: 'REGENERATION AND REPAIR SCORE',
    description: 'Regeneration refers to the brain\'s ability to recover from cognitive fatigue and restore optimal function. A value above 30 is healthy and anything below reflects poor regeneration. It involves processes such as sleep, relaxation, and mental downtime, which are essential for memory consolidation and sustained cognitive performance. Without proper regeneration, cognitive efficiency declines, leading to mental exhaustion and burnout.',
    highCognition: {
      title: 'High Regeneration Ability',
      paragraphs: [
        'Individuals with strong regenerative capabilities can recover quickly from cognitive strain, maintaining sustained focus and performance over long periods.',
        'They experience higher energy levels and better mental clarity.'
      ],
      implications: [
        'High regeneration supports consistent cognitive performance and prevents burnout.',
        'These individuals experience fewer mental blocks and sustain motivation over extended periods.',
        'Strong regenerative processes enhance learning and memory retention.'
      ]
    },
    lowCognition: {
      title: 'Low Regeneration Ability',
      paragraphs: [
        'Poor regenerative capacity can lead to cognitive fatigue, decreased motivation, and impaired memory retention.',
        'Individuals may feel mentally sluggish and struggle to maintain prolonged focus.'
      ],
      implications: [
        'Mental exhaustion may cause difficulty in learning, problem-solving, and maintaining attention.',
        'Chronic cognitive fatigue can contribute to stress, irritability, and decreased productivity.',
        'Poor regeneration negatively impacts emotional resilience and overall mental well-being.'
      ]
    },
    howToImprove: [
      'Prioritize Quality Sleep: Establish a consistent sleep schedule and practice good sleep hygiene to support brain recovery.',
      'Incorporate Rest Periods: Use techniques like power naps and brain breaks to prevent mental fatigue.',
      'Practice Mindfulness and Relaxation Techniques: Activities such as meditation and yoga can help accelerate cognitive recovery.',
      'Engage in Leisure Activities: Pursuing hobbies, listening to music, or spending time in nature can help reset the brain and enhance mental clarity.'
    ],
    references: [
      'Xie, L., et al. (2013). "Sleep drives metabolite clearance from the adult brain." Science, 342(6156), 373-377.',
      'Tononi, G., & Cirelli, C. (2014). "Sleep and the price of plasticity." Neuron, 81(1), 12-34.',
      'Diekelmann, S., & Born, J. (2010). "The memory function of sleep." Nature Reviews Neuroscience, 11(2), 114-126.',
      'Rasch, B., & Born, J. (2013). "About sleep\'s role in memory." Physiological Reviews, 93(2), 681-766.',
      'Walker, M. P. (2017). "Why We Sleep: Unlocking the Power of Sleep and Dreams." Scribner.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 27', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 28: Asymmetry Eye Open =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 28: Asymmetry Eye Open...');
try {
  generateCognitionPage2(doc, {
    showPillBar: true,
    pillBarScore: getSubParamPillScore('ASYMMETRY EYE OPEN'),
    pillBarScale: getSubParamPillScale('ASYMMETRY EYE OPEN'),
    title: 'ALPHA ASYMMETRY',
    description: 'Alpha Asymmetry refers to the difference in alpha brainwave activity between the left and right frontal regions when the eyes are closed. This parameter provides insight into emotional style, motivation patterns, and approach-avoidance tendencies. Balanced alpha activity between hemispheres supports emotional stability, motivation, and adaptive responses.',
    highCognition: {
      title: 'Left Alpha Asymmetry',
      paragraphs: [
        'The left frontal cortex is strongly associated with positive affect, motivation, and goal-directed behavior.',
        'When asymmetry reflects reduced left-frontal activation, it may influence mood regulation and drive.'
      ],
      implications: [
        'May be linked with low mood, reduced motivation, or decreased enthusiasm.',
        'Slower task initiation and lower reward responsiveness.',
        'Can contribute to emotional withdrawal or reduced engagement in challenging situations.'
      ]
    },
    lowCognition: {
      title: 'Right Alpha Asymmetry',
      paragraphs: [
        'The right frontal cortex is closely associated with emotional vigilance, stress response, and threat monitoring.',
        'When asymmetry favors right-sided dysregulation, it may reflect heightened emotional reactivity and anxiety tendency.'
      ],
      implications: [
        'May present as overthinking, worry, or heightened sensitivity to stress.',
        'Increased vigilance and difficulty "switching off" the mind under pressure.',
        'Can contribute to restlessness, anticipatory anxiety, or stress-driven decision patterns.'
      ]
    },
    howToImprove: [
      'Breath regulation practices (slow exhalation breathing / alternate nostril breathing) to calm right-sided anxiety activation.',
      'Goal activation training (small, structured task-start routines) to strengthen left frontal engagement.',
      'Mindfulness and emotional labeling to improve limbic-frontal integration.',
      'Alpha-based neuro feedback or HRV coherence training for improving hemispheric balance.'
    ],
    references: [
      'Davidson, R. J. (2004). "What does the prefrontal cortex do in affect: perspectives on frontal EEG asymmetry research." Biological Psychology, 67(1-2), 219-234.',
      'Harmon-Jones, E., & Gable, P. A. (2018). "On the role of asymmetric frontal cortical activity in approach and withdrawal motivation." Psychophysiology, 55(1), e12879.',
      'Coan, J. A., & Allen, J. J. (2004). "Frontal EEG asymmetry as a moderator and mediator of emotion." Biological Psychology, 67(1-2), 7-50.',
      'Allen, J. J., et al. (2004). "The stability of resting frontal electroencephalographic asymmetry in depression." Psychophysiology, 41(2), 269-280.',
      'Reznik, S. J., & Allen, J. J. (2018). "Frontal asymmetry as a mediator and moderator of emotion." Biological Psychology, 137, 74-84.'
    ]
  });
} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 28', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

// ===== Page 29: Back Cover — Contact Page =====
doc.addPage({ size: 'A4', margin: 0 });
console.log('   Drawing Page 29: Back Cover...');
try {
  var pw = 595.28;
  var ph = 841.89;

  // White background
  doc.rect(0, 0, pw, ph).fill('#FFFFFF');

  // NeuroSense Logo Group — Figma: X:137, Y:241, W:321.45, H:218
  var logoGroupX = 137;
  var logoGroupY = 241;
  var logoGroupW = 321.45;
  var logoGroupH = 218;

  // Logo image (already includes "NeuroSense" text + brain icon + tagline)
  var logoImgW = 300;
  var logoImgX = logoGroupX + (logoGroupW - logoImgW) / 2;
  var logoImgY = logoGroupY;
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, logoImgX, logoImgY, { width: logoImgW });
  }

  // ===== Contact Card — Figma: X:135, Y:474, W:322, H:200, R:13 =====
  var cardX = 135;
  var cardY = 474;
  var cardW = 322;
  var cardH = 200;
  var cardR = 13;

  // Outer glow / shine
  doc.save();
  doc.roundedRect(cardX - 3, cardY - 3, cardW + 6, cardH + 6, cardR + 2)
     .fillColor('#A8C8FF').fillOpacity(0.12).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Drop shadow
  doc.save();
  doc.roundedRect(cardX + 2, cardY + 3, cardW, cardH, cardR)
     .fillColor('#000000').fillOpacity(0.08).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Card fill — white background
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, cardR)
     .fillColor('#FFFFFF').fill();
  doc.restore();

  // Shine gradient — top highlight
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH * 0.4, cardR)
     .fillColor('#FFFFFF').fillOpacity(0.6).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Glass frosted overlay
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, cardR)
     .fillColor('#EDF2FF').fillOpacity(0.25).fill();
  doc.fillOpacity(1);
  doc.restore();

  // Shine border — bright edge
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, cardR)
     .strokeColor('#E0E6F0').lineWidth(0.5).stroke();
  doc.restore();

  // Inner shine line — top edge highlight
  doc.save();
  doc.roundedRect(cardX + 4, cardY + 3, cardW - 8, 1.5, 1)
     .fillColor('#FFFFFF').fillOpacity(0.7).fill();
  doc.fillOpacity(1);
  doc.restore();

  // "If You Have More Questions" + "Get In Touch" — centered, bold, dark
  doc.save();
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#227AFF')
     .text('If You Have More Questions', cardX, cardY + 20, { width: cardW, align: 'center' });
  doc.restore();

  doc.save();
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#227AFF')
     .text('Get In Touch', cardX, cardY + 44, { width: cardW, align: 'center' });
  doc.restore();

  // ===== Social media icons — 3 PNG images, centered horizontally =====
  var ICON_YT    = path.join(__dirname, '../public/assets/Frame 427321220.png');
  var ICON_INSTA = path.join(__dirname, '../public/assets/Frame 427321219.png');
  var ICON_EMAIL = path.join(__dirname, '../public/assets/Frame 427321214.png');
  var iconSize = 36;
  var iconGap = 16;
  var totalIconsW = iconSize * 3 + iconGap * 2;
  var iconsStartX = cardX + (cardW - totalIconsW) / 2;
  var iconY = cardY + 80;

  // Email icon (left) — with mailto link
  try { if (fs.existsSync(ICON_EMAIL)) doc.image(ICON_EMAIL, iconsStartX, iconY, { width: iconSize, height: iconSize, link: 'mailto:limitlessbrainlab@gmail.com' }); } catch(e) {}

  // Instagram icon (center) — with link
  var instaX = iconsStartX + iconSize + iconGap;
  try { if (fs.existsSync(ICON_INSTA)) doc.image(ICON_INSTA, instaX, iconY, { width: iconSize, height: iconSize, link: 'https://www.instagram.com/drsweta.adatia/?hl=en' }); } catch(e) {}

  // YouTube icon (right) — with link
  var ytX = iconsStartX + 2 * (iconSize + iconGap);
  try { if (fs.existsSync(ICON_YT)) doc.image(ICON_YT, ytX, iconY, { width: iconSize, height: iconSize, link: 'https://www.youtube.com/@drsweta.adatia' }); } catch(e) {}

  // ===== Phone number — Frame 10.png as pill + number text =====
  var PHONE_ICON = path.join(__dirname, '../public/assets/Frame 10.png');
  var pillW = 210;
  var pillH = 40;
  var pillX = cardX + (cardW - pillW) / 2;
  var pillY = cardY + 138;

  // Frame 10.png as the pill background — with tel: link
  try { if (fs.existsSync(PHONE_ICON)) doc.image(PHONE_ICON, pillX, pillY, { width: pillW, height: pillH, link: 'tel:+971585602551' }); } catch(e) {}

  // Phone number text — white bold, vertically centered
  doc.save();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
     .text('+971 58 560 2551', pillX, pillY + (pillH - 13) / 2, { width: pillW, align: 'center', link: 'tel:+971585602551' });
  doc.restore();

} catch (e) {
  console.error('   Error:', e.message, e.stack);
}
// Footer
doc.rect(0, 800, 595, 42).fill('#227aff');
doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
   .text('Report generated on: 25/02/2026, 12:00 pm', 30, 807, { width: 535, align: 'left', lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('Page 29', 30, 807, { width: 535, align: 'right', lineBreak: false });
doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
   .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, 820, { lineBreak: false });
doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
   .text('limitlessbrainlab-eight.vercel.app', 30, 820, { width: 535, align: 'right', lineBreak: false });

doc.end();

stream.on('finish', () => {
  console.log('\nPDF saved to:', outPath);
  console.log('File size:', (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB');
});
