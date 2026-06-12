import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileText,
  Users,
  Calendar,
  Download,
  Eye,
  Trash2,
  Plus,
  Filter,
  Search,
  X,
  Loader2,
  Cloud,
  UploadCloud,
  AlertTriangle,
  Lock,
  Brain,
  ChevronDown,
  User,
  Phone,
  MapPin,
  Home,
  Mail
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import StorageService from '../../services/storageService';
import ErrorBoundary from '../ErrorBoundary';
import SubscriptionPopup from './SubscriptionPopup';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import NotificationService from '../../services/notificationService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const PatientReports = ({ onUpdate, selectedClinic: superAdminSelectedClinic }) => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [patients, setPatients] = useState([]);
  const [formPatients, setFormPatients] = useState([]); // patients for upload form dropdown only
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [showSubscriptionPopup, setShowSubscriptionPopup] = useState(false);
  const [showResponseUploadModal, setShowResponseUploadModal] = useState(false);
  const [selectedReportForResponse, setSelectedReportForResponse] = useState(null);
  const [clinicUsage, setClinicUsage] = useState({});
  const [subscriptions, setSubscriptions] = useState({});
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedReportForView, setSelectedReportForView] = useState(null);
  const [showPatientDetailModal, setShowPatientDetailModal] = useState(false);
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState(null);
  const [selectedOtherDocFile, setSelectedOtherDocFile] = useState(null);
  const [expandedPatientId, setExpandedPatientId] = useState(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({
    defaultValues: {
      clinicId: '',
      patientId: '',
      title: '',
      reportType: 'EEG',
      notes: ''
    }
  });

  const watchedClinic = watch('clinicId');

  // Check if clinic has reached report limit
  const checkReportLimit = (clinicId) => {
    try {
      // Super Admin has no restrictions
      if (user?.role === 'super_admin') {
        return false;
      }

      // Default clinic has unlimited report generation — always bypass limit
      const DEFAULT_CLINIC_ID = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30';
      if (clinicId === DEFAULT_CLINIC_ID) {
        return false;
      }

      const subscription = subscriptions[clinicId];
      const usage = clinicUsage[clinicId] || 0;

      if (subscription && subscription.status === 'active') {
        // Paid subscription - check against plan limit
        return usage >= (subscription.reportsAllowed || 0);
      } else {
        // Trial subscription - 10 report limit
        return usage >= 10;
      }
    } catch (error) {
      console.error('ERROR: Error checking report limit:', error);
      return false; // Default to not limiting if there's an error
    }
  };

  // Get clinic's current usage info
  const getClinicUsageInfo = (clinicId) => {
    try {
      // Super Admin has unlimited access
      if (user?.role === 'super_admin') {
        return {
          used: clinicUsage[clinicId] || 0,
          allowed: 'Unlimited',
          remaining: 'Unlimited',
          isTrial: false,
          planName: 'Super Admin - Unlimited Access'
        };
      }

      // Default clinic has unlimited access
      const DEFAULT_CLINIC_ID = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30';
      if (clinicId === DEFAULT_CLINIC_ID) {
        return {
          used: clinicUsage[clinicId] || 0,
          allowed: 'Unlimited',
          remaining: 'Unlimited',
          isTrial: false,
          planName: 'Unlimited Access'
        };
      }
      
      const subscription = subscriptions[clinicId];
      const usage = clinicUsage[clinicId] || 0;
      
      if (subscription && subscription.status === 'active') {
        return {
          used: usage,
          allowed: subscription.reportsAllowed || 0,
          remaining: Math.max(0, (subscription.reportsAllowed || 0) - usage),
          isTrial: false,
          planName: subscription.planName || 'Paid Plan'
        };
      } else {
        return {
          used: usage,
          allowed: 10,
          remaining: Math.max(0, 10 - usage),
          isTrial: true,
          planName: 'Trial Plan'
        };
      }
    } catch (error) {
      console.error('ERROR: Error getting clinic usage info:', error);
      return {
        used: 0,
        allowed: 10,
        remaining: 10,
        isTrial: true,
        planName: 'Trial Plan'
      };
    }
  };

  useEffect(() => {
    loadData();
  }, [superAdminSelectedClinic]);

  useEffect(() => {
    // Load patients for upload form dropdown only — does NOT overwrite the main patients list
    if (watchedClinic) {
      const loadClinicPatients = async () => {
        try {
          const clinicPatients = await DatabaseService.getPatientsByClinic(watchedClinic);
          setFormPatients(clinicPatients || []);
        } catch (error) {
          console.error('ERROR: Error loading clinic patients:', error);
          setFormPatients([]);
        }
      };
      loadClinicPatients();
    } else {
      setFormPatients([]);
    }
  }, [watchedClinic]);

  // Fetch all data from a table via server API (bypasses RLS)
  const fetchAdminTable = async (tableName) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await fetch(`${baseUrl}/api/admin/table/${tableName}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await response.json();
      if (result.success) {
        return result.data || [];
      }
      console.error(`Failed to fetch ${tableName}:`, result.message || result.error);
      return [];
    } catch (error) {
      console.error(`Error fetching ${tableName} from server:`, error);
      // Fallback to direct Supabase call
      return await DatabaseService.get(tableName) || [];
    }
  };

  const loadData = async () => {
    try {
      setError(null); // Clear any previous errors
      setLoading(true);

      // Fetch all data via server API (uses service role key, bypasses RLS)
      const [reportsData, clinicDocsData, algorithmResultsData, clinicsData, patientsData, subscriptionsData] = await Promise.all([
        fetchAdminTable('reports'),
        fetchAdminTable('clinical_documentation'),
        fetchAdminTable('algorithm_results'),
        fetchAdminTable('clinics'),
        fetchAdminTable('patients'),
        fetchAdminTable('subscriptions')
      ]);

      // Normalize snake_case to camelCase for compatibility
      const normalizeReport = (r) => ({
        ...r,
        clinicId: r.clinicId || r.clinic_id,
        patientId: r.patientId || r.patient_id,
        patientName: r.patientName || r.patient_name,
        fileName: r.fileName || r.file_name,
        filePath: r.filePath || r.file_path,
        reportData: r.reportData || r.report_data || {},
        storagePath: r.storagePath || r.storage_path,
        fileUrl: r.fileUrl || r.file_url,
        storedInCloud: r.storedInCloud || r.stored_in_cloud,
        uploadedAt: r.uploadedAt || r.uploaded_at || r.created_at,
        createdAt: r.createdAt || r.created_at,
        updatedAt: r.updatedAt || r.updated_at
      });
      const normalizePatient = (p) => ({
        ...p,
        clinicId: p.clinicId || p.clinic_id || p.org_id,
        orgId: p.orgId || p.org_id || p.clinic_id,
        fullName: p.fullName || p.full_name || p.name,
        externalId: p.externalId || p.external_id,
        dateOfBirth: p.dateOfBirth || p.date_of_birth
      });
      const normalizeClinic = (c) => ({
        ...c,
        reportsUsed: c.reportsUsed || c.reports_used,
        reportsAllowed: c.reportsAllowed || c.reports_allowed,
        subscriptionStatus: c.subscriptionStatus || c.subscription_status
      });
      const normalizeSubscription = (s) => ({
        ...s,
        clinicId: s.clinicId || s.clinic_id,
        reportsAllowed: s.reportsAllowed || s.reports_allowed
      });

      const normalizedReports = reportsData.map(normalizeReport);
      const normalizedClinics = clinicsData.map(normalizeClinic);
      const normalizedPatients = patientsData.map(normalizePatient);
      const normalizedSubscriptions = subscriptionsData.map(normalizeSubscription);

      // Convert clinical_documentation records into report format
      const clinicDocReports = [];
      (clinicDocsData || []).forEach(doc => {
        const fileUrls = doc.file_urls || doc.fileUrls || {};
        const patientId = doc.patient_id || doc.patientId;
        const clinicId = doc.clinic_id || doc.clinicId;
        const patientName = doc.patient_name || doc.patientName;

        Object.entries(fileUrls).forEach(([key, fileEntry]) => {
          clinicDocReports.push({
            id: `${doc.id}_${key}`,
            clinicId: clinicId,
            patientId: patientId,
            patientName: patientName,
            fileName: fileEntry.originalName || fileEntry.fileName || 'Document',
            filePath: fileEntry.path || '',
            fileUrl: fileEntry.url || '',
            storedInCloud: true,
            reportData: {
              title: fileEntry.documentTitle || fileEntry.documentType || 'Clinic Upload',
              reportType: fileEntry.documentType || 'Other',
              description: fileEntry.notes || '',
              fileSize: fileEntry.size,
              fileType: fileEntry.type,
              source: 'clinic_upload'
            },
            title: fileEntry.documentTitle || fileEntry.originalName || 'Clinic Upload',
            uploadedAt: fileEntry.uploadedAt || doc.created_at,
            createdAt: doc.created_at || doc.createdAt,
            uploadedBy: fileEntry.uploadedBy || 'Clinic'
          });
        });
      });

      // Convert algorithm_results records into report format
      const algorithmReports = (algorithmResultsData || [])
        .filter(r => r.status === 'completed' && (r.pdf_url || r.pdfUrl))
        .map(r => ({
          id: `algo_${r.id}`,
          clinicId: r.clinic_id || r.clinicId,
          patientId: r.patient_id || r.patientId,
          patientName: r.patient_name || r.patientName || '',
          fileName: `QEEG Report - ${r.patient_name || r.patientName || 'Patient'}`,
          filePath: r.pdf_url || r.pdfUrl || '',
          fileUrl: r.pdf_url || r.pdfUrl || '',
          storedInCloud: true,
          reportData: {
            title: 'QEEG Algorithm Report',
            reportType: 'QEEG',
            description: r.parameter_notes || '',
            source: 'algorithm_results',
            algorithmName: r.algorithm_name || r.algorithmName || 'Algorithm 1'
          },
          title: `QEEG Report - ${r.patient_name || r.patientName || 'Patient'}`,
          uploadedAt: r.processed_at || r.processedAt || r.created_at,
          createdAt: r.created_at,
          uploadedBy: r.processed_by || 'Super Admin'
        }));

      // Merge reports from all three sources
      const allReports = [...normalizedReports, ...clinicDocReports, ...algorithmReports];

      console.log('DATA: Fetched from server:', {
        reports: normalizedReports.length,
        clinicDocs: clinicDocReports.length,
        algorithmResults: algorithmReports.length,
        totalReports: allReports.length,
        clinics: normalizedClinics.length,
        patients: normalizedPatients.length,
        subscriptions: normalizedSubscriptions.length
      });

      // Filter reports by selected clinic if specified (NO localStorage!)
      const filteredReportsData = superAdminSelectedClinic
        ? allReports.filter(report => report.clinicId === superAdminSelectedClinic)
        : allReports;

      // First, fix patient names in the reports
      const reportsWithFixedNames = fixPatientNames(filteredReportsData, normalizedPatients);

      // Validate and fix report data
      const validatedReports = validateReportData(reportsWithFixedNames);

      // Enhance reports with clinic and patient names, and extract file paths
      const enhancedReports = validatedReports.map(report => {
        const clinic = normalizedClinics.find(c => c.id === report.clinicId);

        // Extract file path and metadata from reportData if they exist
        const reportData = report.reportData || report.report_data || {};

        return {
          ...report,
          clinicName: clinic?.name || 'Unknown Clinic',
          patientName: report.patientName || 'Unknown Patient',
          // Ensure file path fields are available at top level for easy access
          storagePath: report.storagePath || report.filePath || report.file_path || reportData.storagePath || reportData.filePath,
          s3Key: report.s3Key || reportData.s3Key,
          fileUrl: report.fileUrl || reportData.fileUrl,
          storedInCloud: report.storedInCloud || reportData.storedInCloud || false,
          title: report.title || reportData.title || report.fileName
        };
      }).sort((a, b) => new Date(b.uploadedAt || b.createdAt || 0) - new Date(a.uploadedAt || a.createdAt || 0));
      
      setReports(enhancedReports);
      setClinics(normalizedClinics);

      // Filter patients by selected clinic if specified
      const filteredPatientsData = superAdminSelectedClinic
        ? normalizedPatients.filter(patient => patient.clinicId === superAdminSelectedClinic)
        : normalizedPatients;
      setPatients(filteredPatientsData);

      // Calculate clinic usage and load subscriptions
      const usageMap = {};
      const subscriptionMap = {};

      normalizedClinics.forEach(clinic => {
        const clinicReports = allReports.filter(report => report.clinicId === clinic.id);
        usageMap[clinic.id] = clinicReports.length;
      });

      normalizedSubscriptions.forEach(subscription => {
        subscriptionMap[subscription.clinicId] = subscription;
      });

      setClinicUsage(usageMap);
      setSubscriptions(subscriptionMap);
    } catch (error) {
      console.error('ERROR: Critical error loading admin patient reports:', error);
      setError(getFriendlyErrorMessage(error, 'We could not load the patient reports. Please try again.'));
      toast.error('Error loading patient reports data');
    } finally {
      setLoading(false);
    }
  };

  // Function to fix patient names in reports
  const fixPatientNames = (reports, patients) => {
    return reports.map(report => {
      // If report already has a patient name, use it
      if (report.patientName && report.patientName !== 'Unknown Patient') {
        return report;
      }

      // Try to find patient by ID with multiple field variations
      let patient = patients.find(p =>
        p.id === report.patientId ||
        p.id === report.patient_id
      );

      // Get patient name with multiple field variations
      const getPatientName = (p) => {
        return p?.name || p?.fullName || p?.full_name || null;
      };

      // If not found by ID, try to find by name (case insensitive)
      if (!patient && report.patientName) {
        patient = patients.find(p => {
          const pName = getPatientName(p);
          return pName && pName.toLowerCase() === report.patientName.toLowerCase();
        });
      }

      // If still not found, try partial name matching
      if (!patient && report.patientName) {
        patient = patients.find(p => {
          const pName = getPatientName(p);
          return pName && pName.toLowerCase().includes(report.patientName.toLowerCase());
        });
      }

      const patientName = patient ? getPatientName(patient) : (report.patientName || 'Unknown Patient');
      const patientUid = patient?.patient_uid || patient?.external_id || '';

      return {
        ...report,
        patientName: patientName,
        patientUid: patientUid
      };
    });
  };

  // Function to validate and fix report data
  const validateReportData = (reports) => {
    return reports.map(report => {
      const issues = [];
      
      // Check for missing file information
      if (!report.fileName) {
        issues.push('Missing fileName');
        report.fileName = 'Unknown_Report.pdf';
      }
      
      // Check for missing S3 key but has storedInCloud flag
      if (report.storedInCloud && !report.s3Key) {
        issues.push('Missing S3 key but marked as stored in cloud');
        report.storedInCloud = false;
      }
      
      // Check for invalid file types
      if (report.fileType && !['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'].includes(report.fileType)) {
        issues.push(`Invalid file type: ${report.fileType}`);
        report.fileType = 'application/pdf';
      }
      
      if (issues.length > 0) {
        // Report data issues found - silently fix them
      }
      
      return report;
    });
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        // Validate file
        StorageService.validateFile(file);
        setSelectedFile(file);
      } catch (error) {
        toast.error(getFriendlyErrorMessage(error, 'This file cannot be uploaded. Please choose a supported file type within the size limit.'));
        setSelectedFile(null);
      }
    }
  };

  const handleOtherDocFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        StorageService.validateFile(file);
        setSelectedOtherDocFile(file);
      } catch (error) {
        toast.error(getFriendlyErrorMessage(error, 'This file cannot be uploaded. Please choose a supported file type within the size limit.'));
        setSelectedOtherDocFile(null);
      }
    } else {
      setSelectedOtherDocFile(null);
    }
  };

  const handleUploadReport = async (data) => {
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    // Validate required fields
    if (!data.clinicId) {
      toast.error('Please select a clinic');
      return;
    }

    if (!data.patientId) {
      toast.error('Please select a patient');
      return;
    }

    if (!data.title) {
      toast.error('Please enter a report title');
      return;
    }

    // Super Admin can upload reports without restrictions
    if (user?.role === 'super_admin') {
      // Super Admin has unlimited access
    } else {
      // For regular users, check if clinic has reached report limit
      if (checkReportLimit(data.clinicId)) {
        setShowSubscriptionPopup(true);
        toast.error('Report limit reached. Please upgrade your plan to continue uploading reports.');
        return;
      }
    }

    setUploadingFile(true);
    setUploadProgress(0);

    try {
      // Get clinic name and patient name for folder/file naming
      const selectedClinicObj = clinics.find(c => c.id === data.clinicId);
      const selectedPatientObj = formPatients.find(p => p.id === data.patientId);
      const clinicName = (selectedClinicObj?.name || 'unknown_clinic').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
      const patientName = (selectedPatientObj?.fullName || selectedPatientObj?.full_name || selectedPatientObj?.name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');

      console.log('START: Starting file upload...', {
        file: selectedFile.name,
        clinicId: data.clinicId,
        clinicName,
        patientId: data.patientId,
        patientName
      });

      // Validate file again before upload
      StorageService.validateFile(selectedFile);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload file to Cloud Storage (clinic_name folder / neurosense-report-patient-timestamp.ext)
      const uploadResult = await StorageService.uploadFile(
        selectedFile,
        selectedFile.name,
        {
          clinicId: data.clinicId,
          patientId: data.patientId,
          clinicName,
          patientName,
          reportType: data.reportType || 'EEG',
          uploadedBy: data.uploadedByName || 'Super Admin'
        }
      );

      clearInterval(progressInterval);
      setUploadProgress(100);


      // Save report metadata to database
      // Actual Supabase reports table schema (from 004_simple_clinic_tables.sql):
      // - clinic_id, patient_id, file_name, file_path, report_data (JSONB), status
      const reportData = {
        clinicId: data.clinicId,
        patientId: data.patientId,
        fileName: selectedFile.name,
        filePath: uploadResult.path || uploadResult.key,
        reportData: {
          // Store ALL metadata in JSONB field
          title: data.title || selectedFile.name,
          reportType: data.reportType || 'Standard',
          description: data.notes || '',
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          s3Key: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          s3Region: uploadResult.region,
          s3FileName: uploadResult.fileName,
          s3UploadedAt: uploadResult.uploadedAt,
          s3ETag: uploadResult.etag,
          uploadedBy: data.uploadedByName || 'Super Admin',
          uploadedByUserId: user?.id,
          uploadStatus: 'completed',
          storedInCloud: true,
          // Include brain parameters if provided
          brainParameters: data.brainParameters || null
        },
        status: 'completed'
      };
      
      const savedReport = await DatabaseService.addReport(reportData);

      if (!savedReport) {
        throw new Error('Failed to save report to database');
      }


      // Also upload the other document if one was selected
      if (selectedOtherDocFile) {
        try {
          const otherUploadResult = await StorageService.uploadFile(
            selectedOtherDocFile,
            selectedOtherDocFile.name,
            {
              clinicId: data.clinicId,
              patientId: data.patientId,
              clinicName,
              patientName,
              reportType: 'other_document',
              uploadedBy: data.uploadedByName || 'Super Admin'
            }
          );

          const otherDocData = {
            clinicId: data.clinicId,
            patientId: data.patientId,
            fileName: selectedOtherDocFile.name,
            filePath: otherUploadResult.path || otherUploadResult.key,
            reportData: {
              title: data.otherDocTitle || selectedOtherDocFile.name,
              report_type: 'other_document',
              reportType: 'other_document',
              description: data.otherDocNotes || '',
              fileSize: selectedOtherDocFile.size,
              fileType: selectedOtherDocFile.type,
              s3Key: otherUploadResult.key,
              s3Bucket: otherUploadResult.bucket,
              s3Region: otherUploadResult.region,
              s3FileName: otherUploadResult.fileName,
              s3UploadedAt: otherUploadResult.uploadedAt,
              s3ETag: otherUploadResult.etag,
              uploadedBy: data.uploadedByName || 'Super Admin',
              uploadedByUserId: user?.id,
              uploadStatus: 'completed',
              storedInCloud: true
            },
            status: 'completed'
          };

          const savedOtherDoc = await DatabaseService.addReport(otherDocData);
          if (savedOtherDoc) {
            toast.success('Other document also uploaded successfully!');
          }
        } catch (otherDocError) {
          console.error('ERROR: Other document upload failed:', otherDocError);
          toast.error(getFriendlyErrorMessage(otherDocError, 'Brain Wellness report uploaded, but the other document could not be uploaded. Please try uploading it again.'));
        }
      }

      toast.success('Report uploaded successfully to Cloud Storage!');

      // Create admin notification for document delivery tracking
      NotificationService.notifyReportUploaded({
        clinicId: data.clinicId,
        clinicName: selectedClinicObj?.name,
        patientId: data.patientId,
        patientName: selectedPatientObj?.fullName || selectedPatientObj?.full_name || selectedPatientObj?.name,
        reportId: savedReport?.id,
        reportType: data.reportType || 'EEG',
        uploadedBy: user?.email || 'Super Admin'
      }).catch((err) => console.error('Notification create failed:', err));

      // Send email to clinic and patient
      const patientEmail = selectedPatientObj?.email;
      const clinicEmail = selectedClinicObj?.email;
      if (patientEmail || clinicEmail) {
        fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api')}/notify-patient-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientEmail,
            patientName: selectedPatientObj?.fullName || selectedPatientObj?.full_name || selectedPatientObj?.name,
            clinicEmail,
            clinicName: selectedClinicObj?.name,
            reportType: data.reportType || 'EEG'
          })
        }).catch((err) => console.error('Report email notification failed:', err));
      }

      loadData();
      setShowUploadModal(false);
      setSelectedFile(null);
      setSelectedOtherDocFile(null);
      setUploadProgress(0);
      reset();
      onUpdate?.();
    } catch (error) {
      console.error('ERROR: Admin Upload Error:', error);
      console.error('Error context:', {
        message: error.message,
        formData: data,
        file: selectedFile ? {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type
        } : null
      });

      toast.error(getFriendlyErrorMessage(error, 'Upload failed. Please try again.'));
      setUploadProgress(0);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (window.confirm('Are you sure you want to delete this report? This will also remove the file from Cloud Storage.')) {
      try {
        // Get report data to find S3 key
        const report = reports.find(r => r.id === reportId);
        
        if (report && report.s3Key) {
          try {
            await StorageService.deleteFile(report.storagePath || report.s3Key);
          } catch (s3Error) {
            console.warn('WARNING: Could not delete file from S3:', s3Error.message);
            // Continue with database deletion even if S3 deletion fails
          }
        }

        // Delete from database
        DatabaseService.delete('reports', reportId);
        toast.success('Report deleted successfully from database and S3');
        loadData();
        onUpdate?.();
      } catch (error) {
        toast.error('Error deleting report');
        console.error(error);
      }
    }
  };

  const handleSubscription = async (subscriptionData) => {
    try {
      // Save subscription to database
      await DatabaseService.add('subscriptions', subscriptionData);
      
      // Update clinic's subscription status
      await DatabaseService.update('clinics', subscriptionData.clinicId, {
        subscriptionStatus: 'active',
        reportsAllowed: subscriptionData.reportsAllowed
      });
      
      // Reload data to reflect changes
      loadData();
      
      toast.success('Subscription updated successfully!');
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Failed to update subscription');
    }
  };

  const handleUploadResponse = (report) => {
    setSelectedReportForResponse(report);
    setShowResponseUploadModal(true);
  };

  const handleSubmitResponse = async (responseData) => {
    if (!selectedFile || !selectedReportForResponse) {
      toast.error('Please select a response file to upload');
      return;
    }

    setUploadingFile(true);
    setUploadProgress(0);

    try {
      // Get clinic name and patient name for folder/file naming
      const respClinicObj = clinics.find(c => c.id === selectedReportForResponse.clinicId);
      const respPatientObj = formPatients.find(p => p.id === selectedReportForResponse.patientId);
      const respClinicName = (respClinicObj?.name || 'unknown_clinic').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
      const respPatientName = (respPatientObj?.fullName || respPatientObj?.full_name || respPatientObj?.name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');

      console.log('START: Uploading response report...', {
        originalReport: selectedReportForResponse.id,
        responseFile: selectedFile.name,
        clinicName: respClinicName,
        patientName: respPatientName
      });

      // Validate file
      StorageService.validateFile(selectedFile);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Upload response file to neurosense-reports bucket
      const uploadResult = await StorageService.uploadFile(
        selectedFile,
        `response_${selectedFile.name}`,
        {
          clinicId: selectedReportForResponse.clinicId,
          patientId: selectedReportForResponse.patientId,
          clinicName: respClinicName,
          patientName: respPatientName,
          reportType: 'Response Report',
          uploadedBy: responseData?.uploadedByName || 'Super Admin',
          originalReportId: selectedReportForResponse.id,
          bucketName: 'neurosense-reports'
        }
      );

      clearInterval(progressInterval);
      setUploadProgress(100);


      // Save response report metadata to database
      // Actual Supabase reports table schema (from 004_simple_clinic_tables.sql):
      // - clinic_id, patient_id, file_name, file_path, report_data (JSONB), status
      const responseReportData = {
        clinicId: selectedReportForResponse.clinicId,
        patientId: selectedReportForResponse.patientId,
        fileName: selectedFile.name,
        filePath: uploadResult.path || uploadResult.key,
        reportData: {
          // Store ALL metadata in JSONB field
          title: `Response to: ${selectedReportForResponse.title || selectedReportForResponse.fileName}`,
          reportType: 'Response Report',
          description: responseData?.notes || `Response report uploaded by ${responseData?.uploadedByName || 'Super Admin'}`,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          s3Key: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          s3Region: uploadResult.region,
          s3FileName: uploadResult.fileName,
          s3UploadedAt: uploadResult.uploadedAt,
          s3ETag: uploadResult.etag,
          originalReportId: selectedReportForResponse.id,
          isResponseReport: true,
          uploadedBy: responseData?.uploadedByName || 'Super Admin',
          uploadedByUserId: user?.id,
          uploadStatus: 'completed',
          storedInCloud: true
        },
        status: 'completed'
      };
      
      const savedResponse = await DatabaseService.addReport(responseReportData);
      
      if (!savedResponse) {
        throw new Error('Failed to save response report to database');
      }
      
      toast.success(`Response report uploaded successfully for ${selectedReportForResponse.patientName}!`);

      // Also upload the other document if one was selected
      if (selectedOtherDocFile) {
        try {
          const otherUploadResult = await StorageService.uploadFile(
            selectedOtherDocFile,
            selectedOtherDocFile.name,
            {
              clinicId: selectedReportForResponse.clinicId,
              patientId: selectedReportForResponse.patientId,
              clinicName: respClinicName,
              patientName: respPatientName,
              reportType: 'other_document',
              uploadedBy: responseData?.uploadedByName || 'Super Admin'
            }
          );

          const otherDocData = {
            clinicId: selectedReportForResponse.clinicId,
            patientId: selectedReportForResponse.patientId,
            fileName: selectedOtherDocFile.name,
            filePath: otherUploadResult.path || otherUploadResult.key,
            reportData: {
              title: responseData?.otherDocTitle || selectedOtherDocFile.name,
              report_type: 'other_document',
              reportType: 'other_document',
              description: responseData?.otherDocNotes || '',
              fileSize: selectedOtherDocFile.size,
              fileType: selectedOtherDocFile.type,
              s3Key: otherUploadResult.key,
              s3Bucket: otherUploadResult.bucket,
              s3Region: otherUploadResult.region,
              s3FileName: otherUploadResult.fileName,
              s3UploadedAt: otherUploadResult.uploadedAt,
              s3ETag: otherUploadResult.etag,
              uploadedBy: responseData?.uploadedByName || 'Super Admin',
              uploadedByUserId: user?.id,
              uploadStatus: 'completed',
              storedInCloud: true
            },
            status: 'completed'
          };

          const savedOtherDoc = await DatabaseService.addReport(otherDocData);
          if (savedOtherDoc) {
            toast.success('Other document also uploaded successfully!');
          }
        } catch (otherDocError) {
          console.error('ERROR: Other document upload failed:', otherDocError);
          toast.error(getFriendlyErrorMessage(otherDocError, 'Response uploaded, but the other document could not be uploaded. Please try uploading it again.'));
        }
      }

      // Reload data and close modal
      loadData();
      setShowResponseUploadModal(false);
      setSelectedReportForResponse(null);
      setSelectedFile(null);
      setSelectedOtherDocFile(null);
      setUploadProgress(0);

      onUpdate?.();
    } catch (error) {
      console.error('ERROR: Response Upload Error:', error);
      toast.error(getFriendlyErrorMessage(error, 'Response upload failed. Please try again.'));
      setUploadProgress(0);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleViewReport = (report) => {
    setSelectedReportForView(report);
    setShowViewModal(true);
  };

  const handlePatientClick = (report) => {
    const patient = patients.find(p =>
      p.id === report.patientId || p.id === report.patient_id
    );
    if (patient) {
      setSelectedPatientForDetail({
        ...patient,
        clinicName: report.clinicName
      });
    } else {
      setSelectedPatientForDetail({
        id: report.patientId || report.patient_id,
        name: report.patientName,
        fullName: report.patientName,
        patient_uid: report.patientUid || '',
        clinicId: report.clinicId,
        clinicName: report.clinicName
      });
    }
    setShowPatientDetailModal(true);
  };

  const handleDownloadReport = async (report) => {
    try {
      // For regular users (not super_admin), check if clinic has reached report limit
      if (user?.role !== 'super_admin' && checkReportLimit(report.clinicId)) {
        setShowSubscriptionPopup(true);
        toast.error('Report limit reached. Please upgrade your plan to continue downloading reports.');
        return;
      }

      let downloadUrl = null;
      let fileName = report.fileName || 'report.pdf';

      console.log('INFO: Downloading report:', {
        fileName,
        reportId: report.id,
        s3Key: report.s3Key,
        storagePath: report.storagePath,
        filePath: report.filePath || report.file_path,
        fileUrl: report.fileUrl,
        storedInCloud: report.storedInCloud,
        reportData: report.reportData
      });

      // Extract file path from multiple possible locations
      const possiblePaths = [
        report.storagePath,
        report.s3Key,
        report.filePath,
        report.file_path,
        report.reportData?.s3Key,
        report.reportData?.storagePath,
        report.reportData?.filePath
      ].filter(Boolean);


      // Try multiple download methods
      let lastError = null;

      // Method 1: Try each possible path with Supabase Storage
      for (const path of possiblePaths) {
        try {
          downloadUrl = await StorageService.getSignedUrl(path, 300); // 5 minutes
          if (downloadUrl) {
            break;
          }
        } catch (pathError) {
          console.warn('WARNING: Failed to get signed URL for path:', path, pathError.message);
          lastError = pathError;
        }
      }

      // Method 2: Fallback to direct file URL if available
      if (!downloadUrl && report.fileUrl) {
        downloadUrl = report.fileUrl;
      }

      // Method 3: Check if file URL is in reportData
      if (!downloadUrl && report.reportData?.fileUrl) {
        downloadUrl = report.reportData.fileUrl;
      }

      // Download file if URL is available — fetch the bytes and save a blob so the
      // raw storage URL is never opened in a tab or exposed to the user.
      if (downloadUrl) {
        try {
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          toast.success(`Downloading ${fileName}`);
        } catch (fetchErr) {
          console.error('ERROR: Blob download failed:', fetchErr);
          toast.error(`Cannot download ${fileName}. Please try again.`);
        }
      } else {
        // No download method available
        console.error('ERROR: No download URL available. Tried paths:', possiblePaths);
        console.error('ERROR: Last error:', lastError?.message);
        console.error('ERROR: Full report object:', report);
        toast.error(`Cannot download ${fileName}. File not found in storage.`);
      }
    } catch (error) {
      console.error('ERROR: Error downloading report:', error);
      toast.error(getFriendlyErrorMessage(error, 'Download failed. Please try again.'));
    }
  };

  // Filter reports - exclude response reports from main list (they show as a column)
  const allResponseReports = (reports || []).filter(report => {
    return report.reportData?.isResponseReport ||
           report.report_data?.isResponseReport ||
           report.reportData?.report_type === 'Response Report' ||
           report.fileName?.startsWith('response_');
  });

  const filteredReports = (reports || []).filter(report => {
    const isResponseReport = report.reportData?.isResponseReport ||
                             report.report_data?.isResponseReport ||
                             report.reportData?.report_type === 'Response Report' ||
                             report.fileName?.startsWith('response_');

    if (isResponseReport) {
      return false;
    }

    const matchesSearch = (report?.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (report?.clinicName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (report?.fileName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClinic = !selectedClinic || report?.clinicId === selectedClinic;
    const matchesPatient = !selectedPatient || report?.patientId === selectedPatient;

    return matchesSearch && matchesClinic && matchesPatient;
  });

  // Helper to find response report linked to a main report
  const getResponseForReport = (reportId) => {
    return allResponseReports.find(r =>
      r.reportData?.originalReportId === reportId ||
      r.report_data?.originalReportId === reportId
    );
  };

  // Keep responseReports for backward compat
  const responseReports = allResponseReports.filter(report => {
    const matchesSearch = (report?.patientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (report?.clinicName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (report?.fileName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClinic = !selectedClinic || report?.clinicId === selectedClinic;
    const matchesPatient = !selectedPatient || report?.patientId === selectedPatient;

    return matchesSearch && matchesClinic && matchesPatient;
  });

  // Helper function to get file type display name
  const getFileTypeDisplay = (report) => {
    // Check file extension first
    const fileName = report?.fileName || report?.file_name || '';
    const fileExt = fileName.split('.').pop().toLowerCase();

    if (fileExt === 'edf' || fileExt === 'bdf' || fileExt === 'eeg') {
      return 'EDF';
    }

    // Check MIME type
    const fileType = report?.fileType || report?.file_type || '';
    if (fileType.includes('application/octet-stream') && (fileName.endsWith('.edf') || fileName.endsWith('.bdf'))) {
      return 'EDF';
    }
    if (fileType.includes('pdf')) return 'PDF';
    if (fileType.includes('jpeg') || fileType.includes('jpg')) return 'JPEG';
    if (fileType.includes('png')) return 'PNG';
    if (fileType.includes('doc')) return 'DOC';
    if (fileType.includes('xml')) return 'XML';
    if (fileType.includes('json')) return 'JSON';

    // Default
    return 'PDF';
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Patient Reports</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-x-4">
            <button
              onClick={() => {
                setError(null);
                loadData();
              }}
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 mb-6">
        <button
          onClick={() => {
            loadData();
            toast.success('Patient reports refreshed!');
          }}
          className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg font-medium text-sm border border-gray-200 transition-colors shadow-sm"
        >
          <Loader2 className="h-4 w-4" />
          <span>Refresh</span>
        </button>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" />
          <span>Brain Wellness Report</span>
        </button>
      </div>

      {/* Usage Summary */}
      {superAdminSelectedClinic && (
        <div className={`rounded-lg shadow-sm border p-4 mb-4 ${
          user?.role === 'super_admin' 
            ? 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200' 
            : 'bg-gradient-to-r from-[#E4EFFF] to-indigo-50 border-blue-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-lg font-semibold ${
                user?.role === 'super_admin' ? 'text-purple-900' : 'text-blue-900'
              }`}>
                {user?.role === 'super_admin' ? 'Super Admin - Clinic Overview' : 'Clinic Usage Summary'}
              </h3>
              {(() => {
                const usageInfo = getClinicUsageInfo(superAdminSelectedClinic);
                return (
                  <div className="mt-2 space-y-1">
                    <p className={user?.role === 'super_admin' ? 'text-purple-700' : 'text-blue-700'}>
                      <strong>Plan:</strong> {usageInfo.planName}
                    </p>
                    <p className={user?.role === 'super_admin' ? 'text-purple-700' : 'text-blue-700'}>
                      <strong>Usage:</strong> {usageInfo.used}/{usageInfo.allowed} reports
                    </p>
                    <p className={user?.role === 'super_admin' ? 'text-purple-700' : 'text-blue-700'}>
                      <strong>Remaining:</strong> {usageInfo.remaining} reports
                    </p>
                    {user?.role !== 'super_admin' && usageInfo.remaining <= 2 && (
                      <div className="flex items-center space-x-2 mt-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="text-orange-700 text-sm font-medium">
                          {usageInfo.remaining === 0 ? 'Report limit reached!' : 'Approaching report limit'}
                        </span>
                      </div>
                    )}
                    {user?.role === 'super_admin' && (
                      <div className="flex items-center space-x-2 mt-2">
                        <Lock className="h-4 w-4 text-[#323956]" />
                        <span className="text-green-700 text-sm font-medium">
                          Super Admin - Unlimited Access
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="text-right">
              {(() => {
                const usageInfo = getClinicUsageInfo(superAdminSelectedClinic);
                const percentage = user?.role === 'super_admin' ? 0 : (usageInfo.used / (usageInfo.allowed || 1)) * 100;
                return (
                  <div>
                    <div className={`text-2xl font-bold ${
                      user?.role === 'super_admin' ? 'text-purple-900' : 'text-blue-900'
                    }`}>{usageInfo.used}</div>
                    <div className={`text-sm ${
                      user?.role === 'super_admin' ? 'text-purple-700' : 'text-blue-700'
                    }`}>Reports Used</div>
                    {user?.role !== 'super_admin' && (
                      <div className="w-24 h-2 bg-blue-200 rounded-full mt-2">
                        <div 
                          className={`h-2 rounded-full ${
                            percentage >= 90 ? 'bg-red-500' : 
                            percentage >= 75 ? 'bg-orange-500' : 'bg-[#323956]'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        ></div>
                      </div>
                    )}
                    {user?.role === 'super_admin' && (
                      <div className="w-24 h-2 bg-green-200 rounded-full mt-2">
                        <div className="h-2 rounded-full bg-[#323956]" style={{ width: '100%' }}></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <select
            value={selectedClinic}
            onChange={(e) => setSelectedClinic(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Clinics</option>
            {(clinics || []).map(clinic => (
              <option key={clinic?.id || Math.random()} value={clinic?.id || ''}>{clinic?.name || 'Unknown Clinic'}</option>
            ))}
          </select>
          
          <select
            value={selectedPatient}
            onChange={(e) => setSelectedPatient(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Patients</option>
            {(patients || [])
              .filter(patient => !selectedClinic || patient?.clinicId === selectedClinic)
              .map(patient => (
                <option key={patient?.id || Math.random()} value={patient?.id || ''}>
                  {patient?.name || patient?.fullName || patient?.full_name || 'Unknown Patient'}
                </option>
              ))}
          </select>
          
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedClinic('');
              setSelectedPatient('');
            }}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center space-x-2"
          >
            <X className="h-4 w-4" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Reports Table - Grouped by Patient */}
      {(() => {
        // Group reports by patient
        const groupedByPatient = {};
        (filteredReports || []).forEach(report => {
          const key = report.patientId || report.patientName || 'unknown';
          if (!groupedByPatient[key]) {
            groupedByPatient[key] = {
              patientName: report.patientName,
              patientId: report.patientId,
              patientUid: report.patientUid,
              clinicName: report.clinicName,
              clinicId: report.clinicId,
              reports: [],
              latestUpload: report.createdAt
            };
          }
          groupedByPatient[key].reports.push(report);
          if (new Date(report.createdAt) > new Date(groupedByPatient[key].latestUpload)) {
            groupedByPatient[key].latestUpload = report.createdAt;
          }
        });
        const patientGroups = Object.values(groupedByPatient).sort((a, b) =>
          new Date(b.latestUpload) - new Date(a.latestUpload)
        );

        return (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Patients ({patientGroups.length}) &middot; Total Reports ({filteredReports.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Clinic</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reports</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Upload</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {patientGroups.map((group) => {
                    const isExpanded = expandedPatientId === (group.patientId || group.patientName);
                    return (
                      <React.Fragment key={group.patientId || group.patientName}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button onClick={() => handlePatientClick(group.reports[0])} className="text-left group">
                              <div className="text-sm font-medium text-[#323956] dark:text-blue-400 group-hover:text-blue-700 group-hover:underline cursor-pointer">
                                {group.patientName}
                              </div>
                              {group.patientUid && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">{group.patientUid}</div>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">{group.clinicName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {group.reports.length} {group.reports.length === 1 ? 'report' : 'reports'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {new Date(group.latestUpload).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handlePatientClick(group.reports[0])}
                                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-[#323956] text-white hover:bg-[#232D3C]"
                                title="View Patient Details"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && group.reports.map((report) => (
                          <tr key={report.id} className="bg-blue-50/50 dark:bg-blue-900/10">
                            <td className="px-6 py-3 pl-12" colSpan={1}>
                            </td>
                            <td className="px-6 py-3" colSpan={1}>
                              <div className="flex items-center">
                                <div className="h-8 w-8 rounded-lg bg-[#CAE0FF] dark:bg-blue-900/30 flex items-center justify-center">
                                  <FileText className="h-4 w-4 text-[#323956] dark:text-blue-400" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">{report.fileName}</div>
                                  <div className="text-xs text-gray-500">{report.title || 'Report'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <div className="text-xs text-gray-900">{getFileTypeDisplay(report)}</div>
                              {(() => {
                                const response = getResponseForReport(report.id);
                                return response ? (
                                  <div className="text-xs text-green-600 mt-1 flex items-center">
                                    <FileText className="h-3 w-3 mr-1" />
                                    Response: {response.fileName}
                                  </div>
                                ) : null;
                              })()}
                            </td>
                            <td className="px-6 py-3">
                              <div className="text-xs text-gray-600">
                                {new Date(report.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                              </div>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button onClick={() => handleUploadResponse(report)} className="text-[#323956] hover:text-green-900" title="Upload Response">
                                  <Upload className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDownloadReport(report)} className="text-[#323956] hover:text-blue-900" title="Download">
                                  <Download className="h-4 w-4" />
                                </button>
                                <button onClick={() => handleDeleteReport(report.id)} className="text-red-600 hover:text-red-900" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {patientGroups.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">
                    {searchTerm || selectedClinic || selectedPatient
                      ? 'No reports match your filters'
                      : 'No reports uploaded yet'
                    }
                  </p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium"
                  >
                    Upload First Report
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Upload Modal */}
      {showUploadModal && (
        <ErrorBoundary>
          <UploadReportModal
            onSubmit={handleUploadReport}
            onClose={() => {
              setShowUploadModal(false);
              setSelectedFile(null);
              setSelectedOtherDocFile(null);
              setUploadProgress(0);
            }}
            clinics={clinics || []}
            patients={formPatients || []}
            register={register}
            handleSubmit={handleSubmit}
            reset={reset}
            watch={watch}
            errors={errors || {}}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            uploadingFile={uploadingFile}
            uploadProgress={uploadProgress}
            selectedOtherDocFile={selectedOtherDocFile}
            onOtherDocFileSelect={handleOtherDocFileSelect}
          />
        </ErrorBoundary>
      )}

      {/* Response Upload Modal */}
      {showResponseUploadModal && selectedReportForResponse && (
        <ErrorBoundary>
          <ResponseUploadModal
            onSubmit={handleSubmitResponse}
            onClose={() => {
              setShowResponseUploadModal(false);
              setSelectedReportForResponse(null);
              setSelectedFile(null);
              setSelectedOtherDocFile(null);
              setUploadProgress(0);
            }}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            uploadingFile={uploadingFile}
            uploadProgress={uploadProgress}
            originalReport={selectedReportForResponse}
            selectedOtherDocFile={selectedOtherDocFile}
            onOtherDocFileSelect={handleOtherDocFileSelect}
          />
        </ErrorBoundary>
      )}

      {/* Report View Modal for Super Admin */}
      {showViewModal && selectedReportForView && (
        <ReportViewModal
          report={selectedReportForView}
          onClose={() => {
            setShowViewModal(false);
            setSelectedReportForView(null);
          }}
        />
      )}

      {showPatientDetailModal && selectedPatientForDetail && (
        <PatientDetailModal
          patient={selectedPatientForDetail}
          reports={reports}
          clinics={clinics}
          onClose={() => {
            setShowPatientDetailModal(false);
            setSelectedPatientForDetail(null);
          }}
          onDownloadReport={handleDownloadReport}
        />
      )}

      {/* Response reports are now shown as a column in the main table */}

      {/* Subscription Popup - Only show for non-Super Admin users */}
      {user?.role !== 'super_admin' && (
        <SubscriptionPopup
          isOpen={showSubscriptionPopup}
          onClose={() => setShowSubscriptionPopup(false)}
          clinicId={superAdminSelectedClinic}
          currentUsage={clinicUsage[superAdminSelectedClinic] || 0}
          onSubscribe={handleSubscription}
          clinicInfo={{
            name: user?.clinicName || user?.name || 'Super Admin',
            email: user?.email || 'admin@neuro360.com',
            phone: user?.phone || ''
          }}
        />
      )}
    </div>
  );
};

// Patient Detail Modal Component - Comprehensive patient info for super admin
const PatientDetailModal = ({ patient, reports, clinics, onClose, onDownloadReport }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [clinicalReport, setClinicalReport] = useState(null);
  const [wellnessScores, setWellnessScores] = useState(null);
  const [clinicalDocuments, setClinicalDocuments] = useState([]);
  const [loadingClinical, setLoadingClinical] = useState(false);
  const [loadingWellness, setLoadingWellness] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentsFetched, setDocumentsFetched] = useState(false);
  const [scanReportCount, setScanReportCount] = useState(null);

  // Fetch real-time scan report count from database
  useEffect(() => {
    const fetchScanCount = async () => {
      if (!patient?.id) return;
      try {
        // Try patient_id column (Supabase snake_case)
        const { count: count1, error: err1 } = await supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('patient_id', patient.id);

        if (!err1 && count1 !== null) {
          setScanReportCount(count1);
          return;
        }

        // Fallback: count from local reports prop
        const localCount = (reports || []).filter(r =>
          r.patientId === patient.id || r.patient_id === patient.id
        ).length;
        setScanReportCount(localCount);
      } catch (err) {
        // Fallback to local reports count
        const localCount = (reports || []).filter(r =>
          r.patientId === patient.id || r.patient_id === patient.id
        ).length;
        setScanReportCount(localCount);
      }
    };
    fetchScanCount();
  }, [patient?.id, reports]);

  const getAge = (dob) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  useEffect(() => {
    if ((activeTab === 'clinical' || activeTab === 'documents') && !clinicalReport && patient?.id) fetchClinicalReport();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'brain' && !wellnessScores && patient?.id) fetchWellnessScores();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'documents' && !documentsFetched && patient?.id) fetchAllDocuments();
  }, [activeTab]);

  const fetchClinicalReport = async () => {
    setLoadingClinical(true);
    try {
      const { data } = await supabase
        .from('clinical_reports')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) setClinicalReport(data[0]);
    } catch (err) {
      console.error('Error fetching clinical report:', err);
    } finally {
      setLoadingClinical(false);
    }
  };

  const fetchWellnessScores = async () => {
    setLoadingWellness(true);
    try {
      const { data } = await supabase
        .from('wellness_scores')
        .select('*')
        .eq('patient_id', patient.id)
        .order('assessment_date', { ascending: false })
        .limit(1);
      if (data && data.length > 0) setWellnessScores(data[0]);
    } catch (err) {
      console.error('Error fetching wellness scores:', err);
    } finally {
      setLoadingWellness(false);
    }
  };

  const fetchAllDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const allDocs = [];

      // 1. Fetch from clinical_documentation table (PatientManagement uploads)
      const { data: clinDocData } = await supabase
        .from('clinical_documentation')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false });

      if (clinDocData && clinDocData.length > 0) {
        const typeLabels = {
          mentalStatus: 'Mental Status / Cognitive Assessment',
          neuroExam: 'Neurological Examination Findings',
          psychiatricScales: 'Psychiatric / Behavioral Scales',
          otherReports: 'Other Clinical Reports',
          eyesOpenEdf: 'Eyes Open EDF Recording',
          eyesClosedEdf: 'Eyes Closed EDF Recording'
        };
        clinDocData.forEach(doc => {
          if (doc.file_urls && typeof doc.file_urls === 'object') {
            Object.entries(doc.file_urls).forEach(([key, fileInfo]) => {
              if (fileInfo && fileInfo.url) {
                allDocs.push({
                  type: key,
                  typeLabel: typeLabels[key] || fileInfo.documentTitle || fileInfo.documentType || key,
                  fileName: fileInfo.originalName || fileInfo.fileName || 'Document',
                  url: fileInfo.url,
                  path: fileInfo.path,
                  size: fileInfo.size,
                  documentType: fileInfo.documentType,
                  documentTitle: fileInfo.documentTitle,
                  uploadedBy: fileInfo.uploadedBy,
                  notes: fileInfo.notes,
                  uploadedAt: fileInfo.uploadedAt || doc.created_at,
                  source: 'clinical_documentation'
                });
              }
            });
          }
        });
      }

      // 2. Fetch from clinical_reports table (ClinicalReportForm uploads)
      const { data: clinRepData } = await supabase
        .from('clinical_reports')
        .select('id, created_at, uploaded_documents')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false });

      if (clinRepData && clinRepData.length > 0) {
        clinRepData.forEach(report => {
          if (report.uploaded_documents && Array.isArray(report.uploaded_documents)) {
            report.uploaded_documents.forEach(doc => {
              allDocs.push({
                ...doc,
                typeLabel: doc.type || 'Clinical Document',
                uploadedAt: doc.uploadedAt || report.created_at,
                source: 'clinical_reports'
              });
            });
          }
        });
      }

      setClinicalDocuments(allDocs);
      setDocumentsFetched(true);
    } catch (err) {
      console.error('Error fetching all documents:', err);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const getBrainParamsFromReports = () => {
    const pReports = (reports || []).filter(r => r.patientId === patient.id || r.patient_id === patient.id);
    for (const r of pReports) {
      const rd = r.reportData || r.report_data;
      if (rd?.brainParameters) return rd.brainParameters;
    }
    return null;
  };

  const patientReports = (reports || []).filter(r =>
    (r.patientId === patient.id || r.patient_id === patient.id) &&
    r.reportData?.source !== 'clinic_upload'
  );
  const patientClinic = clinics?.find(c => c.id === (patient.clinicId || patient.clinic_id || patient.org_id));
  const clinicName = patient.clinicName || patientClinic?.name || 'Unknown Clinic';
  const clinicAddress = patientClinic?.address || patientClinic?.clinic_address || patient.clinicAddress || 'N/A';

  const renderCheckList = (data, labels) => {
    if (!data || typeof data !== 'object') return <p className="text-gray-400 text-sm">No data available</p>;
    const items = Object.entries(data).filter(([k, v]) => k !== 'other' && v === true).map(([k]) => labels[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()));
    if (items.length === 0 && !data.other) return <p className="text-gray-400 text-sm">None reported</p>;
    return (
      <div>
        {items.length > 0 && <div className="flex flex-wrap gap-2">{items.map((item, i) => <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">{item}</span>)}</div>}
        {data.other && <p className="text-sm text-gray-700 mt-2"><span className="font-medium">Other:</span> {typeof data.other === 'string' ? data.other : JSON.stringify(data.other)}</p>}
      </div>
    );
  };

  const complaintLabels = { headaches: 'Headaches/Migraines', seizures: 'Seizures', dizziness: 'Dizziness/Balance', attention: 'Attention/Concentration', memory: 'Memory Issues', sleep: 'Sleep Disturbances', anxiety: 'Anxiety', depression: 'Depression', irritability: 'Irritability', fatigue: 'Fatigue' };
  const historyLabels = { neurological: 'Neurological', psychiatric: 'Psychiatric', cardiovascular: 'Cardiovascular', endocrine: 'Endocrine/Metabolic', chronicPain: 'Chronic Pain' };
  const medLabels = { antidepressants: 'Antidepressants', anxiolytics: 'Anxiolytics', antipsychotics: 'Antipsychotics', moodStabilizers: 'Mood Stabilizers', antiepileptics: 'Antiepileptics', stimulants: 'Stimulants', sleepAids: 'Sleep Aids' };
  const famLabels = { epilepsy: 'Epilepsy', dementia: 'Dementia', adhd: 'ADHD', moodDisorders: 'Mood Disorders', anxiety: 'Anxiety/OCD', substanceAbuse: 'Substance Abuse' };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'clinical', label: 'Clinical Report', icon: FileText },
    { id: 'brain', label: 'Brain Parameters', icon: Brain },
    { id: 'documents', label: 'Documents', icon: FileText }
  ];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-xl flex-shrink-0">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center mr-3">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{patient.fullName || patient.full_name || patient.name || 'Unknown'}</h3>
              <p className="text-sm text-blue-200">{patient.patient_uid || patient.external_id || ''} {clinicName && `| ${clinicName}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1.5 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 bg-gray-50 flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.id ? 'border-[#323956] text-[#323956]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <tab.icon className="h-4 w-4 mr-1.5" />{tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="bg-[#E4EFFF] rounded-lg p-4">
                <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center"><User className="h-4 w-4 mr-2" />Personal Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium text-gray-600">Full Name:</span> <span className="text-gray-900">{patient.fullName || patient.full_name || patient.name || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-600">Patient ID:</span> <span className="text-gray-900">{patient.patient_uid || patient.external_id || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-600">Age:</span> <span className="text-gray-900">{getAge(patient.dateOfBirth || patient.date_of_birth)}</span></div>
                  <div><span className="font-medium text-gray-600">Gender:</span> <span className="text-gray-900 capitalize">{patient.gender || 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-600">Date of Birth:</span> <span className="text-gray-900">{(patient.dateOfBirth || patient.date_of_birth) ? new Date(patient.dateOfBirth || patient.date_of_birth).toLocaleDateString() : 'N/A'}</span></div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center"><Mail className="h-4 w-4 mr-2" />Contact Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center"><Mail className="h-3.5 w-3.5 mr-2 text-gray-400" /><span className="font-medium text-gray-600 mr-1">Email:</span> {patient.email || 'N/A'}</div>
                  <div className="flex items-center"><Phone className="h-3.5 w-3.5 mr-2 text-gray-400" /><span className="font-medium text-gray-600 mr-1">Phone:</span> {patient.phone ? `${patient.countryCode || patient.country_code || '+91'} ${patient.phone}` : 'N/A'}</div>
                  <div className="col-span-2 flex items-center"><MapPin className="h-3.5 w-3.5 mr-2 text-gray-400" /><span className="font-medium text-gray-600 mr-1">Address:</span> {patient.address || 'N/A'}</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center"><Home className="h-4 w-4 mr-2" />Clinic & Registration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium text-gray-600">Clinic:</span> <span className="text-gray-900">{clinicName}</span></div>
                  <div><span className="font-medium text-gray-600">Joined:</span> <span className="text-gray-900">{(patient.createdAt || patient.created_at) ? new Date(patient.createdAt || patient.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : 'N/A'}</span></div>
                  <div><span className="font-medium text-gray-600">Scan Reports:</span> <span className="text-gray-900">{scanReportCount !== null ? scanReportCount : '...'}</span></div>
                  <div><span className="font-medium text-gray-600">Clinic Address:</span> <span className="text-gray-900">{clinicAddress}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Clinical Report Tab */}
          {activeTab === 'clinical' && (
            <div className="space-y-4">
              {loadingClinical ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#323956]" /><span className="ml-3 text-gray-600">Loading clinical report...</span></div>
              ) : clinicalReport ? (
                <>
                  <div className="bg-[#E4EFFF] rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-[#323956] mb-2">Patient Details</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                      <div><span className="font-medium text-gray-600">Name:</span> {clinicalReport.full_name}</div>
                      <div><span className="font-medium text-gray-600">Gender:</span> <span className="capitalize">{clinicalReport.gender}</span></div>
                      <div><span className="font-medium text-gray-600">Handedness:</span> <span className="capitalize">{clinicalReport.handedness || 'N/A'}</span></div>
                      <div><span className="font-medium text-gray-600">Occupation:</span> {clinicalReport.occupation || 'N/A'}</div>
                      <div><span className="font-medium text-gray-600">Test Date:</span> {clinicalReport.date_of_test ? new Date(clinicalReport.date_of_test).toLocaleDateString() : 'N/A'}</div>
                      <div><span className="font-medium text-gray-600">Referring Dr:</span> {clinicalReport.referring_physician || 'N/A'}</div>
                    </div>
                    {clinicalReport.referral_reason && <div className="mt-2 text-sm"><span className="font-medium text-gray-600">Referral Reason:</span> {clinicalReport.referral_reason}</div>}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Presenting Complaints</h4>
                    {renderCheckList(clinicalReport.presenting_complaints, complaintLabels)}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Past Medical History</h4>
                    {renderCheckList(clinicalReport.past_medical_history, historyLabels)}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Medications</h4>
                    {renderCheckList(clinicalReport.medications, medLabels)}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Family History</h4>
                    {renderCheckList(clinicalReport.family_history, famLabels)}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Lifestyle Factors</h4>
                    {(() => {
                      const ls = clinicalReport.lifestyle;
                      if (!ls) return <p className="text-gray-400 text-sm">No lifestyle data</p>;
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                          {ls.sleepQuality && <div><span className="font-medium">Sleep Quality:</span> {ls.sleepQuality}</div>}
                          {ls.sleepHours && <div><span className="font-medium">Sleep Hours:</span> {ls.sleepHours}</div>}
                          {ls.exerciseFrequency && <div><span className="font-medium">Exercise:</span> {ls.exerciseFrequency}</div>}
                          {ls.caffeineIntake && <div><span className="font-medium">Caffeine:</span> {ls.caffeineIntake}</div>}
                          {ls.stressLevel && <div><span className="font-medium">Stress:</span> {ls.stressLevel}</div>}
                          {ls.screenTime && <div><span className="font-medium">Screen Time:</span> {ls.screenTime}</div>}
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <div className="text-center py-12"><FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No clinical report found for this patient.</p></div>
              )}
            </div>
          )}

          {/* Brain Parameters Tab */}
          {activeTab === 'brain' && (
            <div className="space-y-4">
              {loadingWellness ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#323956]" /><span className="ml-3 text-gray-600">Loading brain parameters...</span></div>
              ) : (
                <>
                  {wellnessScores && (
                    <div className="bg-[#E4EFFF] rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center"><Brain className="h-4 w-4 mr-2" />Wellness Scores</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Cognition', value: wellnessScores.cognition_score },
                          { label: 'Stress', value: wellnessScores.stress_score },
                          { label: 'Focus', value: wellnessScores.focus_attention_score },
                          { label: 'Burnout', value: wellnessScores.burnout_fatigue_score },
                          { label: 'Emotional', value: wellnessScores.emotional_regulation_score },
                          { label: 'Learning', value: wellnessScores.learning_score },
                          { label: 'Creativity', value: wellnessScores.creativity_score },
                          { label: 'Overall', value: wellnessScores.overall_score }
                        ].map(p => (
                          <div key={p.label} className="bg-white rounded-lg p-3 text-center border border-blue-200">
                            <div className="text-xs font-medium text-gray-500 mb-1">{p.label}</div>
                            <div className={`text-xl font-bold ${p.value == null ? 'text-gray-400' : p.value >= 70 ? 'text-green-600' : p.value >= 40 ? 'text-orange-500' : 'text-red-500'}`}>
                              {p.value != null ? parseFloat(p.value).toFixed(1) : 'N/A'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const bp = getBrainParamsFromReports();
                    if (!bp && !wellnessScores) return <div className="text-center py-12"><Brain className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No brain parameters available.</p></div>;
                    if (!bp || !Array.isArray(bp) || bp.length === 0) return null;
                    return (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center"><Brain className="h-4 w-4 mr-2" />Report Brain Parameters</h4>
                        <div className="space-y-2">
                          {bp.map((param, i) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                              <div className="text-sm font-medium text-gray-900">{param.name}</div>
                              <div className="text-right">
                                <span className={`text-lg font-bold ${param.status === 'normal' ? 'text-green-600' : param.status === 'borderline' ? 'text-orange-500' : 'text-red-500'}`}>
                                  {param.value || param.score || '--'}
                                </span>
                                <span className={`ml-2 text-xs capitalize ${param.status === 'normal' ? 'text-green-500' : param.status === 'borderline' ? 'text-orange-400' : 'text-red-400'}`}>
                                  {param.status || ''}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-5">
              {loadingDocuments ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#323956]" /><span className="ml-3 text-gray-600">Loading documents...</span></div>
              ) : (
                <>
                  {/* Clinic Uploaded Documents */}
                  {clinicalDocuments.filter(d => d.documentType).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center">
                        <UploadCloud className="h-4 w-4 mr-2" />Clinic Uploaded Documents
                      </h4>
                      <div className="space-y-2">
                        {clinicalDocuments.filter(d => d.documentType).map((doc, idx) => (
                          <div key={`clinic-upload-${idx}`} className="flex items-center justify-between bg-[#E4EFFF] rounded-lg p-4 border border-blue-200 hover:border-[#323956] transition-colors">
                            <div className="flex items-center min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-[#323956] flex items-center justify-center mr-3 flex-shrink-0">
                                <FileText className="h-5 w-5 text-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{doc.fileName || 'Document'}</div>
                                <div className="text-xs text-[#323956] font-medium">{doc.documentTitle || doc.documentType || 'Document'}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {doc.uploadedBy && <span>Uploaded by: {doc.uploadedBy} | </span>}
                                  {doc.size && <span>{(doc.size / (1024 * 1024)).toFixed(2)} MB | </span>}
                                  {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : ''}
                                </div>
                                {doc.notes && <div className="text-xs text-gray-400 mt-0.5 italic">Note: {doc.notes}</div>}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 flex-shrink-0">
                              {doc.url && (
                                <>
                                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[#323956] hover:text-blue-700 p-2 rounded-lg hover:bg-white transition-colors" title="View">
                                    <Eye className="h-4 w-4" />
                                  </a>
                                  <a href={doc.url} download className="text-[#323956] hover:text-blue-700 p-2 rounded-lg hover:bg-white transition-colors" title="Download">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clinical Examination Documents */}
                  {clinicalDocuments.filter(d => !d.documentType).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />Clinical Examination Documents
                      </h4>
                      <div className="space-y-2">
                        {clinicalDocuments.filter(d => !d.documentType).map((doc, idx) => {
                          const typeLabelsMap = {
                            mentalStatus: 'Mental Status / Cognitive Assessment',
                            neuroExam: 'Neurological Examination Findings',
                            psychiatricScales: 'Psychiatric / Behavioral Scales',
                            otherReports: 'Other Clinical Reports',
                            eyesOpenEdf: 'Eyes Open EDF Recording',
                            eyesClosedEdf: 'Eyes Closed EDF Recording'
                          };
                          return (
                            <div key={`clinical-doc-${idx}`} className="flex items-center justify-between bg-[#E4EFFF] rounded-lg p-4 border border-blue-200 hover:border-[#323956] transition-colors">
                              <div className="flex items-center min-w-0">
                                <div className="h-10 w-10 rounded-lg bg-[#323956] flex items-center justify-center mr-3 flex-shrink-0">
                                  <FileText className="h-5 w-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{doc.fileName || 'Document'}</div>
                                  <div className="text-xs text-gray-600">{doc.typeLabel || typeLabelsMap[doc.type] || doc.type || 'Clinical Document'}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : ''}
                                  </div>
                                </div>
                              </div>
                              {doc.url && (
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[#323956] hover:text-blue-700 p-2 rounded-lg hover:bg-white transition-colors flex-shrink-0" title="Download">
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Neurosense Reports (Admin uploaded) */}
                  {patientReports.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center">
                        <FileText className="h-4 w-4 mr-2" />Brain Wellness Reports
                      </h4>
                      <div className="space-y-2">
                        {patientReports.map(report => (
                          <div key={report.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-[#CAE0FF] transition-colors">
                            <div className="flex items-center min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-[#CAE0FF] flex items-center justify-center mr-3 flex-shrink-0">
                                <FileText className="h-5 w-5 text-[#323956]" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{report.fileName}</div>
                                <div className="text-xs text-gray-500">{report.title || 'Report'} | {new Date(report.createdAt || report.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}</div>
                                {report.storedInCloud && <div className="text-xs text-[#323956] flex items-center mt-0.5"><Cloud className="h-3 w-3 mr-1" />Cloud Storage</div>}
                              </div>
                            </div>
                            <button onClick={() => onDownloadReport(report)} className="text-[#323956] hover:text-blue-700 p-2 rounded-lg hover:bg-[#E4EFFF] transition-colors flex-shrink-0" title="Download">
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {patientReports.length === 0 && clinicalDocuments.length === 0 && (
                    <div className="text-center py-12"><FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No documents uploaded for this patient.</p></div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 bg-[#323956] text-white rounded-lg text-sm font-medium hover:bg-[#252b45] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

// Response Upload Modal Component
const ResponseUploadModal = ({
  onSubmit,
  onClose,
  selectedFile,
  onFileSelect,
  uploadingFile,
  uploadProgress,
  originalReport,
  selectedOtherDocFile,
  onOtherDocFileSelect
}) => {
  const [notes, setNotes] = useState('');
  const [uploadedByName, setUploadedByName] = useState('');
  const [otherDocTitle, setOtherDocTitle] = useState('');
  const [otherDocNotes, setOtherDocNotes] = useState('');

  // Safety check for originalReport
  if (!originalReport) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-red-600">Error</h3>
            <button onClick={onClose || (() => {})} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>
          <p className="text-gray-700 mb-4">Original report data is missing. Please try again.</p>
          <button onClick={onClose || (() => {})} className="bg-red-600 text-white px-4 py-2 rounded">Close</button>
        </div>
      </div>
    );
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit({ notes, uploadedByName, otherDocTitle, otherDocNotes });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="relative my-8 w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h3 className="text-xl font-semibold text-gray-900">Upload Response Report</h3>
          <button
            onClick={onClose || (() => {})}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {/* Original Report Info */}
          <div className="bg-[#E4EFFF] border border-blue-200 rounded-lg p-4 mb-5">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Original Report</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-blue-700">
              <p><strong>Patient:</strong> {originalReport.patientName || 'Unknown Patient'}</p>
              <p><strong>Clinic:</strong> {originalReport.clinicName || 'Unknown Clinic'}</p>
              <p><strong>Report:</strong> {originalReport.fileName || 'Unknown Report'}</p>
              <p><strong>Date:</strong> {originalReport.createdAt ? new Date(originalReport.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : 'Unknown Date'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Section 1: NeuroSense Response Report */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
              <h4 className="text-sm font-semibold text-[#323956] mb-3 flex items-center">
                <UploadCloud className="h-4 w-4 mr-2 text-[#323956]" />
                Brain Wellness Response Report <span className="text-red-500 ml-1">*</span>
              </h4>

              <div className={`flex justify-center px-5 pt-4 pb-4 border-2 border-dashed rounded-lg transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-50 ${
                selectedFile ? 'border-green-400 bg-green-50' : 'border-blue-300 bg-white'
              }`}>
                <div className="space-y-2 text-center">
                  {selectedFile ? (
                    <>
                      <Cloud className="mx-auto h-9 w-9 text-green-600" />
                      <div className="text-sm text-gray-800">
                        <p className="font-medium truncate max-w-[280px]">{selectedFile.name || 'Unknown file'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {((selectedFile.size || 0) / (1024 * 1024)).toFixed(2)} MB &bull; {selectedFile.type || 'Unknown type'}
                        </p>
                      </div>
                      {uploadingFile && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                          <div className="bg-[#323956] h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                      )}
                      <button type="button" onClick={() => onFileSelect && onFileSelect({ target: { files: [] } })} className="text-xs text-red-500 hover:text-red-700 font-medium mt-1">
                        Remove file
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="mx-auto h-9 w-9 text-blue-400" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="response-file-upload" className="relative cursor-pointer font-medium text-blue-600 hover:text-blue-500 hover:underline">
                          <span>Click to upload</span>
                          <input id="response-file-upload" name="response-file-upload" type="file" className="sr-only" accept=".pdf,.jpeg,.jpg,.png,.doc,.docx,.edf,.csv,.txt,.xml,.json,.xlsx,.xls,.dcm" onChange={onFileSelect || (() => {})} />
                        </label>
                        <span className="pl-1">or drag and drop</span>
                      </div>
                      <p className="text-xs text-gray-400">PDF, JPEG, PNG, DOC, DOCX, EDF, CSV, TXT, XML, JSON, XLSX, DICOM</p>
                    </>
                  )}
                </div>
              </div>
              {!selectedFile && <p className="text-red-500 text-xs mt-1.5">Please select a response file to upload</p>}

              <div className="mt-3">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Response report title or description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Section 2: Other Document (Optional - Clinic Only) */}
            <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/30">
              <h4 className="text-sm font-semibold text-amber-900 mb-1 flex items-center">
                <FileText className="h-4 w-4 mr-2 text-amber-600" />
                Other Document <span className="text-gray-400 font-normal ml-1">(Optional - Clinic Only)</span>
              </h4>
              <p className="text-xs text-amber-700 mb-3">
                This document will only be visible to the clinic, not to patients.
              </p>

              <div className={`flex justify-center px-5 pt-4 pb-4 border-2 border-dashed rounded-lg transition-all cursor-pointer hover:border-amber-400 hover:bg-amber-50 ${
                selectedOtherDocFile ? 'border-green-400 bg-green-50' : 'border-amber-300 bg-white'
              }`}>
                <div className="space-y-1 text-center">
                  {selectedOtherDocFile ? (
                    <>
                      <Cloud className="mx-auto h-9 w-9 text-green-600" />
                      <div className="text-sm text-gray-800">
                        <p className="font-medium truncate max-w-[250px]">{selectedOtherDocFile.name}</p>
                        <p className="text-xs text-gray-500">{((selectedOtherDocFile.size || 0) / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <button type="button" onClick={() => onOtherDocFileSelect && onOtherDocFileSelect({ target: { files: [] } })} className="text-xs text-red-500 hover:text-red-700 font-medium">
                        Remove file
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="mx-auto h-9 w-9 text-amber-400" />
                      <div className="text-sm text-gray-600">
                        <label htmlFor="response-other-doc-upload" className="relative cursor-pointer font-medium text-amber-600 hover:text-amber-500 hover:underline">
                          <span>Click to upload</span>
                          <input id="response-other-doc-upload" type="file" className="sr-only" accept=".pdf,.jpeg,.jpg,.png,.doc,.docx,.edf,.csv,.txt,.xml,.json,.xlsx,.xls,.dcm" onChange={onOtherDocFileSelect || (() => {})} />
                        </label>
                        <span className="pl-1">other document</span>
                      </div>
                      <p className="text-xs text-gray-400">PDF, JPEG, PNG, DOC, DOCX, etc.</p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <input
                  type="text"
                  value={otherDocTitle}
                  onChange={(e) => setOtherDocTitle(e.target.value)}
                  placeholder="Document title or description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Common: Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Notes
              </label>
              <textarea
                value={otherDocNotes}
                onChange={(e) => setOtherDocNotes(e.target.value)}
                rows="2"
                placeholder="Add any additional notes..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose || (() => {})}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingFile || !selectedFile}
                className="px-5 py-2.5 bg-[#323956] border border-transparent rounded-lg text-sm font-medium text-white hover:bg-[#252b45] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-colors"
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading... ({uploadProgress}%)
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload Response
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Upload Report Modal Component
const UploadReportModal = ({
  onSubmit,
  onClose,
  clinics,
  patients,
  register,
  handleSubmit,
  reset,
  watch,
  errors,
  selectedFile,
  onFileSelect,
  uploadingFile,
  uploadProgress,
  selectedOtherDocFile,
  onOtherDocFileSelect
}) => {
  // Safety check to prevent crashes
  if (!register || !handleSubmit || !watch) {
    console.error('ERROR: UploadReportModal: Missing required form props');
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <h3 className="text-lg font-bold text-red-600 mb-4">Form Error</h3>
          <p className="text-gray-700 mb-4">Unable to load upload form. Please refresh the page and try again.</p>
          <button onClick={onClose || (() => {})} className="bg-red-600 text-white px-4 py-2 rounded">Close</button>
        </div>
      </div>
    );
  }
  const [availablePatients, setAvailablePatients] = useState([]);
  const [otherDocTitle, setOtherDocTitle] = useState('');
  const [otherDocNotes, setOtherDocNotes] = useState('');
  const [showBrainParams, setShowBrainParams] = useState(false);
  const [brainParams, setBrainParams] = useState({
    cognition: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    stress: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    focus: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    burnout: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    emotional: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    learning: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
    creativity: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 }
  });
  const watchedClinic = watch('clinicId');

  useEffect(() => {
    const loadPatients = async () => {
      if (watchedClinic) {
        try {
          const clinicPatients = await DatabaseService.getPatientsByClinic(watchedClinic);
          setAvailablePatients(clinicPatients || []);
        } catch (error) {
          console.error('ERROR: Error loading patients for clinic:', error);
          setAvailablePatients([]);
        }
      } else {
        setAvailablePatients([]);
      }
    };
    
    loadPatients();
  }, [watchedClinic]);

  // Convert brainParams state to array format for database
  const formatBrainParameters = () => {
    const paramNames = {
      cognition: 'Cognition',
      stress: 'Stress',
      focus: 'Focus + Attention',
      burnout: 'Burnout & Fatigue',
      emotional: 'Emotional Regulation',
      learning: '[+ Under 18] Learning',
      creativity: 'Creativity'
    };

    const descriptions = {
      cognition: 'Cognition refers to mental processes like thinking, memory, and problem-solving. Good cognitive health supports daily functioning and quality of life.',
      stress: 'Stress is the body\'s response to challenges. Chronic stress can affect mental and physical health, impacting mood, sleep, and overall well-being.',
      focus: 'Focus and attention involve the ability to concentrate on tasks. Strong attention skills support productivity, learning, and daily activities.',
      burnout: 'Burnout and fatigue result from prolonged stress or overwork. Managing these is essential for maintaining energy levels and preventing exhaustion.',
      emotional: 'Emotional regulation is the ability to manage and respond to emotions effectively. Good emotional regulation supports mental health and relationships.',
      learning: 'Learning capacity is crucial for development in young individuals. It involves acquiring knowledge, skills, and adapting to new information.',
      creativity: 'Creativity involves generating new ideas and solutions. It supports innovation, problem-solving, and personal expression.'
    };

    const statusLabels = {
      normal: 'Normal',
      high: 'High',
      low: 'Low',
      borderline: 'Borderline'
    };

    const rangeLabels = {
      normal: 'Normal Range',
      high: 'Higher Than Normal',
      low: 'Lower Than Normal',
      borderline: 'Borderline'
    };

    return Object.keys(brainParams).map((key, index) => {
      const param = brainParams[key];
      // Only include if value is provided
      if (!param.value) return null;

      return {
        id: index + 1,
        name: paramNames[key],
        value: param.value,
        unit: 'Score',
        status: param.status,
        range: rangeLabels[param.status] || 'Normal Range',
        description: descriptions[key],
        normal: parseInt(param.normal) || 0,
        borderline: parseInt(param.borderline) || 0,
        abnormal: parseInt(param.abnormal) || 0,
        score: param.score || '--',
        scoreLabel: statusLabels[param.status] || 'Normal',
        subParameters: []
      };
    }).filter(Boolean);
  };

  const handleFormSubmit = (data) => {
    try {
      console.log('Selected file:', selectedFile ? {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      } : 'No file selected');

      // Add brain parameters to data
      const brainParametersData = formatBrainParameters();
      if (brainParametersData.length > 0) {
        data.brainParameters = brainParametersData;
      }

      // Add other document metadata
      if (selectedOtherDocFile) {
        data.otherDocTitle = otherDocTitle || selectedOtherDocFile.name;
        data.otherDocNotes = otherDocNotes;
      }

      onSubmit(data);
      reset();
      setBrainParams({
        cognition: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        stress: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        focus: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        burnout: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        emotional: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        learning: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 },
        creativity: { value: '', status: 'normal', score: '', normal: 0, borderline: 0, abnormal: 0 }
      });
      setOtherDocTitle('');
      setOtherDocNotes('');
    } catch (error) {
      console.error('ERROR: Form submission error:', error);
      toast.error(getFriendlyErrorMessage(error, 'Form submission failed. Please check the details and try again.'));
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white rounded-t-xl flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">Upload Brain Wellness Report</h3>
          <button
            onClick={onClose || (() => {})}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Clinic & Patient Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Select Clinic <span className="text-red-500">*</span>
              </label>
              <select
                {...register('clinicId', { required: 'Please select a clinic' })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white text-sm"
              >
                <option value="">Choose a clinic...</option>
                {clinics.map(clinic => (
                  <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                ))}
              </select>
              {errors.clinicId && <p className="text-red-500 text-xs mt-1">{errors.clinicId.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Select Patient <span className="text-red-500">*</span>
              </label>
              <select
                {...register('patientId', { required: 'Please select a patient' })}
                disabled={!watchedClinic}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-sm"
              >
                <option value="">
                  {!watchedClinic ? 'Select clinic first...' : 'Choose a patient...'}
                </option>
                {(availablePatients || []).map(patient => (
                  <option key={patient?.id || Math.random()} value={patient?.id || ''}>{patient?.fullName || patient?.full_name || patient?.name || 'Unnamed Patient'}</option>
                ))}
              </select>
              {errors.patientId && <p className="text-red-500 text-xs mt-1">{errors.patientId.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Report Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('title', { required: 'Please enter a report title' })}
              placeholder={selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, "") : "e.g., EEG Analysis Report"}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Uploaded By <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('uploadedByName', { required: 'Please enter uploader name' })}
              placeholder="Enter your name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            />
            {errors.uploadedByName && <p className="text-red-500 text-xs mt-1">{errors.uploadedByName.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
              <UploadCloud className="h-4 w-4 mr-2 text-[#323956]" />
              Upload to Cloud Storage <span className="text-red-500 ml-1">*</span>
            </label>
            <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-all cursor-pointer hover:border-primary-400 hover:bg-gray-50 ${
              selectedFile ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50/50'
            }`}>
              <div className="space-y-2 text-center">
                {selectedFile ? (
                  <>
                    <Cloud className="mx-auto h-10 w-10 text-green-600" />
                    <div className="text-sm text-gray-800">
                      <p className="font-medium truncate max-w-[280px]">{selectedFile.name || 'Unknown file'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {((selectedFile.size || 0) / (1024 * 1024)).toFixed(2)} MB &bull; {selectedFile.type || 'Unknown type'}
                      </p>
                    </div>
                    {uploadingFile && (
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-[#323956] h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onFileSelect({ target: { files: [] } })}
                      className="text-xs text-red-500 hover:text-red-700 font-medium mt-1"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-gray-400" />
                    <div className="text-sm text-gray-600">
                      <label htmlFor="file-upload" className="relative cursor-pointer font-medium text-primary-600 hover:text-primary-500 hover:underline">
                        <span>Click to upload</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpeg,.jpg,.png,.edf,.csv,.txt,.xml,.json,.doc,.docx,.xlsx,.xls,.dcm"
                          onChange={onFileSelect}
                        />
                      </label>
                      <span className="pl-1">or drag and drop</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      PDF, JPEG, PNG, EDF, CSV, TXT, XML, JSON, DOC, DOCX, XLSX, DICOM                    </p>
                  </>
                )}
              </div>
            </div>
            {!selectedFile && <p className="text-red-500 text-xs mt-1.5">Please select a file to upload to Cloud Storage</p>}

            <div className="mt-2 text-xs text-gray-400 flex items-center">
              <Cloud className="h-3 w-3 mr-1 flex-shrink-0" />
              Files will be securely stored in Cloud Storage with encryption
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes
            </label>
            <textarea
              {...register('notes')}
              rows="3"
              placeholder="Additional notes about this report..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm resize-none"
            />
          </div>

          {/* Brain Parameters Section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowBrainParams(!showBrainParams)}
              className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700 flex items-center">
                <Brain className="h-4 w-4 mr-2 text-[#323956]" />
                Brain Parameters <span className="text-gray-400 font-normal ml-1">(Optional)</span>
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${showBrainParams ? 'rotate-180' : ''}`} />
            </button>

            {showBrainParams && (
              <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                {/* Cognition */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Cognition</label>
                  <input
                    type="text"
                    placeholder="Score (e.g., 85.50)"
                    value={brainParams.cognition.value}
                    onChange={(e) => setBrainParams({...brainParams, cognition: {...brainParams.cognition, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.cognition.status}
                    onChange={(e) => setBrainParams({...brainParams, cognition: {...brainParams.cognition, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Stress */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Stress</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.stress.value}
                    onChange={(e) => setBrainParams({...brainParams, stress: {...brainParams.stress, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.stress.status}
                    onChange={(e) => setBrainParams({...brainParams, stress: {...brainParams.stress, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Focus + Attention */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Focus</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.focus.value}
                    onChange={(e) => setBrainParams({...brainParams, focus: {...brainParams.focus, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.focus.status}
                    onChange={(e) => setBrainParams({...brainParams, focus: {...brainParams.focus, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Burnout & Fatigue */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Burnout</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.burnout.value}
                    onChange={(e) => setBrainParams({...brainParams, burnout: {...brainParams.burnout, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.burnout.status}
                    onChange={(e) => setBrainParams({...brainParams, burnout: {...brainParams.burnout, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Emotional Regulation */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Emotional</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.emotional.value}
                    onChange={(e) => setBrainParams({...brainParams, emotional: {...brainParams.emotional, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.emotional.status}
                    onChange={(e) => setBrainParams({...brainParams, emotional: {...brainParams.emotional, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Learning */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Learning</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.learning.value}
                    onChange={(e) => setBrainParams({...brainParams, learning: {...brainParams.learning, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.learning.status}
                    onChange={(e) => setBrainParams({...brainParams, learning: {...brainParams.learning, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                {/* Creativity */}
                <div className="grid grid-cols-3 gap-2 items-center">
                  <label className="text-xs font-medium text-gray-600">Creativity</label>
                  <input
                    type="text"
                    placeholder="Score"
                    value={brainParams.creativity.value}
                    onChange={(e) => setBrainParams({...brainParams, creativity: {...brainParams.creativity, value: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <select
                    value={brainParams.creativity.status}
                    onChange={(e) => setBrainParams({...brainParams, creativity: {...brainParams.creativity, status: e.target.value}})}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                    <option value="borderline">Borderline</option>
                  </select>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  Enter brain parameter scores from the report. These will be displayed to the patient.
                </p>
              </div>
            )}
          </div>

          {/* Other Document Upload (Optional) */}
          <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/50">
            <h4 className="text-sm font-medium text-amber-900 mb-1 flex items-center">
              <FileText className="h-4 w-4 mr-2 text-amber-600" />
              Upload Other Document <span className="text-gray-400 font-normal ml-1">(Optional - Clinic Only)</span>
            </h4>
            <p className="text-xs text-amber-700 mb-3">
              This document will only be visible to the clinic, not to patients.
            </p>

            <div className={`flex justify-center px-4 pt-4 pb-4 border-2 border-dashed rounded-lg transition-all cursor-pointer hover:border-amber-400 hover:bg-amber-50 ${
              selectedOtherDocFile ? 'border-green-400 bg-green-50' : 'border-amber-300 bg-white'
            }`}>
              <div className="space-y-1 text-center">
                {selectedOtherDocFile ? (
                  <>
                    <Cloud className="mx-auto h-8 w-8 text-green-600" />
                    <div className="text-sm text-gray-800">
                      <p className="font-medium truncate max-w-[250px]">{selectedOtherDocFile.name}</p>
                      <p className="text-xs text-gray-500">
                        {((selectedOtherDocFile.size || 0) / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOtherDocFileSelect({ target: { files: [] } })}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="mx-auto h-8 w-8 text-amber-400" />
                    <div className="text-sm text-gray-600">
                      <label htmlFor="other-doc-upload" className="relative cursor-pointer font-medium text-amber-600 hover:text-amber-500 hover:underline">
                        <span>Click to upload</span>
                        <input
                          id="other-doc-upload"
                          type="file"
                          className="sr-only"
                          accept=".pdf,.jpeg,.jpg,.png,.doc,.docx,.edf,.csv,.txt,.xml,.json,.xlsx,.xls,.dcm"
                          onChange={onOtherDocFileSelect}
                        />
                      </label>
                      <span className="pl-1">other document</span>
                    </div>
                    <p className="text-xs text-gray-400">PDF, JPEG, PNG, DOC, DOCX, etc.</p>
                  </>
                )}
              </div>
            </div>

            {selectedOtherDocFile && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={otherDocTitle}
                  onChange={(e) => setOtherDocTitle(e.target.value)}
                  placeholder="Document title (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <textarea
                  value={otherDocNotes}
                  onChange={(e) => setOtherDocNotes(e.target.value)}
                  rows="2"
                  placeholder="Notes about this document (optional)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            )}
          </div>

        </div>

          {/* Footer Buttons */}
          <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-white rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose || (() => {})}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadingFile || !selectedFile}
              className="px-5 py-2.5 bg-[#323956] border border-transparent rounded-lg text-sm font-medium text-white hover:bg-[#252d45] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-colors"
            >
              {uploadingFile ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading... ({uploadProgress}%)
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4 mr-2" />
                  Submit
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Report View Modal Component for Super Admin
const ReportViewModal = ({ report, onClose }) => {
  const [reportContent, setReportContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
     const [isFullView, setIsFullView] = useState(false);
   const [showPdfPreview, setShowPdfPreview] = useState(true); // Default to true to show PDF immediately

  useEffect(() => {
    if (report) {
      loadReportContent();
    }
  }, [report]);

  // Safety check - don't render if report is null
  if (!report) {
    return null;
  }

  const loadReportContent = async () => {
    if (!report) return;
    
    setLoading(true);
    setError(null);
    
    try {
      let content = null;
      let contentSource = 'not found';
      
      console.log('INFO: Report data:', {
        id: report.id,
        s3Key: report.s3Key,
        fileUrl: report.fileUrl,
        storedInCloud: report.storedInCloud
      });
      
      // Method 1: Try Supabase Storage with file_path
      const filePath = report.file_path || report.filePath || report.storagePath || report.s3Key;

      if (filePath) {
        try {

          // Import StorageService
          const { default: StorageService } = await import('../../services/storageService');

          // Get signed URL for the file
          const fileUrl = await StorageService.getSignedUrl(filePath, 3600); // 1 hour expiry

          if (fileUrl) {
            // For PDF files, we can embed them directly
            if (report.fileName?.toLowerCase().endsWith('.pdf')) {
              content = fileUrl; // Store the URL to display PDF
              contentSource = 'Supabase Storage PDF';
            } else {
              content = `URL Reference: ${fileUrl}`;
              contentSource = 'Supabase Storage';
            }
          }
        } catch (storageError) {
          console.warn('WARNING: Error fetching from Supabase Storage:', storageError);
          console.error('Storage error details:', storageError);
        }
      } else {
        console.warn('WARNING: No file path found in report data');
      }

      // Method 2: Try file URL if available
      if (!content && report.fileUrl) {
        try {
          content = `URL Reference: ${report.fileUrl}`;
          contentSource = 'File URL';
        } catch (urlError) {
          console.warn('WARNING: Error processing file URL:', urlError);
        }
      }

      // Method 3: Create informative message if no content found
      if (!content) {
        content = `No Content Available

Report: ${report.fileName || 'Unknown'}
Patient: ${report.patientName || 'Unknown Patient'}
Clinic: ${report.clinicName || 'Unknown Clinic'}
Upload Date: ${report.createdAt ? new Date(report.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : 'Unknown'}

Storage Information:
- S3 Key: ${report.s3Key || 'None'}
- File URL: ${report.fileUrl || 'None'}
- Storage Type: ${report.storedInCloud ? 'Cloud (Cloud Storage)' : 'Local'}
- File Size: ${report.fileSize || 'Unknown'}
- File Type: ${report.fileType || 'Unknown'}

Status: The report metadata exists but the actual file content could not be found.
This may happen if:
1. The file was not properly uploaded
2. The file was stored externally and is no longer accessible
3. There was an error during the upload process

Recommendation: Contact the clinic to re-upload this report.`;
        contentSource = 'No Content Message';
      }
      
      
      setReportContent(content);
      
      if (!content) {
        setError('Report content not found. File may have been moved or deleted.');
      }
    } catch (error) {
      console.error('ERROR: Error loading report content:', error);
      setError(getFriendlyErrorMessage(error, 'Failed to load the report content. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const toggleFullView = () => {
    setIsFullView(!isFullView);
  };

  return (
         <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
       <div className={`relative mx-auto border shadow-lg rounded-md bg-white ${
         isFullView 
           ? 'top-1 left-1 right-1 bottom-1 max-w-none h-[calc(100vh-0.5rem)] p-2' 
           : 'top-10 max-w-5xl p-5'
       }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <FileText className="h-5 w-5 mr-2 text-[#323956]" />
            Report Details - {report?.fileName || 'Unknown Report'}
          </h3>
          <div className="flex items-center space-x-2">
            {reportContent && (
              <button
                onClick={toggleFullView}
                className="text-[#323956] hover:text-blue-800 p-2 rounded-lg hover:bg-[#E4EFFF]"
                title={isFullView ? 'Exit Full View' : 'Full View'}
              >
                {isFullView ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            )}
            <button
              onClick={onClose || (() => {})}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Show details only in normal view */}
        {!isFullView && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Report Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center">
                  <FileText className="h-4 w-4 mr-2" />
                  Report Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">File Name:</span> {report?.fileName || 'N/A'}</div>
                  <div><span className="font-medium">Title:</span> {report?.title || 'N/A'}</div>
                  <div><span className="font-medium">Type:</span> {report?.reportType || 'EEG'}</div>
                  <div><span className="font-medium">Size:</span> {report?.fileSize || 'N/A'}</div>
                  <div><span className="font-medium">Uploaded:</span> {report?.createdAt ? new Date(report.createdAt).toLocaleString() : 'N/A'}</div>
                  <div><span className="font-medium">Uploaded by:</span> {report?.uploadedBy || 'N/A'}</div>
                </div>
              </div>

              {/* Patient & Clinic Information */}
              <div className="bg-[#E4EFFF] p-4 rounded-lg">
                <h4 className="text-md font-semibold text-blue-900 mb-3 flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Patient & Clinic Details
                </h4>
                <div className="space-y-2 text-sm text-blue-800">
                  <div><span className="font-medium">Patient:</span> {report?.patientName || 'Unknown Patient'}</div>
                  <div><span className="font-medium">Patient ID:</span> {report?.patientUid || 'N/A'}</div>
                  <div><span className="font-medium">Clinic:</span> {report?.clinicName || 'Unknown Clinic'}</div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {report?.notes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold text-yellow-900 mb-2">Notes</h4>
                <p className="text-sm text-yellow-800">{report.notes}</p>
              </div>
            )}
          </>
        )}

        {/* Report Content Preview */}
        <div className={`border rounded-lg p-4 mb-6 ${isFullView ? 'flex-1 flex flex-col' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-gray-900">
              {isFullView ? 'Full Report View' : 'Report Preview'}
            </h4>
            {reportContent && !isFullView && (
              <button
                onClick={toggleFullView}
                className="bg-[#323956] hover:bg-[#232D3C] text-white px-4 py-2 rounded-md flex items-center text-sm"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Full Size
              </button>
            )}
          </div>

          <div className={`bg-gray-100 rounded-lg p-6 ${isFullView ? 'flex-1 flex flex-col' : ''}`}>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading report content...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h5 className="text-lg font-medium text-red-900 mb-2">Unable to Load Report</h5>
                <p className="text-red-700 mb-4">{error}</p>
                <button
                  onClick={loadReportContent}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
                >
                  Retry
                </button>
              </div>
            ) : reportContent ? (
              <div className={`${isFullView ? 'flex-1 flex flex-col' : 'text-center py-8'}`}>
                {!isFullView && (
                  <>
                    <FileText className="h-16 w-16 text-[#323956] mx-auto mb-4" />
                    <h5 className="text-lg font-medium text-green-900 mb-2">Report Ready</h5>
                    <p className="text-green-700 mb-4">
                      Report content is available. Click "View Full Size" to see the complete document.
                    </p>
                    <div className="text-xs text-gray-500 bg-white p-2 rounded border max-w-md mx-auto mb-4">
                      <strong>Technical Info:</strong><br/>
                      Storage: {report?.s3Key ? 'Cloud Storage' : 'Local Storage'}<br/>
                      Content Type: {report?.fileType || 'application/pdf'}<br/>
                      Content Size: {reportContent?.length || 0} characters<br/>
                      Format: {reportContent?.startsWith('data:') ? 'Base64 Data' : reportContent?.startsWith('http') ? 'URL' : 'Raw Data'}
                    </div>
                  </>
                )}
                
                                 {/* Report Content Display */}
                 <div className={`${isFullView ? 'flex-1 flex flex-col' : 'mt-4'}`}>
                   {/* Hide header controls when showing PDF in full view */}
                   {!isFullView && (
                     <div className="flex items-center justify-between mb-2">
                       <h6 className="text-sm font-medium text-gray-900">Report Content</h6>
                       <div className="flex items-center space-x-3">
                         {/* PDF Preview Toggle */}
                         {(reportContent?.startsWith('data:application/pdf') || reportContent?.startsWith('http')) && (
                           <div className="flex items-center space-x-1">
                             <span className="text-xs text-gray-500">View:</span>
                             <button
                               onClick={() => setShowPdfPreview(!showPdfPreview)}
                               className={`text-xs px-2 py-0.5 rounded border ${
                                 showPdfPreview ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-700 border-gray-300'
                               }`}
                             >
                               {showPdfPreview ? 'Raw Data' : 'PDF View'}
                             </button>
                           </div>
                         )}

                         {/* Character Count */}
                         <div className="flex space-x-2 text-xs text-gray-500">
                           <span>Characters: {reportContent?.length || 0}</span>
                         </div>
                       </div>
                     </div>
                   )}
                   
                   {/* PDF Viewer */}
                   {(reportContent?.startsWith('data:application/pdf') || reportContent?.startsWith('http')) && showPdfPreview ? (
                     <div className={`border rounded-md bg-white ${
                       isFullView 
                         ? 'flex-1 min-h-[600px]' 
                         : 'h-96 min-h-[400px] max-h-[800px]'
                     }`}>
                       <iframe
                         src={reportContent?.startsWith('http') ? reportContent : `${reportContent}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&scrollbar=0&view=FitH`}
                         className="w-full h-full border-0 rounded-md"
                         title={`PDF Viewer - ${report?.fileName || 'Report'}`}
                         style={{
                           minHeight: isFullView ? '600px' : '400px',
                           height: '100%',
                           width: '100%'
                         }}
                       />
                     </div>
                   ) : (
                     /* Text/Data Display */
                     <textarea
                       value={(() => {
                         if (!reportContent) return 'No content available';
                         
                         // Handle different content types
                         if (reportContent.startsWith('data:application/pdf')) {
                           return `PDF REPORT CONTENT\n\n` +
                             `FILE: File: ${report?.fileName || 'Unknown Report'}\n` +
                             ` Patient: ${report?.patientName || 'Unknown Patient'}\n` +
                             `CLINIC: Clinic: ${report?.clinicName || 'Unknown Clinic'}\n` +
                             ` Date: ${report?.createdAt ? new Date(report.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : 'Unknown'}\n` +
                             `DATA: Size: ${reportContent.length} characters (Base64 encoded)\n\n` +
                             `INFO: REPORT TYPE: ${report?.reportType || 'Medical Report'}\n\n` +
                             `═══════════════════════════════════════════════════════\n\n` +
                             `DEBUG: PDF CONTENT PREVIEW:\n\n` +
                             `This is a PDF document containing medical report data.\n` +
                             `The PDF is properly encoded and stored in base64 format.\n\n` +
                             `Click "PDF View" button above to see the actual PDF document.\n\n` +
                             `Base64 Encoded PDF Data (first 200 characters):\n` +
                             `${reportContent.split(',')[1]?.substring(0, 200) || 'No data'}...\n\n` +
                             `═══════════════════════════════════════════════════════\n\n` +
                             `NOTE: FULL BASE64 CONTENT:\n\n` +
                             `${reportContent}`;
                           
                         } else if (reportContent.startsWith('data:')) {
                           try {
                             const [header, content] = reportContent.split(',');
                             const contentType = header.match(/data:([^;]+)/)?.[1] || 'unknown';
                             
                             // Try to decode if it's text-based content
                             if (contentType.includes('text') || contentType.includes('json')) {
                               try {
                                 const decoded = atob(content);
                                 return `DECODED REPORT CONTENT\n\n` +
                                   `FILE: File: ${report?.fileName || 'Unknown'}\n` +
                                   ` Patient: ${report?.patientName || 'Unknown Patient'}\n` +
                                   `CLINIC: Clinic: ${report?.clinicName || 'Unknown Clinic'}\n` +
                                   `DATA: Content Type: ${contentType}\n` +
                                   ` Size: ${decoded.length} characters\n\n` +
                                   `═══════════════════════════════════════════════════════\n\n` +
                                   `INFO: REPORT CONTENT:\n\n${decoded}`;
                               } catch (decodeError) {
                                 console.warn('Failed to decode base64 content:', decodeError);
                               }
                             }
                             
                             return `ENCODED REPORT DATA\n\n` +
                               `FILE: File: ${report?.fileName || 'Unknown'}\n` +
                               ` Patient: ${report?.patientName || 'Unknown Patient'}\n` +
                               `CLINIC: Clinic: ${report?.clinicName || 'Unknown Clinic'}\n` +
                               `DATA: Content Type: ${contentType}\n` +
                               ` Encoded Size: ${content?.length || 0} characters\n\n` +
                               `═══════════════════════════════════════════════════════\n\n` +
                               `INFO: BASE64 ENCODED CONTENT:\n\n${content?.substring(0, 2000) || 'No content'}${content?.length > 2000 ? '\n\n... (content truncated, scroll up to see full data)' : ''}`;
                               
                           } catch (dataError) {
                             console.error('Error processing data content:', dataError);
                             return reportContent;
                           }
                         } else if (reportContent.startsWith('http')) {
                           return `URL REFERENCE\n\nFILE: File: ${report?.fileName || 'Unknown'}\n Patient: ${report?.patientName || 'Unknown Patient'}\nCLINIC: Clinic: ${report?.clinicName || 'Unknown Clinic'}\n URL: ${reportContent}\n\nWARNING:  NOTE: This report is stored as a URL reference.\nThe actual content may be hosted externally.`;
                         } else {
                           // Plain text or other content
                           return `REPORT CONTENT\n\n` +
                             `FILE: File: ${report?.fileName || 'Unknown'}\n` +
                             ` Patient: ${report?.patientName || 'Unknown Patient'}\n` +
                             `CLINIC: Clinic: ${report?.clinicName || 'Unknown Clinic'}\n` +
                             ` Date: ${report?.createdAt ? new Date(report.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : 'Unknown'}\n\n` +
                             `═══════════════════════════════════════════════════════\n\n` +
                             `INFO: REPORT DATA:\n\n${reportContent}`;
                         }
                       })()}
                       readOnly
                       className={`w-full border rounded-md p-3 font-mono text-xs bg-white resize-both overflow-auto ${
                         isFullView 
                           ? 'flex-1 min-h-[400px]' 
                           : 'h-64 min-h-[200px] max-h-[500px]'
                       } whitespace-pre-wrap`}
                       style={{
                         minWidth: '100%',
                         maxWidth: '100%',
                         resize: isFullView ? 'vertical' : 'both'
                       }}
                       placeholder="Report content will appear here..."
                     />
                   )}
                   
                   {!isFullView && (<div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                     <div className="flex space-x-4">
                       <span>FILE: Type: {
                         reportContent?.startsWith('data:application/pdf') ? 'PDF Document' :
                         reportContent?.startsWith('data:') ? 'Base64 Data' :
                         reportContent?.startsWith('http') ? 'URL Reference' :
                         'Text Content'
                       }</span>
                       <span>️ Storage: {report?.s3Key ? 'Cloud Storage' : 'Local'}</span>
                     </div>
                     <div>
                       <span>IDEA: Tip: {reportContent?.startsWith('data:application/pdf') ? 'Click "PDF View" to see the actual document' : 'Drag the bottom-right corner to resize'}</span>
                     </div>
                   </div>)}
                 </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h5 className="text-lg font-medium text-gray-900 mb-2">No Preview Available</h5>
                <p className="text-gray-600">
                  Report metadata is available, but the file content could not be loaded.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <div>
            <button
              onClick={() => {
                try {
                  
                  try {
                    const reportsData = localStorage.getItem('reports');
                    const reports = reportsData ? JSON.parse(reportsData) : [];
                  } catch (reportsError) {
                  }
                  
                  try {
                    const s3Data = localStorage.getItem('s3MockFiles');
                    const s3Files = s3Data ? JSON.parse(s3Data) : [];
                  } catch (s3Error) {
                  }
                  
                  toast.success('Debug info logged to console (F12 → Console)');
                } catch (error) {
                  console.error(' DEBUG - Error during debug:', error);
                  toast.error('Debug failed - check console for error details');
                }
              }}
              className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
            >
              Debug Info
            </button>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            {reportContent && (
              <button
                onClick={toggleFullView}
                className="px-4 py-2 bg-[#323956] border border-transparent rounded-md text-sm font-medium text-white hover:bg-[#232D3C]"
              >
                {isFullView ? 'Exit Full View' : 'View Full Size'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientReports;
