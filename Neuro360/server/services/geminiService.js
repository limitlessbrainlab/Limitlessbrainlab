const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const rateLimiter = require('./geminiRateLimiter'); // Shared rate limiter

// Stage B (AI brain-performance report) result cache.
// Keyed on hash(brainParameters + patient name + notes), so an identical
// re-run returns the cached report for $0 and ANY change in scores, name,
// or notes forces a fresh Gemini call. Mirrors QEEGParser's extractionCache.
const reportCache = new Map();

class GeminiService {
  constructor() {
    console.log('\n🔧 Initializing Gemini Service...');
    this.apiKey = process.env.GEMINI_API_KEY;

    if (!this.apiKey) {
      console.error('❌ CRITICAL: GEMINI_API_KEY not found in environment variables!');
      console.error('   Please check your .env file');
    } else {
      console.log('✅ Gemini API Key found');
      console.log('   Key length:', this.apiKey.length);
      console.log('   Key preview:', `${this.apiKey.substring(0, 15)}...`);
    }

    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.model = null;
    console.log('✅ Gemini Service initialized\n');
  }

  /**
   * Fetch available Gemini models
   */
  async fetchAvailableModels() {
    try {
      console.log('🔍 Fetching available Gemini models for PDF generation...');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      const supportedModels = (data.models || []).filter(model =>
        model.supportedGenerationMethods?.includes('generateContent')
      );

      console.log(`✅ Found ${supportedModels.length} models for PDF generation`);
      return supportedModels;
    } catch (error) {
      console.error('❌ Failed to fetch models:', error.message);
      return [];
    }
  }

  /**
   * Select best model for PDF generation
   */
  selectBestModel(models) {
    if (!models || models.length === 0) return null;

    // Prefer Gemini 3 Pro Preview (latest model, best reasoning)
    // Fallback to Flash models for speed if 3 Pro unavailable
    const preferences = ['3-pro-preview', 'flash', 'pro'];

    for (const preference of preferences) {
      const found = models.find(m =>
        m.name.toLowerCase().includes(preference)
      );
      if (found) {
        console.log(`✅ Selected model for PDF: ${found.name}`);
        if (found.name.includes('3-pro')) {
          console.log('   🚀 Using Gemini 3 Pro - Latest model with advanced reasoning');
        }
        return found.name;
      }
    }

    console.log(`✅ Using first available model: ${models[0].name}`);
    return models[0].name;
  }

  /**
   * Initialize the Gemini model
   */
  async initModel() {
    if (!this.genAI) {
      throw new Error('Gemini API not initialized. Please check GEMINI_API_KEY.');
    }

    console.log('🔧 Initializing Gemini model for PDF generation...');
    console.log('🔑 API Key status:', this.apiKey ? 'Present' : 'MISSING');

    // Fetch available models dynamically
    const availableModels = await this.fetchAvailableModels();

    if (availableModels.length === 0) {
      console.error('\n❌ No models available for PDF generation!');
      console.error('Please check your GEMINI_API_KEY at https://aistudio.google.com/apikey\n');
      throw new Error('No Gemini models available. Check your API key.');
    }

    // Select best model
    const modelName = this.selectBestModel(availableModels);

    if (!modelName) {
      throw new Error('Could not select a valid model for PDF generation');
    }

    // Initialize model with full path and deterministic config
    console.log(`🔧 Initializing model: ${modelName}`);
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,      // Minimum randomness for deterministic generation
        topK: 1,            // Only pick most likely token
        topP: 1             // No nucleus sampling
      }
    });

    // NOTE: no "Hello" probe call — it was a billed no-op on every cold init
    // (the QEEG anti-pattern). The first real generateContent() validates it.
    console.log('✅ Model initialized for PDF generation');
    return this.model;
  }

  /**
   * System prompt for brain performance report generation
   */
  getReportGenerationPrompt() {
    return `You are an expert neuroscience INFOGRAPHIC report generator powered by Gemini AI. Your primary task is to create a stunning, comprehensive, and visually captivating brain performance INFOGRAPHIC for patients.

⚠️ CRITICAL INSTRUCTION BEFORE YOU START:
YOU MUST USE THE EXACT SCORES PROVIDED IN THE INPUT DATA. DO NOT generate or invent your own scores. The scores are calculated from real patient brain data and MUST be preserved EXACTLY as provided. Your job is ONLY to create interpretations and visualizations - NOT to calculate or modify scores.

🎯 YOUR ROLE:
Generate a professional single-page A4 INFOGRAPHIC-STYLE brain health report based on QEEG (Quantitative Electroencephalography) analysis results. This is an INFOGRAPHIC, not a text document - prioritize visual presentation, clarity, and engaging design. The infographic must be informative yet accessible to non-medical readers.

📊 INPUT DATA:
You will receive 7 brain performance parameters with their ACTUAL CALCULATED SCORES, classifications, and sub-metrics:
1. **Cognition** - Mental processing, focus ability, and alpha-theta balance
2. **Stress** - Arousal levels, relaxation capacity, and regeneration ability
3. **Focus & Attention** - Concentration ability, theta levels, and mental alertness
4. **Burnout & Fatigue** - Energy levels, exhaustion markers, and delta wave patterns
5. **Emotional Regulation** - Mood stability, frontal alpha asymmetry, and emotional control
6. **Learning** - Cognitive flexibility, memory formation, and neural plasticity
7. **Creativity** - Divergent thinking, relaxation state, and innovative capacity

📋 SCORING SYSTEM:
- Each parameter is scored from 0-3 points
- For HEALTH parameters (Cognition, Focus & Attention, Emotional Regulation, Learning, Creativity):
  Classification: Low (0-1/3), Medium (2/3), High (3/3)
- For PROBLEM parameters (Stress, Burnout & Fatigue) - score = count of RED/abnormal sub-params:
  Classification: Low (0/3 red = best), Mild (1/3 red), Moderate (2/3 red), Severe (3/3 red = worst)
- Sub-metrics contribute individual points to the total score

🎨 INFOGRAPHIC DESIGN REQUIREMENTS:

**REMEMBER: This is an INFOGRAPHIC - Visual Appeal is CRITICAL!**

1. **Infographic Visual Design**:
   - INFOGRAPHIC-STYLE: Modern, clean, colorful, and engaging layout
   - Use vibrant but professional color palette throughout
   - Each parameter MUST have a distinct visual identity with unique colors
   - Bold, eye-catching icons and graphical elements for each brain function
   - Large, prominent score displays with visual progress indicators
   - Color-coded scoring badges/banners (Green = Optimal, Yellow = Moderate, Red = Needs Attention)
   - Think: Magazine infographic quality, not medical report
   - Visual hierarchy: Big scores → Clear icons → Short summaries → Details

2. **Content Structure**:
   - Patient-friendly language (avoid heavy medical jargon)
   - One-line impactful summary for each parameter
   - Clear explanation of what each metric means in daily life
   - Practical interpretation of scores
   - Holistic overall summary

3. **Infographic Parameter Presentation**:
   - Parameter name in BOLD, LARGE font with matching icon
   - Score displayed PROMINENTLY (e.g., "2/3 - Medium") with colored background badge
   - Eye-catching color-coded badge/banner based on classification
   - Visual progress bar or circular indicator for scores
   - List all sub-metrics with bold checkmarks (✓) or crosses (✗)
   - Ultra-concise explanation for each sub-metric (1 sentence max)
   - Use boxes, borders, and visual separators for clarity

4. **Color Coding Guidelines**:
   For HEALTH parameters (Cognition, Focus, Emotional Regulation, Learning, Creativity):
   - High (3/3): #38A169 (Green) - Excellent performance
   - Medium (2/3): #F59E0B (Amber) - Good, room for improvement
   - Low (0-1/3): #E53E3E (Red) - Needs attention

   For PROBLEM parameters (Stress, Burnout & Fatigue) - score = count of RED sub-params:
   - Low (0/3 red): #38A169 (Green) - Healthy, no issues (best)
   - Mild (1/3 red): #F59E0B (Amber) - Mild concern
   - Moderate (2/3 red): #ED8936 (Orange) - Moderate concern
   - Severe (3/3 red): #E53E3E (Red) - Severe concern (worst)

5. **Interpretations Guidelines**:
   - Explain what HIGH scores mean for each parameter
   - Explain what LOW scores mean
   - Connect brain metrics to real-life implications
   - Examples:
     * "High Focus & Attention (3/3): Your brain shows excellent concentration ability and minimal distracting theta activity"
     * "Low Cognition (1/3): Your brain shows some difficulty with processing speed and working memory"
     * "Stress (0/3 - Severe): Your brain shows significant stress activation patterns requiring attention"
     * "Stress (3/3 - Low): Great news! Your brain shows healthy relaxation patterns and low arousal"
     * "Moderate Cognition (2/3): Good cognitive function with room for optimization in alpha-theta balance"

6. **Sub-Metrics Explanation Examples**:
   - "Focus Score (Theta:Beta Ratio): ✓ Optimal - Your frontal brain regions show balanced activity for sustained attention"
   - "Relaxation Score: ✗ Below threshold - Your brain may have difficulty shifting into relaxed states"
   - "Alpha Peak: ✓ Normal - Healthy alpha rhythm frequency indicates good brain maturation"

7. **Overall Summary Requirements**:
   - Synthesize all 7 parameters into a cohesive narrative
   - Highlight strengths and areas for improvement
   - Provide context about what the overall pattern suggests
   - Maintain encouraging and constructive tone
   - 3-5 sentences maximum

8. **Recommendations**:
   - Provide 4-6 actionable, personalized recommendations
   - Base suggestions on the actual scores received
   - Include lifestyle, cognitive training, or mindfulness suggestions
   - Keep recommendations practical and achievable

📤 OUTPUT FORMAT FOR INFOGRAPHIC:

⚠️ REMEMBER: Use the EXACT score, maxScore, and bucket values from the INPUT DATA. Do not modify them!

Return ONLY a valid JSON object (no markdown, no code blocks, no explanations) with this EXACT structure optimized for INFOGRAPHIC design:

{
  "title": "Brain Performance Infographic",
  "subtitle": "Visual Analysis of Your Brain Health Metrics",
  "patientSummary": "A comprehensive 3-5 sentence summary synthesizing all parameters, highlighting key strengths and areas for growth, with an encouraging and engaging tone suitable for an infographic",
  "parameters": [
    {
      "name": "Cognition",
      "score": 2,  /* ⚠️ USE EXACT SCORE FROM INPUT - this is just an example */
      "maxScore": 3,  /* ⚠️ USE EXACT maxScore FROM INPUT */
      "bucket": "Medium",  /* ⚠️ USE EXACT bucket FROM INPUT */
      "bucketColor": "#F59E0B",
      "icon": "🧠",
      "summary": "One ultra-impactful, short sentence summarizing this parameter (infographic-style: punchy and clear)",
      "subparameters": [
        {
          "name": "Focus Score (Theta:Beta Ratio)",
          "score": 1,  /* ⚠️ USE EXACT SUBPARAMETER SCORE FROM INPUT */
          "interpretation": "Clear, concise explanation (max 15 words) of what this score means",
          "details": "Technical detail: actual value and threshold"
        }
      ]
    }
  ],
  "recommendations": [
    "Specific actionable recommendation (concise, infographic-friendly)",
    "Another personalized suggestion (short and clear)",
    "Lifestyle tip (engaging and practical)",
    "Cognitive exercise or mindfulness practice (action-oriented)"
  ],
  "layoutSuggestions": {
    "colorScheme": "Vibrant infographic palette: Deep blue header (#323956), colorful parameter badges, white background (#FFFFFF), accent colors for visual interest",
    "structure": "Infographic grid layout: 2 columns for parameters with visual cards, bold header with title and patient info, eye-catching summary and recommendations section at bottom with icons"
  }
}

🚨 CRITICAL INFOGRAPHIC REQUIREMENTS:
1. THIS IS AN INFOGRAPHIC - Keep all text concise, punchy, and visual-friendly
2. Return PURE JSON only - no code blocks, no markdown, no extra text
3. Include ALL subparameters from input data - don't skip any
4. ⚠️ CRITICAL: Use the EXACT score values from the input data - DO NOT generate your own scores
5. ⚠️ CRITICAL: Copy the score, maxScore, and bucket values EXACTLY as provided in the input
6. Remember scoring: For most params: 0/3 = Low, 1/3 = Mild, 2/3 = Moderate, 3/3 = Severe. For Stress & Burnout: 0/3 = Severe, 1/3 = Moderate, 2/3 = Mild, 3/3 = Low (best)
7. Each subparameter must have the EXACT score (0 or 1) from the input data
8. Icons should be colorful brain-related emojis: 🧠 💡 🎯 ⚡ 😌 📚 🎨 🌟 ⚖️ 🔥 or similar
9. Make interpretations ultra-relatable - focus on real-world meaning, avoid EEG jargon
10. Ensure bucketColor uses VIBRANT, DISTINCT hex codes for infographic appeal
11. Overall tone: Engaging, visual, magazine-quality infographic style
12. Summaries: Short, impactful, easy to scan (think social media infographic)
13. ⚠️ DO NOT INVENT OR MODIFY SCORES - Use input data scores verbatim!

✨ INFOGRAPHIC QUALITY CHECKLIST:
- ⚠️ Did you copy the EXACT score values from the input data without modification?
- ⚠️ Did you use the EXACT bucket/classification from the input data?
- Are all 7 parameters included with distinct visual identities?
- Do all parameters have their sub-metrics listed with visual indicators?
- Are interpretations ultra-concise and infographic-friendly (no long paragraphs)?
- Is the color coding vibrant and correct (especially for Stress/Burnout inverse scoring)?
- Does the summary provide a holistic view in an engaging, scannable format?
- Are recommendations specific, actionable, and infographic-ready?
- Is the overall design ready for a beautiful, magazine-quality infographic?

⚠️ FINAL REMINDER: Your ONLY job is to create interpretations and visual suggestions. The scores are ALREADY CALCULATED from real brain data. Copy them EXACTLY as provided!

Generate the INFOGRAPHIC report now based on the brain parameters data provided below. Remember: INFOGRAPHIC = Visual, Colorful, Concise, Engaging!`;
  }

  /**
   * Resolve the Stage B report model chain, cheapest first.
   * Primary tier is gemini-2.5-flash-lite (override via GEMINI_REPORT_MODEL),
   * escalating to flash then pro only if a tier fails validation.
   *
   * Safety: ONLY models confirmed live by Google's /v1/models endpoint are
   * tried, so a deprecated/absent model ID is never attempted (no wasted
   * failed call or extra rate-limit delay per report). The configured default
   * is used as a literal last resort only if the models list can't be fetched.
   * @returns {Promise<string[]>} ordered model-name strings
   */
  async resolveReportModelChain() {
    const explicit = process.env.GEMINI_REPORT_MODEL;
    let available = [];
    try { available = await this.fetchAvailableModels(); } catch (_) { /* ignore */ }

    // Cheapest tier = 0. flash-lite beats flash (note: 'flash' is a substring
    // of 'flash-lite', so check flash-lite first).
    const tierOf = (name) => {
      const n = name.toLowerCase();
      if (n.includes('flash-lite') || n.includes('flashlite')) return 0;
      if (n.includes('flash')) return 1;
      if (n.includes('pro')) return 2;
      return 3;
    };
    const push = (name) => { if (name && !chain.includes(name)) chain.push(name); };
    const chain = [];

    if (available.length) {
      // Primary: explicitly configured model — but only if it's actually live
      if (explicit) {
        const hit = available.find(m => m.name.toLowerCase().includes(explicit.toLowerCase()));
        if (hit) push(hit.name);
      }
      // Then every other available model, cheapest tier first
      [...available]
        .sort((a, b) => tierOf(a.name) - tierOf(b.name))
        .forEach(m => push(m.name));
    }

    // Last resort: couldn't enumerate models — try the configured default literally
    if (!chain.length) chain.push(explicit || 'gemini-2.5-flash-lite');
    return chain;
  }

  /**
   * Build a deterministic generative model handle for a given model name.
   * Config matches the original (temperature 0, topK 1, topP 1). Thinking is
   * intentionally left at default to preserve report quality.
   */
  getReportModelByName(modelName) {
    return this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0, topK: 1, topP: 1 }
    });
  }

  /**
   * Validate a Gemini report response against the input scores.
   * Quality gate: the cheap model's output is only accepted when every input
   * parameter is present with EXACT score + bucket, and the JSON parsed.
   * @returns {{valid:boolean, reportData?:Object, reason?:string}}
   */
  validateReport(text, brainParameters) {
    let reportData;
    try {
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      reportData = JSON.parse(jsonText);
    } catch (e) {
      return { valid: false, reason: `JSON parse failed: ${e.message}` };
    }
    if (!reportData || !Array.isArray(reportData.parameters) || reportData.parameters.length === 0) {
      return { valid: false, reportData, reason: 'missing/empty parameters array' };
    }
    const inputKeys = Object.keys(brainParameters).filter(k => brainParameters[k]);
    for (const key of inputKeys) {
      const inp = brainParameters[key];
      const out = reportData.parameters.find(p => p && p.name && p.name.replace(/\s+/g, '') === key);
      if (!out) return { valid: false, reportData, reason: `output missing ${key}` };
      if (inp.score !== undefined && out.score !== inp.score) {
        return { valid: false, reportData, reason: `score mismatch for ${key} (in=${inp.score} out=${out.score})` };
      }
      if (inp.bucket !== undefined && out.bucket !== inp.bucket) {
        return { valid: false, reportData, reason: `bucket mismatch for ${key} (in=${inp.bucket} out=${out.bucket})` };
      }
    }
    return { valid: true, reportData };
  }

  /**
   * Generate brain performance report using Gemini AI.
   *
   * Cost optimised: tries gemini-2.5-flash-lite first and only escalates
   * (flash -> 3-pro) if the output fails the score/bucket validation gate, so
   * quality is guaranteed at the 3-pro floor while the cheap tier serves the
   * common case. Results are cached by hash(brainParameters + cacheContext);
   * a cache hit costs $0 and any score/name/notes change forces a miss.
   *
   * @param {Object} brainParameters - The brain parameters with scores and buckets
   * @param {string} [cacheContext] - Patient name + notes folded into the cache key
   * @returns {Promise<Object>} Generated report structure
   */
  async generateBrainPerformanceReport(brainParameters, cacheContext = '') {
    try {
      if (!this.genAI) {
        throw new Error('Gemini API not initialized. Please check GEMINI_API_KEY.');
      }

      // --- CACHE CHECK (free re-runs; invalidates on any data/name/notes change) ---
      const cacheKey = crypto
        .createHash('md5')
        .update(JSON.stringify(brainParameters) + '|' + (cacheContext || ''))
        .digest('hex');
      if (reportCache.has(cacheKey)) {
        console.log(`\n💰 Stage B CACHE HIT — returning cached report ($0). Key=${cacheKey.slice(0, 8)}`);
        return reportCache.get(cacheKey);
      }

      console.log('\n🤖 Generating brain performance report with Gemini AI...');
      console.log('📊 Input parameters count:', Object.keys(brainParameters).length);
      console.log('📊 ACTUAL SCORES BEING SENT TO GEMINI:');
      Object.keys(brainParameters).forEach(key => {
        const param = brainParameters[key];
        if (param && param.score !== undefined) {
          console.log(`   ${key}: ${param.score}/${param.maxScore} (${param.bucket})`);
        }
      });

      // Create the prompt with system instructions and data
      const systemPrompt = this.getReportGenerationPrompt();
      const dataPrompt = `\n\n⚠️ CRITICAL: Use these EXACT scores - do not modify them!\n\nBrain Parameters Data:\n${JSON.stringify(brainParameters, null, 2)}\n\n⚠️ REMINDER: Copy the score, maxScore, and bucket values EXACTLY as shown above. Do not generate your own scores!\n\nPlease generate the infographic report description in JSON format as specified.`;
      const fullPrompt = systemPrompt + dataPrompt;
      console.log('📝 Prompt length:', fullPrompt.length, 'characters');

      // --- FALLBACK CHAIN: cheapest model first, escalate on validation failure ---
      const chain = await this.resolveReportModelChain();
      console.log(`💰 Report model chain: ${chain.join(' -> ')}`);

      let lastText = null;
      let lastReason = 'no model produced output';
      for (let tier = 0; tier < chain.length; tier++) {
        const modelName = chain[tier];
        const model = this.getReportModelByName(modelName);

        await rateLimiter.waitForRateLimit();
        let text;
        try {
          console.log(`⏳ Calling Gemini (${modelName}) [tier ${tier}]...`);
          const result = await model.generateContent(fullPrompt);
          rateLimiter.recordRequest();
          text = (await result.response).text();
          console.log(`✅ ${modelName} responded (${text.length} chars)`);
        } catch (callErr) {
          console.warn(`⚠️ ${modelName} call failed: ${callErr.message} -> escalate`);
          lastReason = `${modelName} call failed: ${callErr.message}`;
          continue;
        }
        lastText = text;

        const check = this.validateReport(text, brainParameters);
        if (check.valid) {
          console.log(`✅ ${modelName} VALIDATION PASSED — using this result`);
          console.log('\n📊 SCORES RETURNED BY GEMINI:');
          check.reportData.parameters.forEach(param => {
            console.log(`   ${param.name}: ${param.score}/${param.maxScore} (${param.bucket})`);
          });
          const out = { success: true, data: check.reportData, rawResponse: text, model: modelName };
          reportCache.set(cacheKey, out); // only cache validated results
          return out;
        }
        console.warn(`⚠️ ${modelName} validation failed (${check.reason}) -> escalate`);
        lastReason = check.reason;
      }

      // Every tier failed validation — return last best-effort, do NOT cache.
      console.error('❌ All report model tiers failed validation; returning last best-effort (uncached).');
      if (lastText) {
        let bestEffort;
        try {
          const jsonText = lastText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          bestEffort = JSON.parse(jsonText);
        } catch (_) {
          bestEffort = {
            title: 'Brain Performance Report',
            rawContent: lastText,
            parameters: [],
            error: 'Failed to parse structured response'
          };
        }
        return { success: true, data: bestEffort, rawResponse: lastText, degraded: true };
      }
      return { success: false, error: lastReason, data: null };

    } catch (error) {
      console.error('\n❌ === GEMINI API ERROR ===');
      console.error('Error Type:', error.constructor.name);
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code || 'N/A');
      console.error('Error Status:', error.status || 'N/A');
      console.error('Full Error:', JSON.stringify(error, null, 2));
      console.error('Stack:', error.stack);
      console.error('==========================\n');

      return {
        success: false,
        error: error.message,
        errorDetails: {
          type: error.constructor.name,
          code: error.code,
          status: error.status
        },
        data: null
      };
    }
  }

  /**
   * Generate simple text completion
   * @param {string} prompt - The prompt text
   * @returns {Promise<string>} Generated text
   */
  async generateText(prompt) {
    try {
      if (!this.model) {
        await this.initModel();
      }

      // 🛡️ RATE LIMITING: Wait before making API call
      await rateLimiter.waitForRateLimit();

      const result = await this.model.generateContent(prompt);

      // ✅ Record successful API call
      rateLimiter.recordRequest();

      const response = await result.response;
      return response.text();

    } catch (error) {
      console.error('Error generating text with Gemini:', error);
      throw error;
    }
  }

  /**
   * Test Gemini API connection
   */
  async testConnection() {
    try {
      const response = await this.generateText('Hello! Please respond with "OK" if you can read this.');
      console.log('Gemini API test response:', response);
      return { success: true, response };
    } catch (error) {
      console.error('Gemini API test failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Gemini API quota status
   * @returns {Object} Current quota usage and limits
   */
  getQuotaStatus() {
    return rateLimiter.getQuotaStatus();
  }
}

module.exports = new GeminiService();
