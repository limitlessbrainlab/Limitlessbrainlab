import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  FileText,
  Lock,
  Eye,
  EyeOff,
  Save,
  X,
  ArrowLeft,
  Upload,
  ClipboardList,
  Building2
} from 'lucide-react';
import DatabaseService from '../../services/databaseService';
import { useAuth } from '../../contexts/AuthContext';
import { generatePatientUID } from '../../utils/patientUidGenerator';
import { hashPassword } from '../../utils/passwordUtils';
import { supabase } from '../../lib/supabaseClient';

const AddPatientForm = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email validation state
  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    exists: false,
    message: ''
  });
  const emailCheckTimeout = useRef(null);

  // File upload states
  const [uploadedFiles, setUploadedFiles] = useState({
    mentalStatus: null,
    neuroExam: null,
    psychiatricScales: null,
    otherReports: null,
    eyesOpenEdf: null,
    eyesClosedEdf: null
  });

  // Recording protocol states
  const [recordingProtocol, setRecordingProtocol] = useState({
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

  // Administrative details states
  const [adminDetails, setAdminDetails] = useState({
    reportingClinician: '',
    dateOfReport: '',
    institutionName: '',
    partnerPlatform: '',
    uniqueReportId: '',
    contactPhone: '',
    contactEmail: '',
    contactAddress: ''
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors }
  } = useForm();

  // Calculate age from date of birth
  const calculateAge = (dob) => {
    if (!dob) {
      setValue('age', '');
      return;
    }
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    setValue('age', age >= 0 ? age.toString() : '', { shouldValidate: true });
  };

  // Handle file upload
  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({ ...prev, [fileType]: file }));
    }
  };

  const clinicId = user?.clinic_id || user?.clinicId;

  // ✅ EMAIL VALIDATION WITH DEBOUNCING
  const checkEmailExists = (email) => {
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    if (!email || email.length < 5) {
      setEmailStatus({ checking: false, exists: false, message: '' });
      return;
    }

    setEmailStatus(prev => ({ ...prev, checking: true }));

    emailCheckTimeout.current = setTimeout(async () => {
      try {
        // Check patients table
        const { data: existingPatient } = await supabase
          .from('patients')
          .select('id, full_name, email')
          .eq('email', email.toLowerCase().trim())
          .limit(1);

        if (existingPatient && existingPatient.length > 0) {
          setEmailStatus({
            checking: false,
            exists: true,
            message: `❌ Email already registered as patient: ${existingPatient[0].full_name}`
          });
          return;
        }

        // Check clinics table
        const { data: existingClinic } = await supabase
          .from('clinics')
          .select('id, name')
          .eq('email', email.toLowerCase().trim())
          .limit(1);

        if (existingClinic && existingClinic.length > 0) {
          setEmailStatus({
            checking: false,
            exists: true,
            message: `❌ Email already registered as clinic: ${existingClinic[0].name}`
          });
          return;
        }

        // Email is available
        setEmailStatus({
          checking: false,
          exists: false,
          message: '✅ Email is available'
        });
      } catch (error) {
        console.error('Email check error:', error);
        setEmailStatus({
          checking: false,
          exists: false,
          message: '❌ Error checking email'
        });
      }
    }, 500); // 500ms debounce
  };

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);

      if (!clinicId) {
        toast.error('Clinic information not found');
        return;
      }

      // ✅ EMAIL VALIDATION - Check if email already exists
      const normalizedEmail = data.email.toLowerCase().trim();

      // Check in patients table
      const { data: existingPatient, error: patientError } = await supabase
        .from('patients')
        .select('id, full_name, email')
        .eq('email', normalizedEmail)
        .limit(1);

      if (existingPatient && existingPatient.length > 0) {
        toast.error(`❌ Email already registered as patient: ${existingPatient[0].full_name}`);
        setIsSubmitting(false);
        return;
      }

      // Check in clinics table
      const { data: existingClinic, error: clinicCheckError } = await supabase
        .from('clinics')
        .select('id, name')
        .eq('email', normalizedEmail)
        .limit(1);

      if (existingClinic && existingClinic.length > 0) {
        toast.error(`❌ Email already registered as clinic: ${existingClinic[0].name}`);
        setIsSubmitting(false);
        return;
      }

      // Check if clinic has available report credits
      const { data: clinicData } = await supabase
        .from('clinics')
        .select('reports_allowed, reports_used, name, email, clinic_type')
        .eq('id', clinicId)
        .single();

      const reportsAllowed = clinicData?.reports_allowed || 0;
      const reportsUsed = clinicData?.reports_used || 0;
      const reportsRemaining = reportsAllowed - reportsUsed;

      // Default clinic has unlimited report generation — skip credit check
      const DEFAULT_CLINIC_ID = 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30';
      const isDefaultClinic = clinicId === DEFAULT_CLINIC_ID;

      if (!isDefaultClinic && reportsRemaining <= 0) {
        toast.error('You have no report credits remaining. Please purchase a package to continue adding patients.');
        // Send no-credit email notification
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://limitlessbrainlab-backend.onrender.com';
        fetch(`${BACKEND_URL}/api/send-no-credit-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicEmail: clinicData?.email || user?.email,
            clinicName: clinicData?.name || user?.clinicName,
            clinicType: clinicData?.clinic_type || 'clinic'
          })
        }).catch(() => {}); // fire and forget
        setIsSubmitting(false);
        return;
      }

      // Create Supabase auth account for patient
      let authCreated = false;
      try {
        await DatabaseService.createPatientAuth(data.email, data.password, {
          full_name: data.name,
          role: 'patient'
        });
        authCreated = true;
      } catch (authError) {
        console.error('Auth creation error:', authError);

        // Check if it's a duplicate user error
        if (authError.message?.includes('already registered') ||
            authError.message?.includes('User already exists')) {
          toast.error('This email is already registered. Please use a different email.');
          setIsSubmitting(false);
          return;
        }
      }

      // Generate patient UID in format CLINICCODE-YYYYMM-XXXX
      const patientUID = await generatePatientUID(clinicId);

      // Map fields to match database schema (uppercase text fields except email)
      const patientData = {
        org_id: clinicId,
        external_id: patientUID,
        full_name: data.name ? data.name.toUpperCase() : data.name,
        gender: data.gender?.toLowerCase(),
        email: data.email,
        phone: data.phone,
        address: data.address ? data.address.toUpperCase() : data.address,
        medical_history: data.notes ? { notes: data.notes } : {},
        date_of_birth: data.dateOfBirth || null,
        created_at: new Date().toISOString()
      };

      await DatabaseService.add('patients', patientData);

      // Send welcome email in background (don't block the UI)
      if (authCreated) {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');

        // Get clinic SMTP config
        const clinicData = await DatabaseService.findById('clinics', clinicId);
        const smtpEmail = clinicData?.smtpEmail || clinicData?.smtp_email || '';
        const smtpPass = clinicData?.smtpPassword || clinicData?.smtp_password || '';

        const { data: welcomeSession } = await supabase.auth.getSession();
        const welcomeToken = welcomeSession?.session?.access_token;
        const welcomeHeaders = { 'Content-Type': 'application/json' };
        if (welcomeToken) welcomeHeaders['Authorization'] = `Bearer ${welcomeToken}`;
        fetch(`${baseUrl}/api/send-welcome-email`, {
          method: 'POST',
          headers: welcomeHeaders,
          body: JSON.stringify({
            patientName: data.name,
            email: data.email,
            password: data.password,
            clinicName: user?.clinicName || user?.name || 'Your Clinic',
            clinicSmtpEmail: smtpEmail,
            clinicSmtpPassword: smtpPass
          })
        }).catch(emailError => {
          console.error('Failed to send welcome email:', emailError);
        });
      }

      // Show success message
      if (authCreated) {
        toast.success(
          `Patient created successfully!\n\nLogin credentials will be sent to ${data.email}`,
          { duration: 10000 }
        );
      } else {
        toast.success(`Patient record created with UID: ${patientUID}`);
      }

      // Reset form
      reset();

      // Navigate to patient management after short delay
      setTimeout(() => {
        navigate('/clinic/patients');
      }, 2000);

    } catch (error) {
      console.error('Error adding patient:', error);
      toast.error('Failed to add patient: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-4">
          <button
            onClick={() => navigate('/clinic/patients')}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-2 transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Patient Management
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Add New Patient</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Fill in patient information</p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
            {/* Personal Information Section */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <User className="h-4 w-4 mr-2 text-primary-600" />
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Full Name */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('name', { required: 'Full name is required' })}
                    type="text"
                    placeholder="Enter patient's full name"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white uppercase"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
                  )}
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      {...register('dateOfBirth', {
                        required: 'Date of birth is required',
                        onChange: (e) => calculateAge(e.target.value)
                      })}
                      type="date"
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  {errors.dateOfBirth && (
                    <p className="mt-1 text-xs text-red-500">{errors.dateOfBirth.message}</p>
                  )}
                </div>

                {/* Age */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Age <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...register('age', { required: 'Age is required' })}
                    type="number"
                    min="0"
                    max="150"
                    readOnly
                    placeholder="Auto-calculated from DOB"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 dark:text-white cursor-not-allowed"
                  />
                  {errors.age && (
                    <p className="mt-1 text-xs text-red-500">{errors.age.message}</p>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Gender
                  </label>
                  <select
                    {...register('gender')}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Information Section */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Mail className="h-4 w-4 mr-2 text-primary-600" />
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address'
                        }
                      })}
                      type="email"
                      placeholder="patient@example.com"
                      onChange={(e) => checkEmailExists(e.target.value)}
                      className={`w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white ${
                        emailStatus.exists
                          ? 'border-red-500 focus:ring-red-500'
                          : !emailStatus.exists && emailStatus.message && !emailStatus.checking
                          ? 'border-green-500 focus:ring-green-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {emailStatus.checking && (
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm">⟳</span>
                    )}
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
                  )}
                  {emailStatus.message && (
                    <p className={`mt-1 text-xs ${emailStatus.exists ? 'text-red-500' : 'text-green-600'}`}>
                      {emailStatus.message}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      {...register('phone')}
                      type="tel"
                      placeholder="+91 1234567890"
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                    <textarea
                      {...register('address')}
                      rows={2}
                      placeholder="Enter complete address"
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Login Credentials Section */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Lock className="h-4 w-4 mr-2 text-primary-600" />
                Login Credentials
              </h2>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 8,
                        message: 'Password must be at least 8 characters'
                      }
                    })}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a secure password"
                    className="w-full pl-8 pr-10 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Password will be used for patient login.
                </p>
              </div>
            </div>

            {/* Medical Notes Section */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <FileText className="h-4 w-4 mr-2 text-primary-600" />
                Medical Notes (Optional)
              </h2>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Additional Notes
                </label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  placeholder="Any relevant medical history or notes..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => navigate('/clinic/patients')}
                disabled={isSubmitting}
                className="px-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <X className="h-4 w-4 inline mr-1" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || emailStatus.exists || emailStatus.checking}
                className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-1" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Create Patient
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Information Note */}
        <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> A unique Patient UID will be automatically generated in the format <code className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-xs">CLINICCODE-YYYYMM-XXXX</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AddPatientForm;
