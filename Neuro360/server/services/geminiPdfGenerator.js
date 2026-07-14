const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const GeminiService = require('./geminiService');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const {
  generateBrainMarkersPage,
  generateParameterDetailPage,
  COGNITION_PAGE_DATA
} = require('./pdf/staticPages');
const { generateBrainwaveProfilesPage } = require('./pdf/brainwaveProfilesPage');
const { generateBrainMapComparisonPageSync, generateBrainMapComparisonPage } = require('./pdf/brainMapComparisonPage');
const { generateCoverPage, formatDateDDMMYYYY } = require('./pdf/coverPage');
const { generateCongratulationsPage } = require('./pdf/congratulationsPage');
const { generateIntroductionPage } = require('./pdf/introductionPage');
const { generateYourNumbersPage, generateYourNumbersPageAsync } = require('./pdf/yourNumbersPage');
const { generateCognitionPage, generateCognitionPage2 } = require('./pdf/cognitionPage');

// AI Service: Only Gemini
const AI_SERVICE = 'gemini';

// Parameter Detail Data for all 7 parameters
const PARAMETER_DETAIL_DATA = {
  cognition: {
    title: 'COGNITION - DETAILED ANALYSIS',
    highTitle: 'High Cognition',
    highDesc: 'High cognitive function indicates quick information processing and strong problem-solving skills. Individuals demonstrate excellent working memory capacity and can efficiently integrate new knowledge into existing frameworks.',
    highImplications: [
      'Quick learning enables efficiency in academic and professional settings.',
      'Strong reasoning skills allow for better judgment and decision-making.',
      'Mental agility helps switch between tasks smoothly and adapt to new situations.'
    ],
    lowTitle: 'Low Cognition',
    lowDesc: 'Low cognitive function may manifest as memory difficulties and slower processing speeds. Individuals may find it harder to grasp new concepts or retain key details in conversations and learning environments.',
    lowImplications: [
      'Difficulty processing information may lead to frustration in learning environments.',
      'Poor working memory makes it harder to follow multi-step instructions.',
      'Reduced cognitive efficiency can impact problem-solving and task completion times.'
    ],
    improvements: [
      { title: 'Cognitive Training:', desc: 'Engage in brain-training games like Sudoku, chess, or logic puzzles.' },
      { title: 'Active Learning:', desc: 'Use spaced repetition and hands-on problem-solving techniques.' },
      { title: 'Physical Activity:', desc: 'Regular aerobic exercise enhances cognitive function.' },
      { title: 'Healthy Diet:', desc: 'Consume omega-3 fatty acids, antioxidants, and complex carbohydrates.' }
    ],
    references: [
      'Klimesch, W. (1999). "EEG alpha and theta oscillations reflect cognitive and memory performance." Brain Research Reviews, 29(2-3), 169-195.',
      'Gruber, M. J., et al. (2014). "States of curiosity modulate hippocampus-dependent learning via the dopaminergic circuit." Neuron, 84(2), 486-496.',
      'Doppelmayr, M., et al. (2005). "EEG alpha power and intelligence." Intelligence, 33(1), 35-46.',
      'Stern, Y. (2009). "Cognitive reserve." Neuropsychologia, 47(10), 2015-2028.',
      'Jaeggi, S. M., et al. (2008). "Improving fluid intelligence with training on working memory." PNAS, 105(19), 6829-6833.'
    ]
  },
  stress: {
    title: 'STRESS - DETAILED ANALYSIS',
    highTitle: 'Strong Stress Regulation',
    highDesc: 'Individuals with strong stress regulation can handle pressure without feeling overwhelmed.\n\nTheir brain efficiently activates and deactivates stress responses, allowing them to stay calm, focused, and productive even in demanding situations. They recover well after challenges and maintain emotional balance.',
    highImplications: [
      'Effective stress regulation supports sustained focus, decision-making, and emotional stability.',
      'These individuals adapt better to change and perform consistently under pressure.',
      'Balanced stress responses enhance resilience, learning capacity, and overall mental well-being.'
    ],
    lowTitle: 'Weak Stress Regulation',
    lowDesc: 'Individuals with weak stress regulation may experience prolonged or intense stress responses.\n\nThe brain remains in a heightened alert state, leading to mental fatigue, emotional reactivity, or shutdown. This can interfere with thinking clarity, motivation, and recovery.',
    lowImplications: [
      'Chronic stress may lead to anxiety, irritability, low motivation, or mental exhaustion.',
      'Prolonged stress can impair memory, attention, and learning efficiency.',
      'Poor stress regulation may affect sleep, emotional control, and physical health over time.'
    ],
    improvements: [
      { title: 'Daily reset:', desc: '10-15 minutes of slow breathing, mindfulness, or quiet reflection to calm the nervous system.' },
      { title: 'Stress boundaries:', desc: 'Limit continuous multitasking and schedule short recovery breaks during the day.' },
      { title: 'Body regulation:', desc: 'Regular movement such as walking, stretching, or light exercise to release stored stress.' },
      { title: 'Recovery routine:', desc: 'Prioritize sleep, reduce late-day stimulation, and maintain consistent daily rhythms.' }
    ],
    references: [
      'Arnsten, A. F. (2009). "Stress signalling pathways that impair prefrontal cortex structure and function." Nature Reviews Neuroscience, 10(6), 410-422.',
      'McEwen, B. S. (2007). "Physiology and neurobiology of stress and adaptation: central role of the brain." Physiological Reviews, 87(3), 873-904.',
      'Lupien, S. J., et al. (2009). "Effects of stress throughout the lifespan on the brain, behaviour and cognition." Nature Reviews Neuroscience, 10(6), 434-445.',
      'Juster, R. P., McEwen, B. S., & Lupien, S. J. (2010). "Allostatic load biomarkers of chronic stress." Neuroscience & Biobehavioral Reviews, 35(1), 2-16.',
      'Hermans, E. J., et al. (2014). "Stress-related noradrenergic activity prompts large-scale neural network reconfiguration." Science, 334(6059), 1151-1153.'
    ]
  },
  'focus & attention': {
    title: 'FOCUS AND ATTENTION - DETAILED ANALYSIS',
    highTitle: 'High Focus & Attention',
    highDesc: 'Individuals with high attention scores can concentrate for extended periods, absorb new information efficiently, and exhibit strong executive functioning skills. They tend to be more productive and can manage cognitive demands without excessive fatigue.',
    highImplications: [
      'High-attention individuals can complete complex tasks efficiently, making them effective learners and problem solvers.',
      'Their ability to resist distractions leads to better academic and professional performance.',
      'They tend to have a greater working memory capacity, allowing them to process and recall information quickly.'
    ],
    lowTitle: 'Low Focus & Attention',
    lowDesc: 'Low attention levels can manifest as distractibility, difficulty sustaining effort on tasks, and frequent cognitive fatigue. Individuals with low focus scores may struggle with task completion, procrastination, and inefficiency in their work.',
    lowImplications: [
      'Difficulty focusing can lead to frustration, reduced academic performance, and slower information retention.',
      'These individuals may find it harder to stay engaged in long conversations or complex problem-solving activities.',
      'A lack of sustained attention may contribute to frequent mistakes and overlooked details in tasks.'
    ],
    improvements: [
      { title: 'Pomodoro Technique:', desc: 'Implement structured work and rest intervals (e.g., 25 minutes of focus followed by a 5-minute break) to train sustained attention.' },
      { title: 'Mindfulness & Meditation:', desc: 'Practicing mindfulness strengthens the brain\'s ability to filter out distractions and sustain focus.' },
      { title: 'Physical Exercise:', desc: 'Aerobic activities improve blood flow to the brain, supporting cognitive functions related to attention.' },
      { title: 'Dietary Adjustments:', desc: 'Consuming omega-3 fatty acids, B vitamins, and hydration can enhance brain function and improve attention regulation.' }
    ],
    references: [
      'Arns, M., et al. (2013). "A Decade of EEG Theta/Beta Ratio Research in ADHD: A Meta-Analysis." Journal of Attention Disorders, 17(5), 374-383.',
      'Egner, T., & Gruzelier, J. H. (2004). "EEG Biofeedback of low beta band components: frequency-specific effects on variables of attention." Clinical Neurophysiology, 115(1), 131-139.',
      'Lubar, J. F. (1991). "Discourse on the development of EEG diagnostics and biofeedback for attention-deficit/hyperactivity disorders." Biofeedback and Self-Regulation, 16(3), 201-225.',
      'Sterman, M. B. (1996). "Physiological origins and functional correlates of EEG rhythmic activities." Psychophysiology, 33(5), 497-519.',
      'Vernon, D. J. (2005). "Can neurofeedback training enhance performance? An evaluation of the evidence." Applied Psychophysiology and Biofeedback, 30(4), 347-364.'
    ]
  },
  'burnout & fatigue': {
    title: 'BURNOUT AND FATIGUE - DETAILED ANALYSIS',
    highTitle: 'High Burnout & Fatigue',
    highDesc: 'Individuals with high burnout and fatigue experience persistent mental and physical exhaustion, reduced motivation, and lower stamina for tasks.\n\nThey may feel overwhelmed easily and find it harder to stay consistent, even with simple routines.',
    highImplications: [
      'Low energy can reduce productivity, making tasks feel heavier and take longer to complete.',
      'Increased stress sensitivity may impact emotional regulation, causing irritability and low resilience.',
      'Fatigue can reduce focus and memory, leading to more mistakes and difficulty staying engaged.'
    ],
    lowTitle: 'Low Burnout & Fatigue',
    lowDesc: 'Individuals with low burnout and fatigue maintain steadier energy levels, recover well after stress, and sustain performance over longer periods.\n\nThey typically manage workload demands without prolonged exhaustion.',
    lowImplications: [
      'Better energy stability supports consistent performance and stronger follow-through on goals.',
      'Improved resilience helps individuals handle pressure without emotional overwhelm.',
      'Stronger focus and recovery make it easier to maintain routines and stay motivated.'
    ],
    improvements: [
      { title: 'Recovery Breaks:', desc: 'Add short resets between tasks (5-10 minutes) to reduce mental load and prevent burnout buildup.' },
      { title: 'Sleep Hygiene:', desc: 'Maintain a consistent sleep schedule and a calming wind-down routine to improve recovery.' },
      { title: 'Energy Pacing:', desc: 'Alternate high-effort tasks with lighter tasks to avoid overloading the brain.' },
      { title: 'Stress Regulation:', desc: 'Use breath work, walking, stretching, or guided relaxation to support nervous system recovery.' }
    ],
    references: [
      'Boksem, M. A., & Tops, M. (2008). "Mental fatigue: Costs and benefits." Brain Research Reviews, 59(1), 125-139.',
      'Wascher, E., et al. (2014). "Frontal theta activity reflects distinct aspects of mental fatigue." Biological Psychology, 96, 57-65.',
      'Lal, S. K., & Craig, A. (2001). "A critical review of the psychophysiology of driver fatigue." Biological Psychology, 55(3), 173-194.',
      'Arnsten, A. F. (2009). "Stress signalling pathways that impair prefrontal cortex structure and function." Nature Reviews Neuroscience, 10(6), 410-422.',
      'Tops, M., & Boksem, M. A. (2012). "What\'s that? What went wrong? Positive and negative surprise and the rostral-Loss posterior gradient in busyness and burnout." Psychophysiology, 49(4), 583-590.'
    ]
  },
  'emotional regulation': {
    title: 'EMOTIONAL REGULATION - DETAILED ANALYSIS',
    highTitle: 'Strong Emotional Regulation',
    highDesc: 'Individuals with strong emotional regulation can experience emotions fully without being overwhelmed by them.\n\nTheir brain efficiently balances emotional reactivity with thoughtful response. They remain composed during challenges and recover quickly after emotional stress.',
    highImplications: [
      'Stable emotional regulation supports clear thinking, confident decision-making, and healthy relationships.',
      'These individuals demonstrate resilience, patience, and adaptability in changing situations.',
      'Strong emotional balance enhances leadership capacity, communication skills, and overall well-being.'
    ],
    lowTitle: 'Weak Emotional Regulation',
    lowDesc: 'Individuals with weak emotional regulation may experience heightened emotional reactivity or emotional shutdown.\n\nThe brain may struggle to balance impulsive responses with rational control, leading to mood swings, irritability, or withdrawal. Emotional recovery after stress may be slower.',
    lowImplications: [
      'Emotional dysregulation can impact focus, judgment, and interpersonal relationships.',
      'Increased reactivity may lead to anxiety, frustration, or low mood.',
      'Difficulty managing emotions may reduce resilience and affect academic, professional, or social functioning.'
    ],
    improvements: [
      { title: 'Daily Awareness practice:', desc: '5-10 minutes of mindful emotional check-ins to identify and label feelings.' },
      { title: 'Breath regulation:', desc: 'Slow breathing techniques to calm limbic activation and restore balance.' },
      { title: 'Response gap training:', desc: 'Pause before reacting; practice reframing situations constructively.' },
      { title: 'Emotional recovery habits:', desc: 'Prioritize sleep, journaling, and supportive conversations to enhance resilience.' }
    ],
    references: [
      'Davidson, R. J. (2004). "What does the prefrontal cortex do in affect: perspectives on frontal EEG asymmetry research." Biological Psychology, 67(1-2), 219-234.',
      'Harmon-Jones, E., & Gable, P. A. (2018). "On the role of asymmetric frontal cortical activity in approach and withdrawal motivation." Psychophysiology, 55(1), e12879.',
      'Coan, J. A., & Allen, J. J. (2004). "Frontal EEG asymmetry as a moderator and mediator of emotion." Biological Psychology, 67(1-2), 7-50.',
      'Gross, J. J. (2015). "Emotion regulation: Current status and future prospects." Psychological Inquiry, 26(1), 1-26.',
      'Etkin, A., Büchel, C., & Gross, J. J. (2015). "The neural bases of emotion regulation." Nature Reviews Neuroscience, 16(11), 693-700.'
    ]
  },
  learning: {
    title: 'LEARNING - DETAILED ANALYSIS',
    highTitle: 'High Learning',
    highDesc: 'Individuals with high learning capacity absorb new information quickly, recognize patterns easily, and apply concepts across different situations.\n\nThey tend to adapt fast, retain what they learn, and improve with feedback.',
    highImplications: [
      'Quick learning improves performance in academic and professional settings where new skills are required.',
      'Strong retention supports better exam outcomes, faster mastery, and more confident decision-making.',
      'High adaptability allows individuals to switch strategies smoothly when challenges or expectations change.'
    ],
    lowTitle: 'Low Learning',
    lowDesc: 'Low learning capacity can show up as slower comprehension, reduced retention, and difficulty applying new concepts in real-life situations.\n\nIndividuals may need more repetition and structure to build confidence and consistency.',
    lowImplications: [
      'Difficulty processing new information may lead to frustration and reduced confidence in learning environments.',
      'Lower retention can make it harder to keep up with instructions, multi-step tasks, or fast-paced lessons.',
      'Challenges with applying concepts can impact problem-solving ability and increase reliance on guidance.'
    ],
    improvements: [
      { title: 'Spaced Repetition:', desc: 'Review key concepts in short intervals across days to strengthen memory.' },
      { title: 'Active Learning:', desc: 'Use practice questions, teach-back methods, and real examples to build understanding.' },
      { title: 'Chunking:', desc: 'Break information into smaller sections with clear headings, summaries, and check-ins.' },
      { title: 'Consistency Routine:', desc: 'Study or practice at the same time daily to train the brain for better recall and focus.' }
    ],
    references: [
      'Klimesch, W. (1999). "EEG alpha and theta oscillations reflect cognitive and memory performance." Brain Research Reviews, 29(2-3), 169-195.',
      'Gruber, M. J., et al. (2014). "States of curiosity modulate hippocampus-dependent learning via the dopaminergic circuit." Neuron, 84(2), 486-496.',
      'Doppelmayr, M., et al. (2005). "EEG alpha power and intelligence." Intelligence, 33(1), 35-46.',
      'Stern, Y. (2009). "Cognitive reserve." Neuropsychologia, 47(10), 2015-2028.',
      'Jaeggi, S. M., et al. (2008). "Improving fluid intelligence with training on working memory." PNAS, 105(19), 6829-6833.'
    ]
  },
  creativity: {
    title: 'CREATIVITY - DETAILED ANALYSIS',
    highTitle: 'High Creativity Levels',
    highDesc: 'Individuals with high creativity scores exhibit strong divergent thinking, allowing them to generate multiple solutions to a problem.\n\nThey tend to excel in innovation, artistic expression, and flexible thinking.',
    highImplications: [
      'High creativity supports problem-solving by encouraging unique perspectives and out-of-the-box thinking.',
      'These individuals are more adaptable, as they can approach challenges with flexibility and innovation.',
      'Creative thinkers often thrive in dynamic environments where new ideas and perspectives are valued.'
    ],
    lowTitle: 'Low Creativity Levels',
    lowDesc: 'A lower creativity score may indicate difficulty in approaching problems from multiple angles or generating new ideas.\n\nThese individuals may rely more on structured, rule-based thinking and struggle with abstract or open-ended tasks.',
    lowImplications: [
      'Low creativity may lead to rigid problem-solving, making it harder to adapt to new challenges.',
      'These individuals may find brainstorming and conceptualizing new ideas difficult.',
      'Limited creative expression can result in frustration in artistic or idea-driven tasks.'
    ],
    improvements: [
      { title: 'No-input time:', desc: '15mins/day with no phone for emergence of creativity.' },
      { title: 'Creative switch:', desc: 'Change environment (cafe/nature) once a week for fresh thinking.' },
      { title: 'Two-mode rule:', desc: 'Brainstorm messy first → edit later (never both at once).' }
    ],
    references: [
      'Dietrich, A., & Kanso, R. (2010). "A review of EEG, ERP, and neuroimaging studies of creativity and insight." Psychological Bulletin, 136(5), 822-848.',
      'Fink, A., & Benedek, M. (2014). "EEG alpha power and creative ideation." Neuroscience & Biobehavioral Reviews, 44, 111-123.',
      'Beaty, R. E., et al. (2016). "Creative cognition and brain network dynamics." Trends in Cognitive Sciences, 20(2), 87-95.',
      'Jung, R. E., et al. (2013). "The structure of creative cognition in the human brain." Frontiers in Human Neuroscience, 7, 330.',
      'Kaufman, S. B., et al. (2016). "Openness to experience and intellect differentially predict creative achievement." Journal of Personality, 84(2), 222-236.'
    ]
  }
};

class GeminiPdfGenerator {
  constructor(patientData, algorithmResults, qeegData, inputPdfPaths = null, parameterNotes = '') {
    this.patientData = patientData;
    this.algorithmResults = algorithmResults;
    this.qeegData = qeegData;
    this.geminiReportData = null;
    this.inputPdfPaths = inputPdfPaths; // { eyesOpen: path, eyesClosed: path }
    this.parameterNotes = parameterNotes || ''; // Channel noisy notes from user

    // Clinic's custom logo (temp PNG resolved by qeegRoutes from
    // clinics.logo_url) — replaces the NeuroSense logo everywhere when set.
    this.clinicLogoPath = (patientData?.clinicLogoPath && fs.existsSync(patientData.clinicLogoPath))
      ? patientData.clinicLogoPath
      : null;
    if (this.clinicLogoPath) console.log('🎨 Report will use clinic logo:', this.clinicLogoPath);

    // Store report generation date/time — prefer the report's original creation
    // timestamp (passed on regeneration) so rebuilt PDFs keep the original date
    let now = patientData?.reportGeneratedAt ? new Date(patientData.reportGeneratedAt) : new Date();
    if (isNaN(now.getTime())) now = new Date();
    this.generatedAt = now.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // Debug: Log received parameterNotes
    console.log('📝 GeminiPdfGenerator: Received parameterNotes:', this.parameterNotes ? `"${this.parameterNotes.substring(0, 50)}..."` : '(empty)');
    console.log('📅 Report generated at:', this.generatedAt);
  }

  /**
   * Transform algorithm results to Gemini input format
   */
  transformToGeminiFormat() {
    const brainParameters = {
      Cognition: null,
      Stress: null,
      FocusAndAttention: null,
      BurnoutAndFatigue: null,
      EmotionalRegulation: null,
      Learning: null,
      Creativity: null
    };

    // Map the parameters from algorithm results
    this.algorithmResults.parameters.forEach(param => {
      const paramName = param.name.replace(/\s+/g, '').replace(/&/g, 'And');
      if (brainParameters.hasOwnProperty(paramName)) {
        brainParameters[paramName] = {
          score: param.score,
          maxScore: param.maxScore,
          bucket: param.bucket || param.classification,
          subparameters: (param.metrics || param.subParameters || []).map(metric => ({
            name: metric.name,
            score: metric.score,
            value: metric.value,
            threshold: metric.threshold
          }))
        };
      }
    });

    return brainParameters;
  }

  /**
   * Generate report structure using configured AI service (Gemini or OpenAI)
   */
  async generateReportStructure() {
    console.log(`\n🤖 === Generating report structure with Gemini ===`);

    const brainParameters = this.transformToGeminiFormat();

    console.log(`📊 INPUT DATA TO GEMINI (Brain Parameters):`);
    Object.keys(brainParameters).forEach(paramKey => {
      const param = brainParameters[paramKey];
      if (param) {
        console.log(`   ${paramKey}: score=${param.score}/${param.maxScore}, bucket=${param.bucket}, subParams=${param.subparameters?.length || 0}`);
      }
    });

    try {
      // Use Gemini service only
      const result = await GeminiService.generateBrainPerformanceReport(brainParameters);

      if (!result.success) {
        console.error(`❌ Gemini API returned error:`, result.error);
        throw new Error(`Gemini failed: ${result.error}`);
      }

      this.geminiReportData = result.data;

      // Merge original algorithm values back into Gemini response
      this.mergeAlgorithmValues();

      console.log(`\n✅ Gemini report structure generated successfully`);
      console.log(`📄 OUTPUT FROM GEMINI (with merged values):`);
      if (this.geminiReportData.parameters) {
        this.geminiReportData.parameters.forEach(param => {
          console.log(`   ${param.name}: score=${param.score}/${param.maxScore}, bucket=${param.bucket}`);
          if (param.subparameters) {
            param.subparameters.forEach(sub => {
              console.log(`      - ${sub.name}: value=${JSON.stringify(sub.value)}`);
            });
          }
        });
      }

      return this.geminiReportData;
    } catch (error) {
      console.error('❌ Error in generateReportStructure:', error.message);
      console.error('   Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Merge original algorithm values into Gemini report data
   * Ensures calculated values are preserved in the PDF
   */
  mergeAlgorithmValues() {
    if (!this.geminiReportData || !this.geminiReportData.parameters) return;

    // Create a lookup map from algorithm results
    const algorithmMap = {};
    this.algorithmResults.parameters.forEach(param => {
      const normalizedName = param.name.toLowerCase().replace(/\s+/g, '').replace(/&/g, 'and');
      algorithmMap[normalizedName] = param;
    });

    // Merge values into Gemini response
    this.geminiReportData.parameters.forEach(geminiParam => {
      const normalizedName = geminiParam.name.toLowerCase().replace(/\s+/g, '').replace(/&/g, 'and');
      const algorithmParam = algorithmMap[normalizedName];

      if (algorithmParam) {
        // Always merge main parameter score, maxScore, and bucket from algorithm
        // Algorithm values are the source of truth — override whatever Gemini returned
        geminiParam.score = algorithmParam.score;
        geminiParam.maxScore = algorithmParam.maxScore;
        geminiParam.bucket = algorithmParam.classification || algorithmParam.bucket || geminiParam.bucket;
        geminiParam.classification = algorithmParam.classification || algorithmParam.bucket || geminiParam.classification;

        if (algorithmParam.metrics) {
          // If Gemini has subparameters, merge values
          if (geminiParam.subparameters) {
            geminiParam.subparameters.forEach((subParam, idx) => {
              if (algorithmParam.metrics[idx]) {
                subParam.value = algorithmParam.metrics[idx].value;
                subParam.score = algorithmParam.metrics[idx].score;
              }
            });
          } else {
            // Create subparameters from algorithm metrics
            geminiParam.subparameters = algorithmParam.metrics.map(metric => ({
              name: metric.name,
              score: metric.score,
              value: metric.value,
              interpretation: metric.description || ''
            }));
          }
        }
      }
    });

    console.log('✅ Algorithm values merged into Gemini report');
  }

  /**
   * Main report generation function
   */
  async generateReport(outputPath) {
    try {
      // Step 1: Try to generate AI report structure with OpenAI
      let usingAI = false;
      try {
        console.log('🤖 Attempting to generate report with OpenAI (using Gemini prompts)...');
        await this.generateReportStructure();
        usingAI = true;
        console.log('✅ OpenAI report structure ready');
      } catch (aiError) {
        console.error('⚠️ OpenAI failed, using fallback data structure');
        console.error('   OpenAI Error:', aiError.message);

        // Fallback: Create basic report structure from algorithm data
        this.geminiReportData = this.createFallbackReportStructure();
        console.log('✅ Fallback report structure created');
      }

      // Step 2: Create PDF from the report structure (AI or fallback)
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true  // Buffer pages for better control
      });

      // PDF document metadata so the browser tab shows the report name (not
      // about:blank) when the downloaded file is opened.
      doc.info.Title = 'NeuroSense Report';
      doc.info.Author = 'Limitless Brain Lab';
      doc.info.Creator = 'Limitless Brain Lab';

      // Clinic's custom logo — carried on the doc so shared page modules
      // (pdfStyles.addPageHeader, coverPage) can swap it in without threading
      // a parameter through every call.
      doc._clinicLogoPath = this.clinicLogoPath || null;

      // Page limiting and blank page prevention
      let pageCount = 1; // First page is auto-created
      const maxPages = 35;
      const originalAddPage = doc.addPage.bind(doc);

      // Track expected pages to detect unwanted blank pages
      const expectedPages = [
        'Cover', 'Introduction', 'Congratulations', 'Brainwave Profiles',
        'Brain Markers', 'Numbers at a Glance', 'Radar Chart',
        'Cognition Gauge', 'Cognition Details',
        'Param Gauge 1', 'Param Details 1', 'Param Gauge 2', 'Param Details 2',
        'Param Gauge 3', 'Param Details 3', 'Param Gauge 4', 'Param Details 4',
        'Param Gauge 5', 'Param Details 5', 'Param Gauge 6', 'Param Details 6',
        'Sub-Param 1', 'Sub-Param 2', 'Sub-Param 3', 'Sub-Param 4',
        'Sub-Param 5', 'Sub-Param 6', 'Sub-Param 7', 'Back Cover'
      ];

      doc.addPage = function() {
        const stack = new Error().stack;

        // Check if this is an unwanted auto-page creation (from LineWrapper)
        if (stack.includes('continueOnNewPage') || stack.includes('LineWrapper')) {
          console.log(`🚫 BLOCKED unwanted auto-page creation (would be page ${pageCount + 1})`);
          return doc; // Block it - don't create the page
        }

        pageCount++;
        if (pageCount <= maxPages) {
          const expectedPage = expectedPages[pageCount - 1] || `Page ${pageCount}`;
          console.log(`📄 Creating page ${pageCount} (expected: ${expectedPage})`);
          return originalAddPage();
        }
        console.log(`⚠️ BLOCKED page ${pageCount} - max ${maxPages} reached`);
        return doc;
      };

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Generate PDF content
      await this.generatePDFContent(doc);

      console.log(`📄 PDF generation complete. Total pages: ${pageCount}`);
      doc.end();

      // Wait for PDF to finish writing
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const sourceType = usingAI ? 'OpenAI (Gemini prompts)' : 'Fallback (Basic)';
      console.log(`✅ PDF generated successfully with ${sourceType} content`);
      return outputPath;

    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      console.error('   Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Create fallback report structure when Gemini fails
   */
  createFallbackReportStructure() {
    console.log('📋 Creating fallback report structure...');

    const parameters = this.algorithmResults.parameters.map(param => {
      // Use metrics (correct field from algorithm) instead of subParameters
      const subMetrics = param.metrics || param.subParameters || [];

      console.log(`   Processing ${param.name}:`);
      console.log(`     Score: ${param.score}/${param.maxScore}`);
      console.log(`     Classification: ${param.classification}`);
      console.log(`     Metrics count: ${subMetrics.length}`);

      return {
        name: param.name,
        score: param.score,
        maxScore: param.maxScore || 3,
        bucket: param.classification || 'Average',
        bucketColor: this.getBucketColor(param.classification, param.name),
        summary: this.getCompactDescription(param.name, param.classification),
        subparameters: subMetrics.map(metric => ({
          name: metric.name || 'Metric',
          score: metric.score !== undefined ? metric.score : 0,
          value: metric.value,
          // Use actual description with conditions from algorithmCalculator
          interpretation: metric.description || this.getMetricInterpretation(metric.name, metric.score)
        }))
      };
    });

    console.log('   Fallback structure created with', parameters.length, 'parameters');

    // Calculate percentages for summary
    const overallScore = this.algorithmResults.overallScore || 0;
    const maxTotal = parameters.length * 3;
    const overallPercentage = Math.round((overallScore / maxTotal) * 100);

    // Determine strengths and areas needing attention
    const strengths = parameters.filter(p => p.bucket === 'High').map(p => p.name.toLowerCase());
    const needsAttention = parameters.filter(p => p.bucket === 'Low').map(p => p.name.toLowerCase());

    let summaryText = `Your brain performance profile highlights a mix of strengths and areas for growth. `;
    if (strengths.length > 0) {
      summaryText += `Your brain shows healthy performance in ${strengths.join(', ')}. `;
    }
    if (needsAttention.length > 0) {
      summaryText += `Several key cognitive functions like ${needsAttention.join(', ')} currently need attention. `;
    }
    summaryText += `Addressing these areas can significantly enhance your daily performance, emotional well-being, and overall brain health.`;

    return {
      title: 'Brain Performance Infographic',
      subtitle: 'Visual Analysis of Your Brain Health Metrics',
      patientSummary: summaryText,
      parameters: parameters,
      recommendations: [
        'Practice daily mindfulness or meditation to improve relaxation and reduce arousal, supporting emotional regulation and stress reduction.',
        'Engage in targeted brain exercises or puzzles to enhance focus, attention, and cognitive flexibility.',
        'Implement regular, short breaks during mentally demanding tasks to help rebalance alpha-theta activity and improve sustained attention.',
        'Explore journaling or guided emotional awareness practices to foster better mood stability and control.',
        'Prioritize consistent, quality sleep to support brain regeneration and improve overall cognitive function and emotional resilience.',
        'Continue engaging in activities that foster divergent thinking, perhaps incorporating periods of relaxed focus to boost creative output.'
      ]
    };
  }

  /**
   * Get interpretation text for a metric based on its score and value
   * Uses hardcoded condition-based sentences instead of AI-generated ones
   */
  getMetricInterpretation(metricName, score, value = null) {
    // Normalize metric name for matching
    const normalizedName = (metricName || '').toLowerCase();

    // Focus Score (Theta:Beta) - Threshold: < 1.5 is normal
    if (normalizedName.includes('focus') && normalizedName.includes('theta') && normalizedName.includes('beta')) {
      if (score === 1 || (value !== null && value < 1.5)) {
        return 'Your frontal brain regions show balanced activity for sustained attention.';
      } else {
        return 'Suggests areas for improving focus and sustained attention capacity.';
      }
    }

    // Focus Score Stimulation Control (Theta:Beta) - Same as above
    if (normalizedName.includes('focus') && normalizedName.includes('stimulation')) {
      if (score === 1 || (value !== null && value < 1.5)) {
        return 'Your frontal brain regions show balanced activity for sustained attention.';
      } else {
        return 'Suggests areas for improving focus and sustained attention capacity.';
      }
    }

    // Alpha Peak - Threshold: > 9 Hz is normal
    if (normalizedName.includes('alpha') && normalizedName.includes('peak')) {
      if (score === 1 || (value !== null && value > 9)) {
        return 'Healthy alpha peak supports good cognitive processing.';
      } else {
        return 'Alpha peak frequency suggests room for cognitive optimization.';
      }
    }

    // Alpha:Theta Balance - Threshold: Fz < Cz < Pz is normal
    if (normalizedName.includes('alpha') && normalizedName.includes('theta') && normalizedName.includes('balance')) {
      if (score === 1) {
        return 'Healthy balance supporting optimal mental processing and memory formation.';
      } else {
        return 'Suggests areas for optimizing mental processing and memory formation.';
      }
    }

    // Arousal Score - Threshold: < 1 is normal
    if (normalizedName.includes('arousal')) {
      if (score === 1 || (value !== null && value < 1)) {
        return 'Healthy arousal levels indicate good stress regulation and calm brain activity.';
      } else {
        return 'Elevated arousal levels suggest heightened stress response and nervous system activation.';
      }
    }

    // Relaxation Score - Threshold: > 8 is healthy
    if (normalizedName.includes('relaxation')) {
      if (score === 1 || (value !== null && value > 8)) {
        return 'Good relaxation capacity - your brain can effectively shift into calm, restful states.';
      } else {
        return 'Reduced relaxation capacity suggests difficulty unwinding, contributing to stress buildup.';
      }
    }

    // Regeneration (Alpha Modulation) - Threshold: > 30% is healthy
    if (normalizedName.includes('regeneration') || normalizedName.includes('alpha modulation')) {
      if (score === 1 || (value !== null && value > 30)) {
        return 'Strong brain recovery capacity supports mental restoration and stress resilience.';
      } else {
        return 'Limited brain recovery capacity during rest may increase vulnerability to stress.';
      }
    }

    // Focus Theta - Threshold: < 20% is normal
    if (normalizedName.includes('focus theta') || (normalizedName.includes('focus') && !normalizedName.includes('beta'))) {
      if (score === 1 || (value !== null && value < 20)) {
        return 'Theta activity is well-regulated, supporting clear thinking.';
      } else {
        return 'Theta patterns suggest areas for improving mental clarity.';
      }
    }

    // Excessive Delta - Threshold: < 20% is normal
    if (normalizedName.includes('delta') || normalizedName.includes('excessive')) {
      if (score === 1 || (value !== null && value < 20)) {
        return 'Adequate energy levels and minimal fatigue markers detected. However, qualitative review and clinical correlation is a must for this parameter.';
      } else {
        return 'Elevated delta patterns indicate fatigue markers. However, qualitative review and clinical correlation is a must for this parameter.';
      }
    }

    // Alpha Asymmetry (Frontal) - Threshold: < 1 is normal
    if (normalizedName.includes('asymmetry') || normalizedName.includes('frontal')) {
      if (score === 1 || (value !== null && value < 1)) {
        return 'Balanced frontal brain activity supporting emotional regulation.';
      } else {
        return 'Asymmetry patterns suggest areas for emotional balance optimization.';
      }
    }

    // Default fallback
    return score === 1 ? 'Within optimal range for healthy brain function.' : 'Suggests areas for potential improvement.';
  }

  /**
   * Generate PDF content - SIMPLIFIED VERSION
   */
  async generatePDFContent(doc) {
    const reportData = this.geminiReportData;
    const params = reportData.parameters || [];

    console.log('\n📄 === Generating PDF Content ===');
    console.log('   Parameters count:', params.length);
    console.log('   📝 parameterNotes for PDF:', this.parameterNotes ? `"${this.parameterNotes}"` : '(EMPTY - no notes will show)');

    // DEBUG: Log all parameter scores
    console.log('\n📊 === PARAMETER SCORES BEING USED IN PDF ===');
    params.forEach((p, idx) => {
      console.log(`   ${idx + 1}. ${p.name}: ${p.score}/${p.maxScore} (${p.bucket})`);
      if (p.subparameters && p.subparameters.length > 0) {
        p.subparameters.forEach(sub => {
          console.log(`      - ${sub.name}: score=${sub.score}, value=${JSON.stringify(sub.value)}`);
        });
      }
    });
    console.log('==========================================\n');

    // ========== PAGE 1: Cover Page (Page1.png + Ellipse + Frame 15 design) ==========
    // First page is auto-created by PDFKit — pass addPage: false
    console.log('   📄 Page 1: Cover Page (image-based design)');
    generateCoverPage(doc, this.patientData, { addPage: false });

    // ========== STATIC PAGES: Programmatically Generated ==========

    // Page 2: Introduction — Programmatic (no image assets)
    doc.addPage();
    console.log('   📄 Page 2: Static - Introduction (programmatic)');
    try {
      generateIntroductionPage(doc);
    } catch (e) {
      console.error('   ⚠️ Error generating Introduction page:', e.message);
      doc.rect(0, 0, 595, 842).fill('#FFFFFF');
      doc.fontSize(16).fillColor('#333').text('Introduction', 50, 100);
    }
    this.addSimpleFooter(doc, 2);

    // Page 3: Congratulations
    doc.addPage();
    console.log('   📄 Page 3: Static - Congratulations');
    try {
      generateCongratulationsPage(doc);
    } catch (e) {
      console.error('   ⚠️ Error generating Congratulations page:', e.message);
      doc.rect(0, 0, 595, 842).fill('#FFFFFF');
      doc.fontSize(16).fillColor('#333').text('Congratulations', 50, 100);
    }
    this.addSimpleFooter(doc, 3);

    // Page 4: Brainwave Profiles
    doc.addPage();
    console.log('   📄 Page 4: Static - Brainwave Profiles');
    try {
      generateBrainwaveProfilesPage(doc);
    } catch (e) {
      console.error('   ⚠️ Error generating Brainwave Profiles page:', e.message);
      doc.fontSize(16).fillColor('#333').text('Brainwave Profiles', 50, 100);
    }

    // Append numeric relative-power values as extractable text so the
    // "Upload to Claude" pipeline (pdf-parse → Claude extraction) can read
    // the real values instead of defaulting to 0. Same channels as claudeReportData.js.
    try {
      const ecRel = this.qeegData?.EC?.relative || {};
      const POSTERIOR_CHS = ['Pz', 'P3', 'P4', 'O1', 'O2', 'Oz'];
      const avgBand = (band) => {
        let sum = 0, count = 0;
        for (const ch of POSTERIOR_CHS) {
          const v = ecRel[ch]?.[band];
          if (typeof v === 'number' && isFinite(v)) { sum += v; count++; }
        }
        return count ? Math.round(sum / count * 10) / 10 : null;
      };
      const bwParts = [
        ['Delta',  avgBand('Delta')],
        ['Theta',  avgBand('Theta')],
        ['Alpha',  avgBand('Alpha')],
        ['Beta',   avgBand('Beta')],
        ['HiBeta', avgBand('HiBeta')],
      ].filter(([, v]) => v != null).map(([name, v]) => `${name}: ${v}%`).join('  ');

      if (bwParts) {
        doc.fontSize(7).fillColor('#888888')
           .text(`Relative Power (EC posterior avg): ${bwParts}`, 50, doc.page.height - 30, { lineBreak: false });
      }
    } catch (_) { /* best-effort — never break the PDF render */ }

    this.addSimpleFooter(doc, 4);

    // Page 5: Your Brain Markers (Page5.png background + brain cards)
    doc.addPage();
    console.log('   📄 Page 5: Your Brain Markers (new design)');
    try {
      const PAGE5_IMG = path.join(__dirname, '../../public/assets/Page5.png');
      const LOGO_PATH_P5 = path.join(__dirname, '../../public/assets/Layer_1.png');
      if (fs.existsSync(PAGE5_IMG)) {
        doc.image(PAGE5_IMG, 0, 0, { width: 595.28, height: 841.89 });
      }
      if (this.clinicLogoPath && fs.existsSync(this.clinicLogoPath)) {
        require('./pdf/pdfStyles').drawClinicLogo(doc, this.clinicLogoPath, 494, 12, 87.85, 59.58);
      } else if (fs.existsSync(LOGO_PATH_P5)) {
        doc.image(LOGO_PATH_P5, 494, 12, { fit: [87.85, 59.58], align: 'center', valign: 'center' });
      }

      // "Your Brain Markers" title — drop shadow + white text
      doc.save();
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#000000').fillOpacity(0.20)
         .text('Your Brain Markers', 163, 55, { lineBreak: false, characterSpacing: -0.52 });
      doc.fillOpacity(1);
      doc.restore();
      doc.save();
      doc.font('Helvetica-Bold').fontSize(32).fillColor('#FFFFFF')
         .text('Your Brain Markers', 162, 53, { lineBreak: false, characterSpacing: -0.52 });
      doc.restore();

      // Brain marker cards helper
      const drawBrainCard = (cx, cy, cw, ch, cr, title, body, gradStops, isDark) => {
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

        var headingColor = isDark ? '#FFFFFF' : '#227AFF';
        var bodyColor = isDark ? '#FFFFFF' : '#000000';
        var titleFS = 18;
        doc.font('Helvetica-Bold').fontSize(titleFS);
        var titleW = cw - 32;
        if (doc.widthOfString(title.replace('\n', ' ')) > titleW) titleFS = 16;
        doc.save();
        doc.font('Helvetica-Bold').fontSize(titleFS).fillColor(headingColor)
           .text(title, cx + 16, cy + 18, { width: titleW, align: 'left', lineGap: -2 });
        doc.restore();
        doc.save();
        doc.font('Helvetica-Bold').fontSize(titleFS);
        var titleH = doc.heightOfString(title, { width: titleW, lineGap: -2 });
        doc.font('Helvetica').fontSize(12).fillColor(bodyColor)
           .text(body, cx + 16, cy + 18 + titleH + 8, { width: titleW, align: 'left', lineGap: 3.5 });
        doc.restore();
      };

      drawBrainCard(50, 130, 218, 145, 36, 'Emotional Regulation', 'Your ability to stay emotionally steady, manage triggers and self soothe. Return to calm after stress.', null, false);
      drawBrainCard(330, 130, 216, 169, 36, 'Brain Burn Out', 'The level of mental depletion in your system, reflecting recovery, resilience, and capacity to keep performing without feeling overwhelmed.', null, false);
      drawBrainCard(184, 363, 226, 151, 36, 'Focus & Attention', 'Your ability to concentrate, stay on task, filter out distractions, and shift focus smoothly when needed.', null, true);
      drawBrainCard(35, 537, 218, 170, 36, 'Stress & Mental\nOverload', 'The overall stress your mind and body are experiencing, reflecting whether pressure is building up or being handled comfortably.', null, false);
      drawBrainCard(349, 570, 205, 145, 36, 'Cognition', 'How efficiently your brain thinks and works, covering clarity, speed of processing, memory, learning, and problem solving.', null, false);
    } catch (e) {
      console.error('   ⚠️ Error generating Brain Markers page:', e.message);
    }
    this.addSimpleFooter(doc, 5);

    // Page 6: Your Numbers At a Glance (new design) — with dynamic PDF image extraction
    doc.addPage();
    console.log('   📄 Page 6: Your Numbers At a Glance (new design)');
    try {
      if (this.inputPdfPaths && this.inputPdfPaths.eyesClosed && this.inputPdfPaths.eyesOpen) {
        console.log('   📁 Using async version with PDF image extraction...');
        await generateYourNumbersPageAsync(doc, this.inputPdfPaths, this.parameterNotes);
      } else {
        console.log('   ⚠️ No PDF paths, using sync fallback with placeholders...');
        generateYourNumbersPage(doc, null, this.parameterNotes);
      }
    } catch (e) {
      console.error('   ⚠️ Error generating Your Numbers page:', e.message);
      doc.rect(0, 0, 595, 842).fill('#FFFFFF');
      doc.fontSize(16).fillColor('#333').text('Your Numbers At a Glance', 50, 100);
    }
    this.addSimpleFooter(doc, 6);

    // ========== RADAR CHART PAGE (Page7.png background + PDFKit radar) ==========
    doc.addPage();
    console.log('   📄 Page 7: Radar Chart (new design)');
    try {
      const PAGE7_IMG = path.join(__dirname, '../../public/assets/Page7.png');
      const LOGO_PATH_P7 = path.join(__dirname, '../../public/assets/Layer_1.png');
      if (fs.existsSync(PAGE7_IMG)) {
        doc.image(PAGE7_IMG, 0, 0, { width: 595.28, height: 841.89 });
      }
      if (this.clinicLogoPath && fs.existsSync(this.clinicLogoPath)) {
        require('./pdf/pdfStyles').drawClinicLogo(doc, this.clinicLogoPath, 494, 12, 87.85, 59.58);
      } else if (fs.existsSync(LOGO_PATH_P7)) {
        doc.image(LOGO_PATH_P7, 494, 12, { fit: [87.85, 59.58], align: 'center', valign: 'center' });
      }

      // Radar chart helper (inline) — 3 discrete rings: Low (33.33%), Medium (66.67%), High (100%)
      const drawRadarChart = (rdoc, chartX, chartY, chartW, chartH, labels, datasets, labelColors) => {
        var cx = chartX + chartW / 2;
        var cy = chartY + chartH / 2;
        var maxR = Math.min(chartW, chartH) / 2 - 30;
        var sides = labels.length;
        var angleStep = (2 * Math.PI) / sides;
        var startAngle = -Math.PI / 2;
        function getPoint(index, value) {
          var angle = startAngle + index * angleStep;
          var r = (value / 100) * maxR;
          return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        }
        // Draw 3 grid rings: Low, Medium, High
        var ringLevels = [
          { value: 33.33, label: 'Low' },
          { value: 66.67, label: 'Medium' },
          { value: 100,   label: 'High' }
        ];
        ringLevels.forEach(function(ring) {
          rdoc.save();
          var first = getPoint(0, ring.value);
          rdoc.moveTo(first.x, first.y);
          for (var i = 1; i < sides; i++) { var p = getPoint(i, ring.value); rdoc.lineTo(p.x, p.y); }
          rdoc.closePath().strokeColor('#666666').strokeOpacity(0.8).lineWidth(0.7).stroke();
          rdoc.strokeOpacity(1); rdoc.restore();
          // Draw ring label on the right side of the first axis (top)
          var labelPoint = getPoint(0, ring.value);
          rdoc.save();
          rdoc.font('Helvetica').fontSize(6).fillColor('#888888')
             .text(ring.label, labelPoint.x + 4, labelPoint.y - 3, { width: 40, lineBreak: false });
          rdoc.restore();
        });
        // Draw axis lines from center to each vertex
        for (var i = 0; i < sides; i++) {
          var p = getPoint(i, 100);
          rdoc.save(); rdoc.moveTo(cx, cy).lineTo(p.x, p.y).strokeColor('#666666').strokeOpacity(0.8).lineWidth(0.6).stroke(); rdoc.strokeOpacity(1); rdoc.restore();
        }
        // Draw data polygons
        datasets.forEach(function(ds) {
          rdoc.save();
          var f0 = getPoint(0, ds.values[0]); rdoc.moveTo(f0.x, f0.y);
          for (var i = 1; i < sides; i++) { var fp = getPoint(i, ds.values[i]); rdoc.lineTo(fp.x, fp.y); }
          rdoc.closePath().fillColor(ds.color).fillOpacity(ds.fillOpacity).fill(); rdoc.fillOpacity(1); rdoc.restore();
          rdoc.save();
          var s0 = getPoint(0, ds.values[0]); rdoc.moveTo(s0.x, s0.y);
          for (var i = 1; i < sides; i++) { var sp = getPoint(i, ds.values[i]); rdoc.lineTo(sp.x, sp.y); }
          rdoc.closePath().strokeColor(ds.color).strokeOpacity(ds.strokeOpacity).lineWidth(ds.lineWidth).stroke(); rdoc.strokeOpacity(1); rdoc.restore();
          // Data points (dots) — larger for visibility on snapped positions
          for (var i = 0; i < sides; i++) { var dp = getPoint(i, ds.values[i]); rdoc.save(); rdoc.circle(dp.x, dp.y, 3.5).fillColor(ds.color).fill(); rdoc.restore(); }
        });
        // Draw parameter labels at each axis
        for (var i = 0; i < sides; i++) {
          var angle = startAngle + i * angleStep;
          var labelR = maxR + 18;
          var lx = cx + labelR * Math.cos(angle);
          var ly = cy + labelR * Math.sin(angle);
          var labelW = 80;
          var align = 'center'; var xOffset = -labelW / 2;
          if (Math.cos(angle) < -0.3) { align = 'right'; xOffset = -labelW; }
          else if (Math.cos(angle) > 0.3) { align = 'left'; xOffset = 0; }
          var labelColor = labelColors && labelColors[i] ? labelColors[i] : '#333333';
          rdoc.save(); rdoc.font('Helvetica-Bold').fontSize(8).fillColor(labelColor)
             .text(labels[i], lx + xOffset, ly - 5, { width: labelW, align: align, lineBreak: true }); rdoc.restore();
        }
      };

      // Build radar chart from actual parameter scores
      var radarLabels = ['Cognition', 'Burnout & Fatigue', 'Learning', 'Focus & Attention', 'Emotional Regulation', 'Stress', 'Creativity'];

      // Map parameter names to radar label indices
      // radarLabels order: [0:Cognition, 1:Burnout&Fatigue, 2:Learning, 3:Focus&Attention, 4:EmotionalRegulation, 5:Stress, 6:Creative]
      var radarParamMap = {
        'Cognition': 0,
        'cognition': 0,
        'BurnoutAndFatigue': 1,
        'Burnout & Fatigue': 1,
        'burnout & fatigue': 1,
        'Brain Burn Out': 1,
        'Learning': 2,
        'learning': 2,
        'FocusAndAttention': 3,
        'Focus & Attention': 3,
        'focus & attention': 3,
        'Focus And Attention': 3,
        'EmotionalRegulation': 4,
        'Emotional Regulation': 4,
        'emotional regulation': 4,
        'Stress': 5,
        'stress': 5,
        'Stress & Mental Overload': 5,
        'Creativity': 6,
        'Creative': 6,
        'creativity': 6,
        'creative': 6
      };

      // Extract scores from params — use bucket/classification directly for 3 discrete levels
      // Low ring=33.33, Medium ring=66.67, High ring=100
      var dynamicValues = [33.33, 33.33, 33.33, 33.33, 33.33, 33.33, 33.33]; // defaults (Low)
      var negativeIndices = [1, 5]; // indices for Burnout & Fatigue, Stress
      var rawScores = [null, null, null, null, null, null, null]; // store raw score/maxScore
      var hasData = false;

      params.forEach(function(p) {
        var paramKey = p.name;
        var normalizedKey = paramKey.replace(/\s+/g, '').replace(/&/g, 'And');
        var idx = radarParamMap[paramKey] !== undefined ? radarParamMap[paramKey] : radarParamMap[normalizedKey];

        if (idx !== undefined && p.score !== undefined) {
          var maxScore = p.maxScore || 3;
          var bucket = (p.bucket || p.classification || '').toLowerCase().trim();
          var pct;

          // Map bucket/classification directly to radar ring position
          // Standard: Low → 1st ring, Medium → 2nd ring, High → 3rd ring
          // Stress/Burnout: Low → 1st ring, Mild/Moderate → 2nd ring, Severe → 3rd ring
          if (bucket === 'low') {
            pct = 33.33;   // 1st ring (innermost)
          } else if (bucket === 'medium' || bucket === 'mild' || bucket === 'moderate') {
            pct = 66.67;   // 2nd ring (middle)
          } else if (bucket === 'high' || bucket === 'severe') {
            pct = 100;     // 3rd ring (outermost)
          } else {
            // Fallback: compute from score if bucket is missing
            var isInverted = (idx === 1 || idx === 5);
            if (isInverted) {
              // Stress/Burnout: score=RED count, 0=Low, 1-2=Medium, 3=High
              if (p.score === 0) pct = 33.33;
              else if (p.score <= 2) pct = 66.67;
              else pct = 100;
            } else {
              // Standard: 0-1=Low, 2=Medium, 3=High
              if (p.score >= maxScore) pct = 100;
              else if (p.score >= maxScore - 1 && p.score > 0) pct = 66.67;
              else pct = 33.33;
            }
          }

          var levelName = pct === 100 ? 'High' : (pct === 66.67 ? 'Medium' : 'Low');
          dynamicValues[idx] = pct;
          rawScores[idx] = { score: p.score, maxScore: maxScore };
          hasData = true;
          console.log('   📊 Radar: ' + paramKey + ' → score=' + p.score + '/' + maxScore + ', bucket=' + bucket + ' → ' + levelName + ' (' + pct + '%)');
        }
      });

      if (hasData) {
        console.log('   ✅ Using dynamic radar values:', dynamicValues);
      } else {
        console.log('   ⚠️ No parameter data found, using defaults');
      }

      // Build label colors based on score and parameter type
      // Positive params: 3/3=Green, 2/3=Yellow, 0-1/3=Red
      // Negative params (Stress, Burnout): 0/3=Green, 1/3=Yellow, 2/3=Orange, 3/3=Red
      var radarLabelColors = radarLabels.map(function(label, i) {
        var rs = rawScores[i];
        if (!rs) return '#333333'; // default gray if no data
        var score = rs.score;
        var maxScore = rs.maxScore;
        var isNegative = negativeIndices.indexOf(i) !== -1;

        if (isNegative) {
          // Negative: lower score = better
          if (score === 0) return '#38A169';       // Green - best
          if (score === 1) return '#D69E2E';       // Yellow - mild
          if (score === 2) return '#DD6B20';       // Orange - moderate
          return '#E53E3E';                         // Red - severe
        } else {
          // Positive: higher score = better
          if (score >= maxScore) return '#38A169';  // Green - high/best
          if (score >= maxScore - 1 && score > 0) return '#D69E2E'; // Yellow - medium
          return '#E53E3E';                         // Red - low
        }
      });

      var radarData = [
        { values: dynamicValues, color: '#0175FF', fillOpacity: 0.15, strokeOpacity: 1, lineWidth: 1.5 }
      ];
      // Vertically center: title ends ~130, footer at ~800, available=670, chartH=310
      drawRadarChart(doc, 103, 290, 372, 310, radarLabels, radarData, radarLabelColors);
    } catch (e) {
      console.error('   ⚠️ Error generating Radar Chart page:', e.message);
    }
    this.addSimpleFooter(doc, 7);

    // ========== Page 8: Cognition (dynamic from params) ==========
    doc.addPage();
    console.log('   📄 Page 8: Cognition (new design)');
    try {
      const cognitionData = this._buildGaugePageData(params, 'Cognition', 'COGNITION');
      generateCognitionPage(doc, cognitionData);
    } catch (e) {
      console.error('   ⚠️ Error generating Cognition page:', e.message);
    }
    this.addSimpleFooter(doc, 8);

    // ========== Page 9: Cognition Details ==========
    doc.addPage();
    console.log('   📄 Page 9: Cognition Details (new design)');
    try {
      generateCognitionPage2(doc);
    } catch (e) {
      console.error('   ⚠️ Error generating Cognition Details page:', e.message);
    }
    this.addSimpleFooter(doc, 9);

    // ========== PAGES 10+: Each parameter gets gauge page (new UI) + details page ==========
    // Skip 'Cognition' since it's already on Pages 8-9
    // Reorder: ensure Learning comes before Creativity
    const learningIdx = params.findIndex(p => (p.name || '').replace(/\s+/g, '').replace(/&/g, 'And').toLowerCase() === 'learning');
    const creativityIdx = params.findIndex(p => (p.name || '').replace(/\s+/g, '').replace(/&/g, 'And').toLowerCase() === 'creativity');
    if (learningIdx > -1 && creativityIdx > -1 && learningIdx > creativityIdx) {
      const [learningParam] = params.splice(learningIdx, 1);
      params.splice(creativityIdx, 0, learningParam);
    }

    let pageNum = 10;
    for (let i = 0; i < params.length && i < 7; i++) {
      const p = params[i];
      const normalizedName = (p.name || '').replace(/\s+/g, '').replace(/&/g, 'And').toLowerCase();

      // Skip Cognition — already rendered on Pages 8-9
      if (normalizedName === 'cognition') {
        console.log(`   ⏭️ Skipping ${p.name} (already on Pages 8-9)`);
        continue;
      }

      const displayTitle = (p.name || 'Parameter').toUpperCase();
      console.log(`   📄 Page ${pageNum}: ${p.name} — Gauge (new UI)`);

      // Gauge page (same UI as Page 8)
      doc.addPage();
      try {
        const gaugeData = this._buildGaugePageData(params, p.name, displayTitle);
        generateCognitionPage(doc, gaugeData);
      } catch (e) {
        console.error(`   ⚠️ Error generating ${p.name} gauge page:`, e.message);
      }
      this.addSimpleFooter(doc, pageNum);
      pageNum++;

      // Details page (same UI as Page 9)
      console.log(`   📄 Page ${pageNum}: ${p.name} — Details (new UI)`);
      doc.addPage();
      try {
        const detailsData = this._buildDetailsPageData(params, p.name, displayTitle);
        generateCognitionPage2(doc, detailsData);
      } catch (e) {
        console.error(`   ⚠️ Error generating ${p.name} details page:`, e.message);
      }
      this.addSimpleFooter(doc, pageNum);
      pageNum++;
    }

    // ========== 7 SUB-PARAMETER DETAIL PAGES ==========
    pageNum = this._generateSubParameterPages(doc, pageNum);

    // ========== BACK COVER PAGE ==========
    this._generateBackCoverPage(doc, pageNum);
    pageNum++;

    console.log('   ✅ PDF Content Generation Complete');
  }

  /**
   * Generate 7 Sub-Parameter Detail Pages
   * Peak Alpha, Excessive Delta, Arousal Score, Focus and Attention,
   * Relaxation Score, Regeneration and Repair Score, Asymmetry Eye Open
   */
  _generateSubParameterPages(doc, pageNum) {
    const subParams = [
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      },
      {
        showPillBar: true,
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
      }
    ];

    // Map sub-parameter scores from patient data for pill bar indicator
    const allSubParams = [];
    const reportParams = this.geminiReportData?.parameters || [];
    reportParams.forEach(p => {
      if (p.subparameters) {
        p.subparameters.forEach(sub => allSubParams.push(sub));
      }
    });

    // Title-to-subparam name mapping
    const titleToSubParam = {
      'PEAK ALPHA': 'Alpha Peak',
      'EXCESSIVE DELTA': 'Excessive Delta',
      'AROUSAL SCORE': 'Arousal Score',
      'FOCUS AND ATTENTION': 'Focus Score (Theta:Beta)',
      'RELAXATION SCORE': 'Relaxation Score',
      'REGENERATION AND REPAIR SCORE': 'Regeneration (Alpha Modulation)',
      'ASYMMETRY EYE OPEN': 'Alpha Asymmetry (Frontal)'
    };

    // Clinical scale ranges for each sub-parameter (min-max for pill bar positioning)
    // normalMin/normalMax define the GREEN normal range on the scale
    const subParamScales = {
      'PEAK ALPHA':                    { min: 6,  max: 14,  unit: 'Hz', steps: 4, normalMin: 9, normalMax: 14 },   // > 9 Hz is normal
      'EXCESSIVE DELTA':               { min: 0,  max: 100, unit: '%',  steps: 5, normalMin: 0, normalMax: 20 },   // < 20% is normal
      'AROUSAL SCORE':                 { min: 0,  max: 2.5, unit: '',   steps: 5, normalMin: 0, normalMax: 1 },    // < 1 is normal
      'FOCUS AND ATTENTION':           { min: 0,  max: 4,   unit: '',   steps: 4, normalMin: 0, normalMax: 1.5 },  // < 1.5 is normal
      'RELAXATION SCORE':              { min: 0,  max: 25,  unit: '',   steps: 5, normalMin: 8, normalMax: 25 },   // > 8 is healthy
      'REGENERATION AND REPAIR SCORE': { min: 0,  max: 100, unit: '%',  steps: 5, normalMin: 30, normalMax: 100 }, // > 30% is healthy
      'ASYMMETRY EYE OPEN':            { min: 0,  max: 50,  unit: '',   steps: 5, normalMin: 0, normalMax: 1 },    // < 1 is normal
    };

    for (const sp of subParams) {
      // Find matching sub-parameter from algorithm data
      const subName = titleToSubParam[sp.title] || sp.title;
      const matchedSub = allSubParams.find(s =>
        (s.name || '').toLowerCase().replace(/\s+/g, '') === subName.toLowerCase().replace(/\s+/g, '')
      );

      // Position pill bar by ACTUAL VALUE on the clinical scale
      if (matchedSub) {
        let numericValue = null;
        if (matchedSub.value !== undefined && matchedSub.value !== null && matchedSub.value !== 'Indeterminate') {
          if (typeof matchedSub.value === 'number' && isFinite(matchedSub.value)) {
            numericValue = matchedSub.value;
          } else if (typeof matchedSub.value === 'object') {
            // For object values (multi-channel), use the average or first value
            const vals = Object.values(matchedSub.value).filter(v => typeof v === 'number' && isFinite(v));
            if (vals.length > 0) numericValue = vals.reduce((a, b) => a + b, 0) / vals.length;
          } else {
            const parsed = parseFloat(matchedSub.value);
            if (!isNaN(parsed)) numericValue = parsed;
          }
        }

        const scale = subParamScales[sp.title];
        if (numericValue !== null && scale) {
          // Dynamically expand scale max if value exceeds it
          const dynamicMax = numericValue > scale.max ? Math.ceil(numericValue * 1.1) : scale.max;
          sp.pillBarScore = Math.max(0, Math.min(100, Math.round(((numericValue - scale.min) / (dynamicMax - scale.min)) * 100)));
          sp.pillBarScale = { min: scale.min, max: dynamicMax, value: numericValue, unit: scale.unit || '', steps: scale.steps || 5, normalMin: scale.normalMin, normalMax: scale.normalMax };
          console.log(`      Pill bar: value=${numericValue}, scale=[${scale.min}-${dynamicMax}] → ${sp.pillBarScore}%`);
        } else if (matchedSub.score !== undefined) {
          // Fallback: use binary score if no numeric value available
          sp.pillBarScore = matchedSub.score === 1 ? 75 : 25;
        }
      }

      console.log(`   📄 Page ${pageNum}: ${sp.title} (Sub-parameter Detail) pillBarScore=${sp.pillBarScore || 0}`);
      doc.addPage({ size: 'A4', margin: 0 });
      try {
        generateCognitionPage2(doc, sp);
      } catch (e) {
        console.error(`   ⚠️ Error generating ${sp.title} sub-param page:`, e.message);
      }
      this.addSimpleFooter(doc, pageNum);
      pageNum++;
    }

    return pageNum;
  }

  /**
   * Generate Back Cover / Contact Page
   */
  _generateBackCoverPage(doc, pageNum) {
    doc.addPage({ size: 'A4', margin: 0 });
    console.log('   Drawing Back Cover Page...');
    try {
      const pw = 595.28;
      const ph = 841.89;

      // White background
      doc.rect(0, 0, pw, ph).fill('#FFFFFF');

      // NeuroSense Logo — centered (clinic's uploaded logo when set)
      const logoPath = this.clinicLogoPath || path.join(__dirname, '../../public/assets/Layer_1.png');
      const logoGroupX = 137;
      const logoGroupY = 241;
      const logoGroupW = 321.45;
      const logoImgW = 300;
      const logoImgX = logoGroupX + (logoGroupW - logoImgW) / 2;
      if (fs.existsSync(logoPath)) {
        if (this.clinicLogoPath) {
          doc.image(logoPath, logoImgX, logoGroupY, { fit: [logoImgW, 150], align: 'center', valign: 'center' });
        } else {
          doc.image(logoPath, logoImgX, logoGroupY, { width: logoImgW });
        }
      }

      // Contact Card — X:135, Y:474, W:322, H:200, R:13
      const cardX = 135;
      const cardY = 474;
      const cardW = 322;
      const cardH = 200;
      const cardR = 13;

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

      // Card fill — white
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

      // "If You Have More Questions" + "Get In Touch"
      doc.save();
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#227AFF')
         .text('If You Have More Questions', cardX, cardY + 20, { width: cardW, align: 'center' });
      doc.restore();

      doc.save();
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#227AFF')
         .text('Get In Touch', cardX, cardY + 44, { width: cardW, align: 'center' });
      doc.restore();

      // Social media icons — 3 PNG images
      const ICON_YT    = path.join(__dirname, '../../public/assets/Frame 427321220.png');
      const ICON_INSTA = path.join(__dirname, '../../public/assets/Frame 427321219.png');
      const ICON_EMAIL = path.join(__dirname, '../../public/assets/Frame 427321214.png');
      const iconSize = 36;
      const iconGap = 16;
      const totalIconsW = iconSize * 3 + iconGap * 2;
      const iconsStartX = cardX + (cardW - totalIconsW) / 2;
      const iconY = cardY + 80;

      try { if (fs.existsSync(ICON_EMAIL)) doc.image(ICON_EMAIL, iconsStartX, iconY, { width: iconSize, height: iconSize, link: 'mailto:limitlessbrainlab@gmail.com' }); } catch(e) {}
      const instaX = iconsStartX + iconSize + iconGap;
      try { if (fs.existsSync(ICON_INSTA)) doc.image(ICON_INSTA, instaX, iconY, { width: iconSize, height: iconSize, link: 'https://www.instagram.com/drsweta.adatia/?hl=en' }); } catch(e) {}
      const ytX = iconsStartX + 2 * (iconSize + iconGap);
      try { if (fs.existsSync(ICON_YT)) doc.image(ICON_YT, ytX, iconY, { width: iconSize, height: iconSize, link: 'https://www.youtube.com/@drsweta.adatia' }); } catch(e) {}

      // Phone number pill — Frame 10.png + text
      const PHONE_ICON = path.join(__dirname, '../../public/assets/Frame 10.png');
      const pillW = 210;
      const pillH = 40;
      const pillX = cardX + (cardW - pillW) / 2;
      const pillY = cardY + 138;

      try { if (fs.existsSync(PHONE_ICON)) doc.image(PHONE_ICON, pillX, pillY, { width: pillW, height: pillH, link: 'tel:+971585602551' }); } catch(e) {}

      doc.save();
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
         .text('+971 58 560 2551', pillX, pillY + (pillH - 13) / 2, { width: pillW, align: 'center', link: 'tel:+971585602551' });
      doc.restore();

    } catch (e) {
      console.error('   Error drawing back cover:', e.message);
    }

    this.addSimpleFooter(doc, pageNum);
  }

  /**
   * Build gauge page data from params for a given parameter name
   * Used by Page 8 (Cognition) and similar gauge pages
   * @param {Array} params - All parameters from report
   * @param {string} paramName - Parameter name to find (e.g. 'Cognition', 'Stress')
   * @param {string} displayTitle - Title to show on page (e.g. 'COGNITION')
   * @returns {object|null} Data object for generateCognitionPage or null if not found
   */
  _buildGaugePageData(params, paramName, displayTitle) {
    // Find the matching parameter
    const param = params.find(p => {
      const normalized = p.name.replace(/\s+/g, '').replace(/&/g, 'And').toLowerCase();
      const target = paramName.replace(/\s+/g, '').replace(/&/g, 'And').toLowerCase();
      return normalized === target || p.name.toLowerCase() === paramName.toLowerCase();
    });

    if (!param) {
      console.log(`   ⚠️ Parameter "${paramName}" not found in params, using defaults`);
      return null; // will use function defaults
    }

    const score = param.score !== undefined ? param.score : 0;
    const maxScore = param.maxScore || 3;
    const bucket = (param.bucket || param.classification || '').toLowerCase().trim();

    // Same percentage logic for ALL parameters (no inversion)
    // Gauge shows the LEVEL of the parameter: Low=20%, Medium=55%, High=90%
    let percentage;
    if (bucket === 'low') percentage = 20;
    else if (bucket === 'mild' || bucket === 'moderate' || bucket === 'medium') percentage = 55;
    else if (bucket === 'high' || bucket === 'severe') percentage = 90;
    else {
      // Fallback: compute from score
      if (score === 0) percentage = 10;
      else if (score === 1) percentage = 25;
      else if (score === 2) percentage = 55;
      else percentage = 90;
    }

    console.log(`   📊 Gauge: ${paramName} → ${score}/${maxScore}, bucket=${bucket} = ${percentage}%`);

    // Build metrics from subparameters
    const subParams = param.subparameters || param.metrics || param.subParameters || [];
    console.log(`   📊 Gauge metrics for ${paramName}: ${subParams.length} subparams`);
    subParams.forEach((s, idx) => {
      console.log(`      ${idx}: name="${s.name}", score=${s.score}, value=${JSON.stringify(s.value)}`);
    });

    const metrics = subParams.map(sub => {
      // Format value — handle numbers, objects, strings
      let formattedValue = '';
      if (sub.value !== undefined && sub.value !== null) {
        if (sub.value === 'Indeterminate' || (typeof sub.value === 'number' && !isFinite(sub.value))) {
          formattedValue = 'Indeterminate';
        } else if (typeof sub.value === 'number') {
          formattedValue = sub.value.toFixed(2);
        } else if (typeof sub.value === 'object') {
          const parts = [];
          for (const key in sub.value) {
            const v = sub.value[key];
            if (v === 'Indeterminate' || (typeof v === 'number' && !isFinite(v))) {
              parts.push(key + ': Indeterminate');
            } else if (typeof v === 'number') {
              parts.push(key + ': ' + v.toFixed(2));
            } else if (v !== undefined && v !== null) {
              parts.push(key + ': ' + v);
            }
          }
          formattedValue = parts.join(', ');
        } else {
          formattedValue = String(sub.value);
        }
      }

      // Get interpretation
      let numericValue = null;
      if (sub.value !== undefined && sub.value !== null) {
        if (typeof sub.value === 'number') numericValue = sub.value;
        else if (typeof sub.value === 'string') {
          const parsed = parseFloat(sub.value);
          if (!isNaN(parsed)) numericValue = parsed;
        }
      }
      const body = this.getMetricInterpretation(sub.name || '', sub.score, numericValue)
        || sub.interpretation || sub.description || '';

      const metricNameLower = (sub.name || '').toLowerCase();

      // Clean up metric title — remove parenthetical ratio labels
      var cleanTitle = (sub.name || 'Metric').replace(/\s*\(Theta[:\s]*Beta\)/i, '').trim();

      return {
        title: cleanTitle,
        body: body,
        value: formattedValue ? 'Value: ' + formattedValue : ''
      };
    });

    // Pad to 3 metrics if needed
    while (metrics.length < 3) {
      metrics.push({ title: 'N/A', body: '', value: '' });
    }

    // Build description — priority: Gemini AI → score-based → null (use defaults)
    let description = '';

    // 1. Try Gemini AI description
    if (this.geminiReportData && this.geminiReportData.parameters) {
      const geminiParam = this.geminiReportData.parameters.find(gp =>
        gp.name && gp.name.toLowerCase().replace(/\s+/g, '') === paramName.toLowerCase().replace(/\s+/g, '')
      );
      if (geminiParam && geminiParam.description) {
        description = geminiParam.description;
      }
    }

    // 2. Fallback: score-based detailed description
    if (!description) {
      description = this.getDetailedParameterDescription(paramName, score, maxScore, param.bucket);
    }

    console.log(`   📝 Description for ${paramName}: "${(description || '').substring(0, 60)}..."`);

    // Map parameter to gauge image
    const gaugeImageMap = {
      'stress': 'stress.png',
      'focusandattention': 'focusandattention.png',
      'focus&attention': 'focusandattention.png',
      'burnoutandfatigue': 'burnoutandfatigue.png',
      'burnout&fatigue': 'burnoutandfatigue.png',
      'emotionalregulation': 'emotionalregulation.png',
      'learning': 'learning.png',
      'creativity': 'creativity.png'
    };
    const paramKey = paramName.replace(/\s+/g, '').toLowerCase();
    const gaugeImgFile = gaugeImageMap[paramKey] || null;
    const gaugeImage = gaugeImgFile ? path.resolve(__dirname, '../../public/assets/' + gaugeImgFile) : null;

    // Get references from PARAMETER_DETAIL_DATA
    const paramLower2 = paramName.toLowerCase();
    let detailForRefs = PARAMETER_DETAIL_DATA[paramLower2];
    if (!detailForRefs) {
      const altKeys2 = Object.keys(PARAMETER_DETAIL_DATA);
      for (const key of altKeys2) {
        if (key.replace(/\s+/g, '').replace(/&/g, 'and') === paramLower2.replace(/\s+/g, '').replace(/&/g, 'and')) {
          detailForRefs = PARAMETER_DETAIL_DATA[key];
          break;
        }
      }
    }

    return {
      title: displayTitle,
      percentage: percentage,
      description: description,
      metrics: metrics.slice(0, 3),
      gaugeImage: gaugeImage,
      references: detailForRefs ? detailForRefs.references : undefined
    };
  }

  /**
   * Build details page data (Page 9 style) from params for a given parameter
   * Uses PARAMETER_DETAIL_DATA for high/low descriptions and improvements
   * @param {Array} params - All parameters from report
   * @param {string} paramName - Parameter name (e.g. 'Stress', 'Focus & Attention')
   * @param {string} displayTitle - Title to show (e.g. 'STRESS')
   * @returns {object|null} Data object for generateCognitionPage2 or null
   */
  _buildDetailsPageData(params, paramName, displayTitle) {
    // Find matching detail data from PARAMETER_DETAIL_DATA
    const paramLower = paramName.toLowerCase();
    let detailData = PARAMETER_DETAIL_DATA[paramLower];

    // Try alternate keys
    if (!detailData) {
      const altKeys = Object.keys(PARAMETER_DETAIL_DATA);
      for (const key of altKeys) {
        if (key.replace(/\s+/g, '').replace(/&/g, 'and') === paramLower.replace(/\s+/g, '').replace(/&/g, 'and')) {
          detailData = PARAMETER_DETAIL_DATA[key];
          break;
        }
      }
    }

    if (!detailData) {
      console.log(`   ⚠️ No detail data found for "${paramName}", using null (defaults)`);
      return { title: displayTitle };
    }

    console.log(`   📊 Details: Building page for ${paramName}`);

    // Build high section
    const highSection = {
      title: detailData.highTitle || 'High ' + paramName,
      paragraphs: detailData.highDesc ? [detailData.highDesc] : [],
      implications: detailData.highImplications || []
    };

    // Build low section
    const lowSection = {
      title: detailData.lowTitle || 'Low ' + paramName,
      paragraphs: detailData.lowDesc ? [detailData.lowDesc] : [],
      implications: detailData.lowImplications || []
    };

    // Build how to improve bullets
    const howToImprove = (detailData.improvements || []).map(imp => {
      return imp.title + ' ' + imp.desc;
    });

    // Build description from Gemini data if available
    let description = '';
    if (this.geminiReportData && this.geminiReportData.parameters) {
      const geminiParam = this.geminiReportData.parameters.find(gp =>
        gp.name && gp.name.toLowerCase().replace(/\s+/g, '') === paramName.toLowerCase().replace(/\s+/g, '')
      );
      if (geminiParam && geminiParam.description) {
        description = geminiParam.description;
      }
    }

    return {
      title: displayTitle,
      description: description || paramName + ' encompasses multiple aspects of brain function that impact daily performance and well-being. This detailed analysis breaks down the key factors and provides actionable recommendations for improvement.',
      highCognition: highSection,
      lowCognition: lowSection,
      howToImprove: howToImprove.length > 0 ? howToImprove : undefined,
      references: []
    };
  }

  /**
   * Simple footer - blue bar with report info, disclaimer and page number
   * Uses explicit positioning to avoid page breaks - 2 lines properly aligned
   */
  addSimpleFooter(doc, pageNumber) {
    // Draw footer bar at bottom of page (A4 height = 842)
    const footerY = 800;
    const rightMargin = 565;
    doc.rect(0, footerY, 595, 42).fill('#227aff');

    // Line 1: Report generated info (left) | Page number (right)
    doc.fontSize(7).font('Helvetica').fillColor('#FFFFFF')
       .text(`Report generated on: ${this.generatedAt} by Limitless Brain Lab`, 30, footerY + 7, { lineBreak: false });

    if (pageNumber) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text(`Page ${pageNumber}`, 30, footerY + 7, { width: rightMargin - 30, align: 'right', lineBreak: false });
    }

    // Line 2: Disclaimer text (left) | Website (right)
    doc.fontSize(6).font('Helvetica').fillColor('#FFFFFF')
       .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.', 30, footerY + 22, { lineBreak: false });

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text('limitlessbrainlab-eight.vercel.app', 30, footerY + 22, { width: rightMargin - 30, align: 'right', lineBreak: false });
  }

  /**
   * Get parameter key for PARAMETER_DETAIL_DATA lookup
   */
  getParameterKey(paramName) {
    const name = paramName.toLowerCase();
    if (name.includes('cognition')) return 'cognition';
    if (name.includes('stress')) return 'stress';
    if (name.includes('focus') || name.includes('attention')) return 'focus & attention';
    if (name.includes('burnout') || name.includes('fatigue')) return 'burnout & fatigue';
    if (name.includes('emotional') || name.includes('regulation')) return 'emotional regulation';
    if (name.includes('learning')) return 'learning';
    if (name.includes('creativity')) return 'creativity';
    return null;
  }

  /**
   * Add Parameter Detail Page - Generic High/Low with implications and How to Improve
   * @param {Object} doc - PDFKit document
   * @param {Object} data - Parameter detail data from PARAMETER_DETAIL_DATA
   */
  addParameterDetailPage(doc, data) {
    doc.addPage();
    this.addPageHeader(doc);  // Add logo to header

    const margin = 50;
    const contentWidth = 495;
    const TEAL = '#121e36';
    const DARK_GRAY = '#000000';
    const LIGHT_GRAY = '#000000';

    // Header bar - moved down to avoid logo overlap
    doc.rect(margin, 70, contentWidth, 40).fill(TEAL);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text(data.title, margin, 82, { width: contentWidth, align: 'center' });

    let yPos = 120;

    // === HIGH SECTION ===
    doc.fontSize(12).font('Helvetica-Bold').fillColor(TEAL)
       .text('>> ' + data.highTitle, margin, yPos);
    yPos += 18;

    // High description box
    doc.roundedRect(margin, yPos, contentWidth, 45, 6).fill('#E8F5E9').stroke('#4CAF50');
    doc.fontSize(8).font('Helvetica').fillColor(DARK_GRAY)
       .text(data.highDesc, margin + 10, yPos + 8, { width: contentWidth - 20, lineGap: 2 });
    yPos += 52;

    // High implications
    doc.fontSize(10).font('Helvetica-Bold').fillColor(TEAL)
       .text('Implications:', margin, yPos);
    yPos += 14;

    data.highImplications.forEach(point => {
      doc.circle(margin + 8, yPos + 4, 2).fill(TEAL);
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GRAY)
         .text(point, margin + 16, yPos, { width: contentWidth - 20, lineGap: 1 });
      yPos += doc.heightOfString(point, { width: contentWidth - 20 }) + 5;
    });

    yPos += 12;

    // === LOW SECTION ===
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#E57373')
       .text('>> ' + data.lowTitle, margin, yPos);
    yPos += 18;

    // Low description box
    doc.roundedRect(margin, yPos, contentWidth, 45, 6).fill('#FFEBEE').stroke('#E57373');
    doc.fontSize(8).font('Helvetica').fillColor(DARK_GRAY)
       .text(data.lowDesc, margin + 10, yPos + 8, { width: contentWidth - 20, lineGap: 2 });
    yPos += 52;

    // Low implications
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#E57373')
       .text('Implications:', margin, yPos);
    yPos += 14;

    data.lowImplications.forEach(point => {
      doc.circle(margin + 8, yPos + 4, 2).fill('#E57373');
      doc.fontSize(8).font('Helvetica').fillColor(LIGHT_GRAY)
         .text(point, margin + 16, yPos, { width: contentWidth - 20, lineGap: 1 });
      yPos += doc.heightOfString(point, { width: contentWidth - 20 }) + 5;
    });

    yPos += 12;

    // === HOW TO IMPROVE SECTION ===
    const improveBoxHeight = 150;
    doc.roundedRect(margin, yPos, contentWidth, improveBoxHeight, 8).fill('#E3F2FD').stroke('#2196F3');

    // Extract parameter name for title
    const paramNameMatch = data.title.match(/^([A-Z\s&]+)/);
    const paramDisplayName = paramNameMatch ? paramNameMatch[1].trim() : 'This Parameter';

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1976D2')
       .text('How to Improve ' + paramDisplayName, margin + 12, yPos + 10);

    let improveY = yPos + 28;

    data.improvements.forEach((item, idx) => {
      // Number badge
      doc.circle(margin + 22, improveY + 5, 8).fill('#2196F3');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text(`${idx + 1}`, margin + 19, improveY + 2);

      // Title and description
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#1976D2')
         .text(item.title, margin + 38, improveY);
      doc.fontSize(7).font('Helvetica').fillColor(LIGHT_GRAY)
         .text(item.desc, margin + 38, improveY + 10, { width: contentWidth - 60, lineGap: 1 });
      improveY += 30;
    });

    this.addSimpleFooter(doc);
  }

  /**
   * Add header to PDF - Infographic Style
   */
  addHeader(doc) {
    // Bold colored header bar for infographic look (matching footer blue)
    doc.rect(0, 0, 595, 60)
       .fill('#121e36');

    // Add NeuroSense logo to top right (clinic's uploaded logo when set)
    try {
      if (this.clinicLogoPath && fs.existsSync(this.clinicLogoPath)) {
        // White chip keeps arbitrary clinic logos readable on the dark bar.
        require('./pdf/pdfStyles').drawClinicLogo(doc, this.clinicLogoPath, 494, 10, 88, 42);
      } else {
        const logoPath = path.join(__dirname, '../../public/assets/Layer_1.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 494, 12, { width: 88 });
        }
      }
    } catch (logoError) {
      console.log('Logo not found, continuing without it:', logoError.message);
    }

    // Left side text - positioned to not overlap with logo
    doc.fontSize(18)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('NeuroSense Report', 50, 12);

    // Subtitle and date on same line
    doc.fontSize(10)
       .fillColor('#A8D5FF')
       .font('Helvetica')
       .text('Brain Performance Analysis', 50, 35);

    // Date positioned below subtitle (left side, no overlap with logo)
    doc.fontSize(9)
       .fillColor('#E3F2FD')
       .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, 48);

    doc.moveDown(2);
  }

  /**
   * Add patient information - Infographic Style
   */
  addPatientInfo(doc) {
    const y = doc.y;

    // Colored info box for visual appeal - increased height for more fields
    doc.roundedRect(50, y, 495, 85, 5)
       .fillAndStroke('#F7FAFC', '#E2E8F0');

    doc.fontSize(11)
       .fillColor('#121e36')
       .font('Helvetica-Bold')
       .text('Patient Information', 60, y + 10);

    // Row 1: Name and Date of Recording (properly aligned)
    const col1X = 60;
    const col1ValueX = 145;
    const col2X = 310;
    const col2ValueX = 430;

    doc.fontSize(9)
       .fillColor('#4A5568')
       .font('Helvetica-Bold')
       .text('Name:', col1X, y + 28)
       .font('Helvetica')
       .fillColor('#2D3748')
       .text(this.patientData.name || 'N/A', col1ValueX, y + 28);

    doc.font('Helvetica-Bold')
       .fillColor('#4A5568')
       .text('Date of Recording:', col2X, y + 28)
       .font('Helvetica')
       .fillColor('#2D3748')
       .text(this.patientData.dateOfRecording || this.patientData.recordingDate || new Date().toLocaleDateString('en-US'), col2ValueX, y + 28);

    // Row 2: Age and Clinic (properly aligned)
    doc.font('Helvetica-Bold')
       .fillColor('#4A5568')
       .text('Age:', col1X, y + 45)
       .font('Helvetica')
       .fillColor('#2D3748')
       .text(`${this.patientData.age || 'N/A'}`, col1ValueX, y + 45);

    if (this.patientData.clinicName) {
      doc.font('Helvetica-Bold')
         .fillColor('#4A5568')
         .text('Clinic:', col2X, y + 45)
         .font('Helvetica')
         .fillColor('#2D3748')
         .text(this.patientData.clinicName, col2ValueX, y + 45);
    }

    // Row 3: Gender and Handedness (properly aligned)
    doc.font('Helvetica-Bold')
       .fillColor('#4A5568')
       .text('Gender:', col1X, y + 62)
       .font('Helvetica')
       .fillColor('#2D3748')
       .text(this.patientData.gender || 'N/A', col1ValueX, y + 62);

    doc.font('Helvetica-Bold')
       .fillColor('#4A5568')
       .text('Handedness:', col2X, y + 62)
       .font('Helvetica')
       .fillColor('#2D3748')
       .text(this.patientData.handedness || 'N/A', col2ValueX, y + 62);

    doc.moveDown(2.5);
  }

  /**
   * Add watermark/header to current page - Now adds logo header
   */
  addWatermark(doc) {
    // Add logo header instead of watermark
    this.addPageHeader(doc);
  }

  /**
   * Add compact parameter card - Each parameter on its own page
   * Shows parameter with teal header, value subtitle, description, and Key Metrics
   */
  addCompactParameterCard(doc, param, index) {
    // Each parameter starts on a new page
    doc.addPage();
    this.addPageHeader(doc);  // Add logo to header

    const pageWidth = 595;
    const cardX = 50;
    const cardY = 60;
    const cardWidth = pageWidth - 100;

    // Get the main value from subparameters for display
    const paramValue = this.getParameterMainValue(param);
    const paramDisplayName = param.name.toUpperCase();

    // === HEADER BAR - Blue with parameter name ===
    const headerHeight = 35;
    doc.rect(cardX, cardY, cardWidth, headerHeight).fill('#121e36');

    // Parameter name (centered, uppercase, bold)
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#FFFFFF')
       .text(paramDisplayName, cardX, cardY + 10, { width: cardWidth, align: 'center', lineBreak: false });

    // === MINIMALIST BRAIN ICON ===
    const iconY = cardY + headerHeight + 55; // Position below header
    const iconSize = 70; // Size of the brain icon
    this.drawMinimalistBrainIcon(doc, cardX + cardWidth / 2, iconY, iconSize);

    // === SUBTITLE - "Your [Parameter] is [value]" ===
    const subtitleY = cardY + headerHeight + 105; // Moved down to accommodate icon
    const valueText = paramValue ? `Your ${param.name} is ${paramValue}` : `Your ${param.name} Assessment`;

    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#000000')
       .text(valueText, cardX, subtitleY, { width: cardWidth, align: 'center', lineBreak: false });

    // === DESCRIPTION BOX ===
    const descBoxY = subtitleY + 35;
    const descBoxHeight = 80;
    const description = param.summary || this.getCompactDescription(param.name, param.bucket);

    // Light gray background for description
    doc.roundedRect(cardX, descBoxY, cardWidth, descBoxHeight, 8).fill('#F5F5F5');

    // Description text
    const truncDesc = description.length > 300 ? description.substring(0, 300) + '...' : description;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#4A5568')
       .text(truncDesc, cardX + 15, descBoxY + 15, { width: cardWidth - 30, height: descBoxHeight - 20, lineBreak: true });

    // === KEY METRICS SECTION ===
    let currentY = descBoxY + descBoxHeight + 25;

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#121e36')
       .text('Key Metrics:', cardX, currentY, { lineBreak: false });

    currentY += 25;

    // Add metrics - limit to 3 with highlighted values
    const subparams = param.subparameters || [];
    const maxMetrics = Math.min(subparams.length, 3);

    for (let i = 0; i < maxMetrics; i++) {
      const metric = subparams[i];
      const metricName = metric.name || 'Metric';
      const metricValue = this.formatMetricDisplayValue(metric);
      const interpretation = metric.interpretation || '';

      // Metric name (bold)
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#2D3748')
         .text(`• ${metricName}`, cardX, currentY, { lineBreak: false });

      currentY += 18;

      // Interpretation (if available)
      if (interpretation) {
        const truncatedInterp = interpretation.length > 120
          ? interpretation.substring(0, 120) + '...'
          : interpretation;

        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#000000')
           .text(truncatedInterp, cardX + 15, currentY, { width: cardWidth - 30, lineBreak: true });

        currentY += doc.heightOfString(truncatedInterp, { width: cardWidth - 30 }) + 5;
      }

      // Value displayed below (plain text, no highlight)
      if (metricValue) {
        doc.fontSize(9).font('Helvetica').fillColor('#121e36')
           .text(`Value: ${metricValue}`, cardX + 15, currentY);
        currentY += 18;
      } else {
        currentY += 10;
      }
    }

    // Add footer
    this.addPageFooter(doc, index + 3);

    console.log(`   ✅ Added card for ${param.name}`);
  }

  /**
   * Get the main value to display for a parameter (from first subparameter)
   */
  getParameterMainValue(param) {
    const subparams = param.subparameters || [];
    if (subparams.length > 0 && subparams[0].value !== undefined) {
      const val = subparams[0].value;
      if (val === 'Indeterminate' || (typeof val === 'number' && !Number.isFinite(val))) {
        return 'Indeterminate';
      }
      if (typeof val === 'number' && Number.isFinite(val)) {
        return val.toFixed(1);
      } else if (typeof val === 'object') {
        // Return first numeric value from object
        for (const key in val) {
          if (typeof val[key] === 'number' && Number.isFinite(val[key])) {
            return val[key].toFixed(1);
          }
        }
      }
      return val;
    }
    return null;
  }

  /**
   * Format metric value for display in Key Metrics section
   * Handles numbers, objects with numbers, and objects with string numbers
   */
  formatMetricDisplayValue(metric) {
    if (metric.value === undefined || metric.value === null) {
      return '';
    }

    // Handle Indeterminate values (Infinity/NaN from calculations)
    if (metric.value === 'Indeterminate' || (typeof metric.value === 'number' && !Number.isFinite(metric.value))) {
      return 'Indeterminate';
    }

    let result = '';

    if (typeof metric.value === 'number' && Number.isFinite(metric.value)) {
      result = metric.value.toFixed(2);
    } else if (typeof metric.value === 'object') {
      const parts = [];
      for (const key in metric.value) {
        const val = metric.value[key];
        if (typeof val === 'number' && Number.isFinite(val)) {
          parts.push(`${key}: ${val.toFixed(2)}`);
        } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
          // Handle string numbers (like "0.87" from toFixed)
          parts.push(`${key}: ${val}`);
        } else if (val !== undefined && val !== null) {
          parts.push(`${key}: ${val}`);
        }
      }
      result = parts.length > 0 ? parts.join(', ') : '';
    } else {
      result = String(metric.value);
    }

    return result;
  }

  /**
   * Get compact description for parameter based on bucket
   */
  getCompactDescription(paramName, bucket) {
    const descriptions = {
      'Cognition': {
        'Low': "Your brain's overall mental processing and focus ability need attention.",
        'Medium': "Your brain's cognitive function shows moderate performance with room for improvement.",
        'High': "Excellent cognitive performance! Your brain shows strong mental processing abilities."
      },
      'Stress': {
        'Low': "Good news! Your brain shows low stress markers, indicating healthy relaxation.",
        'Medium': "Moderate stress levels detected, indicating room for improved relaxation.",
        'High': "Elevated stress levels detected. Consider stress management techniques."
      },
      'Focus & Attention': {
        'Low': "Significant challenges in maintaining concentration and mental alertness.",
        'Medium': "Moderate focus ability with some room for improvement in sustained attention.",
        'High': "Strong focus and attention capabilities. Excellent mental alertness."
      },
      'Burnout & Fatigue': {
        'Low': "Good news! Your brain shows low markers for burnout and fatigue.",
        'Medium': "Some signs of mental fatigue detected. Consider rest and recovery strategies.",
        'High': "Significant burnout markers detected. Prioritize rest and recovery."
      },
      'Emotional Regulation': {
        'Low': "Your brain's emotional stability and control may need significant support.",
        'Medium': "Moderate emotional regulation with opportunities for improvement.",
        'High': "Excellent emotional regulation! Strong ability to manage emotional responses."
      },
      'Learning': {
        'Low': "Areas for improvement in cognitive flexibility and memory formation.",
        'Medium': "Moderate learning capacity with room for enhanced information processing.",
        'High': "Strong learning capacity! Excellent cognitive flexibility and memory."
      },
      'Creativity': {
        'Low': "Creative potential can be enhanced through targeted practices.",
        'Medium': "Good creative potential, with opportunities to enhance divergent thinking.",
        'High': "Excellent creative potential! Strong divergent thinking abilities."
      }
    };

    return descriptions[paramName]?.[bucket] || `${paramName} is at ${bucket} level based on QEEG analysis.`;
  }

  /**
   * Get detailed parameter description based on score
   * Provides comprehensive content for each parameter
   */
  getDetailedParameterDescription(paramName, score, maxScore, bucket) {
    const name = paramName.toLowerCase();

    // Use bucket/classification directly when available, fallback to score-based mapping
    // Algorithm: Stress/Burnout score = RED count (0=Low/best, 1=Mild, 2=Moderate, 3=Severe/worst)
    // Algorithm: Other params score = GREEN count (0-1=Low, 2=Medium, 3=High/best)
    const isStressBurnout = name.includes('stress') || name.includes('burnout') || name.includes('fatigue');
    let scoreLevel;

    // Prefer bucket from algorithm classification
    const bucketLower = (bucket || '').toLowerCase().trim();
    if (bucketLower) {
      // Map bucket to description key
      if (bucketLower === 'low') scoreLevel = isStressBurnout ? 'low' : 'low';
      else if (bucketLower === 'mild') scoreLevel = 'mild';
      else if (bucketLower === 'medium' || bucketLower === 'moderate') scoreLevel = 'moderate';
      else if (bucketLower === 'high' || bucketLower === 'severe') scoreLevel = isStressBurnout ? 'severe' : 'severe';
      else scoreLevel = 'low'; // default
    } else {
      // Fallback: compute from score
      if (isStressBurnout) {
        // score = RED count: 0=Low, 1=Mild, 2=Moderate, 3=Severe
        scoreLevel = score === 0 ? 'low' : (score === 1 ? 'mild' : (score === 2 ? 'moderate' : 'severe'));
      } else {
        scoreLevel = score === 0 ? 'low' : (score === 1 ? 'mild' : (score === 2 ? 'moderate' : 'severe'));
      }
    }

    const detailedDescriptions = {
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

    // Find matching parameter
    let paramKey = null;
    if (name.includes('cognition')) paramKey = 'cognition';
    else if (name.includes('stress')) paramKey = 'stress';
    else if (name.includes('focus') || name.includes('attention')) paramKey = 'focus & attention';
    else if (name.includes('burnout') || name.includes('fatigue')) paramKey = 'burnout & fatigue';
    else if (name.includes('emotional') || name.includes('regulation')) paramKey = 'emotional regulation';
    else if (name.includes('learning')) paramKey = 'learning';
    else if (name.includes('creativity')) paramKey = 'creativity';

    if (paramKey && detailedDescriptions[paramKey]) {
      return detailedDescriptions[paramKey][scoreLevel] || detailedDescriptions[paramKey]['moderate'] || detailedDescriptions[paramKey]['mild'] || detailedDescriptions[paramKey]['medium'];
    }

    return `Your ${paramName} score of ${score}/${maxScore} indicates ${bucket || scoreLevel} level performance based on comprehensive QEEG analysis. This measurement reflects your brain's current state in this domain.`;
  }

  /**
   * Add parameter section - Full Page Design (kept for reference, not used in new format)
   */
  addParameterSection(doc, param, index) {
    // Always start each parameter on a new page
    doc.addPage();

    // Add NEUROSENSE logo in top right
    this.addTopRightLogo(doc);

    // Teal header bar with parameter name - moved down to avoid logo overlap
    const headerY = 70;
    const headerHeight = 40;
    doc.rect(100, headerY, 350, headerHeight).fill('#5BBFBA'); // Teal color

    doc.fontSize(22)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text(param.name.toUpperCase(), 100, headerY + 10, { width: 350, align: 'center' });

    // Draw brain icon below header
    const brainY = headerY + headerHeight + 20;
    this.drawSimpleBrainIcon(doc, 297.5, brainY + 40, 60);

    // Description box
    const descY = brainY + 100;
    const description = this.getParameterDescription(param.name);

    doc.roundedRect(50, descY, 495, 70, 5)
       .strokeColor('#CCCCCC')
       .lineWidth(1)
       .stroke();

    doc.fontSize(10)
       .fillColor('#000000')
       .font('Helvetica')
       .text(description, 60, descY + 10, {
         width: 475,
         align: 'justify',
         lineGap: 3
       });

    // High and Low sections side by side
    const sectionY = descY + 90;
    const sectionWidth = 240;
    const sectionHeight = 200;
    const gapBetween = 15;

    // Left section - High [Parameter]
    this.drawHighLowSection(doc, 50, sectionY, sectionWidth, sectionHeight, param.name, 'High', '#D6EAF8');

    // Right section - Implications
    this.drawImplicationsSection(doc, 50 + sectionWidth + gapBetween, sectionY, sectionWidth, sectionHeight, param.name, 'High', '#D6EAF8');

    // Second row - Low [Parameter] and Implications
    const section2Y = sectionY + sectionHeight + 20;

    // Left section - Low [Parameter]
    this.drawHighLowSection(doc, 50, section2Y, sectionWidth, sectionHeight, param.name, 'Low', '#D6EAF8');

    // Right section - Implications
    this.drawImplicationsSection(doc, 50 + sectionWidth + gapBetween, section2Y, sectionWidth, sectionHeight, param.name, 'Low', '#D6EAF8');

    // Add page footer
    this.addPageFooter(doc, index + 1);

    console.log(`   ✅ Added full page for ${param.name}`);
  }

  /**
   * Draw simple brain icon
   */
  drawSimpleBrainIcon(doc, centerX, centerY, size) {
    doc.save();
    doc.strokeColor('#6B9BD1').lineWidth(2);

    // Left hemisphere
    doc.ellipse(centerX - size * 0.25, centerY, size * 0.4, size * 0.45).stroke();

    // Right hemisphere
    doc.ellipse(centerX + size * 0.25, centerY, size * 0.4, size * 0.45).stroke();

    // Brain folds (simplified wavy lines)
    for (let i = 0; i < 4; i++) {
      const y = centerY - size * 0.25 + i * size * 0.15;
      // Left side
      doc.moveTo(centerX - size * 0.5, y)
         .quadraticCurveTo(centerX - size * 0.25, y - 8, centerX - size * 0.05, y)
         .stroke();
      // Right side
      doc.moveTo(centerX + size * 0.05, y)
         .quadraticCurveTo(centerX + size * 0.25, y + 8, centerX + size * 0.5, y)
         .stroke();
    }

    doc.restore();
  }

  /**
   * Draw minimalist brain icon - thick blue line art style
   * Matches reference design with cerebral folds
   */
  drawMinimalistBrainIcon(doc, centerX, centerY, size) {
    doc.save();

    const s = size; // Scale factor
    const lineWidth = s * 0.04; // Thick lines

    doc.strokeColor('#121e36').lineWidth(lineWidth).lineCap('round').lineJoin('round');

    // Main brain outline - left hemisphere
    doc.moveTo(centerX - s * 0.02, centerY - s * 0.35)
       .bezierCurveTo(
         centerX - s * 0.35, centerY - s * 0.4,
         centerX - s * 0.55, centerY - s * 0.25,
         centerX - s * 0.5, centerY + s * 0.05
       )
       .bezierCurveTo(
         centerX - s * 0.48, centerY + s * 0.25,
         centerX - s * 0.35, centerY + s * 0.4,
         centerX - s * 0.15, centerY + s * 0.35
       )
       .bezierCurveTo(
         centerX - s * 0.05, centerY + s * 0.32,
         centerX - s * 0.02, centerY + s * 0.25,
         centerX, centerY + s * 0.2
       )
       .stroke();

    // Main brain outline - right hemisphere
    doc.moveTo(centerX + s * 0.02, centerY - s * 0.35)
       .bezierCurveTo(
         centerX + s * 0.35, centerY - s * 0.4,
         centerX + s * 0.55, centerY - s * 0.25,
         centerX + s * 0.5, centerY + s * 0.05
       )
       .bezierCurveTo(
         centerX + s * 0.48, centerY + s * 0.25,
         centerX + s * 0.35, centerY + s * 0.4,
         centerX + s * 0.15, centerY + s * 0.35
       )
       .bezierCurveTo(
         centerX + s * 0.05, centerY + s * 0.32,
         centerX + s * 0.02, centerY + s * 0.25,
         centerX, centerY + s * 0.2
       )
       .stroke();

    // Top connection
    doc.moveTo(centerX - s * 0.02, centerY - s * 0.35)
       .bezierCurveTo(
         centerX - s * 0.01, centerY - s * 0.38,
         centerX + s * 0.01, centerY - s * 0.38,
         centerX + s * 0.02, centerY - s * 0.35
       )
       .stroke();

    // Cerebral folds - left side (3 curved lines)
    // Top fold
    doc.moveTo(centerX - s * 0.42, centerY - s * 0.15)
       .bezierCurveTo(
         centerX - s * 0.32, centerY - s * 0.22,
         centerX - s * 0.18, centerY - s * 0.18,
         centerX - s * 0.08, centerY - s * 0.12
       )
       .stroke();

    // Middle fold
    doc.moveTo(centerX - s * 0.48, centerY + s * 0.02)
       .bezierCurveTo(
         centerX - s * 0.35, centerY - s * 0.05,
         centerX - s * 0.2, centerY + s * 0.02,
         centerX - s * 0.08, centerY + s * 0.05
       )
       .stroke();

    // Bottom fold
    doc.moveTo(centerX - s * 0.4, centerY + s * 0.2)
       .bezierCurveTo(
         centerX - s * 0.3, centerY + s * 0.12,
         centerX - s * 0.2, centerY + s * 0.18,
         centerX - s * 0.12, centerY + s * 0.22
       )
       .stroke();

    // Cerebral folds - right side (3 curved lines)
    // Top fold
    doc.moveTo(centerX + s * 0.42, centerY - s * 0.15)
       .bezierCurveTo(
         centerX + s * 0.32, centerY - s * 0.22,
         centerX + s * 0.18, centerY - s * 0.18,
         centerX + s * 0.08, centerY - s * 0.12
       )
       .stroke();

    // Middle fold
    doc.moveTo(centerX + s * 0.48, centerY + s * 0.02)
       .bezierCurveTo(
         centerX + s * 0.35, centerY - s * 0.05,
         centerX + s * 0.2, centerY + s * 0.02,
         centerX + s * 0.08, centerY + s * 0.05
       )
       .stroke();

    // Bottom fold
    doc.moveTo(centerX + s * 0.4, centerY + s * 0.2)
       .bezierCurveTo(
         centerX + s * 0.3, centerY + s * 0.12,
         centerX + s * 0.2, centerY + s * 0.18,
         centerX + s * 0.12, centerY + s * 0.22
       )
       .stroke();

    // Brain stem
    doc.moveTo(centerX - s * 0.08, centerY + s * 0.3)
       .bezierCurveTo(
         centerX - s * 0.1, centerY + s * 0.38,
         centerX + s * 0.1, centerY + s * 0.38,
         centerX + s * 0.08, centerY + s * 0.3
       )
       .stroke();

    doc.restore();
  }

  /**
   * Draw High/Low section box
   */
  drawHighLowSection(doc, x, y, width, height, paramName, level, bgColor) {
    // Background
    doc.roundedRect(x, y, width, height, 8).fill(bgColor);

    // Brain icon in circle at top
    const iconY = y + 25;
    doc.save();
    doc.circle(x + width / 2, iconY, 20)
       .strokeColor('#6B9BD1')
       .lineWidth(1.5)
       .stroke();

    // Simple brain shape inside
    doc.ellipse(x + width / 2 - 5, iconY, 8, 10).stroke();
    doc.ellipse(x + width / 2 + 5, iconY, 8, 10).stroke();
    doc.restore();

    // Header bar
    const headerBarY = y + 55;
    doc.roundedRect(x + 20, headerBarY, width - 40, 28, 5).fill('#5BBFBA');

    doc.fontSize(12)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text(`${level} ${paramName}`, x + 20, headerBarY + 8, { width: width - 40, align: 'center' });

    // Description text
    const textY = headerBarY + 40;
    const description = this.getHighLowDescription(paramName, level);

    doc.fontSize(9)
       .fillColor('#000000')
       .font('Helvetica')
       .text(description, x + 15, textY, {
         width: width - 30,
         align: 'justify',
         lineGap: 2
       });
  }

  /**
   * Draw Implications section box
   */
  drawImplicationsSection(doc, x, y, width, height, paramName, level, bgColor) {
    // Background
    doc.roundedRect(x, y, width, height, 8).fill(bgColor);

    // Settings icon in circle at top
    const iconY = y + 25;
    doc.save();
    doc.circle(x + width / 2, iconY, 20)
       .strokeColor('#6B9BD1')
       .lineWidth(1.5)
       .stroke();

    // Simple gear/cog shape
    doc.circle(x + width / 2, iconY, 8).stroke();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const innerR = 10;
      const outerR = 15;
      doc.moveTo(x + width / 2 + innerR * Math.cos(angle), iconY + innerR * Math.sin(angle))
         .lineTo(x + width / 2 + outerR * Math.cos(angle), iconY + outerR * Math.sin(angle))
         .stroke();
    }
    doc.restore();

    // Header bar
    const headerBarY = y + 55;
    doc.roundedRect(x + 20, headerBarY, width - 40, 28, 5).fill('#5BBFBA');

    doc.fontSize(12)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('Implications', x + 20, headerBarY + 8, { width: width - 40, align: 'center' });

    // Bullet points
    const textY = headerBarY + 40;
    const implications = this.getImplications(paramName, level);

    doc.fontSize(8)
       .fillColor('#000000')
       .font('Helvetica');

    let currentY = textY;
    implications.forEach((item) => {
      doc.text(`• ${item}`, x + 15, currentY, {
        width: width - 30,
        align: 'left',
        lineGap: 2
      });
      currentY = doc.y + 5;
    });
  }

  /**
   * Get parameter description
   */
  getParameterDescription(paramName) {
    const descriptions = {
      'Cognition': 'Cognition encompasses multiple mental functions, including memory, learning, reasoning, and problem-solving. Strong cognitive abilities support decision-making, information retention, and the ability to adapt to new challenges. This metric evaluates an individual\'s overall cognitive efficiency and processing speed.',
      'Stress': 'Stress reflects the brain\'s response to internal and external pressures. While some stress can enhance performance, chronic or excessive stress can impair cognitive function, emotional regulation, and physical health. This metric assesses the brain\'s stress activation patterns.',
      'Focus & Attention': 'Focus and attention measure the brain\'s ability to concentrate on specific tasks while filtering out distractions. Strong attention skills are essential for learning, productivity, and task completion. This metric evaluates sustained attention and mental alertness.',
      'Burnout & Fatigue': 'Burnout and fatigue indicate mental exhaustion resulting from prolonged stress or overwork. This state affects cognitive performance, emotional stability, and overall well-being. This metric assesses signs of mental tiredness and recovery capacity.',
      'Emotional Regulation': 'Emotional regulation refers to the ability to manage and respond to emotional experiences appropriately. Good emotional regulation supports mental health, relationships, and decision-making. This metric evaluates emotional balance and stability.',
      'Learning': 'Learning capacity reflects the brain\'s ability to acquire, process, and retain new information. Strong learning abilities support academic achievement, skill development, and adaptation. This metric evaluates the brain\'s readiness for learning.',
      'Creativity': 'Creativity involves the ability to generate novel ideas, think flexibly, and solve problems in innovative ways. Creative thinking supports innovation, artistic expression, and adaptive problem-solving. This metric evaluates creative potential and ideation capacity.'
    };
    return descriptions[paramName] || `This metric evaluates ${paramName.toLowerCase()} based on QEEG brainwave analysis.`;
  }

  /**
   * Get High/Low description for parameter
   */
  getHighLowDescription(paramName, level) {
    const descriptions = {
      'Cognition': {
        'High': 'Individuals with high cognitive function process and retain information quickly, demonstrating strong problem-solving skills and adaptability. They tend to have a high working memory capacity and can efficiently integrate new knowledge into existing frameworks.',
        'Low': 'Individuals with lower cognitive scores may experience slower information processing and challenges with memory retention. They might benefit from cognitive training exercises and strategies to enhance mental performance.'
      },
      'Stress': {
        'High': 'High stress levels indicate elevated brain arousal and activation of stress response systems. This may manifest as anxiety, difficulty relaxing, or heightened alertness. Stress management techniques may be beneficial.',
        'Low': 'Low stress levels indicate a calm, relaxed brain state with well-regulated stress response. This supports clear thinking, emotional balance, and overall well-being.'
      },
      'Focus & Attention': {
        'High': 'High focus indicates strong ability to concentrate and maintain attention on tasks. Individuals can effectively filter distractions and sustain mental effort for extended periods.',
        'Low': 'Lower focus scores may indicate difficulty maintaining concentration or increased distractibility. Attention training and environmental modifications may help improve focus.'
      },
      'Burnout & Fatigue': {
        'High': 'High burnout scores indicate significant mental exhaustion and depleted cognitive resources. Rest, recovery strategies, and workload management are recommended.',
        'Low': 'Low burnout indicates good mental energy reserves and adequate recovery. The brain shows healthy patterns of rest and restoration.'
      },
      'Emotional Regulation': {
        'High': 'Strong emotional regulation indicates ability to manage emotional responses effectively. Individuals can maintain composure under pressure and adapt to emotional challenges.',
        'Low': 'Lower scores may indicate difficulty managing emotional responses or increased emotional reactivity. Mindfulness and emotional awareness practices may be helpful.'
      },
      'Learning': {
        'High': 'High learning capacity indicates optimal brain states for acquiring new information. The brain shows patterns associated with attention, memory encoding, and cognitive flexibility.',
        'Low': 'Lower learning scores may indicate suboptimal conditions for information acquisition. Strategies to enhance focus and reduce interference may support learning.'
      },
      'Creativity': {
        'High': 'High creativity scores indicate brain patterns associated with divergent thinking and idea generation. The balance of relaxation and alertness supports innovative thinking.',
        'Low': 'Lower creativity scores may indicate more convergent thinking patterns. Relaxation techniques and creative exercises may help unlock creative potential.'
      }
    };
    return descriptions[paramName]?.[level] || `${level} ${paramName.toLowerCase()} levels based on QEEG analysis.`;
  }

  /**
   * Get implications for High/Low parameter
   */
  getImplications(paramName, level) {
    const implications = {
      'Cognition': {
        'High': [
          'Quick learning and efficient information processing',
          'Strong reasoning and decision-making abilities',
          'Mental agility for switching between tasks',
          'Enhanced problem-solving capabilities'
        ],
        'Low': [
          'May benefit from cognitive enhancement strategies',
          'Consider brain training exercises',
          'Focus on one task at a time',
          'Use external aids for memory support'
        ]
      },
      'Stress': {
        'High': [
          'Consider stress reduction techniques',
          'Practice relaxation and mindfulness',
          'Evaluate workload and responsibilities',
          'Prioritize rest and recovery time'
        ],
        'Low': [
          'Good baseline for mental performance',
          'Supports clear thinking and focus',
          'Favorable for learning new skills',
          'Indicates healthy stress regulation'
        ]
      },
      'Focus & Attention': {
        'High': [
          'Excellent for demanding cognitive tasks',
          'Supports academic and professional success',
          'Effective filtering of distractions',
          'Sustained concentration ability'
        ],
        'Low': [
          'Consider attention training exercises',
          'Minimize environmental distractions',
          'Break tasks into smaller segments',
          'Use timers and structured schedules'
        ]
      },
      'Burnout & Fatigue': {
        'High': [
          'Prioritize rest and sleep quality',
          'Consider reducing cognitive load',
          'Practice energy management strategies',
          'Seek support if persistent'
        ],
        'Low': [
          'Good mental energy reserves',
          'Adequate recovery from demands',
          'Supports sustained performance',
          'Healthy work-rest balance'
        ]
      },
      'Emotional Regulation': {
        'High': [
          'Effective stress management ability',
          'Stable mood and emotional responses',
          'Good interpersonal relationships',
          'Resilience under pressure'
        ],
        'Low': [
          'Practice emotional awareness',
          'Consider mindfulness techniques',
          'Develop coping strategies',
          'Seek support when needed'
        ]
      },
      'Learning': {
        'High': [
          'Optimal state for acquiring new skills',
          'Efficient memory consolidation',
          'Good cognitive flexibility',
          'Supports academic achievement'
        ],
        'Low': [
          'Optimize learning environment',
          'Use multimodal learning approaches',
          'Ensure adequate rest before learning',
          'Practice retrieval-based learning'
        ]
      },
      'Creativity': {
        'High': [
          'Excellent for brainstorming and ideation',
          'Flexible and divergent thinking',
          'Innovation and problem-solving strength',
          'Artistic and expressive potential'
        ],
        'Low': [
          'Try relaxation before creative tasks',
          'Practice free association exercises',
          'Explore new experiences and stimuli',
          'Allow unstructured thinking time'
        ]
      }
    };
    return implications[paramName]?.[level] || ['Assessment based on QEEG analysis'];
  }

  /**
   * Add summary section - Centered layout without color coding (no overflow)
   */
  addSummarySection(doc, summary) {
    const cardX = 50;
    const cardWidth = 495;
    const y = 50;

    // Blue colored banner for summary
    doc.rect(cardX, y, cardWidth, 35).fill('#121e36');

    doc.fontSize(16)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('Overall Brain Health Summary', cardX + 10, y + 10, { lineBreak: false });

    const contentY = y + 45;

    // Summary content box
    doc.rect(cardX, contentY, cardWidth, 80).fillAndStroke('#F3F4F6', '#9CA3AF');

    // Truncate summary
    const truncatedSummary = summary.length > 300 ? summary.substring(0, 300) + '...' : summary;

    doc.fontSize(10)
       .fillColor('#2D3748')
       .font('Helvetica')
       .text(truncatedSummary, cardX + 10, contentY + 10, { width: cardWidth - 20, height: 65, lineBreak: true });

    doc.y = contentY + 95;
  }

  /**
   * Add recommendations - Centered layout without color coding (no auto page breaks)
   */
  addRecommendations(doc, recommendations) {
    const cardX = 50;
    const cardWidth = 495;
    const y = doc.y + 10;

    // Blue colored banner for recommendations
    doc.rect(cardX, y, cardWidth, 35).fill('#121e36');

    doc.fontSize(16)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('Personalized Recommendations', cardX + 10, y + 10, { lineBreak: false });

    let currentY = y + 50;

    // Limit to 5 recommendations to fit on page
    const maxRecs = Math.min(recommendations.length, 5);

    for (let idx = 0; idx < maxRecs; idx++) {
      const rec = recommendations[idx];

      // Stop if too close to footer
      if (currentY > 700) break;

      // Blue numbered badge
      doc.rect(cardX + 5, currentY, 22, 20).fill('#121e36');

      doc.fontSize(11)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text(`${idx + 1}`, cardX + 5, currentY + 5, { width: 22, align: 'center', lineBreak: false });

      // Truncate recommendation text
      const truncRec = rec.length > 120 ? rec.substring(0, 120) + '...' : rec;

      doc.fontSize(10)
         .fillColor('#2D3748')
         .font('Helvetica')
         .text(truncRec, cardX + 35, currentY, { width: cardWidth - 45, height: 40, lineBreak: true });

      currentY += 55;
    }

    doc.y = currentY;
  }

  /**
   * Add footer - Blue bar with white text (matching NeuroSense branding)
   */
  addFooter(doc) {
    // Save current Y position
    const savedY = doc.y;
    const footerY = 800;
    const rightMargin = 565;

    // Blue footer bar
    doc.rect(0, footerY, 595, 42).fill('#121e36');

    // Disclaimer text - use lineBreak: false to prevent page breaks
    doc.fillColor('#FFFFFF')
       .font('Helvetica')
       .fontSize(8)
       .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.',
             50, footerY + 15, { width: 320, lineBreak: false });

    // Website URL — right aligned to page edge
    doc.fillColor('#FFFFFF')
       .font('Helvetica')
       .fontSize(10)
       .text('limitlessbrainlab-eight.vercel.app', 30, footerY + 15, { width: rightMargin - 30, align: 'right', lineBreak: false });

    // Restore Y position
    doc.y = savedY;
  }

  /**
   * Get score color based on score value
   * Normal params: Low=Red, Medium=Orange, High=Green
   * Stress/Burnout: score = count of RED sub-params → Low(0)=Green, Mild(1)=Amber, Moderate(2)=Orange, Severe(3)=Red
   */
  getScoreColor(score, maxScore, parameterName = '') {
    const isInvertedParameter = parameterName === 'Stress' || parameterName === 'Burnout & Fatigue';

    if (isInvertedParameter) {
      // Stress/Burnout: score = count of RED sub-params (0=best, 3=worst)
      if (score === 0) return '#38A169';    // Green (0/3 red = Low = no issues)
      if (score === 1) return '#ED8936';    // Amber (1/3 red = Mild)
      if (score === 2) return '#ED8936';    // Orange (2/3 red = Moderate)
      return '#E53E3E';                     // Red (3/3 red = Severe)
    } else {
      // NORMAL: Low=Red, Medium=Orange, High=Green
      const percentage = (score / maxScore) * 100;
      if (percentage <= 40) return '#E53E3E';    // Red (Low)
      if (percentage <= 70) return '#ED8936';    // Orange (Medium)
      return '#38A169';                          // Green (High)
    }
  }

  /**
   * Get color for bucket classification
   * For Stress/Burnout: Low=Green (good), High=Red (bad) - INVERTED
   * For other parameters: Low=Red, Medium=Orange, High=Green - NORMAL
   */
  getBucketColor(bucketOrColor, parameterName = '') {
    // If it's already a hex color
    if (bucketOrColor && bucketOrColor.startsWith('#')) {
      return bucketOrColor;
    }

    const isInvertedParameter = parameterName === 'Stress' || parameterName === 'Burnout & Fatigue';

    if (isInvertedParameter) {
      // Stress/Burnout: score = count of RED sub-params
      // Low(0/3)=Green, Mild(1/3)=Amber, Moderate(2/3)=Orange, Severe(3/3)=Red
      const invertedColorMap = {
        'Low': '#38A169',           // Green (0/3 red = no issues = best)
        'Mild': '#ED8936',          // Amber (1/3 red = mild)
        'Moderate': '#ED8936',      // Orange (2/3 red = moderate)
        'Severe': '#E53E3E',        // Red (3/3 red = severe = worst)
        'High': '#E53E3E',          // Red (fallback for old label)
        'Medium': '#ED8936'         // Orange (fallback for old label)
      };
      return invertedColorMap[bucketOrColor] || '#4299E1';
    } else {
      // NORMAL color mapping for other parameters
      const colorMap = {
        'Low': '#E53E3E',          // Red
        'Medium': '#ED8936',       // Orange
        'High': '#38A169',         // Green
        'Poor': '#E53E3E',        // Red
        'Mild': '#F56565',        // Light Red
        'Average': '#ED8936',      // Orange
        'Moderate': '#ED8936',     // Orange
        'Good': '#48BB78',         // Green
        'Excellent': '#38A169'     // Dark Green
      };
      return colorMap[bucketOrColor] || '#4299E1';
    }
  }

  /**
   * Generate radar chart showing all 7 brain parameters
   * Returns Buffer containing PNG image
   */
  async generateRadarChart() {
    try {
      console.log('\n📊 Generating radar chart for 7 brain parameters...');

      // Extract parameter data — use bucket/classification for 3 discrete levels
      const parameters = this.algorithmResults.parameters || [];
      const labels = parameters.map(p => p.name);
      const scores = parameters.map(p => {
        const bucket = (p.bucket || p.classification || '').toLowerCase().trim();
        // Map bucket directly to radar ring level
        if (bucket === 'low') return 33.33;
        if (bucket === 'medium' || bucket === 'mild' || bucket === 'moderate') return 66.67;
        if (bucket === 'high' || bucket === 'severe') return 100;
        // Fallback: compute from score
        const isInverted = p.name === 'Stress' || p.name === 'Burnout & Fatigue';
        const maxScore = p.maxScore || 3;
        if (isInverted) {
          // score=RED count: 0=Low, 1-2=Medium, 3=High
          if (p.score === 0) return 33.33;
          if (p.score <= 2) return 66.67;
          return 100;
        } else {
          if (p.score >= maxScore) return 100;
          if (p.score >= maxScore - 1 && p.score > 0) return 66.67;
          return 33.33;
        }
      });

      console.log(`   Parameters: ${labels.join(', ')}`);
      console.log(`   Scores: ${scores.map(s => s.toFixed(0) + '%').join(', ')}`);

      // Create chart configuration
      const width = 600;
      const height = 600;
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

      const configuration = {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Brain Performance Score',
            data: scores,
            fill: true,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgb(54, 162, 235)',
            pointBackgroundColor: 'rgb(54, 162, 235)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(54, 162, 235)',
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: false,
          plugins: {
            title: {
              display: true,
              text: '7 Brain Health Parameters - Performance Overview',
              font: {
                size: 24,
                weight: 'bold'
              },
              color: '#121e36',
              padding: 20
            },
            legend: {
              display: false
            }
          },
          scales: {
            r: {
              angleLines: {
                display: true,
                color: '#E2E8F0'
              },
              grid: {
                color: '#E2E8F0'
              },
              pointLabels: {
                font: {
                  size: 14,
                  weight: 'bold'
                },
                color: '#121e36'
              },
              ticks: {
                beginAtZero: true,
                max: 100,
                stepSize: 25,
                callback: function(value) {
                  return value + '%';
                },
                backdropColor: 'transparent',
                color: '#718096',
                font: {
                  size: 12
                }
              },
              suggestedMin: 0,
              suggestedMax: 100
            }
          }
        }
      };

      // Generate chart image
      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
      console.log('✅ Radar chart generated successfully');
      console.log(`   Size: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`);

      return imageBuffer;
    } catch (error) {
      console.error('❌ Error generating radar chart:', error.message);
      console.error('   Stack:', error.stack);
      return null;
    }
  }

  /**
   * Add Extracted QEEG Data Section - Shows raw data extracted from uploaded PDFs
   */
  addExtractedDataSection(doc) {
    // Create new page for data section
    doc.addPage();
    this.addWatermark(doc);

    const y = doc.y;

    // Section header
    doc.roundedRect(50, y, 495, 35, 5)
       .fill('#121e36');

    doc.fontSize(16)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('📊 Extracted QEEG Data', 60, y + 10);

    doc.moveDown(2);

    // Description
    doc.fontSize(10)
       .fillColor('#4A5568')
       .font('Helvetica')
       .text('This section shows the raw brainwave data extracted from your uploaded Eye Open (EO) and Eye Closed (EC) reports.', 50, doc.y, { width: 495, align: 'left' });

    doc.moveDown(1);

    // === EYES OPEN DATA ===
    this.addDataTable(doc, 'Eyes Open (EO) - Absolute Power (μV²)', this.qeegData.EO?.absolute);
    doc.moveDown(0.5);
    this.addDataTable(doc, 'Eyes Open (EO) - Relative Power (%)', this.qeegData.EO?.relative);

    // Check if we need new page
    if (doc.y > 650) {
      doc.addPage();
      this.addWatermark(doc);
    }

    doc.moveDown(0.5);

    // === EYES CLOSED DATA ===
    this.addDataTable(doc, 'Eyes Closed (EC) - Absolute Power (μV²)', this.qeegData.EC?.absolute);
    doc.moveDown(0.5);
    this.addDataTable(doc, 'Eyes Closed (EC) - Relative Power (%)', this.qeegData.EC?.relative);

    // === SPECIAL VALUES ===
    if (this.qeegData.EC?.special) {
      doc.moveDown(1);
      doc.fontSize(12)
         .fillColor('#121e36')
         .font('Helvetica-Bold')
         .text('Special Values', 50, doc.y);

      doc.moveDown(0.5);
      doc.fontSize(9)
         .fillColor('#2D3748')
         .font('Helvetica');

      if (this.qeegData.EC.special.alphaPeak) {
        doc.text(`• Alpha Peak Frequency: ${this.qeegData.EC.special.alphaPeak} Hz`, 60, doc.y);
      }
    }
  }

  /**
   * Helper method to add data table to PDF
   */
  addDataTable(doc, title, data) {
    if (!data) return;

    // Check if we need new page
    if (doc.y > 680) {
      doc.addPage();
      this.addWatermark(doc);
    }

    // Title
    doc.fontSize(12)
       .fillColor('#121e36')
       .font('Helvetica-Bold')
       .text(title, 50, doc.y);

    doc.moveDown(0.5);

    // Table header
    const startY = doc.y;
    const rowHeight = 14;
    const colWidth = 65;

    // Header row background
    doc.rect(50, startY, 495, rowHeight)
       .fill('#E2E8F0');

    // Header text
    doc.fontSize(8)
       .fillColor('#2D3748')
       .font('Helvetica-Bold');

    doc.text('Channel', 55, startY + 3, { width: 55 });
    doc.text('Delta', 115, startY + 3, { width: colWidth });
    doc.text('Theta', 180, startY + 3, { width: colWidth });
    doc.text('Alpha', 245, startY + 3, { width: colWidth });
    doc.text('Beta', 310, startY + 3, { width: colWidth });
    doc.text('HiBeta', 375, startY + 3, { width: colWidth });

    let currentY = startY + rowHeight;

    // Data rows
    const channels = ['Fz', 'Cz', 'Pz', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4'];
    doc.fontSize(8).font('Helvetica').fillColor('#2D3748');

    channels.forEach((channel, index) => {
      const bands = data[channel];
      if (!bands) return;

      // Alternating row colors
      if (index % 2 === 0) {
        doc.rect(50, currentY, 495, rowHeight).fill('#F7FAFC');
      }

      doc.fillColor('#2D3748');
      doc.text(channel, 55, currentY + 3, { width: 55 });
      doc.text(bands.Delta?.toFixed(2) || '0.00', 115, currentY + 3, { width: colWidth });
      doc.text(bands.Theta?.toFixed(2) || '0.00', 180, currentY + 3, { width: colWidth });
      doc.text(bands.Alpha?.toFixed(2) || '0.00', 245, currentY + 3, { width: colWidth });
      doc.text(bands.Beta?.toFixed(2) || '0.00', 310, currentY + 3, { width: colWidth });
      doc.text(bands.HiBeta?.toFixed(2) || '0.00', 375, currentY + 3, { width: colWidth });

      currentY += rowHeight;
    });

    // Update cursor position
    doc.y = currentY + 5;
  }

  /**
   * Add Detailed Calculations Section - Shows how scores were calculated
   */
  addCalculationsSection(doc) {
    // Create new page for calculations
    doc.addPage();
    this.addWatermark(doc);

    const y = doc.y;

    // Section header
    doc.roundedRect(50, y, 495, 35, 5)
       .fill('#121e36');

    doc.fontSize(16)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('🧮 Detailed Calculations', 60, y + 10);

    doc.moveDown(2);

    // Description
    doc.fontSize(10)
       .fillColor('#4A5568')
       .font('Helvetica')
       .text('This section shows step-by-step calculations for each brain health parameter, including formulas, thresholds, and scoring logic.', 50, doc.y, { width: 495, align: 'left' });

    doc.moveDown(1);

    // Add calculation details for each parameter
    if (this.algorithmResults.parameters) {
      this.algorithmResults.parameters.forEach((param, index) => {
        this.addParameterCalculation(doc, param, index + 1);
      });
    }
  }

  /**
   * Add individual parameter calculation details
   */
  addParameterCalculation(doc, param, number) {
    // Check if we need new page
    if (doc.y > 650) {
      doc.addPage();
      this.addWatermark(doc);
    }

    // Sanitize parameter values to prevent NaN
    const sanitizedScore = Number.isFinite(param.score) ? param.score : 0;
    const sanitizedMaxScore = Number.isFinite(param.maxScore) ? param.maxScore : 3;
    const sanitizedClassification = param.classification || 'Unknown';
    const sanitizedScoreLevel = sanitizedScore <= 1 ? 'Low' : sanitizedScore === 2 ? 'Medium' : 'High';

    // Parameter header
    doc.fontSize(12)
       .fillColor('#121e36')
       .font('Helvetica-Bold')
       .text(`${number}. ${param.name} - Score: ${sanitizedScoreLevel} (${sanitizedClassification})`, 50, doc.y);

    doc.moveDown(0.5);

    // Metrics/Sub-calculations
    if (param.metrics && param.metrics.length > 0) {
      param.metrics.forEach((metric, idx) => {
        // Check if we need new page before each metric
        if (doc.y > 720) {
          doc.addPage();
          this.addWatermark(doc);
        }

        // Sanitize metric values to prevent NaN
        const sanitizedMetricScore = Number.isFinite(metric.score) ? metric.score : 0;
        const metricName = metric.name || 'Unknown Metric';

        // Metric text (removed problematic roundedRect with 'auto' height)
        const metricY = doc.y;

        doc.fontSize(10)
           .fillColor('#2D3748')
           .font('Helvetica-Bold')
           .text(`   ${String.fromCharCode(97 + idx)}) ${metricName}: ${sanitizedMetricScore} point`, 60, metricY, { width: 475 });

        doc.moveDown(0.3);

        // Formula/Description
        if (metric.description) {
          doc.fontSize(9)
             .fillColor('#4A5568')
             .font('Helvetica')
             .text(`      ${metric.description}`, 60, doc.y, { width: 475 });
        }

        // Value details - ENHANCED NaN PROTECTION
        if (metric.value !== undefined && metric.value !== null) {
          doc.fontSize(9)
             .fillColor('#2D3748')
             .font('Helvetica');

          if (typeof metric.value === 'object') {
            // For object values, sanitize before stringifying
            const sanitizedObject = {};
            for (const key in metric.value) {
              const val = metric.value[key];
              sanitizedObject[key] = Number.isFinite(val) ? Number(val).toFixed(3) : (val || 'N/A');
            }
            doc.text(`      Raw Values: ${JSON.stringify(sanitizedObject)}`, 60, doc.y, { width: 475 });
          } else if (typeof metric.value === 'number') {
            // For numeric values, check for NaN/Infinity
            const sanitizedValue = Number.isFinite(metric.value) ? metric.value.toFixed(3) : '0.000';
            doc.text(`      Calculated Value: ${sanitizedValue}`, 60, doc.y, { width: 475 });
          } else {
            // For other types, convert to string safely
            doc.text(`      Calculated Value: ${String(metric.value)}`, 60, doc.y, { width: 475 });
          }
        }

        // Interpretation
        if (metric.score === 1) {
          doc.fontSize(9)
             .fillColor('#22543D')
             .font('Helvetica-Bold')
             .text('      ✓ PASS - Within optimal range', 60, doc.y, { width: 475 });
        } else {
          doc.fontSize(9)
             .fillColor('#742A2A')
             .font('Helvetica-Bold')
             .text('      ✗ FAIL - Outside optimal range', 60, doc.y, { width: 475 });
        }

        doc.moveDown(0.8);
      });
    }

    doc.moveDown(0.5);
  }

  // ========== NEW PAGE METHODS FOR REFERENCE PDF DESIGN ==========

  /**
   * Page 1: Cover Page - Blue header with brain illustration and patient info (Image 2 Design)
   */
  addCoverPage(doc) {
    console.log('📄 Adding Cover Page (Page 1)...');

    const pageWidth = 595;
    const pageHeight = 842;

    // FULL PAGE dark blue background (no teal section)
    doc.rect(0, 0, pageWidth, pageHeight).fill('#121e36');

    // COVER PAGE - Logo in top right corner (smaller to avoid overlap)
    const logoWidth = 150;
    const logoX = 445;  // Far right corner
    const logoY = 8;
    console.log('🎨 COVER LOGO:', logoWidth, 'px at X:', logoX);

    const possibleLogoPaths = [
      path.join(__dirname, '../../public/assets/Layer_1.png'),
      path.join(__dirname, '../public/assets/Layer_1.png'),
      path.resolve('public/assets/Layer_1.png')
    ];

    let logoLoaded = false;
    for (const logoPath of possibleLogoPaths) {
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoX, logoY, {
            width: logoWidth
          });
          logoLoaded = true;
          break;
        }
      } catch (e) {
        // Try next path
      }
    }

    if (!logoLoaded) {
      // Fallback: Professional text logo
      doc.fontSize(12)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text('NEUROSENSE', logoX, logoY + 5, { width: logoWidth, align: 'center' });
      doc.fontSize(7)
         .fillColor('#FFFFFF')
         .font('Helvetica')
         .text('EEG Intelligence™', logoX, logoY + 20, { width: logoWidth, align: 'center' });
    }

    // Main titles (White - centered, below logo) - Professional styling
    let yPos = 90;  // Starting position

    doc.fontSize(24)
       .fillColor('#FFFFFF')  // White color
       .font('Helvetica-Bold')
       .text('MY NEUROSENSE BMW REPORT', 0, yPos, { width: pageWidth, align: 'center', characterSpacing: 1 });

    yPos += 40;  // More space between title lines
    doc.fontSize(22)
       .fillColor('#FFFFFF')  // White color
       .font('Helvetica-Bold')
       .text('BRAIN & MENTAL WELLNESS', 0, yPos, { width: pageWidth, align: 'center', characterSpacing: 1 });

    // Subtitle (White - centered) - Professional styling
    yPos += 70;  // More space before subtitle
    doc.fontSize(15)
       .fillColor('#FFFFFF')  // White color
       .font('Helvetica-Bold')
       .text('NEUROSENSE QUANTITATIVE', 0, yPos, { width: pageWidth, align: 'center', characterSpacing: 0.5 });

    yPos += 28;  // More space between subtitle lines
    doc.fontSize(15)
       .fillColor('#FFFFFF')  // White color
       .font('Helvetica-Bold')
       .text('TRANSLATIONAL EEG INTELLIGENCE', 0, yPos, { width: pageWidth, align: 'center', characterSpacing: 0.5 });

    // Brain image (centered with more spacing)
    const brainSize = 180;
    const brainX = (pageWidth - brainSize) / 2;
    const brainY = 380;  // More space from subtitle

    const brainImagePaths = [
      path.join(__dirname, '../../public/brain.png'),
      path.join(__dirname, '../public/brain.png'),
      path.resolve('public/brain.png'),
      'C:/Neuro backup/Neuro360/public/brain.png'
    ];

    let brainLoaded = false;
    for (const brainPath of brainImagePaths) {
      try {
        if (fs.existsSync(brainPath)) {
          doc.image(brainPath, brainX, brainY, {
            width: brainSize,
            height: brainSize,
            fit: [brainSize, brainSize]
          });
          brainLoaded = true;
          break;
        }
      } catch (e) {
        // Try next path
      }
    }

    // Fallback to drawn illustration if image not found
    if (!brainLoaded) {
      this.drawDetailedBrainIllustration(doc, pageWidth / 2, 400, 180);
    }

    // No teal section - full page is dark blue

    // Patient info table (CENTERED on page) - on blue background
    const tableY = 560;  // Positioned below brain with spacing
    const labelWidth = 120;
    const valueWidth = 200;
    const totalTableWidth = labelWidth + valueWidth;
    const tableX = (pageWidth - totalTableWidth) / 2;  // Center the table
    const rowHeight = 30;

    // Table styling
    doc.strokeColor('#FFFFFF').lineWidth(1);

    const patientFields = [
      { label: 'Name', value: this.patientData.name || '' },
      { label: 'Age', value: this.patientData.age ? String(this.patientData.age) : '' },
      { label: 'Date of Birth', value: formatDateDDMMYYYY(this.patientData.dateOfBirth || this.patientData.dob) },
      { label: 'Gender', value: this.patientData.gender || '' }
    ];

    patientFields.forEach((field, index) => {
      const rowY = tableY + (index * rowHeight);

      // Label cell (transparent with border only)
      doc.rect(tableX, rowY, labelWidth, rowHeight)
         .strokeColor('#FFFFFF')
         .lineWidth(1)
         .stroke();

      // Value cell (transparent with border only)
      doc.rect(tableX + labelWidth, rowY, valueWidth, rowHeight)
         .strokeColor('#FFFFFF')
         .lineWidth(1)
         .stroke();

      // Label text (white for visibility on teal) - ensure no page break
      doc.fontSize(11)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text(field.label, tableX + 10, rowY + 9, { width: labelWidth - 20, lineBreak: false });

      // Value text (white for visibility on teal) - ensure no page break
      doc.fontSize(11)
         .fillColor('#FFFFFF')
         .font('Helvetica')
         .text(field.value, tableX + labelWidth + 10, rowY + 9, { width: valueWidth - 20, lineBreak: false });
    });

    // Footer with website URL - ensure no page break
    doc.fontSize(8)
       .fillColor('#FFFFFF')
       .font('Helvetica')
       .text('limitlessbrainlab-eight.vercel.app', pageWidth - 160, pageHeight - 30, { width: 140, align: 'right', lineBreak: false });

    console.log('   ✅ Cover Page complete');
  }

  /**
   * Draw fallback text logo when image not available
   */
  drawFallbackLogo(doc, x, y) {
    doc.fontSize(14)
       .fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .text('NEUROSENSE', x, y + 5, { width: 100, align: 'center' });
    doc.fontSize(8)
       .fillColor('#FFFFFF')
       .font('Helvetica')
       .text('EEG Intelligence™', x, y + 22, { width: 100, align: 'center' });
  }

  /**
   * Draw a simplified brain illustration
   */
  drawBrainIllustration(doc, centerX, centerY, size) {
    doc.save();

    // Draw brain outline (simplified ellipse with wave patterns)
    doc.strokeColor('#FFFFFF').lineWidth(2).fillColor('transparent');

    // Main brain shape (two overlapping ellipses for hemispheres)
    const leftX = centerX - size * 0.3;
    const rightX = centerX + size * 0.3;

    // Left hemisphere
    doc.ellipse(leftX, centerY, size * 0.45, size * 0.5).stroke();

    // Right hemisphere
    doc.ellipse(rightX, centerY, size * 0.45, size * 0.5).stroke();

    // Brain stem
    doc.moveTo(centerX, centerY + size * 0.4)
       .lineTo(centerX, centerY + size * 0.6)
       .stroke();

    // Add some gyri lines (brain folds)
    for (let i = 0; i < 5; i++) {
      const y = centerY - size * 0.3 + i * size * 0.15;
      // Left side waves
      doc.moveTo(leftX - size * 0.3, y)
         .quadraticCurveTo(leftX - size * 0.15, y - 10, leftX, y)
         .quadraticCurveTo(leftX + size * 0.15, y + 10, leftX + size * 0.25, y)
         .stroke();
      // Right side waves
      doc.moveTo(rightX - size * 0.25, y)
         .quadraticCurveTo(rightX - size * 0.1, y - 10, rightX, y)
         .quadraticCurveTo(rightX + size * 0.15, y + 10, rightX + size * 0.3, y)
         .stroke();
    }

    doc.restore();
  }

  /**
   * Draw a detailed brain illustration (white outline on blue background)
   * More detailed version matching Image 2 design
   */
  drawDetailedBrainIllustration(doc, x, y, size) {
    doc.save();

    const width = size;
    const height = size * 0.85;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const color = '#FFFFFF';

    // Left hemisphere outline
    doc.moveTo(x, y - halfHeight * 0.9)
       .bezierCurveTo(
         x - halfWidth * 0.3, y - halfHeight * 1.1,
         x - halfWidth * 0.8, y - halfHeight * 0.9,
         x - halfWidth * 0.95, y - halfHeight * 0.4
       )
       .bezierCurveTo(
         x - halfWidth * 1.1, y - halfHeight * 0.1,
         x - halfWidth * 1.1, y + halfHeight * 0.3,
         x - halfWidth * 0.9, y + halfHeight * 0.6
       )
       .bezierCurveTo(
         x - halfWidth * 0.7, y + halfHeight * 0.9,
         x - halfWidth * 0.3, y + halfHeight * 1.0,
         x, y + halfHeight * 0.8
       )
       .strokeColor(color)
       .lineWidth(2.5)
       .stroke();

    // Right hemisphere outline
    doc.moveTo(x, y - halfHeight * 0.9)
       .bezierCurveTo(
         x + halfWidth * 0.3, y - halfHeight * 1.1,
         x + halfWidth * 0.8, y - halfHeight * 0.9,
         x + halfWidth * 0.95, y - halfHeight * 0.4
       )
       .bezierCurveTo(
         x + halfWidth * 1.1, y - halfHeight * 0.1,
         x + halfWidth * 1.1, y + halfHeight * 0.3,
         x + halfWidth * 0.9, y + halfHeight * 0.6
       )
       .bezierCurveTo(
         x + halfWidth * 0.7, y + halfHeight * 0.9,
         x + halfWidth * 0.3, y + halfHeight * 1.0,
         x, y + halfHeight * 0.8
       )
       .strokeColor(color)
       .lineWidth(2.5)
       .stroke();

    // Center division line (vertical)
    doc.moveTo(x, y - halfHeight * 0.85)
       .lineTo(x, y + halfHeight * 0.75)
       .strokeColor(color)
       .lineWidth(2)
       .stroke();

    // Left hemisphere internal folds (sulci pattern)
    // Top left fold
    doc.moveTo(x - halfWidth * 0.15, y - halfHeight * 0.7)
       .bezierCurveTo(
         x - halfWidth * 0.4, y - halfHeight * 0.65,
         x - halfWidth * 0.6, y - halfHeight * 0.5,
         x - halfWidth * 0.8, y - halfHeight * 0.35
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Middle left fold
    doc.moveTo(x - halfWidth * 0.1, y - halfHeight * 0.25)
       .bezierCurveTo(
         x - halfWidth * 0.35, y - halfHeight * 0.3,
         x - halfWidth * 0.55, y - halfHeight * 0.15,
         x - halfWidth * 0.85, y - halfHeight * 0.05
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Lower middle left fold
    doc.moveTo(x - halfWidth * 0.1, y + halfHeight * 0.15)
       .bezierCurveTo(
         x - halfWidth * 0.35, y + halfHeight * 0.1,
         x - halfWidth * 0.55, y + halfHeight * 0.2,
         x - halfWidth * 0.8, y + halfHeight * 0.35
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Bottom left fold
    doc.moveTo(x - halfWidth * 0.1, y + halfHeight * 0.5)
       .bezierCurveTo(
         x - halfWidth * 0.3, y + halfHeight * 0.45,
         x - halfWidth * 0.5, y + halfHeight * 0.55,
         x - halfWidth * 0.65, y + halfHeight * 0.65
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Right hemisphere internal folds (sulci pattern)
    // Top right fold
    doc.moveTo(x + halfWidth * 0.15, y - halfHeight * 0.7)
       .bezierCurveTo(
         x + halfWidth * 0.4, y - halfHeight * 0.65,
         x + halfWidth * 0.6, y - halfHeight * 0.5,
         x + halfWidth * 0.8, y - halfHeight * 0.35
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Middle right fold
    doc.moveTo(x + halfWidth * 0.1, y - halfHeight * 0.25)
       .bezierCurveTo(
         x + halfWidth * 0.35, y - halfHeight * 0.3,
         x + halfWidth * 0.55, y - halfHeight * 0.15,
         x + halfWidth * 0.85, y - halfHeight * 0.05
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Lower middle right fold
    doc.moveTo(x + halfWidth * 0.1, y + halfHeight * 0.15)
       .bezierCurveTo(
         x + halfWidth * 0.35, y + halfHeight * 0.1,
         x + halfWidth * 0.55, y + halfHeight * 0.2,
         x + halfWidth * 0.8, y + halfHeight * 0.35
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    // Bottom right fold
    doc.moveTo(x + halfWidth * 0.1, y + halfHeight * 0.5)
       .bezierCurveTo(
         x + halfWidth * 0.3, y + halfHeight * 0.45,
         x + halfWidth * 0.5, y + halfHeight * 0.55,
         x + halfWidth * 0.65, y + halfHeight * 0.65
       )
       .strokeColor(color)
       .lineWidth(1.5)
       .stroke();

    doc.restore();
  }

  /**
   * Page 2: Introduction Page
   */
  addIntroductionPage(doc) {
    console.log('📄 Adding Introduction Page (Page 2)...');

    // Add logo top right
    this.addTopRightLogo(doc);

    // Title - moved down to avoid logo overlap
    doc.fontSize(32)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text('INTRODUCTION', 50, 80, { width: 450 });

    // Underline
    doc.moveTo(50, 120).lineTo(545, 120).lineWidth(2).stroke('#2196F3');

    doc.moveDown(2);

    // Introduction paragraphs
    const introText1 = `The qEEG report provided by NeuroSense EEG is intended for informational, educational, and wellness purposes only. It is designed to help individuals and neurofeedback professionals better understand brainwave patterns and to support decisions related to neurofeedback training for non-medical cognitive enhancement. This report is not intended to diagnose, treat, cure, mitigate, or prevent any medical condition, and it should not be used as a substitute for consultation with a licensed healthcare provider.`;

    const introText2 = `The EEG-based scores, brain maps, spectrograms, and neurofeedback protocol suitability scores are based on the analysis of EEG recordings. These scores are not diagnostic tools, and the information in this report should not be interpreted as medical advice.`;

    const introText3 = `Users are encouraged to consult with a qualified healthcare provider regarding any medical concerns or before starting any new treatment or therapy. NeuroSense EEG's qEEG analysis application is not a replacement for the individualized care provided by medical professionals.`;

    doc.fontSize(11)
       .fillColor('#000000')
       .font('Helvetica')
       .text(introText1, 50, 150, { width: 495, align: 'justify', lineGap: 3 });

    doc.moveDown(1);
    doc.text(introText2, { width: 495, align: 'justify', lineGap: 3 });

    doc.moveDown(1);
    doc.text(introText3, { width: 495, align: 'justify', lineGap: 3 });

    // EEG Recording section
    doc.moveDown(2.5);
    doc.fontSize(24)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text('EEG RECORDING', 50, doc.y);

    doc.moveDown(1);

    const eegText1 = `The 10-20 system is the internationally recognized method used for placing electrodes on the scalp during an EEG (Electroencephalogram) recording.`;

    const eegText2 = `It is named for the standardized distances between electrode positions, which are either 10% or 20% of the total front-to-back or right-to-left measurement of the head. This system ensures consistent and reproducible electrode placement, allowing for accurate brainwave measurement across individuals.`;

    const eegText3 = `Electrodes are positioned over specific areas of the brain, corresponding to functional regions like the frontal, temporal, parietal, and occipital lobes, helping clinicians and researchers capture electrical activity associated with various cognitive and neurological functions. The 10-20 system is widely used in clinical diagnostics and research to assess brain activity related to conditions such as epilepsy, sleep disorders, and other neurological disorders.`;

    doc.fontSize(11)
       .fillColor('#000000')
       .font('Helvetica')
       .text(eegText1, 50, doc.y, { width: 495, align: 'justify', lineGap: 3 });

    doc.moveDown(0.8);
    doc.text(eegText2, { width: 495, align: 'justify', lineGap: 3 });

    doc.moveDown(0.8);
    doc.text(eegText3, { width: 495, align: 'justify', lineGap: 3 });

    // EEG signal image placeholder
    doc.moveDown(2);

    // Try to add EEG scan image
    try {
      const eegImagePath = path.join(__dirname, '../../public/eeg scan.png');
      if (fs.existsSync(eegImagePath)) {
        doc.image(eegImagePath, 50, doc.y, { width: 320 });
      } else {
        // Draw placeholder
        doc.rect(50, doc.y, 320, 120).stroke('#CCCCCC');
        doc.fontSize(10).fillColor('#000000').text('EEG Signal Visualization', 150, doc.y + 50);
      }
    } catch (e) {
      doc.rect(50, doc.y, 320, 120).stroke('#CCCCCC');
    }

    // Text next to EEG image
    doc.fontSize(10)
       .fillColor('#000000')
       .font('Helvetica')
       .text('A segment of raw EEG signal', 400, doc.y - 80, { width: 150 })
       .text('from the 19 electrode locations', 400, doc.y - 65, { width: 150 })
       .text('in the eyes closed condition.', 400, doc.y - 50, { width: 150 });

    // Footer
    this.addPageFooter(doc, 2);

    console.log('   ✅ Introduction Page complete');
  }

  /**
   * Page 3: Rationale for Personalized Brain & Mind Well-Being Strategies
   */
  addRationalePage(doc) {
    console.log('📄 Adding Rationale Page (Page 3)...');

    // Add logo top right
    this.addTopRightLogo(doc);

    // Title
    doc.fontSize(22)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text('Rationale For Personalized Brain & Mind  Well-Being Strategies', 50, 100, { width: 450 });

    doc.moveDown(2);

    // Card 1: Personalized self-care
    const card1Y = 180;
    this.drawInfoCard(doc, 50, card1Y, 495, 80,
      'lotus', // icon type
      'Every individual has unique cognitive and emotional patterns. Understanding brainwave activity allows for the creation of **personalized self-care routines, relaxation techniques, and mental well-being practices** that align with an individual\'s natural tendencies.');

    // Card 2: Early intervention
    const card2Y = 280;
    this.drawInfoCard(doc, 50, card2Y, 495, 80,
      'heart', // icon type
      'Recognizing early signs of stress, emotional imbalance, or cognitive exhaustion helps prevent long-term mental health struggles. Timely interventions can build **resilience, improve emotional intelligence, and enhance overall quality of life.**');

    // Card 3: Brainwave optimization
    const card3Y = 380;
    this.drawInfoCard(doc, 50, card3Y, 495, 80,
      'gauge', // icon type
      'By identifying dominant brainwave patterns-such as **theta waves for relaxation or beta waves for high alertness**-individuals can optimize mental clarity, productivity, and emotional balance.');

    // Card 4: Long-term wellness
    const card4Y = 480;
    this.drawInfoCard(doc, 50, card4Y, 495, 80,
      'brain', // icon type
      'Balanced brain activity is crucial for long-term **mental and physical health**. Developing **stability and adaptability** helps individuals navigate personal and professional challenges with confidence and emotional control.');

    // Footer
    this.addPageFooter(doc, 3);

    console.log('   ✅ Rationale Page complete');
  }

  /**
   * Page 4: Brainwave Profiles
   */
  addBrainwaveProfilesPage(doc) {
    console.log('📄 Adding Brainwave Profiles Page (Page 4)...');

    // Add logo top right
    this.addTopRightLogo(doc);

    // Title
    doc.fontSize(28)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text('BRAINWAVE PROFILES', 50, 80, { width: 400 });

    // Draw wave illustration
    doc.moveDown(0.5);
    this.drawWaveIllustration(doc, 50, 130, 495, 40);

    doc.moveDown(1);

    // Introduction paragraph
    const brainwaveIntro = `Brainwaves are the electrical impulses generated by the brain, reflecting its activity and various mental and emotional states. In the context of wellness, understanding brainwave patterns provides valuable insights into an individual's stress levels, emotional resilience, cognitive balance, and overall well-being. The three primary brainwave types relevant to mental and emotional health include:`;

    doc.fontSize(10)
       .fillColor('#000000')
       .font('Helvetica')
       .text(brainwaveIntro, 50, 165, { width: 495, align: 'justify', lineGap: 2 });

    // Bullet points for wave types
    doc.moveDown(0.8);
    doc.fontSize(10).fillColor('#000000');

    doc.font('Helvetica-Bold').text('• Beta Waves: ', 50, doc.y, { continued: true })
       .font('Helvetica').text('Indicate focus and problem-solving ability but can also reflect stress and mental overload.');

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('• Alpha Waves: ', 50, doc.y, { continued: true })
       .font('Helvetica').text('Associated with relaxation and emotional regulation, promoting a sense of calm and balance.');

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('• Theta Waves: ', 50, doc.y, { continued: true })
       .font('Helvetica').text('Linked to deep relaxation, creativity, and intuition, supporting restorative states and self-reflection.');

    // Section title
    doc.moveDown(1.5);
    doc.fontSize(18)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text('Description of Common Brainwave Types', 0, doc.y, { width: 595, align: 'center' });

    doc.moveDown(1);

    // Three column boxes
    const boxY = doc.y;
    const boxWidth = 155;
    const boxHeight = 280;
    const boxGap = 15;

    // Beta Waves Box
    this.drawBrainwaveBox(doc, 50, boxY, boxWidth, boxHeight, 'Beta Waves', '#D6EAF8', {
      role: [
        'Support logical thinking, decision-making, and task-oriented focus.',
        'Essential for managing daily responsibilities and maintaining alertness.'
      ],
      balanced: [
        'Enhance focus, productivity, and clear thinking.'
      ],
      excessive: [
        'Lead to stress, anxiety, or cognitive exhaustion, increasing tension and reducing the ability to relax.'
      ]
    });

    // Alpha Waves Box
    this.drawBrainwaveBox(doc, 50 + boxWidth + boxGap, boxY, boxWidth, boxHeight, 'Alpha Waves', '#D6EAF8', {
      role: [
        'Facilitate relaxation, emotional stability, and mental clarity.',
        'Act as a transition between heightened focus (beta) and deep relaxation (theta).'
      ],
      balanced: [
        'Promote emotional resilience, mindfulness, and the ability to stay present.'
      ],
      imbalanced: [
        'May result in heightened emotional reactivity, restlessness, or difficulty unwinding after stress.'
      ]
    });

    // Theta Waves Box
    this.drawBrainwaveBox(doc, 50 + (boxWidth + boxGap) * 2, boxY, boxWidth, boxHeight, 'Theta Waves', '#D6EAF8', {
      role: [
        'Drive creativity, intuition, and deep relaxation.',
        'Support meditation, subconscious healing, and self-reflection.'
      ],
      balanced: [
        'Enhance emotional processing, creativity, and the ability to engage in restorative states.'
      ],
      excessive: [
        'Can lead to excessive daydreaming, mental fog, or difficulty maintaining focus in daily activities.'
      ]
    });

    // Footer
    this.addPageFooter(doc, 4);

    console.log('   ✅ Brainwave Profiles Page complete');
  }

  /**
   * Helper: Add NEUROSENSE logo to top right
   */
  addTopRightLogo(doc) {
    try {
      if (this.clinicLogoPath && fs.existsSync(this.clinicLogoPath)) {
        require('./pdf/pdfStyles').drawClinicLogo(doc, this.clinicLogoPath, 494, 12, 88, 60);
      } else {
        const logoPath = path.join(__dirname, '../../public/assets/Layer_1.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 494, 12, { width: 88 });
        }
      }
    } catch (e) {
      console.log('Logo not found:', e.message);
    }
  }

  /**
   * Helper: Draw dashed line
   */
  drawDashedLine(doc, x1, y1, x2, y2) {
    doc.save();
    doc.strokeColor('#CCCCCC').lineWidth(1);

    const dashLength = 5;
    const gapLength = 3;
    const totalLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const dashCount = Math.floor(totalLength / (dashLength + gapLength));

    const dx = (x2 - x1) / totalLength;
    const dy = (y2 - y1) / totalLength;

    for (let i = 0; i < dashCount; i++) {
      const startX = x1 + (dashLength + gapLength) * i * dx;
      const startY = y1 + (dashLength + gapLength) * i * dy;
      const endX = startX + dashLength * dx;
      const endY = startY + dashLength * dy;

      doc.moveTo(startX, startY).lineTo(endX, endY).stroke();
    }

    doc.restore();
  }

  /**
   * Helper: Draw info card with icon
   */
  drawInfoCard(doc, x, y, width, height, iconType, text) {
    // Card border
    doc.roundedRect(x, y, width, height, 10)
       .strokeColor('#2196F3')
       .lineWidth(2)
       .stroke();

    // Icon circle
    const iconCenterX = x + 45;
    const iconCenterY = y + height / 2;
    doc.circle(iconCenterX, iconCenterY, 25)
       .strokeColor('#2196F3')
       .lineWidth(1.5)
       .stroke();

    // Draw simple icon based on type
    doc.save();
    doc.strokeColor('#2196F3').fillColor('#2196F3').lineWidth(1.5);

    switch (iconType) {
      case 'lotus':
        // Simple lotus/flower shape
        doc.ellipse(iconCenterX, iconCenterY - 5, 8, 12).stroke();
        doc.ellipse(iconCenterX - 10, iconCenterY, 6, 10).stroke();
        doc.ellipse(iconCenterX + 10, iconCenterY, 6, 10).stroke();
        break;
      case 'heart':
        // Simple heart with head
        doc.circle(iconCenterX, iconCenterY - 5, 12).stroke();
        doc.moveTo(iconCenterX - 5, iconCenterY + 10).lineTo(iconCenterX + 5, iconCenterY + 10).stroke();
        break;
      case 'gauge':
        // Simple gauge/speedometer
        doc.circle(iconCenterX, iconCenterY, 15).stroke();
        doc.moveTo(iconCenterX, iconCenterY).lineTo(iconCenterX + 10, iconCenterY - 10).stroke();
        break;
      case 'brain':
        // Simple brain shape
        doc.ellipse(iconCenterX - 5, iconCenterY, 10, 12).stroke();
        doc.ellipse(iconCenterX + 5, iconCenterY, 10, 12).stroke();
        break;
    }
    doc.restore();

    // Text with bold parts
    const textX = x + 90;
    const textY = y + 15;
    const textWidth = width - 100;

    // Parse and render text with bold sections
    this.renderTextWithBold(doc, text, textX, textY, textWidth);
  }

  /**
   * Helper: Render text with **bold** sections
   */
  renderTextWithBold(doc, text, x, y, width) {
    doc.fontSize(10).fillColor('#000000');

    // Split by **bold** markers
    const parts = text.split(/\*\*(.*?)\*\*/);
    let currentX = x;
    let currentY = y;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i % 2 === 0) {
        // Regular text
        doc.font('Helvetica');
      } else {
        // Bold text
        doc.font('Helvetica-Bold');
      }

      // Calculate if we need to wrap
      const textWidth = doc.widthOfString(part);
      if (currentX + textWidth > x + width) {
        currentX = x;
        currentY += 14;
      }

      doc.text(part, x, currentY, { width: width, continued: i < parts.length - 1, lineGap: 3 });
    }
  }

  /**
   * Helper: Draw wave illustration
   */
  drawWaveIllustration(doc, x, y, width, height) {
    doc.save();
    doc.strokeColor('#333333').lineWidth(2);

    const amplitude = height / 2;
    const wavelength = width / 5;

    doc.moveTo(x, y + amplitude);

    for (let i = 0; i < 5; i++) {
      const startX = x + i * wavelength;
      doc.bezierCurveTo(
        startX + wavelength * 0.25, y,
        startX + wavelength * 0.75, y + height,
        startX + wavelength, y + amplitude
      );
    }

    doc.stroke();
    doc.restore();
  }

  /**
   * Helper: Draw brainwave type box
   */
  drawBrainwaveBox(doc, x, y, width, height, title, bgColor, content) {
    // Background
    doc.roundedRect(x, y, width, height, 5).fill(bgColor);

    // Title
    doc.fontSize(14)
       .fillColor('#2196F3')
       .font('Helvetica-Bold')
       .text(title, x + 10, y + 10, { width: width - 20, align: 'center' });

    let currentY = y + 35;

    // Role section
    doc.fontSize(9)
       .fillColor('#000000')
       .font('Helvetica-Bold')
       .text('Role:', x + 10, currentY, { width: width - 20 });

    currentY += 12;
    doc.font('Helvetica').fontSize(8);

    if (content.role) {
      content.role.forEach(item => {
        doc.text('• ' + item, x + 10, currentY, { width: width - 20, lineGap: 2 });
        currentY = doc.y + 5;
      });
    }

    // When Balanced section
    currentY += 5;
    doc.fontSize(9).font('Helvetica-Bold').text('When Balanced:', x + 10, currentY, { width: width - 20 });
    currentY += 12;
    doc.font('Helvetica').fontSize(8);

    if (content.balanced) {
      content.balanced.forEach(item => {
        doc.text('• ' + item, x + 10, currentY, { width: width - 20, lineGap: 2 });
        currentY = doc.y + 5;
      });
    }

    // When Excessive/Imbalanced section
    currentY += 5;
    const excessiveLabel = content.excessive ? 'When Excessive:' : 'When Imbalanced:';
    doc.fontSize(9).font('Helvetica-Bold').text(excessiveLabel, x + 10, currentY, { width: width - 20 });
    currentY += 12;
    doc.font('Helvetica').fontSize(8);

    const excessiveContent = content.excessive || content.imbalanced;
    if (excessiveContent) {
      excessiveContent.forEach(item => {
        doc.text('• ' + item, x + 10, currentY, { width: width - 20, lineGap: 2 });
        currentY = doc.y + 5;
      });
    }
  }

  /**
   * Helper: Add page header with logo in top right corner
   */
  addPageHeader(doc) {
    // Logo - top right corner, Figma: 87.85 x 59.58 at x:494, y:12
    const logoWidth = 88;
    const logoX = 494;
    const logoY = 12;

    // Clinic's uploaded logo takes priority over the NeuroSense default.
    if (this.clinicLogoPath && fs.existsSync(this.clinicLogoPath)) {
      try {
        require('./pdf/pdfStyles').drawClinicLogo(doc, this.clinicLogoPath, logoX, logoY, logoWidth, 60);
        return;
      } catch (error) {
        // Fall through to the default logo
      }
    }

    const possibleLogoPaths = [
      path.join(__dirname, '../../public/assets/Layer_1.png'),
      path.join(__dirname, '../public/assets/Layer_1.png'),
      path.resolve('public/assets/Layer_1.png')
    ];

    for (const logoPath of possibleLogoPaths) {
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoX, logoY, {
            width: logoWidth
          });
          return;
        }
      } catch (error) {
        // Try next path
      }
    }
  }

  /**
   * Helper: Add page footer with report info, disclaimer and website - Blue bar style - 2 lines
   */
  addPageFooter(doc, pageNumber) {
    // Save current Y position
    const savedY = doc.y;
    const footerY = 800;
    const rightMargin = 565; // right edge for right-aligned text

    // Blue footer bar
    doc.rect(0, footerY, 595, 42).fill('#121e36');

    // Line 1: Report generated info (left) | Page number (right)
    doc.fillColor('#FFFFFF')
       .font('Helvetica')
       .fontSize(7)
       .text(`Report generated on: ${this.generatedAt} by Limitless Brain Lab`, 30, footerY + 8, { lineBreak: false });

    if (pageNumber) {
      doc.fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .fontSize(8)
         .text(`Page ${pageNumber}`, 30, footerY + 8, { width: rightMargin - 30, align: 'right', lineBreak: false });
    }

    // Line 2: Disclaimer text (left) | Website (right) — more spacing from line 1
    doc.fillColor('#FFFFFF')
       .font('Helvetica')
       .fontSize(6)
       .text('This AI-generated report is not diagnostic. Please consult your doctor for proper interpretation and clinical correlation.',
             30, footerY + 24, { lineBreak: false });

    doc.fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .fontSize(8)
       .text('limitlessbrainlab-eight.vercel.app', 30, footerY + 24, { width: rightMargin - 30, align: 'right', lineBreak: false });

    // Restore Y position to prevent affecting next content
    doc.y = savedY;
  }
}

module.exports = GeminiPdfGenerator;
