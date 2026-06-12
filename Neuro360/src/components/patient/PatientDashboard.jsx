import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import bookingService from '../../services/bookingService';
import progressTrackingService from '../../services/progressTrackingService';
import { supabase } from '../../lib/supabaseClient';
import DatabaseService from '../../services/databaseService';
import StorageService from '../../services/storageService';
import brainRegionService from '../../services/brainRegionService';
import KSB_27_COMBINATIONS from '../../utils/ksb27Combinations';
import KSB_27_PROTOCOLS_P123 from '../../utils/ksb27ProtocolsP123';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import ProfileModal from '../layout/ProfileModal';
import ClinicalReportForm from '../clinic/ClinicalReportForm';
import DDOLink from '../DDOLink';
import {
  User,
  FileText,
  Calendar,
  Brain,
  Building2,
  Download,
  Heart,
  Target,
  MapPin,
  Clock,
  TrendingUp,
  Star,
  Book,
  Video,
  Phone,
  Mail,
  ChevronRight,
  ChevronDown,
  Plus,
  Activity,
  LogOut,
  Eye,
  Home,
  Pill,
  Shield,
  Briefcase,
  Cake,
  Menu,
  X,
  Quote,
  HelpCircle,
  Zap,
  Battery,
  Smile,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  Music,
  Headphones,
  FlaskConical,
  UserCheck,
  Radio,
  Award,
  Wallet,
  Play,
  ClipboardList,
  Pencil,
  Save,
  Hand,
  ShoppingCart,
  ExternalLink,
  Sparkles,
  Moon,
  Waves,
  Sun,
  AlertTriangle,
  BookOpen,
  ChevronUp,
  ChevronLeft,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Flame,
  Info,
  MessageCircle,
  Lock,
  CreditCard,
  Check,
  Facebook,
  Instagram,
  Linkedin,
  BarChart3,
  Pause,
  TrendingDown,
  BrainCircuit,
  Search,
  AlertCircle,
  Users
} from 'lucide-react';

// Import page components for sidebar sections
import ANSResetProtocol from '../../pages/ANSResetProtocol';
import FrequenciesMusic from '../../pages/FrequenciesMusic';
import SupplementsNootropics from '../../pages/SupplementsNootropics';
import FivePillars from '../../pages/FivePillars';
import NeuroCoaching from '../../pages/NeuroCoaching';
import BrainCoach from '../../pages/BrainCoach';
import HomeNeurofeedback from '../../pages/HomeNeurofeedback';
import Photobiomodulation from '../../pages/Photobiomodulation';
import WalletPage from '../../pages/Wallet';
import OpeningPage from '../../pages/OpeningPage';
import InteractiveBrain from '../../pages/InteractiveBrain';
import MyBookings from './MyBookings';
import BrainCourses from '../../pages/BrainCourses';
import Events from '../../pages/Events';
import ProfileGate from './ProfileGate';
import { getCareProtocol } from '../../utils/careProtocolLookup';

const PatientDashboard = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Get active tab from URL pathname
  // Example: /dashboard/profile -> activeTab = 'profile'
  // Example: /dashboard -> activeTab = 'welcome' (default)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeTab = pathParts.length > 1 ? pathParts[1] : 'welcome';
  const [appointments, setAppointments] = useState([]);
  const [appointmentStats, setAppointmentStats] = useState({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBrainParamsExpanded, setIsBrainParamsExpanded] = useState(false);
  const [progressData, setProgressData] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patientUid, setPatientUid] = useState(null);
  const [patientClinicId, setPatientClinicId] = useState(null);
  const [clinicalReport, setClinicalReport] = useState(null);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [patientReports, setPatientReports] = useState([]);
  const [patientDbId, setPatientDbId] = useState(null);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [algorithmResults, setAlgorithmResults] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [showClinicalReportForm, setShowClinicalReportForm] = useState(false);
  const [brainParameters, setBrainParameters] = useState(null);
  const [showClinicalHistoryPopup, setShowClinicalHistoryPopup] = useState(false);
  const [showScanRequiredPopup, setShowScanRequiredPopup] = useState(false);
  const [scanRequiredParam, setScanRequiredParam] = useState('');
  const [showPaymentSuccessPopup, setShowPaymentSuccessPopup] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState(null);
  // Ref for auto-scrolling to locked popup
  const lockedPopupRef = useRef(null);

  // Tabs that require a completed NeuroSense report to access
  const lockedTabIds = [
    'cognition', 'stress', 'focus-attention', 'burnout-fatigue',
    'emotional-regulation', 'learning', 'creativity',
    'neurosense-reports'
  ];
  const isTabLocked = (tabId) => lockedTabIds.includes(tabId) && !algorithmResults && !loading;

  // Auto-scroll to locked popup when locked tab is opened
  useEffect(() => {
    if (isTabLocked(activeTab) && lockedPopupRef.current) {
      setTimeout(() => {
        lockedPopupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [activeTab, algorithmResults]);

  // Feedback form state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    rating: 0,
    category: '',
    message: ''
  });
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileFormData, setProfileFormData] = useState({
    name: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    emergencyContact: '',
    gender: '',
    handedness: '',
    occupation: '',
    referral_reason: ''
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Assessment purchase state
  const [purchasedAssessments, setPurchasedAssessments] = useState([]);
  const [isProcessingAssessmentPayment, setIsProcessingAssessmentPayment] = useState(null);

  // JotForm iframe modal state
  const [activeJotForm, setActiveJotForm] = useState(null); // { title, link }

  // Fetch purchased assessments by patient_email
  const fetchPurchasedAssessments = useCallback(async () => {
    if (!user?.email) return;
    try {
      const { data, error } = await supabase
        .from('assessment_purchases')
        .select('assessment_id')
        .eq('patient_email', user.email.toLowerCase());

      if (!error && data) {
        const uniqueIds = [...new Set(data.map(p => p.assessment_id))];
        setPurchasedAssessments(uniqueIds);
      }
    } catch (error) {
      console.error('Error fetching assessment purchases:', error);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user?.id) {
      fetchPurchasedAssessments();
    }
  }, [user?.id, fetchPurchasedAssessments]);

  // Show clinical history popup when entering profile page
  useEffect(() => {
    if (activeTab === 'profile' && !loading && clinicalReport === null) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setShowClinicalHistoryPopup(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loading, clinicalReport]);

  // Handle assessment purchase
  const handleAssessmentPurchase = async (assessmentId, assessmentTitle, price) => {
    if (!user?.email) {
      toast.error('Please log in to make a purchase');
      return;
    }
    setIsProcessingAssessmentPayment(assessmentId);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      // Find assessment link for email delivery
      const assessmentData = [
        { id: 'brain_fitness', link: 'https://form.jotform.com/233250136675151' },
        { id: 'brain_burnout', link: 'https://form.jotform.com/260117244562148' },
        { id: 'brain_age', link: 'https://form.jotform.com/252245065792056' },
        { id: 'dementia_index', link: 'https://form.jotform.com/260034749079159' },
        { id: 'assessment_bundle', link: 'https://form.jotform.com/233250136675151,https://form.jotform.com/260117244562148,https://form.jotform.com/252245065792056,https://form.jotform.com/260034749079159' }
      ];
      const assessmentLink = assessmentData.find(a => a.id === assessmentId)?.link || '';

      const response = await fetch(`${API_URL}/create-assessment-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          assessmentName: assessmentTitle,
          customerEmail: user.email,
          customerName: user.name || user.user_metadata?.full_name || user.email,
          amount: price,
          assessmentLink,
          patientId: user.id,
          clinicId: patientClinicId,
          source: 'patient_dashboard'
        }),
      });
      const data = await response.json();
      if (data.success && data.checkoutUrl) {
        // Save return URL so auth can redirect back after Stripe
        localStorage.setItem('paymentReturnUrl', `/dashboard/about-brain?payment=success&assessment=${assessmentId}`);
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment processing failed. Please try again.');
    } finally {
      setIsProcessingAssessmentPayment(null);
    }
  };

  // Check for successful assessment payment on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment') || urlParams.get('assessment_payment');
    const assessmentId = urlParams.get('assessment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && assessmentId) {
      // Save payment directly to database
      const savePatientPayment = async () => {
        try {
          const assessmentNames = {
            brain_fitness: 'Brain Fitness Score',
            brain_burnout: 'Brain Burnout Score',
            brain_age: 'Neuro Age Estimator',
            dementia_index: 'Dementia Probability Index',
            assessment_bundle: 'Complete Brain Assessment Bundle'
          };
          const assessmentLinks = {
            brain_fitness: 'https://form.jotform.com/233250136675151',
            brain_burnout: 'https://form.jotform.com/260117244562148',
            brain_age: 'https://form.jotform.com/252245065792056',
            dementia_index: 'https://form.jotform.com/260034749079159',
            assessment_bundle: 'https://form.jotform.com/233250136675151,https://form.jotform.com/260117244562148,https://form.jotform.com/252245065792056,https://form.jotform.com/260034749079159'
          };

          // Check if already saved (prevent duplicates on page refresh)
          if (sessionId) {
            const { data: existing } = await supabase
              .from('patient_payments')
              .select('id')
              .eq('stripe_session_id', sessionId)
              .limit(1);
            if (existing && existing.length > 0) {
              return;
            }
          }

          // Fetch clinic_id from patients table directly (patientClinicId may not be set yet after redirect)
          let clinicIdForPayment = patientClinicId || null;
          let patientRecordForEmail = null;
          if (!clinicIdForPayment) {
            // Try by user id first (unique, most accurate)
            if (user?.id) {
              const { data: patientRow } = await supabase
                .from('patients')
                .select('*')
                .eq('id', user.id)
                .limit(1)
                .single();
              if (patientRow) {
                patientRecordForEmail = patientRow;
                clinicIdForPayment = patientRow.clinic_id || patientRow.org_id || null;
              }
            }
            // Fallback: try by email with most recent record
            if (!clinicIdForPayment && user?.email) {
              const { data: patientsByEmail } = await supabase
                .from('patients')
                .select('*')
                .eq('email', user.email.toLowerCase())
                .order('created_at', { ascending: false })
                .limit(1);
              if (patientsByEmail && patientsByEmail.length > 0) {
                patientRecordForEmail = patientsByEmail[0];
                clinicIdForPayment = patientsByEmail[0].clinic_id || patientsByEmail[0].org_id || null;
              }
            }
          }

          // Save to patient_payments
          const { error: ppError } = await supabase
            .from('patient_payments')
            .insert({
              clinic_id: clinicIdForPayment,
              patient_id: user.id || null,
              patient_email: user.email.toLowerCase(),
              patient_name: user.name || user.user_metadata?.full_name || '',
              amount: assessmentId === 'assessment_bundle' ? 19.99 : 2.99,
              currency: 'USD',
              status: 'completed',
              type: 'assessment',
              item_name: assessmentNames[assessmentId] || 'Brain Assessment',
              assessment_id: assessmentId,
              assessment_link: assessmentLinks[assessmentId] || '',
              stripe_session_id: sessionId || null,
              source: 'About the Brain',
              created_at: new Date().toISOString()
            });

          if (ppError) {
            console.error('patient_payments save error:', ppError);
          } else {
          }

          // Also save to assessment_purchases for button state
          const { error: apError } = await supabase
            .from('assessment_purchases')
            .insert({
              patient_email: user.email.toLowerCase(),
              assessment_id: assessmentId,
              assessment_name: assessmentNames[assessmentId] || 'Brain Assessment',
              assessment_link: assessmentLinks[assessmentId] || '',
              stripe_session_id: sessionId || null,
              amount_paid: assessmentId === 'assessment_bundle' ? 19.99 : 2.99,
              currency: 'USD',
              status: 'completed',
              purchased_at: new Date().toISOString()
            });

          if (apError) {
          }

          // Handle bundle — mark all 4 assessments as purchased
          if (assessmentId === 'assessment_bundle') {
            const bundleIds = ['brain_fitness', 'brain_burnout', 'brain_age', 'dementia_index'];
            for (const bId of bundleIds) {
              await supabase.from('assessment_purchases').insert({
                patient_email: user.email.toLowerCase(),
                assessment_id: bId,
                assessment_name: assessmentNames[bId],
                assessment_link: assessmentLinks[bId],
                stripe_session_id: sessionId ? `${sessionId}_${bId}` : null,
                amount_paid: 0,
                currency: 'USD',
                status: 'completed',
                purchased_at: new Date().toISOString()
              }).catch(err => console.warn(`Bundle item ${bId} save skipped:`, err.message));
            }
          }
          // Send JotForm link email to patient
          try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const emailAssessmentLink = assessmentLinks[assessmentId] || '';
            const emailAmountPaid = assessmentId === 'assessment_bundle' ? '19.99' : '2.99';

            // Fetch clinic name and patient details from DB directly (patientData may still be loading)
            let emailClinicName = '';
            if (clinicIdForPayment) {
              const { data: clinicRow } = await supabase
                .from('clinics')
                .select('name')
                .eq('id', clinicIdForPayment)
                .limit(1)
                .single();
              emailClinicName = clinicRow?.name || '';
            }

            // Use patient record already fetched above (patientRecordForEmail)
            const patRow = patientRecordForEmail;
            let patientDetails = {
              name: patRow?.full_name || patRow?.name || user.name || user.user_metadata?.full_name || '',
              email: patRow?.email || user.email || '',
              phone: patRow?.phone || '',
              dob: patRow?.date_of_birth || '',
              gender: patRow?.gender || '',
              patientId: patRow?.external_id || ''
            };

            await fetch(`${API_URL}/send-assessment-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerEmail: user.email,
                customerName: patientDetails.name,
                assessmentName: assessmentNames[assessmentId] || 'Brain Assessment',
                assessmentLink: emailAssessmentLink,
                amountPaid: emailAmountPaid,
                currency: 'USD',
                transactionId: sessionId || '',
                source: 'patient_dashboard',
                clinicName: emailClinicName,
                clinicId: clinicIdForPayment || '',
                patientPhone: patientDetails.phone,
                patientDob: patientDetails.dob,
                patientGender: patientDetails.gender,
                patientUid: patientDetails.patientId
              })
            });
          } catch (emailErr) {
          }

        } catch (err) {
          console.error('Error saving payment data:', err);
        }
      };

      const assessmentNames = {
        brain_fitness: 'Brain Fitness Score',
        brain_burnout: 'Brain Burnout Score',
        brain_age: 'Neuro Age Estimator',
        dementia_index: 'Dementia Probability Index',
        assessment_bundle: 'Complete Brain Assessment Bundle'
      };
      const prices = {
        brain_fitness: '$2.99 USD',
        brain_burnout: '$2.99 USD',
        brain_age: '$2.99 USD',
        dementia_index: '$2.99 USD',
        assessment_bundle: '$19.99 USD'
      };

      setPaymentSuccessDetails({
        name: assessmentNames[assessmentId] || 'Brain Assessment',
        amount: prices[assessmentId] || '$9.99 USD',
        email: user?.email || '',
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        transactionId: sessionId || 'N/A'
      });
      setShowPaymentSuccessPopup(true);

      savePatientPayment();
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchPurchasedAssessments();
    } else if (paymentStatus === 'cancelled') {
      toast.error('Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchPurchasedAssessments, user?.id, user?.email, patientClinicId]);

  const handleLogout = async () => {
    await logout();
  };

  // Handle feedback submission
  const handleSubmitFeedback = async () => {
    if (!feedbackData.message.trim()) {
      toast.error('Please enter your feedback message');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const patientName = patientData?.profile?.name || user?.email;
      const patientEmail = user?.email;

      // Save feedback to Supabase
      const { error } = await supabase.from('patient_feedback').insert({
        patient_id: patientUid,
        patient_email: patientEmail,
        patient_name: patientName,
        rating: feedbackData.rating || null,
        category: feedbackData.category || 'general',
        message: feedbackData.message,
        created_at: new Date().toISOString()
      });

      if (error) {
      }

      // Send email notification via API
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      try {
        const response = await fetch(`${API_BASE_URL}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientName: patientName,
            patientEmail: patientEmail,
            rating: feedbackData.rating || null,
            category: feedbackData.category || 'general',
            message: feedbackData.message
          })
        });
        const result = await response.json();
        if (result.success) {
        }
      } catch (emailError) {
      }

      toast.success('Thank you for your feedback!');
      setShowFeedbackModal(false);
      setFeedbackData({ rating: 0, category: '', message: '' });
    } catch (error) {
      console.error('Feedback error:', error);
      toast.success('Thank you for your feedback!');
      setShowFeedbackModal(false);
      setFeedbackData({ rating: 0, category: '', message: '' });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // Handle profile edit - populate form with current data
  // Also check clinicalReport for fields like handedness, occupation, referral_reason
  const handleEditProfile = () => {
    setProfileFormData({
      name: patientData.profile.name || clinicalReport?.full_name || '',
      phone: patientData.profile.phone || '',
      dateOfBirth: patientData.profile.dateOfBirth || clinicalReport?.date_of_birth || '',
      address: patientData.profile.address || '',
      emergencyContact: patientData.profile.emergencyContact || '',
      gender: patientData.profile.gender || clinicalReport?.gender || '',
      handedness: patientData.profile.handedness || clinicalReport?.handedness || '',
      occupation: patientData.profile.occupation || clinicalReport?.occupation || '',
      referral_reason: patientData.profile.referral_reason || clinicalReport?.referral_reason || ''
    });
    setIsEditingProfile(true);
  };

  // Handle profile form input change
  const handleProfileInputChange = (e) => {
    const { name, value } = e.target;
    setProfileFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Save profile to database
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      // Find patient record by email
      const patients = await DatabaseService.get('patients');
      const patientRecord = patients.find(p =>
        p.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()
      );

      if (!patientRecord) {
        toast.error('Patient record not found');
        setIsSavingProfile(false);
        return;
      }

      // Store extra profile fields in medical_history JSON
      // These fields don't exist as columns in the patients table
      const extraProfileData = {
        emergency_contact: profileFormData.emergencyContact || '',
        handedness: profileFormData.handedness || '',
        occupation: profileFormData.occupation || '',
        referral_reason: profileFormData.referral_reason || ''
      };

      // Get existing medical_history and merge with extra profile data
      const existingMedicalHistory = patientRecord.medical_history || {};
      const updatedMedicalHistory = {
        ...existingMedicalHistory,
        profile_details: extraProfileData
      };

      // Update patient record with new data
      // Only include fields that exist in the Supabase patients table
      // Note: gender column uses enum type that expects lowercase values
      const updateData = {
        name: profileFormData.name,
        full_name: profileFormData.name,
        phone: profileFormData.phone,
        date_of_birth: profileFormData.dateOfBirth,
        address: profileFormData.address,
        gender: profileFormData.gender?.toLowerCase() || null,
        medical_history: updatedMedicalHistory,
        updated_at: new Date().toISOString()
      };

      await DatabaseService.update('patients', patientRecord.id, updateData);

      // Also update/create clinical_reports table with profile data
      if (supabase) {
        try {
          // Check if clinical report exists for this patient
          const { data: existingReports, error: fetchError } = await supabase
            .from('clinical_reports')
            .select('id')
            .eq('patient_id', patientRecord.id)
            .limit(1);

          if (fetchError) {
            console.error('Error fetching clinical report:', fetchError);
          } else {
            const clinicalReportData = {
              patient_id: patientRecord.id,
              patient_uid: patientUid || patientRecord.external_id,
              org_id: patientRecord.org_id,
              clinic_name: patientRecord.clinic_name,
              full_name: profileFormData.name,
              date_of_birth: profileFormData.dateOfBirth || null,
              gender: profileFormData.gender?.toLowerCase() || null,
              handedness: profileFormData.handedness || null,
              occupation: profileFormData.occupation || null,
              referral_reason: profileFormData.referral_reason || null,
              updated_at: new Date().toISOString()
            };

            if (existingReports && existingReports.length > 0) {
              // Update existing clinical report
              const { error: updateError } = await supabase
                .from('clinical_reports')
                .update(clinicalReportData)
                .eq('id', existingReports[0].id);

              if (updateError) {
                console.error('Error updating clinical report:', updateError);
              } else {
                // Refresh clinical report data
                fetchClinicalReport(patientRecord.id);
              }
            } else {
              // Create new clinical report with profile data
              clinicalReportData.created_at = new Date().toISOString();

              const { error: insertError } = await supabase
                .from('clinical_reports')
                .insert(clinicalReportData);

              if (insertError) {
                console.error('Error creating clinical report:', insertError);
              } else {
                // Refresh clinical report data
                fetchClinicalReport(patientRecord.id);
              }
            }
          }
        } catch (clinicalError) {
          console.error('Error updating clinical_reports:', clinicalError);
          // Don't fail the whole save operation if clinical reports fails
        }
      }

      // Update local state
      setPatientData(prev => ({
        ...prev,
        profile: {
          ...prev.profile,
          name: profileFormData.name,
          phone: profileFormData.phone,
          dateOfBirth: profileFormData.dateOfBirth,
          address: profileFormData.address,
          emergencyContact: profileFormData.emergencyContact,
          gender: profileFormData.gender,
          handedness: profileFormData.handedness,
          occupation: profileFormData.occupation,
          referral_reason: profileFormData.referral_reason
        }
      }));

      setIsEditingProfile(false);
      toast.success('Profile saved successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Fetch clinical report for the patient
  const fetchClinicalReport = async (patientId) => {
    try {

      if (!supabase) {
        return;
      }

      const { data: reports, error } = await supabase
        .from('clinical_reports')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('ERROR: Failed to fetch clinical report:', error);
        return;
      }

      if (reports && reports.length > 0) {
        const report = reports[0];
        setClinicalReport(report);

        // Also update patientData.profile with clinical report fields
        setPatientData(prev => ({
          ...prev,
          profile: {
            ...prev.profile,
            // Only update if clinical report has the data and current profile doesn't
            handedness: report.handedness || prev.profile.handedness || '',
            occupation: report.occupation || prev.profile.occupation || '',
            referral_reason: report.referral_reason || prev.profile.referral_reason || '',
            // Also sync other fields if available in clinical report
            name: report.full_name || prev.profile.name,
            dateOfBirth: report.date_of_birth || prev.profile.dateOfBirth,
            gender: report.gender || prev.profile.gender
          }
        }));
      } else {
        setClinicalReport(null);
      }
    } catch (error) {
      console.error('ERROR: Exception fetching clinical report:', error);
    }
  };

  // Fetch all reports for the patient (including response reports from super admin)
  const fetchPatientReports = async (patientId) => {
    try {

      const reports = await DatabaseService.getReportsByPatient(patientId);

      setPatientReports(reports || []);
    } catch (error) {
      console.error('ERROR: Failed to fetch patient reports:', error);
      setPatientReports([]);
    }
  };

  // Fetch algorithm results for the patient (7 brain parameters from Algorithm Processor)
  const fetchAlgorithmResults = async (patientDbId, patientEmail, patientName) => {
    try {

      const allResults = await DatabaseService.get('algorithmResults');
      if (allResults?.length > 0) {
      }

      // Filter by patient_id (UUID) or patientId, also try matching by email/name
      // Check all possible field name variations (camelCase, snake_case, lowercase)
      const patientResults = allResults.filter(r => {
        // Match by patient ID - check all possible field name variations
        const rid = r.patient_id || r.patientId || r.patientid;
        const matchById = rid && rid === patientDbId;

        // Match by email - check all possible field name variations
        const remail = r.patient_email || r.patientEmail || r.patientemail;
        const matchByEmail = patientEmail && remail &&
          remail.toLowerCase().trim() === patientEmail.toLowerCase().trim();

        // Match by patient name (fallback) - check inputData.patientName too
        const rname = r.patient_name || r.patientName || r.patientname || r.inputData?.patientName;
        const matchByName = patientName && rname &&
          rname.toLowerCase().trim() === patientName.toLowerCase().trim();

        // Exclude Claude-mode results — those are super-admin-only until the Claude
        // report is explicitly shared (which appears via the separate reports path).
        const mode = r.report_mode || r.reportMode || 'neurosense';
        return (matchById || matchByEmail || matchByName) && mode !== 'claude';
      });


      // Set the scan count (total algorithm results for this patient)
      setScanCount(patientResults.length);

      if (patientResults.length > 0) {
        // Get the most recent result (sorted by createdAt/processed_at)
        const sortedResults = patientResults.sort((a, b) =>
          new Date(b.processed_at || b.createdAt || b.created_at || 0) -
          new Date(a.processed_at || a.createdAt || a.created_at || 0)
        );
        const latestResult = sortedResults[0];

        // Get the results data - can be in 'results', 'outputData', or 'output_data'
        const outputData = latestResult.results || latestResult.outputData || latestResult.output_data;


        setAlgorithmResults({
          data: outputData,
          pdfUrl: latestResult.pdfUrl || latestResult.pdf_url,
          processedAt: latestResult.processed_at || latestResult.createdAt || latestResult.created_at,
          patientName: latestResult.patient_name || latestResult.patientName
        });
      } else {
        setAlgorithmResults(null);
      }
    } catch (error) {
      console.error('ERROR: Failed to fetch algorithm results:', error);
      setAlgorithmResults(null);
    }
  };

  // Reload profile image from database
  const reloadProfileImage = async () => {
    try {

      if (!user?.email) {
        return;
      }

      const DatabaseService = (await import('../../services/databaseService')).default;

      // Find patient record by email
      const allPatients = await DatabaseService.get('patients');
      const userEmailLower = user.email.trim().toLowerCase();
      const patientRecord = allPatients.find(p => {
        if (!p.email) return false;
        return p.email.trim().toLowerCase() === userEmailLower;
      });

      if (patientRecord) {

        // Get profile image from database (priority order)
        const profileImage = patientRecord.profile_image || patientRecord.avatar_url ||
                           patientRecord.profileImage || patientRecord.avatar;

        if (profileImage) {
          setProfileImageUrl(profileImage);
        } else {
        }
      } else {
        console.error('ERROR: Patient record not found for reload');
      }

    } catch (error) {
      console.error('ERROR: Failed to reload profile image:', error);
    }
  };

  // Load real patient data from database
  useEffect(() => {
    const loadPatientData = async () => {
      if (!user?.id) {
        return;
      }

      try {
        setLoading(true);

        // Import DatabaseService
        const DatabaseService = (await import('../../services/databaseService')).default;

        // First, try to find patient by ID
        let patientRecord = await DatabaseService.findById('patients', user.id);

        // If not found by ID, try to find by email
        if (!patientRecord && user.email) {

          const allPatients = await DatabaseService.get('patients');

          // More robust email matching with trim
          const userEmailLower = user.email.trim().toLowerCase();
          patientRecord = allPatients.find(p => {
            if (!p.email) return false;
            const patientEmailLower = p.email.trim().toLowerCase();
            return patientEmailLower === userEmailLower;
          });

        }

        if (patientRecord) {

          // Store patient UID (external_id) - generate if not exists
          const existingUid = patientRecord.external_id || patientRecord.externalId;
          if (existingUid) {
            setPatientUid(existingUid);
          } else {
            // Generate a formatted patient ID if external_id doesn't exist
            // Format: CLINICCODE-YYYYMM-XXXX (using created_at date)
            const createdDate = patientRecord.created_at ? new Date(patientRecord.created_at) : new Date();
            const year = createdDate.getFullYear();
            const month = String(createdDate.getMonth() + 1).padStart(2, '0');
            const clinicCode = patientRecord.org_id ? 'HOPE' : 'NEU360';
            const sequence = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
            const generatedUid = `${clinicCode}-${year}${month}-${sequence}`;
            setPatientUid(generatedUid);
          }

          // Debug: Log all possible avatar field values from both sources

          // Load profile image from user/patient record (check all possible field names)
          // Priority: database first (patientRecord), then user object
          const profileImage = patientRecord.profile_image || patientRecord.avatar_url ||
                             patientRecord.profileImage || patientRecord.avatar ||
                             user.avatar || user.profile_image || user.profileImage || user.avatar_url;

          if (profileImage) {
            setProfileImageUrl(profileImage);
          } else {
          }

          // Fetch clinical report for this patient
          await fetchClinicalReport(user.id);

          // Fetch all reports for this patient (including response reports)
          // Use patientRecord.id — reports are stored with patient_id = patients table row id,
          // which only equals user.id when findById('patients', user.id) matched directly.
          setPatientDbId(patientRecord.id);
          await fetchPatientReports(patientRecord.id);

          // Fetch algorithm results for this patient (7 brain parameters)
          // Use patient's database ID, email, and name for matching
          const patientFullName = patientRecord.fullName || patientRecord.full_name || patientRecord.name || user.name;
          await fetchAlgorithmResults(patientRecord.id, patientRecord.email || user.email, patientFullName);

          // Fetch clinic data if patient has clinic_id or org_id
          let clinicData = null;
          const clinicId = patientRecord.clinicId || patientRecord.clinic_id || patientRecord.orgId || patientRecord.org_id || patientRecord.ownerId || patientRecord.owner_id;
          setPatientClinicId(clinicId || null);


          if (clinicId) {
            try {
              clinicData = await DatabaseService.findById('clinics', clinicId);
            } catch (clinicError) {
            }
          } else {
          }

          // Get extra profile fields from medical_history.profile_details (if stored there)
          const profileDetails = patientRecord.medical_history?.profile_details || {};

          // Update patient data state with real data from database
          const updatedData = {
            profile: {
              name: patientRecord.fullName || patientRecord.full_name || patientRecord.name || user.name || 'N/A',
              email: patientRecord.email || user.email || 'N/A',
              phone: patientRecord.phone || 'Not provided',
              dateOfBirth: patientRecord.dateOfBirth || patientRecord.date_of_birth || 'Not provided',
              address: patientRecord.address || 'Not provided',
              emergencyContact: profileDetails.emergency_contact || patientRecord.emergencyContact || 'Not provided',
              gender: patientRecord.gender || '',
              handedness: profileDetails.handedness || patientRecord.handedness || '',
              occupation: profileDetails.occupation || patientRecord.occupation || '',
              referral_reason: profileDetails.referral_reason || patientRecord.referral_reason || patientRecord.referralReason || ''
            },
            clinic: clinicData ? {
              name: clinicData.name || 'N/A',
              address: clinicData.address || 'N/A',
              phone: clinicData.phone || 'N/A',
              email: clinicData.email || 'N/A',
              doctorName: clinicData.primaryDoctor || clinicData.primary_doctor || 'Not assigned'
            } : {
              name: 'No clinic assigned',
              address: 'N/A',
              phone: 'N/A',
              email: 'N/A',
              doctorName: 'N/A'
            }
            // Note: Keep existing reports, carePlans, resources from initial state
          };

          setPatientData(prevData => ({
            ...prevData,
            ...updatedData
          }));

        } else {

          // Try to find by email as fallback
          if (user.email) {
            try {
              const patients = await DatabaseService.get('patients');
              const patientByEmail = patients.find(p => p.email === user.email);
              if (patientByEmail) {

                // Store patient UID - generate if not exists
                const existingUid = patientByEmail.external_id || patientByEmail.externalId;
                if (existingUid) {
                  setPatientUid(existingUid);
                } else {
                  // Generate a formatted patient ID if external_id doesn't exist
                  const createdDate = patientByEmail.created_at ? new Date(patientByEmail.created_at) : new Date();
                  const year = createdDate.getFullYear();
                  const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                  const clinicCode = patientByEmail.org_id ? 'HOPE' : 'NEU360';
                  const sequence = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
                  const generatedUid = `${clinicCode}-${year}${month}-${sequence}`;
                  setPatientUid(generatedUid);
                }

                // Fetch clinical report for this patient
                await fetchClinicalReport(user.id);

                // Fetch all reports for this patient (including response reports)
                // Use patientByEmail.id — reports are stored with patient_id = patients table row id.
                setPatientDbId(patientByEmail.id);
                await fetchPatientReports(patientByEmail.id);

                // Fetch algorithm results for this patient (7 brain parameters)
                // Use patient's database ID and email for matching
                await fetchAlgorithmResults(patientByEmail.id, patientByEmail.email || user.email);

                // Retry with the found patient
                const clinicId = patientByEmail.clinicId || patientByEmail.clinic_id || patientByEmail.orgId || patientByEmail.org_id || patientByEmail.ownerId || patientByEmail.owner_id;
                setPatientClinicId(clinicId || null);
                let clinicData = null;
                if (clinicId) {
                  clinicData = await DatabaseService.findById('clinics', clinicId);
                }

                // Get extra profile fields from medical_history.profile_details
                const profileDetails = patientByEmail.medical_history?.profile_details || {};

                setPatientData(prevData => ({
                  ...prevData,
                  profile: {
                    name: patientByEmail.fullName || patientByEmail.full_name || patientByEmail.name || user.name || 'N/A',
                    email: patientByEmail.email || user.email || 'N/A',
                    phone: patientByEmail.phone || 'Not provided',
                    dateOfBirth: patientByEmail.dateOfBirth || patientByEmail.date_of_birth || 'Not provided',
                    address: patientByEmail.address || 'Not provided',
                    emergencyContact: profileDetails.emergency_contact || patientByEmail.emergencyContact || 'Not provided',
                    gender: patientByEmail.gender || '',
                    handedness: profileDetails.handedness || patientByEmail.handedness || '',
                    occupation: profileDetails.occupation || patientByEmail.occupation || '',
                    referral_reason: profileDetails.referral_reason || patientByEmail.referral_reason || patientByEmail.referralReason || ''
                  },
                  clinic: clinicData ? {
                    name: clinicData.name || 'N/A',
                    address: clinicData.address || 'N/A',
                    phone: clinicData.phone || 'N/A',
                    email: clinicData.email || 'N/A',
                    doctorName: clinicData.primaryDoctor || clinicData.primary_doctor || 'Not assigned'
                  } : prevData.clinic
                }));
              } else {
                // Use user data as fallback
                setPatientData(prevData => ({
                  ...prevData,
                  profile: {
                    name: user.name || user.full_name || 'Patient',
                    email: user.email || 'Not provided',
                    phone: user.phone || 'Not provided',
                    dateOfBirth: user.dateOfBirth || user.date_of_birth || 'Not provided',
                    address: user.address || 'Not provided',
                    emergencyContact: user.emergencyContact || user.emergency_contact || 'Not provided'
                  },
                  clinic: {
                    name: 'No clinic assigned',
                    address: 'N/A',
                    phone: 'N/A',
                    email: 'N/A',
                    doctorName: 'Not assigned'
                  }
                }));
              }
            } catch (emailError) {
              console.error('ERROR: Failed to find patient by email:', emailError);
              // Final fallback - use user object directly
              setPatientData(prevData => ({
                ...prevData,
                profile: {
                  name: user.name || user.full_name || 'Patient',
                  email: user.email || 'Not provided',
                  phone: user.phone || 'Not provided',
                  dateOfBirth: user.dateOfBirth || user.date_of_birth || 'Not provided',
                  address: user.address || 'Not provided',
                  emergencyContact: user.emergencyContact || user.emergency_contact || 'Not provided'
                },
                clinic: {
                  name: 'No clinic assigned',
                  address: 'N/A',
                  phone: 'N/A',
                  email: 'N/A',
                  doctorName: 'Not assigned'
                }
              }));
            }
          } else {
            // No email to search with - use user data
            setPatientData(prevData => ({
              ...prevData,
              profile: {
                name: user.name || user.full_name || 'Patient',
                email: user.email || 'Not provided',
                phone: user.phone || 'Not provided',
                dateOfBirth: user.dateOfBirth || user.date_of_birth || 'Not provided',
                address: user.address || 'Not provided',
                emergencyContact: user.emergencyContact || user.emergency_contact || 'Not provided'
              },
              clinic: {
                name: 'No clinic assigned',
                address: 'N/A',
                phone: 'N/A',
                email: 'N/A',
                doctorName: 'Not assigned'
              }
            }));
          }
        }

        // Disable appointments and progress tracking for now (tables not available)
        // These features can be enabled when the corresponding tables are created

      } catch (error) {
        console.error('ERROR: Failed to load patient data:', error);
        // Fallback on error - use user data
        setPatientData(prevData => ({
          ...prevData,
          profile: {
            name: user?.name || user?.full_name || 'Patient',
            email: user?.email || 'Not provided',
            phone: user?.phone || 'Not provided',
            dateOfBirth: user?.dateOfBirth || user?.date_of_birth || 'Not provided',
            address: user?.address || 'Not provided',
            emergencyContact: user?.emergencyContact || user?.emergency_contact || 'Not provided'
          },
          clinic: {
            name: 'No clinic assigned',
            address: 'N/A',
            phone: 'N/A',
            email: 'N/A',
            doctorName: 'Not assigned'
          }
        }));
      } finally {
        setLoading(false);
      }
    };

    loadPatientData();
  }, [user?.id]);

  // Fetch immediately on tab open + poll every 30s while on the Neurosense Reports tab
  useEffect(() => {
    if (activeTab !== 'neurosense-reports' || !patientDbId) return;
    fetchPatientReports(patientDbId); // immediate fetch on tab open
    const interval = setInterval(() => {
      fetchPatientReports(patientDbId);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, patientDbId]);

  // Fetch brain parameters for sidebar menu
  useEffect(() => {
    const fetchBrainParameters = async () => {
      try {
        const params = await brainRegionService.getBrainParameters();
        if (params && params.length > 0) {
          setBrainParameters(params);
        }
      } catch (error) {
        console.error('Error fetching brain parameters:', error);
      }
    };

    fetchBrainParameters();
  }, []);

  // Handle appointment booking
  const handleBookAppointment = async () => {
    try {
      // Simple booking - book next available follow-up slot
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      // Get available slots
      const availableSlots = await bookingService.getAvailableSlots(
        user?.clinic_id || 'default-clinic',
        dateStr,
        'follow-up'
      );

      if (availableSlots.length === 0) {
        alert('No available slots for tomorrow. Please try a different date.');
        return;
      }

      // Book the first available slot
      const firstSlot = availableSlots.find(slot => slot.available);
      if (!firstSlot) {
        alert('No available slots found. Please contact the clinic directly.');
        return;
      }

      const appointmentData = {
        patientId: user.id,
        clinicId: user?.clinic_id || 'default-clinic',
        appointmentType: 'follow-up',
        date: dateStr,
        time: firstSlot.time,
        requestedBy: user.id,
        notes: 'Requested via patient portal'
      };

      const newAppointment = await bookingService.bookAppointment(appointmentData);

      // Refresh appointments list
      const updatedAppointments = await bookingService.getPatientAppointments(user.id);
      setAppointments(updatedAppointments);

      alert(`Appointment booked successfully for ${dateStr} at ${firstSlot.display}!`);

    } catch (error) {
      console.error('ERROR: Failed to book appointment:', error);
      alert(getFriendlyErrorMessage(error, 'The appointment could not be booked. Please try again.'));
    }
  };
  const [patientData, setPatientData] = useState({
    profile: {
      name: 'Loading...',
      email: 'Loading...',
      phone: 'Loading...',
      dateOfBirth: 'Loading...',
      address: 'Loading...',
      emergencyContact: 'Loading...',
      gender: '',
      handedness: '',
      occupation: '',
      referral_reason: ''
    },
    clinic: {
      name: 'Loading...',
      address: 'Loading...',
      phone: 'Loading...',
      email: 'Loading...',
      doctorName: 'Loading...'
    },
    reports: [
      {
        id: 1,
        type: 'NeuroSense QEEG Report',
        date: '2024-09-15',
        status: 'Available',
        summary: 'Comprehensive brain activity analysis showing improved focus patterns'
      },
      {
        id: 2,
        type: 'Progress Assessment',
        date: '2024-08-20',
        status: 'Available',
        summary: 'Quarterly progress review with recommendations'
      }
    ],
    carePlans: [
      {
        id: 1,
        title: 'Focus Enhancement Program',
        progress: 75,
        nextSession: '2024-09-25',
        goals: ['Improve attention span', 'Reduce mental fatigue', 'Enhance cognitive flexibility']
      }
    ],
    resources: [
      {
        id: 1,
        title: 'Mindfulness Meditation Guide',
        type: 'video',
        duration: '15 min',
        unlocked: true
      },
      {
        id: 2,
        title: 'Brain Training Exercises',
        type: 'interactive',
        duration: '20 min',
        unlocked: true
      },
      {
        id: 3,
        title: 'Cognitive Health Assessment',
        type: 'assessment',
        duration: '30 min',
        unlocked: false
      }
    ],
    // appointments now loaded dynamically from booking service
  });

  // Icon mapping for dynamic brain parameters
  const iconMap = {
    Lightbulb,
    Zap,
    Target,
    Battery,
    Smile,
    GraduationCap,
    Star,
    Brain,
    Activity,
    Heart,
    Eye,
    Book
  };

  // Default brain parameters (fallback if database is empty)
  const defaultBrainParameters = [
    { id: 'cognition', label: 'Cognition', icon: 'Lightbulb' },
    { id: 'stress', label: 'Stress', icon: 'Zap' },
    { id: 'focus-attention', label: 'Focus and Attention', icon: 'Target' },
    { id: 'burnout-fatigue', label: 'Burnout and Fatigue', icon: 'Battery' },
    { id: 'emotional-regulation', label: 'Emotional Regulation', icon: 'Smile' },
    { id: 'learning', label: 'Learning', icon: 'GraduationCap' },
    { id: 'creativity', label: 'Creativity', icon: 'Star' }
  ];

  // Use dynamic or default brain parameters
  const activeBrainParameters = brainParameters || defaultBrainParameters;

  // Sidebar menu items based on requirements
  const sidebarItems = [
    { id: 'welcome', label: 'Welcome', icon: Home },
    { id: 'profile', label: 'Profile', icon: User },
    // { id: 'book-consultation', label: 'Book Consultation', icon: Calendar, ssoAction: true },
    { id: 'about-brain', label: 'About the Brain', icon: Brain },
    {
      id: 'brain-parameters',
      label: 'Your Brain Parameters',
      icon: Activity,
      isDropdown: true,
      subItems: activeBrainParameters.map(param => ({
        id: param.id,
        label: param.label,
        icon: iconMap[param.icon] || Lightbulb
      }))
    },
    { id: 'neurosense-reports', label: 'Neurosense Performance Reports', icon: Download },
    { id: 'care-program', label: 'Customized Care Program', icon: ClipboardList },
    { id: 'ans-reset', label: 'Breath Reset Protocol', icon: RefreshCw },
    { id: 'movers', label: 'MOVERS', icon: Activity },
    // NeuroCoaching hidden per Dr. Sweta directive (moved to separate page, not on platform)
    // { id: 'neurocoaching', label: 'NeuroCoaching', icon: BrainCircuit },
    { id: 'frequencies', label: 'Frequencies', icon: Music },
    { id: 'meditations', label: 'Meditations', icon: Headphones },
    { id: 'nootropics', label: 'Nootropics', icon: FlaskConical },
    { id: 'brain-coach', label: 'Book a Coach', icon: UserCheck },
    { id: 'neurofeedback', label: 'Home Neurofeedback', icon: Radio },
    { id: 'photobiomodulation', label: 'Photobiomodulation', icon: Sun },
    { id: 'five-pillars', label: '5 Pillars of Mastery', icon: Award },
    { id: 'brain-courses', label: 'Brain Courses', icon: GraduationCap },
    // { id: 'events', label: 'Events', icon: Calendar }, // hidden — not active yet
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'feedback', label: 'Feedback | Help + Support', icon: HelpCircle }
  ];

  // Daily quotes from Dr. Sweta Adatia for the sidebar
  const drShwetaQuotes = [
    "Your brain has infinite potential for growth. Trust the process, and you will see the transformation.",
    "Neuroplasticity is your superpower,every small step you take today rewires your brain for a better tomorrow.",
    "The mind-body connection is powerful. When you calm your nervous system, you unlock your brain's true potential.",
    "Consistency over intensity. Small daily practices create lasting neural pathways.",
    "Your brain age is not fixed,with the right lifestyle choices, you can optimize and even reverse cognitive decline.",
    "Stress is not your enemy when managed well. Learn to use it as fuel for growth and resilience.",
    "Quality sleep is the foundation of brain health. Prioritize rest, and watch your cognition flourish.",
    "Emotional regulation is a skill that can be trained. Be patient with yourself as you build this neural muscle.",
    "Focus is not about doing more,it's about training your brain to be fully present with what matters most.",
    "Your brain is always listening to your thoughts. Speak to yourself with the kindness you deserve.",
    "Movement is medicine for the brain. Even a short walk can shift your neurochemistry for the better.",
    "Creativity thrives when you give your brain space to wander. Rest is not laziness,it's regeneration.",
    "Every challenge you face is an opportunity for your brain to build new neural connections.",
    "Mindfulness is not about emptying your mind,it's about becoming the observer of your thoughts.",
    "Your autonomic nervous system holds the key to stress resilience. Learn to regulate it, and transform your life.",
    "The brain loves novelty. Challenge yourself with new experiences to keep your neurons firing.",
    "Burnout is your brain's way of asking for care. Listen to the signals before they become symptoms.",
    "Gratitude rewires your brain for positivity. Start each day by acknowledging three things you're thankful for.",
    "Learning never stops. Your brain continues to grow new connections throughout your entire life.",
    "You are not your thoughts. You are the awareness behind them. This understanding is the beginning of freedom.",
    "The path to peak performance is through recovery. Honor your brain's need for restoration.",
    "Breath is the bridge between your conscious and unconscious mind. Use it wisely to regulate your state.",
    "Every neuron you have is rooting for your success. Give your brain the tools it needs to thrive.",
    "Attention is the currency of the brain. Invest it wisely in what truly matters to you.",
    "Your brain's default mode is not fixed. Through practice, you can shift from anxiety to calm, from fog to clarity.",
    "Cognitive flexibility is the hallmark of a healthy brain. Embrace change as an opportunity for growth.",
    "The stories you tell yourself shape your neural architecture. Choose narratives that empower you.",
    "Self-compassion is not weakness,it's neuroscience. Being kind to yourself activates healing pathways.",
    "Your brain is designed for connection. Nurture your relationships, and watch your mental health flourish.",
    "Today is a new opportunity to train your brain. What neural pathway will you strengthen?",
    "The science of brain optimization is clear: small, consistent actions lead to profound transformation."
  ];

  // Get a daily quote from Dr. Sweta Adatia based on the day of the year
  const getDailyQuote = () => {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    return drShwetaQuotes[dayOfYear % drShwetaQuotes.length];
  };

  // Helper functions for clinical report display
  const getAge = (dob) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true });
  };

  const renderCheckboxList = (data, labelMap) => {
    if (!data) return <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">No data available</p>;

    const items = Object.entries(data)
      .filter(([key, value]) => key !== 'other' && value === true)
      .map(([key]) => labelMap[key] || key);

    if (items.length === 0 && !data.other) {
      return <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">None reported</p>;
    }

    return (
      <div className="space-y-1">
        {items.length > 0 && (
          <ul className="list-disc list-inside text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            {items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
        {data.other && (
          <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-2">
            <span className="font-semibold">Other:</span> {data.other}
          </p>
        )}
      </div>
    );
  };

  // Label maps for clinical report data
  const presentingComplaintsLabels = {
    headaches: 'Headaches / Migraines',
    seizures: 'Seizures / Epileptic Episodes',
    dizziness: 'Dizziness / Balance Problems',
    attention: 'Attention / Concentration Difficulties',
    memory: 'Memory Issues',
    sleep: 'Sleep Disturbances',
    anxiety: 'Anxiety / Panic Symptoms',
    depression: 'Depression / Low Mood',
    irritability: 'Irritability / Emotional Dysregulation',
    fatigue: 'Fatigue / Low Energy'
  };

  const symptomDurationLabels = {
    sudden: 'Sudden Onset',
    gradual: 'Gradual Onset',
    acute: 'Acute (<1 month)',
    subacute: 'Subacute (1–6 months)',
    chronic: 'Chronic (>6 months)'
  };

  const pastMedicalHistoryLabels = {
    neurological: 'Neurological Disorders',
    psychiatric: 'Psychiatric Disorders',
    cardiovascular: 'Cardiovascular Conditions',
    endocrine: 'Endocrine/Metabolic',
    chronicPain: 'Chronic Pain / Fibromyalgia'
  };

  const medicationsLabels = {
    antidepressants: 'Antidepressants',
    anxiolytics: 'Anxiolytics / Benzodiazepines',
    antipsychotics: 'Antipsychotics',
    moodStabilizers: 'Mood Stabilizers',
    antiepileptics: 'Antiepileptics / Anticonvulsants',
    stimulants: 'Stimulants (ADHD medications)',
    sleepAids: 'Sleep Aids / Sedatives'
  };

  const familyHistoryLabels = {
    epilepsy: 'Epilepsy / Seizures',
    dementia: 'Dementia / Cognitive Decline',
    adhd: 'ADHD / Learning Disorders',
    moodDisorders: 'Mood Disorders',
    anxiety: 'Anxiety / OCD',
    substanceAbuse: 'Substance Abuse'
  };

  // Book Consultation Section
  const BookConsultationSection = () => {
    const [bcServices, setBcServices] = React.useState([]);
    const [bcBundles, setBcBundles] = React.useState([]);
    const [bcLoading, setBcLoading] = React.useState(true);
    const [bcShowPayment, setBcShowPayment] = React.useState(false);
    const [bcSelectedService, setBcSelectedService] = React.useState(null);
    const [bcPaymentEmail, setBcPaymentEmail] = React.useState('');
    const [bcPaymentName, setBcPaymentName] = React.useState('');
    const [bcProcessing, setBcProcessing] = React.useState(false);
    const [bcShowContact, setBcShowContact] = React.useState(false);
    const [bcForm, setBcForm] = React.useState({ firstName: '', lastName: '', email: user?.email || '', countryCode: '+971', phone: '', city: '', message: '' });
    const [bcSubmitting, setBcSubmitting] = React.useState(false);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

    React.useEffect(() => {
      const fetchData = async () => {
        try {
          const { data, error } = await supabase
            .from('neurosense_assessments')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });
          if (error) throw error;
          const all = (data || []).map(item => ({
            id: item.id,
            title: item.title,
            description: item.description,
            link: item.link || null,
            isFree: item.is_free,
            inquire: item.is_inquire,
            originalPrice: { usd: parseFloat(item.original_price_usd) || 0 },
            salePrice: { usd: parseFloat(item.sale_price_usd) || 0 },
            category: item.category,
          }));
          setBcServices(all.filter(a => a.category === 'individual'));
          setBcBundles(all.filter(a => a.category === 'bundle'));
        } catch { /* silent */ } finally { setBcLoading(false); }
      };
      fetchData();
    }, []);

    const handlePay = async () => {
      if (!bcPaymentEmail) { toast.error('Please enter your email address'); return; }
      setBcProcessing(true);
      try {
        const res = await fetch(`${API_BASE}/create-assessment-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId: bcSelectedService.id,
            assessmentName: bcSelectedService.title,
            customerEmail: bcPaymentEmail,
            customerName: bcPaymentName.toUpperCase(),
            currency: 'USD',
            amount: bcSelectedService.salePrice.usd,
            assessmentLink: bcSelectedService.link
          })
        });
        const data = await res.json();
        if (data.success && data.checkoutUrl) { window.location.href = data.checkoutUrl; }
        else { toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.')); }
      } catch { toast.error('Something went wrong. Please try again.'); }
      finally { setBcProcessing(false); }
    };

    const handleContact = async (e) => {
      e.preventDefault();
      if (!bcForm.firstName || !bcForm.email || !bcForm.phone || !bcForm.city) { toast.error('Please fill in all required fields'); return; }
      setBcSubmitting(true);
      try {
        await supabase.from('contact_inquiries').insert([{
          name: `${bcForm.firstName} ${bcForm.lastName}`.trim().toUpperCase(),
          email: bcForm.email,
          phone: `${bcForm.countryCode} ${bcForm.phone}`,
          city: bcForm.city,
          message: bcForm.message ? bcForm.message.toUpperCase() : null
        }]);
        toast.success('Message sent! We will contact you soon.');
        setBcShowContact(false);
        setBcForm({ firstName: '', lastName: '', email: user?.email || '', countryCode: '+971', phone: '', city: '', message: '' });
      } catch { toast.error('Failed to send message. Please try again.'); }
      finally { setBcSubmitting(false); }
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#323956] to-[#1a1f36] rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Brain Health Assessment</h1>
                <p className="text-blue-200 text-sm">Book your assessment and optimize your cognitive performance</p>
              </div>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div>
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-[#323956]/10 px-4 py-1.5 rounded-full mb-3">
              <Brain className="w-4 h-4 text-[#323956]" />
              <span className="text-[#323956] text-xs font-bold uppercase tracking-wider">Assessments</span>
            </div>
            <h2 className="text-2xl font-bold text-[#323956] mb-1">Our Services</h2>
            <p className="text-gray-500 text-sm">Individual assessments available at special pricing</p>
          </div>

          {bcLoading ? (
            <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-[#323956]/20 border-t-[#323956] rounded-full animate-spin" /></div>
          ) : bcServices.length === 0 ? (
            <div className="text-center py-10 text-gray-400">No assessments available at the moment.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {bcServices.map(service => {
                const isFreeWithLink = service.isFree && service.link;
                const CardEl = isFreeWithLink ? 'a' : 'div';
                const cardProps = isFreeWithLink ? { href: service.link, target: '_blank', rel: 'noopener noreferrer' } : {};
                return (
                  <CardEl key={service.id} {...cardProps} className={`group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 border-2 border-gray-100 hover:border-[#323956]/30 flex flex-col h-full transform hover:-translate-y-2 ${service.link ? 'cursor-pointer' : ''}`}>
                    <div className="h-1.5 bg-gradient-to-r from-[#323956] via-[#4A6FA5] to-[#323956] group-hover:h-2 transition-all duration-300" />
                    <div className="p-6 flex flex-col h-full">
                      <div className="flex-grow">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#323956] to-[#4A6FA5] rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-all duration-300">
                          <Brain className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2 group-hover:text-[#323956] transition-colors">{service.title}</h3>
                        <p className="text-gray-500 text-sm leading-relaxed line-clamp-4">{service.description}</p>
                      </div>
                      <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
                        {service.isFree ? (
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-gray-400 line-through text-sm">USD ${service.originalPrice.usd}</span>
                            <span className="text-2xl font-bold text-green-600">FREE</span>
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-gray-400 line-through text-sm">USD ${service.originalPrice.usd}</span>
                            <span className="text-xl font-bold bg-gradient-to-r from-[#323956] to-[#4A6FA5] bg-clip-text text-transparent">USD ${service.salePrice.usd}</span>
                          </div>
                        )}
                        {service.isFree && service.link && (
                          <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-sm font-semibold rounded-xl">Take Assessment →</span>
                        )}
                        {!service.isFree && service.link && (
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); setBcSelectedService(service); setBcShowPayment(true); }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all">
                            Pay & Take Assessment →
                          </button>
                        )}
                        {service.inquire && (
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); setBcShowContact(true); }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all">
                            Inquire Now →
                          </button>
                        )}
                        {!service.link && !service.inquire && (
                          <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-sm font-semibold rounded-xl">Take Assessment →</span>
                        )}
                      </div>
                    </div>
                  </CardEl>
                );
              })}
            </div>
          )}
        </div>

        {/* Bundle Banner */}
        <div className="bg-gradient-to-br from-[#323956] to-[#1a1f36] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold mb-1">Limitless Brain Lab Cognitive Assessments</h3>
              <p className="text-gray-300 text-sm">Bundle: <span className="line-through text-gray-400">$89.95</span> <span className="text-[#F5D05D] font-bold text-xl">$19.99</span></p>
            </div>
            <button
              onClick={() => {
                const bundle = bcBundles.find(b => b.title?.toLowerCase().includes('neurosense bundle')) || {
                  id: 'neurosense-bundle', title: 'Neurosense Bundle',
                  description: 'All 4 assessments bundle',
                  originalPrice: { usd: 89.95 }, salePrice: { usd: 19.99 },
                  link: bcServices.map(s => s.link).filter(Boolean).join(',')
                };
                setBcSelectedService(bundle);
                setBcShowPayment(true);
              }}
              className="px-6 py-3 bg-[#F5D05D] hover:bg-[#e5c04d] text-[#323956] rounded-xl font-bold text-sm transition-all transform hover:scale-105 whitespace-nowrap">
              Buy Bundle — $19.99
            </button>
          </div>
        </div>

        {/* Payment Modal */}
        {bcShowPayment && bcSelectedService && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setBcShowPayment(false); setBcSelectedService(null); }}>
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-2xl px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Brain className="h-5 w-5 text-white" /></div>
                  <div><h2 className="text-lg font-bold text-white">Secure Payment</h2><p className="text-blue-200 text-xs">Powered by Stripe</p></div>
                </div>
                <button onClick={() => { setBcShowPayment(false); setBcSelectedService(null); }} className="text-white/70 hover:text-white"><X className="h-6 w-6" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                  <h3 className="font-bold text-gray-900 dark:text-white">{bcSelectedService.title}</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-gray-400 line-through text-sm">USD ${bcSelectedService.originalPrice.usd}</span>
                    <span className="text-2xl font-bold text-[#323956]">USD ${bcSelectedService.salePrice.usd}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Full Name</label>
                  <input type="text" value={bcPaymentName} onChange={e => setBcPaymentName(e.target.value)} placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none dark:bg-gray-700 dark:text-white uppercase" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Email Address *</label>
                  <input type="email" value={bcPaymentEmail} onChange={e => setBcPaymentEmail(e.target.value)} placeholder="john@example.com" required
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none dark:bg-gray-700 dark:text-white" />
                </div>
                <button onClick={handlePay} disabled={bcProcessing || !bcPaymentEmail}
                  className="w-full py-3 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {bcProcessing ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : `Pay USD $${bcSelectedService.salePrice.usd} & Continue`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contact/Inquire Modal */}
        {bcShowContact && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setBcShowContact(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-2xl px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Get in Touch</h2>
                <button onClick={() => setBcShowContact(false)} className="text-white/70 hover:text-white"><X className="h-6 w-6" /></button>
              </div>
              <form onSubmit={handleContact} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">First Name *</label>
                    <input type="text" value={bcForm.firstName} onChange={e => setBcForm(p => ({ ...p, firstName: e.target.value }))} required
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white uppercase" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Last Name</label>
                    <input type="text" value={bcForm.lastName} onChange={e => setBcForm(p => ({ ...p, lastName: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white uppercase" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Email *</label>
                  <input type="email" value={bcForm.email} onChange={e => setBcForm(p => ({ ...p, email: e.target.value }))} required
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Phone *</label>
                  <div className="flex gap-2">
                    <select value={bcForm.countryCode} onChange={e => setBcForm(p => ({ ...p, countryCode: e.target.value }))}
                      className="w-24 px-2 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white">
                      <option value="+971">+971</option>
                      <option value="+91">+91</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                    </select>
                    <input type="tel" value={bcForm.phone} onChange={e => setBcForm(p => ({ ...p, phone: e.target.value }))} required placeholder="Phone number"
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">City *</label>
                  <input type="text" value={bcForm.city} onChange={e => setBcForm(p => ({ ...p, city: e.target.value }))} required placeholder="Your city"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">Message</label>
                  <textarea value={bcForm.message} onChange={e => setBcForm(p => ({ ...p, message: e.target.value }))} rows={3} placeholder="Tell us about your goals..."
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 outline-none dark:bg-gray-700 dark:text-white resize-none" />
                </div>
                <button type="submit" disabled={bcSubmitting}
                  className="w-full py-3 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {bcSubmitting ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</> : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Feedback & Help Section - No personal details
  const FeedbackSection = () => (
    <div className="space-y-3 sm:space-y-6">
      {/* Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div style={{ backgroundColor: '#323956' }} className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: '#E4EFFF' }}>
              <HelpCircle className="h-4 w-4 sm:h-6 sm:w-6" style={{ color: '#323956' }} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Feedback | Help + Support</h2>
              <p className="text-blue-200 text-[11px] sm:text-sm">We're here to help you on your brain health journey</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Support */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 flex items-center">
          <Mail className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 text-[#323956]" />
          Contact Support
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 text-xs sm:text-base">
          Have questions or need assistance? Our support team is ready to help.
        </p>
        <div className="space-y-2 sm:space-y-3">
          <a
            href="mailto:limitlessbrainlab@gmail.com"
            className="flex items-center space-x-2 sm:space-x-3 p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956] dark:text-blue-400 flex-shrink-0" />
            <span className="text-xs sm:text-base text-gray-700 dark:text-gray-300 truncate">limitlessbrainlab@gmail.com</span>
          </a>
          <a
            href="tel:+971501382897"
            className="flex items-center space-x-2 sm:space-x-3 p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956] dark:text-blue-400 flex-shrink-0" />
            <span className="text-xs sm:text-base text-gray-700 dark:text-gray-300">+971 50 138 2897</span>
          </a>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 flex items-center">
          <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 text-[#323956]" />
          Frequently Asked Questions
        </h3>
        <div className="space-y-2 sm:space-y-4">
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">1. How do I schedule a Neurosense brain assessment?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              You can schedule your assessment directly through the platform{' '}
              <a href="https://www.limitlessbrainlab.com" target="_blank" rel="noopener noreferrer" className="text-[#323956] dark:text-blue-400 underline">www.limitlessbrainlab.com</a>{' '}
              or WhatsApp{' '}
              <a href="https://w.app/protectmybrain" target="_blank" rel="noopener noreferrer" className="text-[#323956] dark:text-blue-400 underline">https://w.app/protectmybrain</a>.
              Once scheduled, you will receive instructions for your EEG/qEEG scan, either at a center or via a guided setup. Our team will assist you throughout the process.
            </p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">2. How does Neurosense assess my brain?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Neurosense uses a quantified EEG (qEEG) analysis, which measures your brainwave activity and converts it into actionable insights across key brain performance parameters.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">3. Is the Neurosense scan a medical diagnostic test?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">No. The Neurosense scan is a wellness and optimization tool, not a diagnostic test. It should always be interpreted by a qualified professional and used alongside clinical evaluation where required.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">4. Who will guide me through my brain optimization journey?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Neurosense offers a concierge-style brain health service, supported by a multidisciplinary expert team including:
            </p>
            <ul className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1 ml-4 list-disc space-y-0.5">
              <li>Neurology-led brain experts</li>
              <li>Nutritionists & Dieticians</li>
              <li>Yoga & Wellness Therapists</li>
              <li>Psychiatrists & Psychologists</li>
              <li>Neuro-coaches & performance specialists</li>
            </ul>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1">This ensures you receive holistic, end-to-end care tailored to your needs.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">5. How accurate are the results?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Neurosense uses clinical-grade EEG technology and standardized algorithms to provide reliable and objective insights. These are designed for optimization, tracking, and performance enhancement.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">6. What kind of recommendations will I receive?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">You will receive a personalized brain optimization protocol, which may include:</p>
            <ul className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1 ml-4 list-disc space-y-0.5">
              <li>Breathing techniques</li>
              <li>Meditation & frequencies</li>
              <li>Yogasanas</li>
              <li>Chants</li>
              <li>Lifestyle and diet strategies</li>
              <li>Supplement guidance</li>
              <li>Neurofeedback and other neuromodulation practices as recommended</li>
            </ul>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">7. How often should I repeat the scan?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">We recommend repeating your scan every 6–8 weeks to track progress and optimize your plan using the Measure → Monitor → Manage approach.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">8. Can I track my progress over time?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Yes. The dashboard allows you to compare previous and current scores, helping you visualize improvements in stress, focus, emotional regulation, and more.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">9. Is my data safe and confidential?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Absolutely. Your data is:</p>
            <ul className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1 ml-4 list-disc space-y-0.5">
              <li>Securely stored</li>
              <li>Used only for your personalized analysis</li>
              <li>Shared only with your consent</li>
            </ul>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">10. Who reviews and explains my report?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Your report is interpreted by a trained Neurosense expert or clinician, who will guide you through your results and help you implement your personalized plan.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 text-xs sm:text-sm">11. Can Neurosense help with stress, anxiety, or low focus?</h4>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">Yes. Neurosense is designed to support:</p>
            <ul className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1 ml-4 list-disc space-y-0.5">
              <li>Stress reduction</li>
              <li>Anxiety management</li>
              <li>Focus and productivity</li>
              <li>Emotional balance</li>
            </ul>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 mt-1">It works best as part of an integrative brain wellness approach, alongside professional guidance where needed.</p>
          </div>
        </div>
      </div>

      {/* Feedback Form - Personalized */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
          <Star className="h-5 w-5 mr-2 text-[#323956]" />
          Share Your Feedback
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 text-xs sm:text-sm">
          Hi {patientData?.profile?.name?.split(' ')[0] || 'there'}! Your feedback helps us improve. Let us know about your experience with NeuroSense.
        </p>
        {algorithmResults?.data && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-semibold">Your recent assessment:</span> {algorithmResults.data.length || 7} brain parameters analyzed
              {algorithmResults.processedAt && (
                <span className="ml-1">
                  on {new Date(algorithmResults.processedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
                </span>
              )}
            </p>
          </div>
        )}
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="inline-flex items-center px-2 sm:px-4 py-1.5 sm:py-2 bg-[#323956] text-white rounded-lg hover:bg-[#4a5578] transition-colors"
        >
          <Mail className="h-4 w-4 mr-2" />
          Send Feedback
        </button>
      </div>

      {/* Brain Coach Connection - Personalized based on weak areas */}
      {/* <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl p-3 sm:p-6 text-white">
        <h3 className="text-sm font-bold mb-3">Need More Help?</h3>
        <p className="text-blue-200 mb-3 text-xs sm:text-sm">
          Connect with your brain coach for personalized guidance and support.
        </p>
        {(() => {
          const getRecommendedFocus = () => {
            if (!algorithmResults?.data || !Array.isArray(algorithmResults.data)) {
              return null;
            }
            const weakAreas = algorithmResults.data
              .filter(item => item.score < 60)
              .map(item => item.parameter)
            return weakAreas.length > 0 ? weakAreas : null;
          };
          const recommendedFocus = getRecommendedFocus();
          return recommendedFocus && (
            <div className="mb-4 p-3 bg-white/10 rounded-lg">
              <p className="text-xs text-blue-100">
                <span className="font-semibold">Recommended focus:</span> {recommendedFocus.join(', ')}
              </p>
              <p className="text-xs text-blue-200 mt-1">A brain coach can help you improve these areas.</p>
            </div>
          );
        })()}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/dashboard/brain-coach')}
            className="px-2 sm:px-4 py-1.5 sm:py-2 bg-white text-[#323956] font-semibold rounded-lg hover:bg-blue-50 transition-colors text-sm"
          >
            Connect with Neurosense Coach
          </button>
          <button
            onClick={() => {
              const phone = '971501382897';
              const patientName = patientData?.profile?.name || 'Patient';
              const weakAreas = algorithmResults?.data?.filter(item => item.score < 60).map(item => item.parameter);
              const focusText = weakAreas?.length > 0 ? `\n\nMy areas needing attention: ${weakAreas.join(', ')}` : '';
              const message = encodeURIComponent(`Hi NeuroSense Team,\n\nI'm ${patientName} from NeuroSense platform. I'd like to connect with you for personalized brain health guidance and support.${focusText}\n\nLooking forward to hearing from you.`);
              window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
            }}
            className="px-2 sm:px-4 py-1.5 sm:py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center gap-1"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp the Team
          </button>
        </div>
      </div> */}

    </div>
  );

  // Welcome Section
  const WelcomeSection = () => {
    return (
      <div className="space-y-2 sm:space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden">
          {/* Decorative Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
          </div>

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="bg-white/20 rounded-lg sm:rounded-xl p-2.5 sm:p-3 w-fit">
              <Home className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold">Welcome, {user?.name || 'Patient'}!</h1>
              <p className="text-blue-200 text-xs sm:text-base">Explore your brain health journey with NeuroSense 360</p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-3 text-center border border-white/10">
              <p className="text-xs sm:text-xl lg:text-2xl font-bold">{scanCount}</p>
              <p className="text-[9px] sm:text-xs text-blue-200 mt-0.5">Scans</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 sm:p-3 text-center border border-white/10">
              {(() => {
                // Check if 8 months have passed since last scan (algorithm result)
                const lastScanDate = algorithmResults?.processedAt
                  ? new Date(algorithmResults.processedAt)
                  : null;
                const eightMonthsAgo = new Date();
                eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
                const isRecheckDue = lastScanDate && lastScanDate < eightMonthsAgo;
                return (
                  <p className={`text-xs sm:text-xl lg:text-2xl font-bold ${isRecheckDue ? 'text-amber-400' : 'text-green-400'}`}>
                    {isRecheckDue ? 'Re-Check Due' : 'Active'}
                  </p>
                );
              })()}
              <p className="text-[9px] sm:text-xs text-blue-200 mt-0.5">Status</p>
            </div>
          </div>
        </div>

        {/* Brain Scan Required Popup - shows after medical history is done but scan not completed */}
        {clinicalReport && !algorithmResults && !loading && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 relative">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Brain className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1">Brain Scan Not Completed</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Your medical history is complete! Now please visit your clinic for an EEG brain scan to unlock personalized brain parameters, detailed reports, and customized care recommendations.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                    <Activity className="h-3 w-3" /> Brain Parameters
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
                    <FileText className="h-3 w-3" /> Neurosense Performance Report
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
                    <ClipboardList className="h-3 w-3" /> Care Program
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Contact your clinic: <span className="font-semibold text-gray-700">{user?.clinicName || 'Your Clinic'}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Motor Dashboard - Interactive Brain Parameters */}
        <MotorDashboard navigate={navigate} algorithmResults={algorithmResults} />

        {/* Upcoming Coaching Sessions */}
        <MyBookings limit={3} showTitle={true} compact={true} />

        {/* Quick Actions - Moved to bottom */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/dashboard/profile')}
            className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-[#323956]/30 transition-all text-left group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956] dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">View Profile</h3>
          </button>
          <button
            onClick={() => navigate('/dashboard/about-brain')}
            className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-[#323956]/30 transition-all text-left group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">About Your Brain</h3>
          </button>
        </div>
      </div>
    );
  };

  // Motor Dashboard Component - Interactive Brain Parameters Visualization
  const MotorDashboard = ({ navigate, algorithmResults }) => {
    const [activeParameter, setActiveParameter] = useState(null);
    const [hoveredParameter, setHoveredParameter] = useState(null);

    // Brain Parameters Data with detailed information
    const brainParameters = {
      cognition: {
        id: 'cognition',
        name: 'Cognition',
        color: '#3B82F6',
        bgColor: 'bg-blue-500',
        lightBg: 'bg-blue-50 dark:bg-blue-900/20',
        icon: Brain,
        brainRegions: ['Prefrontal Cortex', 'Parietal Lobe', 'Temporal Lobe'],
        shortDescription: 'Your brain\'s overall thinking efficiency',
        description: 'This is your brain\'s overall thinking efficiency. It measures how clearly you process information, make decisions, solve problems, and respond under real-life demands. It gives you a broad snapshot of mental sharpness today and helps you track changes over time as your habits, sleep, and stress levels shift.',
        dailyLife: 'Affects your ability to learn new skills, make decisions, solve problems, and process information effectively in daily tasks.',
        imbalanceEffects: {
          underactive: 'Difficulty concentrating, slower processing speed, memory lapses, trouble making decisions.',
          overactive: 'Mental fatigue, overthinking, analysis paralysis, difficulty relaxing.'
        },
        neuroSenseConnection: 'NeuroSense measures cognitive function through EEG patterns associated with attention, processing speed, and mental clarity.'
      },
      stress: {
        id: 'stress',
        name: 'Stress',
        color: '#EF4444',
        bgColor: 'bg-red-500',
        lightBg: 'bg-red-50 dark:bg-red-900/20',
        icon: AlertTriangle,
        brainRegions: ['Amygdala', 'Hypothalamus', 'Prefrontal Cortex'],
        shortDescription: 'How activated your nervous system is right now',
        description: 'This reflects how activated your nervous system is right now and whether your body is spending more time in "fight-or-flight" than "rest-and-repair." It helps you understand if stress is simply present (normal) or starting to overload recovery, mood, and performance.',
        dailyLife: 'Influences your energy levels, sleep quality, immune function, and emotional responses to everyday situations.',
        imbalanceEffects: {
          underactive: 'Lack of motivation, reduced alertness, difficulty responding to challenges.',
          overactive: 'Anxiety, insomnia, irritability, weakened immune system, chronic tension.'
        },
        neuroSenseConnection: 'NeuroSense tracks stress markers through autonomic nervous system activity and brain wave patterns associated with the stress response.'
      },
      focus: {
        id: 'focus',
        name: 'Focus & Attention',
        color: '#F59E0B',
        bgColor: 'bg-amber-500',
        lightBg: 'bg-amber-50 dark:bg-amber-900/20',
        icon: Target,
        brainRegions: ['Prefrontal Cortex', 'Anterior Cingulate Cortex', 'Parietal Lobe'],
        shortDescription: 'How steadily you can concentrate and stay locked in',
        description: 'This shows how steadily you can concentrate, ignore distractions, and stay mentally "locked in" when you need to. It highlights whether your attention system is stable and efficient, or if it\'s more scattered, easily interrupted, or inconsistent across tasks.',
        dailyLife: 'Essential for productivity, learning, safe driving, meaningful conversations, and completing tasks efficiently.',
        imbalanceEffects: {
          underactive: 'Easily distracted, difficulty completing tasks, forgetfulness, mind wandering.',
          overactive: 'Hyperfocus on single tasks, difficulty switching attention, missing broader context.'
        },
        neuroSenseConnection: 'NeuroSense measures attention through beta wave activity and frontal lobe engagement patterns.'
      },
      burnout: {
        id: 'burnout',
        name: 'Burnout & Fatigue',
        color: '#6B7280',
        bgColor: 'bg-gray-500',
        lightBg: 'bg-gray-50 dark:bg-gray-700/50',
        icon: Battery,
        brainRegions: ['Brainstem', 'Hypothalamus', 'Default Mode Network'],
        shortDescription: 'Mental depletion from running hard without recovery',
        description: 'This captures mental depletion, when your brain has been running hard without enough recovery, leading to low energy, fogginess, irritability, or reduced motivation. It helps you spot whether you need rest, nervous-system regulation, or lifestyle changes before performance and mood start dipping further.',
        dailyLife: 'Impacts work performance, relationships, physical health, motivation, and overall quality of life.',
        imbalanceEffects: {
          underactive: 'N/A - This parameter indicates recovery state.',
          overactive: 'Chronic exhaustion, cynicism, reduced professional efficacy, physical symptoms like headaches.'
        },
        neuroSenseConnection: 'NeuroSense identifies burnout patterns through neural efficiency markers and recovery indicators in brain activity.'
      },
      emotional: {
        id: 'emotional',
        name: 'Emotional Regulation',
        color: '#EC4899',
        bgColor: 'bg-pink-500',
        lightBg: 'bg-pink-50 dark:bg-pink-900/20',
        icon: Heart,
        brainRegions: ['Prefrontal Cortex', 'Amygdala', 'Limbic System'],
        shortDescription: 'How well your brain manages emotional responses',
        description: 'This reflects how well your brain can shift out of emotional reactivity and return to calm after triggers, pressure, or conflict. It\'s linked to resilience, patience, decision-making, and relationship stability, especially when life feels demanding.',
        dailyLife: 'Crucial for healthy relationships, stress management, professional success, and mental well-being.',
        imbalanceEffects: {
          underactive: 'Emotional numbness, difficulty connecting with others, suppressed feelings.',
          overactive: 'Mood swings, emotional overwhelm, difficulty managing reactions, heightened sensitivity.'
        },
        neuroSenseConnection: 'NeuroSense assesses emotional regulation through limbic system activity and prefrontal cortex engagement.'
      },
      learning: {
        id: 'learning',
        name: 'Learning',
        color: '#10B981',
        bgColor: 'bg-emerald-500',
        lightBg: 'bg-emerald-50 dark:bg-emerald-900/20',
        icon: BookOpen,
        brainRegions: ['Hippocampus', 'Prefrontal Cortex', 'Cerebellum'],
        shortDescription: 'How efficiently your brain acquires new information',
        description: 'This shows how ready your brain is to absorb, retain, and apply new information, whether that\'s studying, skill-building, or adapting to change. It reflects your brain\'s "plasticity mode," influenced heavily by sleep, stress levels, attention quality, and recovery.',
        dailyLife: 'Essential for adapting to new situations, professional growth, skill development, and personal evolution.',
        imbalanceEffects: {
          underactive: 'Difficulty retaining new information, slow skill acquisition, memory challenges.',
          overactive: 'Information overload, difficulty prioritizing what to learn, mental exhaustion from constant learning.'
        },
        neuroSenseConnection: 'NeuroSense measures learning capacity through theta wave patterns and memory consolidation markers.'
      },
      creativity: {
        id: 'creativity',
        name: 'Creativity',
        color: '#8B5CF6',
        bgColor: 'bg-violet-500',
        lightBg: 'bg-violet-50 dark:bg-violet-900/20',
        icon: Lightbulb,
        brainRegions: ['Default Mode Network', 'Prefrontal Cortex', 'Temporal Lobe'],
        shortDescription: 'Your brain\'s capacity for novel thinking',
        description: 'This reflects how easily your brain generates new ideas, connects concepts, and thinks flexibly beyond the obvious solution. It\'s not just "artistic", it also supports problem-solving, innovation, and adaptability, especially when your brain is rested and not overloaded by stress.',
        dailyLife: 'Enables problem-solving, innovation, artistic expression, and finding unique approaches to challenges.',
        imbalanceEffects: {
          underactive: 'Rigid thinking, difficulty generating new ideas, reliance on conventional solutions.',
          overactive: 'Scattered thinking, difficulty implementing ideas, constant ideation without execution.'
        },
        neuroSenseConnection: 'NeuroSense identifies creative potential through alpha wave patterns and default mode network activity.'
      }
    };

    const currentParameter = activeParameter ? brainParameters[activeParameter] : null;
    const displayParameter = hoveredParameter ? brainParameters[hoveredParameter] : currentParameter;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Your Brain Activity Hub</h2>
              <p className="text-blue-200 text-xs sm:text-sm">Let's explore your brain functions and activities</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6">
            {/* Brain Visualization - Takes more space */}
            <div className="xl:col-span-3 bg-gradient-to-b from-[#0a1628] to-[#1a2744] rounded-xl border border-gray-700 overflow-hidden">
              {/* Brain Image Container with Buttons ON the image */}
              <div className="relative p-3 sm:p-6 md:p-4 lg:p-8">
                <div className="relative w-full max-w-[600px] mx-auto aspect-square flex items-center justify-center">
                  <img
                    src="/neurobrainparametr.png"
                    alt="Brain Parameters Visualization"
                    className="w-full h-auto max-h-[300px] sm:max-h-[500px] object-contain"
                    style={{ filter: 'drop-shadow(0 0 40px rgba(99, 102, 241, 0.5))' }}
                  />

                  {/* Focus & Attention - ON the YELLOW area at TOP of brain */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'focus' ? null : 'focus')}
                    onMouseEnter={() => setHoveredParameter('focus')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'focus' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '18%', left: '55%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/60 ${
                      activeParameter === 'focus' ? 'ring-4 ring-amber-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-amber-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'focus' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Focus & Attention</span>
                  </button>

                  {/* Cognition - ON the upper left RED/front area of brain */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'cognition' ? null : 'cognition')}
                    onMouseEnter={() => setHoveredParameter('cognition')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'cognition' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '26%', left: '40%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/60 ${
                      activeParameter === 'cognition' ? 'ring-4 ring-blue-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-blue-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'cognition' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Cognition</span>
                  </button>

                  {/* Stress - ON the RED colored region of brain */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'stress' ? null : 'stress')}
                    onMouseEnter={() => setHoveredParameter('stress')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'stress' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '34%', left: '46%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-500 shadow-lg shadow-red-500/60 ${
                      activeParameter === 'stress' ? 'ring-4 ring-red-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-red-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'stress' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Stress</span>
                  </button>

                  {/* Emotional Regulation - ON the GREEN/YELLOW area (right side of brain) */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'emotional' ? null : 'emotional')}
                    onMouseEnter={() => setHoveredParameter('emotional')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'emotional' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '38%', left: '50%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-pink-500 shadow-lg shadow-pink-500/60 ${
                      activeParameter === 'emotional' ? 'ring-4 ring-pink-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-pink-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'emotional' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Emotional Regulation</span>
                  </button>

                  {/* Learning - ON the GREEN/TEAL area (middle of brain) */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'learning' ? null : 'learning')}
                    onMouseEnter={() => setHoveredParameter('learning')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'learning' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '46%', left: '52%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/60 ${
                      activeParameter === 'learning' ? 'ring-4 ring-emerald-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-emerald-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'learning' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Learning</span>
                  </button>

                  {/* Burnout & Fatigue - ON the lower brainstem area */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'burnout' ? null : 'burnout')}
                    onMouseEnter={() => setHoveredParameter('burnout')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'burnout' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '58%', left: '44%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gray-400 shadow-lg shadow-gray-400/60 ${
                      activeParameter === 'burnout' ? 'ring-4 ring-gray-300/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-gray-300/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'burnout' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Burnout & Fatigue</span>
                  </button>

                  {/* Creativity - ON the PURPLE/PINK cerebellum area */}
                  <button
                    onClick={() => setActiveParameter(activeParameter === 'creativity' ? null : 'creativity')}
                    onMouseEnter={() => setHoveredParameter('creativity')}
                    onMouseLeave={() => setHoveredParameter(null)}
                    className={`absolute flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group ${
                      activeParameter === 'creativity' ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                    }`}
                    style={{ top: '42%', left: '62%' }}
                  >
                    <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-violet-500 shadow-lg shadow-violet-500/60 ${
                      activeParameter === 'creativity' ? 'ring-4 ring-violet-400/50 animate-pulse' : 'group-hover:ring-2 group-hover:ring-violet-400/40'
                    }`} />
                    <span className={`mt-1 text-[9px] sm:text-xs font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap ${
                      activeParameter === 'creativity' ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                    }`}>Creativity</span>
                  </button>
                </div>

                <p className="text-center text-xs sm:text-sm text-gray-400 mt-4">
                  Click on any region to learn more
                </p>
              </div>
            </div>

            {/* Parameter Information Panel */}
            <div className="xl:col-span-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 sm:p-5 min-h-[350px] sm:min-h-[500px]">
              {displayParameter ? (
                <div className="space-y-2 sm:space-y-4 h-full">
                  {/* Parameter Header */}
                  <div className="flex items-center space-x-3">
                    <div className={`p-2.5 rounded-xl ${displayParameter.lightBg}`}>
                      <displayParameter.icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: displayParameter.color }} />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                        {displayParameter.name}
                      </h3>
                      <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">
                        {displayParameter.shortDescription}
                      </p>
                    </div>
                  </div>

                  {/* Brain Regions */}
                  <div className="flex flex-wrap gap-1.5">
                    {displayParameter.brainRegions.map((region, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-xs rounded-full font-medium"
                        style={{ backgroundColor: `${displayParameter.color}20`, color: displayParameter.color }}
                      >
                        {region}
                      </span>
                    ))}
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {displayParameter.description}
                    </p>
                  </div>

                  {/* Daily Life Impact */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600">
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Impact on Daily Life
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{displayParameter.dailyLife}</p>
                  </div>

                  {/* View Parameter Detail Button */}
                  <button
                    onClick={() => {
                      const routeId = displayParameter.id === 'focus' ? 'focus-attention' : displayParameter.id === 'emotional' ? 'emotional-regulation' : displayParameter.id === 'burnout' ? 'burnout-fatigue' : displayParameter.id;
                      if (algorithmResults) {
                        navigate(`/dashboard/${routeId}`);
                      } else {
                        setScanRequiredParam(displayParameter.name);
                        setShowScanRequiredPopup(true);
                      }
                    }}
                    className="w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: algorithmResults ? displayParameter.color : '#e5e7eb',
                      color: algorithmResults ? '#fff' : '#9ca3af'
                    }}
                  >
                    <displayParameter.icon className="h-4 w-4" />
                    {algorithmResults ? `View ${displayParameter.name} Report` : 'Scan Required'}
                  </button>

                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-6">
                  <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-600 flex items-center justify-center mb-3">
                    <Brain className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Select a Brain Region
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                    Click on any lobe in the brain diagram to learn about its functions and how to strengthen it.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* NeuroSense Summary Section */}
        <div className="bg-gradient-to-r from-[#323956] via-[#4a5578] to-[#323956] p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
              <div className="p-3 bg-white/10 rounded-xl w-fit">
                <Zap className="h-6 w-6 sm:h-8 sm:w-8 text-[#F5D05D]" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">What is NeuroSense?</h3>
                <p className="text-blue-200 text-xs sm:text-sm">Your personal brain health intelligence platform</p>
              </div>
            </div>

            <p className="text-blue-100 text-xs sm:text-base leading-relaxed mb-4">
              NeuroSense translates your brain's electrical signals into clear, actionable insights. Using advanced EEG analysis and AI-powered algorithms, we measure and track your cognitive parameters to help you understand and optimize your brain health.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-white/10">
                <Activity className="h-5 w-5 text-[#F5D05D] mb-2" />
                <h4 className="text-white font-semibold text-xs mb-1">Real-Time Monitoring</h4>
                <p className="text-blue-200 text-xs sm:text-sm">Track your brain activity and cognitive performance in real-time</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-white/10">
                <TrendingUp className="h-5 w-5 text-[#F5D05D] mb-2" />
                <h4 className="text-white font-semibold text-xs mb-1">Progress Tracking</h4>
                <p className="text-blue-200 text-xs sm:text-sm">Monitor improvements and identify areas for optimization</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 sm:p-4 border border-white/10">
                <Shield className="h-5 w-5 text-[#F5D05D] mb-2" />
                <h4 className="text-white font-semibold text-xs mb-1">Preventive Insights</h4>
                <p className="text-blue-200 text-xs sm:text-sm">Early detection of cognitive patterns for proactive brain health</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ProfileSection = () => (
    <div className="space-y-3 sm:space-y-6 md:space-y-8 relative">
      {/* Clinical History Incomplete Popup - Only overlays profile content */}
      {showClinicalHistoryPopup && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-white/10 rounded-full"></div>
              <div className="absolute -bottom-4 -left-4 w-14 h-14 bg-white/10 rounded-full"></div>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Complete Your Profile</h3>
                  <p className="text-amber-100 text-xs">Required to continue</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Your <span className="font-semibold text-amber-600">Clinical & Medical History</span> form is not filled yet.
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                    Please complete this form to access your profile and personalized features.
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mb-4">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Why complete this form?</p>
                <ul className="space-y-1.5">
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Personalized brain health insights</span>
                  </li>
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Better coaching recommendations</span>
                  </li>
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Track your progress effectively</span>
                  </li>
                </ul>
              </div>

              {/* Single Button - No dismiss option */}
              <button
                onClick={() => {
                  setShowClinicalHistoryPopup(false);
                  setShowClinicalReportForm(true);
                }}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2 shadow-md text-sm"
              >
                <FileText className="h-4 w-4" />
                <span>Complete Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center space-x-2 text-[#323956] dark:text-blue-400 hover:text-[#4a5578] dark:hover:text-blue-300 transition-colors text-sm sm:text-base font-medium"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        <span>Back</span>
      </button>

      {/* Profile Header Card */}
      <div className="bg-gradient-to-r from-[#323956] via-[#4a5578] to-[#323956] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
        </div>

        <div className="relative flex flex-col gap-4">
          {/* Profile Info */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 flex-shrink-0">
              <User className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">{patientData.profile.name}</h2>
              <p className="text-blue-200 text-xs sm:text-sm mt-0.5">Patient Profile</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="px-2.5 py-0.5 bg-white/20 rounded-full text-[11px] sm:text-sm text-white font-medium">
                  {patientUid || 'ID Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons - Always below profile info */}
          {!isEditingProfile ? (
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setShowClinicalReportForm(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all font-semibold shadow-lg text-xs sm:text-sm"
              >
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Clinical & Medical History</span>
                <span className="sm:hidden">Clinical Form</span>
              </button>
              <button
                onClick={handleEditProfile}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white text-[#323956] rounded-xl hover:bg-blue-50 transition-all font-semibold shadow-lg text-xs sm:text-sm"
              >
                <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Edit Profile</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setIsEditingProfile(false)}
                className="flex-1 px-3 py-2.5 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all font-medium backdrop-blur-sm text-xs sm:text-sm text-center"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all font-semibold shadow-lg disabled:opacity-50 text-xs sm:text-sm"
              >
                <Save className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{isSavingProfile ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Personal Information Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Section Header */}
        <div className="px-3 sm:px-6 md:px-8 py-4 sm:py-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#323956] flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Personal Information</h3>
              <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">Basic details and contact information</p>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <User className="h-3.5 w-3.5 text-[#323956]" />
                Full Name
              </label>
              {isEditingProfile ? (
                <input
                  type="text"
                  name="name"
                  value={profileFormData.name}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-[#323956] focus:ring-2 focus:ring-[#323956]/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Enter full name"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.name || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Mail className="h-3.5 w-3.5 text-[#323956]" />
                Email Address
              </label>
              <div className="bg-gray-100 dark:bg-gray-700/30 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                <p className="font-medium text-gray-600 dark:text-gray-300">{patientData.profile.email}</p>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Phone className="h-3.5 w-3.5 text-[#323956]" />
                Phone Number
              </label>
              {isEditingProfile ? (
                <input
                  type="tel"
                  name="phone"
                  value={profileFormData.phone}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-[#323956] focus:ring-2 focus:ring-[#323956]/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Enter phone number"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.phone || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Cake className="h-3.5 w-3.5 text-[#323956]" />
                Date of Birth
              </label>
              {isEditingProfile ? (
                <input
                  type="date"
                  name="dateOfBirth"
                  value={profileFormData.dateOfBirth}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-[#323956] focus:ring-2 focus:ring-[#323956]/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.dateOfBirth || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <User className="h-3.5 w-3.5 text-[#323956]" />
                Gender
              </label>
              {isEditingProfile ? (
                <select
                  name="gender"
                  value={profileFormData.gender}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-[#323956] focus:ring-2 focus:ring-[#323956]/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.gender || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Handedness */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Hand className="h-3.5 w-3.5 text-[#323956]" />
                Handedness
              </label>
              {isEditingProfile ? (
                <select
                  name="handedness"
                  value={profileFormData.handedness}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-[#323956] focus:ring-2 focus:ring-[#323956]/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                >
                  <option value="">Select Handedness</option>
                  <option value="Right">Right</option>
                  <option value="Left">Left</option>
                  <option value="Ambidextrous">Ambidextrous</option>
                </select>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.handedness || clinicalReport?.handedness || 'Not provided'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Details Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Section Header */}
        <div className="px-3 sm:px-6 md:px-8 py-4 sm:py-5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-gray-700 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Additional Details</h3>
              <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">Address, occupation, and medical referral info</p>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Occupation */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                Occupation
              </label>
              {isEditingProfile ? (
                <input
                  type="text"
                  name="occupation"
                  value={profileFormData.occupation}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Enter your occupation"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.occupation || clinicalReport?.occupation || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Address */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                Address
              </label>
              {isEditingProfile ? (
                <input
                  type="text"
                  name="address"
                  value={profileFormData.address}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Enter your address"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.address || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Emergency Contact */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Shield className="h-3.5 w-3.5 text-red-500" />
                Emergency Contact
              </label>
              {isEditingProfile ? (
                <input
                  type="text"
                  name="emergencyContact"
                  value={profileFormData.emergencyContact}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-red-400 focus:ring-2 focus:ring-red-400/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Name & phone number"
                />
              ) : (
                <div className="bg-red-50 dark:bg-red-900/10 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-red-100 dark:border-red-900/30">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.emergencyContact || 'Not provided'}</p>
                </div>
              )}
            </div>

            {/* Reason for Referral */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                Reason for Referral
              </label>
              {isEditingProfile ? (
                <input
                  type="text"
                  name="referral_reason"
                  value={profileFormData.referral_reason}
                  onChange={handleProfileInputChange}
                  className="w-full bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-gray-900 dark:text-white font-medium text-sm placeholder:text-xs placeholder:text-gray-400"
                  placeholder="Enter reason for referral"
                />
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                  <p className="font-semibold text-gray-900 dark:text-white">{patientData.profile.referral_reason || clinicalReport?.referral_reason || 'Not provided'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clinic Information Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Section Header */}
        <div className="px-3 sm:px-6 md:px-8 py-4 sm:py-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-700 dark:to-gray-700 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
              <Heart className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Your Clinic</h3>
              <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">Healthcare provider information</p>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Clinic Name */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Briefcase className="h-3.5 w-3.5 text-purple-600" />
                Clinic Name
              </label>
              <div className="bg-purple-50 dark:bg-purple-900/10 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="font-bold text-purple-900 dark:text-purple-100">{patientData.clinic.name}</p>
              </div>
            </div>

            {/* Primary Doctor */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <User className="h-3.5 w-3.5 text-purple-600" />
                Primary Doctor
              </label>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                <p className="font-semibold text-gray-900 dark:text-white">{patientData.clinic.doctorName}</p>
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Phone className="h-3.5 w-3.5 text-purple-600" />
                Clinic Phone
              </label>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600 hover:border-purple-300 transition-colors">
                <a href={`tel:${patientData.clinic.phone}`} className="font-semibold text-purple-700 dark:text-purple-400 hover:underline">
                  {patientData.clinic.phone}
                </a>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <Mail className="h-3.5 w-3.5 text-purple-600" />
                Clinic Email
              </label>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600 hover:border-purple-300 transition-colors">
                <a href={`mailto:${patientData.clinic.email}`} className="font-semibold text-purple-700 dark:text-purple-400 hover:underline truncate block">
                  {patientData.clinic.email}
                </a>
              </div>
            </div>

            {/* Address */}
            <div className="md:col-span-2 space-y-2">
              <label className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <MapPin className="h-3.5 w-3.5 text-purple-600" />
                Clinic Address
              </label>
              <div className="bg-gray-50 dark:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-gray-100 dark:border-gray-600">
                <p className="font-semibold text-gray-900 dark:text-white">{patientData.clinic.address}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clinical & Medical History - Action Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div style={{ backgroundColor: '#323956' }} className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg" style={{ backgroundColor: '#E4EFFF' }}>
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#323956' }} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Clinical & Medical History</h2>
              <p className="text-blue-200 text-xs sm:text-base">
                {clinicalReport ? 'Your clinical information' : 'Clinical information not available'}
              </p>
            </div>
          </div>
        </div>
        {!clinicalReport && (
          <div className="p-3 sm:p-4" style={{ backgroundColor: '#E4EFFF' }}>
            <p className="text-xs sm:text-base" style={{ color: '#323956' }}>
              Clinical and medical history information will be displayed here once available.
            </p>
          </div>
        )}
      </div>

      {/* Clinical Report Information */}
      {clinicalReport && (
        <>
          {/* Patient Information from Clinical Report */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-6">
            <div className="flex items-center space-x-3 mb-4 sm:mb-6">
              <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-blue-900 dark:text-blue-100" />
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-blue-900 dark:text-blue-100">Clinical Report Information</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Full Name</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.full_name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Date of Birth</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">
                  {formatDate(clinicalReport.date_of_birth)} (Age: {getAge(clinicalReport.date_of_birth)} years)
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Gender</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.gender || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Handedness</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.handedness || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Occupation</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.occupation || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Patient ID</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg font-semibold tracking-wide break-all">
                  {patientUid || 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Date of Test</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{formatDate(clinicalReport.date_of_test)}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Referring Physician</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.referring_physician || 'N/A'}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 sm:mb-2">Reason for Referral</label>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 p-2.5 sm:p-3 rounded-lg">{clinicalReport.referral_reason || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Clinical & Medical History */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 sm:p-6">
            <div className="flex items-center space-x-3 mb-4 sm:mb-6">
              <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-green-900 dark:text-green-100" />
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-green-900 dark:text-green-100">Clinical & Medical History</h2>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2">Presenting Complaints:</p>
                {renderCheckboxList(clinicalReport.presenting_complaints, presentingComplaintsLabels)}
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2">Duration & Onset of Symptoms:</p>
                {renderCheckboxList(clinicalReport.symptom_duration, symptomDurationLabels)}
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2">Past Medical History:</p>
                {renderCheckboxList(clinicalReport.past_medical_history, pastMedicalHistoryLabels)}
              </div>
            </div>
          </div>

          {/* Medication History */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 sm:p-6">
            <div className="flex items-center space-x-3 mb-4 sm:mb-6">
              <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-purple-900 dark:text-purple-100" />
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-purple-900 dark:text-purple-100">Medication History</h2>
            </div>

            <div className="space-y-2 sm:space-y-3">
              {renderCheckboxList(clinicalReport.medications, medicationsLabels)}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const ReportsSection = () => {
    // State for showing sub-parameters modal
    const [selectedParameter, setSelectedParameter] = useState(null);
    const [showSubParametersModal, setShowSubParametersModal] = useState(false);

    // Filter out EDF/EEG/BDF files - patients should not see raw data files
    const filteredReports = patientReports.filter(report => {
      const fileName = (report.fileName || report.file_name || '').toLowerCase();
      return !fileName.endsWith('.edf') && !fileName.endsWith('.eeg') && !fileName.endsWith('.bdf');
    });

    // Get brain parameters from algorithm results or uploaded reports
    const getReportBrainParameters = () => {
      // Priority 1: Algorithm results from Algorithm Data Processor
      if (algorithmResults?.data && Array.isArray(algorithmResults.data)) {
        // Convert algorithm format to display format
        return algorithmResults.data.map((result, index) => {
          const paramDescriptions = {
            'Cognition': 'Cognition refers to mental processes like thinking, memory, and problem-solving. Good cognitive health supports daily functioning and quality of life.',
            'Stress': 'Stress is the body\'s response to challenges. Chronic stress can affect mental and physical health, impacting mood, sleep, and overall well-being.',
            'Focus & Attention': 'Focus and attention involve the ability to concentrate on tasks. Strong attention skills support productivity, learning, and daily activities.',
            'Burnout & Fatigue': 'Burnout and fatigue result from prolonged stress or overwork. Managing these is essential for maintaining energy levels and preventing exhaustion.',
            'Emotional Regulation': 'Emotional regulation is the ability to manage and respond to emotions effectively. Good emotional regulation supports mental health and relationships.',
            'Learning': 'Learning capacity is crucial for development in young individuals. It involves acquiring knowledge, skills, and adapting to new information.',
            'Creativity': 'Creativity involves generating new ideas and solutions. It supports innovation, problem-solving, and personal expression.'
          };

          // Determine status label based on status and parameter type
          const isStressOrBurnout = result.parameter === 'Stress' || result.parameter === 'Burnout & Fatigue';
          let statusLabel = result.status;
          let displayStatus = result.status?.toLowerCase() || 'normal';

          // Convert sub-parameters/metrics
          const subParams = (result.metrics || []).map(metric => ({
            name: metric.name,
            status: metric.score > 0 ? 'good' : 'bad',
            value: metric.value !== undefined ? `${metric.name} = ${metric.value}` : `Score: ${metric.score}/${metric.maxScore || 1}`,
            note: metric.threshold ? `Threshold: ${metric.threshold}` : ''
          }));

          // Count normal/borderline/abnormal from metrics
          const normalCount = (result.metrics || []).filter(m => m.score > 0).length;
          const abnormalCount = (result.metrics || []).filter(m => m.score === 0).length;

          return {
            id: index + 1,
            name: result.parameter,
            value: result.score?.toString() || '--',
            unit: '%',
            status: displayStatus,
            range: isStressOrBurnout
                   ? (result.status === 'Low' ? 'Normal' :
                      result.status === 'Mild' ? 'Mild' :
                      result.status === 'Moderate' ? 'Moderate' :
                      result.status === 'Severe' ? 'Severe' : 'Normal')
                   : (result.status === 'High' ? 'Good' :
                      result.status === 'Medium' ? 'Moderate' :
                      result.status === 'Low' ? 'Lower Than Normal' : 'Normal'),
            description: paramDescriptions[result.parameter] || `${result.parameter} parameter from brain analysis.`,
            normal: normalCount,
            borderline: 0,
            abnormal: abnormalCount,
            score: result.rawScore || '--',
            scoreLabel: statusLabel,
            color: result.color,
            subParameters: subParams
          };
        });
      }

      // Priority 2: Check patient reports with brain parameters data (excluding EDF files)
      const reportWithBrainParams = filteredReports.find(report => {
        const reportData = report.reportData || report.report_data;
        return reportData?.brainParameters || reportData?.brain_parameters;
      });

      if (reportWithBrainParams) {
        const reportData = reportWithBrainParams.reportData || reportWithBrainParams.report_data;
        return reportData?.brainParameters || reportData?.brain_parameters;
      }

      // Priority 3: Check clinical report for brain parameters
      if (clinicalReport?.brain_parameters) {
        return clinicalReport.brain_parameters;
      }

      return null;
    };

    const liveBrainParams = getReportBrainParameters();

    // Default brain parameters structure with descriptions
    const defaultBrainParameters = [
      {
        id: 1,
        name: 'Cognition',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Cognition refers to mental processes like thinking, memory, and problem-solving. Good cognitive health supports daily functioning and quality of life.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 2,
        name: 'Stress',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Stress is the body\'s response to challenges. Chronic stress can affect mental and physical health, impacting mood, sleep, and overall well-being.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 3,
        name: 'Focus + Attention',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Focus and attention involve the ability to concentrate on tasks. Strong attention skills support productivity, learning, and daily activities.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 4,
        name: 'Burnout & Fatigue',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Burnout and fatigue result from prolonged stress or overwork. Managing these is essential for maintaining energy levels and preventing exhaustion.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 5,
        name: 'Emotional Regulation',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Emotional regulation is the ability to manage and respond to emotions effectively. Good emotional regulation supports mental health and relationships.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 6,
        name: '[+ Under 18] Learning',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Learning capacity is crucial for development in young individuals. It involves acquiring knowledge, skills, and adapting to new information.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      },
      {
        id: 7,
        name: 'Creativity',
        value: '--',
        unit: 'Score',
        status: 'pending',
        range: 'No Data',
        description: 'Creativity involves generating new ideas and solutions. It supports innovation, problem-solving, and personal expression.',
        normal: 0,
        borderline: 0,
        abnormal: 0,
        score: '--',
        scoreLabel: 'Pending',
        subParameters: []
      }
    ];

    // Merge live data with defaults if available
    const brainParameters = liveBrainParams && Array.isArray(liveBrainParams)
      ? liveBrainParams.map((liveParam, index) => ({
          ...defaultBrainParameters[index],
          ...liveParam
        }))
      : defaultBrainParameters;

    return (
      <div className="space-y-2 sm:space-y-6">
        {/* NeuroSense Reports */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center space-x-3 mb-4 sm:mb-6">
            <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
              <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Neurosense Performance Reports</h2>
          </div>

        <div className="grid gap-3 sm:gap-4">
          {clinicalReport ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* Test Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center p-4 sm:p-5 bg-white dark:bg-gray-800 gap-2 sm:gap-0">
                {/* Progress circle and Test details row on mobile */}
                <div className="flex items-center flex-1">
                  {/* Progress circle */}
                  <div className="mr-3 sm:mr-4 flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full border-4 border-green-500 flex items-center justify-center">
                      <svg className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 transform -rotate-90">
                        <circle
                          cx="24"
                          cy="24"
                          r="20"
                          stroke="#e5e7eb"
                          strokeWidth="3"
                          fill="none"
                          className="sm:hidden"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="20"
                          stroke="#22c55e"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 20}`}
                          strokeDashoffset={`${2 * Math.PI * 20 * (1 - 0.85)}`}
                          className="sm:hidden"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="#e5e7eb"
                          strokeWidth="4"
                          fill="none"
                          className="hidden sm:block"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          stroke="#22c55e"
                          strokeWidth="4"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 28}`}
                          strokeDashoffset={`${2 * Math.PI * 28 * (1 - 0.85)}`}
                          className="hidden sm:block"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Test details */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Test Name</p>
                      <h3 className="font-semibold text-sm sm:text-base text-blue-600 dark:text-blue-400 truncate">
                        Neurosense Performance Report
                      </h3>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Collected</p>
                      <p className="text-xs sm:text-base text-gray-700 dark:text-gray-300">
                        {new Date(clinicalReport.created_at || clinicalReport.date_of_test).toLocaleString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-row sm:flex-col gap-2 sm:space-y-2 sm:ml-4">
                  <button
                    onClick={async () => {
                      try {
                        // Check if clinical report has an associated file
                        if (clinicalReport.file_path || clinicalReport.filePath || clinicalReport.report_file || clinicalReport.fileName || clinicalReport.file_name) {
                          const filePath = clinicalReport.file_path || clinicalReport.filePath || clinicalReport.report_file;

                          // Get original filename with extension
                          let fileName = clinicalReport.fileName || clinicalReport.file_name || 'Clinical_NeuroSense_QEEG_Report';

                          // If filePath exists but no fileName, extract from path
                          if (filePath && !fileName.includes('.')) {
                            const pathParts = filePath.split('/');
                            const fileNameFromPath = pathParts[pathParts.length - 1];
                            if (fileNameFromPath) {
                              fileName = fileNameFromPath;
                            }
                          }

                          // Ensure fileName has an extension
                          if (!fileName.includes('.')) {
                            fileName = fileName + '.pdf'; // Default to PDF if no extension
                          }

                          // Get signed URL from Supabase Storage
                          const downloadUrl = await StorageService.getSignedUrl(filePath, 300);

                          if (downloadUrl) {
                            // Fetch the file as blob to force download
                            const response = await fetch(downloadUrl);
                            const blob = await response.blob();

                            // Create blob URL
                            const blobUrl = window.URL.createObjectURL(blob);

                            // Create download link
                            const link = document.createElement('a');
                            link.href = blobUrl;
                            link.download = fileName;
                            link.style.display = 'none';
                            document.body.appendChild(link);
                            link.click();

                            // Cleanup
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(blobUrl);

                            toast.success(`Downloading ${fileName}`);
                          } else {
                            toast.error('Could not generate download link');
                          }
                        } else {
                          // No file available - this is just database data
                          toast.info('This report is displayed as parameters only. No file available for download.');
                        }
                      } catch (error) {
                        console.error('Download error:', error);
                        toast.error(getFriendlyErrorMessage(error, 'Download failed. Please try again.'));
                      }
                    }}
                    className="bg-teal-700 hover:bg-teal-800 text-white px-3 sm:px-6 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 text-xs sm:text-base flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </button>
                  <button
                    onClick={() => setShowReportDetail(!showReportDetail)}
                    className="bg-gray-700 dark:bg-gray-600 text-white px-3 sm:px-6 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2 text-xs sm:text-base flex-1 sm:flex-none"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View Detail</span>
                  </button>
                </div>
              </div>

              {/* Expandable Test Details Section - All Parameters */}
              {showReportDetail && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Map through all 7 brain parameters */}
                  {brainParameters.map((parameter) => (
                    <div key={parameter.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-5 space-y-3 sm:space-y-4"
                      style={{
                        borderLeftWidth: '4px',
                        borderLeftColor: parameter.color === 'green' ? '#22c55e' :
                                         parameter.color === 'orange' ? '#f97316' :
                                         parameter.color === 'red' ? '#ef4444' :
                                         parameter.color === 'blue' ? '#3b82f6' : '#323956'
                      }}>
                      {/* Combined Header Row with Table Headers and Filters */}
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between pb-3 border-b border-gray-300 dark:border-gray-600 gap-3">
                        {/* Table Headers - Hidden on mobile, shown as labels in data row */}
                        <div className="hidden lg:grid lg:grid-cols-3 gap-2 sm:gap-4 lg:gap-2 flex-1">
                          <div>
                            <span className="text-xs sm:text-base font-semibold" style={{ color: '#323956' }}>Parameter Name</span>
                          </div>
                          <div>
                            <span className="text-xs sm:text-base font-semibold" style={{ color: '#323956' }}>Result</span>
                          </div>
                          <div>
                            <span className="text-xs sm:text-base font-semibold" style={{ color: '#323956' }}>Range</span>
                          </div>
                        </div>

                        {/* Mobile: Parameter name and sub-parameter button */}
                        <div className="flex lg:hidden items-center justify-between">
                          <span className="font-semibold text-xs sm:text-sm" style={{ color: '#323956' }}>{parameter.name}</span>
                          <button
                            onClick={() => {
                              if (parameter.subParameters && parameter.subParameters.length > 0) {
                                setSelectedParameter(parameter);
                                setShowSubParametersModal(true);
                              } else {
                                toast.info(`No sub-parameters available for ${parameter.name}`);
                              }
                            }}
                            className="bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm"
                          >
                            Sub Params
                          </button>
                        </div>

                        {/* Filter Checkboxes - Hidden on mobile */}
                        <div className="hidden xl:flex items-center space-x-3 ml-6">
                          <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#DC2626' }}>
                            <input type="checkbox" className="rounded w-3 h-3" />
                            <span>Less than 0.00</span>
                          </label>
                          <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#F59E0B' }}>
                            <input type="checkbox" className="rounded w-3 h-3" />
                            <span>Between 0.00 to 6.45</span>
                          </label>
                          <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#14B8A6' }}>
                            <input type="checkbox" className="rounded w-3 h-3" />
                            <span>Between 6.45 to 123.55</span>
                          </label>
                          <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#DC2626' }}>
                            <input type="checkbox" className="rounded w-3 h-3" />
                            <span>Greater than 125.00</span>
                          </label>
                        </div>

                        {/* Sub Parameter Button - Hidden on mobile (shown in mobile header) */}
                        <div className="hidden lg:block ml-4">
                          <button
                            onClick={() => {
                              if (parameter.subParameters && parameter.subParameters.length > 0) {
                                setSelectedParameter(parameter);
                                setShowSubParametersModal(true);
                              } else {
                                toast.info(`No sub-parameters available for ${parameter.name}`);
                              }
                            }}
                            className="bg-teal-700 hover:bg-teal-800 text-white px-4 lg:px-5 py-2 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm"
                            style={{ minWidth: '120px' }}
                          >
                            Sub Parameter
                          </button>
                        </div>
                      </div>

                      {/* Parameter Data Row - Stack on mobile */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 lg:gap-2">
                        {/* Parameter Name - Hidden on mobile (shown in header) */}
                        <div className="hidden lg:block">
                          <span className="font-semibold text-xs sm:text-base" style={{ color: '#323956' }}>{parameter.name}</span>
                        </div>
                        {/* Result */}
                        <div className="flex flex-col items-center gap-1 text-center">
                          <span className="text-xs sm:text-sm text-gray-500 sm:hidden">Result</span>
                          {parameter.score && parameter.scoreLabel ? (
                            <span className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-base font-bold"
                              style={{
                                backgroundColor: parameter.color === 'green' ? '#22c55e' :
                                                 parameter.color === 'orange' ? '#f97316' :
                                                 parameter.color === 'red' ? '#ef4444' :
                                                 parameter.color === 'blue' ? '#3b82f6' : '#323956',
                                color: 'white'
                              }}>
                              {parameter.score} {parameter.scoreLabel}
                            </span>
                          ) : (
                            <span className={`font-bold text-xs sm:text-base ${
                              parameter.status === 'high' ? 'text-red-600' :
                              parameter.status === 'borderline' ? 'text-orange-500' :
                              'text-green-600'
                            }`}>
                              {parameter.value} {parameter.unit}
                            </span>
                          )}
                        </div>
                        {/* Range */}
                        <div className="flex flex-col gap-1">
                          <span className="text-xs sm:text-sm text-gray-500 sm:hidden">Range</span>
                          <span className={`text-xs sm:text-base font-medium ${
                            parameter.status === 'normal' ? 'text-green-600' :
                            parameter.status === 'borderline' ? 'text-orange-500' :
                            'text-red-600'
                          }`}>
                            {parameter.range}
                          </span>
                        </div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="pt-1 sm:pt-2">
                        <div className="flex items-center justify-end mb-1 sm:mb-2">
                          <span className="text-xs sm:text-base font-bold" style={{ color: '#323956' }}>{parameter.value}</span>
                        </div>
                        <div className="relative h-2 sm:h-3 bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-500 rounded-full shadow-inner"></div>
                      </div>

                      {/* Educational Information */}
                      <div className="bg-gray-50 dark:bg-gray-700/50 border-l-4 p-2 sm:p-4 rounded text-xs sm:text-sm leading-relaxed" style={{ borderColor: '#323956', color: '#323956' }}>
                        <p className="text-xs sm:text-sm">
                          <strong>{parameter.name}:</strong> {parameter.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Uploaded Response Reports - EDF/EEG/BDF files are filtered out */}
          {filteredReports.length > 0 && filteredReports.map((report) => (
            <div key={report.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* Report Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center p-4 sm:p-5 bg-white dark:bg-gray-800 gap-3 sm:gap-0">
                {/* File Icon and Report details row */}
                <div className="flex items-center flex-1">
                  {/* File Icon */}
                  <div className="mr-3 sm:mr-4 flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-lg bg-[#E4EFFF] dark:bg-blue-900/30 flex items-center justify-center">
                      <FileText className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-[#323956] dark:text-blue-400" />
                    </div>
                  </div>

                  {/* Report details */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-1">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">File Name</p>
                      <h3 className="font-semibold text-sm sm:text-base text-blue-600 dark:text-blue-400 truncate">
                        {report.fileName || report.file_name || 'Report'}
                      </h3>
                      {report.reportData?.isResponseReport && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs sm:text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 mt-1">
                          Response Report
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Collected</p>
                      <p className="text-xs sm:text-base text-gray-700 dark:text-gray-300">
                        {new Date(report.createdAt || report.created_at).toLocaleString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-row sm:flex-col gap-2 sm:space-y-2 sm:ml-4">
                  <button
                    onClick={async () => {
                      try {
                        // Debug: Log full report object to see structure

                        // Try all possible field name variations
                        const reportDataObj = report.reportData || report.report_data || {};
                        const filePath = report.filePath || report.file_path || report.storagePath || reportDataObj.filePath || reportDataObj.file_path;
                        const directFileUrl = reportDataObj.fileUrl || reportDataObj.file_url || report.fileUrl || report.file_url;


                        if (!filePath && !directFileUrl) {
                          toast.error('File path not found');
                          return;
                        }

                        // Get original filename with extension
                        let fileName = report.fileName || report.file_name || report.reportData?.fileName || report.report_data?.fileName;

                        // If no fileName, extract from filePath or directFileUrl
                        if (!fileName) {
                          const pathToUse = filePath || directFileUrl || '';
                          const pathParts = pathToUse.split('/');
                          const lastPart = pathParts[pathParts.length - 1];
                          if (lastPart && lastPart.includes('.')) {
                            fileName = lastPart.split('?')[0]; // Remove query params
                          }
                        }

                        // Fallback to generic name with extension if still not found
                        if (!fileName) {
                          fileName = 'report.pdf';
                        }

                        let downloadUrl = null;

                        // Try direct file URL first (works for both local and public Supabase URLs)
                        if (directFileUrl) {
                          downloadUrl = directFileUrl;
                        }

                        // If no direct URL, try to get signed URL from Supabase Storage
                        if (!downloadUrl && filePath && !filePath.startsWith('/uploads')) {
                          try {
                            downloadUrl = await StorageService.getSignedUrl(filePath, 300);
                          } catch (err) {
                          }
                        }

                        if (downloadUrl) {
                          // Fetch the file as blob to force download
                          const response = await fetch(downloadUrl);

                          if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                          }

                          const blob = await response.blob();

                          // Create blob URL
                          const blobUrl = window.URL.createObjectURL(blob);

                          // Create download link
                          const link = document.createElement('a');
                          link.href = blobUrl;
                          link.download = fileName;
                          link.style.display = 'none';
                          document.body.appendChild(link);
                          link.click();

                          // Cleanup
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(blobUrl);

                          toast.success(`Downloading ${fileName}`);
                        } else {
                          toast.error('Could not generate download link');
                        }
                      } catch (error) {
                        console.error('Download error:', error);
                        toast.error(getFriendlyErrorMessage(error, 'Download failed. Please try again.'));
                      }
                    }}
                    className="bg-teal-700 hover:bg-teal-800 text-white px-3 sm:px-6 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 text-xs sm:text-base flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download</span>
                  </button>
                  <button
                    onClick={() => {
                      // Toggle inline expansion
                      if (expandedReportId === report.id) {
                        setExpandedReportId(null);
                      } else {
                        setExpandedReportId(report.id);
                      }
                    }}
                    className="bg-gray-700 dark:bg-gray-600 text-white px-3 sm:px-6 py-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2 text-xs sm:text-base flex-1 sm:flex-none"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View Detail</span>
                  </button>
                </div>
              </div>

              {/* Expandable Test Details Section - All Parameters */}
              {expandedReportId === report.id && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Map through all 7 brain parameters */}
                  {brainParameters.map((parameter) => (
                    <div key={parameter.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-5 space-y-3 sm:space-y-4"
                      style={{
                        borderLeftWidth: '4px',
                        borderLeftColor: parameter.color === 'green' ? '#22c55e' :
                                         parameter.color === 'orange' ? '#f97316' :
                                         parameter.color === 'red' ? '#ef4444' :
                                         parameter.color === 'blue' ? '#3b82f6' : '#323956'
                      }}>
                      {/* Table Structure with Headers, Data, and Filters */}
                      <div className="space-y-2 sm:space-y-3">
                        {/* Mobile: Parameter name and sub-parameter button */}
                        <div className="flex lg:hidden items-center justify-between pb-2 border-b border-gray-300 dark:border-gray-600">
                          <span className="font-semibold text-xs sm:text-sm" style={{ color: '#323956' }}>{parameter.name}</span>
                          <button
                            onClick={() => {
                              if (parameter.subParameters && parameter.subParameters.length > 0) {
                                setSelectedParameter(parameter);
                                setShowSubParametersModal(true);
                              } else {
                                toast.info(`No sub-parameters available for ${parameter.name}`);
                              }
                            }}
                            className="bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm"
                          >
                            Sub Params
                          </button>
                        </div>

                        {/* Row 1: Headers + Checkboxes - Hidden on mobile */}
                        <div className="hidden lg:flex items-center justify-between">
                          {/* Left: Table Headers (3 columns) */}
                          <div className="flex items-center space-x-8 lg:space-x-16 flex-1">
                            <div className="w-32 lg:w-40">
                              <span className="text-xs sm:text-base font-semibold text-gray-700 dark:text-gray-300">Parameter Name</span>
                            </div>
                            <div className="w-32 lg:w-40">
                              <span className="text-xs sm:text-base font-semibold text-gray-700 dark:text-gray-300">Result</span>
                            </div>
                            <div className="w-32 lg:w-40">
                              <span className="text-xs sm:text-base font-semibold text-gray-700 dark:text-gray-300">Range</span>
                            </div>
                          </div>

                          {/* Right: Filter Checkboxes - Hidden on smaller screens */}
                          <div className="hidden xl:flex items-center space-x-3">
                            <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#DC2626' }}>
                              <input type="checkbox" className="rounded w-3 h-3" />
                              <span>Less than 0.00</span>
                            </label>
                            <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#F59E0B' }}>
                              <input type="checkbox" className="rounded w-3 h-3" />
                              <span>Between 0.00 to 6.45</span>
                            </label>
                            <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#14B8A6' }}>
                              <input type="checkbox" className="rounded w-3 h-3" />
                              <span>Between 6.45 to 123.55</span>
                            </label>
                            <label className="flex items-center space-x-1.5 text-xs sm:text-sm" style={{ color: '#DC2626' }}>
                              <input type="checkbox" className="rounded w-3 h-3" />
                              <span>Greater than 125.00</span>
                            </label>
                          </div>

                          {/* Sub Parameter Button - Hidden on mobile */}
                          <div className="ml-4">
                            <button
                              onClick={() => {
                                if (parameter.subParameters && parameter.subParameters.length > 0) {
                                  setSelectedParameter(parameter);
                                  setShowSubParametersModal(true);
                                } else {
                                  toast.info(`No sub-parameters available for ${parameter.name}`);
                                }
                              }}
                              className="bg-teal-700 hover:bg-teal-800 text-white px-4 lg:px-5 py-2 rounded-lg transition-all duration-200 flex items-center justify-center shadow-md hover:shadow-lg font-semibold text-xs sm:text-sm"
                              style={{ minWidth: '120px' }}
                            >
                              Sub Parameter
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Data Values - Stack on mobile */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 lg:space-x-16 pb-3 border-b border-gray-300 dark:border-gray-600">
                          {/* Parameter Name - Hidden on mobile (shown in header) */}
                          <div className="hidden lg:block">
                            <p className="font-semibold text-gray-900 dark:text-white text-xs sm:text-base">{parameter.name}</p>
                          </div>
                          {/* Result */}
                          <div className="flex flex-col gap-1">
                            <span className="text-xs sm:text-sm text-gray-500 sm:hidden">Result</span>
                            {parameter.score && parameter.scoreLabel ? (
                              <span className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-base font-bold w-fit"
                                style={{
                                  backgroundColor: parameter.color === 'green' ? '#22c55e' :
                                                   parameter.color === 'orange' ? '#f97316' :
                                                   parameter.color === 'red' ? '#ef4444' :
                                                   parameter.color === 'blue' ? '#3b82f6' : '#323956',
                                  color: 'white'
                                }}>
                                {parameter.score} {parameter.scoreLabel}
                              </span>
                            ) : (
                              <p className="font-semibold text-gray-900 dark:text-white text-xs sm:text-base">
                                {parameter.value} {parameter.unit}
                              </p>
                            )}
                          </div>
                          {/* Range */}
                          <div className="flex flex-col gap-1">
                            <span className="text-xs sm:text-sm text-gray-500 sm:hidden">Range</span>
                            <p className="text-gray-900 dark:text-white text-xs sm:text-base">{parameter.range}</p>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar with Multi-Color Gradient */}
                      <div className="w-full">
                        <div className="flex justify-end mb-1">
                          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{parameter.value}</span>
                        </div>
                        <div className="relative w-full h-2 sm:h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #10B981 0%, #10B981 33%, #F59E0B 33%, #F59E0B 66%, #DC2626 66%, #DC2626 100%)' }}>
                          {/* Value Marker */}
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-gray-800 dark:bg-white shadow-lg"
                            style={{ left: `${Math.min((parseFloat(parameter.value) / 150) * 100, 100)}%`, transform: 'translateX(-50%)' }}
                          >
                            {/* Diamond marker at top */}
                            <div className="absolute -top-1.5 sm:-top-2 left-1/2 transform -translate-x-1/2 w-2 h-2 sm:w-3 sm:h-3 bg-gray-800 dark:bg-white rotate-45"></div>
                          </div>
                        </div>
                      </div>

                      {/* Parameter Description */}
                      <div className="mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg border-l-4" style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }}>
                        <p className="text-xs sm:text-base text-gray-800">
                          <span className="font-semibold text-gray-900">{parameter.name}:</span> {parameter.description}
                        </p>
                      </div>

                      {/* Analysis Summary */}
                      <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-2 sm:mt-3">
                        <div className="text-center p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <p className="text-xs sm:text-base font-bold text-green-600 dark:text-green-400">{parameter.normal}</p>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">Normal</p>
                        </div>
                        <div className="text-center p-2 sm:p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <p className="text-xs sm:text-base font-bold text-orange-500 dark:text-orange-400">{parameter.borderline}</p>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">Borderline</p>
                        </div>
                        <div className="text-center p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <p className="text-xs sm:text-base font-bold text-red-600 dark:text-red-400">{parameter.abnormal}</p>
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">Abnormal</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* No Reports Message */}
          {!clinicalReport && patientReports.length === 0 && (
            <div className="text-center py-4 sm:py-8 md:py-12 text-gray-500 dark:text-gray-400">
              <FileText className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-xs sm:text-base font-medium">No Reports Available</p>
              <p className="text-xs sm:text-base mt-1 sm:mt-2">Your reports will appear here once they are generated by your clinic.</p>
            </div>
          )}
        </div>
      </div>

      {/* Personalized Care Plans */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
            <Target className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Personalized Care Plans</h2>
        </div>

        <div className="space-y-3 sm:space-y-4">
          {patientData.carePlans && Array.isArray(patientData.carePlans) && patientData.carePlans.map((plan) => (
            <div key={plan.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0 mb-3 sm:mb-4">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">{plan.title}</h3>
                <span className="text-xs sm:text-base text-[#323956] dark:text-blue-400 font-medium">{plan.progress}% Complete</span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2 mb-3 sm:mb-4">
                <div
                  className="bg-[#323956] dark:bg-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-300"
                  style={{ width: `${plan.progress}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                <div>
                  <label className="block text-xs sm:text-base font-medium text-gray-700 dark:text-gray-400 mb-0.5 sm:mb-1">Next Session</label>
                  <p className="text-xs sm:text-base text-gray-900 dark:text-white">{plan.nextSession}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-base font-medium text-gray-700 dark:text-gray-400 mb-1.5 sm:mb-2">Goals</label>
                <ul className="space-y-1">
                  {plan.goals.map((goal, index) => (
                    <li key={index} className="flex items-start sm:items-center space-x-2 text-xs sm:text-base text-gray-600 dark:text-gray-300">
                      <Star className="h-3 w-3 sm:h-4 sm:w-4 text-[#F5D05D] dark:text-yellow-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Parameters Modal */}
      {showSubParametersModal && selectedParameter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
                  <Brain className="h-5 w-5 text-[#323956] dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedParameter.name}</h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs sm:text-sm font-medium ${
                      selectedParameter.scoreLabel === 'Good' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      selectedParameter.scoreLabel === 'Normal' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                      selectedParameter.scoreLabel === 'Borderline' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                      selectedParameter.scoreLabel === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      Score: {selectedParameter.score} ({selectedParameter.scoreLabel})
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSubParametersModal(false);
                  setSelectedParameter(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body - Sub Parameters */}
            <div className="p-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Key Metrics</h4>
              {selectedParameter.subParameters && selectedParameter.subParameters.map((subParam, index) => (
                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${
                          subParam.status === 'good' ? 'bg-green-500' :
                          subParam.status === 'borderline' ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}></span>
                        <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{subParam.name}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 ml-4">{subParam.value}</p>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-500 ml-4 mt-1 italic">{subParam.note}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs sm:text-sm font-medium ${
                      subParam.status === 'good' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      subParam.status === 'borderline' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {subParam.status === 'good' ? 'Good' : subParam.status === 'borderline' ? 'Borderline' : 'Bad'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center">
                {selectedParameter.description}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
  };

  const ResourcesSection = () => (
    <div className="space-y-2 sm:space-y-6">
      {/* Online Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
            <Book className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Unlocked Content</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {patientData.resources && Array.isArray(patientData.resources) && patientData.resources.map((resource) => (
            <div key={resource.id} className={`border rounded-lg p-3 sm:p-4 ${resource.unlocked ? 'border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/20' : 'border-gray-100 dark:border-gray-800 opacity-60'} transition-shadow`}>
              <div className="flex items-center space-x-2 sm:space-x-3 mb-2 sm:mb-3">
                <div className={`p-1.5 sm:p-2 rounded-lg ${resource.unlocked ? 'bg-[#E4EFFF] dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  {resource.type === 'video' && <Video className={`h-4 w-4 sm:h-5 sm:w-5 ${resource.unlocked ? 'text-[#323956] dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />}
                  {resource.type === 'interactive' && <Target className={`h-4 w-4 sm:h-5 sm:w-5 ${resource.unlocked ? 'text-[#323956] dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />}
                  {resource.type === 'assessment' && <Brain className={`h-4 w-4 sm:h-5 sm:w-5 ${resource.unlocked ? 'text-[#323956] dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium text-xs sm:text-base truncate ${resource.unlocked ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    {resource.title}
                  </h3>
                  <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">{resource.duration}</p>
                </div>
              </div>

              {resource.unlocked ? (
                <button className="w-full bg-[#323956] dark:bg-blue-600 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg hover:bg-[#232D3C] dark:hover:bg-blue-700 transition-colors text-xs sm:text-base">
                  Start
                </button>
              ) : (
                <div className="w-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 py-1.5 sm:py-2 px-2 sm:px-4 rounded-lg text-center text-xs sm:text-base">
                  Complete care plan to unlock
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Referrals */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-yellow-900/30 rounded-lg">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-[#F5D05D] dark:text-yellow-400" />
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Nearby Services</h2>
        </div>

        <div className="grid gap-3 sm:gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/20 transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Advanced Neurofeedback Center</h3>
                <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-base mt-1">Specialized neurofeedback therapy sessions</p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-base text-gray-500 dark:text-gray-400 mt-2">
                  <span>2.3 miles away</span>
                  <span>(555) 123-4567</span>
                </div>
              </div>
              <button className="flex items-center justify-center space-x-2 bg-[#F5D05D] dark:bg-yellow-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#d9b84a] dark:hover:bg-yellow-700 transition-colors text-xs sm:text-sm w-full sm:w-auto">
                <Phone className="h-4 w-4" />
                <span>Contact</span>
              </button>
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/20 transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Cognitive Wellness Institute</h3>
                <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-base mt-1">Comprehensive cognitive assessment and training</p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-base text-gray-500 dark:text-gray-400 mt-2">
                  <span>4.7 miles away</span>
                  <span>(555) 987-6543</span>
                </div>
              </div>
              <button className="flex items-center justify-center space-x-2 bg-[#F5D05D] dark:bg-yellow-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#d9b84a] dark:hover:bg-yellow-700 transition-colors text-xs sm:text-sm w-full sm:w-auto">
                <Phone className="h-4 w-4" />
                <span>Contact</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const JourneySection = () => (
    <div className="space-y-2 sm:space-y-6">
      {/* Progress Tracking */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
            <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Progress Tracking</h2>
        </div>

        {loading ? (
          <div className="text-center py-3 sm:py-8">
            <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 border-b-2 border-[#323956] dark:border-blue-400 mx-auto"></div>
            <p className="text-gray-600 dark:text-gray-400 mt-2 text-xs sm:text-base">Loading progress data...</p>
          </div>
        ) : currentStatus?.hasData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-4 sm:mb-6">
            <div className="bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg p-3 sm:p-4 text-center">
              <div className="text-xs sm:text-base font-bold text-[#323956] dark:text-blue-400 mb-0.5 sm:mb-1">
                {Math.round(currentStatus.currentMetrics?.attention || 0)}
              </div>
              <div className="text-xs sm:text-base text-[#323956] dark:text-blue-400">Attention Score</div>
            </div>
            <div className="bg-[#CAE0FF] dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 text-center">
              <div className="text-xs sm:text-base font-bold text-[#323956] dark:text-blue-400 mb-0.5 sm:mb-1">
                {Math.round(currentStatus.currentMetrics?.relaxation || 0)}
              </div>
              <div className="text-xs sm:text-base text-[#323956] dark:text-blue-400">Relaxation Score</div>
            </div>
            <div className="bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg p-3 sm:p-4 text-center">
              <div className="text-xs sm:text-base font-bold text-[#323956] dark:text-blue-400 mb-0.5 sm:mb-1">
                {Math.round(currentStatus.currentMetrics?.sleepQuality || 0)}
              </div>
              <div className="text-xs sm:text-base text-[#323956] dark:text-blue-400">Sleep Quality</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-3 sm:p-4 text-center">
              <div className="text-xs sm:text-base font-bold text-[#F5D05D] dark:text-yellow-400 mb-0.5 sm:mb-1">
                {Math.round(currentStatus.overallScore || 0)}
              </div>
              <div className="text-xs sm:text-base text-yellow-700 dark:text-yellow-400">Overall Score</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-3 sm:py-8 text-gray-500 dark:text-gray-400">
            <TrendingUp className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-xs sm:text-base">No progress data available yet</p>
            <p className="text-xs sm:text-base">Complete your first assessment to see progress tracking</p>
          </div>
        )}

        {/* Progress Trends */}
        {progressData?.trends && (
          <div className="mt-4 sm:mt-6">
            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-3 sm:mb-4">Recent Trends</h3>
            <div className="space-y-2 sm:space-y-3">
              {Object.entries(progressData.trends).map(([metric, trend]) => (
                <div key={metric} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <span className="font-medium text-xs sm:text-base text-gray-900 dark:text-white capitalize">{metric.replace(/([A-Z])/g, ' $1')}</span>
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <span className={`text-xs sm:text-base ${
                      trend.direction === 'improving' ? 'text-[#323956] dark:text-blue-400' :
                      trend.direction === 'declining' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {trend.direction === 'improving' ? '↗️' : trend.direction === 'declining' ? '↘️' : '→'}
                      {trend.direction}
                    </span>
                    <span className="text-xs sm:text-base text-gray-500 dark:text-gray-400">
                      ({Math.abs(trend.change).toFixed(1)} pts)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Upcoming Appointments</h2>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <DDOLink
              label="Book Consultation"
              doctorSlug={import.meta.env.VITE_DDO_DOCTOR_SLUG || "dr-dr-shweta-adatia-td6s"}
              className="flex items-center justify-center text-xs sm:text-base w-full sm:w-auto px-3 sm:px-4 py-1.5 sm:py-2"
            />
            <button
              onClick={() => handleBookAppointment()}
              className="flex items-center justify-center space-x-2 bg-[#323956] dark:bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#232D3C] dark:hover:bg-blue-700 transition-colors text-xs sm:text-base w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Book Follow-up</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {loading ? (
            <div className="text-center py-3 sm:py-8">
              <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-2 text-xs sm:text-base">Loading appointments...</p>
            </div>
          ) : appointments.length > 0 ? (
            appointments.slice(0, 5).map((appointment) => (
              <div key={appointment.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg gap-3 sm:gap-0">
                <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
                  <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956] dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">{appointment.type}</h3>
                    <p className="text-xs sm:text-base text-gray-600 dark:text-gray-400">
                      {new Date(appointment.appointment_date).toLocaleDateString()} at {appointment.start_time}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                      Duration: {appointment.duration} min • ${appointment.price}
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right pl-8 sm:pl-0">
                  <span className={`px-2 sm:px-3 py-1 text-xs sm:text-base rounded-full ${
                    appointment.status === 'scheduled'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : appointment.status === 'completed'
                      ? 'bg-[#E4EFFF] dark:bg-blue-900/30 text-[#323956] dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                  }`}>
                    {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                  </span>
                  {appointment.clinics && (
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{appointment.clinics.name}</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-3 sm:py-8 text-gray-500 dark:text-gray-400">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-xs sm:text-base">No upcoming appointments</p>
              <p className="text-xs sm:text-base">Book your first appointment to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Journey Loop */}
      <div className="bg-gradient-to-r from-[#E4EFFF] to-[#CAE0FF] dark:from-blue-900/30 dark:to-blue-900/20 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-[#323956] dark:text-blue-400" />
          </div>
          <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Your Brain Health Journey</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2 sm:mb-3">Continue Your Progress</h3>
            <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-base mb-3 sm:mb-4">
              Regular follow-up tests help track your cognitive improvements and adjust your care plan.
            </p>
            <button className="w-full bg-[#323956] dark:bg-blue-600 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg hover:bg-[#232D3C] dark:hover:bg-blue-700 transition-colors text-xs sm:text-base">
              Schedule Next Assessment
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2 sm:mb-3">Refer a Friend</h3>
            <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-base mb-3 sm:mb-4">
              Share the benefits of brain health monitoring with friends and family.
            </p>
            <button className="w-full bg-[#F5D05D] dark:bg-yellow-600 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg hover:bg-[#d9b84a] dark:hover:bg-yellow-700 transition-colors text-xs sm:text-base">
              Send Referral
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // About the Brain Section with interactive brain lobes and brain age
  const AboutBrainSection = () => {
    const [selectedLobe, setSelectedLobe] = useState(null);
    const [brainLobes, setBrainLobes] = useState(null);
    const [brainQuote, setBrainQuote] = useState(null);
    const [loadingBrainData, setLoadingBrainData] = useState(true);

    // Fetch brain regions from database
    useEffect(() => {
      const fetchBrainData = async () => {
        try {
          setLoadingBrainData(true);
          const [regions, quote] = await Promise.all([
            brainRegionService.getBrainRegions(),
            brainRegionService.getRandomQuote()
          ]);

          if (regions) {
            setBrainLobes(regions);
          }
          if (quote) {
            setBrainQuote(quote);
          }
        } catch (error) {
          console.error('Error fetching brain data:', error);
        } finally {
          setLoadingBrainData(false);
        }
      };

      fetchBrainData();
    }, []);

    // Fallback data in case database fetch fails
    const defaultBrainLobes = {
      frontal: {
        name: 'Frontal Lobe',
        color: '#FF6B6B',
        position: { top: '15%', left: '35%', width: '30%', height: '25%' },
        responsibilities: [
          'Executive functions and decision making',
          'Problem solving and planning',
          'Emotional regulation',
          'Personality and behavior',
          'Speech production (Broca\'s area)',
          'Motor control and movement'
        ],
        strengthen: [
          'Practice mindfulness meditation',
          'Learn a new skill or language',
          'Play strategy games like chess',
          'Set and work towards goals',
          'Practice impulse control exercises',
          'Engage in physical exercise'
        ]
      },
      parietal: {
        name: 'Parietal Lobe',
        color: '#4ECDC4',
        position: { top: '10%', left: '55%', width: '25%', height: '25%' },
        responsibilities: [
          'Sensory processing (touch, temperature, pain)',
          'Spatial awareness and navigation',
          'Hand-eye coordination',
          'Mathematical processing',
          'Reading and writing',
          'Body awareness'
        ],
        strengthen: [
          'Practice yoga or tai chi',
          'Do puzzles and spatial games',
          'Learn to play a musical instrument',
          'Practice math problems',
          'Engage in arts and crafts',
          'Try activities requiring coordination'
        ]
      },
      temporal: {
        name: 'Temporal Lobe',
        color: '#45B7D1',
        position: { top: '40%', left: '15%', width: '20%', height: '25%' },
        responsibilities: [
          'Hearing and auditory processing',
          'Memory formation and storage',
          'Language comprehension (Wernicke\'s area)',
          'Facial recognition',
          'Emotional responses',
          'Learning new information'
        ],
        strengthen: [
          'Listen to music and learn songs',
          'Practice memory exercises',
          'Learn a new language',
          'Read books regularly',
          'Engage in conversations',
          'Use mnemonic devices'
        ]
      },
      occipital: {
        name: 'Occipital Lobe',
        color: '#96CEB4',
        position: { top: '30%', left: '70%', width: '20%', height: '25%' },
        responsibilities: [
          'Visual processing',
          'Color recognition',
          'Shape and pattern recognition',
          'Spatial processing',
          'Visual memory',
          'Reading comprehension'
        ],
        strengthen: [
          'Do visual puzzles and spot-the-difference',
          'Practice drawing or painting',
          'Play video games (in moderation)',
          'Bird watching or nature observation',
          'Photography as a hobby',
          'Memory games with visual cues'
        ]
      },
      cerebellum: {
        name: 'Cerebellum',
        color: '#DDA0DD',
        position: { top: '60%', left: '55%', width: '25%', height: '20%' },
        responsibilities: [
          'Balance and coordination',
          'Fine motor control',
          'Motor learning',
          'Posture regulation',
          'Timing and rhythm',
          'Cognitive functions support'
        ],
        strengthen: [
          'Practice balance exercises',
          'Dance or rhythmic activities',
          'Play sports requiring coordination',
          'Learn juggling',
          'Practice handwriting',
          'Martial arts training'
        ]
      },
      brainstem: {
        name: 'Brain Stem',
        color: '#F4A460',
        position: { top: '65%', left: '40%', width: '15%', height: '20%' },
        responsibilities: [
          'Breathing regulation',
          'Heart rate control',
          'Sleep-wake cycles',
          'Swallowing and digestion',
          'Alertness and consciousness',
          'Relay of sensory information'
        ],
        strengthen: [
          'Practice deep breathing exercises',
          'Maintain regular sleep schedule',
          'Reduce stress through relaxation',
          'Stay hydrated',
          'Avoid toxins and excessive alcohol',
          'Regular cardiovascular exercise'
        ]
      }
    };

    // Use fetched data or fallback to defaults
    const lobeData = brainLobes || defaultBrainLobes;

    // Helper to find value from algorithm results
    const findBrainValue = (keys, defaultVal) => {
      if (!algorithmResults?.data) return defaultVal;

      // Handle array format
      if (Array.isArray(algorithmResults.data)) {
        for (const item of algorithmResults.data) {
          for (const key of keys) {
            if (item.parameter?.toLowerCase().includes(key.toLowerCase())) {
              return item.composite_score || item.score || item.value || defaultVal;
            }
          }
        }
      }

      // Handle object format
      if (algorithmResults.data.composite_scores) {
        for (const key of keys) {
          if (algorithmResults.data.composite_scores[key] !== undefined) {
            return algorithmResults.data.composite_scores[key];
          }
        }
      }

      // Direct access
      for (const key of keys) {
        if (algorithmResults.data[key] !== undefined) {
          return algorithmResults.data[key];
        }
      }

      return defaultVal;
    };

    // Calculate patient's actual age from dateOfBirth
    const calculateAge = (dateOfBirth) => {
      if (!dateOfBirth || dateOfBirth === 'Loading...' || dateOfBirth === 'Not provided') {
        return null;
      }
      const dob = new Date(dateOfBirth);
      if (isNaN(dob.getTime())) return null;

      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const monthDiff = today.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      return age;
    };

    // Get patient's actual age from profile dateOfBirth
    const patientAge = calculateAge(patientData?.profile?.dateOfBirth) || 35;

    // Calculate brain age from algorithm results
    const calculatedBrainAge = findBrainValue(['brainAge', 'brain_age', 'neuro_longevity_age'], null);
    const brainFitnessScore = findBrainValue(['brainFitness', 'brain_fitness', 'cognition', 'Cognition'], 78);
    const neuroStressScore = findBrainValue(['neuroStress', 'neuro_stress', 'stress', 'Stress', 'burnout', 'Burnout'], 35);
    const neuroLongevityScore = findBrainValue(['neuroLongevity', 'neuro_longevity', 'longevity', 'Learning'], 82);
    const dementiaIndexScore = findBrainValue(['dementiaIndex', 'dementia_index', 'dementia_risk'], 12);

    // Calculate brain age based on comprehensive algorithm scores if not directly available
    // Formula: Brain Age = Actual Age - ((avgBrainScore - 50) / 5) - (100 - stressScore) / 20
    // Higher brain fitness = younger brain, Higher stress = older brain
    const avgBrainScore = (brainFitnessScore + neuroLongevityScore) / 2;
    const stressImpact = (neuroStressScore > 50) ? Math.round((neuroStressScore - 50) / 10) : 0;
    const brainAgeOffset = Math.round((avgBrainScore - 50) / 5) - stressImpact;
    const estimatedBrainAge = calculatedBrainAge || Math.max(18, patientAge - brainAgeOffset);
    const ageDifference = patientAge - estimatedBrainAge;

    // Determine status based on difference
    const getAgeStatus = (diff) => {
      if (diff >= 3) return 'good';
      if (diff >= 0) return 'moderate';
      return 'concern';
    };

    const brainAgeData = {
      actualAge: patientAge,
      brainAge: estimatedBrainAge,
      difference: ageDifference,
      status: getAgeStatus(ageDifference),
      scores: {
        brainFitness: brainFitnessScore,
        neuroStress: neuroStressScore,
        neuroLongevity: neuroLongevityScore,
        dementiaIndex: dementiaIndexScore
      }
    };

    // Handle lobe selection with toast feedback
    const handleLobeSelect = (lobeId) => {
      if (selectedLobe === lobeId) {
        setSelectedLobe(null);
      } else {
        setSelectedLobe(lobeId);
        const lobeName = lobeData[lobeId]?.name || lobeId;
        toast.success(`Exploring ${lobeName}`, { duration: 2000, icon: '🧠' });
      }
    };

    const getStatusColor = (status) => {
      switch (status) {
        case 'good': return 'bg-green-500';
        case 'moderate': return 'bg-yellow-500';
        case 'concern': return 'bg-red-500';
        default: return 'bg-gray-500';
      }
    };

    const getScoreColor = (score, inverse = false) => {
      if (inverse) {
        if (score <= 30) return 'text-green-600';
        if (score <= 60) return 'text-yellow-600';
        return 'text-red-600';
      }
      if (score >= 70) return 'text-green-600';
      if (score >= 40) return 'text-yellow-600';
      return 'text-red-600';
    };

    const getScalePosition = (brainAge, actualAge) => {
      const diff = actualAge - brainAge;
      // Scale from -10 (red) to +10 (green)
      const percentage = Math.min(100, Math.max(0, ((diff + 10) / 20) * 100));
      return percentage;
    };

    return (
      <div className="space-y-3 sm:space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center space-x-2 text-[#323956] dark:text-blue-400 hover:text-[#4a5578] dark:hover:text-blue-300 transition-colors text-sm sm:text-base font-medium"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          <span>Back</span>
        </button>

        {/* Hero Quote Section */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-start space-x-3 sm:space-x-4">
            <Quote className="h-7 w-7 sm:h-10 sm:w-10 text-[#CAE0FF] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm sm:text-base font-medium leading-relaxed italic">
                "{brainQuote?.quote || "NeuroSense translates your signals into clear, actionable insights. Brain Age is your compass, track it, nudge it, and watch it improve."}"
              </p>
              <p className="mt-2 sm:mt-3 text-[#CAE0FF] text-xs sm:text-sm font-semibold">— {brainQuote?.author || "NeuroSense Philosophy"}</p>
            </div>
          </div>
        </div>

        {/* Interactive Brain Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-[#CAE0FF]" />
              <span>Explore Your Brain</span>
            </h2>
            <p className="text-blue-200 text-xs sm:text-sm mt-1">Click on different regions to learn about each lobe</p>
          </div>

          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Brain Image with Clickable Regions */}
              <div className="relative bg-gradient-to-b from-[#0a1628] to-[#0d1f3c] rounded-xl p-3 sm:p-4 min-h-[260px] sm:min-h-[400px] border border-gray-800 overflow-hidden">
                {/* Patient Brain Image with Clickable Hotspots */}
                <div className="relative w-full flex items-center justify-center py-4">
                  {/* Brain Image Container */}
                  <div className="relative inline-block">
                    <img
                      src="/patientbrain.png"
                      alt="Interactive Brain Map"
                      className="w-full max-w-[300px] sm:max-w-[400px] md:max-w-[450px] h-auto"
                    />

                    {/* Clickable Hotspot Overlays - Exact positions matching brain colors */}

                    {/* Frontal Lobe - Blue Area (Left front of brain) */}
                    <button
                      onClick={() => handleLobeSelect('frontal')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'frontal'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '22%', left: '12%', width: '18%', height: '16%' }}
                      title="Frontal Lobe"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'frontal' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Frontal
                      </span>
                    </button>

                    {/* Parietal Lobe - Yellow Area (Top center-right) */}
                    <button
                      onClick={() => handleLobeSelect('parietal')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'parietal'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '15%', left: '42%', width: '18%', height: '16%' }}
                      title="Parietal Lobe"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500 text-gray-900 font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'parietal' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Parietal
                      </span>
                    </button>

                    {/* Temporal Lobe - Green Area (Middle center) */}
                    <button
                      onClick={() => handleLobeSelect('temporal')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'temporal'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '45%', left: '28%', width: '18%', height: '16%' }}
                      title="Temporal Lobe"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'temporal' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Temporal
                      </span>
                    </button>

                    {/* Occipital Lobe - Red Area (Right side) */}
                    <button
                      onClick={() => handleLobeSelect('occipital')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'occipital'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '35%', left: '70%', width: '18%', height: '16%' }}
                      title="Occipital Lobe"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'occipital' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Occipital
                      </span>
                    </button>

                    {/* Cerebellum - Pink/Magenta Area (Bottom right, folded structure) */}
                    <button
                      onClick={() => handleLobeSelect('cerebellum')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'cerebellum'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '62%', left: '60%', width: '20%', height: '16%' }}
                      title="Cerebellum"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-pink-500 text-white font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'cerebellum' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Cerebellum
                      </span>
                    </button>

                    {/* Brain Stem - Purple/Gray Area (Bottom center, narrow stem) */}
                    <button
                      onClick={() => handleLobeSelect('brainstem')}
                      className={`absolute cursor-pointer transition-all duration-300 group ${
                        selectedLobe === 'brainstem'
                          ? 'ring-1 ring-white/70 rounded-lg'
                          : ''
                      }`}
                      style={{ top: '78%', left: '44%', width: '12%', height: '14%' }}
                      title="Brain Stem"
                    >
                      <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-purple-500 text-white font-semibold text-xs sm:text-sm px-2 py-1 rounded-full shadow-lg transition-all duration-200 ${
                        selectedLobe === 'brainstem' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                      }`}>
                        Stem
                      </span>
                    </button>
                  </div>
                </div>

                {/* Legend - Clickable buttons */}
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-4 px-1 sm:px-2">
                  {[
                    { id: 'frontal', color: 'bg-blue-500', label: 'Frontal' },
                    { id: 'parietal', color: 'bg-yellow-500', label: 'Parietal' },
                    { id: 'temporal', color: 'bg-green-500', label: 'Temporal' },
                    { id: 'occipital', color: 'bg-red-500', label: 'Occipital' },
                    { id: 'cerebellum', color: 'bg-pink-500', label: 'Cerebellum' },
                    { id: 'brainstem', color: 'bg-gray-400', label: 'Stem' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleLobeSelect(item.id)}
                      className={`flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-sm font-medium transition-all ${
                        selectedLobe === item.id
                          ? 'bg-white/25 ring-2 ring-white/60 shadow-lg'
                          : 'bg-gray-800/60 hover:bg-gray-700/80'
                      }`}
                    >
                      <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${item.color}`}></span>
                      <span className="text-white">{item.label}</span>
                    </button>
                  ))}
                </div>

                <p className="text-center text-[10px] sm:text-sm text-gray-400 mt-2 sm:mt-3">
                  Click on any region to learn more
                </p>
              </div>

              {/* Lobe Information Panel */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 sm:p-5">
                {selectedLobe && lobeData[selectedLobe] ? (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center space-x-2 sm:space-x-3">
                      <div
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: lobeData[selectedLobe].color }}
                      />
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                        {lobeData[selectedLobe].name}
                      </h3>
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2 flex items-center space-x-2">
                        <Eye className="h-4 w-4 text-[#323956] flex-shrink-0" />
                        <span>Responsibilities</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {(Array.isArray(lobeData[selectedLobe].responsibilities) ? lobeData[selectedLobe].responsibilities : []).map((item, idx) => (
                          <li key={idx} className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 flex items-start space-x-2">
                            <span className="text-[#323956] mt-0.5 flex-shrink-0">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2 flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span>How to Strengthen</span>
                      </h4>
                      <ul className="space-y-1.5">
                        {(Array.isArray(lobeData[selectedLobe].strengthen) ? lobeData[selectedLobe].strengthen : []).map((item, idx) => (
                          <li key={idx} className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 flex items-start space-x-2">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-6 sm:py-10">
                    <Brain className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-500 mb-3 sm:mb-4" />
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 sm:mb-2">
                      Select a Brain Region
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                      Click on any lobe in the brain diagram to learn about its functions and how to strengthen it.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* JotForms Assessment Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-[#CAE0FF]" />
              <span>Brain Health Assessments</span>
            </h2>
            <p className="text-blue-200 text-xs sm:text-sm mt-1">Complete these assessments to get personalized insights</p>
          </div>

          <div className="p-3 sm:p-6">
            {/* Assessment Links with Detailed Descriptions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {[
                {
                  id: 'brain_fitness',
                  title: 'Brain Fitness Score',
                  subtitle: 'Your Readiness Score',
                  desc: 'Your Brain Fitness Score is a simple, at-a-glance number that summarizes how well your brain is currently operating across core systems like focus, resilience, recovery, and cognitive efficiency. Think of it like a "readiness score" for your mind, showing how prepared you are for daily performance, learning, decision-making, and emotional steadiness, and where targeted habits can move the needle quickly.',
                  icon: Brain,
                  color: 'from-blue-500 to-blue-600',
                  link: 'https://form.jotform.com/233250136675151',
                  price: 2.99,
                  originalPrice: 9.99
                },
                {
                  id: 'brain_burnout',
                  title: 'Brain Burnout Score',
                  subtitle: 'Neuro Stress Meter',
                  desc: 'Your Brain Burnout Index reflects the load your brain is carrying, how strained your nervous system is, how depleted your recovery is, and whether stress is starting to show up as fog, irritability, low motivation, or reduced focus. It helps you distinguish "I\'m busy" from "I\'m running on empty," so you can intervene before burnout takes hold.',
                  icon: Zap,
                  color: 'from-orange-500 to-red-500',
                  link: 'https://form.jotform.com/260117244562148',
                  price: 2.99,
                  originalPrice: 9.99
                },
                {
                  id: 'brain_age',
                  title: 'Neuro Age Estimator',
                  subtitle: 'Neuro-Longevity',
                  desc: 'Your Brain Age Estimator compares how your brain is functioning today (attention, speed, memory, regulation) against typical patterns across age groups, so you can see whether your brain is performing "younger," "on track," or "older" than your chronological age. It\'s not a label, it\'s a directional snapshot that helps you track progress over time and spot areas where sleep, stress, and lifestyle may be quietly aging your brain faster than they should.',
                  icon: Calendar,
                  color: 'from-green-500 to-teal-500',
                  link: 'https://form.jotform.com/252245065792056',
                  price: 2.99,
                  originalPrice: 9.99
                },
                {
                  id: 'dementia_index',
                  title: 'Dementia Probability Index',
                  subtitle: 'Risk Assessment',
                  desc: 'This index evaluates your cognitive risk factors based on lifestyle, genetics, and brain health markers. It provides early warning signals and actionable preventive measures to help maintain long-term brain health and reduce the probability of cognitive decline.',
                  icon: Shield,
                  color: 'from-purple-500 to-indigo-500',
                  link: 'https://form.jotform.com/260034749079159',
                  price: 2.99,
                  originalPrice: 9.99
                }
              ].map((assessment, idx) => {
                const isPurchased = purchasedAssessments.includes(assessment.id);
                return (
                  <div
                    key={idx}
                    className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 sm:p-5 hover:shadow-lg transition-all cursor-pointer group border border-gray-200 dark:border-gray-600 hover:border-[#323956] relative"
                  >
                    {/* Lock/Unlocked Icon */}
                    <div className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 ${isPurchased ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-200 dark:bg-gray-600'} rounded-full p-1 sm:p-1.5`}>
                      {isPurchased ? (
                        <CheckCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 dark:text-green-400" />
                      ) : (
                        <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-gray-500 dark:text-gray-400" />
                      )}
                    </div>

                    <div className="flex items-start space-x-3 sm:space-x-4">
                      <div className={`p-2.5 sm:p-3 bg-gradient-to-br ${assessment.color} rounded-xl shadow-lg group-hover:scale-110 transition-transform flex-shrink-0`}>
                        <assessment.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 pr-4 sm:pr-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-1">
                          <h4 className="font-semibold text-sm sm:text-base text-gray-800 dark:text-white group-hover:text-[#323956] dark:group-hover:text-blue-300 transition-colors">
                            {assessment.title}
                          </h4>
                          {assessment.subtitle && (
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded-full text-gray-600 dark:text-gray-300 w-fit mt-0.5 sm:mt-0">
                              {assessment.subtitle}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-2 sm:line-clamp-3">
                          {assessment.desc}
                        </p>

                        {isPurchased ? (
                          <button
                            className="mt-2 sm:mt-3 px-3 sm:px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-semibold rounded-lg inline-flex items-center space-x-1.5 transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveJotForm({ title: assessment.title, link: assessment.link });
                            }}
                          >
                            <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span>Get Assessment</span>
                          </button>
                        ) : assessment.id === 'brain_fitness' ? (
                          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                            <div className="flex items-center space-x-1">
                              <span className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">$2.99 USD</span>
                              <span className="text-xs sm:text-sm text-gray-400 line-through">$9.99 USD</span>
                            </div>
                            <button
                              className="px-3 sm:px-4 py-1.5 bg-gradient-to-r from-[#323956] to-[#232D3C] hover:from-[#3d4569] hover:to-[#2d3a4d] text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center space-x-1.5 transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveJotForm({ title: assessment.title, link: assessment.link });
                              }}
                            >
                              <span>Buy Now</span>
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                            <div className="flex items-center space-x-1">
                              <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{assessment.price} USD</span>
                              <span className="text-xs sm:text-sm text-gray-400 line-through">{assessment.originalPrice} USD</span>
                            </div>
                            <button
                              className="px-3 sm:px-4 py-1.5 bg-gradient-to-r from-[#323956] to-[#232D3C] hover:from-[#3d4569] hover:to-[#2d3a4d] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center space-x-1.5 transition-all"
                              disabled={isProcessingAssessmentPayment === assessment.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssessmentPurchase(assessment.id, assessment.title, assessment.price);
                              }}
                            >
                              {isProcessingAssessmentPayment === assessment.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 sm:h-3.5 sm:w-3.5 border-2 border-white border-t-transparent"></div>
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  <span>Buy Now</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bundle Card - All 4 Assessments */}
            <div className="mt-4 sm:mt-6 bg-gradient-to-r from-[#323956] to-[#232D3C] rounded-xl p-4 sm:p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-start space-x-3 sm:space-x-4">
                  <div className="p-2.5 sm:p-3 bg-white/10 rounded-xl flex-shrink-0">
                    <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-300" />
                  </div>
                  <div>
                    <h4 className="text-sm sm:text-lg font-bold mb-1">Complete Brain Assessment Bundle</h4>
                    <p className="text-xs sm:text-sm text-gray-300">Get all 4 assessments: Brain Fitness Score, Brain Burnout Score, Neuro Age Estimator & Dementia Probability Index</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end sm:space-x-4">
                  <div className="text-left sm:text-right">
                    <span className="text-lg sm:text-2xl font-bold">19.99 USD</span>
                    <span className="block text-xs sm:text-sm text-gray-400 line-through">89.95 USD</span>
                  </div>
                  <button
                    className="px-4 sm:px-5 py-2 sm:py-2.5 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold rounded-lg transition-all text-xs sm:text-sm flex items-center space-x-1.5 sm:space-x-2"
                    onClick={() => {
                      handleAssessmentPurchase('assessment_bundle', 'Neurosense Bundle', 19.99);
                    }}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>Buy Bundle</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  // Brain Parameters Data for all 7 parameters
  const brainParametersData = {
    cognition: {
      title: 'Cognition',
      icon: Lightbulb,
      color: '#4F46E5',
      intro: 'Cognition encompasses your brain\'s ability to process information, think critically, and make decisions. It\'s the foundation of your mental performance, affecting everything from problem-solving to memory recall. Understanding your cognitive patterns helps optimize your mental capabilities.',
      videoUrl: 'https://embed.ted.com/talks/brendan_conway_smith_metacognition_an_important_skill_for_modern_times',
      brainRegion: {
        name: 'Prefrontal Cortex (Frontal Lobe)',
        description: 'The prefrontal cortex is the command center for cognitive functions. Located at the front of your brain, it handles executive functions like planning, decision-making, working memory, and abstract thinking.',
        areas: [
          { name: 'Dorsolateral PFC', role: 'Working memory & planning' },
          { name: 'Ventromedial PFC', role: 'Decision making' },
          { name: 'Anterior Cingulate', role: 'Attention control' },
          { name: 'Frontal Eye Fields', role: 'Visual attention' }
        ],
        qeegNote: 'Focus and attention are essential for productivity, learning, and the ability to complete tasks efficiently.'
      },
      subParameters: [
        { name: 'Focus Score Stimulation Control (Theta:Beta)', score: 72, description: 'Optimal focus control, even in stimulating environments' },
        { name: 'Alpha Peak', score: 68, description: 'Alpha rhythm indicates mental clarity and cognitive readiness' },
        { name: 'Alpha:Theta Balance', score: 75, description: 'Frontal balance for optimal cognitive performance' }
      ],
      moversInfo: {
        title: 'MOVERS for Cognition',
        description: 'Movement enhances blood flow to the brain, delivering oxygen and nutrients essential for cognitive function.',
        tips: ['Aerobic exercise increases BDNF (brain-derived neurotrophic factor)', 'Walking meetings boost creative thinking', 'Balance exercises strengthen neural pathways']
      },
      whatThisMeans: {
        low: "You're experiencing brain fog, slower processing, weaker working memory, and fragmented attention, so tasks feel harder and take longer.",
        medium: "You're functioning fine with occasional dips, attention and memory are serviceable but fluctuate with stress and context. Work gets done, but consistency and efficiency can improve.",
        high: "You're in a peak-clarity window, fast processing, strong working memory, and stable attention. The main risk now is overcommitment or hyperfocus that crowds out recovery."
      },
      topGoals: {
        low: [
          'Restore mental clarity & processing speed',
          'Stabilize sustained attention',
          'Expand working-memory bandwidth'
        ],
        medium: [
          'Turn "okay days" into consistently good days',
          'Increase output without raising stress load',
          'Build faster recovery from dips'
        ],
        high: [
          'Convert peak clarity into high-leverage outputs',
          'Maintain a rhythm (work → micro-recovery → work) to avoid crash',
          'Capture and systematize ideas so gains compound on average days'
        ]
      },
      quickWins: {
        low: [
          '10–15 min brisk daylight walk + tall glass of water + protein snack',
          'Silence notifications; do one 25–30 min single-task sprint (phone in another room)',
          '3 rounds of 4-4-8 breathing before deep work; tidy your desk to "one-task" layout'
        ],
        medium: [
          'Define your Big 3 outcomes for the day; park everything else on a later list',
          'Run 2 × 30–45 min timeboxed focus blocks (notifications off, phone away)',
          'Do a 90-second reset between tasks (4-4-8 breaths or quick mobility)'
        ],
        high: [
          'Pick one needle-mover and run a 60–90 min deep block; park everything else',
          'Create an "idea parking lot" (notes/voice memos) to avoid context switching',
          'Batch low-value/admin into one late block so you don\'t dilute peak hours'
        ]
      },
      coreHabits: {
        low: [
          { habit: 'Consistent sleep/wake + 8–10 min mindfulness/box breathing', frequency: 'Daily' },
          { habit: '1–2 × 25–45 min deep-work blocks', frequency: 'Daily' },
          { habit: 'Hydrate 2–3 L + whole-food meals with protein at breakfast', frequency: 'Daily' },
          { habit: '20–30 min light-to-moderate cardio', frequency: 'Daily' },
          { habit: 'Skill drill for working memory/attention (2-back, Stroop) 8–12 min', frequency: '3–4×/week' },
          { habit: 'Strength training (short, compound moves)', frequency: '3–4×/week' },
          { habit: 'Digital reset (clear tabs/apps), plan 3 deep-work windows, review KPIs', frequency: 'Weekly' }
        ],
        medium: [
          { habit: '10-min plan (Big 3 + timeboxes)', frequency: 'Daily' },
          { habit: '1–3 deep-work blocks', frequency: 'Daily' },
          { habit: '20–30 min moderate activity', frequency: 'Daily' },
          { habit: 'Protein-forward meals + 2–3 L water + consistent sleep/wake', frequency: 'Daily' },
          { habit: 'Short cognitive practice (reading-heavy or WM drill 8–12 min)', frequency: '3×/week' },
          { habit: 'Brief strength circuit', frequency: '3×/week' },
          { habit: 'Review wins/blockers, standardize morning routine, batch admin', frequency: 'Weekly' }
        ],
        high: [
          { habit: '2–3 deep blocks during peak window (50/10 or 90/15 rhythm)', frequency: 'Daily' },
          { habit: '5–10 min micro-breaks between blocks', frequency: 'Daily' },
          { habit: 'Protein at each meal, limit caffeine after early afternoon', frequency: 'Daily' },
          { habit: '10-min shutdown ritual (review, tomorrow\'s first task, off)', frequency: 'Daily' },
          { habit: 'Strength or intervals (short, compound)', frequency: '2–3×/week' },
          { habit: '10–12 min cognitive skill (complex reading or WM drill)', frequency: '2–3×/week' },
          { habit: 'One white-space session for creative recombination', frequency: '2–3×/week' },
          { habit: 'Plan Big Rocks, template recurring tasks, review rework/throughput', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Single-screen or "app-only" window; website/app blockers',
          'Desk lighting from front/side; keep water visible',
          'Noise-control (earplugs/white noise)',
          '"Launchpad" checklist on your desk (Today\'s One Thing, Next Two, Done)'
        ],
        medium: [
          'Pre-set "work scenes" (Focus / Admin / Creative) with matching apps and tabs',
          'Visible Kanban (To-Do / Doing / Done)',
          'Single-screen or app-only windows; default notifications off',
          'Keep a "next action" sticky to reduce start friction'
        ],
        high: [
          'Pre-set Peak Mode scene (only essential apps/tabs)',
          'Single-screen or app-only windows; timer visible',
          'Keyboard-shortcut workflow; focus audio/earplugs',
          'Kanban (To-Do / Doing / Done); automation/snippets for repeats',
          'Visible "Idea Parking Lot"'
        ]
      },
      keyPerformance: {
        low: [
          'Deep-work minutes/day,count only 25+ min uninterrupted blocks',
          'Task-switches per hour,manual tally or tracker; aim to reduce',
          'Working-memory accuracy,simple 2-back or digit-span test, track %/span over time'
        ],
        medium: [
          'Deep-work minutes/day,count only uninterrupted 25+ min blocks',
          'Planned vs. completed tasks ratio,(# completed from Big 3 ≈ # planned)',
          'Task-switches per hour,tally switches; aim to reduce week over week'
        ],
        high: [
          'Deep-work minutes in peak hours,count only uninterrupted 50–90 min blocks within your chosen window',
          'Big 3 completion rate,completed Big 3 ÷ planned Big 3 (daily)',
          'Rework rate,% of tasks that need significant revision before final'
        ]
      },
      kpiTracking: [
        { metric: 'Daily focus sessions completed', target: '4 sessions' },
        { metric: 'Brain training score improvement', target: '+5% weekly' },
        { metric: 'Hours of quality sleep', target: '7-8 hours' },
        { metric: 'Mental clarity rating (1-10)', target: '≥7 average' }
      ],
      nootropics: [
        { name: 'Lion\'s Mane', benefit: 'Supports nerve growth factor (NGF) production', dosage: '500-1000mg daily' },
        { name: 'Bacopa Monnieri', benefit: 'Enhances memory and learning', dosage: '300-450mg daily' },
        { name: 'Omega-3 (DHA)', benefit: 'Essential for brain cell structure', dosage: '1000-2000mg daily' }
      ],
      highDescription: 'Individuals with high cognitive function process and retain information quickly, demonstrating strong problem-solving skills and adaptability.\n\nThey tend to have a high working memory capacity and can efficiently integrate new knowledge into existing frameworks.',
      highImplications: [
        'High cognitive function enables quick learning, making individuals more efficient in academic and professional settings.',
        'Strong reasoning skills allow for better judgment and decision-making, particularly in complex situations.',
        'Individuals with high cognition exhibit mental agility, helping them switch between tasks smoothly.'
      ],
      lowDescription: 'Lower cognitive function can manifest as slower information processing, memory difficulties, and struggles with multitasking.\n\nIndividuals may find it harder to grasp new concepts or retain key details in conversations and learning environments.',
      lowImplications: [
        'Difficulty processing information may lead to frustration and reduced confidence in learning environments.',
        'Poor working memory can make it harder to follow multi-step instructions or remember key details from discussions.',
        'Reduced cognitive efficiency can impact problem-solving abilities, leading to longer task completion times.'
      ],
      implications: 'Low cognition affects productivity, decision-making, learning ability, and daily task efficiency. It can lead to increased errors, slower reaction times, and difficulty following complex conversations or instructions.',
      howToImprove: [
        'Cognitive Training: Engage in brain-training games, such as Sudoku, chess, or logic puzzles, to strengthen mental agility.',
        'Active Learning Techniques: Use spaced repetition, teaching concepts to others, and hands-on problem-solving to reinforce cognitive skills.',
        'Physical Activity: Regular aerobic exercise has been shown to enhance cognitive function by increasing blood flow to the brain.',
        'Healthy Diet: Consume brain-supporting nutrients like omega-3 fatty acids, antioxidants, and complex carbohydrates for sustained mental energy.'
      ]
    },
    stress: {
      title: 'Stress',
      icon: Zap,
      color: '#EF4444',
      intro: 'Stress response is your brain\'s alarm system. While acute stress can sharpen focus, chronic stress damages neural pathways and impairs cognitive function. Understanding your stress patterns helps you build resilience and maintain optimal brain health.',
      videoUrl: 'https://www.youtube.com/embed/RcGyVTAoXEU',
      brainRegion: {
        name: 'Amygdala & HPA Axis',
        description: 'The amygdala is your brain\'s alarm center, triggering the fight-or-flight response. It works with the hypothalamus to activate the HPA axis, releasing cortisol and adrenaline during stress.',
        areas: [
          { name: 'Amygdala', role: 'Threat detection & fear' },
          { name: 'Hypothalamus', role: 'Stress hormone release' },
          { name: 'Hippocampus', role: 'Stress memory & regulation' },
          { name: 'Insula', role: 'Body awareness & anxiety' }
        ],
        qeegNote: 'Sensory processing refers to how the brain interprets and responds to external stimuli, such as sounds, sights, and touch.'
      },
      subParameters: [
        { name: 'Arousal Score', score: 58, description: 'HiBeta:Beta ratio indicating stress-related hyperarousal' },
        { name: 'Relaxation Score', score: 62, description: 'Alpha:Beta balance showing relaxation capacity' },
        { name: 'Regeneration (Alpha Modulation)', score: 55, description: 'Alpha reactivity between eyes open/closed states' }
      ],
      moversInfo: {
        title: 'MOVERS for Stress Relief',
        description: 'Physical movement is one of the most effective stress relievers, triggering endorphin release and reducing cortisol.',
        tips: ['Yoga combines movement with breathwork for double benefit', 'Even 5 minutes of walking reduces stress hormones', 'Stretching releases physical tension stored in muscles']
      },
      whatThisMeans: {
        low: "You're calm and steady, physiology is regulated, and demands feel manageable. The risk is drifting into low drive or letting hidden stressors pile up unnoticed.",
        medium: "You're carrying a steady pressure load, functional but wound a bit tight. Performance holds, yet tension, urgency, and shallow recovery creep in.",
        high: "You're in sympathetic overdrive, tension is high, sleep/recovery slip, and everything feels urgent. Performance is at risk without rapid downshifting."
      },
      topGoals: {
        low: [
          'Use calm to produce meaningful output',
          'Keep recovery foundations solid',
          'Add just-enough challenge so you stay engaged'
        ],
        medium: [
          'Lower baseline arousal and smooth spikes',
          'Build buffers around work and sleep',
          'Replace urgency with clear priorities and predictable routines'
        ],
        high: [
          'Downshift physiology fast and often',
          'Shrink load (cancel/delegate/defer) to restore control',
          'Stabilize sleep so recovery can catch up'
        ]
      },
      quickWins: {
        low: [
          'Pick one stretch task and run a 45–60 min focused block',
          'Schedule a 10-minute wind-down (screens off, dim lights) before bed',
          'Do a 2-minute breathing set (4-4-8) before your longest task'
        ],
        medium: [
          'Do a 5-minute load-shedding: Must/Should/Could triage → cancel/delegate 1 "Should"',
          '2 minutes of paced breathing (inhale 4s, exhale 6s) before your next hard block',
          'Set DND for 45–60 min while you complete one Big task; batch replies afterward'
        ],
        high: [
          'Do a 5-minute triage: Must / Should / Could → cancel or delegate one "Should"',
          '2–4 minutes slow breathing (inhale 4s, exhale 6–8s) or 3× physiological sighs',
          '10-minute easy walk outside or gentle mobility before your longest task'
        ]
      },
      coreHabits: {
        low: [
          { habit: 'Morning plan (Big 3), 1–2 deep-work blocks, 8–10 min breath/mindfulness, 20–30 min movement, protein-forward meals, consistent sleep/wake', frequency: 'Daily' },
          { habit: 'Strength or intervals (short), social connection check-in, creative play (reading, sketching, music)', frequency: '2–3×/week' },
          { habit: 'Review load vs. energy, batch admin, schedule one mini-adventure (novelty walk, new café, different route)', frequency: 'Weekly' }
        ],
        medium: [
          { habit: 'Plan Big 3 with Must/Should/Could; 2× micro-downshifts (90–120s breath/stretch/walk); 20–30 min movement; caffeine cap by early afternoon; protein + complex-carb lunch; 10-min wind-down before bed', frequency: 'Daily' },
          { habit: 'Moderate cardio (20–30 min) or strength (short, compound); social check-in with one supportive person', frequency: '2–3×/week' },
          { habit: 'Insert calendar buffers (15–30 min) between meetings; batch comms into 1–2 windows; review stress triggers & adjust load', frequency: 'Weekly' }
        ],
        high: [
          { habit: '3× micro-downshifts (90–120s breath/hum/stretch), 20–30 min easy movement, caffeine cap by early afternoon, protein + complex-carb meals, 60-min wind-down (dim lights, no work/screens if possible)', frequency: 'Daily' },
          { habit: 'Moderate cardio or strength (short, not max effort), social check-in with one supportive person, 5–10 min journaling to close loops', frequency: '3×/week' },
          { habit: 'Load audit (drop/renegotiate commitments), insert calendar buffers, one longer recovery block (nature walk, massage, yoga, nap)', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Natural light and tidy desk, timer visible',
          'Minimal notifications with VIP exceptions',
          '"Idea parking lot" notepad',
          'Evening lights warm/dim, bedside wind-down kit (book, journal, earplugs)'
        ],
        medium: [
          'Default meetings to 25/50 min; visible timer and break cues',
          'System-level DND with VIP exceptions',
          'Warm/dim evening lights; tidy desk with "idea parking lot"',
          'Headphones/earplugs; water within reach'
        ],
        high: [
          'Set system-level DND with a status ("Heads-down; replies at 4 pm")',
          'Default meetings to 25/50 min, reduce visual clutter',
          'Front/side warm lighting in evenings, prep a bedside wind-down kit (book, eye mask, earplugs)',
          'Keep water visible, use a single-task scene (only essential apps/tabs)'
        ]
      },
      keyPerformance: {
        low: [
          'Daily perceived stress (0–10), one check-in at evening',
          'Sleep quality marker, sleep efficiency or consistent wind-down completed (yes/no)',
          'Deep-work minutes, total minutes of 25+ min uninterrupted blocks'
        ],
        medium: [
          'Evening perceived stress (0–10), single check-in each night',
          'Sleep consistency, # of nights/week within ±60 min of target bed/wake',
          'Boundary adherence, % of planned start/stop times and DND windows you actually kept'
        ],
        high: [
          'Evening perceived stress (0–10), one check-in nightly',
          'Wind-down adherence, completed the 30–60 min routine? (yes/no, daily)',
          'Micro-downshifts completed/day, count of 90–120s breath/mobility/humming sets'
        ]
      },
      kpiTracking: [
        { metric: 'Daily stress level (1-10)', target: '≤4 average' },
        { metric: 'Minutes of relaxation practice', target: '30+ mins daily' },
        { metric: 'Sleep quality score', target: '≥80%' },
        { metric: 'Heart rate variability (HRV)', target: 'Improving trend' }
      ],
      nootropics: [
        { name: 'Ashwagandha', benefit: 'Reduces cortisol and anxiety', dosage: '300-600mg daily' },
        { name: 'L-Theanine', benefit: 'Promotes calm without drowsiness', dosage: '100-200mg as needed' },
        { name: 'Magnesium Glycinate', benefit: 'Supports nervous system relaxation', dosage: '200-400mg daily' }
      ],
      highDescription: 'Individuals with strong stress regulation can handle pressure without feeling overwhelmed.\n\nTheir brain efficiently activates and deactivates stress responses, allowing them to stay calm, focused, and productive even in demanding situations. They recover well after challenges and maintain emotional balance.',
      highImplications: [
        'Effective stress regulation supports sustained focus, decision-making, and emotional stability.',
        'These individuals adapt better to change and perform consistently under pressure.',
        'Balanced stress responses enhance resilience, learning capacity, and overall mental well-being.'
      ],
      lowDescription: 'Individuals with weak stress regulation may experience prolonged or intense stress responses.\n\nThe brain remains in a heightened alert state, leading to mental fatigue, emotional reactivity, or shutdown. This can interfere with thinking clarity, motivation, and recovery.',
      lowImplications: [
        'Chronic stress may lead to anxiety, irritability, low motivation, or mental exhaustion.',
        'Prolonged stress can impair memory, attention, and learning efficiency.',
        'Poor stress regulation may affect sleep, emotional control, and physical health over time.'
      ],
      implications: 'Chronic high stress damages neural pathways, weakens the immune system, disrupts sleep quality, and accelerates brain aging. It can lead to anxiety, burnout, reduced memory, and impaired decision-making.',
      howToImprove: [
        'Daily reset: 10-15 minutes of slow breathing, mindfulness, or quiet reflection to calm the nervous system.',
        'Stress boundaries: Limit continuous multitasking and schedule short recovery breaks during the day.',
        'Body regulation: Regular movement such as walking, stretching, or light exercise to release stored stress.',
        'Recovery routine: Prioritize sleep, reduce late-day stimulation, and maintain consistent daily rhythms.'
      ]
    },
    'focus-attention': {
      title: 'Focus and Attention',
      icon: Target,
      color: '#F59E0B',
      intro: 'Focus and attention are the spotlight of your mind, determining what information gets processed deeply. In our distraction-filled world, the ability to sustain attention is a superpower. Training your focus improves productivity, learning, and overall cognitive performance.',
      videoUrl: 'https://www.youtube.com/embed/Hu4Yvq-g7_Y',
      brainRegion: {
        name: 'Parietal Cortex & Attention Networks',
        description: 'The parietal cortex, located at the top of your brain, is crucial for directing attention and spatial awareness. It works with the frontal attention network to filter distractions and sustain focus.',
        areas: [
          { name: 'Superior Parietal', role: 'Spatial attention' },
          { name: 'Intraparietal Sulcus', role: 'Attention shifting' },
          { name: 'Frontal Eye Fields', role: 'Visual attention control' },
          { name: 'Anterior Cingulate', role: 'Conflict monitoring' }
        ],
        qeegNote: 'Focus and attention are essential for productivity, learning, and the ability to complete tasks efficiently.'
      },
      subParameters: [
        { name: 'Focus Theta', score: 65, description: 'Frontal theta activity indicating attention regulation' },
        { name: 'Alpha:Theta Balance', score: 70, description: 'Posterior dominance pattern for sustained attention' },
        { name: 'Focus Score (Theta:Beta)', score: 63, description: 'Theta:Beta ratio showing attention efficiency' }
      ],
      moversInfo: {
        title: 'MOVERS for Focus',
        description: 'Regular physical activity strengthens the prefrontal cortex, the brain region responsible for attention control.',
        tips: ['Short exercise breaks between focus sessions restore attention', 'Morning exercise sets up better focus for the entire day', 'Standing or walking while thinking improves concentration']
      },
      whatThisMeans: {
        low: "You're easily pulled off-task, slow to start, and quick to context-switch. Focus windows are short and fragile.",
        medium: "You can focus well when you begin, but consistency wobbles, micro-distractions creep in and starts/stops cost you momentum.",
        high: "You're dialed in, sustained attention is strong and distractions bounce off. The risk is over-tunneling and skipping recovery."
      },
      topGoals: {
        low: [
          'Cut distractions and shorten time-to-start',
          'Extend uninterrupted focus windows',
          'Build a simple, repeatable focus routine'
        ],
        medium: [
          'Make focus windows reliable, not lucky',
          'Cut micro-distractions and context switches',
          'Tighten start→sustain→finish routines'
        ],
        high: [
          'Convert focus into finished, high-leverage work',
          'Keep a work → micro-recovery rhythm to prevent crash',
          'Maintain situational awareness so you don\'t miss priorities'
        ]
      },
      quickWins: {
        low: [
          'Define your Big 1 task and run one 25-min focus sprint (phone in another room)',
          'Turn on Do Not Disturb, close all non-essential apps, start a blocker',
          'Do a 90-sec pre-focus: box breathing → 30s eyes closed → 30s "first action" cue',
          'Put a "Park ideas here" notepad next to you to dump stray thoughts'
        ],
        medium: [
          'Set your Big 3 and schedule 2 × 35–50 min focus blocks',
          'Use a 5-minute anchor start: open the doc, write one line, then continue',
          'Put a "Park ideas here" notepad next to you to dump stray thoughts without context switching',
          'Set DND for 45–60 min while you complete one Big task; batch replies afterward'
        ],
        high: [
          'Lock 2–3 peak blocks (50–90 min) and assign your Big 3',
          'Set a visible stop timer + a 5–10 min break after each block',
          'Keep an idea parking lot open to dump thoughts without context switching'
        ]
      },
      coreHabits: {
        low: [
          { habit: '2–3 × 25–45 min focus blocks; plan Big 3 each morning; caffeine only before early afternoon; 10-min walk in daylight; track the 3 KPIs', frequency: 'Daily' },
          { habit: 'Short attention drills (8–10 min: reading sprints, 2-back, Stroop); brief strength or mobility to clear restlessness', frequency: '3–4×/week' },
          { habit: '"Distraction audit" (apps, meetings, people, places); batch admin; pre-write tomorrow\'s first action for each Big task', frequency: 'Weekly' }
        ],
        medium: [
          { habit: 'Plan with timeboxes, 2–3 focus blocks (35–50 min, 5–10 min micro-breaks), caffeine only before early afternoon, 10-min daylight walk, end-of-day shutdown (tomorrow\'s first action)', frequency: 'Daily' },
          { habit: 'Short attention drills (reading sprints or 2-back 8–10 min), brief strength/mobility', frequency: '3×/week' },
          { habit: 'Distraction audit, batch email/DMs, review KPIs and reset templates for recurring tasks', frequency: 'Weekly' }
        ],
        high: [
          { habit: '2–3 peak blocks (50/10 or 90/15), pre-block "first action" cue, caffeine cap by early afternoon, 10-min daylight walk, 10-min shutdown (review, tomorrow\'s first task)', frequency: 'Daily' },
          { habit: 'Short strength/intervals, 10–12 min complex reading or WM drill, one white-space session for creative recombination', frequency: '2–3×/week' },
          { habit: 'Plan Big Rocks into peak windows, batch admin, review output vs. time spent and adjust', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Single-screen or app-only windows; physical Do Not Disturb sign',
          'Phone outside arm\'s reach (or in another room); grayscale phone + remove social from dock',
          'Visible Kanban (To-Do/Doing/Done); timer in sight',
          'Headphones/earplugs; chair and desk set for upright posture and front/side lighting'
        ],
        medium: [
          'Pre-set Focus Scene (only required apps/tabs), system-level DND with allowed contacts',
          'Website/app blockers, timer visible, paper capture for ideas',
          'Front/side lighting, headphones/earplugs',
          'Visible Kanban (To-Do / Doing / Done)'
        ],
        high: [
          'Peak Mode scene (only essential tabs/apps), system-level DND with VIP exceptions',
          'Timer in sight, keyboard shortcuts/macros for repeats',
          'Earplugs/headphones, visible Kanban (To-Do / Doing / Done)',
          'A 5-minute off-ramp ritual (stretch, water, note breadcrumbs)'
        ]
      },
      keyPerformance: {
        low: [
          'Uninterrupted focus blocks/day,count only 25+ min blocks',
          'Task-switches per hour,tally manual or via tracker; aim to reduce',
          'Cue-to-start latency,minutes from sitting down to your first meaningful action on the Big 1 task'
        ],
        medium: [
          'Uninterrupted focus blocks/day,count 35–50 min blocks only',
          'Interruptions per block,self + external; log a tick each time',
          'Big 3 completion rate,# of Big 3 finished ÷ 3 (daily)'
        ],
        high: [
          'Peak focus blocks completed/day,count only 50–90 min uninterrupted blocks',
          'Big 3 completion rate,# of Big 3 finished ÷ 3 (daily)',
          'Break adherence,% of blocks followed by a 5–10 min micro-break'
        ]
      },
      kpiTracking: [
        { metric: 'Deep work hours per day', target: '4+ hours' },
        { metric: 'Focus session length', target: '45+ mins' },
        { metric: 'Task completion rate', target: '≥85%' },
        { metric: 'Distraction frequency', target: '<5 per hour' }
      ],
      nootropics: [
        { name: 'Caffeine + L-Theanine', benefit: 'Smooth, focused energy without jitters', dosage: '100mg caffeine + 200mg L-theanine' },
        { name: 'Alpha-GPC', benefit: 'Supports acetylcholine for attention', dosage: '300-600mg daily' },
        { name: 'Rhodiola Rosea', benefit: 'Reduces mental fatigue, improves focus', dosage: '200-400mg daily' }
      ],
      highDescription: 'Individuals with high attention scores can concentrate for extended periods, absorb new information efficiently, and exhibit strong executive functioning skills. They tend to be more productive and can manage cognitive demands without excessive fatigue.',
      highImplications: [
        'High-attention individuals can complete complex tasks efficiently, making them effective learners and problem solvers.',
        'Their ability to resist distractions leads to better academic and professional performance.',
        'They tend to have a greater working memory capacity, allowing them to process and recall information quickly.'
      ],
      lowDescription: 'Low attention levels can manifest as distractibility, difficulty sustaining effort on tasks, and frequent cognitive fatigue. Individuals with low focus scores may struggle with task completion, procrastination, and inefficiency in their work.',
      lowImplications: [
        'Difficulty focusing can lead to frustration, reduced academic performance, and slower information retention.',
        'These individuals may find it harder to stay engaged in long conversations or complex problem-solving activities.',
        'A lack of sustained attention may contribute to frequent mistakes and overlooked details in tasks.'
      ],
      implications: 'Poor focus impacts productivity, learning retention, task accuracy, and professional performance. It leads to longer task completion times, increased errors, and difficulty following through on goals.',
      howToImprove: [
        'Pomodoro Technique: Implement structured work and rest intervals (e.g., 25 minutes of focus followed by a 5-minute break) to train sustained attention.',
        'Mindfulness & Meditation: Practicing mindfulness strengthens the brain\'s ability to filter out distractions and sustain focus.',
        'Physical Exercise: Aerobic activities improve blood flow to the brain, supporting cognitive functions related to attention.',
        'Dietary Adjustments: Consuming omega-3 fatty acids, B vitamins, and hydration can enhance brain function and improve attention regulation.'
      ]
    },
    'burnout-fatigue': {
      title: 'Burnout and Fatigue',
      icon: Battery,
      color: '#6B7280',
      intro: 'Burnout is the result of chronic stress depleting your mental and physical resources. It\'s not just tiredness, it\'s a state where your brain\'s energy systems are overwhelmed. Recognizing early signs and implementing recovery strategies is essential for long-term brain health.',
      videoUrl: 'https://www.youtube.com/embed/Oht0-qKeUGE',
      brainRegion: {
        name: 'Brainstem & Energy Regulation Centers',
        description: 'The brainstem and reticular activating system control your brain\'s energy levels and alertness. When depleted, these centers struggle to maintain optimal arousal, leading to fatigue and burnout symptoms.',
        areas: [
          { name: 'Reticular Formation', role: 'Arousal & alertness' },
          { name: 'Locus Coeruleus', role: 'Energy & norepinephrine' },
          { name: 'Hypothalamus', role: 'Sleep-wake regulation' },
          { name: 'Basal Ganglia', role: 'Motivation & drive' }
        ],
        qeegNote: 'Burnout is detected through elevated delta waves during wakefulness, poor Alpha modulation (eyes open/closed), and dysregulated arousal patterns at central sites.'
      },
      subParameters: [
        { name: 'Arousal Score', score: 52, description: 'HiBeta:Beta ratio indicating fatigue-related hyperarousal' },
        { name: 'Relaxation Score', score: 48, description: 'Alpha:Beta balance showing recovery capacity' },
        { name: 'Excessive Delta', score: 65, description: 'Delta wave activity indicating brain fatigue levels' }
      ],
      moversInfo: {
        title: 'MOVERS for Energy Recovery',
        description: 'Gentle movement paradoxically restores energy by improving mitochondrial function and circulation.',
        tips: ['Low-intensity movement is better than rest for fatigue', 'Nature walks combine movement with restorative environments', 'Gentle yoga helps reset the nervous system']
      },
      whatThisMeans: {
        low: "You've got steady energy and low exhaustion signals. The main risk is quietly overextending or letting boundaries blur because you \"feel fine.\"",
        medium: "You're functional but running warm, energy dips, mild cynicism, and \"push through\" mode show up. Recovery happens, but not fast enough to match load.",
        high: "You're in depletion, exhaustion is high, motivation is low, and small tasks feel heavy. Without rapid load reduction and deliberate recovery, performance and mood will keep sliding."
      },
      topGoals: {
        low: [
          'Convert steady energy into meaningful output without overspending it',
          'Keep recovery rituals consistent so fatigue doesn\'t sneak up',
          'Maintain boundaries and a predictable end-of-day off-ramp'
        ],
        medium: [
          'Rebalance load to match actual capacity',
          'Improve daily recovery so energy rebounds by tomorrow',
          'Rebuild engagement (meaning, autonomy, progress)'
        ],
        high: [
          'Stop the bleed: shrink workload and remove non-essentials',
          'Restore recovery capacity: sleep + parasympathetic resets',
          'Rebuild engagement: small wins that feel meaningful'
        ]
      },
      quickWins: {
        low: [
          'Set your Big 3 and park everything else on a later list',
          'Schedule one real break after each focus block (5–10 min walk, stretch, or 4-6 breathing)',
          'Lock a 10-minute wind-down tonight (screens dim/off, light stretching, tomorrow\'s first task)'
        ],
        medium: [
          'Run a 5-min load triage (Must / Should / Could) → cancel or delegate one "Should"',
          'Do 10–20 min NSDR/yoga-nidra or a light walk mid-afternoon instead of extra caffeine',
          'Lock a 10-min shutdown ritual tonight (dim lights, jot tomorrow\'s first task)'
        ],
        high: [
          'Run a 5-min Must / Should / Could, cancel or delegate two "Shoulds"',
          'Do 10–20 min NSDR/yoga-nidra or a 20-min easy outdoor walk (no phone)',
          'Set one 45–60 min DND block to finish a single, bite-size task and log it as a win'
        ]
      },
      coreHabits: {
        low: [
          { habit: '1–2 deep-work blocks with built-in micro-breaks; 10–20 min daylight walk; protein at breakfast; caffeine cap by early afternoon; 10-min evening shutdown', frequency: 'Daily' },
          { habit: 'Short strength or moderate cardio; social touchpoint (one supportive chat); creative play (reading/music)', frequency: '2–3×/week' },
          { habit: 'Review load vs. energy, batch admin into one block, plan one small novelty (new route/café/playlist)', frequency: 'Weekly' }
        ],
        medium: [
          { habit: 'Plan Big 3 using energy-based scheduling; 2–3 focus blocks (50/10 rhythm) with real breaks; 10–20 min daylight walk; protein + complex-carb lunch; caffeine cap by early afternoon; 10-min evening wind-down', frequency: 'Daily' },
          { habit: 'Zone-2 cardio or short strength session; 5–10 min journaling to close loops; a short social check-in', frequency: '2–3×/week' },
          { habit: 'Capacity audit (hours planned vs. used), batch admin into one block, insert calendar buffers, schedule one small joy/novelty block', frequency: 'Weekly' }
        ],
        high: [
          { habit: '2 recovery anchors (AM 5 min slow breathing; PM 30–60 min wind-down), 10–20 min daylight walk, 2 timeboxed work blocks max (with real breaks), protein + complex-carb meals, caffeine cap by early afternoon, 5–10 min "close loops" journal', frequency: 'Daily' },
          { habit: 'Zone-2 cardio or gentle yoga (20–30 min), one supportive social check-in, one joy block (20–30 min of low-effort fun)', frequency: '2–3×/week' },
          { habit: 'Capacity/commitment audit, insert calendar buffers, schedule a longer recovery session (nature, massage, nap), re-negotiate deadlines', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Pre-set Focus Scene (only required tabs/apps), timer visible',
          '"Idea parking lot" to catch stray thoughts',
          'Warm/dim evening lighting, water within reach',
          'Default meetings to 25/50 min to protect buffers'
        ],
        medium: [
          'Visible capacity board (To-Do / Doing / Done with limits), timer and break prompts',
          'System-level DND with VIP exceptions',
          'Warm/dim lighting after sunset, water + protein snack within reach',
          'A clear end-work cue (lamp off, playlist, notebook closed)'
        ],
        high: [
          'System-level DND with a status ("Heads-down; replies at 4 pm")',
          'Default meetings to 25/50 min, visible capacity board (To-Do / Doing / Done with limits)',
          'Warm/dim evening lights, cool/dark bedroom',
          'Single-task desktop (only essential apps), water + easy protein within reach'
        ]
      },
      keyPerformance: {
        low: [
          'AM & PM energy (0–10),one quick rating each morning and evening',
          'Sleep consistency,# of nights/week within ±60 min of target bed/wake',
          'Recovery ratio,micro-breaks completed ÷ focus blocks (aim ≥1 per block)'
        ],
        medium: [
          'Sleep debt (weekly, hrs),target minus actual across 7 days',
          'Big 3 completion rate,completed ÷ 3 each day',
          'Recovery ratio,micro-breaks completed ÷ focus blocks (aim ≥1 per block)'
        ],
        high: [
          'Evening exhaustion (0–10),one rating each night',
          'Recovery minutes/day,total of NSDR/yoga-nidra + easy walks',
          'Over-commitment delta (hrs),actual work hours minus planned hours (target ≤0)'
        ]
      },
      kpiTracking: [
        { metric: 'Daily energy level (1-10)', target: '≥7 average' },
        { metric: 'Hours of restful sleep', target: '7-9 hours' },
        { metric: 'Weekly recovery activities', target: '3+ sessions' },
        { metric: 'Work hours per week', target: '≤45 hours' }
      ],
      nootropics: [
        { name: 'CoQ10', benefit: 'Supports cellular energy production', dosage: '100-200mg daily' },
        { name: 'Cordyceps', benefit: 'Improves energy and reduces fatigue', dosage: '1000-3000mg daily' },
        { name: 'B-Complex Vitamins', benefit: 'Essential for energy metabolism', dosage: 'As directed on label' }
      ],
      highDescription: 'Individuals with high burnout and fatigue experience persistent mental and physical exhaustion, reduced motivation, and lower stamina for tasks.\n\nThey may feel overwhelmed easily and find it harder to stay consistent, even with simple routines.',
      highImplications: [
        'Low energy can reduce productivity, making tasks feel heavier and take longer to complete.',
        'Increased stress sensitivity may impact emotional regulation, causing irritability and low resilience.',
        'Fatigue can reduce focus and memory, leading to more mistakes and difficulty staying engaged.'
      ],
      lowDescription: 'Individuals with low burnout and fatigue maintain steadier energy levels, recover well after stress, and sustain performance over longer periods.\n\nThey typically manage workload demands without prolonged exhaustion.',
      lowImplications: [
        'Better energy stability supports consistent performance and stronger follow-through on goals.',
        'Improved resilience helps individuals handle pressure without emotional overwhelm.',
        'Stronger focus and recovery make it easier to maintain routines and stay motivated.'
      ],
      implications: 'Chronic burnout leads to cognitive decline, weakened immune function, emotional instability, and decreased motivation. It can result in depression, chronic fatigue syndrome, and long-term damage to neural pathways.',
      howToImprove: [
        'Recovery Breaks: Add short resets between tasks (5-10 minutes) to reduce mental load and prevent burnout buildup.',
        'Sleep Hygiene: Maintain a consistent sleep schedule and a calming wind-down routine to improve recovery.',
        'Energy Pacing: Alternate high-effort tasks with lighter tasks to avoid overloading the brain.',
        'Stress Regulation: Use breath work, walking, stretching, or guided relaxation to support nervous system recovery.'
      ]
    },
    'emotional-regulation': {
      title: 'Emotional Regulation',
      icon: Smile,
      color: '#EF4444',
      intro: 'Emotional regulation is your brain\'s ability to manage and respond to emotional experiences appropriately. It\'s not about suppressing emotions but understanding and channeling them effectively. Strong emotional regulation improves relationships, decision-making, and overall well-being.',
      videoUrl: 'https://www.youtube.com/embed/JD4O7ama3o8',
      brainRegion: {
        name: 'Limbic System & Prefrontal Cortex',
        description: 'Emotional regulation involves the interplay between the limbic system (emotional brain) and prefrontal cortex (rational brain). The PFC helps modulate emotional responses generated by the amygdala and insula.',
        areas: [
          { name: 'Amygdala', role: 'Emotional responses' },
          { name: 'Insula', role: 'Emotional awareness' },
          { name: 'Ventromedial PFC', role: 'Emotion regulation' },
          { name: 'Anterior Cingulate', role: 'Emotional conflict' }
        ],
        qeegNote: 'Emotional regulation refers to the ability to monitor, manage, and adapt one\'s emotional responses in a healthy and constructive way.'
      },
      subParameters: [
        { name: 'Alpha Asymmetry (Frontal)', score: 70, description: 'Frontal hemisphere balance for emotional processing' },
        { name: 'Arousal Score', score: 65, description: 'HiBeta:Beta ratio showing emotional arousal regulation' },
        { name: 'Regeneration (Alpha Modulation)', score: 68, description: 'Alpha reactivity indicating emotional flexibility' }
      ],
      moversInfo: {
        title: 'MOVERS for Emotional Balance',
        description: 'Physical activity directly impacts emotional regulation by balancing neurotransmitters and reducing emotional reactivity.',
        tips: ['Running or cycling can help process difficult emotions', 'Dance combines movement with emotional expression', 'Martial arts teach emotional control through physical discipline']
      },
      whatThisMeans: {
        low: "You're reactive and on-edge, small triggers spike big feelings, rumination lingers, and it's hard to choose your response before it chooses you.",
        medium: "You're generally steady, but certain people/situations still spike you. Emotions don't run the show, yet they sometimes steer the wheel before you notice.",
        high: "You're steady under pressure, feelings are acknowledged without flooding, and you can choose your response. The risk is over-control (suppression/rigidity) that blunts connection or lets hidden load build."
      },
      topGoals: {
        low: [
          'Shorten the gap between trigger → calm',
          'Replace reflex reactions with chosen responses',
          'Reduce rumination and restore steadiness'
        ],
        medium: [
          'Smooth spikes and shorten recovery',
          'Increase the pause between feeling → response',
          'Use clear scripts so tough moments stay constructive'
        ],
        high: [
          'Turn composure into clear, constructive action on hard issues',
          'Maintain warmth and empathy so steadiness doesn\'t feel distant',
          'Prevent silent accumulation of stress; repair small ruptures early'
        ]
      },
      quickWins: {
        low: [
          'Name it to tame it: state the emotion + intensity (e.g., "anger 7/10")',
          '2-minute downshift: 3× physiological sighs → 1 minute of 4-6 breathing',
          'STOP card on your desk/phone: Stop, Take a step back, Observe, Proceed intentionally'
        ],
        medium: [
          'Set a 2–3 min response buffer for tense chats (timer on, breathe, then reply)',
          'Before a high-stakes call, do 2 minutes of 4–6 breathing + write your first sentence',
          'Create one If/Then script for a common trigger (e.g., "If interrupted, then: \'Hold that, let me finish this thought.\'")'
        ],
        high: [
          'Have one avoided-but-important conversation using: Brief → Impact → Clear request (BIC)',
          'Do 2 minutes loving-kindness/compassion breathing before a tough interaction',
          'Send one appreciation/repair message ("Here\'s what I valued / Here\'s what I\'ll do next time…")'
        ]
      },
      coreHabits: {
        low: [
          { habit: 'AM/PM mood check (word + 0–10 rating), 8–10 min breathwork or mindful walk, protein-forward meals, 10-min evening "close the loop" journal (one worry list → one action or let-go)', frequency: 'Daily' },
          { habit: 'Practice a response script for common triggers (e.g., "I need 10 minutes, then I\'ll reply"), 10–20 min moderate movement', frequency: '3–4×/week' },
          { habit: 'Trigger review (top 3), rehearse alternative responses, schedule 1–2 protected calm blocks (no meetings, short walk, stretch)', frequency: 'Weekly' }
        ],
        medium: [
          { habit: 'AM/PM mood check (word + 0–10), 8–10 min breath/mindfulness, 20–30 min movement, 5-min evening "close loops" journal (worry → action or park)', frequency: 'Daily' },
          { habit: 'Rehearse 1–2 response scripts out loud; practice a 5-min sensory reset (splash cold water, 5-4-3-2-1 grounding)', frequency: '3×/week' },
          { habit: 'Review top triggers and update scripts; batch hard conversations into one protected window; schedule one calm block (walk/stretch, no meetings)', frequency: 'Weekly' }
        ],
        high: [
          { habit: '8–10 min breath/mindfulness; Feel → Need → Request journal (3 lines max); one connection bid (check-in, gratitude, or repair); 10-min shutdown (note tomorrow\'s first sentence for a hard convo)', frequency: 'Daily' },
          { habit: 'Rehearse a response script out loud (interruptions, disagreement, bad news); 10 min expressive writing if something lingers; 20–30 min moderate movement', frequency: '2–3×/week' },
          { habit: 'Pre-schedule hard conversations with prep notes; review boundaries/loads; book one social nourishment block (friend/family time)', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Batch notifications; set email/DM reply windows',
          'Keep a visible pause timer (60–120s) near your workstation',
          'Front/side warm lighting after sunset; water within reach',
          'Keep a grounding object (smooth stone, cold pack) at desk; use delayed send defaults for email'
        ],
        medium: [
          'Meeting buffers (finish at :25/:50), reply windows for email/DMs',
          'Visible pause card (STOP: Stop–Take a step back–Observe–Proceed)',
          'Warm/dim lighting after sunset, headphones/earplugs',
          'Sticky note with your top two scripts near your screen'
        ],
        high: [
          'Meeting buffers :25/:50; visible response scripts near screen',
          'Email delayed send on by default; warm/dim evening lighting',
          'Private nook for calls',
          'Desk card: Pause → Label → Choose (FNR) as a micro-cue'
        ]
      },
      keyPerformance: {
        low: [
          'Pause-to-respond time (seconds),average seconds you wait before replying when triggered',
          'Escalations/day,count of moments you\'d rate ≥7/10 in intensity',
          'Return-to-baseline time (minutes),minutes from trigger to feeling steady again'
        ],
        medium: [
          'Escalations/day,count of moments ≥7/10 in intensity',
          'Return-to-baseline time,median minutes from a ≥5/10 trigger to steady',
          'Big 3 completion rate,completed ÷ 3 each day'
        ],
        high: [
          'High-stakes conversation completion rate,# completed ÷ # planned (weekly)',
          'Return-to-baseline time,median minutes from a ≥5/10 trigger to steady',
          'Connection bids,count of appreciation/repair/check-ins sent or responded to (per day)'
        ]
      },
      kpiTracking: [
        { metric: 'Daily mood rating (1-10)', target: '≥7 average' },
        { metric: 'Emotional outburst frequency', target: '<2 per week' },
        { metric: 'Mindfulness minutes', target: '15+ daily' },
        { metric: 'Positive interactions daily', target: '5+ interactions' }
      ],
      nootropics: [
        { name: 'Saffron Extract', benefit: 'Supports mood balance naturally', dosage: '30mg daily' },
        { name: '5-HTP', benefit: 'Precursor to serotonin production', dosage: '50-100mg daily' },
        { name: 'CBD Oil', benefit: 'May help with anxiety and mood', dosage: '15-50mg as needed' }
      ],
      highDescription: 'Individuals with strong emotional regulation can experience emotions fully without being overwhelmed by them.\n\nTheir brain efficiently balances emotional reactivity with thoughtful response. They remain composed during challenges and recover quickly after emotional stress.',
      highImplications: [
        'Stable emotional regulation supports clear thinking, confident decision-making, and healthy relationships.',
        'These individuals demonstrate resilience, patience, and adaptability in changing situations.',
        'Strong emotional balance enhances leadership capacity, communication skills, and overall well-being.'
      ],
      lowDescription: 'Individuals with weak emotional regulation may experience heightened emotional reactivity or emotional shutdown.\n\nThe brain may struggle to balance impulsive responses with rational control, leading to mood swings, irritability, or withdrawal. Emotional recovery after stress may be slower.',
      lowImplications: [
        'Emotional dysregulation can impact focus, judgment, and interpersonal relationships.',
        'Increased reactivity may lead to anxiety, frustration, or low mood.',
        'Difficulty managing emotions may reduce resilience and affect academic, professional, or social functioning.'
      ],
      implications: 'Poor emotional regulation affects relationships, workplace performance, decision-making, and overall mental health. It can lead to conflict, impulsive decisions, anxiety, depression, and difficulty maintaining stable connections.',
      howToImprove: [
        'Daily Awareness practice: 5-10 minutes of mindful emotional check-ins to identify and label feelings.',
        'Breath regulation: Slow breathing techniques to calm limbic activation and restore balance.',
        'Response gap training: Pause before reacting; practice reframing situations constructively.',
        'Emotional recovery habits: Prioritize sleep, journaling, and supportive conversations to enhance resilience.'
      ]
    },
    learning: {
      title: 'Learning',
      icon: GraduationCap,
      color: '#10B981',
      intro: 'Learning is your brain\'s ability to acquire, process, and retain new information and skills. Neuroplasticity, the brain\'s ability to reorganize itself, makes lifelong learning possible. Optimizing your learning capacity unlocks new opportunities and keeps your brain young.',
      videoUrl: 'https://www.youtube.com/embed/5MgBikgcWnY',
      brainRegion: {
        name: 'Hippocampus & Temporal Lobe',
        description: 'The hippocampus is essential for forming new memories and learning. Located in the temporal lobe, it converts short-term memories to long-term storage and helps you navigate new information.',
        areas: [
          { name: 'Hippocampus', role: 'Memory formation' },
          { name: 'Temporal Cortex', role: 'Language & concepts' },
          { name: 'Prefrontal Cortex', role: 'Working memory' },
          { name: 'Cerebellum', role: 'Procedural learning' }
        ],
        qeegNote: 'Learning capacity is measured via Alpha peak frequency and Theta:Beta ratio at posterior sites (Pz, O1, O2), indicating information processing efficiency and encoding potential.'
      },
      subParameters: [
        { name: 'Alpha Peak', score: 72, description: 'Alpha frequency indicating cognitive readiness for learning' },
        { name: 'Focus Score (Theta:Beta)', score: 68, description: 'Theta:Beta ratio showing learning attention capacity' },
        { name: 'Alpha:Theta Balance', score: 65, description: 'Posterior dominance for optimal information processing' }
      ],
      moversInfo: {
        title: 'MOVERS for Learning',
        description: 'Exercise before learning increases BDNF, which acts like fertilizer for brain cells and enhances learning capacity.',
        tips: ['20 minutes of cardio before studying boosts retention', 'Walking while reviewing material aids memory', 'Physical breaks between study sessions improve consolidation']
      },
      whatThisMeans: {
        low: "You're consuming but not retaining, concepts feel fuzzy, recall fades fast, and applying ideas is hard without notes.",
        medium: "You learn steadily but retention and transfer are uneven, some concepts stick, others fade, and applying ideas beyond examples is hit-or-miss.",
        high: "You're absorbing fast and grasping nuance. The risk is over-consumption without consolidation, notes pile up, but durable understanding and output lag."
      },
      topGoals: {
        low: [
          'Strengthen encoding → retrieval so learning sticks',
          'Build simple mental models you can explain',
          'Establish a small, daily learning cadence'
        ],
        medium: [
          'Make recall reliable at 48 hours and 1 week',
          'Convert notes into usable models and solved examples',
          'Practice transfer (apply to new contexts) each week'
        ],
        high: [
          'Convert intake into durable schemas and checklists',
          'Ship artifacts (teach-backs, maps, mini-demos)',
          'Stress-test with transfer tasks beyond examples'
        ]
      },
      quickWins: {
        low: [
          'Pick 1 concept → attempt a problem-first answer for 5 min before reading/watching',
          'Write a 3-bullet Feynman summary (explain like you\'re teaching a 12-year-old)',
          'Create 5 flashcards (Concept → Example → Test Q) and schedule a next-day review'
        ],
        medium: [
          'Before studying, write 3 questions you must answer; study only to answer them',
          'After the session, do 5–10 min pure retrieval (no notes) → check → fix gaps',
          'Create 5 spaced cards (Concept → Example → Test Q) and schedule 2 reviews (tomorrow, in 3 days)'
        ],
        high: [
          'Pick one keystone idea → record a 10-min teach-back (voice memo or one-pager)',
          'Schedule spaced reviews for today\'s material (tomorrow, 3 days, 7 days)',
          'Do one transfer problem cold (no notes), then check and fix gaps'
        ]
      },
      coreHabits: {
        low: [
          { habit: '1–2 × 20–30 min focused learning blocks (timer, one source); 5–10 min retrieval right after; log tomorrow\'s first question', frequency: 'Daily' },
          { habit: 'Attempt a problem-first answer for 5 min before reading; write a 3-bullet Feynman summary; create 5 flashcards', frequency: '3–4×/week' },
          { habit: 'Review and correct missed Qs, consolidate notes into simple models', frequency: 'Weekly' }
        ],
        medium: [
          { habit: '1–2 × 30–45 min focused learning blocks (timer, one source); 5–10 min retrieval right after; log tomorrow\'s first question', frequency: 'Daily' },
          { habit: 'Interleave topics (A–B–A) and do one transfer task (new problem/case) without notes; capture a 2-minute teach-back (voice memo or bullets)', frequency: '3×/week' },
          { habit: '30–45 min consolidation, update a one-page map (Key Idea → Steps → Pitfalls), correct missed Qs, and archive redundant notes', frequency: 'Weekly' }
        ],
        high: [
          { habit: '2 × 45–60 min focused blocks (one source per block) → 5–10 min closed-book retrieval right after; make 8–12 flashcards; log tomorrow\'s first question', frequency: 'Daily' },
          { habit: 'Project/apply session (build a checklist, SOP, or tiny demo); interleave topics (A–B–A); deliberate difficulty (hard problems first)', frequency: '2–3×/week' },
          { habit: '60–90 min synthesis, merge notes into a 1-page map (Key Idea → Steps → Pitfalls), refactor the card deck, update an "error log," and share one artifact (post, doc, or walkthrough)', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'One-source rule (only the current book/video open), single-screen/app-only window',
          'Notes template visible (Concept → Example → Test Q)',
          'Timer in sight, pen/paper at hand',
          'Website/app blockers during learning'
        ],
        medium: [
          'One-source rule during the block; visible Q→A note template (Concept, Example, Test Q)',
          'Index cards/whiteboard for retrieval; blockers on; timer in sight',
          'Chair/desk set for upright posture',
          'Keep a "parking lot" pad for tangents'
        ],
        high: [
          '"Build mode" scene (editor/whiteboard only), template library (Feynman, Checklist, SOP)',
          'Visible spaced-review queue, timer in sight, blockers on',
          'Capture tray for ideas (notepad or voice memo)',
          'Versioned notes folder (Maps / Examples / Artifacts)'
        ]
      },
      keyPerformance: {
        low: [
          'Focused learning blocks/day,count only uninterrupted 20–30 min sessions',
          'Next-day recall accuracy (%),score yourself on 5–10 questions or flashcards',
          'Spaced-review completion rate (%),% of scheduled reviews you actually did'
        ],
        medium: [
          'Focused learning blocks/day,count only uninterrupted 30–45 min sessions',
          '48-hour retrieval accuracy (%),score yourself on 8–12 flashcards made that day',
          'Transfer attempts/week,# of new problems/cases tackled without notes (then checked)'
        ],
        high: [
          '1-week retrieval accuracy (%),score 10–15 questions/flashcards saved one week ago',
          'Artifacts shipped/week (#),one-pagers, checklists, demos',
          'Transfer success rate (%),# of new problems/cases solved before checking ÷ # attempted'
        ]
      },
      kpiTracking: [
        { metric: 'Daily learning time', target: '1+ hour' },
        { metric: 'Concepts retained after 1 week', target: '≥70%' },
        { metric: 'New skills started this month', target: '1+ skill' },
        { metric: 'Books/courses completed monthly', target: '1-2 items' }
      ],
      nootropics: [
        { name: 'Phosphatidylserine', benefit: 'Supports memory and learning', dosage: '100-300mg daily' },
        { name: 'Ginkgo Biloba', benefit: 'Improves blood flow to brain', dosage: '120-240mg daily' },
        { name: 'Huperzine A', benefit: 'Enhances acetylcholine for learning', dosage: '50-200mcg daily' }
      ],
      highDescription: 'Individuals with high learning capacity absorb new information quickly, recognize patterns easily, and apply concepts across different situations.\n\nThey tend to adapt fast, retain what they learn, and improve with feedback.',
      highImplications: [
        'Quick learning improves performance in academic and professional settings where new skills are required.',
        'Strong retention supports better exam outcomes, faster mastery, and more confident decision-making.',
        'High adaptability allows individuals to switch strategies smoothly when challenges or expectations change.'
      ],
      lowDescription: 'Low learning capacity can show up as slower comprehension, reduced retention, and difficulty applying new concepts in real-life situations.\n\nIndividuals may need more repetition and structure to build confidence and consistency.',
      lowImplications: [
        'Difficulty processing new information may lead to frustration and reduced confidence in learning environments.',
        'Lower retention can make it harder to keep up with instructions, multi-step tasks, or fast-paced lessons.',
        'Challenges with applying concepts can impact problem-solving ability and increase reliance on guidance.'
      ],
      implications: 'Reduced learning ability affects career growth, skill development, adaptability to change, and personal development. It can lead to falling behind professionally and difficulty keeping up with new demands.',
      howToImprove: [
        'Spaced Repetition: Review key concepts in short intervals across days to strengthen memory.',
        'Active Learning: Use practice questions, teach-back methods, and real examples to build understanding.',
        'Chunking: Break information into smaller sections with clear headings, summaries, and check-ins.',
        'Consistency Routine: Study or practice at the same time daily to train the brain for better recall and focus.'
      ]
    },
    creativity: {
      title: 'Creativity',
      icon: Star,
      color: '#8B5CF6',
      intro: 'Creativity is your brain\'s ability to generate novel ideas, make unique connections, and think outside conventional patterns. It involves the interplay of focused attention and relaxed, diffuse thinking. Nurturing creativity enhances problem-solving and brings innovation to all areas of life.',
      videoUrl: 'https://www.youtube.com/embed/Oht0-qKeUGE',
      brainRegion: {
        name: 'Default Mode Network & Right Hemisphere',
        description: 'Creativity emerges from the default mode network (DMN) activating during relaxed, mind-wandering states. The right hemisphere specializes in holistic, pattern-recognition thinking essential for creative insights.',
        areas: [
          { name: 'Right Hemisphere', role: 'Holistic thinking' },
          { name: 'Default Mode Network', role: 'Mind wandering & ideation' },
          { name: 'Prefrontal Cortex', role: 'Idea evaluation' },
          { name: 'Temporal-Parietal Junction', role: 'Novel associations' }
        ],
        qeegNote: 'Creativity refers to the brain\'s ability to generate novel ideas, think divergently, and connect unrelated concepts in innovative ways.'
      },
      subParameters: [
        { name: 'Relaxation Score', score: 70, description: 'Alpha:Beta balance enabling creative flow states' },
        { name: 'Focus Score (Theta:Beta)', score: 73, description: 'Theta:Beta ratio for creative focus and ideation' },
        { name: 'Alpha Peak', score: 65, description: 'Alpha frequency supporting creative insight generation' }
      ],
      moversInfo: {
        title: 'MOVERS for Creativity',
        description: 'Movement activates the default mode network, the brain state associated with creative insights and "aha moments."',
        tips: ['Walking boosts creative output by 60%', 'Varied environments during movement spark new ideas', 'Playful movement like dancing unlocks creative thinking']
      },
      whatThisMeans: {
        low: "You're stuck in convergent mode, ideas feel stale, you self-censor early, and perfectionism blocks play and experimentation.",
        medium: "You generate ideas but they cluster around familiar patterns, and shipping is inconsistent. With small constraints and a steady cadence, originality and output can jump.",
        high: "You're in a prolific, associative state, ideas connect fast and feel fresh. The risk is idea sprawl and polishing drafts instead of shipping."
      },
      topGoals: {
        low: [
          'Unlock divergent thinking and suspend judgment',
          'Build a daily idea cadence',
          'Convert raw ideas into tiny prototypes'
        ],
        medium: [
          'Stabilize a daily ideate → make rhythm',
          'Increase originality via constraints and cross-pollination',
          'Convert more ideas into shareable prototypes'
        ],
        high: [
          'Channel volume into finished, shareable artifacts',
          'Limit WIP so quality and momentum stay high',
          'Close fast feedback loops to iterate intelligently'
        ]
      },
      quickWins: {
        low: [
          'Run a 10-minute "20 bad ideas" sprint on one prompt, no evaluating',
          'Do a forced connection: pick two random words/objects → combine into 3 concepts',
          'Take a 15-minute novelty walk (no phone); capture 3 notes/sketches/photos'
        ],
        medium: [
          'Run a 12–15 min constrained sprint (e.g., "10 ideas using only circles" or "3 mashups: AI × Ayurveda, Brain × Design, Sleep × Music")',
          'Pick 1 idea → build a one-page/one-slide/one-minute prototype now',
          'Share it with one person and ask one question: "What\'s the most interesting part?"'
        ],
        high: [
          'Pick one needle-mover and write a 1-sentence spec: For [audience], solves [problem] by [approach]',
          'Run a 60–90 min maker block to produce a v0 (one page/slide/minute)',
          'Park all other ideas in an Idea Parking Lot; share v0 with one person and ask one question ("What\'s most interesting?")'
        ]
      },
      coreHabits: {
        low: [
          { habit: '10–15 min idea sprint (aim ~20 ideas); 5 min SCAMPER remix of yesterday\'s top idea; 5 min morning pages; 15–20 min movement', frequency: 'Daily' },
          { habit: '30–45 min maker block to build a micro-prototype (1 page, 1 slide, 1 take) and share with one person', frequency: '3×/week' },
          { habit: 'Artist date (60–90 min solo inspiration), refill an input bank (quotes, images, examples), review top 3 ideas → pick 1 to build next week', frequency: 'Weekly' }
        ],
        medium: [
          { habit: '10–15 min idea sprint (use SCAMPER or forced connections), 25–45 min maker block, 5 min evaluate & pick (novelty/feasibility/excitement 1–5), add 1 item to an input bank (quote/image/example)', frequency: 'Daily' },
          { habit: 'Do a constraint challenge (style limit, time limit, medium swap), a remix (take an admired piece and twist two elements), and a 20-min co-creation jam with a partner', frequency: '3×/week' },
          { habit: 'Demo Day, ship at least one artifact; 20-min retrospective (What sparked? What stalled? What to try next?); refresh moodboard/themes for the coming week', frequency: 'Weekly' }
        ],
        high: [
          { habit: '1–2 maker blocks (50/10 or 90/15), WIP limit = 1–2, capture & triage ideas (tags: Seed / Next / Park), end-of-day breadcrumb note (next action)', frequency: 'Daily' },
          { habit: 'Constraint challenge (medium/time/style), critique jam (15–20 min with a partner), one remix or mashup', frequency: '2–3×/week' },
          { habit: 'Demo Day (ship at least one artifact), 20-min retrospective (keep/kill/iterate), refresh the input bank/moodboard', frequency: 'Weekly' }
        ]
      },
      environmentTweaks: {
        low: [
          'Set two modes with a visible cue (Ideate vs Evaluate); keep analog tools in reach (sticky notes, index cards)',
          'Create an inspiration wall/moodboard; keep a random stimulus box (photos, words)',
          'Timer visible; close reference tabs during ideation',
          'Frictionless capture (notepad/voice memo)'
        ],
        medium: [
          'Separate Ideate vs Evaluate scenes (visual cue on desk), analog tools visible (sticky notes, index cards)',
          'Constraint cards within reach, inspiration wall/moodboard',
          'Single-task desktop during maker block, timer in sight',
          'Low-friction capture tray (notepad/voice memo)'
        ],
        high: [
          'Separate Ideate vs Evaluate scenes; visible Kanban with WIP limits',
          'Template library (one-pager, storyboard, landing page)',
          'Frictionless capture (notepad/voice memo); timer in sight',
          'Keyboard shortcuts/macros; versioned folders for drafts → v1 → v2'
        ]
      },
      keyPerformance: {
        low: [
          'Idea count/day,raw ideas captured (no judging)',
          'Prototypes or drafts shipped/week,even rough is valid',
          'Input diversity/week,count distinct new sources (people, places, media, articles)'
        ],
        medium: [
          'Idea→Prototype rate/week,ideas that became drafts, one-pagers, mockups, or recordings',
          'Artifacts shipped/week,drafts, one-pagers, mockups, or recordings',
          'Feedback loops/week,distinct new sources received (comments, user tries)'
        ],
        high: [
          'Artifacts shipped/week (#),one-pagers, mockups, drafts',
          'Cycle time (days),from start to first share',
          'Feedback loops/week (#),distinct testers/comments or user tries'
        ]
      },
      kpiTracking: [
        { metric: 'Ideas generated daily', target: '5+ ideas' },
        { metric: 'Creative projects active', target: '1-2 projects' },
        { metric: 'Time in creative flow', target: '30+ mins daily' },
        { metric: 'New experiences per week', target: '2+ experiences' }
      ],
      nootropics: [
        { name: 'Microdose Psilocybin', benefit: 'May enhance creative thinking (where legal)', dosage: 'Consult professional' },
        { name: 'Aniracetam', benefit: 'May support creative and holistic thinking', dosage: '750-1500mg daily' },
        { name: 'Creatine', benefit: 'Supports brain energy for creative work', dosage: '3-5g daily' }
      ],
      highDescription: 'Individuals with high creativity scores exhibit strong divergent thinking, allowing them to generate multiple solutions to a problem.\n\nThey tend to excel in innovation, artistic expression, and flexible thinking.',
      highImplications: [
        'High creativity supports problem-solving by encouraging unique perspectives and out-of-the-box thinking.',
        'These individuals are more adaptable, as they can approach challenges with flexibility and innovation.',
        'Creative thinkers often thrive in dynamic environments where new ideas and perspectives are valued.'
      ],
      lowDescription: 'A lower creativity score may indicate difficulty in approaching problems from multiple angles or generating new ideas.\n\nThese individuals may rely more on structured, rule-based thinking and struggle with abstract or open-ended tasks.',
      lowImplications: [
        'Low creativity may lead to rigid problem-solving, making it harder to adapt to new challenges.',
        'These individuals may find brainstorming and conceptualizing new ideas difficult.',
        'Limited creative expression can result in frustration in artistic or idea-driven tasks.'
      ],
      implications: 'Low creativity affects problem-solving ability, adaptability, innovation at work, and personal fulfillment. It can limit career advancement and reduce the ability to find solutions to complex challenges.',
      howToImprove: [
        'No-input time: 15mins/day with no phone for emergence of creativity.',
        'Creative switch: Change environment (cafe/nature) once a week for fresh thinking.',
        'Two-mode rule: Brainstorm messy first; edit later (never both at once).'
      ]
    }
  };

  // Reusable Brain Parameter Section Component
  const BrainParameterSection = ({ parameterKey }) => {
    const data = brainParametersData[parameterKey];
    if (!data) return <ProfileSection />;

    const Icon = data.icon;

    // Get patient's actual scores from multiple sources (priority order)
    const getPatientScoreData = (paramKey) => {
      // Key mapping for different naming conventions
      // Includes exact names from algorithm processor: Cognition, Stress, Focus & Attention, Burnout & Fatigue, Emotional Regulation, Learning, Creativity
      const keyMap = {
        'cognition': ['cognition', 'Cognition'],
        'stress': ['stress', 'Stress'],
        'focus-attention': ['focusAttention', 'focus_attention', 'focus', 'Focus', 'Focus & Attention', 'Focus and Attention'],
        'burnout-fatigue': ['burnoutFatigue', 'burnout_fatigue', 'burnout', 'Burnout', 'Burnout & Fatigue', 'Burnout and Fatigue'],
        'emotional-regulation': ['emotionalRegulation', 'emotional_regulation', 'emotional', 'Emotional', 'Emotional Regulation'],
        'learning': ['learning', 'Learning'],
        'creativity': ['creativity', 'Creativity']
      };

      const possibleKeys = keyMap[paramKey] || [paramKey];

      // Helper to find value from object using multiple possible keys
      const findValue = (obj, keys) => {
        if (!obj) return null;
        for (const key of keys) {
          if (obj[key] !== undefined && obj[key] !== null) {
            // Handle both direct values and objects with score/value properties
            const val = obj[key];
            if (typeof val === 'object' && val !== null) {
              return val.score || val.value || val.percentage || null;
            }
            return typeof val === 'number' ? val : parseFloat(val) || null;
          }
        }
        return null;
      };

      // Source 1: Algorithm Results (from QEEG processing)
      // Data structure: array of { parameter: 'Cognition', score: 85, rawScore: '3/21', status: 'normal' }
      if (algorithmResults?.data && Array.isArray(algorithmResults.data)) {
        // Search through the array for matching parameter name
        const matchingResult = algorithmResults.data.find(item => {
          if (!item?.parameter) return false;
          const paramName = item.parameter.toLowerCase().replace(/[^a-z]/g, '');
          // Check against all possible keys for this parameter
          return possibleKeys.some(key => {
            const keyName = key.toLowerCase().replace(/[^a-z]/g, '');
            return paramName === keyName || paramName.includes(keyName) || keyName.includes(paramName);
          });
        });

        if (matchingResult && matchingResult.score !== undefined) {
          return {
            score: Math.round(matchingResult.score),
            source: 'NeuroSense Assessment',
            date: algorithmResults.processedAt,
            rawScore: matchingResult.rawScore,
            status: matchingResult.status
          };
        }
      }

      // Source 1b: Algorithm Results as object (fallback for different data format)
      if (algorithmResults?.data && !Array.isArray(algorithmResults.data)) {
        const score = findValue(algorithmResults.data, possibleKeys);
        if (score !== null) {
          return {
            score: Math.round(score),
            source: 'NeuroSense Assessment',
            date: algorithmResults.processedAt
          };
        }
      }

      // Source 2: Clinical Report brain_parameters
      if (clinicalReport?.brain_parameters) {
        const score = findValue(clinicalReport.brain_parameters, possibleKeys);
        if (score !== null) {
          return {
            score: Math.round(score),
            source: 'Clinical Report',
            date: clinicalReport.updated_at || clinicalReport.created_at
          };
        }
      }

      // Source 3: Patient Reports with brainParameters
      if (patientReports && patientReports.length > 0) {
        for (const report of patientReports) {
          const reportData = report.reportData || report.report_data;
          const brainParams = reportData?.brainParameters || reportData?.brain_parameters;
          if (brainParams) {
            const score = findValue(brainParams, possibleKeys);
            if (score !== null) {
              return {
                score: Math.round(score),
                source: 'Patient Report',
                date: report.created_at
              };
            }
          }
        }
      }

      return null;
    };

    const patientScoreData = getPatientScoreData(parameterKey);

    // Debug log for brain parameter scores
    if (algorithmResults?.data) {
    }
    const patientMainScore = patientScoreData?.score || null;
    const hasAssessmentData = patientMainScore !== null;
    const dataSource = patientScoreData?.source || null;
    const assessmentDate = patientScoreData?.date ? new Date(patientScoreData.date).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : null;
    const rawScore = patientScoreData?.rawScore || null;
    const paramStatus = patientScoreData?.status || null;

    // Determine score level: Low (0-1/3), Medium (2/3), High (3/3)
    const getScoreLevel = () => {
      if (!rawScore) return 'unknown';
      const [score, max] = rawScore.split('/').map(Number);
      if (score <= 1) return 'low';
      if (score === 2) return 'medium';
      return 'high';
    };
    const scoreLevel = getScoreLevel();

    // Dynamic content based on score level for each parameter
    const getDynamicContent = () => {
      const dynamicContentMap = {
        cognition: {
          low: {
            statusMessage: '⚠️ Your cognitive markers need attention. Focus on foundational brain health practices.',
            intro: 'Your QEEG assessment shows your cognitive function has room for significant improvement. Your Theta:Beta ratio and Alpha patterns indicate your brain may be working harder than optimal to maintain focus and mental clarity. The good news is that cognition is highly trainable with the right interventions.',
            priorityActions: [
              '🎯 Start with 10-minute daily meditation to improve Alpha peak',
              '🧠 Add Lion\'s Mane supplement (500mg) to support nerve growth',
              '🚶 Take 3 short walks daily to boost cerebral blood flow',
              '😴 Prioritize 8+ hours sleep for memory consolidation'
            ],
            focusArea: 'Building foundational cognitive capacity through consistent daily practices'
          },
          medium: {
            statusMessage: '📊 Your cognitive function is moderate. Targeted improvements can elevate your performance.',
            intro: 'Your cognitive markers are in the moderate range. Your brain shows decent processing capability, but there\'s potential for optimization. Fine-tuning your Theta:Beta balance and strengthening Alpha patterns can unlock higher mental performance.',
            priorityActions: [
              '🎯 Increase cognitive challenge with brain training apps',
              '📚 Add 20 minutes of focused reading daily',
              '🏃 Include high-intensity interval training 3x/week',
              '🥗 Optimize nutrition with omega-3 rich foods'
            ],
            focusArea: 'Optimizing existing cognitive patterns through targeted training'
          },
          high: {
            statusMessage: '✅ Excellent! Your cognitive markers are strong. Focus on maintenance and peak performance.',
            intro: 'Your QEEG shows excellent cognitive function! Your Theta:Beta ratio is well-balanced, and your Alpha patterns indicate strong mental clarity. Your brain is operating efficiently. Now focus on maintaining these optimal patterns and pushing for peak performance.',
            priorityActions: [
              '🏆 Challenge yourself with advanced cognitive tasks',
              '🧘 Maintain meditation practice to preserve Alpha strength',
              '📈 Track and optimize your peak performance hours',
              '🌟 Explore flow state training for elite performance'
            ],
            focusArea: 'Maintaining excellence and exploring peak cognitive performance'
          }
        },
        stress: {
          low: {
            statusMessage: '✅ Great news! Your stress markers are low. Your nervous system is well-regulated.',
            intro: 'Your QEEG shows low stress indicators - this is excellent! Your HiBeta:Beta ratio and relaxation capacity are healthy, meaning your autonomic nervous system is functioning optimally. Continue your current practices to maintain this balanced state.',
            priorityActions: [
              '🧘 Maintain your current relaxation practices',
              '✨ Build stress resilience through controlled challenges',
              '📊 Monitor for early warning signs during high-demand periods',
              '🌿 Continue healthy lifestyle habits'
            ],
            focusArea: 'Maintaining low stress and building resilience reserves'
          },
          medium: {
            statusMessage: '📊 Moderate stress detected. Implement stress reduction protocols.',
            intro: 'Your assessment indicates moderate stress levels. Your arousal markers suggest your nervous system is somewhat activated. Implementing targeted relaxation techniques can help restore balance and prevent escalation to chronic stress.',
            priorityActions: [
              '🌬️ Practice 4-7-8 breathing 3x daily',
              '🧘 Add 15-minute daily meditation',
              '🚫 Reduce caffeine and stimulant intake',
              '🌙 Establish a calming bedtime routine'
            ],
            focusArea: 'Active stress reduction through daily relaxation practices'
          },
          high: {
            statusMessage: '⚠️ High stress markers detected. Prioritize stress reduction immediately.',
            intro: 'Your QEEG reveals elevated stress markers. High HiBeta activity and reduced relaxation capacity indicate your nervous system is in a heightened state. This requires immediate attention to prevent burnout and cognitive decline. Implementing a comprehensive stress reduction protocol is essential.',
            priorityActions: [
              '🆘 Start ANS Reset Protocol immediately',
              '🧘 Daily 20-minute meditation is non-negotiable',
              '🚶 Nature walks for 30+ minutes daily',
              '📵 Implement strict digital boundaries',
              '💤 Prioritize 8+ hours sleep minimum'
            ],
            focusArea: 'Urgent nervous system reset and stress recovery'
          }
        },
        'focus-attention': {
          low: {
            statusMessage: '⚠️ Focus markers need improvement. Attention training is recommended.',
            intro: 'Your QEEG indicates challenges with sustained attention. Elevated frontal Theta and suboptimal Theta:Beta ratio suggest your brain may struggle to maintain focus. Targeted attention training can significantly improve these patterns.',
            priorityActions: [
              '🎯 Start with short 5-minute focus sessions, gradually increase',
              '📵 Eliminate all distractions during work blocks',
              '🧠 Practice single-tasking - one thing at a time',
              '☕ Moderate caffeine use strategically for focus'
            ],
            focusArea: 'Building fundamental attention capacity through structured training'
          },
          medium: {
            statusMessage: '📊 Moderate focus capacity. Targeted training can enhance attention.',
            intro: 'Your attention markers are in the moderate range. Your brain can maintain focus but may drift or fatigue over longer periods. Strengthening these patterns through consistent practice will improve your concentration stamina.',
            priorityActions: [
              '⏱️ Extend focus sessions using Pomodoro technique',
              '🎧 Use focus music or binaural beats',
              '📝 Plan your day the night before',
              '🏃 Exercise before important focus work'
            ],
            focusArea: 'Extending focus duration and reducing attention fatigue'
          },
          high: {
            statusMessage: '✅ Excellent focus markers! Your attention systems are well-tuned.',
            intro: 'Your QEEG shows strong attention patterns! Low frontal Theta and excellent Theta:Beta balance indicate efficient focus systems. Your brain can sustain attention effectively. Focus on leveraging this strength for maximum productivity.',
            priorityActions: [
              '🏆 Take on complex, attention-demanding projects',
              '📈 Optimize your environment for deep work',
              '⚡ Use your focus superpower during peak hours',
              '🧘 Maintain attention strength through meditation'
            ],
            focusArea: 'Leveraging strong focus for peak productivity'
          }
        },
        'burnout-fatigue': {
          low: {
            statusMessage: '✅ Low burnout markers. Your energy systems are healthy.',
            intro: 'Your QEEG shows healthy energy patterns with low burnout indicators. Your brain\'s arousal, relaxation, and delta patterns are well-balanced, indicating good recovery capacity. Maintain your current recovery practices.',
            priorityActions: [
              '✨ Maintain work-life balance',
              '🔋 Continue healthy energy management',
              '📊 Monitor for early fatigue signs',
              '🌟 Build energy reserves for challenging periods'
            ],
            focusArea: 'Maintaining energy health and building reserves'
          },
          medium: {
            statusMessage: '📊 Moderate fatigue indicators. Prioritize recovery.',
            intro: 'Your assessment shows moderate burnout markers. Your brain\'s energy systems are showing signs of strain. Elevated delta activity during wakefulness suggests mental fatigue. Implementing recovery protocols now can prevent progression to burnout.',
            priorityActions: [
              '😴 Increase sleep to 8+ hours',
              '🛑 Reduce workload where possible',
              '🌿 Add restorative activities daily',
              '🚫 Eliminate energy-draining commitments'
            ],
            focusArea: 'Active recovery and workload management'
          },
          high: {
            statusMessage: '⚠️ High burnout markers. Immediate recovery action required.',
            intro: 'Your QEEG reveals significant burnout indicators. Elevated arousal combined with poor relaxation scores and excessive delta suggest your brain is depleted. This is your brain asking for rest. Immediate intervention is critical to prevent long-term damage.',
            priorityActions: [
              '🆘 Consider taking time off if possible',
              '💤 Sleep is your top priority - 9+ hours',
              '🚫 Eliminate all non-essential activities',
              '🧘 Gentle restorative yoga only',
              '🍃 Maximum nature exposure'
            ],
            focusArea: 'Urgent recovery and complete energy restoration'
          }
        },
        'emotional-regulation': {
          low: {
            statusMessage: '⚠️ Emotional regulation markers need support. Targeted training recommended.',
            intro: 'Your QEEG shows patterns associated with emotional regulation challenges. Frontal alpha asymmetry and arousal markers suggest your brain may process emotions with more intensity. Emotional regulation is a skill that can be trained and strengthened.',
            priorityActions: [
              '🧘 Daily meditation focusing on emotional awareness',
              '📝 Start an emotion journal - name and track feelings',
              '🌬️ Practice box breathing during emotional moments',
              '🗣️ Consider working with a therapist or coach'
            ],
            focusArea: 'Building emotional awareness and regulation capacity'
          },
          medium: {
            statusMessage: '📊 Moderate emotional regulation. Refinement can improve stability.',
            intro: 'Your emotional regulation markers are in the moderate range. Your brain manages emotions reasonably well but may be reactive under stress. Fine-tuning these patterns will improve your emotional stability and resilience.',
            priorityActions: [
              '🎭 Practice identifying emotions before reacting',
              '⏸️ Use the STOP technique in challenging moments',
              '🧠 Cognitive reframing exercises',
              '💪 Build distress tolerance through gradual exposure'
            ],
            focusArea: 'Refining emotional response and building resilience'
          },
          high: {
            statusMessage: '✅ Strong emotional regulation markers. Excellent emotional balance.',
            intro: 'Your QEEG shows excellent emotional regulation patterns! Balanced frontal alpha and healthy arousal scores indicate your brain processes emotions efficiently. This is a significant strength that supports overall mental health and relationships.',
            priorityActions: [
              '🌟 Maintain emotional wellness practices',
              '🤝 Use your strength to support others',
              '📈 Explore advanced emotional intelligence training',
              '🧘 Continue mindfulness for emotional maintenance'
            ],
            focusArea: 'Maintaining emotional excellence and supporting others'
          }
        },
        learning: {
          low: {
            statusMessage: '⚠️ Learning markers need enhancement. Focus on foundational improvements.',
            intro: 'Your QEEG indicates learning capacity can be significantly improved. Alpha peak and attention patterns suggest your brain may need support for optimal information processing. The good news is learning ability is highly plastic and responsive to training.',
            priorityActions: [
              '📚 Start with shorter learning sessions (15-20 mins)',
              '🔄 Use spaced repetition for better retention',
              '😴 Prioritize sleep for memory consolidation',
              '🧠 Add brain-supporting supplements'
            ],
            focusArea: 'Building foundational learning capacity'
          },
          medium: {
            statusMessage: '📊 Moderate learning capacity. Optimization can enhance retention.',
            intro: 'Your learning markers are in the moderate range. Your brain can acquire new information but may benefit from optimized learning strategies. Strengthening alpha patterns and focus will enhance your learning efficiency.',
            priorityActions: [
              '🎯 Use active recall instead of passive review',
              '📝 Teach concepts to solidify understanding',
              '🏃 Exercise before learning sessions',
              '🧩 Connect new info to existing knowledge'
            ],
            focusArea: 'Optimizing learning strategies for better retention'
          },
          high: {
            statusMessage: '✅ Excellent learning markers! Your brain is primed for acquisition.',
            intro: 'Your QEEG shows excellent learning capacity! Strong alpha peak and balanced attention patterns indicate your brain is well-equipped for acquiring and retaining new information. Leverage this strength for accelerated growth.',
            priorityActions: [
              '🚀 Take on challenging learning projects',
              '📈 Learn complex skills that interest you',
              '🎓 Consider formal education or certifications',
              '🌟 Share your knowledge through teaching'
            ],
            focusArea: 'Leveraging strong learning capacity for growth'
          }
        },
        creativity: {
          low: {
            statusMessage: '⚠️ Creativity markers need nurturing. Create space for creative expression.',
            intro: 'Your QEEG patterns suggest creative capacity can be enhanced. Relaxation and alpha patterns play a key role in creative thinking. By training your brain to access relaxed, open states, you can unlock greater creative potential.',
            priorityActions: [
              '🎨 Schedule daily unstructured creative time',
              '🚶 Take walks without devices to allow mind-wandering',
              '🧘 Practice meditation to enhance alpha states',
              '📝 Keep an idea journal - capture all ideas without judgment'
            ],
            focusArea: 'Creating space and conditions for creativity'
          },
          medium: {
            statusMessage: '📊 Moderate creativity markers. Nurturing can unlock more potential.',
            intro: 'Your creativity markers are in the moderate range. Your brain shows capacity for creative thinking but may benefit from more opportunities to access divergent thinking states. Creating the right conditions can enhance creative output.',
            priorityActions: [
              '🌈 Expose yourself to diverse experiences and ideas',
              '🔀 Practice brainstorming without self-censorship',
              '🛁 Use "incubation" - step away from problems',
              '🎭 Engage in creative hobbies regularly'
            ],
            focusArea: 'Expanding creative capacity through diverse experiences'
          },
          high: {
            statusMessage: '✅ Strong creativity markers! Your brain excels at innovative thinking.',
            intro: 'Your QEEG shows excellent creativity patterns! Strong relaxation scores and healthy alpha activity indicate your brain can easily access creative, divergent thinking states. This is a powerful strength for innovation and problem-solving.',
            priorityActions: [
              '🚀 Channel creativity into meaningful projects',
              '💡 Use your creative strength for problem-solving',
              '🤝 Collaborate with others to amplify ideas',
              '📚 Maintain creative practices during busy periods'
            ],
            focusArea: 'Channeling strong creativity into meaningful outcomes'
          }
        }
      };

      const paramContent = dynamicContentMap[parameterKey];
      if (!paramContent) return null;

      // For stress and burnout, interpretation is inverted (low score = good)
      const isInvertedParam = parameterKey === 'stress' || parameterKey === 'burnout-fatigue';

      if (isInvertedParam) {
        // For stress/burnout: low score (0-1) = good, high score (3) = bad
        if (scoreLevel === 'low') return paramContent.low; // Low stress = good
        if (scoreLevel === 'medium') return paramContent.medium;
        if (scoreLevel === 'high') return paramContent.high; // High stress = bad
      } else {
        // For other params: high score = good, low score = needs work
        if (scoreLevel === 'low') return paramContent.low;
        if (scoreLevel === 'medium') return paramContent.medium;
        if (scoreLevel === 'high') return paramContent.high;
      }

      return null;
    };

    const dynamicContent = getDynamicContent();

    // Helper to get score-based content from data (supports both new format with low/medium/high and old format with arrays)
    const getScoreBasedContent = (contentData, level = scoreLevel) => {
      if (!contentData) return [];
      // If it's an object with low/medium/high keys, return the appropriate level
      if (contentData.low !== undefined || contentData.medium !== undefined || contentData.high !== undefined) {
        return contentData[level] || contentData.medium || contentData.low || [];
      }
      // Otherwise, return as-is (old format - simple array)
      return contentData;
    };

    // Get the score-based content for this parameter
    const topGoalsContent = getScoreBasedContent(data.topGoals);
    const quickWinsContent = getScoreBasedContent(data.quickWins);
    const coreHabitsContent = getScoreBasedContent(data.coreHabits);
    const environmentTweaksContent = getScoreBasedContent(data.environmentTweaks);
    const keyPerformanceContent = getScoreBasedContent(data.keyPerformance);
    const whatThisMeansContent = data.whatThisMeans ? (data.whatThisMeans[scoreLevel] || data.whatThisMeans.medium || '') : '';

    // Get actual metrics from algorithm results if available
    const getActualMetrics = () => {
      if (!algorithmResults?.data || !Array.isArray(algorithmResults.data)) return null;

      // Key mapping to find the correct parameter
      const paramNameMap = {
        'cognition': ['Cognition'],
        'stress': ['Stress'],
        'focus-attention': ['Focus & Attention', 'Focus and Attention'],
        'burnout-fatigue': ['Burnout & Fatigue', 'Burnout and Fatigue'],
        'emotional-regulation': ['Emotional Regulation'],
        'learning': ['Learning'],
        'creativity': ['Creativity']
      };

      const possibleNames = paramNameMap[parameterKey] || [];
      const matchingParam = algorithmResults.data.find(item => {
        if (!item?.parameter) return false;
        return possibleNames.some(name =>
          item.parameter.toLowerCase() === name.toLowerCase()
        );
      });

      return matchingParam?.metrics || null;
    };

    const actualMetrics = getActualMetrics();

    // Apply patient scores to subParameters if available
    // Use actual metrics data when available, or generate variation scores as fallback
    const dynamicSubParameters = data.subParameters.map((param, idx) => {
      // Try to match with actual metric from algorithm results
      if (actualMetrics && actualMetrics[idx]) {
        const actualMetric = actualMetrics[idx];
        // Format the value for display
        let displayValue = '';
        // Check for Indeterminate values (Infinity/NaN/failed calculations)
        if (actualMetric.value === 'Indeterminate' || (typeof actualMetric.value === 'number' && !isFinite(actualMetric.value))) {
          displayValue = 'Indeterminate';
        } else if (actualMetric.value === null && actualMetric.score === 0) {
          // Legacy: old algorithm returned null for failed calculations
          displayValue = 'Indeterminate';
        } else if (actualMetric.value !== undefined && actualMetric.value !== null) {
          // Parse JSON string if value was serialized (e.g. from Supabase JSONB)
          let metricValue = actualMetric.value;
          if (typeof metricValue === 'string') {
            try { metricValue = JSON.parse(metricValue); } catch (e) { /* keep as string */ }
          }
          if (metricValue === 'Indeterminate') {
            displayValue = 'Indeterminate';
          } else if (typeof metricValue === 'object' && metricValue !== null && (metricValue.fz !== undefined || metricValue.cz !== undefined || metricValue.pz !== undefined)) {
            // Handle Alpha:Theta Balance which has fz, cz, pz values
            displayValue = `fz: ${metricValue.fz}, cz: ${metricValue.cz}, pz: ${metricValue.pz}`;
          } else {
            displayValue = typeof metricValue === 'number' && isFinite(metricValue)
              ? metricValue.toFixed(2)
              : String(metricValue);
          }
        }

        // Generate condition text based on the metric name and value
        let conditionText = actualMetric.condition || '';
        if (!conditionText && displayValue) {
          const metricName = (actualMetric.name || param.name || '').toLowerCase();
          if (metricName.includes('arousal')) {
            conditionText = `${param.name} = ${displayValue} (< 1 is normal)`;
          } else if (metricName.includes('relaxation')) {
            conditionText = `${param.name} = ${displayValue} (> 8 is healthy per spec)`;
          } else if (metricName.includes('alpha modulation') || metricName.includes('regeneration')) {
            conditionText = `Alpha Modulation = ${displayValue} (> 30% is healthy)`;
          } else if (metricName.includes('delta')) {
            conditionText = `${param.name} = ${displayValue}`;
          } else if (metricName.includes('asymmetry')) {
            conditionText = `${param.name} = ${displayValue}`;
          }
        }

        return {
          ...param,
          name: actualMetric.name || param.name,
          score: actualMetric.score === 1 ? 100 : actualMetric.score === 0 ? 30 : actualMetric.score, // Convert 0/1 to percentage
          rawScore: actualMetric.score, // Keep original 0/1 score for gauge positioning
          value: displayValue,
          description: actualMetric.description || param.description,
          condition: conditionText,
          isActualData: true
        };
      }

      // Fallback: Generate score based on main parameter score
      if (hasAssessmentData) {
        const variation = ((idx * 7 + parameterKey.length * 3) % 20) - 10;
        return {
          ...param,
          score: Math.max(0, Math.min(100, Math.round(patientMainScore + variation))),
          isActualData: false
        };
      }

      return { ...param, isActualData: false };
    });

    // Dial component for sub-parameters using SVG gauge
    const ScoreDial = ({ score, label, value, isActualData, condition, rawScore }) => {
      // rawScore: 1 = good (green/left), 0 = bad (red/right)
      // If rawScore is available (0 or 1), use it for binary positioning
      // Otherwise fall back to percentage-based positioning
      let rotation;
      let isGood;

      if (rawScore !== undefined && (rawScore === 0 || rawScore === 1)) {
        // Binary score: 1 = green (-60deg), 0 = red (+60deg)
        rotation = rawScore === 1 ? -60 : 60;
        isGood = rawScore === 1;
      } else {
        // Percentage-based: 0-100 mapped to -90 to +90
        rotation = (score / 100) * 180 - 90;
        isGood = score >= 50;
      }

      const color = isGood ? '#22c55e' : '#ef4444';

      return (
        <div className="flex flex-col items-center">
          {/* Gauge container */}
          <div className="relative" style={{ width: '140px', height: '80px' }}>
            {/* SVG Gauge */}
            <svg
              width="140"
              height="80"
              viewBox="0 0 140 80"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              {/* Green arc (left half - 50%) */}
              <path
                d="M 12 70 A 58 58 0 0 1 70 12"
                fill="none"
                stroke="#22c55e"
                strokeWidth="10"
                strokeLinecap="round"
              />
              {/* Red arc (right half - 50%) */}
              <path
                d="M 70 12 A 58 58 0 0 1 128 70"
                fill="none"
                stroke="#ef4444"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>

            {/* Needle - triangular tapered shape */}
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                left: '70px',
                transformOrigin: 'center bottom',
                transform: `translateX(-50%) rotate(${rotation}deg)`,
                zIndex: 5
              }}
            >
              {/* Triangular needle */}
              <div
                style={{
                  width: '0',
                  height: '0',
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderBottom: '45px solid #1f2937'
                }}
              />
            </div>

            {/* Center base/dot */}
            <div
              style={{
                position: 'absolute',
                bottom: '3px',
                left: '70px',
                width: '14px',
                height: '14px',
                backgroundColor: '#1f2937',
                borderRadius: '50%',
                transform: 'translateX(-50%)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                zIndex: 10
              }}
            />
          </div>
          {value ? (
            <p className="mt-2 text-xs sm:text-sm font-bold" style={{ color }}>Value: {value}</p>
          ) : (
            <p className="mt-2 text-xs sm:text-sm font-bold" style={{ color }}>{score}%</p>
          )}
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center">{label}</p>
          {isActualData && (
            <span className="text-[10px] text-green-500 mt-0.5">● Live Data</span>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-3 sm:space-y-6">
        {/* Header with Icon */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            {/* Left: title + intro + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2.5 sm:space-x-3 mb-2 sm:mb-3">
                <div className="p-2 sm:p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: data.color + '30' }}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: data.color }} />
                </div>
                <h1 className="text-base sm:text-xl font-bold truncate">{data.title}</h1>
              </div>
              <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">{dynamicContent?.intro || data.intro}</p>
              {hasAssessmentData && dataSource && (
                <div className="mt-2 sm:mt-3 inline-flex items-center px-2 sm:px-3 py-1 bg-green-500/20 border border-green-400/30 rounded-full">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full mr-1.5 sm:mr-2 animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs text-green-200">Data from: {dataSource}</span>
                </div>
              )}
              {dynamicContent?.focusArea && (
                <div className="mt-2 sm:mt-2 p-2 bg-white/10 rounded-lg">
                  <p className="text-[11px] sm:text-xs text-blue-200"><span className="font-semibold">Focus Area:</span> {dynamicContent.focusArea}</p>
                </div>
              )}
            </div>
            {/* Overall Score Badge with Color Coding */}
            <div className="text-center flex-shrink-0">
              {(() => {
                const isInverted = parameterKey === 'stress' || parameterKey === 'burnout-fatigue';
                let scoreColor = data.color;
                let scoreStatusLabel = '';

                if (hasAssessmentData && scoreLevel !== 'unknown') {
                  if (isInverted) {
                    if (scoreLevel === 'low') { scoreColor = '#10B981'; scoreStatusLabel = 'Normal'; }
                    else if (scoreLevel === 'medium') { scoreColor = '#F59E0B'; scoreStatusLabel = 'Median'; }
                    else { scoreColor = '#EF4444'; scoreStatusLabel = 'High'; }
                  } else {
                    if (scoreLevel === 'high') { scoreColor = '#10B981'; scoreStatusLabel = 'Normal'; }
                    else if (scoreLevel === 'medium') { scoreColor = '#F59E0B'; scoreStatusLabel = 'Median'; }
                    else { scoreColor = '#EF4444'; scoreStatusLabel = 'Low'; }
                  }
                }

                return (
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="w-14 h-14 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-2xl shadow-lg"
                      style={{ backgroundColor: scoreColor }}
                    >
                      {rawScore !== null ? rawScore : '--'}
                    </div>
                    <p className="text-[10px] sm:text-xs text-blue-200 mt-1">
                      {hasAssessmentData ? 'Your Score' : 'Demo'}
                    </p>
                    {hasAssessmentData && scoreStatusLabel && (
                      <span
                        className="inline-block mt-0.5 sm:mt-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold text-white"
                        style={{ backgroundColor: scoreColor }}
                      >
                        {scoreStatusLabel}
                      </span>
                    )}
                    {assessmentDate && (
                      <p className="text-[9px] sm:text-[10px] text-blue-300 mt-0.5 leading-tight">{assessmentDate}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Brain Region Reference - Motor Dashboard */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-[#CAE0FF]" />
              <span>Brain Region Reference</span>
            </h2>
            <p className="text-blue-200 text-[11px] sm:text-xs mt-1">Where {data.title.toLowerCase()} is processed in your brain</p>
          </div>
          <div className="p-3 sm:p-6">
            <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6">
              {/* Brain Image with Highlighted Region */}
              <div className="relative w-full md:w-1/2 max-w-[220px] sm:max-w-[280px] mx-auto">
                <img
                  src="/patientbrain.png"
                  alt="Brain regions"
                  className="w-full h-auto"
                />
                {/* Single highlighted region indicator for current parameter */}
                {(() => {
                  // Lighten dark theme colors for the brain indicator so it doesn't look like a heavy dot.
                  const lightIndicatorColor = {
                    'cognition': '#93C5FD',              // light blue (was dark indigo #4F46E5)
                    'stress': '#FCA5A5',                 // light red
                    'focus-attention': '#FCD34D',        // light amber
                    'burnout-fatigue': '#FDBA74',        // light orange
                    'emotional-regulation': '#F9A8D4',   // light pink
                    'learning': '#86EFAC',               // light green
                    'creativity': '#C4B5FD'              // light purple
                  }[parameterKey] || data.color;
                  return (
                <div
                  className="absolute w-8 h-8 sm:w-10 sm:h-10 rounded-full animate-pulse border-2 border-white shadow-lg"
                  style={{
                    backgroundColor: lightIndicatorColor,
                    boxShadow: `0 0 12px ${lightIndicatorColor}66`,
                    opacity: 0.7,
                    ...({
                      'cognition': { top: '36%', left: '34%' },
                      'stress': { top: '36%', left: '34%' },
                      'focus-attention': { top: '28%', left: '52%' },
                      'burnout-fatigue': { top: '36%', left: '34%' },
                      'emotional-regulation': { top: '32%', left: '68%' },
                      'learning': { top: '48%', left: '42%' },
                      'creativity': { top: '22%', left: '48%', opacity: 0.45 }
                    }[parameterKey] || { top: '50%', left: '50%' })
                  }}
                />
                  );
                })()}
              </div>

              {/* Region Description */}
              <div className="flex-1 space-y-3 sm:space-y-4 w-full">
                <div className="p-3 sm:p-4 rounded-xl" style={{ backgroundColor: data.color + '15', borderLeft: `4px solid ${data.color}` }}>
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" style={{ backgroundColor: data.color }}></div>
                    {data.brainRegion?.name || data.title + ' Region'}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    {data.brainRegion?.description || `This brain region is primarily responsible for ${data.title.toLowerCase()} functions, including processing, regulation, and optimization of related cognitive activities.`}
                  </p>
                </div>

                {/* Key Brain Areas */}
                <div className="grid grid-cols-2 gap-2">
                  {(data.brainRegion?.areas || [
                    { name: 'Primary Area', role: 'Main processing' },
                    { name: 'Connected Networks', role: 'Supporting functions' }
                  ]).map((area, idx) => (
                    <div key={idx} className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">{area.name}</p>
                      <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white">{area.role}</p>
                    </div>
                  ))}
                </div>

                {/* QEEG Connection */}
                <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                  <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-blue-700 dark:text-blue-300">QEEG Measurement</p>
                    <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                      {data.brainRegion?.qeegNote || `Your ${data.title.toLowerCase()} score is derived from brainwave patterns measured at specific electrode sites corresponding to this region.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <Video className="h-4 w-4 sm:h-5 sm:w-5 text-[#CAE0FF]" />
              <span>Visual Guide</span>
            </h2>
          </div>
          <div className="p-3 sm:p-4">
            {data.videoUrl && !data.videoUrl.includes('placeholder') ? (
              <div className="max-w-2xl mx-auto">
                <div className="aspect-video rounded-xl overflow-hidden shadow-md">
                  <iframe
                    src={data.videoUrl}
                    title={`${data.title} Visual Guide`}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                  <div className="text-center">
                    <Video className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Video content coming soon</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Educational video on {data.title}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sub-Parameters with Dials */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-[#CAE0FF]" />
              <span>Your {data.title} Parameters</span>
            </h2>
            <p className="text-blue-200 text-[10px] sm:text-sm mt-1">
              {hasAssessmentData
                ? `Based on your ${dataSource} (${assessmentDate})`
                : 'Demo scores - Complete assessment for personalized data'}
            </p>
          </div>
          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {dynamicSubParameters.map((param, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 sm:p-5 text-center">
                  <ScoreDial
                    score={param.score}
                    rawScore={param.rawScore}
                    label={param.name}
                    value={param.value}
                    isActualData={param.isActualData}
                    condition={param.condition}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* What This Means - Dynamic based on score */}
        {whatThisMeansContent && (
          <div className={`rounded-xl sm:rounded-2xl shadow-lg overflow-hidden border ${
            scoreLevel === 'high' && (parameterKey !== 'stress' && parameterKey !== 'burnout-fatigue') ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-700' :
            scoreLevel === 'low' && (parameterKey === 'stress' || parameterKey === 'burnout-fatigue') ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-200 dark:border-green-700' :
            scoreLevel === 'medium' ? 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 border-yellow-200 dark:border-yellow-700' :
            'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 border-red-200 dark:border-red-700'
          }`}>
            <div className={`px-3 sm:px-6 py-3 sm:py-4 ${
              scoreLevel === 'high' && (parameterKey !== 'stress' && parameterKey !== 'burnout-fatigue') ? 'bg-green-600 dark:bg-green-700' :
              scoreLevel === 'low' && (parameterKey === 'stress' || parameterKey === 'burnout-fatigue') ? 'bg-green-600 dark:bg-green-700' :
              scoreLevel === 'medium' ? 'bg-yellow-600 dark:bg-yellow-700' :
              'bg-red-600 dark:bg-red-700'
            }`}>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <Info className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>What This Means</span>
              </h2>
            </div>
            <div className="p-3 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{whatThisMeansContent}</p>
            </div>
          </div>
        )}

        {/* High Cognition + Implications Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* High Cognition */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-blue-700 dark:text-blue-400">High {data.title}</h2>
            </div>
            <div className="p-4 sm:p-6 flex-1">
              {data.highDescription && data.highDescription.split('\n\n').map((para, idx) => (
                <p key={idx} className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{para}</p>
              ))}
            </div>
            <div className="flex justify-end px-4 pb-4">
              <span className="text-blue-500 text-xl">➜</span>
            </div>
          </div>

          {/* High Implications */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200">Implications</h2>
            </div>
            <div className="p-3 sm:p-6 space-y-2 sm:space-y-3 flex-1">
              {data.highImplications && data.highImplications.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{item}</span>
                </div>
              ))}
              {!data.highImplications && (
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.implications}</p>
              )}
            </div>
          </div>
        </div>

        {/* Low Cognition + Implications Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Low Cognition */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-blue-700 dark:text-blue-400">Low {data.title}</h2>
            </div>
            <div className="p-4 sm:p-6 flex-1">
              {data.lowDescription && data.lowDescription.split('\n\n').map((para, idx) => (
                <p key={idx} className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{para}</p>
              ))}
            </div>
            <div className="flex justify-end px-4 pb-4">
              <span className="text-blue-500 text-xl">➜</span>
            </div>
          </div>

          {/* Low Implications */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200">Implications</h2>
            </div>
            <div className="p-3 sm:p-6 space-y-2 sm:space-y-3 flex-1">
              {data.lowImplications && data.lowImplications.map((item, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{item}</span>
                </div>
              ))}
              {!data.lowImplications && (
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.implications}</p>
              )}
            </div>
          </div>
        </div>

        {/* How to Improve */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 sm:px-6 py-3 sm:py-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>How to Improve</span>
            </h2>
          </div>
          <div className="p-3 sm:p-6 space-y-2">
            {data.howToImprove && data.howToImprove.map((tip, idx) => (
              <div key={idx} className="flex items-start space-x-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <span className="text-blue-500 mt-0.5 flex-shrink-0 text-xs">●</span>
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{tip}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    );
  };

  // Meditations Section - Guided meditation packs
  const MeditationsSection = () => {
    const [favorites, setFavorites] = useState([]);
    const [expandedPack, setExpandedPack] = useState(null);
    const [meditationStats, setMeditationStats] = useState({
      totalSessions: 0,
      thisWeek: 0,
      streak: 0
    });
    const [purchasedPacks, setPurchasedPacks] = useState([]);
    const [isProcessingPayment, setIsProcessingPayment] = useState(null);
    const [userLocation, setUserLocation] = useState({ country: 'IN', currency: 'INR', symbol: '₹', packPrice: 399, bundlePrice: 1499, bundleOriginal: 2394 });
    const [showMedPaymentModal, setShowMedPaymentModal] = useState(false);
    const [selectedMedPack, setSelectedMedPack] = useState(null);
    const [medPaymentName, setMedPaymentName] = useState('');
    const [medPaymentEmail, setMedPaymentEmail] = useState(user?.email || '');
    const [showMedPaymentSuccessPopup, setShowMedPaymentSuccessPopup] = useState(false);
    const [medPaymentSuccessDetails, setMedPaymentSuccessDetails] = useState(null);
    const [purchasedMedPackId, setPurchasedMedPackId] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [featuredPlaying, setFeaturedPlaying] = useState(false);

    // Audio player state for meditation tracks
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [currentTrackName, setCurrentTrackName] = useState('');
    const [currentTrackImage, setCurrentTrackImage] = useState('');
    const [currentTrackCategory, setCurrentTrackCategory] = useState('');
    const [currentDriveId, setCurrentDriveId] = useState('');
    const [audioError, setAudioError] = useState(false);
    const audioRef = useRef(null);

    // Get Google Drive audio URL via backend proxy
    const getGoogleDriveAudioUrl = (driveId) => {
      if (!driveId) return null;
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      return `${API_URL}/audio/stream/${driveId}`;
    };

    // Play meditation track
  const playMeditationTrack = (pack) => {
  // Logic to handle both Google Drive proxy and direct Supabase URLs
  const audioSource = pack.sourceType === 'supabase' 
    ? pack.supabaseUrl 
    : getGoogleDriveAudioUrl(pack.driveId);

  if (!audioSource) {
    toast.error('Audio track not available yet');
    return;
  }

  setCurrentTrackName(pack.name || 'Meditation Audio');
  setCurrentTrackImage(pack.image || '');
  setCurrentTrackCategory(pack.category || 'Solfeggio Frequencies');
  setCurrentDriveId(pack.driveId || ''); 
  setAudioError(false);
  setIsAudioPlaying(true);

  if (audioRef.current) {
    audioRef.current.src = audioSource; // Point to Supabase directly
    audioRef.current.load();
    audioRef.current.play().catch(err => {
      console.error('Audio play error:', err);
      setAudioError(true);
    });
  }
};

    // Open in Google Drive as fallback
    const openInGoogleDrive = () => {
      if (currentDriveId) {
        window.open(`https://drive.google.com/file/d/${currentDriveId}/view`, '_blank');
        closeAudioPlayer();
      }
    };

    // Audio event handlers
    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const handleTimeUpdate = () => {
        setAudioProgress(audio.currentTime);
      };

      const handleLoadedMetadata = () => {
        setAudioDuration(audio.duration);
        setAudioError(false);
      };

      const handleEnded = () => {
        setIsAudioPlaying(false);
        setAudioProgress(0);
      };

      const handlePlay = () => {
        setAudioError(false);
      };

      const handlePause = () => {
        // Don't set isAudioPlaying to false here to keep popup open
      };

      const handleError = () => {
        console.error('Audio loading error');
        setAudioError(true);
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('play', handlePlay);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('error', handleError);

      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('play', handlePlay);
        audio.removeEventListener('pause', handlePause);
        audio.removeEventListener('error', handleError);
      };
    }, []);

    // Format time for display
    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle progress bar change
    const handleProgressChange = (e) => {
      const newTime = parseFloat(e.target.value);
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
        setAudioProgress(newTime);
      }
    };

    // Close audio player
    const closeAudioPlayer = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsAudioPlaying(false);
      setCurrentTrackName('');
      setCurrentTrackImage('');
      setCurrentTrackCategory('');
      setCurrentDriveId('');
      setAudioProgress(0);
      setAudioDuration(0);
      setAudioError(false);
    };

    // Currency and pricing configuration by country
    const currencyConfig = {
      IN: { currency: 'INR', symbol: '₹', packPrice: 399, bundlePrice: 1499, bundleOriginal: 2394 },
      US: { currency: 'USD', symbol: '$', packPrice: 7.99, bundlePrice: 29.99, bundleOriginal: 47.94 },
      GB: { currency: 'GBP', symbol: '£', packPrice: 6.99, bundlePrice: 24.99, bundleOriginal: 41.94 },
      AE: { currency: 'AED', symbol: 'AED ', packPrice: 29, bundlePrice: 119, bundleOriginal: 174 },
      EU: { currency: 'EUR', symbol: '€', packPrice: 7.49, bundlePrice: 27.99, bundleOriginal: 44.94 },
      DEFAULT: { currency: 'USD', symbol: '$', packPrice: 7.99, bundlePrice: 29.99, bundleOriginal: 47.94 }
    };

    const euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'PL', 'CZ', 'HU', 'SK', 'RO', 'BG', 'HR', 'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'];

    // Detect user location with caching to prevent excessive API calls
    useEffect(() => {
      const detectLocation = async () => {
        // Check localStorage cache first (valid for 24 hours)
        const cached = localStorage.getItem('userLocationData');
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            const hoursSinceCache = (Date.now() - timestamp) / (1000 * 60 * 60);
            if (hoursSinceCache < 24 && data) {
              const config = currencyConfig[data.country] || currencyConfig.DEFAULT;
              setUserLocation({ ...data, ...config });
              return;
            }
          } catch (e) {
            localStorage.removeItem('userLocationData');
          }
        }

        // Default to India if no cache
        setUserLocation({ country: 'IN', countryName: 'India', ...currencyConfig.IN });

        // Try to fetch location in background (non-blocking)
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            let countryCode = data.country_code || 'IN';
            if (euCountries.includes(countryCode)) countryCode = 'EU';
            const locationData = { country: countryCode, countryName: data.country_name || 'Unknown' };
            const config = currencyConfig[countryCode] || currencyConfig.DEFAULT;
            setUserLocation({ ...locationData, ...config });
            // Cache for 24 hours
            localStorage.setItem('userLocationData', JSON.stringify({ data: locationData, timestamp: Date.now() }));
          }
        } catch (error) {
          // Silently fail - already using default India pricing
        }
      };
      detectLocation();
    }, []);

    const formatPrice = (price) => `${userLocation.symbol}${price}`;

    // Fetch purchased meditation packs (silently handle if table doesn't exist)
    const fetchPurchasedPacks = useCallback(async () => {
      if (!user?.email) return;
      try {
        const allIds = [];
        const { data, error } = await supabase
          .from('meditation_purchases')
          .select('meditation_id')
          .eq('patient_email', user.email.toLowerCase());
        if (!error && data) {
          allIds.push(...data.map(p => p.meditation_id).filter(Boolean));
        }
        // Also check patient_payments for meditation type
        const { data: d2 } = await supabase
          .from('patient_payments')
          .select('assessment_id')
          .eq('patient_email', user.email.toLowerCase())
          .eq('type', 'meditation');
        if (d2) {
          allIds.push(...d2.map(p => p.assessment_id).filter(Boolean));
        }
        setPurchasedPacks([...new Set(allIds)]);
      } catch (error) {
        // Silently fail - table may not exist yet
      }
    }, [user?.email]);

    // Open payment modal for meditation pack
    const handlePurchase = (packId, packName, isBundle = false) => {
      if (!user?.email) {
        toast.error('Please log in to make a purchase');
        return;
      }
      const pack = meditationPacks.find(p => p.id === packId);
      setSelectedMedPack(pack || { id: packId, name: packName, price: 0, originalPrice: 0 });
      setMedPaymentEmail(user.email || '');
      setMedPaymentName('');
      setShowMedPaymentModal(true);
    };

    // Process Stripe payment from modal
    const handleMedStripePayment = async () => {
      if (!medPaymentEmail) {
        toast.error('Please enter your email address');
        return;
      }
      if (!selectedMedPack) return;
      setIsProcessingPayment(selectedMedPack.id);
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const response = await fetch(`${API_URL}/create-frequency-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packId: selectedMedPack.id,
            packName: `${selectedMedPack.name} Meditation`,
            customerEmail: medPaymentEmail,
            customerName: medPaymentName.toUpperCase(),
            currency: 'USD',
            amount: selectedMedPack.price,
            successUrl: `${window.location.origin}/dashboard/meditations?meditation_payment=success&pack=${selectedMedPack.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}/dashboard/meditations?meditation_payment=cancelled`
          })
        });
        const data = await response.json();
        if (data.success && data.checkoutUrl) {
          localStorage.setItem('paymentReturnUrl', `/dashboard/meditations?meditation_payment=success&pack=${selectedMedPack.id}`);
          window.location.href = data.checkoutUrl;
        } else {
          toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
        }
      } catch (error) {
        console.error('Payment error:', error);
        toast.error('Something went wrong. Please try again.');
      } finally {
        setIsProcessingPayment(null);
      }
    };

    // Check for successful meditation payment on mount
    useEffect(() => {
      if (!user?.email) return;

      const urlParams = new URLSearchParams(window.location.search);
      let medPayStatus = urlParams.get('meditation_payment');
      let medPackId = urlParams.get('pack');
      let medSessionId = urlParams.get('session_id');

      // Save to localStorage and clear URL
      if (medPayStatus === 'success') {
        localStorage.setItem('pendingMedPayment', JSON.stringify({ packId: medPackId, sessionId: medSessionId }));
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem('paymentReturnUrl');
      }

      // Also check if URL has payment=success (frequency checkout endpoint uses 'payment' not 'meditation_payment')
      const altPayStatus = urlParams.get('payment');
      const altPackId = urlParams.get('pack');
      const altSessionId = urlParams.get('session_id');
      if (altPayStatus === 'success' && altPackId && !medPayStatus) {
        localStorage.setItem('pendingMedPayment', JSON.stringify({ packId: altPackId, sessionId: altSessionId }));
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem('paymentReturnUrl');
      }

      const pending = localStorage.getItem('pendingMedPayment');
      if (!pending) {
        // Handle cancelled
        if (urlParams.get('meditation_payment') === 'cancelled') {
          toast.error('Payment was cancelled');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return;
      }

      const { packId: pId, sessionId: sId } = JSON.parse(pending);
      localStorage.removeItem('pendingMedPayment');

      const medPackNames = {
        gamma: 'Gamma Meditation Music', solfeggio_852: '852Hz Solfeggio Music', solfeggio_963: '963Hz Solfeggio Music'
      };
      const medPackPrices = { gamma: 22, solfeggio_852: 25, solfeggio_963: 25 };
      const packName = medPackNames[pId] || 'Meditation Pack';
      const amount = medPackPrices[pId] || 25;

      // Show success popup immediately and optimistically unlock the pack
      setPurchasedMedPackId(pId);
      setPurchasedPacks(prev => [...new Set([...prev, pId])]);
      setMedPaymentSuccessDetails({
        name: packName, amount: `$${amount} USD`, email: user?.email || '',
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        transactionId: sId || 'N/A'
      });
      setShowMedPaymentSuccessPopup(true);

      // Save payment data in background
      const saveMedPayment = async () => {
        try {
          // Check duplicate
          if (sId) {
            const { data: existing } = await supabase.from('patient_payments').select('id').eq('stripe_session_id', sId).limit(1);
            if (existing && existing.length > 0) return;
          }

          // Get clinic info
          let clinicIdForPayment = null;
          let clinicNameForEmail = '';
          let patientRecord = null;
          if (user?.id) {
            const { data: p } = await supabase.from('patients').select('*').eq('id', user.id).limit(1).single();
            if (p) { patientRecord = p; clinicIdForPayment = p.clinic_id || p.org_id || null; }
          }
          if (!patientRecord && user?.email) {
            const { data: ps } = await supabase.from('patients').select('*').eq('email', user.email.toLowerCase()).order('created_at', { ascending: false }).limit(1);
            if (ps && ps.length > 0) { patientRecord = ps[0]; clinicIdForPayment = ps[0].clinic_id || ps[0].org_id || null; }
          }
          if (clinicIdForPayment) {
            const { data: c } = await supabase.from('clinics').select('name').eq('id', clinicIdForPayment).single();
            clinicNameForEmail = c?.name || '';
          }

          // Save to patient_payments
          await supabase.from('patient_payments').insert({
            clinic_id: clinicIdForPayment, patient_id: user.id || null,
            patient_email: user.email.toLowerCase(),
            patient_name: patientRecord?.full_name || patientRecord?.name || user.name || '',
            amount, currency: 'USD', status: 'completed', type: 'meditation',
            item_name: packName, assessment_id: pId,
            stripe_session_id: sId || null, source: 'Meditations',
            created_at: new Date().toISOString()
          }).then(({ error }) => {
            if (error) console.warn('patient_payments save error:', error.message);
          });

          // Save to meditation_purchases
          await supabase.from('meditation_purchases').insert({
            patient_email: user.email.toLowerCase(), meditation_id: pId,
            stripe_session_id: sId || null, amount_paid: amount, currency: 'USD',
            payment_status: 'completed', purchased_at: new Date().toISOString()
          }).catch(err => console.warn('meditation_purchases save:', err.message));

          // Send emails
          try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            await fetch(`${API_URL}/send-assessment-email`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerEmail: user.email, customerName: patientRecord?.full_name || patientRecord?.name || user.name || '',
                assessmentName: packName, assessmentLink: 'no_link', amountPaid: amount.toFixed(2),
                currency: 'USD', transactionId: sId || '', source: 'patient_dashboard',
                clinicName: clinicNameForEmail, clinicId: clinicIdForPayment || '',
                patientPhone: patientRecord?.phone || '', patientDob: patientRecord?.date_of_birth || '',
                patientGender: patientRecord?.gender || '', patientUid: patientRecord?.external_id || ''
              })
            });
          } catch (emailErr) { console.warn('Email failed:', emailErr.message); }

          // Re-fetch to confirm from DB
          fetchPurchasedPacks();
        } catch (err) { console.error('Error saving meditation payment:', err); }
      };

      saveMedPayment();
    }, [user?.id, user?.email]);

    const meditationPacks = [
      {
        id: 'gamma',
        name: 'Gamma',
        suffix: 'Mediation Music',
        duration: '15-30 min',
        icon: '🧠',
        color: 'from-yellow-600 to-yellow-700',
        category: 'Brainwave Frequencies',
        description: 'Focus, Sharp Memory & Great Intellect. Gamma brainwave brilliance for peak cognitive performance.',
        benefits: ['Sharp memory', 'Great intellect', 'Peak focus', 'Brainwave brilliance'],
        bestTime: 'Important tasks',
        driveId: '13zc55FIM9zThAi06BKy4NC_6nVNFX1Bn',
        image: '/frequency/gamma.png',
        stripeProductId: 'prod_gamma',
        price: 22,
        originalPrice: 49
      },
      {
        id: 'solfeggio_852',
        name: '852Hz Solfeggio',
        suffix: 'Music Frequency',
        duration: '15-30 min',
        icon: '👁️',
        color: 'from-indigo-600 to-purple-700',
        category: 'Solfeggio Frequencies',
        description: 'Raise your awareness and connect with your higher self. Awaken spiritual insight.',
        benefits: ['Raise awareness', 'Higher self connection', 'Spiritual insight', 'Third eye activation'],
        bestTime: 'Spiritual practice',
        driveId: '1vEFc2wuiSkRANWkTozTcH7-Wnni8KkQo',
        image: '/meditation/852 Hz_page-0001.jpg',
        stripeProductId: 'prod_solfeggio_852',
        price: 25,
        originalPrice: 49
      },
      {
        id: 'solfeggio_963',
        name: '963Hz Solfeggio',
        suffix: 'Music Frequency',
        duration: '15-30 min',
        icon: '🔆',
        color: 'from-orange-500 to-red-600',
        category: 'Solfeggio Frequencies',
        description: 'Tap into the infinite and unlock your true potential. Activate pineal gland and divine consciousness.',
        benefits: ['Pineal gland activation', 'Divine consciousness', 'Unlock potential', 'Connect to infinite'],
        bestTime: 'Deep meditation',
        driveId: '14hDaC2Ud7YwDlmX7JEHMVkLNKKmDogP7',
        image: '/meditation/963 Hz_page-0001.jpg',
        stripeProductId: 'prod_solfeggio_963',
        price: 25,
        originalPrice: 49
      }
    ];

    // Fetch meditation data
    useEffect(() => {
      const fetchMeditationData = async () => {
        if (!user?.email) return;

        try {
          const userEmail = user.email.toLowerCase();

          // Get favorites
          const { data: favData } = await supabase
            .from('meditation_favorites')
            .select('meditation_id')
            .eq('patient_email', userEmail);

          if (favData) {
            setFavorites(favData.map(f => f.meditation_id));
          }

          // Get session stats
          const { data: sessionsData } = await supabase
            .from('meditation_sessions')
            .select('*')
            .eq('patient_email', userEmail);

          if (sessionsData) {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const thisWeek = sessionsData.filter(s => new Date(s.created_at) >= weekAgo).length;

            // Calculate streak
            const uniqueDates = [...new Set(sessionsData.map(s => s.session_date))].sort().reverse();
            let streak = 0;
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            if (uniqueDates.length > 0 && (uniqueDates[0] === today || uniqueDates[0] === yesterday)) {
              streak = 1;
              for (let i = 1; i < uniqueDates.length; i++) {
                const diff = (new Date(uniqueDates[i - 1]) - new Date(uniqueDates[i])) / (1000 * 60 * 60 * 24);
                if (diff === 1) streak++;
                else break;
              }
            }

            setMeditationStats({
              totalSessions: sessionsData.length,
              thisWeek,
              streak
            });
          }
        } catch (error) {
          console.error('Error fetching meditation data:', error);
        }
      };

      fetchMeditationData();
      fetchPurchasedPacks();
    }, [user?.email, fetchPurchasedPacks]);

    // Deep-link: scroll to specific meditation pack from care program card click
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const medId = params.get('meditation');
      if (!medId) return;
      setTimeout(() => {
        const el = document.getElementById(`med-pack-${medId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 3000);
        }
      }, 500);
    }, []);

    // Toggle favorite
    const toggleFavorite = async (packId) => {
      if (!user?.email) {
        toast.error('Please log in to save favorites');
        return;
      }

      const isFavorite = favorites.includes(packId);
      const userEmail = user.email.toLowerCase();

      try {
        if (isFavorite) {
          await supabase
            .from('meditation_favorites')
            .delete()
            .eq('patient_email', userEmail)
            .eq('meditation_id', packId);

          setFavorites(prev => prev.filter(id => id !== packId));
          toast.success('Removed from favorites');
        } else {
          await supabase
            .from('meditation_favorites')
            .insert({
              patient_email: userEmail,
              meditation_id: packId
            });

          setFavorites(prev => [...prev, packId]);
          toast.success('Added to favorites!');
        }
      } catch (error) {
        console.error('Error toggling favorite:', error);
      }
    };

    // Log meditation session
    const logSession = async (packId, duration) => {
      if (!user?.email) {
        toast.error('Please log in to track sessions');
        return;
      }

      try {
        await supabase
          .from('meditation_sessions')
          .insert({
            patient_email: user.email.toLowerCase(),
            meditation_id: packId,
            duration_minutes: duration,
            session_date: new Date().toISOString().split('T')[0]
          });

        toast.success('Session logged! Great practice.');
        setMeditationStats(prev => ({
          ...prev,
          totalSessions: prev.totalSessions + 1,
          thisWeek: prev.thisWeek + 1
        }));
      } catch (error) {
        console.error('Error logging session:', error);
      }
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
          <div className="flex items-center space-x-2.5 sm:space-x-4 mb-2 sm:mb-4">
            <div className="bg-white/20 rounded-lg sm:rounded-xl p-2 sm:p-3 flex-shrink-0">
              <Heart className="h-5 w-5 sm:h-8 sm:w-8" />
            </div>
            <div>
              <h1 className="text-base sm:text-2xl font-bold">Meditation</h1>
              <p className="text-blue-200 text-xs sm:text-base">Calm your mind, restore your balance</p>
            </div>
          </div>
          <p className="text-blue-100 text-xs sm:text-base leading-relaxed">
            Meditation helps reduce stress, improve focus, and promote emotional well-being.
            Regular practice can enhance mental clarity and inner peace.
          </p>
        </div>

        {/* Video Previews Section */}
        {(() => {
          const driveEmbed = (id) => `https://drive.google.com/file/d/${id}/preview`;
          const meditationVideos = [
            {
              num: 0, featured: true,
              title: "Dr. Shweta's Introduction to Meditation",
              subtitle: 'Watch before starting your practice',
              embedUrl: driveEmbed('121JXjCmCRQqWUaSBcqdQ2bV1Tst1_skV'),
              thumb: '/meditation-thumbs/thumb-0.jpg',
            },
            { num: 1,  title: 'NEURO KARMA CLEANSING MEDITATION',    embedUrl: driveEmbed('1mforB3qRohL0iMe-_CiwryBbv8vPodsg'), thumb: '/meditation-thumbs/thumb-1.jpg' },
            { num: 2,  title: 'NEURO FOCUS MEDITATION',               embedUrl: driveEmbed('1vo5XhHEUHR-HmGRe4pY-uiyMfmUzeOf2'), thumb: '/meditation-thumbs/thumb-2.jpg' },
            { num: 3,  title: 'NEURO PARKINSON DISEASE MEDITATION',   embedUrl: driveEmbed('1PS4LqFrc4n0S8kUP9_SGuU6xWliKyBIk'), thumb: '/meditation-thumbs/thumb-3.jpg' },
            { num: 4,  title: 'LOVE & RELATIONSHIP MEDITATION',        embedUrl: driveEmbed('1PVopOaJpqFxQjPUsz_dl-ExD1S6u-VGA'), thumb: '/meditation-thumbs/thumb-4.jpg' },
            { num: 5,  title: 'NEURO DEEP REST & MEDITATION',          embedUrl: driveEmbed('1hi-6bI7LPMn_Nlzt-zO4G6pdy3sJrh0J'), thumb: '/meditation-thumbs/thumb-5.jpg' },
            { num: 6,  title: 'NEURO ADOPT RELAX & RESET MEDITATION', embedUrl: driveEmbed('1_AIZlmKKXDYd_fxE4XIklMO9VKHYQ2Ks'), thumb: '/meditation-thumbs/thumb-6.jpg' },
            { num: 7,  title: 'NO ANXIETY - FEEL SAFE MEDITATION',    embedUrl: driveEmbed('1QbfP3bzX4wM1TlxU6qyPF1L7zghbGAsk'), thumb: '/meditation-thumbs/thumb-7.jpg' },
            { num: 8,  title: 'NEURO CANCER HEALING MEDITATION',       embedUrl: driveEmbed('1966GVbRXgDhyZWkzRfXThmmGVisaIdUK'), thumb: '/meditation-thumbs/thumb-8.jpg' },
            { num: 9,  title: 'NEURO MANIFESTATION MEDITATION',        embedUrl: driveEmbed('1cjmrKIC683t42CcJuZvkPug0Ed6GdPCU'), thumb: '/meditation-thumbs/thumb-9.jpg' },
            { num: 10, title: 'NEURO DEPRESSION HEALING MEDITATION',   embedUrl: driveEmbed('1xkTyCTbZ2WMmi3Ose_76xck1bq6Z0GBb'), thumb: '/meditation-thumbs/thumb-10.jpg' },
            { num: 11, title: 'NEURO DEEP SLEEP MEDITATION',           embedUrl: driveEmbed('1AZNpbXzRT_XU9mNIU1pKuZVutUi3fNn9'), thumb: '/meditation-thumbs/thumb-11.jpg' },
          ];
          const featured = meditationVideos[0];
          const rest = meditationVideos.slice(1);
          return (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="bg-[#323956] rounded-lg p-1.5">
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white">Meditation Video Previews</h2>
              </div>

              {/* Dr. Shweta intro — click to play */}
              <div className="rounded-xl overflow-hidden bg-black shadow-lg">
                {featuredPlaying ? (
                  <div className="relative w-full" style={{ height: '360px' }}>
                    <iframe
                      src={featured.embedUrl}
                      className="w-full h-full"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                      title={featured.title}
                    />
                    <button
                      onClick={() => setFeaturedPlaying(false)}
                      className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 z-10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="relative w-full block group"
                    onClick={() => setFeaturedPlaying(true)}
                    style={{ height: '360px' }}
                  >
                    <img
                      src={featured.thumb}
                      alt={featured.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.background = '#1a1f35'; }}
                    />
                    {/* dark overlay */}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
                    {/* play button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-white/90 group-hover:bg-white transition-colors rounded-full p-5 shadow-xl">
                        <svg className="h-10 w-10 text-[#323956]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </button>
                )}
                <div className="bg-gray-900 px-4 py-2.5 flex items-center space-x-2">
                  <svg className="h-4 w-4 text-purple-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <div>
                    <p className="text-white text-sm font-semibold">{featured.title}</p>
                    <p className="text-gray-400 text-xs">{featured.subtitle}</p>
                  </div>
                </div>
              </div>

              {/* 11 Meditation Video Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {rest.map((v) => (
                  <div key={v.num} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow flex flex-col">
                    <div className="relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-700">
                      <img
                        src={v.thumb}
                        alt={v.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-br from-[#323956] to-[#5a6490] hidden items-center justify-center">
                        <span className="text-white/60 text-3xl font-bold">{v.num}</span>
                      </div>
                      <span className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none">{v.num}</span>
                    </div>
                    <div className="p-3 flex flex-col flex-grow">
                      <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-white leading-snug line-clamp-2 flex-grow mb-3">{v.title}</p>
                      <a
                        href="https://sweta8238.graphy.com/products#nav_barv"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[#c9a227] hover:bg-[#b8911f] text-white py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm flex items-center justify-center space-x-1.5 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        <span>Buy Now</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Video Modal */}
        {selectedVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedVideo(null)}>
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-white font-semibold text-sm truncate pr-4">{selectedVideo.title}</p>
                <button onClick={() => setSelectedVideo(null)} className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="relative w-full bg-black" style={{ aspectRatio: '16/9' }}>
                <iframe
                  src={selectedVideo.embedUrl}
                  className="w-full h-full"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  title={selectedVideo.title}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-amber-200 dark:border-amber-700">
          <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2 sm:mb-3 flex items-center space-x-2 text-xs sm:text-base">
            <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Meditation Tips for Best Results</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
            <div className="flex items-start space-x-2 p-2.5 bg-amber-100/50 dark:bg-amber-800/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>Find a quiet, comfortable space where you won't be disturbed</p>
            </div>
            <div className="flex items-start space-x-2 p-2.5 bg-amber-100/50 dark:bg-amber-800/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>Use headphones for the best immersive experience</p>
            </div>
            <div className="flex items-start space-x-2 p-2.5 bg-amber-100/50 dark:bg-amber-800/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>Practice at the same time daily to build a habit</p>
            </div>
            <div className="flex items-start space-x-2 p-2.5 bg-amber-100/50 dark:bg-amber-800/20 rounded-lg">
              <CheckCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>Start with shorter sessions and gradually increase</p>
            </div>
          </div>
        </div>

        {/* Meditation Guide */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">When to Use Each Meditation</h3>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700 dark:text-gray-300">Meditation</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700 dark:text-gray-300">Best For</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700 dark:text-gray-300 hidden sm:table-cell">Best Time</th>
                  <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-700 dark:text-gray-300">Duration</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2 sm:px-3 font-medium text-yellow-600">Gamma</td>
                  <td className="py-2 px-2 sm:px-3">Focus & memory</td>
                  <td className="py-2 px-2 sm:px-3 hidden sm:table-cell">Important tasks</td>
                  <td className="py-2 px-2 sm:px-3">15-30 min</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2 sm:px-3 font-medium text-indigo-600">852 Hz</td>
                  <td className="py-2 px-2 sm:px-3">Spiritual insight</td>
                  <td className="py-2 px-2 sm:px-3 hidden sm:table-cell">Spiritual practice</td>
                  <td className="py-2 px-2 sm:px-3">15-30 min</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 sm:px-3 font-medium text-orange-600">963 Hz</td>
                  <td className="py-2 px-2 sm:px-3">Divine consciousness</td>
                  <td className="py-2 px-2 sm:px-3 hidden sm:table-cell">Deep meditation</td>
                  <td className="py-2 px-2 sm:px-3">15-30 min</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Other Meditation Packs Grid */}
        {meditationPacks.length > 3 && (
        <div>
          <div className="flex items-center space-x-2 mb-3">
            <div className="bg-[#323956] rounded-lg p-1.5">
              <Headphones className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white">Guided Meditations</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-5 auto-rows-fr">
            {meditationPacks.slice(3).map((pack, index) => {
              const actualIndex = index + 3;
              const isFirstCard = actualIndex === 0;
            const isPurchased = purchasedPacks.includes(pack.id);
            const isUnlocked = isFirstCard || isPurchased || pack.isFree;
            const isLocked = !isUnlocked;
            return (
              <div
                key={pack.id}
                className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all flex flex-col h-full"
              >
                {/* Card Image */}
                <div
                  onClick={() => {
                    if (isUnlocked && pack.driveId) {
                      playMeditationTrack(pack);
                    }
                  }}
                  className={`block relative aspect-video overflow-hidden ${isUnlocked ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} transition-opacity`}
                >
                  {pack.image ? (
                    <img
                      src={pack.image}
                      alt={pack.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full bg-gradient-to-r ${pack.color} ${pack.image ? 'hidden' : 'flex'} items-center justify-center`}>
                    <span className="text-white text-2xl font-bold">{pack.name}</span>
                  </div>
                  {/* Lock icon for locked */}
                  {isLocked && (
                    <div className="absolute top-2 right-2 bg-white/90 dark:bg-gray-800/90 rounded-full p-2 shadow-md">
                      <Lock className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </div>
                  )}
                  {/* Unlocked badge for first card */}
                  {isFirstCard && !isPurchased && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>Unlocked</span>
                    </div>
                  )}
                  {/* Purchased badge */}
                  {isPurchased && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>Purchased</span>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-2.5 sm:p-4 flex flex-col flex-grow">
                  <h3 className="text-[11px] sm:text-sm font-semibold text-gray-900 dark:text-white mb-1 min-h-[32px] sm:min-h-[40px] leading-tight">
                    {pack.name} {pack.suffix || 'Binaural Beats'} <span className="text-[9px] sm:text-xs font-normal text-gray-500 dark:text-gray-400">(Headphones)</span>
                  </h3>
                  <div className="mt-auto">
                    {isUnlocked ? (
                      <>
                        {isFirstCard && !isPurchased && (
                          <div className="flex items-center space-x-2 mb-1.5 sm:mb-2">
                            <span className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">Free</span>
                          </div>
                        )}
                        <button
                          onClick={() => playMeditationTrack(pack)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium text-[11px] sm:text-sm flex items-center justify-center space-x-1.5 sm:space-x-2 transition-colors"
                        >
                          <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span>Listen Now</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                          <span className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">${pack.price}</span>
                          <span className="text-[10px] sm:text-sm text-gray-400 line-through">${pack.originalPrice}</span>
                        </div>
                        <button
                          onClick={() => handlePurchase(pack.id, pack.name)}
                          disabled={isProcessingPayment === pack.id}
                          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium text-[11px] sm:text-sm flex items-center justify-center space-x-1.5 sm:space-x-2 transition-colors"
                        >
                          {isProcessingPayment === pack.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="h-4 w-4" />
                              <span>Buy Now</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        </div>
        )}

        {/* Hidden Audio Element */}
        <audio ref={audioRef} preload="metadata" className="hidden" />

        {/* Meditation Payment Success Popup */}
        {showMedPaymentSuccessPopup && medPaymentSuccessDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="h-9 w-9 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
                <p className="text-green-100 text-sm mt-1">Your meditation pack has been unlocked</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500">Meditation Pack</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{medPaymentSuccessDetails.name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500">Amount Paid</span>
                  <span className="text-sm font-semibold text-green-600">{medPaymentSuccessDetails.amount}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500">Email</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate ml-2">{medPaymentSuccessDetails.email}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500">Date & Time</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{medPaymentSuccessDetails.date}, {medPaymentSuccessDetails.time}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-500">Transaction ID</span>
                  <span className="text-xs font-mono text-gray-500 truncate ml-2 max-w-[180px]">{medPaymentSuccessDetails.transactionId}</span>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => {
                    setShowMedPaymentSuccessPopup(false);
                    if (purchasedMedPackId) {
                      const pack = meditationPacks.find(p => p.id === purchasedMedPackId);
                      if (pack && pack.driveId) {
                        playMeditationTrack(pack);
                      }
                      setPurchasedMedPackId(null);
                    }
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-lg transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popup Modal Audio Player */}
        {isAudioPlaying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-purple-500/30 w-full max-w-md overflow-hidden">
              {/* Full Width Image */}
              <div className="relative w-full aspect-video">
                {currentTrackImage ? (
                  <img
                    src={currentTrackImage}
                    alt={currentTrackName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 ${currentTrackImage ? 'hidden' : 'flex'} items-center justify-center`}>
                  <Music className="h-20 w-20 text-white/80" />
                </div>

                {/* Close Button - Top Right */}
                <button
                  onClick={closeAudioPlayer}
                  className="absolute top-3 right-3 text-white bg-black/40 hover:bg-black/60 transition-colors p-2 rounded-full"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Track Info & Controls */}
              <div className="p-5">
                {/* Track Name */}
                <div className="text-center mb-4">
                  <p className="text-white font-bold text-xl">{currentTrackName}</p>
                  <p className="text-purple-300 text-sm">{currentTrackCategory}</p>
                </div>

                {audioError ? (
                  /* Error State - Show fallback button */
                  <div className="text-center">
                    <p className="text-amber-400 text-sm mb-4">
                      Audio streaming unavailable. Click below to listen on Google Drive.
                    </p>
                    <button
                      onClick={openInGoogleDrive}
                      className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-medium flex items-center justify-center space-x-2 mx-auto transition-colors"
                    >
                      <ExternalLink className="h-5 w-5" />
                      <span>Open in Google Drive</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Play/Pause Button */}
                    <div className="flex justify-center mb-4">
                      <button
                        onClick={() => {
                          if (audioRef.current) {
                            if (audioRef.current.paused) {
                              audioRef.current.play().catch(() => setAudioError(true));
                            } else {
                              audioRef.current.pause();
                            }
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-700 rounded-full p-4 transition-colors shadow-lg shadow-purple-500/40"
                      >
                        {audioRef.current && !audioRef.current.paused ? (
                          <Pause className="h-8 w-8 text-white" />
                        ) : (
                          <Play className="h-8 w-8 text-white ml-1" />
                        )}
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center space-x-3">
                      <span className="text-gray-400 text-sm w-12 text-right">{formatTime(audioProgress)}</span>
                      <input
                        type="range"
                        min="0"
                        max={audioDuration || 100}
                        value={audioProgress}
                        onChange={handleProgressChange}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #9333ea ${(audioProgress / (audioDuration || 100)) * 100}%, #374151 ${(audioProgress / (audioDuration || 100)) * 100}%)`
                        }}
                      />
                      <span className="text-gray-400 text-sm w-12">{formatTime(audioDuration)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Tip */}
              <div className="bg-purple-900/30 px-4 py-3 border-t border-purple-500/20">
                <p className="text-purple-300 text-xs text-center flex items-center justify-center space-x-2">
                  <Headphones className="h-3 w-3" />
                  <span>Use headphones for best experience</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stripe Payment Modal */}
        {showMedPaymentModal && selectedMedPack && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowMedPaymentModal(false); setSelectedMedPack(null); }}>
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-t-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <Headphones className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold text-white">Secure Payment</h2>
                    <p className="text-purple-200 text-[10px] sm:text-xs">Powered by Stripe</p>
                  </div>
                </div>
                <button onClick={() => { setShowMedPaymentModal(false); setSelectedMedPack(null); }} className="text-white/70 hover:text-white transition-colors">
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-6">
                {/* Pack Info */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 flex items-center gap-3">
                  {selectedMedPack.image && (
                    <img src={selectedMedPack.image} alt={selectedMedPack.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">{selectedMedPack.name} {selectedMedPack.suffix || 'Meditation'}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{selectedMedPack.category} · {selectedMedPack.duration}</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-gray-400 line-through text-xs">${selectedMedPack.originalPrice}</span>
                      <span className="text-lg sm:text-xl font-bold text-purple-600">${selectedMedPack.price}</span>
                    </div>
                  </div>
                </div>

                {/* Name & Email Form */}
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      <User className="h-4 w-4 text-gray-400" />
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={medPaymentName}
                      onChange={(e) => setMedPaymentName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all uppercase"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                      <Mail className="h-4 w-4 text-gray-400" />
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={medPaymentEmail}
                      onChange={(e) => setMedPaymentEmail(e.target.value)}
                      placeholder="john@example.com"
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Secure badge */}
                <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                  <Lock className="w-4 h-4" />
                  <span>Your payment is secured by Stripe. We never store your card details.</span>
                </div>

                {/* Pay Button */}
                <button
                  onClick={handleMedStripePayment}
                  disabled={isProcessingPayment === selectedMedPack.id || !medPaymentEmail}
                  className="w-full mt-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessingPayment === selectedMedPack.id ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>Pay ${selectedMedPack.price} & Unlock</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200 text-center font-medium">
            <span className="font-semibold">Disclaimer:</span> All meditations presented here are safe to use and highly effective as tested by the Limitless Brain Lab.
          </p>
        </div>
      </div>
    );
  };

  // MOVERS Section - Simple layout with video and care plan info
  const MoversSection = () => {
    // State for dynamic 12-week progress tracking (6 Foundation + 6 Mastery)
    const [moversProgress, setMoversProgress] = useState({
      journeyStartDate: null,
      currentWeek: 1,
      weeks: {
        1: { completed: 0, target: 35, percent: 0 },
        2: { completed: 0, target: 35, percent: 0 },
        3: { completed: 0, target: 35, percent: 0 },
        4: { completed: 0, target: 35, percent: 0 },
        5: { completed: 0, target: 35, percent: 0 },
        6: { completed: 0, target: 35, percent: 0 },
        7: { completed: 0, target: 42, percent: 0 },
        8: { completed: 0, target: 42, percent: 0 },
        9: { completed: 0, target: 42, percent: 0 },
        10: { completed: 0, target: 42, percent: 0 },
        11: { completed: 0, target: 42, percent: 0 },
        12: { completed: 0, target: 42, percent: 0 }
      }
    });

    // Fetch MOVERS progress from database
    const fetchMoversProgress = useCallback(async () => {
      if (!user?.email) return;

      try {
        const { data } = await supabase
          .from('movers_activities')
          .select('activity_date, activity_id, category')
          .eq('patient_email', user.email.toLowerCase())
          .order('activity_date', { ascending: true });

        if (data && data.length > 0) {
          const startDate = new Date(data[0].activity_date);
          const currentWeek = Math.min(
            Math.floor((new Date() - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1,
            12
          );

          // Group activities by week (12 weeks)
          const weeklyData = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
          data.forEach(activity => {
            const daysSinceStart = Math.floor(
              (new Date(activity.activity_date) - startDate) / (24 * 60 * 60 * 1000)
            );
            const week = Math.min(Math.floor(daysSinceStart / 7) + 1, 12);
            if (week >= 1 && week <= 12) weeklyData[week]++;
          });

          // Calculate percentages (Weeks 1-6: 35 target, Weeks 7-12: 42 target)
          const weeks = {};
          for (let w = 1; w <= 12; w++) {
            const target = w <= 6 ? 35 : 42;
            weeks[w] = {
              completed: weeklyData[w],
              target: target,
              percent: Math.min((weeklyData[w] / target) * 100, 100)
            };
          }

          setMoversProgress({ journeyStartDate: startDate, currentWeek, weeks });
        }
      } catch (error) {
        console.error('Error fetching MOVERS progress:', error);
      }
    }, [user?.email]);

    useEffect(() => {
      fetchMoversProgress();
    }, [fetchMoversProgress]);

    return (
      <div className="space-y-3 sm:space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-3 sm:p-6 text-white shadow-xl">
          <div className="flex items-center space-x-2 sm:space-x-4 mb-4">
            <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
              <Activity className="h-10 w-10 text-[#CAE0FF]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold">MOVERS Protocol</h1>
              <p className="text-blue-200 text-xs sm:text-sm">Your Daily Brain Optimization Framework</p>
            </div>
          </div>
          <p className="text-blue-100 leading-relaxed">
            MOVERS is a comprehensive daily protocol designed to optimize your brain function. Each letter represents a key practice for mental clarity, emotional balance, and peak cognitive performance.
          </p>
        </div>

        {/* MOVERS Acronym - Simple Display */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6">
          <h2 className="text-base font-bold text-gray-800 dark:text-white mb-3 sm:mb-6 text-center">The MOVERS Framework</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { letter: 'M', title: 'Meditation', color: '#8B5CF6' },
              { letter: 'O', title: 'Oxygenation | Breathing', color: '#10B981' },
              { letter: 'V', title: 'Vitamins & Supplements', color: '#F59E0B' },
              { letter: 'E', title: 'Exercise | Yoga', color: '#EF4444' },
              { letter: 'R', title: 'Reading affirmations | Chanting', color: '#3B82F6' },
              { letter: 'S', title: 'Supplementary', color: '#6366F1' }
            ].map((item) => (
              <div key={item.letter} className="flex flex-col items-center">
                <div
                  className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center text-white text-xs sm:text-sm md:text-base font-bold shadow-lg"
                  style={{ backgroundColor: item.color }}
                >
                  {item.letter}
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2 text-center max-w-[80px]">{item.title}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Demo Video Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-3 sm:px-6 py-3 sm:py-4">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Video className="h-5 w-5 text-[#CAE0FF]" />
              <span>Movers Video</span>
            </h2>
            <p className="text-blue-200 text-xs sm:text-sm mt-1">Watch and learn how to implement MOVERS</p>
          </div>
          <div className="p-3 sm:p-6">
            <div className="relative rounded-xl overflow-hidden" style={{ minHeight: '300px' }}>
              <iframe
                width="100%"
                height="350"
                src="https://www.youtube.com/embed/Uo5bx0ZPoTU"
                title="Movers Video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-xl"
              ></iframe>
            </div>
          </div>
        </div>

        {/* MOVERS Community - Coming Soon */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#323956] to-[#232D3C] px-3 sm:px-6 py-3 sm:py-4">
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <Users className="h-5 w-5 text-[#CAE0FF]" />
              <span>MOVERS Community</span>
            </h2>
            <p className="text-blue-200 text-xs sm:text-sm mt-1">Connect with fellow MOVERS practitioners</p>
          </div>
          <div className="p-6 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Users className="h-8 w-8 text-[#323956] dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Coming Soon</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Join a community of like-minded individuals committed to brain optimization through the MOVERS protocol. Share progress, tips, and support each other on the journey.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Customized Care Program Section - 8 week MOVERS-based program
  const CustomizedCareProgramSection = () => {
    const [checkedItems, setCheckedItems] = useState({});
    const [currentWeek, setCurrentWeek] = useState(1);
    const [programStartDate, setProgramStartDate] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedParam, setExpandedParam] = useState(null);
    const [selectedParam, setSelectedParam] = useState('P1');

    // Get brain parameter scores from algorithm results
    const getParameterScores = () => {
      if (algorithmResults?.data && Array.isArray(algorithmResults.data)) {
        const scores = {};
        algorithmResults.data.forEach(item => {
          const paramName = item.parameter?.toLowerCase().replace(/[^a-z]/g, '');
          if (paramName) {
            scores[paramName] = item.score || 50;
          }
        });
        return {
          cognition: scores.cognition || 50,
          stress: scores.stress || 50,
          focusattention: scores.focusattention || 50,
          burnoutfatigue: scores.burnoutfatigue || 50,
          emotionalregulation: scores.emotionalregulation || 50,
          learning: scores.learning || 50,
          creativity: scores.creativity || 50
        };
      }
      return {
        cognition: 45,
        stress: 72,
        focusattention: 58,
        burnoutfatigue: 65,
        emotionalregulation: 42,
        learning: 55,
        creativity: 38
      };
    };

    const parameterScores = getParameterScores();

    // Find lowest 4 scores for care blocks
    const getLowestParameters = () => {
      const keyMap = {
        cognition: 'cognition',
        stress: 'stress',
        focusattention: 'focus-attention',
        burnoutfatigue: 'burnout-fatigue',
        emotionalregulation: 'emotional-regulation',
        learning: 'learning',
        creativity: 'creativity'
      };

      const scoredParams = Object.entries(parameterScores).map(([key, score]) => {
        const performanceScore = key === 'stress' ? (100 - score) : score;
        return {
          key: keyMap[key] || key,
          score,
          performanceScore,
          isStress: key === 'stress'
        };
      });

      scoredParams.sort((a, b) => a.performanceScore - b.performanceScore);
      return scoredParams; // Show all 7 parameters sorted from lowest to highest
    };

    const lowestParams = getLowestParameters();

    const parameterLabels = {
      cognition: 'Cognition',
      stress: 'Stress',
      'focus-attention': 'Focus & Attention',
      'burnout-fatigue': 'Burnout & Fatigue',
      'emotional-regulation': 'Emotional Regulation',
      learning: 'Learning',
      creativity: 'Creativity'
    };

    // Detailed MOVERS activities for each parameter (M.O.V.E.R.S = 6 items) with expandable content
    const [expandedMovers, setExpandedMovers] = useState({});

    const getMoversActivities = (paramKey) => {
      const activities = {
        cognition: [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: '10-min focus meditation, alpha wave binaural beats', type: 'Focus Meditation', description: 'A guided meditation designed to enhance mental clarity and concentration using alpha wave frequencies.', link: '/dashboard/meditations?type=focus' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Box breathing before mental tasks, 3 deep breaths hourly', type: 'Box Breathing', description: '4-4-4-4 breathing pattern to increase oxygen flow to the brain and improve cognitive function.', link: '/dashboard/ans-reset?mode=box', practices: [
            { name: 'Nadi Shodhana (Alternate Nostril)', description: 'Balances left and right brain hemispheres, enhances mental clarity and focus.' },
            { name: 'Bhramari (Humming Bee Breath)', description: 'Calms the nervous system and improves concentration through vibrational resonance.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Mental rehearsal of tasks, success visualization', type: 'Task Rehearsal', description: 'Visualize completing tasks successfully to prime your brain for better performance.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: '20-min morning walk, coordination exercises', type: 'Morning Movement', description: 'Light cardio and coordination exercises to boost brain-derived neurotrophic factor (BDNF).', link: '/dashboard/frequencies', practices: [
            { name: 'Surya Namaskar (Sun Salutation)', description: 'A complete body-mind warm-up that improves blood flow to the brain and boosts alertness.' },
            { name: 'Vrikshasana (Tree Pose)', description: 'Enhances balance, focus, and coordination by engaging the prefrontal cortex.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: '30-min challenging reading, chanting for neural activation', type: 'Active Learning & Chanting', description: 'Engage in challenging reading material and chanting practices to build new neural pathways and activate the vagus nerve.', link: '/dashboard/brain-coach', practices: [
            { name: 'Om Chanting', description: 'Produces a vibrational frequency of 432Hz that calms the mind and enhances cognitive clarity.' },
            { name: 'Gayatri Mantra', description: 'Ancient Vedic chant that stimulates the brain\'s learning centers and improves memory retention.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: '7-8 hours sleep, brain dump journaling before bed', type: 'Sleep Optimization', description: 'Quality sleep for memory consolidation with pre-sleep brain dump journaling.', link: '/dashboard/frequencies?type=sleep' }
        ],
        stress: [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: '15-min body scan meditation, 432Hz calming music', type: 'Body Scan Meditation', description: 'A relaxing body scan meditation with 432Hz music to release tension and reduce cortisol.', link: '/dashboard/meditations?type=stress' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: '4-7-8 breathing 3x daily, physiological sigh when stressed', type: '4-7-8 Breathing', description: 'Dr. Andrew Weil\'s breathing technique proven to activate the parasympathetic nervous system.', link: '/dashboard/ans-reset?mode=478', practices: [
            { name: 'Sheetali (Cooling Breath)', description: 'Cools the body and calms the amygdala, reducing the stress response rapidly.' },
            { name: 'Anulom Vilom (Alternate Nostril)', description: 'Balances the sympathetic and parasympathetic nervous systems to lower cortisol.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Safe place visualization, peaceful scene imagery', type: 'Safe Place Imagery', description: 'Create a mental sanctuary to retreat to during stressful moments.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'Gentle yoga, nature walks, no high-intensity when stressed', type: 'Gentle Movement', description: 'Low-intensity movement to release stress without elevating cortisol further.', link: '/dashboard/frequencies', practices: [
            { name: 'Balasana (Child\'s Pose)', description: 'A restorative pose that calms the nervous system and releases tension in the back and shoulders.' },
            { name: 'Viparita Karani (Legs Up the Wall)', description: 'Activates the parasympathetic response and reduces stress hormones naturally.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'Positive affirmations, gratitude journaling, calming chants', type: 'Gratitude & Chanting', description: 'Reframe negative thoughts through gratitude journaling, affirmations, and calming chants that activate the vagus nerve.', link: '/dashboard/brain-coach', practices: [
            { name: 'Om Shanti Chanting', description: 'Rhythmic chanting of Om Shanti creates a deep sense of peace and downregulates the stress response.' },
            { name: 'So Hum Mantra', description: 'A breath-synchronized mantra meaning "I am that" — quiets mental chatter and induces calm.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: '8+ hours sleep, 1-hour screen-free wind-down routine', type: 'Wind-Down Routine', description: 'Extended sleep with proper wind-down to allow stress hormones to normalize.', link: '/dashboard/frequencies?type=sleep' }
        ],
        'focus-attention': [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: 'Concentration meditation, beta wave focus music', type: 'Focus Enhancement', description: 'Beta wave music and concentration meditation to sharpen attention.', link: '/dashboard/meditations?type=focus' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Energizing breath before focus sessions, coffee nap technique', type: 'Energizing Breath', description: 'Quick breathing techniques to boost alertness before deep work sessions.', link: '/dashboard/ans-reset?mode=box', practices: [
            { name: 'Kapalabhati (Skull Shining Breath)', description: 'Rapid exhalations energize the brain and sharpen mental focus instantly.' },
            { name: 'Bhastrika (Bellows Breath)', description: 'Powerful breathing that increases oxygen supply and boosts sustained attention.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Visualize completing tasks, mental time-boxing', type: 'Mental Time-Boxing', description: 'Visualize your work blocks to enhance time management and focus.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'Short burst exercise before focus work, standing desk intervals', type: 'Movement Breaks', description: 'Brief exercise bursts to increase blood flow and sharpen focus.', link: '/dashboard/frequencies', practices: [
            { name: 'Garudasana (Eagle Pose)', description: 'Requires intense concentration and balance, training the brain to sustain focus.' },
            { name: 'Natarajasana (Dancer Pose)', description: 'A challenging balance pose that demands and builds single-point attention.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'Speed reading practice, focus chanting, attention training', type: 'Attention Training & Chanting', description: 'Structured reading, app-based exercises, and focused chanting to strengthen attention span.', link: '/dashboard/brain-coach', practices: [
            { name: 'Trataka Mantra (Focused Chanting)', description: 'Single-point chanting with gaze focus that trains sustained attention and concentration.' },
            { name: 'Beej Mantra (Seed Sounds)', description: 'Short, powerful seed syllable chanting that sharpens mental acuity and focus.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: 'Consistent sleep schedule, no screens 2 hours before bed', type: 'Sleep Schedule', description: 'Maintain consistent sleep/wake times to optimize attention during the day.', link: '/dashboard/frequencies?type=sleep' }
        ],
        'burnout-fatigue': [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: 'Yoga nidra, delta wave sleep music', type: 'Yoga Nidra', description: 'Deep relaxation practice (yogic sleep) for profound rest and recovery.', link: '/dashboard/meditations?type=relaxation' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Gentle breathing, no breath holds, outdoor fresh air', type: 'Gentle Breathing', description: 'Soft, natural breathing without holds to avoid any additional stress on the system.', link: '/dashboard/ans-reset?mode=sigh', practices: [
            { name: 'Diaphragmatic Breathing', description: 'Slow belly breathing that activates the rest-and-digest system without depleting energy.' },
            { name: 'Ujjayi (Ocean Breath)', description: 'Gentle ocean-like breath that soothes the nervous system and restores vitality.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Energy restoration imagery, vacation visualization', type: 'Energy Restoration', description: 'Visualize energy flowing back into your body and mind.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'ONLY gentle movement - walks, stretching, restorative yoga', type: 'Restorative Movement', description: 'Very gentle movement only - avoid anything that depletes energy.', link: '/dashboard/frequencies', practices: [
            { name: 'Shavasana (Corpse Pose)', description: 'Complete relaxation pose that allows the nervous system to reset and energy to restore.' },
            { name: 'Supta Baddha Konasana (Reclined Butterfly)', description: 'Restorative pose that opens the chest and promotes deep relaxation without effort.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'Light reading, gentle chanting, no work-related content', type: 'Leisure & Gentle Chanting', description: 'Enjoyable reading and gentle chanting to rest the mind without stimulation while activating healing vibrations.', link: '/dashboard/brain-coach', practices: [
            { name: 'Om Namah Shivaya', description: 'A gentle, soothing mantra that promotes inner peace and helps release accumulated fatigue.' },
            { name: 'Mahamrityunjaya Mantra', description: 'Known as the healing mantra — promotes rejuvenation and restores vital energy.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: '9+ hours sleep, 20-min power naps, strict work boundaries', type: 'Extended Rest', description: 'Maximum sleep and strategic naps to rebuild depleted energy reserves.', link: '/dashboard/frequencies?type=sleep' }
        ],
        'emotional-regulation': [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: 'Loving-kindness meditation, emotional processing music', type: 'Loving-Kindness', description: 'Metta meditation to cultivate compassion and process difficult emotions.', link: '/dashboard/meditations?type=emotional' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Coherent breathing (5-5), heart-focused breathing', type: 'Heart Coherence', description: '5-second inhale, 5-second exhale pattern to synchronize heart and brain.', link: '/dashboard/ans-reset?mode=box', practices: [
            { name: 'Coherent Breathing (5-5)', description: 'Equal 5-second inhale and exhale synchronizes heart rhythm and stabilizes emotions.' },
            { name: 'Sitali (Cooling Breath)', description: 'Cools emotional reactivity and calms the amygdala for better emotional control.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Emotional reframing, perspective-taking exercises', type: 'Perspective Shift', description: 'Visualize situations from different perspectives to reframe emotional responses.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'Dance, martial arts, any movement that processes emotions', type: 'Emotional Movement', description: 'Movement practices that help process and release stored emotions.', link: '/dashboard/frequencies', practices: [
            { name: 'Bhujangasana (Cobra Pose)', description: 'Opens the heart center and releases stored emotions in the chest and shoulders.' },
            { name: 'Setu Bandhasana (Bridge Pose)', description: 'Activates the heart chakra and promotes emotional balance through gentle backbending.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'EQ books, evening reflection, heart-opening chants', type: 'EQ & Heart Chanting', description: 'Build emotional intelligence through reading, structured reflection, and heart-opening chanting practices.', link: '/dashboard/brain-coach', practices: [
            { name: 'Aham Prema (I Am Love)', description: 'A heart-centered mantra that cultivates self-compassion and emotional resilience.' },
            { name: 'Lokah Samastah Sukhino Bhavantu', description: 'A universal peace chant that expands empathy and emotional regulation capacity.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: 'Dream journaling, worry time before bed, not in bed', type: 'Emotional Processing', description: 'Use sleep for emotional processing with designated worry time before bed.', link: '/dashboard/frequencies?type=sleep' }
        ],
        learning: [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: 'Pre-study meditation, theta wave learning music', type: 'Learning State', description: 'Theta wave music to prime the brain for optimal learning and retention.', link: '/dashboard/meditations?type=focus' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Energizing breath before learning, break for fresh air', type: 'Brain Oxygenation', description: 'Breathing exercises to maximize oxygen delivery to the brain before study sessions.', link: '/dashboard/ans-reset?mode=box', practices: [
            { name: 'Kapalabhati (Skull Shining)', description: 'Rapid exhalations that oxygenate the brain and prepare it for absorbing new information.' },
            { name: 'Surya Bhedana (Right Nostril Breathing)', description: 'Activates the left brain hemisphere associated with analytical thinking and learning.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Memory palace technique, concept mapping visualization', type: 'Memory Palace', description: 'Ancient visualization technique for enhanced memory encoding and recall.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'Cardio before learning sessions, movement breaks', type: 'Learning Movement', description: 'Pre-learning cardio boosts BDNF and enhances neuroplasticity.', link: '/dashboard/frequencies', practices: [
            { name: 'Padmasana (Lotus Pose)', description: 'The classic meditation posture that promotes alertness and groundedness for study sessions.' },
            { name: 'Sarvangasana (Shoulder Stand)', description: 'Increases blood flow to the brain, enhancing memory and learning capacity.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'Teach what you learn, spaced repetition, memory chants', type: 'Active Recall & Chanting', description: 'Teaching others, spaced repetition, and memory-enhancing chanting for long-term retention.', link: '/dashboard/brain-coach', practices: [
            { name: 'Saraswati Mantra', description: 'Dedicated to the goddess of knowledge — chanting enhances memory, learning, and wisdom.' },
            { name: 'Medha Suktam', description: 'A Vedic hymn for intellectual power that stimulates the hippocampus and learning centers.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: 'Review before sleep, sleep-dependent memory consolidation', type: 'Sleep Learning', description: 'Review material before sleep to leverage sleep-dependent memory consolidation.', link: '/dashboard/frequencies?type=sleep' }
        ],
        creativity: [
          { id: 'M', label: 'M', name: 'Meditation | Music', detail: 'Open awareness meditation, ambient creative music', type: 'Open Awareness', description: 'Meditation that opens the mind to creative insights and novel connections.', link: '/dashboard/meditations?type=creativity' },
          { id: 'O', label: 'O', name: 'Oxygenation', detail: 'Relaxed breathing for divergent thinking, nature breathing', type: 'Creative Breathing', description: 'Relaxed breathing patterns that promote divergent thinking.', link: '/dashboard/ans-reset?mode=sigh', practices: [
            { name: 'Bhramari (Humming Bee Breath)', description: 'The humming vibration stimulates the default mode network, unlocking creative flow states.' },
            { name: 'Natural Rhythmic Breathing', description: 'Slow, rhythmic breathing that promotes mind-wandering — the birthplace of creative ideas.' }
          ] },
          { id: 'V', label: 'V', name: 'Visualization', detail: 'Creative visualization, what-if scenarios, mind wandering', type: 'Imagination Play', description: 'Structured daydreaming and what-if scenarios to spark creativity.', link: '/dashboard/meditations?type=visualization' },
          { id: 'E', label: 'E', name: 'Exercise', detail: 'Walking for ideas, playful movement, dance', type: 'Creative Movement', description: 'Movement patterns that stimulate creative thinking (walking, dance).', link: '/dashboard/frequencies', practices: [
            { name: 'Natarajasana (Dancer Pose)', description: 'Embodies the creative energy of Shiva\'s cosmic dance — awakens artistic expression.' },
            { name: 'Free-Flow Yoga Sequence', description: 'Intuitive, unstructured movement that mirrors the creative process of divergent thinking.' }
          ] },
          { id: 'R', label: 'R', name: 'Reading | Chanting', detail: 'Read outside your field, creative prompts, inspirational chants', type: 'Cross-Pollination & Chanting', description: 'Read widely outside your field and use inspirational chanting to create novel connections and stimulate the default mode network.', link: '/dashboard/brain-coach', practices: [
            { name: 'Hari Om Tat Sat', description: 'A cosmic truth mantra that expands awareness and activates the brain\'s creative networks.' },
            { name: 'Maha Mantra (Hare Krishna)', description: 'A joyful, rhythmic chant that elevates mood and opens the mind to creative inspiration.' }
          ] },
          { id: 'S', label: 'S', name: 'Sleep | Processing', detail: 'Capture hypnagogic ideas, dream journaling, creative rest', type: 'Dream Capture', description: 'Harness the creative power of the hypnagogic state and dreams.', link: '/dashboard/frequencies?type=sleep' }
        ]
      };
      return activities[paramKey] || activities.cognition;
    };

    const toggleMoversExpand = (paramKey, itemId) => {
      const key = `${paramKey}-${itemId}`;
      setExpandedMovers(prev => ({
        ...prev,
        [key]: !prev[key]
      }));
    };

    // Get parameter-specific protocol data from P123 structure
    const getParameterProtocolData = () => {
      const ksbProtocol = getCareProtocol(algorithmResults?.data);
      if (!ksbProtocol) return null;

      const protocolData = KSB_27_PROTOCOLS_P123[ksbProtocol.code];
      if (!protocolData) return null;

      return protocolData[selectedParam] || {};
    };

    // Fetch saved progress from database
    useEffect(() => {
      const fetchProgress = async () => {
        if (!user?.email) {
          setIsLoading(false);
          return;
        }

        try {
          const { data, error } = await supabase
            .from('care_program_progress')
            .select('*')
            .eq('patient_email', user.email.toLowerCase())
            .single();

          if (data) {
            setCheckedItems(data.checked_items || {});
            setCurrentWeek(data.current_week || 1);
            setProgramStartDate(data.start_date);
          }
        } catch (error) {
        } finally {
          setIsLoading(false);
        }
      };

      fetchProgress();
    }, [user?.email]);

    // Save progress to database
    const saveProgress = async (newCheckedItems, newWeek) => {
      if (!user?.email) return;

      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('care_program_progress')
          .upsert({
            patient_email: user.email.toLowerCase(),
            checked_items: newCheckedItems,
            current_week: newWeek,
            start_date: programStartDate || new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'patient_email' });

        if (error) throw error;
      } catch (error) {
        console.error('Error saving progress:', error);
        toast.error('Failed to save progress');
      } finally {
        setIsSaving(false);
      }
    };

    const handleCheckboxChange = async (paramKey, itemId) => {
      const newCheckedItems = {
        ...checkedItems,
        [`${paramKey}-${itemId}`]: !checkedItems[`${paramKey}-${itemId}`]
      };
      setCheckedItems(newCheckedItems);
      await saveProgress(newCheckedItems, currentWeek);
      toast.success(newCheckedItems[`${paramKey}-${itemId}`] ? 'Activity completed!' : 'Activity unchecked');
    };

    const startProgram = async () => {
      const startDate = new Date().toISOString();
      setProgramStartDate(startDate);
      setCurrentWeek(1);
      await saveProgress(checkedItems, 1);
      toast.success('Program started! Good luck on your brain health journey!');
    };

    const advanceWeek = async () => {
      if (currentWeek < 8) {
        const newWeek = currentWeek + 1;
        setCurrentWeek(newWeek);
        await saveProgress(checkedItems, newWeek);
        toast.success(`Advanced to Week ${newWeek}!`);
      }
    };

    const getHeaderColor = (param) => {
      if (param.isStress && param.score > 50) {
        return 'bg-gradient-to-r from-red-400 to-red-500';
      }
      if (param.performanceScore < 40) {
        return 'bg-gradient-to-r from-red-400 to-red-500';
      }
      if (param.performanceScore < 60) {
        return 'bg-gradient-to-r from-yellow-400 to-amber-400';
      }
      return 'bg-gradient-to-r from-emerald-400 to-green-500';
    };

    const getStatusText = (param) => {
      if (param.isStress) {
        return param.score > 60 ? 'HIGH STRESS' : param.score > 40 ? 'MODERATE' : 'LOW';
      }
      return param.performanceScore < 40 ? 'NEEDS FOCUS' : param.performanceScore < 60 ? 'MODERATE' : 'GOOD';
    };

    // Calculate completion percentage for a parameter
    const getParamCompletion = (paramKey) => {
      const activities = getMoversActivities(paramKey);
      const completed = activities.filter(a => checkedItems[`${paramKey}-${a.id}`]).length;
      return Math.round((completed / activities.length) * 100);
    };

    // Calculate overall progress
    const getOverallProgress = () => {
      let totalCompleted = 0;
      let totalItems = 0;
      lowestParams.forEach(param => {
        const activities = getMoversActivities(param.key);
        activities.forEach(a => {
          totalItems++;
          if (checkedItems[`${param.key}-${a.id}`]) totalCompleted++;
        });
      });
      return totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;
    };

    const getWeekBlock = (week) => {
      if (week <= 4) return 1;
      return 2;
    };

    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#323956]" />
        </div>
      );
    }

    return (
      <div className="space-y-3 sm:space-y-6">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2.5 sm:space-x-4 min-w-0 flex-1">
              <div className="bg-white/20 rounded-xl p-2 sm:p-3 flex-shrink-0">
                <Target className="h-5 w-5 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-lg font-bold mb-1 sm:mb-2 leading-tight">
                  {patientData?.profile?.name ? `${patientData.profile.name.split(' ')[0]}'s ` : 'Your '}Customized Care Program
                </h1>
                <p className="text-blue-200 text-[11px] sm:text-sm">8 Week MOVERS Program</p>
                <p className="text-blue-100 text-[11px] sm:text-sm mt-1 sm:mt-2 leading-relaxed">
                  Your prescribed Integrative & Comprehensive Care Prescription is ready. Kindly follow the below protocol for a minimum 8 weeks to see a substantial change.
                </p>
                {programStartDate && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="px-2 py-0.5 sm:py-1 bg-green-500/20 text-green-200 rounded-full text-[10px] sm:text-xs">
                      Week {currentWeek} of 8
                    </span>
                    <span className="px-2 py-0.5 sm:py-1 bg-blue-500/20 text-blue-200 rounded-full text-[10px] sm:text-xs">
                      {getWeekBlock(currentWeek) === 1 ? 'Block 1' : 'Block 2'} Phase
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-center bg-white/10 rounded-xl p-2 sm:p-3 flex-shrink-0">
              <div className="text-xl sm:text-3xl font-bold">{getOverallProgress()}%</div>
              <div className="text-[10px] sm:text-xs text-blue-200">Complete</div>
              {getOverallProgress() > 0 && getOverallProgress() < 100 && (
                <div className="mt-1 w-12 sm:w-16 bg-white/20 rounded-full h-1">
                  <div className="bg-green-400 h-1 rounded-full" style={{ width: `${getOverallProgress()}%` }}></div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Disclaimer Card */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              <span className="font-semibold">This protocol is indicative</span> and based on the brain parameters identified in your report, highlighting areas for improvement. For a deeper, fully personalized plan, your Neuro Coach will guide you based on your progress and goals. Consistency and gradual integration of practices are key to optimal results.
            </p>
          </div>
        </div>

        {/* KSB Protocol Card — dynamic care protocol from NeuroSense scan */}
        {(() => {
          const ksbProtocol = getCareProtocol(algorithmResults?.data);
          if (!ksbProtocol) return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
              <div className="text-5xl mb-4">🧠</div>
              <h3 className="text-lg font-semibold text-[#323956] dark:text-white mb-2">Your Personalized Protocol is Not Ready Yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                Your customized care program will be generated once your QEEG brain scan has been processed and analyzed by our team. Please check back after your report is ready.
              </p>
            </div>
          );

          const priorityStyle = {
            CRITICAL: { header: 'bg-red-600', badge: 'bg-red-100 text-red-800' },
            HIGH:     { header: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
            MODERATE: { header: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
            OPTIMAL:  { header: 'bg-emerald-500', badge: 'bg-green-100 text-green-800' },
          };
          const ps = priorityStyle[ksbProtocol.priority] || priorityStyle.MODERATE;
          const priorityEmoji = { CRITICAL: '🚨', HIGH: '⚠️', MODERATE: '📊', OPTIMAL: '✅' };

          // Build modalities based on selected parameter
          let modalities = [];
          const currentSelected = selectedParam || 'P1';
          const paramData = getParameterProtocolData();

          const labels = {
            pranayama: 'Neuro Breathing',
            yogasana: 'Neuro Exercise',
            meditation: 'Meditation',
            binaural: 'Binaural / Music',
            chant: 'Chant',
            supplement: 'Supplements'
          };
          const icons = {
            pranayama: '🌬️',
            yogasana: '🧘',
            meditation: '🧠',
            binaural: '🎵',
            chant: '🕉️',
            supplement: '💊'
          };

          const slugify = (text) => text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          const extractExerciseName = (text) => {
            return text
              .split('\n')[0]
              .split(/\s*[|,]\s*/)[0]
              .replace(/\s*\(.*?\)\s*/g, '')
              .replace(/-[A-Z][a-z].*$/, '')
              .trim();
          };

          const getBinauralLink = (value) => {
            const val = value.toLowerCase();
            if (val.includes('gamma')) return '/dashboard/meditations?meditation=gamma';
            if (val.includes('alpha')) return '/dashboard/frequencies?freq=alpha';
            if (val.includes('beta'))  return '/dashboard/frequencies?freq=beta';
            if (val.includes('theta')) return '/dashboard/frequencies?freq=theta';
            if (val.includes('delta')) return '/dashboard/frequencies?freq=delta';
            const hzMatch = val.match(/(\d{3})\s*hz/);
            if (hzMatch) {
              const hz = hzMatch[1];
              if (['285','396','417','528','639','741'].includes(hz)) return `/dashboard/frequencies?freq=solfeggio_${hz}`;
              if (['852','963'].includes(hz)) return `/dashboard/meditations?meditation=solfeggio_${hz}`;
            }
            return '/dashboard/frequencies';
          };

          const getModalityLink = (key, value) => {
            if (!value) return null;
            switch(key) {
              case 'pranayama': {
                const slug = slugify(extractExerciseName(value));
                return slug ? `/dashboard/ans-reset?video=${slug}` : '/dashboard/ans-reset';
              }
              case 'yogasana': {
                const slug = slugify(extractExerciseName(value));
                return slug ? `/dashboard/ans-reset?video=${slug}` : '/dashboard/ans-reset';
              }
              case 'meditation': {
                return '/dashboard/meditations';
              }
              case 'binaural': {
                return getBinauralLink(value);
              }
              case 'chant': {
                const slug = slugify(extractExerciseName(value));
                return slug ? `/dashboard/ans-reset?video=${slug}` : '/dashboard/ans-reset';
              }
              case 'supplement': {
                return '/dashboard/nootropics';
              }
              default:
                return null;
            }
          };

          if (paramData && Object.keys(paramData).length > 0) {
            Object.entries(paramData).forEach(([key, value]) => {
              if (value) {
                modalities.push({
                  icon: icons[key] || '○',
                  label: labels[key] || key,
                  value: value,
                  link: getModalityLink(key, value)
                });
              }
            });
          } else {
            // Fallback to full protocol if no specific data
            modalities = [
              { icon: '🌬️', label: 'Neuro Breathing', value: ksbProtocol.pranayama, link: getModalityLink('pranayama', ksbProtocol.pranayama) },
              { icon: '🧘', label: 'Neuro Exercise', value: ksbProtocol.yogasana, link: getModalityLink('yogasana', ksbProtocol.yogasana) },
              { icon: '🧠', label: 'Meditation', value: ksbProtocol.meditation, link: getModalityLink('meditation', ksbProtocol.meditation) },
              { icon: '🎵', label: 'Binaural / Music', value: ksbProtocol.binaural, link: getModalityLink('binaural', ksbProtocol.binaural) },
              { icon: '🕉️', label: 'Chant', value: ksbProtocol.chant, link: getModalityLink('chant', ksbProtocol.chant) },
              { icon: '💊', label: 'Supplements', value: `${ksbProtocol.supplement1}\n${ksbProtocol.supplement2}`, link: getModalityLink('supplement', ksbProtocol.supplement1) },
            ];
          }

          // Always include Yoga Nidra as a dedicated item (free for all patients)
          const hasYogaNidra = modalities.some(m => m.value && m.value.toLowerCase().includes('yoga nidra'));
          if (!hasYogaNidra) {
            modalities.push({
              icon: '🌙',
              label: 'Yoga Nidra',
              value: 'Yoga Nidra\n30–40 min · PM',
              link: '/dashboard/meditations?type=relaxation'
            });
          }
          return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Protocol header */}
              <div className={`${ps.header} px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between`}>
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{priorityEmoji[ksbProtocol.priority]}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white font-bold text-sm sm:text-base">Here is Your Customized Care Program</span>
                      {/* <span className="bg-white/20 text-white text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-mono">{ksbProtocol.code}</span> */}
                    </div>
                    {/* <p className="text-white/80 text-[10px] sm:text-xs mt-0.5">{ksbProtocol.priority} Priority · Severity {ksbProtocol.severity}/30</p> */}
                  </div>
                </div>
                <div className="text-center flex-shrink-0 ml-3">
                  <div className="text-white font-bold text-lg sm:text-2xl leading-none">{ksbProtocol.severity}<span className="text-white/60 text-xs">/30</span></div>
                  <div className="text-white/70 text-[10px]">severity</div>
                  <div className="w-12 sm:w-16 bg-white/20 rounded-full h-1 mt-1">
                    <div className="bg-white rounded-full h-1" style={{ width: `${Math.round((ksbProtocol.severity / 30) * 100)}%` }}></div>
                  </div>
                </div>
              </div>
              {/* Clinical description + P1/P2/P3 badges */}
              <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">"{ksbProtocol.description}"</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    onClick={() => setSelectedParam('P1')}
                    className={`text-[10px] sm:text-xs px-2 py-0.5 rounded font-medium cursor-pointer transition-all ${
                      selectedParam === 'P1'
                        ? 'bg-blue-500 text-white dark:bg-blue-600'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                    }`}
                  >
                    P1 Cognition: {ksbProtocol.p1 === 'L' ? 'Low' : ksbProtocol.p1 === 'M' ? 'Medium' : 'High'}
                  </button>
                  <button
                    onClick={() => setSelectedParam('P2')}
                    className={`text-[10px] sm:text-xs px-2 py-0.5 rounded font-medium cursor-pointer transition-all ${
                      selectedParam === 'P2'
                        ? 'bg-purple-500 text-white dark:bg-purple-600'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800'
                    }`}
                  >
                    P2 Stress/Burnout: {ksbProtocol.p2 === 'L' ? 'Low' : ksbProtocol.p2 === 'M' ? 'Medium' : 'High'}
                  </button>
                  <button
                    onClick={() => setSelectedParam('P3')}
                    className={`text-[10px] sm:text-xs px-2 py-0.5 rounded font-medium cursor-pointer transition-all ${
                      selectedParam === 'P3'
                        ? 'bg-pink-500 text-white dark:bg-pink-600'
                        : 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 hover:bg-pink-200 dark:hover:bg-pink-800'
                    }`}
                  >
                    P3 Emotional Reg: {ksbProtocol.p3 === 'L' ? 'Low' : ksbProtocol.p3 === 'M' ? 'Medium' : 'High'}
                  </button>
                </div>
              </div>
              {/* Modality grid */}
              <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {modalities.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => m.link && navigate(m.link)}
                    className="flex items-start space-x-2.5 p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-600 text-left w-full hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 transition-colors cursor-pointer group"
                  >
                    <span className="text-base sm:text-lg flex-shrink-0 mt-0.5">{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">{m.label}</div>
                      <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug whitespace-pre-line">{m.value}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-400 flex-shrink-0 mt-1 transition-colors" />
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-600">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">Protocol by KSB NSB · Based on your NeuroSense Assessment</p>
              </div>
            </div>
          );
        })()}

        {/* Care Blocks - commented out */}
        {false && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 flex items-center space-x-2">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956]" />
            <span>Your Focus Areas (Lowest Scores)</span>
          </h2>

          <div className="space-y-2 sm:space-y-3">
            {lowestParams.map((param, index) => {
              const activities = getMoversActivities(param.key);
              const completion = getParamCompletion(param.key);
              const isExpanded = expandedParam === param.key;

              return (
                <div key={param.key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {/* Parameter Header */}
                  <button
                    onClick={() => setExpandedParam(isExpanded ? null : param.key)}
                    className={`w-full ${getHeaderColor(param)} px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between cursor-pointer`}
                  >
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                      <span className="bg-white/25 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0">
                        {index + 1}
                      </span>
                      <div className="text-left min-w-0">
                        <h3 className="font-bold text-white text-sm sm:text-base truncate">{parameterLabels[param.key]}</h3>
                        <span className="text-white/80 text-[10px] sm:text-xs">Score: {param.score}% • {getStatusText(param)}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-white font-bold text-sm sm:text-base">{completion}%</div>
                        <div className="text-white/70 text-[10px] sm:text-xs">complete</div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-white" />}
                    </div>
                  </button>

                  {/* MOVERS Activities - Expandable (for all low parameters) */}
                  {isExpanded && (
                    <div className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                      {activities.map((item, index) => {
                        const isItemExpanded = expandedMovers[`${param.key}-${item.id}`];
                        return (
                          <div key={item.id}>
                            {/* MOVERS Item Header - Clickable */}
                            <button
                              onClick={() => toggleMoversExpand(param.key, item.id)}
                              className={`w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
                            >
                              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-orange-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center flex-shrink-0">
                                  {item.label}
                                </span>
                                <div className="text-left min-w-0">
                                  <span className="font-medium text-gray-900 dark:text-white text-xs sm:text-sm">
                                    {item.name}
                                  </span>
                                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{item.detail}</p>
                                </div>
                              </div>
                              <ChevronDown className={`h-4 w-4 sm:h-5 sm:w-5 text-gray-400 transition-transform flex-shrink-0 ml-1 ${isItemExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Expanded Content */}
                            {isItemExpanded && (
                              <div className="bg-orange-50 dark:bg-orange-900/20 p-3 sm:p-4 border-l-4 border-orange-500">
                                <div className="mb-2 sm:mb-3">
                                  <span className="text-[10px] sm:text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                                    Recommended Type
                                  </span>
                                  <h4 className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white mt-0.5 sm:mt-1">
                                    {item.type}
                                  </h4>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-3 sm:mb-4 leading-relaxed">
                                  {item.description}
                                </p>

                                {/* Practice Section - Chants, Breath, Yogasanas */}
                                {item.practices && item.practices.length > 0 && (
                                  <div className="mb-3 sm:mb-4 bg-white dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 border border-orange-200 dark:border-orange-700">
                                    <h5 className="text-[10px] sm:text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wider mb-2">
                                      Practice
                                    </h5>
                                    <div className="space-y-2">
                                      {item.practices.map((practice, pIdx) => (
                                        <div key={pIdx} className="flex items-start space-x-2 sm:space-x-3">
                                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-orange-100 dark:bg-orange-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-[10px] sm:text-xs font-bold text-orange-600 dark:text-orange-300">{pIdx + 1}</span>
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{practice.name}</p>
                                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{practice.description}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <a
                                  href={item.link}
                                  className="inline-flex items-center space-x-1.5 sm:space-x-2 bg-orange-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-orange-600 transition-colors text-xs sm:text-sm font-medium"
                                >
                                  <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  <span>Start {item.type}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/dashboard/brain-coach')}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 sm:space-x-2 bg-[#323956] text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl hover:bg-[#232D3C] transition-colors shadow-lg text-xs sm:text-sm font-medium"
          >
            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Book Coach Session</span>
          </button>
        </div>

        {/* Week Completion Message */}
        {programStartDate && currentWeek === 8 && getOverallProgress() >= 80 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-4 sm:p-6 text-white text-center">
            <div className="text-3xl sm:text-4xl mb-2">🎉</div>
            <h3 className="text-base sm:text-xl font-bold mb-1 sm:mb-2">Congratulations!</h3>
            <p className="text-xs sm:text-sm text-green-100">You've completed your 8-Week Care Program! Your brain health journey continues...</p>
          </div>
        )}
      </div>
    );
  };

  // Download NeuroSense Report Section - accessible only after profile completion
  const NeuroSenseReportSection = () => {
    const [showAllReports, setShowAllReports] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

    // Filter out raw EDF/EEG/BDF files and sort latest first
    const neurosenseReports = patientReports
      .filter(report => {
        const fileName = (report.fileName || report.file_name || '').toLowerCase();
        return !fileName.endsWith('.edf') && !fileName.endsWith('.eeg') && !fileName.endsWith('.bdf');
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.created_at || 0);
        const dateB = new Date(b.createdAt || b.created_at || 0);
        return dateB - dateA;
      });

    const totalPages = Math.ceil(neurosenseReports.length / PAGE_SIZE);
    const paginatedReports = neurosenseReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const displayedReports = showAllReports ? paginatedReports : neurosenseReports.slice(0, 1);

    const handleDownload = async (report) => {
      try {
        const rdObj = report.reportData || report.report_data || {};
        const filePath = report.filePath || report.file_path || report.storagePath || rdObj.filePath || rdObj.file_path;
        const directFileUrl = rdObj.fileUrl || rdObj.file_url || report.fileUrl || report.file_url;

        if (!filePath && !directFileUrl) {
          toast.error('File path not found');
          return;
        }

        let fName = report.fileName || report.file_name || rdObj.fileName || rdObj.file_name;
        if (!fName) {
          const p = (filePath || directFileUrl || '').split('/');
          const last = p[p.length - 1];
          if (last && last.includes('.')) fName = last.split('?')[0];
        }
        if (!fName) fName = 'NeuroSense_Report.pdf';

        let downloadUrl = directFileUrl || null;
        if (!downloadUrl && filePath && !filePath.startsWith('/uploads')) {
          try { downloadUrl = await StorageService.getSignedUrl(filePath, 300); } catch (err) { console.log('Signed URL failed:', err.message); }
        }

        if (downloadUrl) {
          const response = await fetch(downloadUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
          toast.success(`Downloading ${fName}`);
        } else {
          toast.error('Could not generate download link');
        }
      } catch (error) {
        console.error('Download error:', error);
        toast.error(getFriendlyErrorMessage(error, 'Download failed. Please try again.'));
      }
    };

    // If profile not completed, show message
    if (!clinicalReport) {
      return (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl p-4 sm:p-6 text-white">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
                <Download className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-xl font-bold leading-tight">Download Neurosense Performance & Other Reports</h2>
                <p className="text-xs sm:text-sm text-white/70 mt-1">Access your brain assessment reports</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
            <div className="flex flex-col items-center gap-3 p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-center">
              <Shield className="h-8 w-8 sm:h-10 sm:w-10 text-amber-500 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Complete Your Profile First</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Please complete your profile to access and download your Neurosense Performance Reports.</p>
              </div>
              <button
                onClick={() => navigate('/dashboard/profile')}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg transition-colors text-xs sm:text-sm font-medium"
              >
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Go to Profile</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl p-4 sm:p-6 text-white">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-white/20 rounded-lg flex-shrink-0">
              <Download className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-bold leading-tight">Download NeuroSense & Other Reports</h2>
              <p className="text-xs sm:text-sm text-white/70 mt-1">Access your brain assessment reports shared by your clinic</p>
            </div>
          </div>
        </div>

        {/* Toggle buttons */}
        {neurosenseReports.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAllReports(false); setCurrentPage(1); }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                !showAllReports
                  ? 'bg-[#323956] text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Latest Report
            </button>
            <button
              onClick={() => { setShowAllReports(true); setCurrentPage(1); }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                showAllReports
                  ? 'bg-[#323956] text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Previous Reports ({neurosenseReports.length})
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-6">
          {neurosenseReports.length > 0 ? (
            <div className="space-y-3">
              {displayedReports.map((report) => {
                const reportData = report.reportData || report.report_data || {};
                const title = reportData.title || report.fileName || report.file_name || 'Neurosense Performance Report';
                const reportType = reportData.reportType || 'Report';
                const createdAt = report.createdAt || report.created_at;
                const isResponse = reportData.isResponseReport;

                return (
                  <div key={report.id} className="flex flex-col gap-3 p-3 sm:p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className="p-1.5 sm:p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                        <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-[#323956] dark:text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {isResponse && (
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">Response Report</span>
                          )}
                        </div>
                        {createdAt && (
                          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(report)}
                      className="w-full sm:w-auto sm:self-start flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#4A6FA5] to-[#323956] hover:from-[#3d5f8f] hover:to-[#282e48] text-white px-4 py-2 sm:py-2.5 rounded-lg transition-all text-xs sm:text-sm font-medium"
                    >
                      <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>Download</span>
                    </button>
                  </div>
                );
              })}

              {/* Pagination — only in Previous Reports tab */}
              {showAllReports && totalPages > 1 && (
                <div className="flex items-center justify-end gap-1 pt-4 border-t border-gray-100 dark:border-gray-700 mt-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${
                        page === currentPage
                          ? 'bg-[#323956] text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8">
              <FileText className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No Reports Available Yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Your Neurosense Performance Reports will appear here once shared by your clinic.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Tabs that require profile completion before access
  const profileGatedTabs = [
    'activity', 'notifications', 'reports', 'resources', 'journey',
    'movers', 'care-program', 'neurocoaching', 'ans-reset', 'frequencies', 'supplements',
    'nootropics', 'five-pillars', 'brain-coach', 'neurofeedback',
    'photobiomodulation', 'brain-courses', 'events', 'wallet',
    'neurosense-overview', 'interactive-brain'
  ];

  const getTabContent = () => {
    // Block all pages except welcome and profile if medical history not completed
    if (!loading && clinicalReport === null && activeTab !== 'welcome' && activeTab !== 'profile') {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="bg-white rounded-2xl shadow-lg border border-amber-200 max-w-md w-full p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Complete Your Medical History</h2>
            <p className="text-gray-600 text-sm mb-6">
              Please complete your clinical history in the Profile section to unlock all dashboard features.
            </p>
            <Link
              to="/dashboard/profile"
              className="inline-flex items-center gap-2 bg-[#323956] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#232D3C] transition-colors"
            >
              <User className="h-4 w-4" />
              Go to Profile
            </Link>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'welcome':
        return <WelcomeSection />;
      case 'profile':
        return <ProfileSection />;
      case 'feedback':
        return <FeedbackSection />;
      case 'reports':
        return <ReportsSection />;
      case 'resources':
        return <ResourcesSection />;
      case 'journey':
        return <JourneySection />;
      case 'book-consultation':
        return <BookConsultationSection />;
      case 'about-brain':
        return <AboutBrainSection />;
      case 'cognition':
        return <BrainParameterSection parameterKey="cognition" />;
      case 'stress':
        return <BrainParameterSection parameterKey="stress" />;
      case 'focus-attention':
        return <BrainParameterSection parameterKey="focus-attention" />;
      case 'burnout-fatigue':
        return <BrainParameterSection parameterKey="burnout-fatigue" />;
      case 'emotional-regulation':
        return <BrainParameterSection parameterKey="emotional-regulation" />;
      case 'learning':
        return <BrainParameterSection parameterKey="learning" />;
      case 'creativity':
        return <BrainParameterSection parameterKey="creativity" />;
      case 'neurosense-reports':
        return <NeuroSenseReportSection />;
      case 'movers':
        return <MoversSection />;
      case 'care-program':
        return <CustomizedCareProgramSection />;
      case 'neurocoaching':
        return <NeuroCoaching />;
      case 'ans-reset':
        return <ANSResetProtocol />;
      case 'frequencies':
        return <FrequenciesMusic />;
      case 'meditations':
        return <MeditationsSection />;
      case 'supplements':
      case 'nootropics':
        return <SupplementsNootropics />;
      case 'five-pillars':
        return <FivePillars />;
      case 'brain-coach':
        return <BrainCoach />;
      case 'my-sessions':
        return <MyBookings showTitle={true} compact={false} />;
      case 'neurofeedback':
        return <HomeNeurofeedback />;
      case 'photobiomodulation':
        return <Photobiomodulation />;
      case 'brain-courses':
        return <BrainCourses />;
      case 'events':
        return <Events />;
      case 'wallet':
        return <WalletPage />;
      case 'neurosense-overview':
        return <OpeningPage />;
      case 'interactive-brain':
        return <InteractiveBrain />;
      default:
        return <WelcomeSection />;
    }
  };

  const renderContent = () => {
    const content = getTabContent();
    // Show content with frozen overlay popup if locked tab
    if (isTabLocked(activeTab)) {
      return (
        <div ref={lockedPopupRef} className="flex flex-col items-center justify-center min-h-[70vh] py-10">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-white/10 rounded-full"></div>
              <div className="absolute -bottom-4 -left-4 w-14 h-14 bg-white/10 rounded-full"></div>
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Feature Locked</h3>
                  <p className="text-amber-100 text-xs">Required to continue</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Brain className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    Your <span className="font-semibold text-amber-600">Neurosense Performance Report</span> has not been generated yet.
                  </p>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                    Please complete your brain scan or contact your clinic to access this feature.
                  </p>
                </div>
              </div>

              {/* Benefits */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 mb-4">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">After your scan you'll unlock:</p>
                <ul className="space-y-1.5">
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Personalized brain parameter scores</span>
                  </li>
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Detailed Neurosense Performance Report download</span>
                  </li>
                  <li className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                    <span>Customized care recommendations</span>
                  </li>
                </ul>
              </div>

              {/* Clinic info */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-5">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Contact your clinic: <span className="font-bold">{patientData?.clinic?.name || 'your clinic'}</span>
                </p>
              </div>

              <Link
                to="/dashboard/welcome"
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Home className="h-4 w-4" />
                Go to Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    if (profileGatedTabs.includes(activeTab)) {
      return <ProfileGate>{content}</ProfileGate>;
    }
    return content;
  };

  // Component to display detailed clinical report information
  const InfoField = ({ label, value }) => (
    <div>
      <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-xs sm:text-sm text-gray-900 dark:text-white">{value || 'N/A'}</p>
    </div>
  );

  return (
    <>
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Header - Professional Navbar */}
      <div className="flex-shrink-0 relative" style={{ background: 'linear-gradient(135deg, #323956 0%, #1e2538 100%)' }}>
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left Section - Logo & Branding */}
            <div className="flex items-center space-x-3">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-1.5 border border-white/10">
                <img
                  src="/IBW Logo.png"
                  alt="NeuroSense Logo"
                  className="h-8 w-8 sm:h-10 sm:w-10 object-contain"
                />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base sm:text-lg font-semibold text-white leading-tight">NeuroSense 360</h1>
                <p className="text-xs text-gray-300">Welcome, <span className="text-white font-medium">{user?.name || 'Patient'}</span></p>
              </div>
              <h1 className="sm:hidden text-base font-semibold text-white">NeuroSense 360</h1>
            </div>

            {/* Right Section - Patient Info & Actions */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Patient ID Card */}
              <div className="hidden sm:flex items-center bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
                <div className="text-right">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Patient ID</p>
                  <p className="text-sm font-semibold text-white tracking-wide">
                    {patientUid || user?.name}
                  </p>
                </div>
              </div>

              {/* User Avatar - Clickable */}
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="relative group focus:outline-none"
                title="Edit Profile"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-white/20 transition-all duration-200 group-hover:border-white/40 group-hover:scale-105" style={{ background: profileImageUrl ? 'transparent' : 'linear-gradient(135deg, #CAE0FF 0%, #E4EFFF 100%)' }}>
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.style.background = 'linear-gradient(135deg, #CAE0FF 0%, #E4EFFF 100%)';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-5 w-5" style={{ color: '#323956' }} />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#323956]"></div>
              </button>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-1.5 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-white/10 hover:bg-red-500/80 backdrop-blur-sm rounded-lg transition-all duration-200 border border-white/10 hover:border-red-400"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Toggle */}
      <div className="flex-shrink-0 lg:hidden bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 sm:py-3">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 hover:text-[#323956] dark:hover:text-white"
        >
          {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="text-sm font-medium">Menu</span>
        </button>
      </div>

      {/* Main Layout with Sidebar */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {/* Left Sidebar - Fixed on mobile, relative on desktop */}
        <aside data-preserve-scroll="true" className={`
          fixed lg:relative inset-y-0 left-0 z-40
          w-[75vw] max-w-[280px] sm:w-64 lg:w-72 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:transform-none
          top-0 h-screen lg:h-full
          flex flex-col
          flex-shrink-0 overflow-hidden
        `}>
          {/* Daily Quote from Dr. Sweta Adatia - Sticky at top */}
          <div className="p-2 sm:p-3 lg:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl p-2.5 sm:p-3 lg:p-4 text-white">
              <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                <Quote className="h-3 sm:h-4 w-3 sm:w-4 text-[#CAE0FF] flex-shrink-0" />
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[#CAE0FF]">Weekly Inspiration</span>
              </div>
              <p className="text-[11px] sm:text-xs italic leading-relaxed mb-1.5 sm:mb-2 line-clamp-3 sm:line-clamp-none">"{getDailyQuote()}"</p>
              <div className="pt-1.5 sm:pt-2 border-t border-white/20 space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-end">
                  <span className="text-[10px] sm:text-xs text-[#CAE0FF] font-medium">— Dr. Sweta Adatia</span>
                </div>
                <div className="flex items-center justify-end space-x-1.5 sm:space-x-2">
                  <a href="https://www.facebook.com/sweta.adatia" target="_blank" rel="noopener noreferrer" className="w-5 h-5 sm:w-6 sm:h-6 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <Facebook className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                  </a>
                  <a href="https://www.youtube.com/@drsweta.adatia" target="_blank" rel="noopener noreferrer" className="w-5 h-5 sm:w-6 sm:h-6 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <svg className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </a>
                  <a href="https://www.linkedin.com/in/drswetaadatia/" target="_blank" rel="noopener noreferrer" className="w-5 h-5 sm:w-6 sm:h-6 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <Linkedin className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                  </a>
                  <a href="https://www.instagram.com/drsweta.adatia/?hl=en" target="_blank" rel="noopener noreferrer" className="w-5 h-5 sm:w-6 sm:h-6 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                    <Instagram className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items - Scrollable */}
          <nav data-preserve-scroll="true" className="flex-1 p-2 sm:p-3 lg:p-4 space-y-0.5 sm:space-y-1 overflow-y-auto custom-scrollbar">
            {/* Medical history incomplete notice */}
            {!loading && clinicalReport === null && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                <p className="text-xs font-semibold text-amber-800">Complete your Medical History</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Go to Profile to fill your clinical history and unlock all features.</p>
              </div>
            )}
            {sidebarItems
              .filter(item => {
                // Before medical history completion, only show Welcome and Profile
                if (!clinicalReport && !loading) {
                  return item.id === 'welcome' || item.id === 'profile';
                }
                return true;
              })
              .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id || (item.subItems && item.subItems.some(sub => activeTab === sub.id));

              // Handle dropdown items (Brain Parameters)
              if (item.isDropdown) {
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setIsBrainParamsExpanded(!isBrainParamsExpanded)}
                      className={`w-full flex items-center justify-between px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 ${
                        isActive
                          ? 'bg-gradient-to-r from-[#323956] to-[#232D3C] text-white shadow-lg'
                          : 'text-gray-600 dark:text-gray-400 hover:text-[#323956] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className={`h-5 w-5 ${isActive ? 'text-[#CAE0FF]' : ''}`} />
                        <span>{item.label}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isBrainParamsExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Sub-items */}
                    <div className={`overflow-hidden transition-all duration-300 ${isBrainParamsExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div className="ml-3 sm:ml-4 mt-1 space-y-0.5 sm:space-y-1 border-l-2 border-gray-200 dark:border-gray-600 pl-3 sm:pl-4">
                        {item.subItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = activeTab === subItem.id;
                          return (
                            <Link
                              key={subItem.id}
                              to={`/dashboard/${subItem.id}`}
                              onClick={() => setIsSidebarOpen(false)}
                              className={`flex items-center space-x-2 sm:space-x-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-all duration-200 ${
                                isSubActive
                                  ? 'bg-[#CAE0FF] text-[#323956] font-semibold'
                                  : 'text-gray-500 dark:text-gray-400 hover:text-[#323956] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <SubIcon className="h-4 w-4" />
                              <span>{subItem.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              // SSO action items — redirect to AiDocal via SSO
              if (item.ssoAction) {
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setIsSidebarOpen(false);
                      import('../../services/ssoService').then(({ openDDO }) => {
                        const slug = import.meta.env.VITE_DDO_DOCTOR_SLUG || 'dr-dr-shweta-adatia-td6s';
                        openDDO(user?.id, user?.email, user?.role, slug);
                      }).catch(() => toast.error('Unable to connect. Please try again.'));
                    }}
                    className="w-full flex items-center justify-between px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 text-gray-600 dark:text-gray-400 hover:text-[#323956] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </button>
                );
              }

              // External path items
              if (item.externalPath) {
                return (
                  <Link
                    key={item.id}
                    to={item.externalPath}
                    onClick={() => setIsSidebarOpen(false)}
                    className="w-full flex items-center justify-between px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 text-gray-600 dark:text-gray-400 hover:text-[#323956] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </Link>
                );
              }

              // Regular menu items
              return (
                <Link
                  key={item.id}
                  to={`/dashboard/${item.id}`}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center justify-between px-2 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-[#323956] to-[#232D3C] text-white shadow-lg'
                      : 'text-gray-600 dark:text-gray-400 hover:text-[#323956] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                    <Icon className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${isActive ? 'text-[#CAE0FF]' : ''}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#CAE0FF] text-[#323956]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Overlay for mobile when sidebar is open */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Main Content - Scrolls independently */}
        <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 lg:p-6 xl:p-8 w-full lg:w-auto">
          <div className="max-w-6xl mx-auto pb-8">
            {renderContent()}
          </div>
        </main>
      </div>

    </div>

    {/* Profile Modal */}
    <ProfileModal
      isOpen={isProfileModalOpen}
      onClose={() => setIsProfileModalOpen(false)}
      onProfileUpdate={async (updatedData) => {

        // Update profile image URL when user uploads new avatar
        if (updatedData.avatar) {
          // Set immediate preview
          setProfileImageUrl(updatedData.avatar);

          // Wait a moment for database to be updated
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Reload from database to ensure we have the saved version
          await reloadProfileImage();

          toast.success('Profile image updated successfully!');
        } else {
          // Still reload to get any other profile updates
          await reloadProfileImage();
        }
      }}
    />


    {/* Clinical Report Form Modal */}
    {showClinicalReportForm && (
      <ClinicalReportForm
        patient={{
          id: user?.id,
          uid: patientUid,
          name: patientData?.profile?.name,
          email: patientData?.profile?.email,
          phone: patientData?.profile?.phone,
          dateOfBirth: patientData?.profile?.dateOfBirth
        }}
        existingReport={clinicalReport}
        onClose={() => {
          setShowClinicalReportForm(false);
          // Re-show popup if clinical report is still not filled
          if (!clinicalReport && activeTab === 'profile') {
            setTimeout(() => setShowClinicalHistoryPopup(true), 300);
          }
        }}
        onSave={async () => {
          setShowClinicalReportForm(false);
          setShowClinicalHistoryPopup(false); // Close popup permanently after saving
          // Refresh clinical report data using user.id (UUID), not patientUid
          if (user?.id) {
            await fetchClinicalReport(user.id);
          }
          toast.success('Clinical report saved successfully!');
        }}
      />
    )}

    {/* Feedback Modal - Rendered at top level to prevent re-mount on state change */}
    {/* Payment Success Popup Modal */}
    {showPaymentSuccessPopup && paymentSuccessDetails && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Green Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-center">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="h-9 w-9 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
            <p className="text-green-100 text-sm mt-1">Your assessment has been unlocked</p>
          </div>

          {/* Details */}
          <div className="p-5 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">Assessment</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{paymentSuccessDetails.name}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">Amount Paid</span>
              <span className="text-sm font-semibold text-green-600">{paymentSuccessDetails.amount}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate ml-2">{paymentSuccessDetails.email}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">Date</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{paymentSuccessDetails.date}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Transaction ID</span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate ml-2 max-w-[180px]">{paymentSuccessDetails.transactionId}</span>
            </div>
          </div>

          {/* Button */}
          <div className="px-5 pb-5">
            <button
              onClick={() => setShowPaymentSuccessPopup(false)}
              className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-lg transition-all"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Scan Required Popup Modal */}
    {showScanRequiredPopup && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Scan Required</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Report not scanned yet. Please complete your EEG scan to view <strong>{scanRequiredParam}</strong> details.
            </p>
            <button
              onClick={() => setShowScanRequiredPopup(false)}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )}

    {showFeedbackModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                <Star className="h-5 w-5 mr-2 text-[#323956]" />
                Share Your Feedback
              </h3>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Rating */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                How would you rate your experience?
              </label>
              <div className="flex space-x-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackData(prev => ({ ...prev, rating: star }))}
                    className={`p-1 transition-colors ${
                      feedbackData.rating >= star
                        ? 'text-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <Star className="h-8 w-8 fill-current" />
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Feedback Category
              </label>
              <select
                value={feedbackData.category}
                onChange={(e) => setFeedbackData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] focus:border-transparent"
              >
                <option value="">Select a category</option>
                <option value="general">General Feedback</option>
                <option value="feature">Feature Request</option>
                <option value="bug">Report an Issue</option>
                <option value="support">Support Experience</option>
                <option value="suggestion">Suggestion</option>
              </select>
            </div>

            {/* Message */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Your Feedback *
              </label>
              <textarea
                value={feedbackData.message}
                onChange={(e) => setFeedbackData(prev => ({ ...prev, message: e.target.value }))}
                rows={4}
                placeholder="Tell us about your experience..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-[#323956] focus:border-transparent resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback}
                className="flex-1 px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#4a5578] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isSubmittingFeedback ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* JotForm Iframe Modal */}
    {activeJotForm && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-[#323956] to-[#232D3C]">
            <h3 className="text-base font-bold text-white flex items-center">
              <FileText className="h-5 w-5 mr-2 text-[#CAE0FF]" />
              {activeJotForm.title}
            </h3>
            <button
              onClick={() => setActiveJotForm(null)}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={activeJotForm.link}
              title={activeJotForm.title}
              className="w-full h-full border-0"
              allow="geolocation; microphone; camera"
            />
          </div>
        </div>
      </div>
    )}

    </>
  );
};

export default PatientDashboard;