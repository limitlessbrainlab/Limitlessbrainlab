import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Users,
  Calendar,
  Search,
  Filter,
  X,
  FileText,
  Phone,
  Mail,
  MapPin,
  Upload,
  Info,
  ClipboardList
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import StorageService from '../../services/storageService';
import { supabase } from '../../lib/supabaseClient';
import UploadReportModal from './UploadReportModal';
import ClinicalReportView from './ClinicalReportView';
import { useAuth } from '../../contexts/AuthContext';
import { generatePatientUID } from '../../utils/patientUidGenerator';
import { countryCodes as allCountryCodes } from '../../utils/countryCodes';
import { hashPassword } from '../../utils/passwordUtils';

const PatientManagement = ({ clinicId: propClinicId, onUpdate, creditsExhausted = false }) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'details'
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [patientForUpload, setPatientForUpload] = useState(null);
  const [patientReports, setPatientReports] = useState({});
  const [showPatientListModal, setShowPatientListModal] = useState(false);
  const [showPatientViewModal, setShowPatientViewModal] = useState(false);
  const [patientForView, setPatientForView] = useState(null);
  const [expandedPatientForm, setExpandedPatientForm] = useState(null); // Track which patient's form is expanded
  const [referralOptions, setReferralOptions] = useState(['Self', 'Others']); // Dynamic options from clinics

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm();

  // Helper function to get patient name (handles both old and new field names)
  const getPatientName = (patient) => {
    return patient?.fullName || patient?.full_name || patient?.name || 'Unknown';
  };

  // Helper function to calculate age from date of birth
  const getPatientAge = (patient) => {
    if (patient?.age) return patient.age;
    if (patient?.medical_history?.age) return patient.medical_history.age;
    if (patient?.dateOfBirth || patient?.date_of_birth) {
      const dob = new Date(patient.dateOfBirth || patient.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    }
    return 'N/A';
  };

  // Get clinicId from multiple sources
  const getClinicId = () => {
    // Priority 1: From props
    if (propClinicId) return propClinicId;

    // Priority 2: From user context
    if (user?.clinicId) return user.clinicId;

    // Priority 3: From localStorage user
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser?.clinicId) return parsedUser.clinicId;
        // If user has 'id' and role is clinic_admin, use that as clinicId
        if (parsedUser?.role === 'clinic_admin' && parsedUser?.id) {
          return parsedUser.id;
        }
      }
    } catch (e) {
      console.error('Error parsing stored user:', e);
    }

    return null;
  };

  const clinicId = getClinicId();

  // Get clinic name and SMTP config - fetch directly from database
  const [clinicDisplayName, setClinicDisplayName] = useState('unknown_clinic');
  const [clinicSmtpConfig, setClinicSmtpConfig] = useState({ smtp_email: '', smtp_password: '' });
  useEffect(() => {
    const fetchClinicName = async () => {
      if (!clinicId) return;
      try {
        const clinicData = await DatabaseService.findById('clinics', clinicId);
        if (clinicData?.name) {
          setClinicDisplayName(clinicData.name);
        } else if (clinicData?.contact_person) {
          setClinicDisplayName(clinicData.contact_person);
        }
        // Store SMTP config for sending emails from clinic's own email
        // Note: findById converts snake_case to camelCase, so smtp_email becomes smtpEmail
        const smtpEmail = clinicData?.smtpEmail || clinicData?.smtp_email || '';
        const smtpPass = clinicData?.smtpPassword || clinicData?.smtp_password || '';
        if (smtpEmail && smtpPass) {
          setClinicSmtpConfig({ smtp_email: smtpEmail, smtp_password: smtpPass });
        }
      } catch (e) {
        console.warn('Could not fetch clinic name:', e);
        setClinicDisplayName(user?.clinicName || user?.name || 'unknown_clinic');
      }
    };
    fetchClinicName();
  }, [clinicId]);

  // Debug logging
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    let parsedUser = null;
    try {
      parsedUser = storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {}

  }, [clinicId, propClinicId, user]);

  const loadPatients = useCallback(async () => {
    try {
      if (!clinicId) {
        console.warn('WARNING: loadPatients: No clinicId provided');
        setPatients([]);
        setLoading(false);
        return;
      }


      // Load patients directly for this clinic using org_id
      const patientsData = await DatabaseService.getPatientsByClinic(clinicId);


      setPatients(patientsData || []);

      // Load reports for each patient
      const reportsMap = {};
      for (const patient of (patientsData || [])) {
        try {
          const reports = await DatabaseService.getReportsByPatient(patient.id);
          reportsMap[patient.id] = reports || [];
        } catch (error) {
          console.error(`Error loading reports for patient ${patient.id}:`, error);
          reportsMap[patient.id] = [];
        }
      }

      setPatientReports(reportsMap);
    } catch (error) {
      console.error('ERROR: Error loading patients:', error);
      toast.error('Error loading patients');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) {
      loadPatients();
    } else {
      setLoading(false);
    }
  }, [clinicId, loadPatients]);

  // ✅ LOAD ALL CLINIC/PARTNER NAMES FOR REFERRAL DROPDOWN WITH TYPES
  const [referralOptionsWithTypes, setReferralOptionsWithTypes] = useState([]);

  useEffect(() => {
    const loadReferralOptions = async () => {
      try {
        const { data: allClinics, error: allError } = await supabase
          .from('clinics')
          .select('id, name, clinic_type')
          .not('name', 'is', null)
          .order('name');

        if (allError) {
          console.error('Error fetching clinics:', allError);
          return;
        }

        if (allClinics && allClinics.length > 0) {
          const options = allClinics
            .filter(c => c.name && c.name.trim())
            .map(c => ({
              name: c.name,
              type: c.clinic_type || 'clinic',
              displayLabel: `${c.name} (${c.clinic_type || 'Clinic'})`
            }));

          console.log('All clinic options from DB:', options);
          setReferralOptions(['Self', 'Others']);
          setReferralOptionsWithTypes(options);
        }
      } catch (err) {
        console.error('Error loading clinics for referral:', err);
        setReferralOptions(['Self', 'Others']);
        setReferralOptionsWithTypes([]);
      }
    };

    loadReferralOptions();
  }, []);

  const handleCreatePatient = async (data) => {
    try {

      if (!clinicId) {
        console.error('ERROR: No clinic ID found!');
        console.error('ERROR: propClinicId:', propClinicId);
        console.error('ERROR: user:', user);
        toast.error('Clinic ID not found. Please logout and login again.');
        return;
      }

      // ✅ EMAIL VALIDATION - Check if email already exists FIRST
      const sanitizedEmail = data.email?.trim().toLowerCase();

      // Check in patients table
      const existingPatient = patients.find(p => p.email?.toLowerCase() === sanitizedEmail);
      if (existingPatient) {
        toast.error(`❌ Email already registered as patient: ${existingPatient.full_name}`);
        return;
      }

      // Check in clinics table via Supabase
      try {
        const { data: existingClinic } = await supabase
          .from('clinics')
          .select('id, name')
          .eq('email', sanitizedEmail)
          .limit(1);

        if (existingClinic && existingClinic.length > 0) {
          toast.error(`❌ Email already registered as clinic: ${existingClinic[0].name}`);
          return;
        }
      } catch (clinicCheckError) {
        console.error('Error checking clinic emails:', clinicCheckError);
        // Continue anyway - try to create patient
      }

      // Ensure organization exists before creating patient
      try {
        const orgExists = await DatabaseService.findById('organizations', clinicId);

        if (!orgExists) {
          // ALWAYS include clinic ID in name to ensure uniqueness
          const baseName = user?.clinicName || user?.name || 'Clinic';
          const orgName = `${baseName}_${clinicId}`;

          try {
            await DatabaseService.add('organizations', {
              id: clinicId,
              name: orgName,
              created_at: new Date().toISOString()
            });
          } catch (addError) {
            // If duplicate key error on ID (org already exists with this ID), that's fine
            if (addError.message && (addError.message.includes('duplicate') || addError.message.includes('unique'))) {
            } else {
              throw addError; // Re-throw if it's a different error
            }
          }
        } else {
        }
      } catch (orgError) {
        console.error('WARNING: Organization check/create failed:', orgError);
        // Continue anyway - maybe org exists but findById failed
      }

      // Run auth creation, UID generation, and password hashing in parallel
      const [authResult, patientUID, hashedPassword] = await Promise.allSettled([
        DatabaseService.createPatientAuth(sanitizedEmail, data.password, {
          full_name: data.name,
          role: 'patient',
          org_id: clinicId
        }),
        generatePatientUID(clinicId),
        hashPassword(data.password)
      ]);

      // Process auth result
      let authCreated = false;
      if (authResult.status === 'fulfilled') {
        authCreated = true;
      } else if (authResult.status === 'rejected') {
        toast.error('Patient record will be created but login may not work. Please contact support.', {
          duration: 5000,
        });
      }

      // Get UID (use fallback if generation failed)
      const uid = patientUID.status === 'fulfilled' ? patientUID.value : `PAT-${Date.now()}`;

      // Get hashed password (use plain if hashing failed)
      const pwd = hashedPassword.status === 'fulfilled' ? hashedPassword.value : data.password;

      // Map fields to match database schema (without owner_user - it doesn't exist)
      const patientData = {
        org_id: clinicId, // Database uses org_id instead of clinicId
        clinic_id: clinicId, // Also set clinic_id for the patients table
        external_id: uid, // Use new UID format: CLINICCODE-YYYYMM-XXXX
        full_name: data.name, // Database uses full_name instead of name
        gender: data.gender?.toLowerCase(), // Convert to lowercase for database enum
        email: sanitizedEmail, // Sanitize email
        phone: data.phone?.trim() ? `${data.countryCode || '+91'} ${data.phone.trim()}` : '',
        address: data.address?.trim(),
        occupation: data.occupation?.trim() || '',
        handedness: data.handedness || '',
        referred_by: data.referredBy === 'Others' ? (data.referredByOther?.trim() || 'Others') : (data.referredBy || ''),
        password: pwd,
        medical_history: {
          ...(data.notes ? { notes: data.notes } : {}),
          ...(!data.dateOfBirth && data.age ? { age: parseInt(data.age) } : {})
        },
        date_of_birth: data.dateOfBirth || null,
        created_at: new Date().toISOString()
      };

      await DatabaseService.add('patients', patientData);

      // Send welcome email in background (don't block the UI)
      if (authCreated) {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');

        const { data: sessionData } = await supabase.auth.getSession();
        const authToken = sessionData?.session?.access_token;
        const welcomeHeaders = { 'Content-Type': 'application/json' };
        if (authToken) welcomeHeaders['Authorization'] = `Bearer ${authToken}`;
        fetch(`${baseUrl}/api/send-welcome-email`, {
          method: 'POST',
          headers: welcomeHeaders,
          body: JSON.stringify({
            patientName: data.name,
            email: sanitizedEmail,
            password: data.password,
            clinicName: user?.clinicName || user?.name || 'Your Clinic',
            clinicSmtpEmail: clinicSmtpConfig.smtp_email || '',
            clinicSmtpPassword: clinicSmtpConfig.smtp_password || ''
          })
        }).catch(emailError => {
          console.error('Failed to send welcome email:', emailError);
        });

        toast.success(
          `Patient created successfully!\n\nLogin credentials will be sent to ${data.email}`,
          { duration: 6000 }
        );
      } else {
        toast.success('Patient record created successfully!');
      }

      loadPatients();
      setShowModal(false);
      reset();
      onUpdate?.();
    } catch (error) {
      console.error('ERROR: Error creating patient:', error);
      toast.error('Error creating patient: ' + (error.message || 'Unknown error'));
    }
  };

  const handleEditPatient = async (data) => {
    try {
      // Check if email has changed
      const emailChanged = selectedPatient?.email !== data.email;

      // Map form fields to database schema
      const patientData = {
        full_name: data.name, // Database uses full_name
        gender: data.gender?.toLowerCase(), // Convert to lowercase for database enum
        email: data.email,
        phone: data.phone,
        address: data.address,
        occupation: data.occupation?.trim() || '',
        handedness: data.handedness || '',
        referred_by: data.referredBy === 'Others' ? (data.referredByOther?.trim() || 'Others') : (data.referredBy || ''),
        medical_history: {
          ...(data.notes ? { notes: data.notes } : {}),
          ...(!data.dateOfBirth && data.age ? { age: parseInt(data.age) } : {})
        },
        date_of_birth: data.dateOfBirth || null
      };

      await DatabaseService.update('patients', selectedPatient.id, patientData);

      // Send email update notification if email was changed
      if (emailChanged && data.email) {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');

        // Get clinic SMTP config
        const clinicData = await DatabaseService.findById('clinics', user?.clinicId || clinicId);
        const smtpEmail = clinicData?.smtpEmail || clinicData?.smtp_email || '';
        const smtpPass = clinicData?.smtpPassword || clinicData?.smtp_password || '';
        const clinicUrl = clinicData?.website_url || clinicData?.website || '';

        const { data: emailSessionData } = await supabase.auth.getSession();
        const emailAuthToken = emailSessionData?.session?.access_token;
        const emailUpdateHeaders = { 'Content-Type': 'application/json' };
        if (emailAuthToken) emailUpdateHeaders['Authorization'] = `Bearer ${emailAuthToken}`;
        fetch(`${baseUrl}/api/send-email-update-notification`, {
          method: 'POST',
          headers: emailUpdateHeaders,
          body: JSON.stringify({
            patientName: data.name,
            newEmail: data.email,
            clinicName: user?.clinicName || user?.name || 'Your Clinic',
            clinicUrl: clinicUrl,
            clinicSmtpEmail: smtpEmail,
            clinicSmtpPassword: smtpPass
          })
        }).catch(emailError => {
          console.error('Failed to send email update notification:', emailError);
        });
      }

      toast.success(emailChanged ? 'Patient updated and email sent to new address' : 'Patient updated successfully');
      loadPatients();
      setShowModal(false);
      setSelectedPatient(null);
      reset();
      onUpdate?.();
    } catch (error) {
      toast.error('Error updating patient');
      console.error(error);
    }
  };

  const handleDeletePatient = async (patientId) => {
    if (window.confirm('Are you sure you want to delete this patient? This action cannot be undone.')) {
      try {
        await DatabaseService.delete('patients', patientId);
        toast.success('Patient deleted successfully');
        loadPatients();
        onUpdate?.();
      } catch (error) {
        toast.error('Error deleting patient');
        console.error(error);
      }
    }
  };

  const handleDownloadReport = async (report) => {
    try {
      if (report.s3Key) {
        
        // Generate signed URL for download
        const downloadUrl = await StorageService.getSignedUrl(report.storagePath || report.s3Key, 300); // 5 minutes
        
        // Open download URL in new tab
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = report.fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success(' Download started!');
      } else {
        // Fallback for files not stored in S3
        toast.error('File not available for download');
      }
    } catch (error) {
      console.error('ERROR: Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const openModal = (patient = null) => {
    setSelectedPatient(patient);
    if (patient) {
      // Map database fields to form fields
      // Determine referredBy value - check if stored value matches a dropdown option
      const storedReferred = patient.referred_by || patient.referredBy || '';
      const isStandardOption = referralOptions.includes(storedReferred);
      const referredByValue = isStandardOption ? storedReferred : (storedReferred ? 'Others' : '');
      const referredByOtherValue = (!isStandardOption && storedReferred) ? storedReferred : '';

      const formData = {
        name: getPatientName(patient),
        dateOfBirth: patient.date_of_birth || patient.dateOfBirth || '',
        gender: patient.gender || '',
        email: patient.email || '',
        phone: patient.phone || '',
        address: patient.address || '',
        notes: patient.notes || patient.medical_history?.notes || '',
        age: patient.age || patient.medical_history?.age || '',
        referredBy: referredByValue,
        referredByOther: referredByOtherValue,
        occupation: patient.occupation || '',
        handedness: patient.handedness || ''
      };
      reset(formData);
    } else {
      reset({});
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    reset({});
  };

  const openUploadModal = (patient) => {
    if (creditsExhausted) {
      toast.error('Report credits exhausted. Please purchase more credits to upload reports.');
      return;
    }
    if (!patient) {
      console.error('ERROR: Cannot open upload modal: patient is undefined');
      toast.error('Please select a patient first');
      return;
    }

    // Get patient name using helper function
    const patientName = getPatientName(patient);

    if (!patient.id || !patientName) {
      console.error('ERROR: Patient object incomplete:', patient);
      toast.error('Invalid patient data');
      return;
    }

    // Create a normalized patient object with both database and display fields
    const normalizedPatient = {
      ...patient,
      name: patientName, // Add name field for UploadReportModal
      age: getPatientAge(patient) // Add age field for completeness
    };

    setPatientForUpload(normalizedPatient);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setPatientForUpload(null);
    setShowUploadModal(false);
  };

  const openPatientListModal = () => {
    setShowPatientListModal(true);
  };

  const closePatientListModal = () => {
    setShowPatientListModal(false);
  };

  const openPatientViewModal = (patient) => {
    setPatientForView(patient);
    setShowPatientViewModal(true);
  };

  const closePatientViewModal = () => {
    setPatientForView(null);
    setShowPatientViewModal(false);
  };

  const handleBulkAddPatients = async (patientList) => {
    try {
      if (!clinicId) {
        toast.error('No clinic ID found. Please refresh the page.');
        return;
      }

      for (const patientData of patientList) {
        // Map fields to match database schema
        const patient = {
          org_id: clinicId, // Database uses org_id
          clinic_id: clinicId, // Also set clinic_id for the patients table
          full_name: patientData.name, // Database uses full_name
          gender: patientData.gender?.toLowerCase(), // Convert to lowercase
          email: patientData.email,
          phone: patientData.phone,
          address: patientData.address,
          medical_history: patientData.notes ? { notes: patientData.notes } : {},
          date_of_birth: patientData.dateOfBirth || null,
          created_at: new Date().toISOString()
        };

        await DatabaseService.add('patients', patient);
      }

      toast.success(`Successfully added ${patientList.length} patients!`);
      loadPatients();
      closePatientListModal();
      onUpdate?.();
    } catch (error) {
      console.error('ERROR: Error bulk adding patients:', error);
      toast.error('Error adding patients');
    }
  };



  const viewPatientDetails = (patient) => {
    setSelectedPatient(patient);
    setViewMode('details');
  };

  const filteredPatients = patients.filter(patient => {
    // Support both fullName (from database) and name (legacy)
    const patientName = patient.fullName || patient.full_name || patient.name || '';
    const matchesSearch = patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.phone?.includes(searchTerm);
    const matchesGender = !genderFilter || patient.gender === genderFilter;

    return matchesSearch && matchesGender;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (viewMode === 'details' && selectedPatient) {
    return <PatientDetails 
      patient={selectedPatient} 
      clinicId={clinicId}
      onBack={() => {setViewMode('list'); setSelectedPatient(null);}} 
    />;
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Patient Management</h2>
          <p className="text-gray-600">Manage your clinic's patient records</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => openModal()}
            className="bg-[#323956] hover:bg-[#232D3C] text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 shadow-md"
          >
            <Plus className="h-4 w-4" />
            <span>Add Patient</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          
          <button
            onClick={() => {
              setSearchTerm('');
              setGenderFilter('');
            }}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center space-x-2"
          >
            <X className="h-4 w-4" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Patients Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Patients ({filteredPatients.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Demographics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Reports
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Added
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPatients.map((patient) => {
                const reports = patientReports[patient.id] || [];

                return (
                  <tr key={patient.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') ? 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-l-[#F5D05D]' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary-100 dark:bg-blue-900/30'}`}>
                            <Users className={`h-5 w-5 ${(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') ? 'text-amber-600 dark:text-amber-400' : 'text-primary-600 dark:text-blue-400'}`} />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {getPatientName(patient)}
                              {(patient.referred_by === 'Limitless Brain Lab' || patient.referredBy === 'Limitless Brain Lab') && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F5D05D] text-gray-900">LBL</span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">ID: {patient.external_id || patient.externalId || patient.id?.slice(0, 8) || 'N/A'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{patient.email || 'N/A'}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{patient.phone || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{getPatientAge(patient)} years</div>
                        {(patient.date_of_birth || patient.dateOfBirth) && (
                          <div className="text-[11px] text-gray-400">{new Date(patient.date_of_birth || patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        )}
                        <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{patient.gender || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          {reports.length > 0 ? (() => {
                            const latest = [...reports].sort((a, b) =>
                              new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
                            )[0];
                            return (
                              <button
                                key={latest.id}
                                onClick={() => handleDownloadReport(latest)}
                                className="block text-sm text-primary-600 dark:text-blue-400 hover:underline cursor-pointer"
                                title={`Download ${latest.title || latest.fileName}`}
                              >
                                {latest.fileName || 'Report'}
                                {latest.storedInCloud && (
                                  <span className="ml-1 text-xs text-[#323956] dark:text-blue-400">️</span>
                                )}
                              </button>
                            );
                          })() : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">No reports</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(patient.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setExpandedPatientForm(patient.id)}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded p-1"
                            title="Open Clinical Documentation Form"
                          >
                            <ClipboardList className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openUploadModal(patient)}
                            className="text-[#323956] dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                            title="Upload Other Document"
                          >
                            <Upload className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openPatientViewModal(patient)}
                            className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 transition-colors"
                            title="View Clinical Report"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openModal(patient)}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            title="Edit Patient"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(patient.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                            title="Delete Patient"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                );
              })}
            </tbody>
          </table>

          {filteredPatients.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                {searchTerm || genderFilter 
                  ? 'No patients match your filters' 
                  : 'No patients added yet'
                }
              </p>
              <button
                onClick={() => openModal()}
                className="bg-[#323956] hover:bg-[#232D3C] text-white px-4 py-2 rounded-lg font-medium shadow-md"
              >
                Add First Patient
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <PatientModal
          patient={selectedPatient}
          onSubmit={selectedPatient ? handleEditPatient : handleCreatePatient}
          onClose={closeModal}
          register={register}
          handleSubmit={handleSubmit}
          watch={watch}
          setValue={setValue}
          errors={errors}
          referralOptions={referralOptions}
          referralOptionsWithTypes={referralOptionsWithTypes}
        />
      )}

      {/* Upload Report Modal */}
      {showUploadModal && (
        <UploadReportModal
          clinicId={clinicId}
          patient={patientForUpload}
          onUpload={() => {
            loadPatients();
            closeUploadModal();
            onUpdate?.();
          }}
          onClose={closeUploadModal}
        />
      )}

      {/* Patient List Modal */}
      {showPatientListModal && (
        <PatientListModal
          onAddPatients={handleBulkAddPatients}
          onClose={closePatientListModal}
        />
      )}

      {/* Patient Clinical Report View Modal */}
      {showPatientViewModal && patientForView && (
        <ClinicalReportView
          patient={patientForView}
          onClose={closePatientViewModal}
        />
      )}

      {/* Clinical Documentation Form Modal */}
      {expandedPatientForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 flex flex-col max-h-[90vh]">
            {/* Fixed Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-xl flex-shrink-0">
              <h3 className="text-base sm:text-lg font-semibold text-white flex items-center">
                <ClipboardList className="h-5 w-5 mr-2 text-white/80" />
                <span className="truncate">Clinical Documentation - {patients.find(p => p.id === expandedPatientForm) ? getPatientName(patients.find(p => p.id === expandedPatientForm)) : ''}</span>
              </h3>
              <button
                onClick={() => setExpandedPatientForm(null)}
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1.5 transition-colors ml-2 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Scrollable Content */}
            <div className="px-6 py-5 overflow-y-auto flex-1">
              <ClinicalDocumentationForm
                patientId={expandedPatientForm}
                patientName={patients.find(p => p.id === expandedPatientForm) ? getPatientName(patients.find(p => p.id === expandedPatientForm)) : ''}
                patientData={patients.find(p => p.id === expandedPatientForm) || {}}
                clinicId={clinicId}
                clinicName={clinicDisplayName}
                onClose={() => setExpandedPatientForm(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Clinical Documentation Form Component - Displayed in each patient's row
const ClinicalDocumentationForm = ({ patientId, patientName, patientData, clinicId, clinicName, onClose }) => {
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [existingDocId, setExistingDocId] = React.useState(null);

  // File upload states
  const [uploadedFiles, setUploadedFiles] = React.useState({
    mentalStatus: null,
    neuroExam: null,
    psychiatricScales: null,
    otherReports: null,
    eyesOpenEdf: null,
    eyesClosedEdf: null
  });

  // Saved file URLs from database
  const [savedFileUrls, setSavedFileUrls] = React.useState({});

  // Examination notes per document type
  const [examinationNotes, setExaminationNotes] = React.useState({
    mentalStatus: '',
    neuroExam: '',
    psychiatricScales: '',
    otherReports: ''
  });
  const [clinicalFormSubmitted, setClinicalFormSubmitted] = React.useState(false);

  // Recording protocol states
  const [recordingProtocol, setRecordingProtocol] = React.useState({
    recordingDate: '',
    duration: '',
    eyesOpen: false,
    eyesClosed: false,
    both: false,
    hyperventilation: false,
    photicStimulation: false,
    cognitiveTask: false,
    cognitiveTaskDetails: '',
    otherTask: false,
    otherTaskDetails: '',
    electrodeSystem: ''
  });

  // Administrative details states - auto-fill from patient data
  const [adminDetails, setAdminDetails] = React.useState({
    reportingClinician: '',
    dateOfReport: '',
    institutionName: '',
    partnerPlatform: '',
    uniqueReportId: patientData?.external_id || patientData?.externalId || '',
    contactPhone: patientData?.phone || '',
    contactEmail: patientData?.email || '',
    contactAddress: patientData?.address || ''
  });

  const fetchExistingData = async () => {
    if (!patientId) {
      setLoading(false);
      return;
    }

    try {

      // Fetch from clinical_documentation table
      const { data, error } = await DatabaseService.supabaseService.supabase
        .from('clinical_documentation')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching clinical documentation:', error);
      }

      if (data) {
        setExistingDocId(data.id);

        // Populate Examination Notes
        if (data.examination_notes && typeof data.examination_notes === 'object') {
          setExaminationNotes(data.examination_notes);
        } else {
          setExaminationNotes({ mentalStatus: '', neuroExam: '', psychiatricScales: '', otherReports: '' });
        }

        // Populate Recording Protocol
        setRecordingProtocol({
          recordingDate: data.recording_date || '',
          duration: data.duration || '',
          eyesOpen: data.eyes_open || false,
          eyesClosed: data.eyes_closed || false,
          both: data.both_conditions || false,
          hyperventilation: data.hyperventilation || false,
          photicStimulation: data.photic_stimulation || false,
          cognitiveTask: data.cognitive_task || false,
          cognitiveTaskDetails: data.cognitive_task_details || '',
          otherTask: data.other_task || false,
          otherTaskDetails: data.other_task_details || '',
          electrodeSystem: data.electrode_system || ''
        });

        // Populate Administrative Details (fallback to patient data if DB values are empty)
        setAdminDetails({
          reportingClinician: data.reporting_clinician || '',
          dateOfReport: data.date_of_report || '',
          institutionName: data.institution_name || '',
          partnerPlatform: data.partner_platform || '',
          uniqueReportId: data.unique_report_id || patientData?.external_id || patientData?.externalId || '',
          contactPhone: data.contact_phone || patientData?.phone || '',
          contactEmail: data.contact_email || patientData?.email || '',
          contactAddress: data.contact_address || patientData?.address || ''
        });

        // Set saved file URLs - validate each file exists in storage
        if (data.file_urls && typeof data.file_urls === 'object') {
          const validatedUrls = {};
          const supabaseClient = DatabaseService.supabaseService.supabase;
          let hasInvalid = false;

          for (const [key, fileInfo] of Object.entries(data.file_urls)) {
            if (fileInfo && fileInfo.path) {
              try {
                const { data: signedData, error } = await supabaseClient.storage
                  .from('patients_documents')
                  .createSignedUrl(fileInfo.path, 60);
                if (!error && signedData?.signedUrl) {
                  validatedUrls[key] = fileInfo;
                } else {
                  hasInvalid = true;
                }
              } catch {
                hasInvalid = true;
              }
            }
          }

          setSavedFileUrls(validatedUrls);

          // Auto-cleanup: update database if dead references were found
          if (hasInvalid && data.id) {
            await supabaseClient.from('clinical_documentation')
              .update({ file_urls: validatedUrls, updated_at: new Date().toISOString() })
              .eq('id', data.id);
          }
        } else {
          setSavedFileUrls({});
        }
      }
    } catch (err) {
      console.error('Error fetching clinical documentation:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch existing data when form opens
  React.useEffect(() => {
    fetchExistingData();
  }, [patientId]);

  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({ ...prev, [fileType]: file }));
    }
  };

  const handleRemoveSavedFile = async (fileKey) => {
    try {
      const fileInfo = savedFileUrls[fileKey];
      // Delete from storage bucket if path exists
      if (fileInfo?.path) {
        const supabase = DatabaseService.supabaseService.supabase;
        await supabase.storage.from('patients_documents').remove([fileInfo.path]);
      }
      // Remove from local state
      const updatedUrls = { ...savedFileUrls };
      delete updatedUrls[fileKey];
      setSavedFileUrls(updatedUrls);
      // Update database immediately
      if (existingDocId) {
        const supabase = DatabaseService.supabaseService.supabase;
        await supabase.from('clinical_documentation').update({ file_urls: updatedUrls, updated_at: new Date().toISOString() }).eq('id', existingDocId);
      }
      toast.success('File removed successfully');
    } catch (err) {
      console.error('Error removing file:', err);
      toast.error('Failed to remove file');
    }
  };

  const handleSaveDocumentation = async () => {
    setClinicalFormSubmitted(true);
    // Validate mandatory examination notes
    const missingNotes = ['mentalStatus', 'neuroExam', 'psychiatricScales', 'otherReports'].filter(key => !examinationNotes[key]?.trim());
    if (missingNotes.length > 0) {
      toast.error('Please fill in all examination notes fields before saving.');
      return;
    }
    setSaving(true);
    try {
      // Upload files to patients_documents bucket
      let fileUrls = {};
      const supabase = DatabaseService.supabaseService.supabase;

      for (const [key, file] of Object.entries(uploadedFiles)) {
        if (file) {
          try {
            // Create organized path: clinicName/patientName/documentType_filename
            const sanitizedClinic = (clinicName || 'unknown_clinic').replace(/[^a-zA-Z0-9._-]/g, '_');
            const sanitizedPatient = (patientName || 'unknown_patient').replace(/[^a-zA-Z0-9._-]/g, '_');
            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

            // If updating existing file, delete old one first then upload new
            if (savedFileUrls[key]?.path) {
              try {
                await supabase.storage.from('patients_documents').remove([savedFileUrls[key].path]);
              } catch (delErr) {
                console.warn(`Could not delete old file for ${key}:`, delErr);
              }
            }

            const filePath = `${sanitizedClinic}/${sanitizedPatient}/${key}_${sanitizedFileName}`;


            // Upload to patients_documents bucket (upsert to replace if same path exists)
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('patients_documents')
              .upload(filePath, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: true
              });

            if (uploadError) {
              throw new Error(uploadError.message);
            }

            // Get public URL
            const { data: urlData } = supabase.storage
              .from('patients_documents')
              .getPublicUrl(uploadData.path);

            fileUrls[key] = {
              path: uploadData.path,
              url: urlData.publicUrl,
              fileName: sanitizedFileName,
              originalName: file.name,
              size: file.size,
              type: file.type,
              uploadedAt: new Date().toISOString()
            };

            toast.success(`${key} uploaded successfully!`);
          } catch (uploadError) {
            console.error(`Error uploading ${key}:`, uploadError);
            toast.error(`Failed to upload ${key}: ${uploadError.message}`);
          }
        }
      }

      // Merge new file URLs with existing saved file URLs
      const mergedFileUrls = { ...savedFileUrls, ...fileUrls };

      // Prepare data for clinical_documentation table
      const documentationData = {
        patient_id: patientId,
        clinic_id: clinicId,
        patient_name: patientName,
        // Examination Notes (per document type)
        examination_notes: examinationNotes || null,
        // Recording Protocol
        recording_date: recordingProtocol.recordingDate || null,
        duration: recordingProtocol.duration || null,
        eyes_open: recordingProtocol.eyesOpen,
        eyes_closed: recordingProtocol.eyesClosed,
        both_conditions: recordingProtocol.both,
        hyperventilation: recordingProtocol.hyperventilation,
        photic_stimulation: recordingProtocol.photicStimulation,
        cognitive_task: recordingProtocol.cognitiveTask,
        cognitive_task_details: recordingProtocol.cognitiveTaskDetails || null,
        other_task: recordingProtocol.otherTask,
        other_task_details: recordingProtocol.otherTaskDetails || null,
        electrode_system: recordingProtocol.electrodeSystem || null,
        // Administrative Details
        reporting_clinician: adminDetails.reportingClinician || null,
        date_of_report: adminDetails.dateOfReport || null,
        institution_name: adminDetails.institutionName || null,
        partner_platform: adminDetails.partnerPlatform || null,
        unique_report_id: adminDetails.uniqueReportId || null,
        contact_phone: adminDetails.contactPhone || null,
        contact_email: adminDetails.contactEmail || null,
        contact_address: adminDetails.contactAddress || null,
        // File URLs (merged)
        file_urls: mergedFileUrls,
        created_at: new Date().toISOString()
      };


      // Use the supabase instance already declared above for database operations
      if (existingDocId) {
        // Update existing record
        const { data, error } = await supabase
          .from('clinical_documentation')
          .update({
            ...documentationData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDocId)
          .select()
          .single();

        if (error) {
          throw new Error(`Update failed: ${error.message}`);
        }

        toast.success('Clinical documentation updated successfully!');
        if (onClose) onClose();
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('clinical_documentation')
          .insert({
            ...documentationData,
            id: crypto.randomUUID()
          })
          .select()
          .single();

        if (error) {
          // Check if table doesn't exist
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            toast.error('Database table not found. Please run the migration SQL first.');
            console.error('Table clinical_documentation does not exist. Run the migration SQL in Supabase.');
          } else {
            throw new Error(`Insert failed: ${error.message}`);
          }
          return;
        }

        toast.success('Clinical documentation saved successfully!');
        if (onClose) onClose();
      }
    } catch (error) {
      console.error('Error saving documentation:', error);
      toast.error('Failed to save documentation: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Show loading spinner while fetching data
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading saved data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Show if data exists */}
      {existingDocId && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center">
          <span className="text-green-700 text-sm">Previously saved data loaded. You can update and save again.</span>
        </div>
      )}

      {/* Section 1: Examination Details (Upload - Supporting Documents) */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            1. Examination Details (Upload - Supporting Documents)
          </h4>
        </div>
        <div className="p-4 space-y-3">
          {[
            { key: 'mentalStatus', label: 'Mental Status / Cognitive Assessment Report', hint: '(Upload if available)' },
            { key: 'neuroExam', label: 'Neurological Examination Findings', hint: '(Upload if available)' },
            { key: 'psychiatricScales', label: 'Psychiatric / Behavioral Scales', hint: '(Upload if available)' },
            { key: 'otherReports', label: 'Other Relevant Clinical Reports (MRI, CT, lab tests, neuropsychological assessments)', hint: '(Upload if available)' }
          ].map(({ key, label, hint }) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="flex items-start text-sm text-gray-700 dark:text-gray-300 sm:w-2/3">
                  <input type="checkbox" checked={!!(savedFileUrls[key] || uploadedFiles[key])} readOnly className="mr-2 mt-1 rounded border-gray-300" />
                  <span>{label} <span className="text-blue-600 text-xs">{hint}</span></span>
                </label>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload(e, key)}
                  className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              {/* Show saved file from database */}
              {savedFileUrls[key] && !uploadedFiles[key] && (
                <div className="flex items-center gap-2 ml-6 bg-green-50 border border-green-200 rounded px-3 py-1.5">
                  <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-xs text-green-700 font-medium truncate">{savedFileUrls[key].originalName || savedFileUrls[key].fileName || 'Saved document'}</span>
                  {savedFileUrls[key].url && (
                    <a href={savedFileUrls[key].url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline flex-shrink-0">View</a>
                  )}
                  <button onClick={() => handleRemoveSavedFile(key)} className="text-red-400 hover:text-red-600 flex-shrink-0 ml-1" title="Remove file">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {/* Show newly selected file */}
              {uploadedFiles[key] && (
                <div className="flex items-center gap-2 ml-6">
                  <span className="text-xs text-blue-600 font-medium">{uploadedFiles[key].name}</span>
                  <span className="text-xs text-gray-400">(new - will replace saved)</span>
                </div>
              )}
              {/* Notes text box for each document (mandatory) */}
              <div className="ml-6 w-[calc(100%-1.5rem)]">
                <textarea
                  value={examinationNotes[key] || ''}
                  onChange={(e) => setExaminationNotes(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Add notes for ${label}... *`}
                  rows={2}
                  required
                  className={`w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white placeholder-gray-400 resize-y ${clinicalFormSubmitted && !examinationNotes[key]?.trim() ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                />
                {clinicalFormSubmitted && !examinationNotes[key]?.trim() && (
                  <p className="text-xs text-red-500 mt-0.5">* Required</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Recording Protocol */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
            2. Recording Protocol
          </h4>
        </div>
        <div className="p-4 space-y-4">
          {/* Recording Date & Duration */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Recording Date & Duration:</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="date"
                value={recordingProtocol.recordingDate}
                onChange={(e) => setRecordingProtocol(prev => ({ ...prev, recordingDate: e.target.value }))}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
              <input
                type="text"
                value={recordingProtocol.duration}
                onChange={(e) => setRecordingProtocol(prev => ({ ...prev, duration: e.target.value }))}
                placeholder="Duration (e.g., 20 mins)"
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {/* Resting State Conditions */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Resting State Conditions:</label>
            <div className="flex flex-wrap gap-x-6 gap-y-2 ml-2">
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.eyesOpen}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, eyesOpen: e.target.checked }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Eyes Open
              </label>
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.eyesClosed}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, eyesClosed: e.target.checked }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Eyes Closed
              </label>
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.both}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, both: e.target.checked }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Both
              </label>
            </div>
          </div>

          {/* Additional Tasks */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Additional Tasks (if applicable):</label>
            <div className="space-y-2 ml-2">
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.hyperventilation}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, hyperventilation: e.target.checked }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Hyperventilation
              </label>
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.photicStimulation}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, photicStimulation: e.target.checked }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Photic Stimulation
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={recordingProtocol.cognitiveTask}
                    onChange={(e) => setRecordingProtocol(prev => ({ ...prev, cognitiveTask: e.target.checked }))}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Cognitive Task(s):
                </label>
                <input
                  type="text"
                  value={recordingProtocol.cognitiveTaskDetails}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, cognitiveTaskDetails: e.target.value }))}
                  placeholder="Specify..."
                  className="flex-1 max-w-xs px-2 py-1 text-sm border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:bg-transparent dark:text-white outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={recordingProtocol.otherTask}
                    onChange={(e) => setRecordingProtocol(prev => ({ ...prev, otherTask: e.target.checked }))}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Other:
                </label>
                <input
                  type="text"
                  value={recordingProtocol.otherTaskDetails}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, otherTaskDetails: e.target.value }))}
                  placeholder="Specify..."
                  className="flex-1 max-w-xs px-2 py-1 text-sm border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:bg-transparent dark:text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Electrode System Used */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Electrode System Used:</label>
            <div className="space-y-2 ml-2">
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.electrodeSystem === '10-20'}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, electrodeSystem: e.target.checked ? '10-20' : '' }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                International 10-20 System
              </label>
              <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={recordingProtocol.electrodeSystem === '10-10'}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, electrodeSystem: e.target.checked ? '10-10' : '' }))}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Extended 10-10 System
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={recordingProtocol.electrodeSystem?.startsWith('high-density')}
                    onChange={(e) => setRecordingProtocol(prev => ({ ...prev, electrodeSystem: e.target.checked ? 'high-density' : '' }))}
                    className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  High-density (64 / 128 / 256 channels):
                </label>
                <input
                  type="text"
                  value={recordingProtocol.electrodeSystem?.startsWith('high-density') ? recordingProtocol.electrodeSystem.replace('high-density-', '') : ''}
                  onChange={(e) => setRecordingProtocol(prev => ({ ...prev, electrodeSystem: `high-density-${e.target.value}` }))}
                  placeholder="Specify channels..."
                  className="w-32 px-2 py-1 text-sm border-b border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:bg-transparent dark:text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* EDF File Uploads */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">EDF Files:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Eyes Open:</span>
                  <input
                    type="file"
                    accept=".edf"
                    onChange={(e) => handleFileUpload(e, 'eyesOpenEdf')}
                    className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
                  />
                </div>
                {savedFileUrls.eyesOpenEdf && !uploadedFiles.eyesOpenEdf && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2 py-1">
                    <svg className="h-3.5 w-3.5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-xs text-green-700 truncate">{savedFileUrls.eyesOpenEdf.originalName || savedFileUrls.eyesOpenEdf.fileName || 'Saved EDF'}</span>
                    {savedFileUrls.eyesOpenEdf.url && <a href={savedFileUrls.eyesOpenEdf.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline flex-shrink-0">View</a>}
                    <button onClick={() => handleRemoveSavedFile('eyesOpenEdf')} className="text-red-400 hover:text-red-600 flex-shrink-0 ml-1" title="Remove"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {uploadedFiles.eyesOpenEdf && <span className="text-xs text-blue-600">{uploadedFiles.eyesOpenEdf.name} <span className="text-gray-400">(new)</span></span>}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Eyes Closed:</span>
                  <input
                    type="file"
                    accept=".edf"
                    onChange={(e) => handleFileUpload(e, 'eyesClosedEdf')}
                    className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
                  />
                </div>
                {savedFileUrls.eyesClosedEdf && !uploadedFiles.eyesClosedEdf && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2 py-1">
                    <svg className="h-3.5 w-3.5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="text-xs text-green-700 truncate">{savedFileUrls.eyesClosedEdf.originalName || savedFileUrls.eyesClosedEdf.fileName || 'Saved EDF'}</span>
                    {savedFileUrls.eyesClosedEdf.url && <a href={savedFileUrls.eyesClosedEdf.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline flex-shrink-0">View</a>}
                    <button onClick={() => handleRemoveSavedFile('eyesClosedEdf')} className="text-red-400 hover:text-red-600 flex-shrink-0 ml-1" title="Remove"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {uploadedFiles.eyesClosedEdf && <span className="text-xs text-blue-600">{uploadedFiles.eyesClosedEdf.name} <span className="text-gray-400">(new)</span></span>}
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSaveDocumentation}
          disabled={saving}
          className="px-6 py-2 bg-[#323956] hover:bg-[#232D3C] text-white rounded-lg font-medium shadow-md disabled:opacity-50 flex items-center space-x-2"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Saving...</span>
            </>
          ) : (
            <span>Save Clinical Documentation</span>
          )}
        </button>
      </div>
    </div>
  );
};

// Patient Modal Component
const PatientModal = ({ patient, onSubmit, onClose, register, handleSubmit, watch, setValue, errors, referralOptions, referralOptionsWithTypes }) => {
  // Auto-calculate age when DOB changes
  const watchedDob = watch('dateOfBirth');
  React.useEffect(() => {
    if (watchedDob) {
      const dob = new Date(watchedDob);
      const today = new Date();
      let calcAge = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        calcAge--;
      }
      if (calcAge >= 0 && calcAge <= 150) {
        setValue('age', calcAge.toString(), { shouldValidate: true });
      }
    } else {
      setValue('age', '');
    }
  }, [watchedDob, setValue]);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Phone number states - initialize from patient data when editing
  const parsePatientPhone = () => {
    const rawPhone = patient?.phone || '';
    if (!rawPhone) return { code: '+91', number: '' };
    // If phone starts with +, extract country code
    const sortedCodes = [...allCountryCodes].sort((a, b) => b.code.length - a.code.length);
    for (const country of sortedCodes) {
      if (rawPhone.startsWith(country.code)) {
        const num = rawPhone.slice(country.code.length).replace(/[\s\-]/g, '').replace(/[^\d]/g, '');
        return { code: country.code, number: num };
      }
    }
    // No country code found, return raw digits
    return { code: '+91', number: rawPhone.replace(/[^\d]/g, '') };
  };
  const initialPhone = parsePatientPhone();
  const [phoneNumber, setPhoneNumber] = React.useState(initialPhone.number);
  const [selectedCountryCode, setSelectedCountryCode] = React.useState(initialPhone.code);
  const [phoneError, setPhoneError] = React.useState('');

  // Country codes list with validation rules
  const countryCodes = allCountryCodes;

  // Get required digits for selected country
  const getRequiredDigits = (code) => {
    const country = countryCodes.find(c => c.code === code && !c.disabled);
    return country ? country.maxLength : 10;
  };

  // Auto-detect country code from phone number
  const handlePhoneChange = (e) => {
    let value = e.target.value;
    let detectedCode = selectedCountryCode;

    // Check if number starts with + and detect country code
    if (value.startsWith('+')) {
      // Sort by code length descending to match longer codes first (+880 before +8)
      const sortedCodes = [...countryCodes].sort((a, b) => b.code.length - a.code.length);

      for (const country of sortedCodes) {
        if (value.startsWith(country.code)) {
          detectedCode = country.code;
          setSelectedCountryCode(country.code);
          // Remove country code from phone number
          value = value.slice(country.code.length).trim();
          break;
        }
      }
    }

    // Remove any non-digit characters
    const cleanNumber = value.replace(/[^\d]/g, '');
    setPhoneNumber(cleanNumber);

    // Validate phone number length
    const requiredDigits = getRequiredDigits(detectedCode);
    if (cleanNumber.length > 0 && cleanNumber.length !== requiredDigits) {
      setPhoneError(`Phone number must be ${requiredDigits} digits for ${countryCodes.find(c => c.code === detectedCode && !c.disabled)?.country}`);
    } else {
      setPhoneError('');
    }
  };

  // Validate on country code change
  const handleCountryCodeChange = (e) => {
    const newCode = e.target.value;
    setSelectedCountryCode(newCode);

    // Re-validate phone number with new country code
    const requiredDigits = getRequiredDigits(newCode);
    if (phoneNumber.length > 0 && phoneNumber.length !== requiredDigits) {
      setPhoneError(`Phone number must be ${requiredDigits} digits for ${countryCodes.find(c => c.code === newCode && !c.disabled)?.country}`);
    } else {
      setPhoneError('');
    }
  };

  // Wrapper to include phone in form submission
  const handleFormSubmit = async (data) => {
    // Validate phone number before submission
    if (!phoneNumber) {
      toast.error('Phone number is required');
      return;
    }
    if (phoneError) {
      toast.error('Please fix phone number errors before submitting');
      return;
    }

    // Add phone, country code, and verified email to form data
    // Convert text fields to uppercase (except email/password)
    const formData = {
      ...data,
      name: data.name ? data.name.toUpperCase() : data.name,
      occupation: data.occupation ? data.occupation.toUpperCase() : data.occupation,
      address: data.address ? data.address.toUpperCase() : data.address,
      referredByOther: data.referredByOther ? data.referredByOther.toUpperCase() : data.referredByOther,
      email: data.email,
      phone: phoneNumber,
      countryCode: selectedCountryCode
    };

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-start justify-center pt-4 sm:pt-8 px-2">
      <div className="relative w-full max-w-md p-4 sm:p-5 border shadow-lg rounded-lg bg-white max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">
            {patient ? 'Edit Patient' : 'Add New Patient'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-3">
          <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Referred By *
                </label>
                <select
                  {...register('referredBy', { required: 'Referred by is required' })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select...</option>
                  {referralOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  {referralOptionsWithTypes.map((option) => (
                    <option key={option.name} value={option.name}>{option.displayLabel}</option>
                  ))}
                </select>
                {errors.referredBy && <p className="text-red-500 text-xs mt-0.5">{errors.referredBy.message}</p>}
                {watch('referredBy') === 'Others' && (
                  <input
                    type="text"
                    {...register('referredByOther', { required: 'Please specify' })}
                    placeholder="Please specify"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 mt-2 uppercase"
                  />
                )}
                {errors.referredByOther && <p className="text-red-500 text-xs mt-0.5">{errors.referredByOther.message}</p>}
              </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              {...register('name', { required: 'Full name is required' })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
            />
            {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                {...register('dateOfBirth', {
                  required: 'Date of birth is required',
                  validate: (value) => {
                    const selectedDate = new Date(value);
                    const today = new Date();
                    if (selectedDate > today) {
                      return 'Date of Birth cannot be in the future';
                    }
                    return true;
                  }
                })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.dateOfBirth && <p className="text-red-500 text-xs mt-0.5">{errors.dateOfBirth.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="150"
                placeholder="Auto-calculated from DOB"
                readOnly
                {...register('age', {
                  required: 'Age is required (enter DOB to auto-calculate)',
                  min: { value: 0, message: 'Invalid age' },
                  max: { value: 150, message: 'Invalid age' }
                })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              {errors.age && <p className="text-red-500 text-xs mt-0.5">{errors.age.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Gender *
              </label>
              <select
                {...register('gender', { required: 'Gender is required' })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="text-red-500 text-xs mt-0.5">{errors.gender.message}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
              placeholder="patient@example.com"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>}
          </div>

          {!patient && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        {...register('password', {
                          required: 'Password is required',
                          minLength: {
                            value: 8,
                            message: 'Minimum 8 characters required'
                          },
                          validate: {
                            hasUpperCase: (value) => /[A-Z]/.test(value) || 'Must include uppercase letter (A-Z)',
                            hasLowerCase: (value) => /[a-z]/.test(value) || 'Must include lowercase letter (a-z)',
                            hasNumber: (value) => /[0-9]/.test(value) || 'Must include number (0-9)',
                            hasSpecialChar: (value) => /[!@#$%^&*(),.?":{}|<>]/.test(value) || 'Must include special character (@#$%...)'
                          }
                        })}
                        className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-red-500 text-xs mt-0.5">{errors.password.message}</p>}
                    <p className="text-xs text-gray-400 mt-1">Min 8 chars, uppercase, lowercase, number, special char (@#$)</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        {...register('confirmPassword', {
                          required: 'Please confirm password',
                          validate: (value, formValues) => value === formValues.password || 'Passwords do not match'
                        })}
                        className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && <p className="text-red-500 text-xs mt-0.5">{errors.confirmPassword.message}</p>}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Phone *
                </label>
                <div className="flex">
                  <select
                    value={selectedCountryCode}
                    onChange={handleCountryCodeChange}
                    className="w-32 px-1 py-1.5 text-xs border border-gray-300 border-r-0 rounded-l-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-gray-50"
                  >
                    {countryCodes.map((country, idx) => (
                      <option
                        key={`${country.code}-${idx}`}
                        value={country.code}
                        disabled={country.disabled}
                      >
                        {country.disabled ? country.country : `${country.flag} ${country.code}`}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder={`${getRequiredDigits(selectedCountryCode)} digits`}
                    maxLength={getRequiredDigits(selectedCountryCode)}
                    className={`flex-1 px-2.5 py-1.5 text-sm border rounded-r-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                      phoneError ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                </div>
                {phoneError && <p className="text-red-500 text-xs mt-0.5">{phoneError}</p>}
                {!phoneError && phoneNumber && <p className="text-green-600 text-xs mt-0.5">✓ Valid phone number</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Occupation *
                  </label>
                  <input
                    type="text"
                    {...register('occupation', { required: 'Occupation is required' })}
                    placeholder="e.g., Engineer, Student"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
                  />
                  {errors.occupation && <p className="text-red-500 text-xs mt-0.5">{errors.occupation.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Handedness *
                  </label>
                  <select
                    {...register('handedness', { required: 'Handedness is required' })}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Select...</option>
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                    <option value="ambidextrous">Ambidextrous</option>
                  </select>
                  {errors.handedness && <p className="text-red-500 text-xs mt-0.5">{errors.handedness.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('address', { required: 'Address is required' })}
                  placeholder="Enter address"
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
                />
                {errors.address && <p className="text-red-500 text-xs mt-0.5">{errors.address.message}</p>}
              </div>

          <div className="flex justify-end space-x-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-sm border border-transparent rounded-md font-medium text-white shadow-md bg-[#323956] hover:bg-[#232D3C] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting && (
                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {submitting ? 'Submitting...' : `${patient ? 'Update' : 'Add'} Patient`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Patient Details Component
const PatientDetails = ({ patient, clinicId, onBack }) => {
  const [reports, setReports] = useState([]);

  // Helper functions
  const getPatientName = () => patient?.fullName || patient?.full_name || patient?.name || 'Unknown';

  const getPatientAge = () => {
    if (patient?.age) return patient.age;
    if (patient?.medical_history?.age) return patient.medical_history.age;
    if (patient?.dateOfBirth || patient?.date_of_birth) {
      const dob = new Date(patient.dateOfBirth || patient.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    }
    return 'N/A';
  };

  useEffect(() => {
    const loadPatientReports = async () => {
      if (patient) {
        try {
          const patientReports = await DatabaseService.getReportsByPatient(patient.id) || [];
          setReports(patientReports);
        } catch (error) {
          console.error('Error loading patient reports:', error);
          setReports([]);
        }
      }
    };

    loadPatientReports();
  }, [patient]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="text-primary-600 hover:text-primary-800 font-medium"
        >
          ← Back to Patients
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center">
              <Users className="h-8 w-8 text-primary-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{getPatientName()}</h2>
              <p className="text-gray-600">{getPatientAge()} years • <span className="capitalize">{patient.gender || 'N/A'}</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Patient Information</h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <span className="text-sm text-gray-600">Age: </span>
                  <span className="text-sm font-medium text-gray-900">{getPatientAge()} years</span>
                  {(patient.date_of_birth || patient.dateOfBirth) && (
                    <span className="text-sm text-gray-500 ml-2">
                      (DOB: {new Date(patient.date_of_birth || patient.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                    </span>
                  )}
                </div>
              </div>
              
              {patient.email && (
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">{patient.email}</span>
                </div>
              )}
              
              {patient.phone && (
                <div className="flex items-center space-x-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">{patient.phone}</span>
                </div>
              )}
              
              {patient.address && (
                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <span className="text-sm text-gray-600">{patient.address}</span>
                </div>
              )}
              
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Added {new Date(patient.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
                </span>
              </div>
            </div>

            {patient.notes && (
              <div className="pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Medical Notes</h4>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">{patient.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Reports ({reports.length})</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reports.length > 0 ? (
                reports.map(report => (
                  <div key={report.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <FileText className="h-5 w-5 text-[#323956]" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {report.fileName || 'EEG Report'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(report.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button className="text-primary-600 hover:text-primary-800">
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No reports for this patient</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Patient List Modal Component
const PatientListModal = ({ onAddPatients, onClose }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [fileName, setFileName] = useState('');

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }
      
      setSelectedFile(file);
      setFileName(file.name);
      parseCSVFile(file);
    }
  };

  const parseCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvContent = e.target.result;
        const lines = csvContent.split('\n').filter(line => line.trim());
        const patients = [];
        
        // Skip header row if it exists
        const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(',').map(part => part.trim());
          if (parts.length < 3) {
            toast.error(`Line ${i + 1}: Invalid format. Use: name,age,gender,email,phone`);
            return;
          }
          
          const [name, age, gender, email = '', phone = ''] = parts;
          
          if (!name || !age || !gender) {
            toast.error(`Line ${i + 1}: Name, age, and gender are required`);
            return;
          }
          
          if (isNaN(age) || age < 0 || age > 120) {
            toast.error(`Line ${i + 1}: Invalid age`);
            return;
          }
          
          if (!['Male', 'Female', 'Other'].includes(gender)) {
            toast.error(`Line ${i + 1}: Gender must be Male, Female, or Other`);
            return;
          }
          
          patients.push({
            name,
            age: parseInt(age),
            gender,
            email,
            phone
          });
        }
        
        setPreviewData(patients);
        toast.success(`SUCCESS: Found ${patients.length} valid patients in CSV file`);
        
      } catch (error) {
        console.error('Error parsing CSV:', error);
        toast.error('Error parsing CSV file');
      }
    };
    
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedFile || previewData.length === 0) {
      toast.error('Please select a CSV file with valid patient data');
      return;
    }

    try {
      setIsAdding(true);
      await onAddPatients(previewData);
      
    } catch (error) {
      console.error('Error adding patients:', error);
      toast.error('Error adding patients');
    } finally {
      setIsAdding(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFileName('');
    setPreviewData([]);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-6 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-medium text-gray-900">
            Add Patient List
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-[#E4EFFF] rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">INFO: Instructions:</h4>
          <p className="text-sm text-blue-800 mb-2">
            Upload a CSV file with patient data. The file should contain:
          </p>
          <p className="text-sm text-blue-700 font-mono">
            name,age,gender,email,phone
          </p>
          <p className="text-sm text-blue-700 mt-2">
            <strong>Example CSV content:</strong><br/>
            John Doe,25,Male,john@email.com,1234567890<br/>
            Jane Smith,30,Female,jane@email.com,0987654321
          </p>
          <p className="text-sm text-blue-700 mt-2">
            <strong>Note:</strong> The first row can be a header (name,age,gender,email,phone) and will be automatically skipped.
          </p>
          <div className="mt-3">
            <a 
              href="/sample-patients.csv" 
              download
              className="text-[#323956] hover:text-blue-800 underline text-sm"
            >
               Download Sample CSV Template
            </a>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload CSV File
            </label>
            
            {!selectedFile ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-500 transition-colors">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csvFileInput"
                  disabled={isAdding}
                />
                <label htmlFor="csvFileInput" className="cursor-pointer">
                  <div className="text-gray-600">
                    <div className="text-4xl mb-2"></div>
                    <p className="text-lg font-medium">Click to upload CSV file</p>
                    <p className="text-sm">or drag and drop</p>
                    <p className="text-xs text-gray-500 mt-2">Supports .csv files only</p>
                  </div>
                </label>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-[#323956] text-2xl">SUCCESS:</div>
                    <div>
                      <p className="font-medium text-gray-900">{fileName}</p>
                      <p className="text-sm text-gray-600">
                        {previewData.length} patients found
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-red-600 hover:text-red-800"
                    disabled={isAdding}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {previewData.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preview ({previewData.length} patients)
              </label>
              <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-3 bg-gray-50">
                {previewData.slice(0, 5).map((patient, index) => (
                  <div key={index} className="text-sm text-gray-700 mb-1">
                    <span className="font-medium">{patient.name}</span> - {patient.age} years, {patient.gender}
                    {patient.email && ` - ${patient.email}`}
                  </div>
                ))}
                {previewData.length > 5 && (
                  <div className="text-sm text-gray-500 italic">
                    ... and {previewData.length - 5} more patients
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#323956] hover:bg-green-700 text-white rounded-md font-medium"
              disabled={isAdding || !selectedFile}
            >
              {isAdding ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Adding...</span>
                </div>
              ) : (
                `Add ${previewData.length} Patients`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PatientManagement;
