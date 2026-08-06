const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QEEGParser = require('../services/qeegParser');
const AlgorithmCalculator = require('../services/algorithmCalculator');
const pdfLogoModifier = require('../services/pdfLogoModifier');
// OLD generators (keeping for fallback)
const PDFReportGenerator = require('../services/pdfGenerator');
const TemplateBasedPDFGenerator = require('../services/pdfGeneratorTemplate');
const templateManager = require('../services/pdf/templateManager');
const AIPdfGenerator = require('../services/aiPdfGenerator');
const SupabaseStorage = require('../services/supabaseStorage');
const { createRoutedClient } = require('../dbRouter');

// NEW: Gemini AI Service for report generation
let GeminiService = null;
try {
  GeminiService = require('../services/geminiService');
  console.log('✅ Gemini AI Service loaded successfully');
} catch (error) {
  console.error('❌ CRITICAL: Gemini AI Service failed to load!');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
}

// NEW: Gemini PDF Generator - Uses Gemini AI for content generation
let GeminiPdfGenerator = null;
try {
  GeminiPdfGenerator = require('../services/geminiPdfGenerator');
  console.log('✅ Gemini PDF Generator loaded successfully');
  console.log('   Generator available:', !!GeminiPdfGenerator);
} catch (error) {
  console.error('❌ CRITICAL: Gemini PDF Generator failed to load!');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
}

// Enhanced AI PDF Generator (keeping as fallback)
let EnhancedAIPdfGenerator = null;
try {
  EnhancedAIPdfGenerator = require('../services/aiPdfGeneratorEnhanced');
  console.log('✅ Enhanced AI PDF Generator loaded successfully');
} catch (error) {
  console.warn('⚠️  Enhanced AI PDF Generator failed to load:', error.message);
  console.warn('   Will use fallback PDF generator');
}

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit - increased to handle larger QEEG files
  },
  fileFilter: function (req, file, cb) {
    const allowedExtensions = ['.pdf', '.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Only ${allowedExtensions.join(', ')} files are allowed`));
    }
  }
});

/**
 * POST /api/qeeg/process
 * Process QEEG files and calculate 7 brain health parameters
 */
router.post('/process', upload.fields([
  { name: 'eyesOpen', maxCount: 1 },
  { name: 'eyesClosed', maxCount: 1 }
]), async (req, res) => {
  let eyesOpenFile = null;
  let eyesClosedFile = null;
  const processingStartTime = Date.now();
  const progressLog = [];

  // Helper function to log progress
  const logProgress = (stage, message, status = '✓') => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${status} ${stage}: ${message}`;
    console.log(log);
    progressLog.push(log);
  };

  try {
    console.log('\n🔬 ========== QEEG PROCESSING DEBUG LOG ==========\n');
    logProgress('START', 'QEEG Processing Started', '🚀');

    // Get uploaded files
    const files = req.files;
    if (!files || !files.eyesOpen || !files.eyesClosed) {
      logProgress('FILE_UPLOAD', 'FAILED - Missing files', '❌');
      return res.status(400).json({
        error: true,
        message: 'Both Eyes Open and Eyes Closed files are required',
        debug: progressLog
      });
    }

    eyesOpenFile = files.eyesOpen[0];
    eyesClosedFile = files.eyesClosed[0];

    logProgress('FILE_UPLOAD', `Eyes Open received: ${eyesOpenFile.originalname} (${(eyesOpenFile.size / 1024).toFixed(2)} KB)`, '📁');
    logProgress('FILE_UPLOAD', `Eyes Closed received: ${eyesClosedFile.originalname} (${(eyesClosedFile.size / 1024).toFixed(2)} KB)`, '📁');

    // Credit guard (defense in depth) — block generation when the clinic has no report
    // credits left. Single DB read, no AI calls. Default LBL clinic is unlimited. Fail-open
    // on lookup error so a transient DB issue never blocks legitimate generation.
    const DEFAULT_CLINIC_ID = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30';
    const reqClinicId = req.body && req.body.clinicId;
    if (reqClinicId && reqClinicId !== DEFAULT_CLINIC_ID) {
      try {
        const sb = createRoutedClient();
        const { data: clinic } = await sb.from('clinics').select('reports_allowed, reports_used, name').eq('id', reqClinicId).single();
        const allowed = Number(clinic?.reports_allowed ?? 0);
        const used = Number(clinic?.reports_used ?? 0);
        if (allowed > 0 && used >= allowed) {
          logProgress('CREDITS', `BLOCKED - no credits for ${clinic?.name || reqClinicId}`, '❌');
          return res.status(402).json({
            error: true,
            message: 'Report credits exhausted for this clinic. Please purchase more credits to generate reports.',
            debug: progressLog,
          });
        }
      } catch (creditErr) {
        console.warn('Credit guard lookup failed (fail-open):', creditErr.message);
      }
    }

    // Step 1: Replace EEG logo with NeuroSense logo in uploaded PDFs
    logProgress('LOGO_REPLACE', 'Starting logo replacement', '🔄');
    let modifiedEyesOpenPath = eyesOpenFile.path;
    let modifiedEyesClosedPath = eyesClosedFile.path;

    // Store URLs of modified QEEG files for download later
    let eyesOpenUrl = null;
    let eyesClosedUrl = null;

    try {
      // Modify Eyes Open PDF
      modifiedEyesOpenPath = await pdfLogoModifier.replaceLogo(eyesOpenFile.path);
      logProgress('LOGO_REPLACE', 'Eyes Open logo replaced successfully', '✅');

      // Modify Eyes Closed PDF
      modifiedEyesClosedPath = await pdfLogoModifier.replaceLogo(eyesClosedFile.path);
      logProgress('LOGO_REPLACE', 'Eyes Closed logo replaced successfully', '✅');
    } catch (logoError) {
      logProgress('LOGO_REPLACE', `Failed: ${logoError.message} - Using original PDFs`, '⚠️');
      modifiedEyesOpenPath = eyesOpenFile.path;
      modifiedEyesClosedPath = eyesClosedFile.path;
    }

    // Step 2: Upload modified QEEG files to Supabase bucket "qeeg-uploads"
    logProgress('SUPABASE_UPLOAD', 'Starting Supabase upload', '☁️');
    try {
      const timestamp = Date.now();
      // Use external_id + patient name for readable folder names (e.g., HOPE-202512-0001_Rakesh)
      const extId = req.body.patientExternalId || '';
      const pName = (req.body.patientName || 'Unknown').replace(/[^a-zA-Z0-9\s\-]/g, '').replace(/\s+/g, '_').trim();
      const patientIdForUpload = extId ? `${extId}_${pName}` : (req.body.patientId || 'unknown');

      // Upload Eyes Open PDF (modified with NeuroSense logo)
      const eoStoragePath = `${patientIdForUpload}/${timestamp}_EyesOpen_${eyesOpenFile.originalname}`;
      logProgress('SUPABASE_UPLOAD', `Uploading Eyes Open: ${eoStoragePath}`, '📤');
      const eoUploadResult = await SupabaseStorage.uploadFile(
        modifiedEyesOpenPath,
        'qeeg-uploads',
        eoStoragePath
      );
      logProgress('SUPABASE_UPLOAD', 'Eyes Open uploaded successfully', '✅');
      eyesOpenUrl = eoUploadResult.url;  // Store URL for response

      // Upload Eyes Closed PDF (modified with NeuroSense logo)
      const ecStoragePath = `${patientIdForUpload}/${timestamp}_EyesClosed_${eyesClosedFile.originalname}`;
      logProgress('SUPABASE_UPLOAD', `Uploading Eyes Closed: ${ecStoragePath}`, '📤');
      const ecUploadResult = await SupabaseStorage.uploadFile(
        modifiedEyesClosedPath,
        'qeeg-uploads',
        ecStoragePath
      );
      logProgress('SUPABASE_UPLOAD', 'Eyes Closed uploaded successfully', '✅');
      eyesClosedUrl = ecUploadResult.url;  // Store URL for response

      // Cleanup modified PDF files if they were created
      if (modifiedEyesOpenPath !== eyesOpenFile.path) {
        pdfLogoModifier.cleanupModifiedPdf(modifiedEyesOpenPath);
      }
      if (modifiedEyesClosedPath !== eyesClosedFile.path) {
        pdfLogoModifier.cleanupModifiedPdf(modifiedEyesClosedPath);
      }
    } catch (uploadError) {
      console.warn('⚠️  Failed to upload QEEG files to Supabase:', uploadError.message);
      console.warn('   Continuing with processing anyway...');
    }

    // Get patient info from request body
    const {
      patientId,
      patientName,
      clinicName,
      dateOfBirth,
      age,
      gender,
      handedness,
      occupation,
      parameterNotes
    } = req.body;

    console.log('\n👤 Patient Information:');
    console.log('  - Patient ID:', patientId);
    console.log('  - Patient Name:', patientName);
    console.log('  - Clinic:', clinicName);
    console.log('  - Date of Birth:', dateOfBirth);
    console.log('  - Age:', age);
    console.log('  - Gender:', gender);
    console.log('  - Handedness:', handedness);
    console.log('  - Occupation:', occupation || '(not in request)');
    console.log('\n📝 ========== NOTES DEBUG ==========');
    console.log('  - req.body keys:', Object.keys(req.body));
    console.log('  - parameterNotes raw:', req.body.parameterNotes);
    console.log('  - parameterNotes type:', typeof parameterNotes);
    console.log('  - parameterNotes value:', parameterNotes ? `"${parameterNotes}"` : '❌ UNDEFINED OR EMPTY');
    console.log('📝 ====================================\n');

    // Ensure parameterNotes is captured (handle empty string from FormData)
    const notesForPdf = parameterNotes && parameterNotes.trim() !== '' ? parameterNotes.trim() : '';
    console.log('📝 Final notesForPdf:', notesForPdf ? `"${notesForPdf}"` : '(empty)');

    // Validate Gemini API key presence only (skip live test to avoid wasting quota + rate limit delays)
    console.log('\n🔐 Checking Gemini API configuration...');
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not set - processing may fail');
    } else {
      console.log('✅ Gemini API key present');
    }

    // Step 1: Parse QEEG files
    logProgress('QEEG_PARSE', 'Starting QEEG file parsing', '📊');

    // Show cache stats before parsing
    const cacheStatsBefore = QEEGParser.getCacheStats();
    logProgress('CACHE_STATS', `Before: ${cacheStatsBefore.hits} hits, ${cacheStatsBefore.misses} misses`, 'ℹ️');

    let qeegData;
    try {
      qeegData = await QEEGParser.parse(eyesOpenFile, eyesClosedFile);
      logProgress('QEEG_PARSE', 'QEEG files parsed successfully', '✅');
    } catch (parseError) {
      logProgress('QEEG_PARSE', `FAILED: ${parseError.message}`, '❌');
      throw parseError;
    }

    // Show cache stats after parsing
    const cacheStatsAfter = QEEGParser.getCacheStats();
    logProgress('CACHE_STATS', `After: ${cacheStatsAfter.hits} hits, ${cacheStatsAfter.misses} misses`, 'ℹ️');

    if (cacheStatsAfter.hits > cacheStatsBefore.hits) {
      logProgress('CACHE', 'Cache hit! No API quota used', '⚡');
    } else {
      logProgress('CACHE', 'Cache miss - Gemini API called (quota consumed)', '📍');
    }

    // Validate that we got real patient data
    console.log('\n📊 QEEG Data Validation:');
    console.log('  - Eyes Open (EO) channels:', Object.keys(qeegData.EO?.absolute || {}).length);
    console.log('  - Eyes Closed (EC) channels:', Object.keys(qeegData.EC?.absolute || {}).length);
    console.log('  - Using REAL PATIENT DATA (not sample data)');
    console.log('  - Patient:', patientName, `(ID: ${patientId})`);

    // Verify non-zero values (proof of real data extraction)
    const eoFzTheta = qeegData.EO?.absolute?.Fz?.Theta || 0;
    const ecPzAlpha = qeegData.EC?.absolute?.Pz?.Alpha || 0;
    console.log('  - Sample Values (proof of extraction):');
    console.log(`    * EO Fz Theta: ${eoFzTheta}`);
    console.log(`    * EC Pz Alpha: ${ecPzAlpha}`);

    // Warn if all values are zero (indicates parsing failure)
    if (eoFzTheta === 0 && ecPzAlpha === 0) {
      console.warn('  ⚠️  WARNING: Sample values are zero - possible parsing issue!');
    }

    // COMPREHENSIVE VALIDATION CHECKS
    console.log('\n🔍 Comprehensive Data Validation:');

    // Check 1: Verify key channels have data
    const requiredChannels = ['Fz', 'Cz', 'Pz', 'F3', 'F4'];
    let missingChannels = 0;
    requiredChannels.forEach(ch => {
      const hasEO = qeegData.EO?.absolute?.[ch]?.Theta !== undefined;
      const hasEC = qeegData.EC?.absolute?.[ch]?.Alpha !== undefined;
      if (!hasEO || !hasEC) {
        console.warn(`  ⚠️  Missing data for channel ${ch}`);
        missingChannels++;
      }
    });
    if (missingChannels === 0) {
      console.log('  ✅ All required channels have data');
    }

    // Check 2: Verify values are in reasonable ranges (not all zeros or defaults)
    const testValues = [
      qeegData.EO?.absolute?.Fz?.Theta,
      qeegData.EO?.absolute?.Fz?.Beta,
      qeegData.EC?.absolute?.Pz?.Alpha,
      qeegData.EC?.relative?.Pz?.Alpha,
      qeegData.EC?.relative?.Pz?.Beta
    ];
    const uniqueValues = new Set(testValues.filter(v => v !== null && v !== undefined));
    if (uniqueValues.size <= 1) {
      console.warn('  ⚠️  WARNING: All test values are the same - possible static data!');
    } else {
      console.log(`  ✅ Data shows ${uniqueValues.size} unique values (not static)`);
    }

    // Check 3: Verify relative power sums to ~100% for a sample channel
    if (qeegData.EO?.relative?.Fz) {
      const fzBands = qeegData.EO.relative.Fz;
      const sum = (fzBands.Delta || 0) + (fzBands.Theta || 0) +
                  (fzBands.Alpha || 0) + (fzBands.Beta || 0) +
                  (fzBands.HiBeta || 0);
      console.log(`  📊 Relative power sum (EO Fz): ${sum.toFixed(1)}%`);
      if (sum < 80 || sum > 120) {
        console.warn(`  ⚠️  WARNING: Relative power sum is ${sum.toFixed(1)}% (expected ~100%)`);
      } else {
        console.log('  ✅ Relative power validation passed');
      }
    }

    // Check 4: Verify critical values for calculations exist
    const criticalValues = {
      'Relaxation (Pz EC Relative Alpha)': qeegData.EC?.relative?.Pz?.Alpha,
      'Relaxation (Pz EC Relative Beta)': qeegData.EC?.relative?.Pz?.Beta,
      'Focus (Fz EO Theta)': qeegData.EO?.absolute?.Fz?.Theta,
      'Focus (Fz EO Beta)': qeegData.EO?.absolute?.Fz?.Beta,
      'Alpha Peak': qeegData.EC?.special?.alphaPeak || qeegData.EC?.special?.O1
    };

    console.log('\n  🎯 Critical Values Check:');
    let missingCritical = 0;
    Object.entries(criticalValues).forEach(([name, value]) => {
      if (value === null || value === undefined) {
        console.warn(`  ❌ MISSING: ${name}`);
        missingCritical++;
      } else {
        console.log(`  ✅ ${name}: ${value}`);
      }
    });

    if (missingCritical > 0) {
      console.warn(`\n  ⚠️  WARNING: ${missingCritical} critical values missing - calculations may be inaccurate!`);
    } else {
      console.log('\n  ✅ All critical values present - ready for calculation');
    }

    // Step 2: Calculate parameters with RAW power calculator
    console.log('\n🧮 Step 2: Calculating 7 brain health parameters...');
    console.log('📊 Using Raw Power Calculator (as per specification)');

    const calculator = new AlgorithmCalculator(qeegData);
    const results = calculator.calculate();

    console.log('\n✅ Calculation completed successfully!');
    console.log('📈 Results Summary:');
    results.parameters.forEach(param => {
      console.log(`  - ${param.name}: ${param.score}/${param.maxScore} (${param.classification})`);
    });
    console.log(`  - Overall Score: ${results.overallScore}/21`);

    // COMPREHENSIVE DEBUG SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE DEBUG SUMMARY - FULL PIPELINE');
    console.log('='.repeat(80));

    console.log('\n1️⃣  DATA EXTRACTION PHASE:');
    console.log(`    Patient: ${patientName} (ID: ${patientId})`);
    console.log(`    Calculator: RAW Power (as per specification)`);
    console.log(`    EO Channels: ${Object.keys(qeegData.EO?.absolute || {}).length}`);
    console.log(`    EC Channels: ${Object.keys(qeegData.EC?.absolute || {}).length}`);

    console.log('\n2️⃣  SAMPLE EXTRACTED DATA:');
    console.log('    Key Values Used in Calculations:');
    console.log(`    - Fz EO Absolute Theta: ${qeegData.EO?.absolute?.Fz?.Theta || 'N/A'}`);
    console.log(`    - Fz EO Absolute Beta: ${qeegData.EO?.absolute?.Fz?.Beta || 'N/A'}`);
    console.log(`    - Pz EC Relative Alpha: ${qeegData.EC?.relative?.Pz?.Alpha || 'N/A'}`);
    console.log(`    - Pz EC Relative Beta: ${qeegData.EC?.relative?.Pz?.Beta || 'N/A'}`);
    console.log(`    - Alpha Peak: ${qeegData.EC?.special?.alphaPeak || qeegData.EC?.special?.O1 || 'N/A'} Hz`);

    console.log('\n3️⃣  CALCULATION RESULTS:');
    results.parameters.forEach((param, idx) => {
      console.log(`    ${idx + 1}. ${param.name}: ${param.score}/${param.maxScore} (${param.classification})`);
      param.metrics.forEach(metric => {
        console.log(`       - ${metric.name}: ${metric.score} point`);
        if (metric.description) {
          console.log(`         ${metric.description}`);
        }
      });
    });

    console.log('\n4️⃣  EXPECTED vs ACTUAL (for Rhea\'s Report):');
    const expectedScores = {
      'Cognition': { expected: 2, actual: results.parameters.find(p => p.name === 'Cognition')?.score },
      'Stress': { expected: 0, actual: results.parameters.find(p => p.name === 'Stress')?.score },
      'Focus & Attention': { expected: 2, actual: results.parameters.find(p => p.name === 'Focus & Attention')?.score },
      'Burnout & Fatigue': { expected: 0, actual: results.parameters.find(p => p.name === 'Burnout & Fatigue')?.score },
      'Emotional Regulation': { expected: 3, actual: results.parameters.find(p => p.name === 'Emotional Regulation')?.score },
      'Learning': { expected: 2, actual: results.parameters.find(p => p.name === 'Learning')?.score },
      'Creativity': { expected: 2, actual: results.parameters.find(p => p.name === 'Creativity')?.score }
    };

    console.log('    (Expected values are for Rhea\'s Report only)');
    Object.entries(expectedScores).forEach(([name, scores]) => {
      const match = scores.expected === scores.actual ? '✅' : '❌';
      console.log(`    ${match} ${name}: Expected ${scores.expected}/3, Got ${scores.actual}/3`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('END OF DEBUG SUMMARY');
    console.log('='.repeat(80) + '\n');

    // Step 3: Auto-generate PDF report
    console.log('\n📄 Step 3: Auto-generating PDF report...');
    let pdfUrl = null;
    let pdfFilename = null;

    try {
      // Prepare patient data for PDF
      // Fetch occupation from DB if not provided in request
      let patientOccupation = occupation || '';
      if (!patientOccupation && patientId) {
        try {
          const sbClient = createRoutedClient();
          const { data: patientRecord } = await sbClient
            .from('patients')
            .select('occupation')
            .eq('id', patientId)
            .single();
          if (patientRecord?.occupation) {
            patientOccupation = patientRecord.occupation;
            console.log('  📋 Occupation fetched from DB:', patientOccupation);
          }
        } catch (e) {
          console.warn('  ⚠️ Could not fetch occupation from DB:', e.message);
        }
      }

      // Clinic logo ONLY when this request carries the logoUrl from an Other
      // Documents upload made in the same admin session. Never resolved from
      // stored state — no upload means the default NeuroSense logo.
      let clinicLogoPath = null;
      try {
        if (req.body.clinicLogoUrl) {
          clinicLogoPath = await require('../services/clinicLogoService').resolveLogoUrlToPath(req.body.clinicLogoUrl);
          if (clinicLogoPath) console.log('   🎨 Using session-uploaded clinic logo for report');
        }
      } catch (logoErr) {
        console.warn('   ⚠️ Clinic logo resolution failed (using default):', logoErr.message);
      }

      const pdfPatientData = {
        name: patientName,
        dateOfBirth: dateOfBirth || 'N/A',
        age: age || 'N/A',
        gender: gender || 'Not specified',
        handedness: handedness || 'Not specified',
        occupation: patientOccupation,
        profession: patientOccupation,
        patientId: patientId,
        clinic: clinicName,
        clinicLogoPath
      };

      // Prepare algorithm results for PDF
      const pdfAlgorithmResults = {
        parameters: results.parameters,
        overallScore: results.overallScore
      };

      // Debug: Log parameters being sent to PDF
      console.log('\n📊 Parameters for PDF:');
      console.log('  - Total Parameters:', pdfAlgorithmResults.parameters.length);
      console.log('  - Overall Score:', pdfAlgorithmResults.overallScore);
      pdfAlgorithmResults.parameters.forEach((param, i) => {
        console.log(`  ${i + 1}. ${param.name}: ${param.score}/${param.maxScore} (${param.classification})`);
      });

      // Create output filename with clinic organization
      const timestamp = Date.now();
      const sanitizedName = (patientName || 'patient').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const sanitizedClinic = (clinicName || 'general').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      pdfFilename = `neurosense-report-${sanitizedName}-${timestamp}.pdf`;
      const uploadsDir = path.join(__dirname, '../uploads');
      const pdfOutputPath = path.join(uploadsDir, pdfFilename);

      // Clinic-wise folder path for Supabase
      const supabaseClinicPath = `reports/${sanitizedClinic}/${pdfFilename}`;

      // Ensure uploads directory exists
      if (!fs.existsSync(uploadsDir)) {
        console.log('📁 Creating uploads directory...');
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      console.log('📝 Generating PDF to:', pdfFilename);
      console.log('   Full path:', pdfOutputPath);
      console.log('   🏥 Clinic:', clinicName);
      console.log('   📁 Supabase path:', supabaseClinicPath);

      // === USE GEMINI PDF GENERATOR (with fallback) ===
      console.log('\n🔍 Checking available PDF generators...');
      console.log('   GeminiPdfGenerator available:', !!GeminiPdfGenerator);
      console.log('   EnhancedAIPdfGenerator available:', !!EnhancedAIPdfGenerator);
      console.log('   PDFReportGenerator available:', !!PDFReportGenerator);

      let pdfGenerator;
      // AI PDF GENERATOR - Uses Gemini AI
      const USE_AI_PDF_GENERATOR = true; // Set to false to use basic fallback

      if (USE_AI_PDF_GENERATOR && GeminiPdfGenerator) {
        console.log('\n🤖 === USING AI PDF GENERATOR (Gemini) ===');
        console.log('   Engine: Google Gemini + PDFKit');
        console.log('   Patient:', pdfPatientData.name);
        console.log('   Parameters:', pdfAlgorithmResults.parameters.length);

        // Pass input PDF paths for brain map image extraction
        const inputPdfPaths = {
          eyesOpen: eyesOpenFile?.path,
          eyesClosed: eyesClosedFile?.path
        };
        console.log('   Input PDFs:', inputPdfPaths.eyesOpen ? 'Available' : 'N/A', '/', inputPdfPaths.eyesClosed ? 'Available' : 'N/A');

        try {
          // Pass notesForPdf as 5th parameter for notes to appear under Alpha:Theta Balance
          console.log('   📝 Passing notes to PDF Generator:', notesForPdf ? `"${notesForPdf}"` : '(empty)');
          pdfGenerator = new GeminiPdfGenerator(pdfPatientData, pdfAlgorithmResults, qeegData, inputPdfPaths, notesForPdf);
          console.log('✅ Gemini PDF Generator instantiated successfully');
          console.log('   📝 With notes:', notesForPdf ? 'YES' : 'NO');
        } catch (instantiateError) {
          console.error('❌ Failed to instantiate Gemini PDF Generator:', instantiateError.message);
          throw instantiateError;
        }
      } else if (EnhancedAIPdfGenerator) {
        console.log('🤖 Using Enhanced AI PDF Generator (Fallback)');
        pdfGenerator = new EnhancedAIPdfGenerator(pdfPatientData, pdfAlgorithmResults, qeegData);
      } else {
        console.log('📄 Using Standard PDF Generator (Basic fallback)');
        pdfGenerator = new PDFReportGenerator(pdfPatientData, pdfAlgorithmResults, qeegData);
      }

      // Generate the PDF
      console.log('\n📝 Calling pdfGenerator.generateReport()...');
      console.log('   Output path:', pdfOutputPath);

      try {
        await pdfGenerator.generateReport(pdfOutputPath);
        console.log('✅ PDF generation completed!');
      } catch (genError) {
        console.error('❌ PDF generation threw error:', genError.message);
        console.error('   Stack:', genError.stack);
        throw genError;
      }

      // Verify file was created
      if (!fs.existsSync(pdfOutputPath)) {
        throw new Error('PDF file was not created at expected path: ' + pdfOutputPath);
      }

      console.log('✅ PDF file verified at:', pdfOutputPath);
      console.log('📄 File:', pdfFilename);
      console.log('📊 Size:', (fs.statSync(pdfOutputPath).size / 1024).toFixed(2), 'KB');

      // Upload to Supabase Storage with clinic-wise organization
      try {
        console.log('\n☁️  Uploading PDF to Supabase storage...');
        console.log('   📁 Upload path:', supabaseClinicPath);
        const uploadResult = await SupabaseStorage.uploadFile(
          pdfOutputPath,
          'neurosense-reports', // bucket name - All NeuroSense PDFs go here
          supabaseClinicPath // Clinic-wise path: reports/[clinic]/[filename].pdf
        );

        // Verify upload was successful and URL is valid
        if (uploadResult && uploadResult.url) {
          pdfUrl = uploadResult.url;
          console.log('✅ PDF uploaded to Supabase successfully');
          console.log('🔗 Supabase URL:', pdfUrl);

          // Delete local file after successful Supabase upload
          try {
            fs.unlinkSync(pdfOutputPath);
            console.log('🗑️  Local PDF file deleted after successful upload');
          } catch (deleteError) {
            console.warn('⚠️  Could not delete local PDF file:', deleteError.message);
          }
        } else {
          throw new Error('Supabase upload returned invalid result');
        }
      } catch (supabaseError) {
        console.error('⚠️  Supabase upload failed, using local storage');
        console.error('   Error message:', supabaseError.message);
        console.error('   Error stack:', supabaseError.stack);
        console.error('   Full error:', JSON.stringify(supabaseError, null, 2));
        // Fallback to local storage
        pdfUrl = `/uploads/${pdfFilename}`;
        console.log('📁 Using local file as fallback:', pdfUrl);
      }

    } catch (pdfError) {
      console.error('\n❌ === PDF GENERATION FAILED ===');
      console.error('Error message:', pdfError.message);
      console.error('Error stack:', pdfError.stack);
      console.error('Full error:', pdfError);
      console.error('=================================\n');

      // Set pdfUrl to null so frontend knows PDF failed
      pdfUrl = null;

      // Don't fail the whole request if PDF fails - processing still succeeded
      console.log('⚠️ Continuing without PDF - processing succeeded');
    }

    // Clean up uploaded files
    try {
      fs.unlinkSync(eyesOpenFile.path);
      fs.unlinkSync(eyesClosedFile.path);
      console.log('\n🗑️  Temporary files cleaned up');
    } catch (cleanupError) {
      console.error('⚠️  Error cleaning up files:', cleanupError.message);
    }

    console.log('\n🏁 === QEEG Processing Completed ===\n');

    // Final check for PDF URL
    if (!pdfUrl) {
      console.warn('⚠️⚠️⚠️ WARNING: No PDF URL available in response!');
      console.warn('   pdfFilename was:', pdfFilename || 'NOT SET');
      console.warn('   This means PDF generation completely failed');
    } else {
      console.log('✅ PDF URL ready:', pdfUrl);
      console.log('   Type:', pdfUrl.startsWith('http') ? 'Supabase' : 'Local');
    }

    // Send response
    const processingEndTime = Date.now();
    const processingDuration = ((processingEndTime - processingStartTime) / 1000).toFixed(2);

    logProgress('COMPLETE', `Processing finished successfully in ${processingDuration}s`, '🎉');

    // Log the full progress for debugging
    console.log('\n📋 === COMPLETE DEBUG LOG ===');
    progressLog.forEach(log => console.log(log));
    console.log('=============================\n');

    // Meter the report credit here, server-side — the old client-side counter
    // in databaseService.addReport was skippable from dev tools. Optimistic
    // concurrency (retry on conflicting writers); fail-open like the guard.
    if (reqClinicId && reqClinicId !== DEFAULT_CLINIC_ID) {
      try {
        const sb = createRoutedClient();
        let metered = false;
        for (let attempt = 0; attempt < 3 && !metered; attempt++) {
          const { data: clinic } = await sb.from('clinics').select('reports_used').eq('id', reqClinicId).single();
          const current = clinic?.reports_used;
          const used = Number(current ?? 0);
          let update = sb.from('clinics').update({ reports_used: used + 1 }).eq('id', reqClinicId);
          update = (current === null || current === undefined)
            ? update.is('reports_used', null)
            : update.eq('reports_used', current);
          const { data: updated } = await update.select('id');
          metered = !!(updated && updated.length);
          if (metered) logProgress('CREDITS', `reports_used incremented to ${used + 1}`, '🧮');
        }
        if (!metered) console.warn('Credit increment failed after retries for clinic', reqClinicId);
      } catch (incErr) {
        console.warn('Credit increment failed (fail-open):', incErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        patientId,
        patientName,
        clinicName,
        processedAt: new Date().toISOString(),
        dataType: 'raw', // Using RAW power calculator (as per specification)
        results: results.parameters,
        overallScore: results.overallScore,
        maxScore: 21,
        pdfUrl: pdfUrl,
        pdfFilename: pdfFilename,
        // Modified QEEG input files URLs (with NeuroSense logo)
        eyesOpenUrl: eyesOpenUrl,
        eyesClosedUrl: eyesClosedUrl,
        // Debug info
        processingDuration: `${processingDuration}s`,
        debugLog: progressLog
      }
    });

    // Send EDF upload notification email to admin (non-blocking)
    try {
      const PORT = process.env.PORT || 5000;
      fetch(`http://localhost:${PORT}/api/edf-upload-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          patientId,
          clinicName,
          overallScore: results.overallScore,
          pdfUrl: pdfUrl || '',
          processedAt: new Date().toISOString()
        })
      }).catch(err => console.error('EDF notification email failed:', err.message));
    } catch (notifError) {
      console.error('EDF notification setup failed:', notifError.message);
    }

  } catch (error) {
    console.error('\n❌ === QEEG Processing Failed ===');
    console.error('Error:', error.message);
    console.error('Error Code:', error.code || 'UNKNOWN');
    console.error('Stack:', error.stack);

    // Clean up files on error
    if (eyesOpenFile && fs.existsSync(eyesOpenFile.path)) {
      try {
        fs.unlinkSync(eyesOpenFile.path);
      } catch (e) {
        console.error('Error deleting Eyes Open file:', e.message);
      }
    }
    if (eyesClosedFile && fs.existsSync(eyesClosedFile.path)) {
      try {
        fs.unlinkSync(eyesClosedFile.path);
      } catch (e) {
        console.error('Error deleting Eyes Closed file:', e.message);
      }
    }

    // Categorize errors for better user feedback
    let statusCode = 500;
    let userMessage = error.message;

    // Check for Gemini quota error in error message
    if (error.message && error.message.includes('429') && error.message.includes('quota')) {
      error.code = 'GEMINI_QUOTA_EXCEEDED';
    }

    switch (error.code) {
      case 'MISSING_API_KEY':
      case 'INVALID_API_KEY':
      case 'INVALID_API_KEY_FORMAT':
      case 'API_CONNECTION_FAILED':
        statusCode = 503; // Service Unavailable
        userMessage = 'System configuration error: API key not properly configured. Please contact support.';
        break;

      case 'PDF_EXTRACTION_FAILED':
        statusCode = 422; // Unprocessable Entity
        userMessage = 'Failed to extract QEEG data from PDF. Please ensure the PDF contains valid QEEG tables with absolute and relative power values.';
        break;

      case 'GEMINI_QUOTA_EXCEEDED':
        statusCode = 429; // Too Many Requests
        userMessage = '⚠️ API Quota Exceeded\n\n' +
                     'The Gemini API free tier limit has been reached.\n\n' +
                     'Solutions:\n' +
                     '1. Wait a few hours for quota to reset (resets at midnight PST)\n' +
                     '2. Try re-uploading previously processed files (uses cache, no quota consumed)\n' +
                     '3. Upgrade to paid plan: https://ai.google.dev/pricing\n' +
                     '4. Contact administrator for assistance\n\n' +
                     'Cache Info: The system remembers files you\'ve uploaded before - those won\'t use quota!';
        break;

      default:
        // If error message contains Gemini quota keywords, classify it
        if (userMessage && (userMessage.includes('quota') || userMessage.includes('429') || userMessage.includes('Too Many Requests'))) {
          statusCode = 429;
          userMessage = '⚠️ API Quota Exceeded\n\n' +
                       'The Gemini AI service has reached its daily request limit.\n\n' +
                       'Solutions:\n' +
                       '• Wait for quota reset (usually resets at midnight PST)\n' +
                       '• Re-upload the same files (cached, no quota used)\n' +
                       '• Contact administrator to upgrade API plan\n\n' +
                       'Technical Details: ' + error.message;
        } else {
          userMessage = error.message || 'Failed to process QEEG files';
        }
    }

    const processingEndTime = Date.now();
    const processingDuration = ((processingEndTime - processingStartTime) / 1000).toFixed(2);

    logProgress('ERROR', `Processing failed after ${processingDuration}s`, '❌');

    // Log the full progress for debugging
    console.log('\n📋 === COMPLETE DEBUG LOG ===');
    progressLog.forEach(log => console.log(log));
    console.log('=============================\n');

    res.status(statusCode).json({
      error: true,
      message: userMessage,
      code: error.code || 'UNKNOWN_ERROR',
      processingDuration: `${processingDuration}s`,
      debugLog: progressLog,
      technicalDetails: process.env.NODE_ENV === 'development' ? {
        originalMessage: error.message,
        stack: error.stack,
        condition: error.condition
      } : undefined
    });
  }
});

/**
 * POST /api/qeeg/generate-pdf
 * Generate PDF report from algorithm results
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    console.log('\n📄 === PDF Report Generation Started ===\n');

    const { patientData, algorithmResults, qeegData, parameterNotes } = req.body;

    // Validate input
    if (!patientData || !algorithmResults || !qeegData) {
      return res.status(400).json({
        error: true,
        message: 'Missing required data: patientData, algorithmResults, and qeegData are required'
      });
    }

    console.log('👤 Patient:', patientData.name);
    console.log('🏥 Clinic:', patientData.clinicName || 'Not specified');
    console.log('📊 Parameters:', algorithmResults.parameters?.length);

    // Clinic logo ONLY when this request carries the logoUrl from an Other
    // Documents upload made in the same admin session (never from stored state).
    patientData.clinicLogoPath = null;
    if (patientData.clinicLogoUrl) {
      try {
        patientData.clinicLogoPath = await require('../services/clinicLogoService').resolveLogoUrlToPath(patientData.clinicLogoUrl);
        if (patientData.clinicLogoPath) console.log('🎨 Using session-uploaded clinic logo for report');
      } catch (logoErr) {
        console.warn('⚠️ Clinic logo resolution failed (using default):', logoErr.message);
      }
    }
    console.log('📝 Notes received from frontend:', parameterNotes ? `"${parameterNotes.substring(0, 50)}..."` : '(EMPTY - no notes provided)');
    console.log('📝 Notes type:', typeof parameterNotes);
    console.log('📝 Notes length:', parameterNotes ? parameterNotes.length : 0);

    // === USE GEMINI PDF GENERATOR (if available) ===
    // Note: This route doesn't have access to input PDF files, so brain map images will use placeholders
    let generator;
    if (GeminiPdfGenerator) {
      console.log('🤖 Using Gemini AI PDF Generator (Google Gemini + PDFKit)');
      console.log('   ℹ️  No input PDF files available - brain maps will use placeholders');
      generator = new GeminiPdfGenerator(patientData, algorithmResults, qeegData, null, parameterNotes);
    } else if (EnhancedAIPdfGenerator) {
      console.log('🤖 Using Enhanced AI PDF Generator (Fallback)');
      generator = new EnhancedAIPdfGenerator(patientData, algorithmResults, qeegData);
    } else {
      console.log('📄 Using Standard PDF Generator (Basic fallback)');
      generator = new PDFReportGenerator(patientData, algorithmResults, qeegData);
    }

    // Create output filename with clinic organization
    const timestamp = Date.now();
    const sanitizedName = (patientData.name || 'patient').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const sanitizedClinic = (patientData.clinicName || 'general').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `neurosense-report-${sanitizedName}-${timestamp}.pdf`;
    const outputPath = path.join(__dirname, '../uploads', filename);

    // Clinic-wise folder path for Supabase: reports/[clinic-name]/[filename].pdf
    const supabaseFolderPath = `reports/${sanitizedClinic}/${filename}`;

    console.log('📝 Generating AI-powered PDF to:', filename);
    console.log('📁 Supabase path will be:', supabaseFolderPath);

    // Generate the PDF with AI insights
    const pdfPath = await generator.generateReport(outputPath);

    console.log('\n✅ PDF Report Generated Successfully!');
    console.log('📄 File:', filename);
    console.log('📊 Size:', (fs.statSync(pdfPath).size / 1024).toFixed(2), 'KB');

    const pdfSize = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0;

    console.log('\n🏁 === Sending PDF directly to client ===\n');

    // Send PDF file directly as attachment (avoids HTTPS/HTTP mismatch on production)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfSize);
    res.sendFile(pdfPath, (err) => {
      if (err) {
        console.error('❌ Error sending PDF:', err);
      } else {
        console.log('✅ PDF sent successfully to client');

        // Upload to Supabase in background AFTER file is sent (non-blocking)
        (async () => {
          try {
            console.log('\n☁️  Background: Uploading to Supabase...');
            const uploadResult = await Promise.race([
              SupabaseStorage.uploadFile(
                pdfPath,
                'neurosense-reports',
                supabaseFolderPath
              ),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Supabase upload timeout (15s)')), 15000)
              )
            ]);

            if (uploadResult && uploadResult.url) {
              console.log('✅ Background: PDF uploaded to Supabase:', uploadResult.url);
            }
          } catch (error) {
            console.log('⚠️  Background: Supabase upload failed:', error.message, '(local PDF still available)');
          }
        })();
      }
    });

  } catch (error) {
    console.error('\n❌ === PDF Generation Failed ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      error: true,
      message: error.message || 'Failed to generate PDF report',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/qeeg/generate-sample-pdf
 * Generate a sample PDF report for testing
 */
router.post('/generate-sample-pdf', async (req, res) => {
  try {
    console.log('\n📄 === Sample PDF Generation Started ===\n');

    const pdfPath = await PDFReportGenerator.generateSampleReport();

    console.log('✅ Sample PDF Generated!');
    console.log('📄 Path:', pdfPath);

    const filename = path.basename(pdfPath);

    res.json({
      success: true,
      data: {
        filename: filename,
        path: `/uploads/${filename}`,
        url: `${req.protocol}://${req.get('host')}/uploads/${filename}`,
        size: fs.statSync(pdfPath).size
      }
    });

  } catch (error) {
    console.error('❌ Sample PDF generation failed:', error);

    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

/**
 * POST /api/qeeg/generate-ai-pdf
 * Generate AI-powered PDF report with enhanced design and content
 */
router.post('/generate-ai-pdf', async (req, res) => {
  try {
    console.log('\n🤖 === AI PDF Report Generation Started ===\n');

    const { patientData, algorithmResults, qeegData } = req.body;

    // Validate input
    if (!patientData || !algorithmResults || !qeegData) {
      return res.status(400).json({
        error: true,
        message: 'Missing required data: patientData, algorithmResults, and qeegData are required'
      });
    }

    console.log('👤 Patient:', patientData.name);
    console.log('📊 Parameters:', algorithmResults.parameters?.length);
    console.log('🎯 Using AI-powered generation with enhanced prompt');

    // Generate AI PDF
    const generator = new AIPdfGenerator(patientData, algorithmResults, qeegData);

    // Create output filename
    const timestamp = Date.now();
    const sanitizedName = (patientData.name || 'patient').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `ai-neurosense-report-${sanitizedName}-${timestamp}.pdf`;
    const outputPath = path.join(__dirname, '../uploads', filename);

    console.log('📝 Generating AI PDF to:', filename);

    // Generate the PDF
    const result = await generator.generateReport(outputPath);

    console.log('\n✅ AI NeuroSense Report Generated Successfully!');
    console.log('📄 Text File:', path.basename(result.textOutputPath));
    console.log('📄 JSON File:', path.basename(result.outputPath));
    console.log('📊 Tokens Used:', result.tokensUsed);
    console.log('📏 Content Length:', result.contentLength, 'characters');
    console.log('\n🏁 === AI PDF Generation Completed ===\n');

    // Return report info
    res.json({
      success: true,
      data: {
        textFile: {
          filename: path.basename(result.textOutputPath),
          path: `/uploads/${path.basename(result.textOutputPath)}`,
          url: `${req.protocol}://${req.get('host')}/uploads/${path.basename(result.textOutputPath)}`,
          type: 'Plain Text Report'
        },
        jsonFile: {
          filename: path.basename(result.outputPath),
          path: `/uploads/${path.basename(result.outputPath)}`,
          url: `${req.protocol}://${req.get('host')}/uploads/${path.basename(result.outputPath)}`,
          type: 'Structured Data (JSON)'
        },
        contentLength: result.contentLength,
        tokensUsed: result.tokensUsed,
        generatedAt: new Date().toISOString()
      },
      message: 'AI-powered NeuroSense report generated successfully. Text file contains formatted report ready for PDF conversion.'
    });

  } catch (error) {
    console.error('\n❌ === AI PDF Generation Failed ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      error: true,
      message: error.message || 'Failed to generate AI PDF report',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/qeeg/generate-ai-sample-pdf
 * Generate a sample AI-powered PDF report for testing
 */
router.post('/generate-ai-sample-pdf', async (req, res) => {
  try {
    console.log('\n🤖 === Sample AI PDF Generation Started ===\n');

    const result = await AIPdfGenerator.generateSampleReport();

    console.log('✅ Sample AI PDF Generated!');
    console.log('📄 Path:', result.outputPath);

    const filename = path.basename(result.outputPath);

    res.json({
      success: true,
      data: {
        filename: filename,
        path: `/uploads/${filename}`,
        url: `${req.protocol}://${req.get('host')}/uploads/${filename}`,
        contentLength: result.contentLength,
        tokensUsed: result.tokensUsed,
        type: 'AI-Generated Sample (JSON format)'
      }
    });

  } catch (error) {
    console.error('❌ Sample AI PDF generation failed:', error);

    res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

/**
 * GET /api/qeeg/supabase-pdfs
 * List all PDFs from Supabase bucket
 */
router.get('/supabase-pdfs', async (req, res) => {
  try {
    console.log('📋 Fetching PDFs from Supabase bucket (neurosense-reports)...');

    const files = await SupabaseStorage.listFiles('neurosense-reports', 'reports');

    // Get public URLs for all files
    const pdfs = files.map(file => {
      const supabase = createRoutedClient();
      const { data: urlData } = supabase.storage
        .from('neurosense-reports')
        .getPublicUrl(`reports/${file.name}`);

      return {
        name: file.name,
        url: urlData.publicUrl,
        created_at: file.created_at,
        size: file.metadata?.size
      };
    });

    console.log(`✅ Found ${pdfs.length} PDFs in Supabase bucket`);

    res.json({
      success: true,
      count: pdfs.length,
      pdfs: pdfs
    });

  } catch (error) {
    console.error('❌ Error listing Supabase PDFs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/qeeg/verify-bucket
 * Verify neurosense-reports bucket exists and list its contents
 */
router.get('/verify-bucket', async (req, res) => {
  try {
    console.log('🔍 Verifying neurosense-reports bucket...');

    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: 'Supabase credentials not configured',
        details: {
          SUPABASE_URL: supabaseUrl ? 'Set' : 'Missing',
          SUPABASE_SERVICE_ROLE_KEY: supabaseKey ? 'Set' : 'Missing'
        }
      });
    }

    const supabase = createRoutedClient();

    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to list buckets',
        details: listError.message
      });
    }

    const neurosenseBucket = buckets.find(b => b.name === 'neurosense-reports');

    if (!neurosenseBucket) {
      return res.json({
        success: false,
        bucketExists: false,
        error: 'neurosense-reports bucket does not exist',
        availableBuckets: buckets.map(b => b.name),
        instructions: 'Run the SQL in CREATE_NEUROSENSE_REPORTS_BUCKET.sql or run: node server/scripts/createNeuroSenseBucket.js'
      });
    }

    // Bucket exists - list its contents
    const { data: files, error: filesError } = await supabase.storage
      .from('neurosense-reports')
      .list('reports', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (filesError) {
      return res.json({
        success: true,
        bucketExists: true,
        bucketInfo: neurosenseBucket,
        filesError: filesError.message,
        files: []
      });
    }

    // Get public URLs for files
    const filesWithUrls = (files || []).map(file => {
      const { data: urlData } = supabase.storage
        .from('neurosense-reports')
        .getPublicUrl(`reports/${file.name}`);

      return {
        name: file.name,
        url: urlData.publicUrl,
        created_at: file.created_at,
        size: file.metadata?.size || 0
      };
    });

    console.log(`✅ Found ${filesWithUrls.length} PDFs in neurosense-reports bucket`);

    res.json({
      success: true,
      bucketExists: true,
      bucketInfo: {
        name: neurosenseBucket.name,
        public: neurosenseBucket.public,
        created_at: neurosenseBucket.created_at
      },
      filesCount: filesWithUrls.length,
      files: filesWithUrls
    });

  } catch (error) {
    console.error('❌ Error verifying bucket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/qeeg/test
 * Test endpoint to verify API is working
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'QEEG Processing API is working',
    endpoints: {
      process: 'POST /api/qeeg/process - Upload and process QEEG files (Uses Gemini for PDF extraction)',
      generatePdf: 'POST /api/qeeg/generate-pdf - Generate PDF report from results (Gemini + PDFKit)',
      generateSamplePdf: 'POST /api/qeeg/generate-sample-pdf - Generate sample PDF report (PDFKit)',
      generateAiPdf: 'POST /api/qeeg/generate-ai-pdf - Generate AI-powered PDF report',
      generateAiSamplePdf: 'POST /api/qeeg/generate-ai-sample-pdf - Generate AI sample PDF report',
      generateGeminiReport: 'POST /api/qeeg/generate-gemini-report - Generate AI report structure using Gemini',
      supabasePdfs: 'GET /api/qeeg/supabase-pdfs - List all PDFs from neurosense-reports bucket',
      verifyBucket: 'GET /api/qeeg/verify-bucket - Verify neurosense-reports bucket and list contents',
      quotaStatus: 'GET /api/qeeg/quota-status - Check Gemini API quota usage'
    }
  });
});

/**
 * GET /api/qeeg/quota-status
 * Check Gemini API quota usage and limits
 */
router.get('/quota-status', (req, res) => {
  try {
    const quotaStatus = QEEGParser.getQuotaStatus();

    // Calculate time until reset
    const now = new Date();
    const nextReset = new Date(quotaStatus.nextDayReset);
    const hoursUntilReset = Math.max(0, (nextReset - now) / (1000 * 60 * 60));

    res.json({
      success: true,
      quota: {
        daily: {
          used: quotaStatus.dailyUsed,
          limit: quotaStatus.dailyLimit,
          remaining: quotaStatus.dailyRemaining,
          percentUsed: quotaStatus.dailyPercentUsed + '%',
          status: quotaStatus.dailyRemaining === 0 ? 'EXHAUSTED' :
                  quotaStatus.dailyPercentUsed >= 80 ? 'WARNING' : 'OK'
        },
        minute: {
          used: quotaStatus.minuteUsed,
          limit: quotaStatus.minuteLimit
        },
        lastRequest: quotaStatus.lastRequestTime,
        nextReset: quotaStatus.nextDayReset,
        hoursUntilReset: hoursUntilReset.toFixed(1)
      },
      recommendations: quotaStatus.dailyRemaining === 0 ? [
        'Daily quota exhausted. Wait ' + hoursUntilReset.toFixed(1) + ' hours for reset.',
        'Or re-upload the SAME files to use cache (no quota used)',
        'Or upgrade to paid plan at https://ai.google.dev/pricing'
      ] : quotaStatus.dailyPercentUsed >= 80 ? [
        'Approaching daily limit. Consider upgrading soon.',
        'Re-uploading same files uses cache (no quota)'
      ] : [
        'Quota is healthy. You can process ' + Math.floor(quotaStatus.dailyRemaining / 2) + ' more patients today.'
      ]
    });
  } catch (error) {
    console.error('Error getting quota status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quota status',
      message: error.message
    });
  }
});

/**
 * POST /api/qeeg/generate-gemini-report
 * Generate AI-powered report structure using Google Gemini
 */
router.post('/generate-gemini-report', async (req, res) => {
  try {
    console.log('\n🤖 === Gemini AI Report Generation Started ===\n');

    if (!GeminiService) {
      return res.status(503).json({
        error: true,
        message: 'Gemini AI service is not available. Please check server configuration.'
      });
    }

    const { algorithmResults } = req.body;

    // Validate input
    if (!algorithmResults || !algorithmResults.parameters) {
      return res.status(400).json({
        error: true,
        message: 'Missing required data: algorithmResults with parameters array is required'
      });
    }

    console.log('📊 Processing', algorithmResults.parameters.length, 'brain parameters');

    // Transform algorithm results to the format expected by Gemini
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
    algorithmResults.parameters.forEach(param => {
      const paramName = param.name.replace(/\s+/g, '');
      if (brainParameters.hasOwnProperty(paramName)) {
        brainParameters[paramName] = {
          score: param.score,
          bucket: param.bucket,
          subparameters: param.subParameters || []
        };
      }
    });

    console.log('🧠 Brain Parameters prepared for Gemini');

    // Generate report using Gemini AI
    const result = await GeminiService.generateBrainPerformanceReport(brainParameters);

    if (!result.success) {
      return res.status(500).json({
        error: true,
        message: 'Failed to generate report with Gemini AI',
        details: result.error
      });
    }

    console.log('✅ Gemini AI report generated successfully');

    res.json({
      success: true,
      message: 'AI-powered report structure generated successfully',
      reportData: result.data,
      rawResponse: result.rawResponse
    });

  } catch (error) {
    console.error('❌ Error generating Gemini report:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error while generating Gemini report',
      details: error.message
    });
  }
});

/**
 * GET /api/qeeg/patient-qeeg-files/:patientId
 * List all QEEG input files (Eyes Open & Eyes Closed) for a patient from Supabase bucket
 */
router.get('/patient-qeeg-files/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        error: true,
        message: 'Patient ID is required'
      });
    }

    console.log(`📂 Fetching QEEG files for patient: ${patientId}`);

    const qeegFiles = await SupabaseStorage.listPatientQEEGFiles(patientId);

    res.json({
      success: true,
      patientId,
      files: qeegFiles,
      counts: {
        eyesOpen: qeegFiles.eyesOpen.length,
        eyesClosed: qeegFiles.eyesClosed.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching patient QEEG files:', error);
    res.status(500).json({
      error: true,
      message: 'Failed to fetch QEEG files',
      details: error.message
    });
  }
});

/**
 * POST /api/qeeg/upload-clinic-logo
 * Admin uploads a clinic's logo (PDF page containing the logo, or PNG/JPG).
 * The logo is extracted (PDF page 1 rendered + auto-cropped), stored in the
 * clinic-logos bucket and saved on clinics.logo_url — newly generated
 * NeuroSense + Performance reports for that clinic then use it in place of
 * the NeuroSense logo.
 */
const logoUpload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) cb(null, true);
    else cb(new Error('Only .pdf, .png, .jpg files are allowed for the clinic logo'));
  }
});

router.post('/upload-clinic-logo', logoUpload.single('document'), async (req, res) => {
  const file = req.file;
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    if (!file) return res.status(400).json({ error: true, message: 'No file uploaded' });
    if (!clinicId) return res.status(400).json({ error: true, message: 'clinicId is required — select a patient/clinic first' });

    console.log(`🎨 Clinic logo upload for ${clinicId}: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);
    const clinicLogoService = require('../services/clinicLogoService');
    const { logoUrl } = await clinicLogoService.setClinicLogoFromUpload(file.path, file.originalname, clinicId);
    res.json({ success: true, logoUrl });
  } catch (error) {
    console.error('❌ Clinic logo upload failed:', error.message);
    res.status(500).json({ error: true, message: error.message || 'Logo upload failed' });
  } finally {
    try { if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch { /* ignore */ }
  }
});

/**
 * POST /api/qeeg/replace-logo-download
 * Upload a document, replace logo with NeuroSense, and return the modified file for download
 * No storage - just process and return
 */
router.post('/replace-logo-download', upload.single('document'), async (req, res) => {
  let processedFilePath = null;
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }

    console.log(`📄 Processing document for logo replacement: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);

    processedFilePath = file.path;

    if (file.originalname.toLowerCase().endsWith('.pdf')) {
      console.log('🔄 Replacing logo in document...');
      const modifiedPath = await pdfLogoModifier.replaceLogo(file.path);
      processedFilePath = modifiedPath;
      console.log('✅ Logo replaced successfully');
    }

    // Send the modified file back as download
    const downloadName = file.originalname.replace('.pdf', '_NeuroSense.pdf');
    res.download(processedFilePath, downloadName, (err) => {
      // Cleanup temp files after download
      try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        if (processedFilePath !== file.path && fs.existsSync(processedFilePath)) {
          fs.unlinkSync(processedFilePath);
        }
      } catch (cleanErr) {
        console.warn('⚠️ Cleanup warning:', cleanErr.message);
      }
      if (err) {
        console.error('❌ Download error:', err.message);
      }
    });

  } catch (error) {
    console.error('❌ Error processing document:', error);
    // Cleanup on error
    try {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (processedFilePath && processedFilePath !== req.file?.path && fs.existsSync(processedFilePath)) {
        fs.unlinkSync(processedFilePath);
      }
    } catch (cleanErr) { /* ignore */ }
    res.status(500).json({
      error: true,
      message: 'Failed to process document',
      details: error.message
    });
  }
});

module.exports = router;

