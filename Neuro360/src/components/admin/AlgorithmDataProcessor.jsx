import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Download, FileText, CheckCircle, Activity, User, Building2, Calendar, History, X, ArrowLeft, Search, Filter, Send, Loader2 } from 'lucide-react';
import DatabaseService from '../../services/databaseService';
import SupabaseService from '../../services/supabaseService';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

// Always return a CURRENT Supabase access token. supabase.auth.getSession() refreshes
// the token transparently if it's near expiry, so /api/qeeg/* calls no longer 401
// after ~1 hr. Falls back to the legacy localStorage tokens for dev-bypass logins
// that don't have a Supabase session.
const getFreshToken = async () => {
  try {
    const { data } = await SupabaseService.supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch {}
  return localStorage.getItem('authToken') || localStorage.getItem('access_token');
};

const parseResultsData = (data) => {
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return []; } }
  return [];
};

const AlgorithmDataProcessor = () => {
  const [patients, setPatients] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showProcessingUI, setShowProcessingUI] = useState(false);
  const [processingHistory, setProcessingHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClinicFilter, setSelectedClinicFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [eyesOpenFile, setEyesOpenFile] = useState(null);
  const [eyesClosedFile, setEyesClosedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [consoleLog, setConsoleLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [eyesOpenUrl, setEyesOpenUrl] = useState(null);  // Modified Eyes Open PDF URL
  const [eyesClosedUrl, setEyesClosedUrl] = useState(null);  // Modified Eyes Closed PDF URL
  const [patientQeegFiles, setPatientQeegFiles] = useState({ eyesOpen: [], eyesClosed: [] });  // QEEG files from Supabase bucket
  const [dataType, setDataType] = useState(null); // 'raw' or 'zscore'
  const [parameterNotes, setParameterNotes] = useState(''); // Notes for parameter analysis
  const [isSendingReport, setIsSendingReport] = useState(false); // State for sending report to clinic/patient
  const [reportSent, setReportSent] = useState(false); // Locks send button after successful send (prevents duplicate emails)
  const [claudeReportSent, setClaudeReportSent] = useState(false); // Same for Claude report send button
  const [processingStartTime, setProcessingStartTime] = useState(null); // Track processing start time
  const [processingDuration, setProcessingDuration] = useState(null); // Duration in ms
  const [isUploadingDoc, setIsUploadingDoc] = useState(false); // Uploading state for other docs
  const [processedDocBlob, setProcessedDocBlob] = useState(null); // Processed document blob ready for download
  const [processedDocName, setProcessedDocName] = useState(''); // Processed document filename

  // Report mode: 'neurosense' (default, shared with patient & clinic) or 'claude'
  // (NeuroSense report kept private to Super Admin; Claude report generated & sent instead)
  const [reportMode, setReportMode] = useState('neurosense');
  const [claudeReportUrl, setClaudeReportUrl] = useState(null); // Supabase public URL of the generated Claude report
  const [savedResultId, setSavedResultId] = useState(null); // id of the saved algorithm_results row (for attaching claude_report_url)
  const [isSendingClaudeReport, setIsSendingClaudeReport] = useState(false); // State for sending Claude report

  // Claude Report (12-page Brain Type & Performance Report) — forwards the generated
  // NeuroSense PDF to the server, which regenerates the polished 12-page version.
  const [isGeneratingClaudeReport, setIsGeneratingClaudeReport] = useState(false);
  const [claudeReportError, setClaudeReportError] = useState(null);
  const [claudeReportFileName, setClaudeReportFileName] = useState('');
  // Live progress for the Claude report (fed by the backend SSE stream).
  const [claudeProgress, setClaudeProgress] = useState(0);
  const [claudeStages, setClaudeStages] = useState([]); // [{ key, label, status, elapsedMs }]
  const claudeCreepRef = useRef(null); // interval id for intra-stage bar "creep"
  const sidecarAbortReasonRef = useRef(null); // 'SIDECAR_DOWN' | null — set before aborting controller

  // Debug function to check database contents
  useEffect(() => {
    window.debugAlgorithmResults = async () => {
      const allResults = await DatabaseService.get('algorithmResults');
      allResults.forEach((record, idx) => {
        console.log(`\n📊 Record ${idx + 1}:`, {
          id: record.id,
          patientName: record.inputData?.patientName || record.patientName,
          processedAt: record.inputData?.processedAt || record.processedAt,
          pdfUrl: record.pdfUrl || '❌ MISSING',
          hasResults: !!(record.outputData || record.results)
        });
      });
    };
  }, []);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    if (selectedPatient && showProcessingUI) {
      loadProcessingHistory(selectedPatient.id);
    }
  }, [selectedPatient, showProcessingUI, isSaved]); // Re-load when saved

  const loadPatients = async () => {
    try {
      const patientsData = await DatabaseService.get('patients');
      const clinicsData = await DatabaseService.get('clinics');
      const algorithmResults = await DatabaseService.get('algorithmResults') || [];

      // Enrich patients with clinic names and algorithm status
      const enrichedPatients = patientsData.map(patient => {
        const patientResults = algorithmResults.filter(r => r.patientId === patient.id);
        const lastResult = patientResults.length > 0
          ? patientResults.sort((a, b) => {
              const aTime = a.inputData?.processedAt || a.processedAt || a.createdAt;
              const bTime = b.inputData?.processedAt || b.processedAt || b.createdAt;
              return new Date(bTime) - new Date(aTime);
            })[0]
          : null;

        return {
          ...patient,
          clinicName: clinicsData.find(c => c.id === patient.clinicId)?.name || 'Unknown Clinic',
          algorithmStatus: lastResult ? 'completed' : 'pending',
          lastProcessed: lastResult?.inputData?.processedAt || lastResult?.processedAt || lastResult?.createdAt,
          totalScans: patientResults.length
        };
      });

      setPatients(enrichedPatients);
      setClinics(clinicsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading patients:', error);
      toast.error('Failed to load patients');
      setLoading(false);
    }
  };

  const loadProcessingHistory = async (patientId) => {
    try {
      // Load algorithm results for this patient
      const results = await DatabaseService.get('algorithmResults');
      const patientResults = results.filter(r => r.patientId === patientId);


      // Log all records for debugging
      patientResults.forEach((rec, idx) => {
        const processedTime = rec.inputData?.processedAt || rec.processedAt || rec.createdAt;
      });

      // Check for records without pdfUrl and try to fix them
      const recordsWithoutPdf = patientResults.filter(r => !r.pdfUrl);
      if (recordsWithoutPdf.length > 0) {

        let updatedCount = 0;

        // Step 1: Try to fetch PDFs from Supabase bucket
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          const token = await getFreshToken();
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

          const response = await fetch(`${apiUrl}/qeeg/supabase-pdfs`, { headers });

          if (response.ok) {
            const data = await response.json();
            data.pdfs.forEach(pdf => console.log(`   - ${pdf.name}`));

            // Match PDFs with database records using smart matching
            for (const record of recordsWithoutPdf) {
              const processedTime = record.inputData?.processedAt || record.processedAt || record.createdAt;
              const patientName = record.inputData?.patientName || record.patientName || 'unknown';
              const recordTimestamp = new Date(processedTime).getTime();
              const sanitizedName = patientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();


              // Find PDFs matching patient name
              const matchingPdfs = data.pdfs.filter(pdf => {
                const pdfNameLower = pdf.name.toLowerCase();
                return pdfNameLower.includes(`neurosense-report-${sanitizedName}-`) &&
                       pdfNameLower.endsWith('.pdf');
              });


              if (matchingPdfs.length > 0) {
                // Find PDF with closest timestamp (within 60 seconds)
                let bestMatch = null;
                let smallestDiff = Infinity;

                for (const pdf of matchingPdfs) {
                  // Extract timestamp from filename: neurosense-report-name-TIMESTAMP.pdf
                  const match = pdf.name.match(/-(\d+)\.pdf$/);
                  if (match) {
                    const pdfTimestamp = parseInt(match[1]);
                    const diff = Math.abs(pdfTimestamp - recordTimestamp);

                    // Accept if within 60 seconds (60000ms)
                    if (diff < 60000 && diff < smallestDiff) {
                      smallestDiff = diff;
                      bestMatch = pdf;
                    }
                  }
                }

                if (bestMatch) {
                  record.pdfUrl = bestMatch.url;
                  await DatabaseService.update('algorithmResults', record.id, record);
                  updatedCount++;
                } else {
                }
              } else {
              }
            }
          }
        } catch (supabaseErr) {
        }

        // Step 2: If Supabase fails, try local storage
        for (const record of recordsWithoutPdf) {
          if (record.pdfUrl) continue; // Already updated from Supabase

          try {
            const processedTime = record.inputData?.processedAt || record.processedAt || record.createdAt;
            const patientName = record.inputData?.patientName || record.patientName || 'unknown';
            const timestamp = new Date(processedTime).getTime();
            const sanitizedName = patientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const possibleFilename = `neurosense-report-${sanitizedName}-${timestamp}.pdf`;
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const backendBaseUrl = apiUrl.replace('/api', '');
            const testUrl = `${backendBaseUrl}/uploads/${possibleFilename}`;

            // Test if file exists locally
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok) {
              record.pdfUrl = `/uploads/${possibleFilename}`;
              await DatabaseService.update('algorithmResults', record.id, record);
              updatedCount++;
            }
          } catch (err) {
          }
        }

        if (updatedCount > 0) {
          // Reload the results after updating
          const updatedResults = await DatabaseService.get('algorithmResults');
          const updatedPatientResults = updatedResults.filter(r => r.patientId === patientId);
          setProcessingHistory(updatedPatientResults);

          updatedPatientResults.forEach((record, idx) => {
            const processedTime = record.inputData?.processedAt || record.processedAt || record.createdAt;
            console.log(`   Record ${idx + 1}:`, {
              processedAt: processedTime,
              hasPdfUrl: !!record.pdfUrl,
              pdfUrl: record.pdfUrl || 'NOT SET',
              pdfType: record.pdfUrl ? (record.pdfUrl.startsWith('http') ? 'Supabase' : 'Local') : 'None'
            });
          });
          return;
        }
      }

      patientResults.forEach((record, idx) => {
        const processedTime = record.inputData?.processedAt || record.processedAt || record.createdAt;
        console.log(`   Record ${idx + 1}:`, {
          processedAt: processedTime,
          hasPdfUrl: !!record.pdfUrl,
          pdfUrl: record.pdfUrl || 'NOT SET',
          pdfType: record.pdfUrl ? (record.pdfUrl.startsWith('http') ? 'Supabase' : 'Local') : 'None'
        });
      });

      setProcessingHistory(patientResults);

      // Also fetch QEEG files from Supabase bucket for this patient
      await fetchPatientQeegFiles(patientId);
    } catch (error) {
      console.error('Error loading processing history:', error);
      setProcessingHistory([]);
    }
  };

  // Fetch QEEG files (Eyes Open & Eyes Closed) from Supabase bucket
  const fetchPatientQeegFiles = async (patientId) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = await getFreshToken();
      const response = await fetch(`${apiUrl}/qeeg/patient-qeeg-files/${patientId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        setPatientQeegFiles(data.files);

        // DO NOT auto-set URLs from bucket - only set when files are uploaded in current session
      }
    } catch (error) {
      console.error('Error fetching patient QEEG files:', error);
    }
  };

  const handleGenerateReport = async (patient) => {
    setSelectedPatient(patient);
    setShowProcessingUI(true);
    // Reset upload states
    setEyesOpenFile(null);
    setEyesClosedFile(null);
    setResults(null);
    setProcessingComplete(false);
    setConsoleLog([]);
    setIsSaved(false);
    setPdfUrl(null);
    setIsSaving(false);
    setReportSent(false);
    setClaudeReportSent(false);
    // Reset QEEG PDF URLs for fresh session
    setEyesOpenUrl(null);
    setEyesClosedUrl(null);

    // Load saved notes from database for this patient
    try {
      const allResults = await DatabaseService.get('algorithmResults');
      const patientResults = allResults.filter(r => r.patientId === patient.id);
      // Get most recent record with notes
      const recordsWithNotes = patientResults
        .filter(r => r.parameter_notes && r.parameter_notes.trim() !== '')
        .sort((a, b) => {
          const dateA = new Date(a.inputData?.processedAt || a.processedAt || a.createdAt || 0);
          const dateB = new Date(b.inputData?.processedAt || b.processedAt || b.createdAt || 0);
          return dateB - dateA; // Most recent first
        });

      if (recordsWithNotes.length > 0) {
        const savedNotes = recordsWithNotes[0].parameter_notes;
        setParameterNotes(savedNotes);
      } else {
        setParameterNotes('');
      }
    } catch (error) {
      console.warn('⚠️ Could not load saved notes:', error.message);
      setParameterNotes('');
    }
  };

  const handleBackToList = () => {
    setShowProcessingUI(false);
    setSelectedPatient(null);
    setEyesOpenFile(null);
    setEyesClosedFile(null);
    setResults(null);
    setProcessingComplete(false);
    setConsoleLog([]);
    setProcessingHistory([]);
    setIsSaved(false);
    setIsSaving(false);
    setReportSent(false);
    setClaudeReportSent(false);
    setParameterNotes(''); // Reset notes when going back
    // Reload patients to update status
    loadPatients();
  };

  // Helper function to get patient name (handles different field names)
  const getPatientName = (patient) => {
    return patient?.fullName || patient?.full_name || patient?.name || patient?.email || 'Unknown Patient';
  };

  // Helper function to get status badge
  const getStatusBadge = (status, lastProcessed) => {
    if (status === 'completed') {
      return (
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </span>
          {lastProcessed && (
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(lastProcessed).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
            </span>
          )}
        </div>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        <Activity className="h-3 w-3 mr-1" />
        Pending
      </span>
    );
  };

  // Filter patients based on search and filters
  const filteredPatients = patients.filter(patient => {
    const matchesSearch = searchTerm === '' ||
      getPatientName(patient).toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesClinic = selectedClinicFilter === '' || patient.clinicId === selectedClinicFilter;

    const matchesDate = dateFilter === '' ||
      (patient.lastProcessed && new Date(patient.lastProcessed).toISOString().split('T')[0] === dateFilter);

    return matchesSearch && matchesClinic && matchesDate;
  });

  // Group filtered patients by clinic
  const groupedPatients = clinics.map(clinic => ({
    clinic,
    patients: filteredPatients.filter(p => p.clinicId === clinic.id)
  })).filter(group => group.patients.length > 0);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedClinicFilter('');
    setDateFilter('');
  };

  const handleFileUpload = (type, event) => {
    const file = event.target.files[0];
    if (file) {
      if (type === 'eo') {
        setEyesOpenFile(file);
      } else {
        setEyesClosedFile(file);
      }
      // Reset processing state when new files are uploaded
      setProcessingComplete(false);
      setResults(null);
      setConsoleLog([]);
      setProgress(0);
      setIsSaved(false);
      setIsSaving(false);
      setPdfUrl(null);
      setReportSent(false);
      setClaudeReportSent(false);
    }
  };

  // Upload document, replace logo, and download
  const handleOtherDocumentUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setProcessedDocBlob(null);
    setProcessedDocName('');
    try {
      toast.loading('Replacing logo...', { id: 'doc-process' });
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const formData = new FormData();
      formData.append('document', file);

      const token = await getFreshToken();
      const fetchOptions = {
        method: 'POST',
        body: formData
      };

      if (token) {
        fetchOptions.headers = {
          'Authorization': `Bearer ${token}`
        };
      }

      const response = await fetch(`${apiUrl}/qeeg/replace-logo-download`, fetchOptions);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Processing failed');
      }

      const blob = await response.blob();
      setProcessedDocBlob(blob);
      setProcessedDocName(file.name.replace('.pdf', '_NeuroSense.pdf'));

      toast.success('Logo replaced! Click Download to save.', { id: 'doc-process' });
    } catch (error) {
      console.error('Error processing document:', error);
      toast.error(getFriendlyErrorMessage(error, 'Document processing failed. Please try again.'), { id: 'doc-process' });
    } finally {
      setIsUploadingDoc(false);
      event.target.value = '';
    }
  };

  const handleDownloadProcessedDoc = () => {
    if (!processedDocBlob) return;
    const downloadUrl = window.URL.createObjectURL(processedDocBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = processedDocName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
    toast.success('Document downloaded!');
  };

  const processQEEGFiles = async () => {
    setIsProcessing(true);
    setConsoleLog([]);
    setProgress(0);
    const startTime = performance.now();
    setProcessingStartTime(startTime);
    setProcessingDuration(null);

    try {
      // Console log: Starting process
      setConsoleLog(prev => [...prev, '🚀 Starting QEEG analysis...']);
      setProgress(10);

      // Create FormData to send files
      const formData = new FormData();
      formData.append('eyesOpen', eyesOpenFile);
      formData.append('eyesClosed', eyesClosedFile);
      formData.append('patientId', selectedPatient.id);
      formData.append('patientExternalId', selectedPatient.external_id || '');
      formData.append('patientName', getPatientName(selectedPatient));
      formData.append('clinicName', selectedPatient.clinicName);
      // Add complete patient data for PDF
      formData.append('dateOfBirth', selectedPatient.dateOfBirth || selectedPatient.date_of_birth || 'Not specified');
      formData.append('age', selectedPatient.age || calculateAge(selectedPatient.dateOfBirth || selectedPatient.date_of_birth) || 'N/A');
      formData.append('gender', selectedPatient.gender || 'Not specified');
      formData.append('handedness', selectedPatient.handedness || 'Right');
      formData.append('occupation', selectedPatient.occupation || selectedPatient.profession || '');
      // Add parameter notes for PDF generation
      formData.append('parameterNotes', parameterNotes || '');

      setConsoleLog(prev => [...prev, '📤 Uploading files to server...']);
      if (parameterNotes) {
        setConsoleLog(prev => [...prev, `📝 Including notes: "${parameterNotes.substring(0, 30)}..."`]);
      }
      setProgress(20);

      // Validate file sizes before upload (50MB limit)
      const maxFileSize = 50 * 1024 * 1024; // 50MB
      if (eyesOpenFile.size > maxFileSize || eyesClosedFile.size > maxFileSize) {
        const oversizedFile = eyesOpenFile.size > maxFileSize ? eyesOpenFile : eyesClosedFile;
        const fileSizeMB = (oversizedFile.size / (1024 * 1024)).toFixed(2);
        throw new Error(`File "${oversizedFile.name}" is too large (${fileSizeMB}MB). Maximum file size is 50MB. Please compress or split the file.`);
      }

      // Call backend API with timeout.
      // IMPORTANT: Use VITE_DIRECT_BACKEND_URL for this long-running call to bypass the
      // Vercel proxy (Hobby plan has a 30s hard timeout on rewrites to external URLs).
      // VITE_DIRECT_BACKEND_URL = https://limitlessbrainlab-backend.onrender.com  (set on Vercel)
      const proxyApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const directBackendUrl = import.meta.env.VITE_DIRECT_BACKEND_URL;
      const apiUrl = directBackendUrl ? `${directBackendUrl}/api` : proxyApiUrl;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

      let response;
      try {
        // Get auth token from localStorage
        const token = await getFreshToken();

        const fetchOptions = {
          method: 'POST',
          body: formData,
          signal: controller.signal
        };

        // Add authorization header if token exists
        if (token) {
          fetchOptions.headers = {
            'Authorization': `Bearer ${token}`
          };
        }

        response = await fetch(`${apiUrl}/qeeg/process`, fetchOptions);
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timed out after 5 minutes. Please check: 1) File size (<50MB), 2) Backend is running (npm run dev:backend), 3) Internet connection is stable. Try compressing PDF files if too large.');
        }
        // Check if it's a network error (backend not running)
        if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('fetch')) {
          throw new Error('Cannot connect to backend server. Please ensure the backend is running on port 5000. Run "npm run dev:backend" to start the server.');
        }
        throw fetchError;
      }

      setConsoleLog(prev => [...prev, '📊 Parsing QEEG data tables...']);
      setProgress(40);

      if (!response.ok) {
        let errorMessage = 'Failed to process QEEG files';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;

          // Add specific error messages based on error code
          if (errorData.code === 'LIMIT_FILE_SIZE') {
            errorMessage = 'File size exceeds the maximum limit of 50MB. Please compress your files or split them into smaller parts.';
          } else if (errorData.code === 'GEMINI_QUOTA_EXCEEDED' || response.status === 429) {
            // Extract retry time if available in error message
            let retryTime = null;
            const retryMatch = errorData.message?.match(/retry in ([\d.]+)s/i);
            if (retryMatch) {
              retryTime = Math.ceil(parseFloat(retryMatch[1]));
            }

            errorMessage = '⚠️ API Quota Exceeded\n\n' +
                         'The Gemini AI service has reached its daily limit (20 requests/day).\n\n' +
                         '✅ Quick Solutions:\n' +
                         (retryTime ? `• Wait ${retryTime} seconds and try again (quota will reset)\n` : '• Wait a few minutes and try again\n') +
                         '• Re-upload the SAME files you processed before (uses cache, no quota needed)\n' +
                         '• Contact administrator to upgrade API plan\n\n' +
                         '💡 Tip: The system remembers files you\'ve already processed!';
          } else if (response.status === 503) {
            errorMessage = 'Backend service is unavailable. Please ensure the server is running.';
          } else if (response.status === 413) {
            errorMessage = 'File payload is too large. Maximum allowed size is 50MB.';
          } else if (response.status === 500) {
            // Parse detailed error from server for 500 errors
            if (errorData.message && (errorData.message.includes('Gemini') || errorData.message.includes('quota') || errorData.message.includes('429'))) {
              // Extract retry time from detailed error
              let retryTime = null;
              const retryMatch = errorData.message.match(/retry in ([\d.]+)s/i);
              if (retryMatch) {
                retryTime = Math.ceil(parseFloat(retryMatch[1]));
              }

              // Check if it's specifically a quota error
              if (errorData.message.includes('quota') || errorData.message.includes('429')) {
                errorMessage = '⚠️ API Quota Exceeded\n\n' +
                             'Google Gemini API has reached its free tier limit.\n\n' +
                             '✅ What to do:\n' +
                             (retryTime ? `1. Wait ${retryTime} seconds and try again\n` : '1. Wait a few minutes and try again\n') +
                             '2. Or re-upload the SAME files (cached, no quota used)\n' +
                             '3. Or contact admin to upgrade API plan\n\n' +
                             '📊 Free tier: 20 requests per day\n' +
                             '💰 Upgrade: https://ai.google.dev/pricing';
              } else if (errorData.message && (
                errorData.message.includes('PDF text extraction') ||
                errorData.message.includes('Missing power tables') ||
                errorData.code === 'PDF_EXTRACTION_FAILED'
              )) {
                // PDF extraction specific error
                errorMessage = '⚠️ PDF Extraction Error\n\n' +
                             errorData.message + '\n\n' +
                             '💡 Troubleshooting:\n' +
                             '1. Verify PDFs contain QEEG frequency band tables\n' +
                             '2. Ensure PDFs are not password-protected\n' +
                             '3. Check if PDFs are scanned images (need OCR)\n' +
                             '4. Try exporting PDFs in a different format\n' +
                             '5. Contact support if issue persists';
              } else {
                errorMessage = '⚠️ Gemini AI Service Error\n\n' +
                             'There was an issue with the AI service.\n\n' +
                             'Please try again in a moment or contact support if the issue persists.';
              }
            }
          }
        } catch (e) {
          // If error response is not JSON, use status text
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Capture data type (raw or zscore)
      if (data.data.dataType) {
        setDataType(data.data.dataType);
        if (data.data.dataType === 'zscore') {
          setConsoleLog(prev => [...prev, '🔬 Z-Score mode detected']);
        }
      }

      // Auto-set PDF URL if returned from backend
      if (data.data.pdfUrl) {
        setPdfUrl(data.data.pdfUrl);
        setConsoleLog(prev => [...prev, '📄 PDF report generated automatically']);
      }

      // Capture modified QEEG input file URLs (with NeuroSense logo)
      if (data.data.eyesOpenUrl) {
        setEyesOpenUrl(data.data.eyesOpenUrl);
      }
      if (data.data.eyesClosedUrl) {
        setEyesClosedUrl(data.data.eyesClosedUrl);
      }

      setConsoleLog(prev => [...prev, '🧮 Calculating 7 brain health parameters...']);
      setProgress(60);

      // Simulate calculation steps for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      setConsoleLog(prev => [...prev, '  ✓ Cognition parameter calculated']);
      setProgress(65);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Stress parameter calculated']);
      setProgress(70);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Focus & Attention parameter calculated']);
      setProgress(75);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Burnout & Fatigue parameter calculated']);
      setProgress(80);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Emotional Regulation parameter calculated']);
      setProgress(85);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Learning parameter calculated']);
      setProgress(90);

      await new Promise(resolve => setTimeout(resolve, 400));
      setConsoleLog(prev => [...prev, '  ✓ Creativity parameter calculated']);
      setProgress(95);

      // Convert API results to display format with NaN/Infinity protection
      const finalResults = data.data.results.map(param => {
        // Sanitize score values to prevent NaN/Infinity
        const sanitizedScore = Number.isFinite(param.score) ? param.score : 0;
        const sanitizedMaxScore = Number.isFinite(param.maxScore) && param.maxScore > 0 ? param.maxScore : 3;
        const percentage = Math.round((sanitizedScore / sanitizedMaxScore) * 100);

        // Sanitize metrics
        const sanitizedMetrics = (param.metrics || []).map(metric => ({
          ...metric,
          score: Number.isFinite(metric.score) ? metric.score : 0,
          // Preserve object values (e.g. Alpha:Theta Balance has {fz, cz, pz}) and string values
          // Mark non-finite numbers as 'Indeterminate'
          value: metric.value === null ? 'Indeterminate'
            : (typeof metric.value === 'object' && metric.value !== null) ? metric.value
            : (typeof metric.value === 'string') ? metric.value
            : Number.isFinite(metric.value) ? metric.value : 'Indeterminate'
        }));

        // Special color logic for Stress and Burnout parameters
        // For these parameters: Low = good (green), Medium/High = bad (red)
        // For other parameters: High = good (green), Medium = blue, Low = orange
        const isStressOrBurnout = param.name === 'Stress' || param.name === 'Burnout & Fatigue';

        let color;
        if (isStressOrBurnout) {
          // For Stress/Burnout: score = count of RED sub-params
          // Low (0 red) = green, Mild (1 red) = orange, Moderate/Severe = red
          color = param.classification === 'Low' ? 'green' :
                  param.classification === 'Mild' ? 'orange' : 'red';
        } else {
          // For other parameters: High = green, Medium = blue, Low = orange
          color = param.classification === 'High' ? 'green' :
                  param.classification === 'Medium' ? 'blue' : 'orange';
        }

        return {
          parameter: param.name,
          score: Number.isFinite(percentage) ? percentage : 0,
          rawScore: `${sanitizedScore}/${sanitizedMaxScore}`,
          status: param.classification,
          color: color,
          metrics: sanitizedMetrics
        };
      });

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      setProcessingDuration(durationMs);

      const mins = Math.floor(durationMs / 60000);
      const secs = Math.floor((durationMs % 60000) / 1000);
      const ms = Math.floor(durationMs % 1000);
      const timeStr = `${mins}m ${secs}s ${ms}ms`;

      setConsoleLog(prev => [...prev, '✅ Analysis complete!']);
      setConsoleLog(prev => [...prev, `📈 Overall Score: ${data.data.overallScore}/${data.data.maxScore}`]);
      setConsoleLog(prev => [...prev, `⏱️ Generated in: ${timeStr}`]);
      setProgress(100);

      setResults(finalResults);
      setIsProcessing(false);
      setProcessingComplete(true);
      setIsSaved(false); // Mark as not saved yet

      toast.success(`QEEG analysis completed in ${timeStr}!`);

    } catch (error) {
      console.error('Error processing QEEG files:', error);
      setConsoleLog(prev => [...prev, `❌ Error: ${error.message}`]);
      setIsProcessing(false);
      toast.error(getFriendlyErrorMessage(error, 'Failed to process the QEEG files. Please try again.'));
    }
  };

  const saveResultsToDatabase = async (resultData) => {
    if (!resultData) {
      toast.error('No results to save');
      return;
    }

    try {
      setIsSaving(true);
      toast.loading('Saving results to database...', { id: 'save-results' });


      // PDF should already exist from auto-generation
      if (!pdfUrl) {
        console.warn('⚠️ No PDF URL available - PDF may not have been generated');
      }

      const algorithmResult = {
        // Don't specify ID - let database auto-generate UUID
        patientId: selectedPatient.id,
        patientEmail: selectedPatient.email || '',  // Store email for patient dashboard matching
        patientName: getPatientName(selectedPatient),  // Top-level for direct DB save
        clinicId: selectedPatient.clinicId,
        clinicName: selectedPatient.clinicName,  // Top-level for direct DB save
        algorithmName: 'Algorithm 1 - 7 Parameters',
        inputData: {
          patientName: getPatientName(selectedPatient),
          clinicName: selectedPatient.clinicName,
          eyesOpenFile: eyesOpenFile?.name,
          eyesClosedFile: eyesClosedFile?.name,
          eyesOpenUrl: eyesOpenUrl || null,  // Modified Eyes Open PDF URL
          eyesClosedUrl: eyesClosedUrl || null,  // Modified Eyes Closed PDF URL
          processedAt: new Date().toISOString(),
          processedBy: 'super_admin',
          processingDurationMs: processingDuration || null
        },
        results: resultData,  // Primary field for DB schema compatibility
        outputData: resultData,  // Keep for backward compatibility
        eyesOpenFile: eyesOpenFile?.name,
        eyesClosedFile: eyesClosedFile?.name,
        pdfUrl: pdfUrl || null,
        processedAt: new Date().toISOString(),
        processedBy: 'super_admin',
        parameter_notes: parameterNotes || '', // Notes from textarea (snake_case for Supabase)
        report_mode: reportMode, // 'neurosense' (default) or 'claude' — controls dashboard visibility
        status: 'completed',
        errorMessage: null
      };


      const addedRecord = await DatabaseService.add('algorithmResults', algorithmResult);

      setIsSaved(true);
      setIsSaving(false);
      // Don't reset notes - keep them for PDF generation
      // setParameterNotes('');

      toast.success('✅ Results saved successfully!', { id: 'save-results' });

      // Reload history and patient list to update status
      loadProcessingHistory(selectedPatient.id);
      loadPatients();

      return addedRecord;
    } catch (error) {
      console.error('❌ Error saving results:', error);
      setIsSaving(false);
      toast.error(getFriendlyErrorMessage(error, 'Failed to save the results. Please try again.'), { id: 'save-results' });
    }
  };

  const handleSaveResults = async () => {
    if (results) {
      try {

        // Step 1: Check if existing PDF URL available (no generation!)
        let finalPdfUrl = pdfUrl;

        if (!finalPdfUrl) {
          const existingPdf = await findExistingPDF();

          if (existingPdf) {
            finalPdfUrl = existingPdf;
            setPdfUrl(existingPdf);
          } else {
          }
        }

        // Step 2: Save results to database (with or without PDF URL)
        const saved = await saveResultsToDatabase(results);
        if (saved && saved.id) setSavedResultId(saved.id);

        // Step 3: Show success message
        if (finalPdfUrl) {
          toast.success('✅ Results saved! PDF is available for download.');
        } else {
          toast.success('✅ Results saved! Generate PDF from history to get report.');
        }


      } catch (error) {
        console.error('❌ Error saving results:', error);
        toast.error(getFriendlyErrorMessage(error, 'Failed to save the results. Please try again.'));
      }
    }
  };

  // New function: Generate and download PDF separately
  const handleGenerateAndDownloadPDF = async () => {
    if (!results) {
      toast.error('No results to generate PDF from');
      return;
    }

    try {
      toast.loading('Generating Limitless Brain Lab PDF Report...', { id: 'generate-pdf' });

      const pdfResult = await generatePDFReport(results);

      if (pdfResult && pdfResult.url) {
        setPdfUrl(pdfResult.url);
        toast.success('PDF Report generated!', { id: 'generate-pdf' });

        // Auto-download the newly generated PDF
        setTimeout(() => {
          handleDownloadPDF();
        }, 500);
      } else {
        console.error('⚠️ PDF generation returned no URL');
        toast.error('Failed to generate PDF', { id: 'generate-pdf' });
      }
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to generate the PDF. Please try again.'), { id: 'generate-pdf' });
    }
  };

  // Function to regenerate PDF from saved record with parameter_notes
  const regeneratePDFFromRecord = async (record) => {
    try {

      // Get saved results from the record
      const savedResults = parseResultsData(record.outputData || record.results);
      if (!savedResults || savedResults.length === 0) {
        throw new Error('No results found in this record');
      }

      // Get saved notes from the record
      const savedNotes = record.parameter_notes || '';

      // Prepare patient data with clinic info for folder organization
      const patientData = {
        name: record.inputData?.patientName || getPatientName(selectedPatient),
        dateOfRecording: record.inputData?.processedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        dateOfBirth: selectedPatient?.dateOfBirth || selectedPatient?.date_of_birth || 'Not specified',
        age: selectedPatient?.age || 'N/A',
        gender: selectedPatient?.gender || 'Not specified',
        handedness: selectedPatient?.handedness || 'Right',
        patientId: record.patientId,
        clinicName: record.inputData?.clinicName || selectedPatient?.clinicName || 'Unknown-Clinic',
        clinicId: selectedPatient?.clinicId || record.inputData?.clinicId || null,
      };

      // Prepare algorithm results
      const algorithmResults = {
        parameters: savedResults.map(result => {
          const scoreParts = (result.rawScore || '0/3').split('/');
          const score = parseInt(scoreParts[0]) || 0;
          const maxScore = parseInt(scoreParts[1]) || 3;

          return {
            name: result.parameter || 'Unknown Parameter',
            score: isNaN(score) ? 0 : score,
            maxScore: isNaN(maxScore) ? 3 : maxScore,
            classification: result.status || 'Unknown',
            metrics: (result.metrics || []).map(m => ({
              name: m.name || 'Unknown',
              score: m.score || 0,
              value: m.value || 0,
              threshold: m.threshold || 'Not provided'
            }))
          };
        }),
        overallScore: savedResults.reduce((sum, r) => {
          const scoreParts = (r.rawScore || '0/3').split('/');
          return sum + (parseInt(scoreParts[0]) || 0);
        }, 0)
      };

      // Prepare QEEG data (use sample data)
      const qeegData = {
        EC: { absolute: { Fz: { Delta: 5.2, Theta: 4.1, Alpha: 8.3, Beta: 6.2, HiBeta: 3.1 } }, relative: { Pz: { Alpha: 45.2 } }, special: { alphaPeak: 10.3 } },
        EO: { absolute: { Fz: { Theta: 3.8, Beta: 3.2, HiBeta: 2.5 } }, relative: { Pz: { Alpha: 28.7 } } }
      };

      // Call backend API to generate PDF with saved notes
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = await getFreshToken();

      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiUrl}/qeeg/generate-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientData,
          algorithmResults,
          qeegData,
          parameterNotes: savedNotes // Use saved notes from database
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.data?.url) {
        throw new Error('Failed to generate PDF');
      }

      if (data.data.uploadError) {
        console.warn('⚠️ Supabase upload error:', data.data.uploadError);
      }
      return data.data.url;

    } catch (error) {
      console.error('❌ Error regenerating PDF:', error);
      throw error;
    }
  };

  // Helper function to find existing PDF for this patient
  const findExistingPDF = async () => {
    try {
      if (!selectedPatient || !selectedPatient.id) return null;

      // Get patient's processing history
      const allResults = await DatabaseService.get('algorithmResults');
      const patientResults = allResults.filter(r => r.patientId === selectedPatient.id);


      // Find most recent record with a PDF
      const recordsWithPdf = patientResults
        .filter(r => r.pdfUrl && r.pdfUrl !== 'null' && r.pdfUrl !== '')
        .sort((a, b) => {
          const dateA = new Date(a.inputData?.processedAt || a.processedAt || a.createdAt || 0);
          const dateB = new Date(b.inputData?.processedAt || b.processedAt || b.createdAt || 0);
          return dateB - dateA; // Most recent first
        });

      if (recordsWithPdf.length > 0) {
        const latestPdf = recordsWithPdf[0].pdfUrl;
        return latestPdf;
      }

      return null;
    } catch (error) {
      console.error('Error finding existing PDF:', error);
      return null;
    }
  };

  const handleExecuteCalculation = () => {
    // Notes are optional - no validation required

    if (eyesOpenFile && eyesClosedFile) {
      processQEEGFiles();
    } else {
      toast.error('Please upload both QEEG data files');
    }
  };

  // Claude Report: forward the already-generated NeuroSense PDF (at pdfUrl) to the
  // server, which reads its numbers and regenerates the polished 12-page
  // doctor-readable "Brain Type & Performance Report". Auth is a static long-lived
  // token (VITE_CLAUDE_REPORT_TOKEN); the backend uses its own master key for the VPS.
  // Ordered stages shown in the progress panel. `upload` is the browser->server
  // fetch (before the first SSE event); the rest are streamed by the backend.
  const CLAUDE_STAGE_ORDER = [
    { key: 'upload', label: 'Uploading to Claude…', pct: 5 },
    { key: 'reading', label: 'Reading the document…', pct: 10 },
    { key: 'extract', label: 'Claude is reading your numbers…', pct: 25 },
    { key: 'build', label: 'Building your report…', pct: 55 },
    { key: 'narrative', label: 'Claude is writing your report…', pct: 60 },
    { key: 'render', label: 'Rendering the 12-page PDF…', pct: 88 },
    { key: 'saving', label: 'Saving your report…', pct: 95 },
  ];

  const stopClaudeCreep = () => {
    if (claudeCreepRef.current) { clearInterval(claudeCreepRef.current); claudeCreepRef.current = null; }
  };

  // Nudge the bar slowly toward `target` while a long stage is in flight, so it
  // never looks frozen during the 30-60s Claude calls.
  const startClaudeCreep = (target) => {
    stopClaudeCreep();
    claudeCreepRef.current = setInterval(() => {
      setClaudeProgress((p) => (p < target - 1 ? Math.min(p + 0.5, target - 1) : p));
    }, 800);
  };

  // Mark the active stage done (recording its elapsed time) and flip `nextKey` active.
  const advanceClaudeStage = (nextKey, stageStartRef) => {
    const now = performance.now();
    setClaudeStages((prev) => prev.map((s) => {
      if (s.status === 'active') return { ...s, status: 'done', elapsedMs: now - (stageStartRef.current || now) };
      if (s.key === nextKey) return { ...s, status: 'active' };
      return s;
    }));
    stageStartRef.current = now;
  };

  const handleUploadToClaude = async () => {
    if (isGeneratingClaudeReport) return;
    if (!pdfUrl) { toast.error('Generate & save the NeuroSense report first.'); return; }

    // Pre-flight: check sidecar is alive before starting the long upload
    const preflightApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    setConsoleLog(prev => [...prev, '🔍 Checking sidecar health...']);
    try {
      const hRes = await fetch(`${preflightApiUrl}/qeeg/claude-report/health`);
      const hData = await hRes.json();
      if (!hRes.ok || !hData.ok) throw new Error(hData.error || 'Sidecar offline');
      setConsoleLog(prev => [...prev,
        `✅ Sidecar online | busy: ${hData.busy} | uptime: ${Math.round((hData.uptimeSec || 0) / 3600 * 10) / 10}h`
      ]);
      console.log('[Sidecar Pre-flight] ✅ online', hData);
    } catch (preflightErr) {
      setConsoleLog(prev => [...prev, `❌ Sidecar offline: ${preflightErr.message}`]);
      toast.error(getFriendlyErrorMessage(preflightErr, 'The report service is unavailable right now, so the report cannot be generated. Please try again in a few minutes.'), { id: 'claude-report' });
      setClaudeReportError(getFriendlyErrorMessage(preflightErr, 'The report service is unavailable right now. Please try again in a few minutes.'));
      return;
    }

    console.log('[Claude Report] ▶ Starting upload & compilation process…');
    const t0 = performance.now();
    const stageStartRef = { current: performance.now() };
    setIsGeneratingClaudeReport(true);
    setClaudeReportUrl(null);
    setClaudeReportError(null);
    setClaudeProgress(5);
    setClaudeStages(CLAUDE_STAGE_ORDER.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending', elapsedMs: null })));
    startClaudeCreep(10);
    toast.loading('Building your 12-page Neurosense Performance Report (≈3–6 min, please keep this tab open)…', { id: 'claude-report' });
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const token = import.meta.env.VITE_CLAUDE_REPORT_TOKEN;
      console.log('[Claude Report] Step 1: fetching the generated NeuroSense PDF…', pdfUrl);
      // Fetch the just-generated NeuroSense PDF and forward it to the Claude endpoint.
      const srcRes = await fetch(pdfUrl);
      if (!srcRes.ok) throw new Error('Could not load the generated NeuroSense PDF.');
      const blob = await srcRes.blob();
      console.log(`[Claude Report] Step 2: NeuroSense PDF loaded (${(blob.size / 1024).toFixed(1)} KB), building upload payload…`);
      const formData = new FormData();
      formData.append('pdf', new File([blob], 'neurosense-report.pdf', { type: 'application/pdf' }));
      console.log(`[Claude Report] Step 3: POST ${apiUrl}/qeeg/claude-report (streaming progress)…`);
      // Cap the request at 20 min. The full pipeline (extract → narrative → render)
      // legitimately takes several minutes on the shared single-flight gateway, so a
      // tight cap aborted the SSE stream mid-render (~94%). 20 min only bites a true
      // hang, not a normal slow run. NOTE: the timer is cleared at the end of the
      // stream loop below (not here), so it stays armed for the whole generation.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000);
      let response;
      try {
        response = await fetch(`${apiUrl}/qeeg/claude-report`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
          signal: controller.signal,
        });
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          if (sidecarAbortReasonRef.current === 'SIDECAR_DOWN') {
            throw new Error('Sidecar went offline during report generation. Please try again when the VPS is back up.');
          }
          throw new Error('Timed out after 20 min. The report did not finish — the gateway may be stuck or overloaded. Please try again.');
        }
        throw fetchError;
      }

      // Early errors (auth 401, no-file 400) come back as plain JSON, not a stream.
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Server error (${response.status})`);
      }

      // Start 2-minute sidecar health monitor — logs to console panel and aborts fast if VPS goes down.
      sidecarAbortReasonRef.current = null;
      const sidecarPollUrl = `${apiUrl}/qeeg/claude-report/health`;
      const sidecarMonitor = setInterval(async () => {
        try {
          const hRes = await fetch(sidecarPollUrl);
          const hData = await hRes.json();
          if (!hRes.ok || !hData.ok) throw new Error(hData.error || 'offline');
          const uptimeH = Math.round((hData.uptimeSec || 0) / 3600 * 10) / 10;
          console.log(`[Sidecar Monitor] ✅ alive | busy:${hData.busy} | uptime:${uptimeH}h`);
          setConsoleLog(prev => [...prev, `💓 Sidecar alive | busy: ${hData.busy} | uptime: ${uptimeH}h`]);
        } catch (err) {
          console.error('[Sidecar Monitor] ❌ sidecar went offline:', err.message);
          setConsoleLog(prev => [...prev, `❌ Sidecar went offline: ${err.message} — aborting`]);
          sidecarAbortReasonRef.current = 'SIDECAR_DOWN';
          controller.abort();
          clearInterval(sidecarMonitor);
        }
      }, 2 * 60 * 1000);

      // Read the SSE stream: parse `event:`/`data:` frames as they arrive.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let pdfUrlResult = null;
      let streamError = null;
      let gotDone = false;

      const pctFor = (key) => (CLAUDE_STAGE_ORDER.find((s) => s.key === key)?.pct ?? 0);
      const nextPctAfter = (key) => {
        const idx = CLAUDE_STAGE_ORDER.findIndex((s) => s.key === key);
        return CLAUDE_STAGE_ORDER[idx + 1]?.pct ?? 100;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (!frame.trim() || frame.startsWith(':')) continue; // heartbeat/comment

          let event = 'message';
          let dataStr = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          let payload = {};
          try { payload = dataStr ? JSON.parse(dataStr) : {}; } catch (_) { /* ignore */ }

          if (event === 'progress') {
            console.log(`[Claude Report] stage: ${payload.stage} (${payload.pct}%)`);
            advanceClaudeStage(payload.stage, stageStartRef);
            setClaudeProgress(payload.pct || pctFor(payload.stage));
            startClaudeCreep(nextPctAfter(payload.stage));
          } else if (event === 'done') {
            gotDone = true;
            pdfUrlResult = payload.pdfUrl;
          } else if (event === 'error') {
            streamError = payload.message || 'Report generation failed.';
          }
        }
      }
      clearTimeout(timeoutId);
      clearInterval(sidecarMonitor);
      stopClaudeCreep();

      if (streamError) throw new Error(streamError);
      if (!gotDone || !pdfUrlResult) throw new Error('The report stream ended before a report was produced.');

      console.log('[Claude Report] report compiled. Public URL:', pdfUrlResult);
      setClaudeProgress(100);
      setClaudeStages((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'done', elapsedMs: performance.now() - (stageStartRef.current || performance.now()) } : s)));
      setClaudeReportUrl(pdfUrlResult);
      try {
        if (savedResultId) {
          console.log('[Claude Report] Attaching claude_report_url to history row:', savedResultId);
          await DatabaseService.update('algorithmResults', savedResultId, { claude_report_url: pdfUrlResult });
        }
      } catch (e) { console.warn('Could not attach claude_report_url to history row:', e); }
      console.log(`[Claude Report] ✓ Done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      toast.success('Neurosense Performance Report ready!', { id: 'claude-report' });
    } catch (error) {
      console.error(`[Claude Report] ✗ Failed after ${((performance.now() - t0) / 1000).toFixed(1)}s:`, error);
      stopClaudeCreep();
      setClaudeReportError(getFriendlyErrorMessage(error, 'The report could not be generated. Please try again.'));
      toast.error(getFriendlyErrorMessage(error, 'The Neurosense Performance Report could not be generated. Please try again.'), { id: 'claude-report' });
    } finally {
      stopClaudeCreep();
      setIsGeneratingClaudeReport(false);
    }
  };

  // Send Report to Clinic and Patient - they can access it from their dashboards
  const handleSendReport = async () => {
    if (!pdfUrl) {
      toast.error('Please generate PDF report first');
      return;
    }

    if (!selectedPatient) {
      toast.error('No patient selected');
      return;
    }

    setIsSendingReport(true);

    try {
      const patientName = getPatientName(selectedPatient);
      const clinicId = selectedPatient.clinicId || selectedPatient.clinic_id || selectedPatient.org_id;


      // Determine file path and full URL based on the format
      let filePath = '';
      let fullUrl = pdfUrl;
      let fileName = 'neurosense-report.pdf';

      // Handle different URL formats:
      // 1. Supabase URL: https://xxx.supabase.co/storage/v1/object/public/bucket/path/file.pdf
      // 2. Local URL: /uploads/filename.pdf
      // 3. Full local URL: http://localhost:5000/uploads/filename.pdf

      if (pdfUrl.includes('/storage/v1/object/public/')) {
        // Supabase public URL
        // URL format: .../storage/v1/object/public/neurosense-reports/reports/clinic/file.pdf
        // We need only the path AFTER the bucket name: reports/clinic/file.pdf
        const parts = pdfUrl.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          let storagePath = parts[1]; // e.g., "neurosense-reports/reports/filename.pdf"
          // Remove bucket name prefix if present
          if (storagePath.startsWith('neurosense-reports/')) {
            filePath = storagePath.substring('neurosense-reports/'.length); // e.g., "reports/filename.pdf"
          } else {
            filePath = storagePath;
          }
        }
        fullUrl = pdfUrl;
      } else if (pdfUrl.includes('/storage/v1/object/')) {
        // Supabase signed URL
        const parts = pdfUrl.split('/storage/v1/object/');
        if (parts.length > 1) {
          let storagePath = parts[1].split('?')[0]; // Remove query params
          // Remove bucket name prefix if present
          if (storagePath.startsWith('neurosense-reports/')) {
            filePath = storagePath.substring('neurosense-reports/'.length);
          } else {
            filePath = storagePath;
          }
        }
        fullUrl = pdfUrl;
      } else if (pdfUrl.startsWith('/uploads/') || pdfUrl.includes('/uploads/')) {
        // Local URL - need to construct full URL for download
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const backendBaseUrl = apiUrl.replace('/api', '');

        // Extract just the /uploads/... part
        const uploadsIndex = pdfUrl.indexOf('/uploads/');
        const localPath = uploadsIndex >= 0 ? pdfUrl.substring(uploadsIndex) : pdfUrl;

        filePath = localPath; // e.g., "/uploads/neurosense-report-xxx.pdf"
        fullUrl = `${backendBaseUrl}${localPath}`; // e.g., "http://localhost:5000/uploads/..."
      } else {
        // Unknown format - use as-is
        filePath = pdfUrl;
        fullUrl = pdfUrl;
      }

      // Extract filename from path
      const pathParts = (filePath || pdfUrl).split('/');
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          fileName = lastPart.split('?')[0]; // Remove any query params
        }
      }


      // Create report entry matching the format used by Response Report upload
      // This format is compatible with PatientDashboard download functionality
      const reportData = {
        clinicId: clinicId,
        patientId: selectedPatient.id,
        fileName: fileName,
        filePath: filePath, // Storage path for signed URL
        reportData: {
          title: `Limitless Brain Lab QEEG Report - ${patientName}`,
          reportType: 'Response Report', // Mark as Response Report so it shows in patient dashboard
          description: `Algorithm processing results for ${patientName}`,
          fileUrl: fullUrl, // Full URL for direct download
          filePath: filePath, // Also store in reportData for redundancy
          patientName: patientName,
          processedAt: new Date().toISOString(),
          dataType: dataType || 'zscore',
          parameterNotes: parameterNotes || '',
          isResponseReport: true, // Important: This flag makes it visible in patient dashboard
          uploadedBy: 'Super Admin',
          uploadStatus: 'completed',
          storedInCloud: pdfUrl.includes('supabase') // Only true for Supabase URLs
        },
        status: 'completed'
      };


      const savedReport = await DatabaseService.addReport(reportData);

      // Send report emails to clinic and patient
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');

        const clinicId = selectedPatient.clinicId || selectedPatient.clinic_id || selectedPatient.org_id;
        const clinicData = await DatabaseService.findById('clinics', clinicId);
        const clinicEmail = clinicData?.email || 'limitlessbrainlab@gmail.com'; // fallback: admin inbox, never a dead address
        const clinicName = clinicData?.name || 'Clinic';

        const token = await getFreshToken();
        const emailHeaders = { 'Content-Type': 'application/json' };
        if (token) {
          emailHeaders['Authorization'] = `Bearer ${token}`;
        }

        await fetch(`${baseUrl}/api/send-report-email`, {
          method: 'POST',
          headers: emailHeaders,
          body: JSON.stringify({
            patientName: patientName,
            patientEmail: selectedPatient.email,
            clinicName: clinicName,
            clinicEmail: clinicEmail,
            reportUrl: fullUrl,
            reportFileName: fileName,
            reportType: 'neurosense'
          })
        }).catch(emailError => {
          console.error('Failed to send report emails:', emailError);
        });
      } catch (emailError) {
        console.error('Error preparing report emails:', emailError);
      }

      toast.success(
        `Report sent successfully!\n\n✓ Emails sent to clinic and patient\n✓ Accessible in clinic Reports section`,
        { duration: 5000 }
      );
      setReportSent(true);

    } catch (error) {
      console.error('❌ Error sending report:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to send the report. Please try again.'));
    } finally {
      setIsSendingReport(false);
    }
  };

  // Send the Claude-generated report to Clinic and Patient — mirrors handleSendReport
  // but sources the URL from claudeReportUrl and marks the report as a Claude Report.
  const handleSendClaudeReport = async () => {
    if (!claudeReportUrl) {
      toast.error('Please generate the Neurosense Performance Report first');
      return;
    }

    if (!selectedPatient) {
      toast.error('No patient selected');
      return;
    }

    setIsSendingClaudeReport(true);

    try {
      const patientName = getPatientName(selectedPatient);
      const clinicId = selectedPatient.clinicId || selectedPatient.clinic_id || selectedPatient.org_id;


      // Determine file path and full URL based on the format
      let filePath = '';
      let fullUrl = claudeReportUrl;
      let fileName = 'claude-report.pdf';

      if (claudeReportUrl.includes('/storage/v1/object/public/')) {
        // Supabase public URL
        const parts = claudeReportUrl.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          let storagePath = parts[1];
          if (storagePath.startsWith('neurosense-reports/')) {
            filePath = storagePath.substring('neurosense-reports/'.length);
          } else {
            filePath = storagePath;
          }
        }
        fullUrl = claudeReportUrl;
      } else if (claudeReportUrl.includes('/storage/v1/object/')) {
        // Supabase signed URL
        const parts = claudeReportUrl.split('/storage/v1/object/');
        if (parts.length > 1) {
          let storagePath = parts[1].split('?')[0];
          if (storagePath.startsWith('neurosense-reports/')) {
            filePath = storagePath.substring('neurosense-reports/'.length);
          } else {
            filePath = storagePath;
          }
        }
        fullUrl = claudeReportUrl;
      } else if (claudeReportUrl.startsWith('/uploads/') || claudeReportUrl.includes('/uploads/')) {
        // Local URL - need to construct full URL for download
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const backendBaseUrl = apiUrl.replace('/api', '');
        const uploadsIndex = claudeReportUrl.indexOf('/uploads/');
        const localPath = uploadsIndex >= 0 ? claudeReportUrl.substring(uploadsIndex) : claudeReportUrl;
        filePath = localPath;
        fullUrl = `${backendBaseUrl}${localPath}`;
      } else {
        filePath = claudeReportUrl;
        fullUrl = claudeReportUrl;
      }

      // Extract filename from path
      const pathParts = (filePath || claudeReportUrl).split('/');
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          fileName = lastPart.split('?')[0];
        }
      }

      const reportData = {
        clinicId: clinicId,
        patientId: selectedPatient.id,
        fileName: fileName,
        filePath: filePath,
        reportType: 'Claude Report',
        reportData: {
          title: `Neurosense Performance Report - ${patientName}`,
          reportType: 'Claude Report',
          description: `Neurosense Performance Report for ${patientName}`,
          fileUrl: fullUrl,
          filePath: filePath,
          patientName: patientName,
          processedAt: new Date().toISOString(),
          dataType: dataType || 'zscore',
          parameterNotes: parameterNotes || '',
          isResponseReport: true,
          uploadedBy: 'Super Admin',
          uploadStatus: 'completed',
          storedInCloud: claudeReportUrl.includes('supabase')
        },
        status: 'completed'
      };


      const savedReport = await DatabaseService.addReport(reportData);

      // Send report emails to clinic and patient
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');

        const clinicId = selectedPatient.clinicId || selectedPatient.clinic_id || selectedPatient.org_id;
        const clinicData = await DatabaseService.findById('clinics', clinicId);
        const clinicEmail = clinicData?.email || 'limitlessbrainlab@gmail.com'; // fallback: admin inbox, never a dead address
        const clinicName = clinicData?.name || 'Clinic';

        const token = await getFreshToken();
        const emailHeaders = { 'Content-Type': 'application/json' };
        if (token) {
          emailHeaders['Authorization'] = `Bearer ${token}`;
        }

        await fetch(`${baseUrl}/api/send-report-email`, {
          method: 'POST',
          headers: emailHeaders,
          body: JSON.stringify({
            patientName: patientName,
            patientEmail: selectedPatient.email,
            clinicName: clinicName,
            clinicEmail: clinicEmail,
            reportUrl: fullUrl,
            reportFileName: fileName,
            reportType: 'claude'
          })
        }).catch(emailError => {
          console.error('Failed to send Claude report emails:', emailError);
        });
      } catch (emailError) {
        console.error('Error preparing Claude report emails:', emailError);
      }

      toast.success('Neurosense Performance Report sent to patient & clinic + email.', { duration: 5000 });
      setClaudeReportSent(true);

    } catch (error) {
      console.error('❌ Error sending Claude report:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to send the Neurosense Performance Report. Please try again.'));
    } finally {
      setIsSendingClaudeReport(false);
    }
  };

  // Send the Claude report for a specific Processing-History record — mirrors
  // handleSendClaudeReport but sources URL + patient/clinic from the record.
  const sendClaudeReportForRecord = async (record) => {
    const url = record.claude_report_url || record.claudeReportUrl;
    if (!url) { toast.error('No Neurosense Performance Report on this record'); return; }

    try {
      const patientName = record.inputData?.patientName || record.patientName || getPatientName(selectedPatient);
      const clinicId = record.clinicId || record.inputData?.clinicId || selectedPatient?.clinicId || selectedPatient?.clinic_id;
      const patientEmail = record.patientEmail || record.inputData?.patientEmail || selectedPatient?.email;

      const clinicData = clinicId ? await DatabaseService.findById('clinics', clinicId) : null;
      const clinicEmail = clinicData?.email || 'limitlessbrainlab@gmail.com'; // fallback: admin inbox, never a dead address
      const clinicName = clinicData?.name || 'Clinic';

      const reportData = {
        clinicId: clinicId,
        patientId: record.patientId || selectedPatient?.id,
        fileName: 'claude-brain-report.pdf',
        filePath: url,
        reportType: 'Claude Report',
        reportData: {
          title: `Neurosense Performance Report - ${patientName}`,
          reportType: 'Claude Report',
          description: `Neurosense Performance Report for ${patientName}`,
          fileUrl: url,
          filePath: url,
          patientName: patientName,
          processedAt: new Date().toISOString(),
          isResponseReport: true,
          uploadedBy: 'Super Admin',
          uploadStatus: 'completed',
          storedInCloud: url.includes('supabase')
        },
        status: 'completed'
      };

      await DatabaseService.addReport(reportData);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      const token = await getFreshToken();
      const emailHeaders = { 'Content-Type': 'application/json' };
      if (token) {
        emailHeaders['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/send-report-email`, {
        method: 'POST',
        headers: emailHeaders,
        body: JSON.stringify({
          patientName: patientName,
          patientEmail: patientEmail,
          clinicName: clinicName,
          clinicEmail: clinicEmail,
          reportUrl: url,
          reportFileName: 'claude-brain-report.pdf',
          reportType: 'claude'
        })
      });
      if (!response.ok) throw new Error(`Server error (${response.status})`);

      toast.success('Neurosense Performance Report sent to patient & clinic.');
    } catch (error) {
      console.error('❌ Error sending Claude report for record:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to send the Neurosense Performance Report. Please try again.'));
    }
  };

  const generatePDFReport = async (resultData) => {
    if (!resultData || !selectedPatient) {
      console.error('❌ Cannot generate PDF: Missing resultData or selectedPatient');
      toast.error('Cannot generate PDF: Missing data');
      return null;
    }

    try {

      // Prepare patient data - FIXED: Use current date for recording, not DOB
      const patientData = {
        name: getPatientName(selectedPatient),
        dateOfRecording: new Date().toISOString().split('T')[0], // TODAY'S DATE, not DOB!
        dateOfBirth: selectedPatient.dateOfBirth || selectedPatient.date_of_birth || 'Not specified',
        age: selectedPatient.age || calculateAge(selectedPatient.dateOfBirth || selectedPatient.date_of_birth) || 'N/A',
        gender: selectedPatient.gender || 'Not specified',
        handedness: selectedPatient.handedness || 'Right', // Default to Right if not specified
        patientId: selectedPatient.id,
        occupation: selectedPatient.occupation || 'Not specified',
        symptoms: selectedPatient.symptoms || []
      };


      // Prepare algorithm results with STRONG validation to avoid NaN errors
      const algorithmResults = {
        parameters: resultData.map(result => {
          const scoreParts = (result.rawScore || '0/3').split('/');
          const score = parseInt(scoreParts[0]) || 0;
          const maxScore = parseInt(scoreParts[1]) || 3;

          // Clean metrics to remove any NaN values, but preserve 'Indeterminate' markers
          const cleanMetrics = (result.metrics || []).map(metric => ({
            name: metric.name || 'Unknown',
            score: isNaN(metric.score) ? 0 : (parseInt(metric.score) || 0),
            value: metric.value === 'Indeterminate' || metric.value === null
              ? 'Indeterminate'
              : typeof metric.value === 'number' && !isFinite(metric.value)
              ? 'Indeterminate'
              : typeof metric.value === 'object' && metric.value !== null
              ? metric.value
              : isNaN(metric.value) ? 'Indeterminate' : (parseFloat(metric.value) || 0),
            threshold: metric.threshold || 'Not provided',
            description: metric.description || '',
            details: metric.details || null
          }));

          return {
            name: result.parameter || 'Unknown Parameter',
            score: isNaN(score) ? 0 : score,
            maxScore: isNaN(maxScore) ? 3 : maxScore,
            classification: result.status || 'Unknown',
            metrics: cleanMetrics
          };
        }),
        overallScore: resultData.reduce((sum, r) => {
          const scoreParts = (r.rawScore || '0/3').split('/');
          const score = parseInt(scoreParts[0]) || 0;
          return sum + (isNaN(score) ? 0 : score);
        }, 0)
      };


      // EXTRA SAFETY: Double-check for any NaN in the data
      const dataString = JSON.stringify(algorithmResults);
      if (dataString.includes('NaN')) {
        console.error('⚠️ WARNING: Found NaN in algorithm results!');
        console.error('Raw data:', algorithmResults);
        throw new Error('Data contains NaN values. Please check the calculation results.');
      }


      // Prepare QEEG data (use sample data if not available)
      const qeegData = {
        EC: {
          absolute: { Fz: { Delta: 5.2, Theta: 4.1, Alpha: 8.3, Beta: 6.2, HiBeta: 3.1 } },
          relative: { Pz: { Alpha: 45.2 } },
          special: { alphaPeak: 10.3, O1: 10.1 }
        },
        EO: {
          absolute: { Fz: { Theta: 3.8, Beta: 3.2, HiBeta: 2.5 } },
          relative: { Pz: { Alpha: 28.7 } }
        }
      };

      // Call backend API to generate PDF
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const pdfEndpoint = `${apiUrl}/qeeg/generate-pdf`;


      // Fetch saved notes from database if current state is empty
      let notesToUse = parameterNotes || '';
      if (!notesToUse && selectedPatient?.id) {
        try {
          const allResults = await DatabaseService.get('algorithmResults');
          const patientResults = allResults.filter(r => r.patientId === selectedPatient.id);
          // Get most recent record with notes
          const recordsWithNotes = patientResults
            .filter(r => r.parameter_notes && r.parameter_notes.trim() !== '')
            .sort((a, b) => {
              const dateA = new Date(a.inputData?.processedAt || a.processedAt || a.createdAt || 0);
              const dateB = new Date(b.inputData?.processedAt || b.processedAt || b.createdAt || 0);
              return dateB - dateA; // Most recent first
            });

          if (recordsWithNotes.length > 0) {
            notesToUse = recordsWithNotes[0].parameter_notes;
          } else {
          }
        } catch (dbError) {
          console.warn('⚠️ Could not fetch notes from database:', dbError.message);
        }
      }

      // Add timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout (increased for Gemini AI)

      const token = await getFreshToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(pdfEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          patientData,
          algorithmResults,
          qeegData,
          parameterNotes: notesToUse // Send notes to PDF generator (from state or database)
        }),
        signal: controller.signal
      }).catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('PDF generation timed out after 60 seconds. Please check: 1) Backend is running, 2) Gemini API key is configured, 3) Internet connection is stable.');
        }
        if (error.message.includes('Failed to fetch')) {
          throw new Error('Cannot connect to backend server. Please ensure backend is running on port 5000 (run: npm run dev:backend)');
        }
        throw error;
      });

      clearTimeout(timeoutId);


      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error('❌ Backend error data:', errorData);
        } catch (e) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
          console.error('❌ Backend error text:', errorText);
        }
        throw new Error(`Failed to generate PDF: ${errorMessage}`);
      }

      const data = await response.json();

      if (!data || !data.success || !data.data) {
        console.error('❌ Invalid response format:', data);
        throw new Error('Invalid response from server');
      }

      // Use the complete URL from backend instead of constructing it
      const pdfResult = {
        url: data.data.url, // Backend already provides complete URL
        path: data.data.path,
        filename: data.data.filename
      };


      return pdfResult;

    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);

      if (error.message && error.stack) {
        console.error('❌ Error stack:', error.stack);
      }

      // Provide specific error messages based on error type
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.error('❌ NETWORK ERROR: Cannot connect to backend server');
        console.error('❌ Please ensure backend server is running on http://localhost:5000');
        toast.error('We are unable to reach the server right now. Please try again in a moment.');
      } else if (error.name === 'AbortError') {
        console.error('❌ TIMEOUT ERROR: PDF generation took too long');
        toast.error('PDF generation timed out. Server might be overloaded.');
      } else {
        console.error('❌ PDF GENERATION ERROR:', error.message);
        toast.error(getFriendlyErrorMessage(error, 'PDF generation failed. Please try again.'));
      }

      return null;
    }
  };

  // Download a PDF by fetching its bytes and saving a blob, so the raw storage
  // URL is never opened in a browser tab or shared with the user.
  const downloadPdfFromUrl = async (url, filename) => {
    if (!url) { toast.error('Report not available yet.'); return; }
    try {
      toast.loading('Downloading PDF…', { id: 'download-pdf' });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
      toast.success('PDF download started!', { id: 'download-pdf' });
    } catch (e) {
      console.error('downloadPdfFromUrl failed:', e);
      toast.error('Could not download the PDF. Please try again.', { id: 'download-pdf' });
    }
  };

  const handleDownloadPDF = async () => {
    if (!pdfUrl) {
      toast.error('PDF not available. Please save results first.');
      return;
    }

    try {
      toast.loading('Downloading PDF...', { id: 'download-pdf' });

      // Construct full backend URL
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const backendBaseUrl = apiUrl.replace('/api', ''); // Remove /api to get base URL

      // Handle both Supabase URLs and local URLs
      let fullPdfUrl;
      if (pdfUrl.startsWith('http')) {
        // It's already a full URL (Supabase)
        fullPdfUrl = pdfUrl;
      } else {
        // It's a local path, construct full URL
        fullPdfUrl = `${backendBaseUrl}${pdfUrl}`;
      }

      console.log('🔽 Download Info:', {
        originalPdfUrl: pdfUrl,
        backendBaseUrl,
        fullPdfUrl,
        isSupabase: pdfUrl.startsWith('http')
      });

      // For local files, try direct window.open first (simpler approach)
      if (!pdfUrl.startsWith('http')) {

        // Create a hidden link and click it
        const link = document.createElement('a');
        link.href = fullPdfUrl;
        link.download = pdfUrl.split('/').pop() || 'neurosense-report.pdf';
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('PDF download started!', { id: 'download-pdf' });
        return;
      }

      // For Supabase URLs, use fetch method

      const response = await fetch(fullPdfUrl);

      if (!response.ok) {
        console.error('❌ Download failed:', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      // Convert to blob
      const blob = await response.blob();

      // Verify blob is valid
      if (!blob || blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }


      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = pdfUrl.split('/').pop() || 'neurosense-report.pdf';

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 100);

      toast.success('PDF downloaded successfully!', { id: 'download-pdf' });

    } catch (error) {
      console.error('❌ Download error:', {
        error: error.message,
        pdfUrl,
        stack: error.stack
      });

      // Provide more helpful error messages
      let errorMessage = 'Failed to download PDF';
      if (error.message.includes('404')) {
        errorMessage = 'PDF file not found on server';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection.';
      } else {
        errorMessage = getFriendlyErrorMessage(error, 'Failed to download the PDF. Please try again.');
      }

      toast.error(errorMessage, { id: 'download-pdf' });
    }
  };

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return 'N/A';
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Helper function to get color based on score
  // 1/3 = Red, 2/3 = Yellow, 3/3 = Green
  const getScoreColor = (rawScore, parameterName = '') => {
    if (!rawScore) return 'gray';

    const [score, maxScore] = rawScore.split('/').map(Number);
    const isStressOrBurnout = parameterName === 'Stress' || parameterName === 'Burnout & Fatigue';

    if (isStressOrBurnout) {
      // For Stress/Burnout: score = count of RED sub-params
      // 0/3 = green (Low/no red), 1/3 = yellow (Mild), 2/3+ = red (Moderate/Severe)
      if (score === 0) return 'green';   // 0/3 red = Low = Green (best)
      if (score === 1) return 'yellow';  // 1/3 red = Mild = Yellow
      return 'red';                      // 2/3 or 3/3 red = Moderate/Severe = Red
    }

    // For other parameters: normal scoring
    if (score === 1) return 'red';      // 1/3
    if (score === 2) return 'yellow';   // 2/3
    if (score === 3) return 'green';    // 3/3

    return 'gray';
  };

  const getStatusColor = (rawScore, parameterName = '') => {
    const color = getScoreColor(rawScore, parameterName);
    switch (color) {
      case 'red': return 'text-red-500';
      case 'yellow': return 'text-yellow-500';
      case 'green': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBgColor = (rawScore, parameterName = '') => {
    const color = getScoreColor(rawScore, parameterName);
    if (color === 'green') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    if (color === 'yellow') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    if (color === 'red') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const getProgressBarColor = (rawScore, parameterName = '') => {
    const color = getScoreColor(rawScore, parameterName);
    switch (color) {
      case 'red': return 'bg-red-500';
      case 'yellow': return 'bg-yellow-500';
      case 'green': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading patients...</p>
        </div>
      </div>
    );
  }

  // Patient List View
  if (!showProcessingUI) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-navy-700 rounded-lg p-6 text-white shadow-lg">
          <h1 className="text-2xl font-bold">Limitless Brain Lab - Algorithm Data Processor</h1>
          <p className="text-primary-light mt-2">Select a patient to generate Algorithm 1 report</p>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Patient Search */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search Patient
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Clinic Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Filter by Clinic
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <select
                  value={selectedClinicFilter}
                  onChange={(e) => setSelectedClinicFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                >
                  <option value="">All Clinics</option>
                  {clinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Filter by Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            {(searchTerm || selectedClinicFilter || dateFilter) && (
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {/* Active Filters Display */}
          {(searchTerm || selectedClinicFilter || dateFilter) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {searchTerm && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  Search: "{searchTerm}"
                </span>
              )}
              {selectedClinicFilter && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  Clinic: {clinics.find(c => c.id === selectedClinicFilter)?.name}
                </span>
              )}
              {dateFilter && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Date: {new Date(dateFilter).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
                ({filteredPatients.length} {filteredPatients.length === 1 ? 'patient' : 'patients'} found)
              </span>
            </div>
          )}
        </div>

        {/* Patient List - Clinic-wise */}
        <div className="space-y-4">
          {groupedPatients.length > 0 ? (
            groupedPatients.map(({ clinic, patients: clinicPatients }) => (
            <div key={clinic.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              {/* Clinic Header */}
              <div className="bg-accent-light dark:bg-primary/20 border-b border-primary-light dark:border-primary px-6 py-3">
                <div className="flex items-center">
                  <Building2 className="h-5 w-5 text-primary mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {clinic.name}
                  </h3>
                  <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
                    ({clinicPatients.length} {clinicPatients.length === 1 ? 'patient' : 'patients'})
                  </span>
                </div>
              </div>

              {/* Patient Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Patient Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Previous Scans
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Report Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {clinicPatients.map(patient => (
                      <tr key={patient.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') ? 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-l-[#F5D05D]' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <User className={`h-4 w-4 mr-2 ${(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`} />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {getPatientName(patient)}
                              {(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F5D05D] text-gray-900">LBL</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {patient.email || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            {patient.lastProcessed
                              ? new Date(patient.lastProcessed).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                              : 'No scans'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(patient.algorithmStatus, patient.lastProcessed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleGenerateReport(patient)}
                            className="bg-primary hover:bg-navy-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md flex items-center ml-auto"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            {patient.algorithmStatus === 'completed' ? 'View/Generate' : 'Generate Report'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            ))
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <Filter className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                {searchTerm || selectedClinicFilter || dateFilter
                  ? 'No patients match your filters'
                  : 'No patients found'
                }
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                {searchTerm || selectedClinicFilter || dateFilter
                  ? 'Try adjusting your search criteria or clear filters'
                  : 'Patients will appear here once they are registered in the system'
                }
              </p>
              {(searchTerm || selectedClinicFilter || dateFilter) && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 bg-primary hover:bg-navy-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Processing UI View
  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="bg-gradient-to-r from-primary to-navy-700 rounded-lg p-6 text-white shadow-lg">
        <button
          onClick={handleBackToList}
          className="flex items-center text-primary-light hover:text-white mb-3 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Patient List
        </button>
        <h1 className="text-2xl font-bold">Limitless Brain Lab - Algorithm Data Processor</h1>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-primary-light">
            Processing for: <span className="font-semibold">{getPatientName(selectedPatient)}</span> | {selectedPatient?.clinicName}
          </p>
          {dataType === 'zscore' && (
            <span className="inline-flex items-center px-3 py-1 bg-purple-500/20 text-purple-200 text-xs font-medium rounded-full border border-purple-400/30">
              🔬 Z-Score Mode
            </span>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - QEEG Data Input */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            QEEG Data Input
          </h2>

          {/* Report Mode selector — controls whether the NeuroSense report is shared
              with patient & clinic, or kept private while a Claude report is sent instead. */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Report Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary dark:hover:border-primary-light transition-colors">
                <input
                  type="radio"
                  name="reportMode"
                  value="neurosense"
                  checked={reportMode === 'neurosense'}
                  onChange={() => setReportMode('neurosense')}
                  className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">NeuroSense Report</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Neurosense report is shared with Patient &amp; Clinic.</span>
                </span>
              </label>
              <label className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-primary dark:hover:border-primary-light transition-colors">
                <input
                  type="radio"
                  name="reportMode"
                  value="claude"
                  checked={reportMode === 'claude'}
                  onChange={() => setReportMode('claude')}
                  className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Neurosense Performance Report</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Only the Neurosense Performance Report is sent to the patient and the clinic. The SA can view both the Neurosense and Neurosense Performance reports.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              <span className="font-semibold">ℹ️ Note:</span> Data will be extracted from <strong>pages 13 & 24</strong> of both PDF files
            </p>
          </div>

          {/* Eyes Open Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              EO - Eyes Open PDF <span className="text-xs text-gray-500">(Pages 13 & 24)</span>
            </label>
            <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary dark:hover:border-primary-light transition-colors">
              <input
                type="file"
                accept=".csv,.txt,.dat,.pdf"
                onChange={(e) => handleFileUpload('eo', e)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p
                className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-full px-2"
                title={eyesOpenFile ? eyesOpenFile.name : ''}
              >
                {eyesOpenFile ? eyesOpenFile.name : 'Drag & Drop or Click to Upload'}
              </p>
              {eyesOpenFile && (
                <CheckCircle className="h-6 w-6 text-green-500 mx-auto mt-2" />
              )}
            </div>
          </div>

          {/* Eyes Closed Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              EC - Eyes Closed PDF <span className="text-xs text-gray-500">(Pages 13 & 24)</span>
            </label>
            <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary dark:hover:border-primary-light transition-colors">
              <input
                type="file"
                accept=".csv,.txt,.dat,.pdf"
                onChange={(e) => handleFileUpload('ec', e)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p
                className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-full px-2"
                title={eyesClosedFile ? eyesClosedFile.name : ''}
              >
                {eyesClosedFile ? eyesClosedFile.name : 'Drag & Drop or Click to Upload'}
              </p>
              {eyesClosedFile && (
                <CheckCircle className="h-6 w-6 text-green-500 mx-auto mt-2" />
              )}
            </div>
          </div>

          {/* Data Loaded Progress */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data Loaded
            </label>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${eyesOpenFile && eyesClosedFile ? 100 : eyesOpenFile || eyesClosedFile ? 50 : 0}%` }}
              ></div>
            </div>
          </div>

          {/* Upload Other Documents - Replace Logo & Download */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
              <FileText className="h-4 w-4 mr-2 text-primary" />
              Upload Other Documents
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Upload a PDF — logo will be replaced with NeuroSense branding.
            </p>
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                onChange={handleOtherDocumentUpload}
                disabled={isUploadingDoc}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isUploadingDoc
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:hover:border-primary-light'
              }`}>
                {isUploadingDoc ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    <span className="text-sm text-primary font-medium">Replacing logo...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Click or Drag PDF to Upload</p>
                  </>
                )}
              </div>
            </div>

            {/* Download Button - shows after processing */}
            {processedDocBlob && (
              <div className="mt-3 flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center min-w-0 mr-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mr-2" />
                  <p className="text-xs text-green-800 dark:text-green-300 truncate" title={processedDocName}>
                    {processedDocName}
                  </p>
                </div>
                <button
                  onClick={handleDownloadProcessedDoc}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Middle Panel - Algorithm Processing */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Algorithm 1 Processing
          </h2>

          {/* Notes Input Card - Before Execute Button */}
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <label className="block text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              Note:
            </label>
            <textarea
              placeholder="Enter notes (optional)..."
              rows={3}
              value={parameterNotes}
              onChange={(e) => setParameterNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[60px] border-blue-300 dark:border-blue-600"
            />
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecuteCalculation}
            disabled={!eyesOpenFile || !eyesClosedFile || isProcessing || isSaved}
            className={`w-full mb-6 py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
              eyesOpenFile && eyesClosedFile && !isProcessing && !isSaved
                ? 'bg-primary hover:bg-navy-700 text-white'
                : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            <Play className="h-5 w-5" />
            <span>Execute Calculation</span>
          </button>

          {/* Processing Animation - Progress Bar */}
          {isProcessing && (
            <div className="bg-gradient-to-r from-primary to-navy-700 rounded-lg p-6 mb-6 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-medium">Processing...</p>
                <p className="text-primary-light text-sm">{Math.min(Math.round((consoleLog.length / 15) * 100), 99)}%</p>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-white/20 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-green-400 h-4 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min((consoleLog.length / 15) * 100, 99)}%` }}
                ></div>
              </div>
              <p className="text-primary-light text-xs mt-2 text-center">{consoleLog.length} actions completed</p>
            </div>
          )}

          {/* Processing Complete */}
          {processingComplete && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center mb-6">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="text-green-800 dark:text-green-400 font-medium">Processing Complete!</p>
            </div>
          )}

          {/* Console */}
          <div className="bg-gray-900 dark:bg-black rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
              <h3 className="text-sm font-medium text-gray-300">Console</h3>
              <button
                onClick={() => setConsoleLog([])}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1 font-mono text-xs">
              {consoleLog.length > 0 ? (
                consoleLog.map((log, index) => (
                  <div key={index} className="text-green-400">
                    &gt; {log}
                  </div>
                ))
              ) : (
                <div className="text-gray-500 italic">Console output will appear here...</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Panel - Final 7 Parameter Scores */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Final 7 Parameter Scores
            </h2>
            {results && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Total: {results.reduce((sum, r) => sum + parseInt(r.rawScore.split('/')[0]), 0)}/21
              </span>
            )}
          </div>

          {/* Download Buttons for Modified QEEG PDFs */}
          {(eyesOpenUrl || eyesClosedUrl) && (
            <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-xs text-gray-600 dark:text-gray-400 w-full mb-1">Download Modified QEEG Reports:</span>
              {eyesOpenUrl && (
                <button
                  onClick={async () => {
                    try {
                      toast.loading('Downloading Eyes Open PDF...', { id: 'eo-main-download' });
                      const downloadFromUrl = eyesOpenUrl;
                      if (!downloadFromUrl) throw new Error('No Eyes Open PDF available');
                      const response = await fetch(downloadFromUrl);
                      if (!response.ok) throw new Error('Failed to fetch PDF');
                      const blob = await response.blob();
                      const downloadUrl = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = downloadUrl;
                      link.download = `EyesOpen-${selectedPatient?.firstName || 'patient'}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(downloadUrl);
                      toast.success('Eyes Open PDF downloaded!', { id: 'eo-main-download' });
                    } catch (error) {
                      console.error('Download error:', error);
                      toast.error('Failed to download Eyes Open PDF', { id: 'eo-main-download' });
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center space-x-1"
                  title="Download modified Eyes Open PDF with Limitless Brain Lab logo"
                >
                  <Download className="h-3 w-3" />
                  <span>Eyes Open PDF</span>
                </button>
              )}
              {eyesClosedUrl && (
                <button
                  onClick={async () => {
                    try {
                      toast.loading('Downloading Eyes Closed PDF...', { id: 'ec-main-download' });
                      let downloadFromUrl = eyesClosedUrl;
                      if (!downloadFromUrl) throw new Error('No Eyes Closed PDF available');

                      // Construct full URL if relative path is returned
                      if (downloadFromUrl.startsWith('/')) {
                        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                        const baseUrl = apiUrl.replace(/\/api\/?$/, '');
                        downloadFromUrl = baseUrl + downloadFromUrl;
                      }

                      const response = await fetch(downloadFromUrl);
                      if (!response.ok) throw new Error('Failed to fetch PDF');
                      const blob = await response.blob();
                      const downloadUrl = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = downloadUrl;
                      link.download = `EyesClosed-${selectedPatient?.firstName || 'patient'}.pdf`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(downloadUrl);
                      toast.success('Eyes Closed PDF downloaded!', { id: 'ec-main-download' });
                    } catch (error) {
                      console.error('Download error:', error);
                      toast.error('Failed to download Eyes Closed PDF', { id: 'ec-main-download' });
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center space-x-1"
                  title="Download modified Eyes Closed PDF with Limitless Brain Lab logo"
                >
                  <Download className="h-3 w-3" />
                  <span>Eyes Closed PDF</span>
                </button>
              )}
            </div>
          )}

          {results ? (
            <>
              <div className="space-y-4 mb-6">
                {results.map((result, index) => {
                  // Determine background color for main parameter card (Stress and Burnout & Fatigue)
                  const isStressOrBurnout = result.parameter === 'Stress' || result.parameter === 'Burnout & Fatigue';
                  let mainCardBgClass = 'border border-gray-200 dark:border-gray-700';

                  if (isStressOrBurnout && result.rawScore) {
                    const [score] = result.rawScore.split('/').map(Number);
                    // For Stress & Burnout: score = count of RED sub-params
                    // 0/3 = Low (no red) = GREEN (best)
                    // 1/3 = Mild = YELLOW
                    // 2/3 or 3/3 = Moderate/Severe = RED (bad)
                    if (score === 0) {
                      mainCardBgClass = 'border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/10';
                    } else if (score === 1) {
                      mainCardBgClass = 'border-2 border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/10';
                    } else {
                      // 2/3 or 3/3 red = Moderate/Severe = RED
                      mainCardBgClass = 'border-2 border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/10';
                    }
                  }

                  return (
                    <div key={index} className={`rounded-lg p-3 ${mainCardBgClass}`}>
                      {/* Main Parameter */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {result.parameter}
                        </span>
                        <div className="flex items-center space-x-3">
                          <span className={`text-base font-bold ${getStatusColor(result.rawScore, result.parameter)}`}>
                            {result.rawScore}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusBgColor(result.rawScore, result.parameter)}`}>
                            {result.status}
                          </span>
                        </div>
                      </div>

                    {/* Progress Bar */}
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
                      <div
                        className={`h-2 rounded-full ${getProgressBarColor(result.rawScore, result.parameter)}`}
                        style={{ width: `${result.score}%` }}
                      ></div>
                    </div>

                    {/* Sub-Parameters with Calculations */}
                    {result.metrics && result.metrics.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          Sub-Parameters & Calculations:
                        </div>
                        <div className="space-y-3">
                          {result.metrics.map((metric, mIndex) => {
                            // Determine if metric is normal (green) or abnormal (red) for Stress and Burnout & Fatigue
                            const isNormal = metric.score === 1;
                            const shouldColorize = result.parameter === 'Stress' || result.parameter === 'Burnout & Fatigue';
                            const bgColorClass = shouldColorize
                              ? (isNormal
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                                  : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700')
                              : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700';

                            return (
                              <div key={mIndex} className={`rounded-lg p-3 border-2 ${bgColorClass} transition-all duration-200`}>
                                {/* Metric Name and Score */}
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-xs font-semibold ${
                                    shouldColorize
                                      ? (isNormal ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300')
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}>
                                    {metric.name}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    {metric.score === 1 ? (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <X className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className={`font-bold text-sm ${metric.score === 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {metric.score}/1
                                    </span>
                                  </div>
                                </div>

                              {/* Calculation Details */}
                              <div className="space-y-1">
                                {/* Actual Value */}
                                {(metric.value !== undefined) && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">Value:</span>
                                    <span className={`font-mono ${metric.value === 'Indeterminate' || metric.value === null || (typeof metric.value === 'number' && !isFinite(metric.value)) ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {metric.value === 'Indeterminate' || (typeof metric.value === 'number' && !isFinite(metric.value))
                                        ? 'Indeterminate'
                                        : metric.value === null
                                        ? (metric.score === 0 ? 'Indeterminate' : '—')
                                        : typeof metric.value === 'object' && metric.value !== null
                                        ? Object.entries(metric.value).map(([key, val]) =>
                                            `${key}: ${typeof val === 'number' && isFinite(val) ? val.toFixed(2) : (val === 'Indeterminate' ? 'Indeterminate' : val)}`
                                          ).join(', ')
                                        : typeof metric.value === 'number' && isFinite(metric.value)
                                        ? metric.value.toFixed(2)
                                        : String(metric.value)}
                                    </span>
                                  </div>
                                )}

                                {/* Description/Formula */}
                                {metric.description && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 italic mt-1">
                                    {metric.description}
                                  </div>
                                )}

                                {/* Additional Details */}
                                {metric.details && (
                                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 pl-2 border-l-2 border-gray-300 dark:border-gray-600">
                                    {typeof metric.details === 'object'
                                      ? Object.entries(metric.details).map(([key, val], idx) => (
                                          <div key={idx} className="flex justify-between">
                                            <span>{key}:</span>
                                            <span className="font-mono">{val === 'Indeterminate' ? 'Indeterminate' : typeof val === 'number' && isFinite(val) ? Number(val).toFixed(2) : val}</span>
                                          </div>
                                        ))
                                      : metric.details}
                                  </div>
                                )}
                              </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {/* Save Results Button (No PDF Generation) */}
                <button
                  onClick={handleSaveResults}
                  disabled={isSaving || isSaved}
                  className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
                    isSaved
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-not-allowed'
                      : isSaving
                      ? 'bg-blue-400 text-white cursor-wait'
                      : 'bg-primary hover:bg-navy-700 text-white'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <Activity className="h-5 w-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isSaved ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      <span>Saved ✓</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      <span>Save Results</span>
                    </>
                  )}
                </button>

                {/* Generate/Download PDF Button (Separate) */}
                <button
                  onClick={pdfUrl ? handleDownloadPDF : handleGenerateAndDownloadPDF}
                  disabled={!results || !isSaved}
                  className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
                    !results || !isSaved
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : pdfUrl
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title={!isSaved ? 'Please save results first' : pdfUrl ? 'Download PDF report' : 'Generate and download PDF report'}
                >
                  <Download className="h-5 w-5" />
                  <span>{pdfUrl ? 'Neurosense Report' : 'Generate PDF Report'}</span>
                </button>

                {/* Post-generation action buttons — mode-aware. NeuroSense mode sends
                    the NeuroSense report; Claude mode uploads it to Claude, then sends
                    the generated 12-page Claude report. */}
                {reportMode !== 'claude' ? (
                <button
                  onClick={handleSendReport}
                  disabled={!pdfUrl || isSendingReport || reportSent}
                  className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
                    reportSent
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : !pdfUrl
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : isSendingReport
                      ? 'bg-purple-400 text-white cursor-wait'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                  title={reportSent ? 'Report already sent' : !pdfUrl ? 'Generate PDF report first' : 'Send report to clinic and patient'}
                >
                  <Send className="h-5 w-5" />
                  <span>{reportSent ? '✓ Sent' : isSendingReport ? 'Sending...' : 'Send Report to Clinic & Patient'}</span>
                </button>
                ) : (
                <>
                  {/* Upload the generated NeuroSense report to Claude → 12-page report */}
                  <button
                    onClick={handleUploadToClaude}
                    disabled={isGeneratingClaudeReport || !pdfUrl || !isSaved}
                    className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
                      isGeneratingClaudeReport || !pdfUrl || !isSaved
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                    title={!isSaved ? 'Save results first' : !pdfUrl ? 'Generate the NeuroSense report first' : 'Build the 12-page Neurosense Performance Report'}
                  >
                    {isGeneratingClaudeReport ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Generating…</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        <span>Build Neurosense Performance Report</span>
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Builds the 12-page Neurosense Performance Report from the generated Neurosense report.
                  </p>

                  {/* Live, stage-by-stage progress (fed by the backend SSE stream) */}
                  {isGeneratingClaudeReport && (
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-lg p-4 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white font-medium text-sm">Building your 12-page report…</p>
                        <p className="text-indigo-200 text-sm font-mono">{Math.round(claudeProgress)}%</p>
                      </div>
                      <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-green-400 h-3 rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${Math.min(claudeProgress, 100)}%` }}
                        />
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {claudeStages.map((s) => (
                          <div key={s.key} className="flex items-center text-xs">
                            {s.status === 'done' ? (
                              <CheckCircle className="h-4 w-4 text-green-400 mr-2 flex-shrink-0" />
                            ) : s.status === 'active' ? (
                              <Loader2 className="h-4 w-4 text-white animate-spin mr-2 flex-shrink-0" />
                            ) : (
                              <span className="h-4 w-4 mr-2 flex-shrink-0 rounded-full border border-white/30" />
                            )}
                            <span className={s.status === 'pending' ? 'text-indigo-200/60' : 'text-white'}>
                              {s.label}
                            </span>
                            {s.status === 'done' && s.elapsedMs != null && (
                              <span className="ml-auto text-indigo-200/70 font-mono">{(s.elapsedMs / 1000).toFixed(1)}s</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {claudeReportError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                      {claudeReportError}
                    </div>
                  )}

                  {claudeReportUrl && (
                    <>
                      <button
                        onClick={() => downloadPdfFromUrl(claudeReportUrl, `Claude-Brain-Report-${getPatientName(selectedPatient).replace(/[^a-z0-9]/gi, '-')}.pdf`)}
                        className="w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md bg-green-600 hover:bg-green-700 text-white"
                        title="Download the generated Claude report"
                      >
                        <Download className="h-5 w-5" />
                        <span>Download Neurosense Performance Report</span>
                      </button>
                      <button
                        onClick={handleSendClaudeReport}
                        disabled={isSendingClaudeReport || claudeReportSent}
                        className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors shadow-md ${
                          claudeReportSent
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : isSendingClaudeReport
                            ? 'bg-purple-400 text-white cursor-wait'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}
                        title={claudeReportSent ? 'Report already sent' : 'Send Claude report to clinic and patient'}
                      >
                        <Send className="h-5 w-5" />
                        <span>{claudeReportSent ? '✓ Sent' : isSendingClaudeReport ? 'Sending…' : 'Send Report to Clinic & Patient'}</span>
                      </button>
                    </>
                  )}
                </>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload data files and execute calculation to see results
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Processing History */}
      {selectedPatient && processingHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <History className="h-5 w-5 mr-2" />
              Processing History for {getPatientName(selectedPatient)}
            </h2>
            <button
              onClick={async () => {
                toast.loading('Syncing PDFs from Supabase...', { id: 'sync-pdfs' });

                try {
                  // Force reload from database and sync
                  await loadProcessingHistory(selectedPatient.id);

                  // Count how many PDFs were found
                  const results = await DatabaseService.get('algorithmResults');
                  const patientResults = results.filter(r => r.patientId === selectedPatient.id);
                  const pdfCount = patientResults.filter(r => r.pdfUrl).length;
                  const totalCount = patientResults.length;

                  toast.success(`✅ Synced! ${pdfCount}/${totalCount} PDFs available`, { id: 'sync-pdfs' });
                } catch (error) {
                  console.error('❌ Sync failed:', error);
                  toast.error('Failed to sync PDFs', { id: 'sync-pdfs' });
                }
              }}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-1"
              title="Fetch PDFs from Supabase bucket and update database"
            >
              <Download className="h-3 w-3" />
              <span>Sync PDFs</span>
            </button>
          </div>
          <div className="space-y-3">
            {processingHistory.map((record, index) => (
              <div
                key={record.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(record.inputData?.processedAt || record.processedAt || record.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          fractionalSecondDigits: 3,
                          hour12: true
                        })}
                      </span>
                      {/* PDF Status Badge */}
                      {record.pdfUrl ? (
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full flex items-center space-x-1">
                          <CheckCircle className="h-3 w-3" />
                          <span>PDF Available</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-full">
                          No PDF
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mb-3">
                      <p>📁 Files: {record.inputData?.eyesOpenFile || record.eyesOpenFile || 'N/A'}, {record.inputData?.eyesClosedFile || record.eyesClosedFile || 'N/A'}</p>
                      <p>👤 Processed by: {record.inputData?.processedBy || record.processedBy || 'Unknown'}</p>
                      {(() => {
                        const durationMs = record.inputData?.processingDurationMs || record.processingDurationMs;
                        if (durationMs) {
                          const mins = Math.floor(durationMs / 60000);
                          const secs = Math.floor((durationMs % 60000) / 1000);
                          const ms = Math.floor(durationMs % 1000);
                          return <p>⏱️ Generated in: <span className="font-semibold text-green-600 dark:text-green-400">{mins}m {secs}s {ms}ms</span></p>;
                        }
                        return null;
                      })()}
                      {record.pdfUrl && (
                        <p className="text-green-600 dark:text-green-400">
                          📄 PDF: {record.pdfUrl.startsWith('http') ? 'Supabase ✓' : 'Local ✓'}
                        </p>
                      )}
                      {!record.pdfUrl && (
                        <p className="text-red-600 dark:text-red-400">📄 PDF: Not available</p>
                      )}
                    </div>

                    {/* Quick Summary of Results */}
                    {(() => {
                      const savedResults = parseResultsData(record.outputData || record.results);
                      return savedResults && savedResults.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {savedResults.slice(0, 4).map((result, idx) => (
                            <div key={idx} className="text-xs bg-gray-50 dark:bg-gray-700 rounded p-2">
                              <span className="text-gray-600 dark:text-gray-400">{result.parameter}:</span>
                              <span className={`ml-2 font-semibold ${getStatusColor(result.rawScore, result.parameter)}`}>
                                {result.rawScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col space-y-2">
                    {/* View Full Results Button */}
                    <button
                      onClick={() => {
                        // Handle both old format (results) and new format (outputData)
                        const savedResults = parseResultsData(record.outputData || record.results);
                        if (savedResults) {
                          setResults(savedResults);
                          setProcessingComplete(true);
                          setIsSaved(true);
                          // Set PDF URL if available
                          if (record.pdfUrl) {
                            setPdfUrl(record.pdfUrl);
                          }
                          // Set QEEG input PDF URLs if available
                          if (record.inputData?.eyesOpenUrl) {
                            setEyesOpenUrl(record.inputData.eyesOpenUrl);
                          }
                          if (record.inputData?.eyesClosedUrl) {
                            setEyesClosedUrl(record.inputData.eyesClosedUrl);
                          }
                          toast.success('Previous results loaded!');
                        } else {
                          toast.error('No results found in this record');
                          console.error('❌ No results found in record:', record);
                        }
                      }}
                      className="px-3 py-2 text-sm bg-primary hover:bg-navy-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-1"
                    >
                      <FileText className="h-4 w-4" />
                      <span>View Results</span>
                    </button>

                    {/* Download PDF Button - Always visible - Regenerates PDF with saved notes */}
                    <button
                      onClick={async () => {
                        const savedResults = parseResultsData(record.outputData || record.results);
                        if (!savedResults || savedResults.length === 0) {
                          toast.error('No results available for this record');
                          return;
                        }

                        console.log('📥 Regenerating PDF with saved notes from record:', {
                          processedAt: record.processedAt,
                          hasNotes: !!record.parameter_notes,
                          notes: record.parameter_notes?.substring(0, 50) || '(empty)'
                        });

                        try {
                          toast.loading('Generating PDF with saved notes...', { id: 'history-download' });

                          // Regenerate PDF with saved notes from database
                          // Backend now sends PDF directly, no URL needed
                          const savedResults = parseResultsData(record.outputData || record.results);
                          if (!savedResults || savedResults.length === 0) {
                            throw new Error('No results available for this record');
                          }

                          const savedNotes = record.parameter_notes || '';
                          const patientData = {
                            name: record.inputData?.patientName || getPatientName(selectedPatient),
                            dateOfRecording: record.inputData?.processedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
                            dateOfBirth: selectedPatient?.dateOfBirth || selectedPatient?.date_of_birth || 'Not specified',
                            age: selectedPatient?.age || 'N/A',
                            gender: selectedPatient?.gender || 'Not specified',
                            handedness: selectedPatient?.handedness || 'Right',
                            patientId: record.patientId,
                            clinicName: record.inputData?.clinicName || selectedPatient?.clinicName || 'Unknown-Clinic',
                            clinicId: selectedPatient?.clinicId || record.inputData?.clinicId || null,
                          };

                          const algorithmResults = {
                            parameters: savedResults.map(result => {
                              const scoreParts = (result.rawScore || '0/3').split('/');
                              const score = parseInt(scoreParts[0]) || 0;
                              const maxScore = parseInt(scoreParts[1]) || 3;
                              return {
                                name: result.parameter || 'Unknown Parameter',
                                score: isNaN(score) ? 0 : score,
                                maxScore: isNaN(maxScore) ? 3 : maxScore,
                                classification: result.status || 'Unknown',
                                metrics: (result.metrics || []).map(m => ({
                                  name: m.name || 'Unknown',
                                  score: m.score || 0,
                                  value: m.value || 0,
                                  threshold: m.threshold || 'Not provided'
                                }))
                              };
                            }),
                            overallScore: savedResults.reduce((sum, r) => {
                              const scoreParts = (r.rawScore || '0/3').split('/');
                              return sum + (parseInt(scoreParts[0]) || 0);
                            }, 0)
                          };

                          const qeegData = {
                            EC: { absolute: { Fz: { Delta: 5.2, Theta: 4.1, Alpha: 8.3, Beta: 6.2, HiBeta: 3.1 } }, relative: { Pz: { Alpha: 45.2 } }, special: { alphaPeak: 10.3 } },
                            EO: { absolute: { Fz: { Theta: 3.8, Beta: 3.2, HiBeta: 2.5 } }, relative: { Pz: { Alpha: 28.7 } } }
                          };

                          // Call backend API - now returns PDF directly
                          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                          const token = await getFreshToken();

                          const headers = { 'Content-Type': 'application/json' };
                          if (token) {
                            headers['Authorization'] = `Bearer ${token}`;
                          }

                          const response = await fetch(`${apiUrl}/qeeg/generate-pdf`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              patientData,
                              algorithmResults,
                              qeegData,
                              parameterNotes: savedNotes
                            })
                          });

                          if (!response.ok) throw new Error('Failed to generate PDF');

                          // Get PDF blob from response
                          const blob = await response.blob();

                          // Create download link
                          const downloadUrl = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = downloadUrl;
                          link.download = `neurosense-report-${record.inputData?.patientName || 'patient'}.pdf`;

                          // Trigger download
                          document.body.appendChild(link);
                          link.click();

                          // Cleanup
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(downloadUrl);

                          toast.success('PDF downloaded with saved notes!', { id: 'history-download' });
                        } catch (error) {
                          console.error('Download error:', error);
                          toast.error('Failed to download PDF', { id: 'history-download' });
                        }
                      }}
                      disabled={!(record.outputData || record.results)?.length}
                      className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-center space-x-1 ${
                        (record.outputData || record.results)?.length
                          ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                          : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      }`}
                      title={(record.outputData || record.results)?.length ? (record.parameter_notes ? 'Download PDF with saved notes' : 'Download PDF Report') : 'No results available'}
                    >
                      <Download className="h-4 w-4" />
                      <span>{record.parameter_notes ? 'PDF (with Notes)' : 'Brain Wellness Report'}</span>
                    </button>

                    {/* Download Eyes Open PDF Button - Show if URL in record OR bucket has files */}
                    {(record.inputData?.eyesOpenUrl || patientQeegFiles.eyesOpen.length > 0) && (
                      <button
                        onClick={async () => {
                          try {
                            toast.loading('Downloading Eyes Open PDF...', { id: 'eo-download' });
                            // Use URL from record if available, otherwise use latest from bucket
                            let downloadFromUrl = record.inputData?.eyesOpenUrl || patientQeegFiles.eyesOpen[0]?.url;
                            if (!downloadFromUrl) throw new Error('No Eyes Open PDF URL available');

                            // Construct full URL if relative path is returned
                            if (downloadFromUrl.startsWith('/')) {
                              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                              const baseUrl = apiUrl.replace(/\/api\/?$/, '');
                              downloadFromUrl = baseUrl + downloadFromUrl;
                            }

                            const response = await fetch(downloadFromUrl);
                            if (!response.ok) throw new Error('Failed to fetch PDF');
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            link.download = `EyesOpen-${record.inputData?.patientName || 'patient'}.pdf`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(downloadUrl);
                            toast.success('Eyes Open PDF downloaded!', { id: 'eo-download' });
                          } catch (error) {
                            console.error('Download error:', error);
                            toast.error('Failed to download Eyes Open PDF', { id: 'eo-download' });
                          }
                        }}
                        className="px-3 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-1"
                        title="Download modified Eyes Open PDF with Limitless Brain Lab logo"
                      >
                        <Download className="h-4 w-4" />
                        <span>Eyes Open</span>
                      </button>
                    )}

                    {/* Download Eyes Closed PDF Button - Show if URL in record OR bucket has files */}
                    {(record.inputData?.eyesClosedUrl || patientQeegFiles.eyesClosed.length > 0) && (
                      <button
                        onClick={async () => {
                          try {
                            toast.loading('Downloading Eyes Closed PDF...', { id: 'ec-download' });
                            // Use URL from record if available, otherwise use latest from bucket
                            let downloadFromUrl = record.inputData?.eyesClosedUrl || patientQeegFiles.eyesClosed[0]?.url;
                            if (!downloadFromUrl) throw new Error('No Eyes Closed PDF URL available');

                            // Construct full URL if relative path is returned
                            if (downloadFromUrl.startsWith('/')) {
                              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                              const baseUrl = apiUrl.replace(/\/api\/?$/, '');
                              downloadFromUrl = baseUrl + downloadFromUrl;
                            }

                            const response = await fetch(downloadFromUrl);
                            if (!response.ok) throw new Error('Failed to fetch PDF');
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            link.download = `EyesClosed-${record.inputData?.patientName || 'patient'}.pdf`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(downloadUrl);
                            toast.success('Eyes Closed PDF downloaded!', { id: 'ec-download' });
                          } catch (error) {
                            console.error('Download error:', error);
                            toast.error('Failed to download Eyes Closed PDF', { id: 'ec-download' });
                          }
                        }}
                        className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-1"
                        title="Download modified Eyes Closed PDF with Limitless Brain Lab logo"
                      >
                        <Download className="h-4 w-4" />
                        <span>Eyes Closed</span>
                      </button>
                    )}

                    {/* Claude Report buttons - Show only if this record has a Claude report */}
                    {(record.claude_report_url || record.claudeReportUrl) && (
                      <button
                        onClick={() => downloadPdfFromUrl(record.claude_report_url || record.claudeReportUrl, `Claude-Brain-Report-${getPatientName(selectedPatient).replace(/[^a-z0-9]/gi, '-')}.pdf`)}
                        className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-1"
                        title="Download the Neurosense Performance Report"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download Neurosense Performance Report</span>
                      </button>
                    )}

                    {(record.claude_report_url || record.claudeReportUrl) && (
                      <button
                        onClick={() => sendClaudeReportForRecord(record)}
                        className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-1"
                        title="Send the Claude report to the patient and clinic"
                      >
                        <Send className="h-4 w-4" />
                        <span>Send Neurosense Performance Report</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable Details */}
                {(() => {
                  const savedResults = parseResultsData(record.outputData || record.results);
                  return savedResults && savedResults.length > 4 && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {savedResults.slice(4).map((result, idx) => (
                        <div key={idx} className="text-xs bg-gray-50 dark:bg-gray-700 rounded p-2">
                          <span className="text-gray-600 dark:text-gray-400">{result.parameter}:</span>
                          <span className={`ml-2 font-semibold ${getStatusColor(result.rawScore, result.parameter)}`}>
                            {result.rawScore}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-accent-light dark:bg-primary/20 border border-primary-light dark:border-primary rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-medium text-primary dark:text-primary-light mb-2">
          About Algorithm 1 Processing
        </h3>
        <p className="text-sm text-navy-800 dark:text-gray-300">
          This processor analyzes QEEG data files (Eyes Open and Eyes Closed) and generates 7 key parameters using proprietary
          binary scoring logic. The algorithm evaluates brain activity patterns to assess cognitive and emotional health markers.
        </p>
      </div>
    </div>
  );
};

export default AlgorithmDataProcessor;
