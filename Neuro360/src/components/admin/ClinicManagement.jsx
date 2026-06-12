import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Users,
  FileText,
  Calendar,
  MapPin,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle,
  X,
  Key,
  RefreshCw,
  Copy,
  CreditCard,
  UserPlus,
  Shield,
  Settings,
  Power,
  PowerOff,
  Search
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import { supabase } from '../../lib/supabaseClient';
import { hashPassword, isHashed } from '../../utils/passwordUtils';
import AdminAssignmentModal from './AdminAssignmentModal';
import LocationService from '../../services/locationService';
import PendingClinicsNotification from './PendingClinicsNotification';

const ClinicManagement = ({ onUpdate }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [localSearch, setLocalSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [clinics, setClinics] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'details'
  const [loading, setLoading] = useState(true);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isManualPassword, setIsManualPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [isMounted, setIsMounted] = useState(true);
  const [error, setError] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedClinicForAdmin, setSelectedClinicForAdmin] = useState(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  // Delete clinic function
  const deleteClinic = async (clinic, index) => {

    try {
      const clinicName = clinic?.name || `Clinic ${index + 1}`;

      if (!clinic?.id) {
        console.error('ERROR: No clinic ID provided');
        toast.error('Cannot delete: No clinic ID found');
        return;
      }


      // Show confirmation dialog
      const confirmDelete = window.confirm(`Delete "${clinicName}"?\n\nThis action cannot be undone.`);

      if (!confirmDelete) {
        return;
      }


      // Show loading toast
      const loadingToast = toast.loading('Deleting clinic...');

      try {
        // Use DatabaseService.delete to delete the clinic directly
        const deleteResult = await DatabaseService.delete('clinics', clinic.id);

        // Dismiss loading toast
        toast.dismiss(loadingToast);

        toast.success(`${clinicName} deleted successfully`);

        // Reload clinics to refresh the list
        await loadClinics();

        // Trigger refresh to ensure UI is in sync
        if (onUpdate) {
          onUpdate();
        }
      } catch (deleteError) {
        // Dismiss loading toast
        toast.dismiss(loadingToast);
        throw deleteError;
      }

    } catch (error) {
      console.error('Delete error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Clinic data:', clinic);
      console.error('Index:', index);

      // Show detailed error message
      toast.error(getFriendlyErrorMessage(error, 'Failed to delete the clinic. Please try again.'));
    }
  };

  useEffect(() => {
    // Load clinics properly on component mount
    const initializeClinics = async () => {
      try {
        setLoading(true);

        // Load clinics with proper error handling
        await loadClinics(false); // Don't skip cleanup to ensure proper data loading


      } catch (error) {
        console.error('ERROR: Error initializing clinics:', error);
        setClinics([]);
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to ensure database is ready
    const timer = setTimeout(() => {
      initializeClinics();
    }, 100);
    // Cleanup function
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, []);

  // Auto-open clinic details if clinicId is in URL params (e.g. from Quick Action "View All Patients")
  useEffect(() => {
    const clinicIdParam = searchParams.get('clinicId');
    if (clinicIdParam && clinics.length > 0 && viewMode === 'list') {
      const match = clinics.find(c => c.id === clinicIdParam);
      if (match) {
        setSelectedClinic(match);
        setViewMode('details');
      }
    }
  }, [clinics, searchParams]);

  const cleanupDemoData = async () => {
    try {
      
      // Get current clinic data safely
      let clinicsData = [];
      try {
        clinicsData = await DatabaseService.get('clinics') || [];
      } catch (error) {
        console.warn('Could not get clinic data for cleanup:', error);
        return; // Exit safely if we can't get data
      }
      
      
      // Skip cleanup if no data
      if (!Array.isArray(clinicsData) || clinicsData.length === 0) {
        return;
      }
      
      // Identify demo/test clinics
      const demoClinicIndicators = [
        'demo',
        'test',
        'sample',
        'clinic@demo.com',
        'demo@',
        '@demo.com',
        'example.com'
      ];
      
      const realClinics = clinicsData.filter(clinic => {
        // Ensure clinic has required properties
        if (!clinic || typeof clinic !== 'object') {
          return true; // Keep non-object entries (shouldn't happen, but be safe)
        }
        
        const name = String(clinic.name || '').toLowerCase();
        const email = String(clinic.email || '').toLowerCase();
        
        // Check if clinic name or email contains demo indicators
        const isDemo = demoClinicIndicators.some(indicator => 
          name.includes(indicator) || email.includes(indicator)
        );
        
        if (isDemo) {
          return false;
        }
        
        return true;
      });
      
      // If we found demo clinics to remove, update the database
      if (realClinics.length < clinicsData.length) {
        
        try {
          // Only update if component is still mounted
          if (!isMounted) return;
          
          // Clear and repopulate with real clinics only
          localStorage.setItem('clinics', JSON.stringify(realClinics));
          
          // Also update database if available
          if (DatabaseService.usedatabase) {
            // Remove demo clinics from database
            for (const clinic of clinicsData) {
              if (!clinic || !clinic.id) continue; // Skip invalid entries
              
              const name = String(clinic.name || '').toLowerCase();
              const email = String(clinic.email || '').toLowerCase();
              
              const isDemo = demoClinicIndicators.some(indicator => 
                name.includes(indicator) || email.includes(indicator)
              );
              
              if (isDemo) {
                try {
                  await DatabaseService.delete('clinics', clinic.id);
                } catch (error) {
                  console.warn(`Failed to delete demo clinic ${clinic.id} from database:`, error);
                }
              }
            }
          }
          
        } catch (storageError) {
          console.error('Failed to update storage after cleanup:', storageError);
          throw storageError; // Re-throw to let caller handle
        }
      } else {
      }
      
    } catch (error) {
      console.error('ERROR: Demo data cleanup failed:', error);
      throw error; // Re-throw to let caller handle
    }
  };

  const migrateLocalStorageTodatabase = async () => {
    try {
      // Check if database is available
      if (!DatabaseService.usedatabase) {
        return;
      }

      // Check if database already has data
      const existingClinics = await DatabaseService.get('clinics');
      if (existingClinics.length > 0) {
        return;
      }

      // Get localStorage data
      const localStorageData = JSON.parse(localStorage.getItem('clinics') || '[]');
      if (localStorageData.length === 0) {
        return;
      }

      
      // Migrate each clinic
      for (const clinic of localStorageData) {
        try {
          await DatabaseService.add('clinics', clinic);
        } catch (error) {
          console.error('ERROR: Failed to migrate clinic:', clinic.name, error);
        }
      }
      
      
    } catch (error) {
      console.error('ERROR: Migration failed:', error);
    }
  };

  const loadClinics = async (skipCleanup = false) => {
    try {
      
      // Don't clear state immediately - wait until we have new data
      // setClinics([]); // Removed this line to prevent flashing empty state
      
      // Try to migrate localStorage data to database if needed
      await migrateLocalStorageTodatabase();
      
      // Clean demo data after migration (with error protection) - only if explicitly requested
      if (!skipCleanup) {
        try {
          await cleanupDemoData();
        } catch (cleanupError) {
          console.warn('Demo cleanup failed, continuing with normal load:', cleanupError);
        }
      }
      
      // SuperAdmin can see ALL clinics - fetch from database or localStorage
      let clinicsData = [];
      
      try {
        clinicsData = await DatabaseService.get('clinics');
        
        // Additional debug logging
        if (clinicsData && clinicsData.length > 0) {
          console.log('DEBUG: First clinic details:', {
            name: clinicsData[0].name,
            email: clinicsData[0].email,
            id: clinicsData[0].id,
            isActive: clinicsData[0].isActive
          });
          
          // Log all clinics for debugging
          clinicsData.forEach((clinic, index) => {
            console.log(`DEBUG: Clinic ${index + 1}:`, {
              name: clinic.name,
              email: clinic.email,
              id: clinic.id,
              isActive: clinic.isActive,
              isActivated: clinic.isActivated,
              subscriptionStatus: clinic.subscriptionStatus,
              subscription_status: clinic.subscription_status,
              is_active: clinic.is_active,
              reports_allowed: clinic.reports_allowed
            });
          });
        } else {
        }
      } catch (error) {
        console.error('ERROR: Error getting clinics from DatabaseService:', error);
        clinicsData = [];
      }
      
      // Debug: Log raw data
      
      // Ensure clinicsData is an array and contains valid objects
      if (!Array.isArray(clinicsData)) {
        console.warn('WARNING: Clinics data is not an array:', clinicsData);
        clinicsData = [];
      }
      
      // Filter out invalid clinic objects
      clinicsData = clinicsData.filter(clinic => 
        clinic && 
        typeof clinic === 'object' && 
        (clinic.name || clinic.email || clinic.id)
      );
      
      
      // Sort by creation date (newest first)
      const sortedClinics = clinicsData.sort((a, b) => 
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      
      // Only update state if component is still mounted
      if (isMounted) {
        setClinics(sortedClinics);
      }
      
      // Debug: Check for duplicate IDs or missing IDs
      const clinicIds = sortedClinics.map(c => c && c.id || 'unknown-id');
      const uniqueIds = [...new Set(clinicIds)];
      if (clinicIds.length !== uniqueIds.length) {
        console.warn('WARNING: DUPLICATE IDs found!');
      }
      
      // Debug: Check for missing IDs
      const missingIds = sortedClinics.filter(c => !c.id);
      if (missingIds.length > 0) {
        console.warn('WARNING: Clinics without ID found:', missingIds.length);
        
        // Auto-generate IDs for clinics that don't have them
        missingIds.forEach((clinic, index) => {
          if (!clinic.id) {
            clinic.id = `clinic-${Date.now()}-${index}`;
          }
        });
        
        // Save the updated clinics with IDs
        try {
          localStorage.setItem('clinics', JSON.stringify(sortedClinics));
        } catch (error) {
          console.error('ERROR: Failed to save clinics with generated IDs:', error);
        }
      }
      
      // Debug: List all clinic details
      console.table(sortedClinics.map(c => ({
        name: c && c.name || 'Unknown',
        id: c && c.id || 'No ID',
        isActive: c && c.isActive || false,
        isActivated: c && c.isActivated || false,
        email: c && c.email || 'No email'
      })));
    } catch (error) {
      console.error('ERROR: Error loading clinics:', error);
      if (isMounted) {
        toast.error(getFriendlyErrorMessage(error, 'Failed to load clinics. Please try again.'));
        setError(getFriendlyErrorMessage(error, 'Failed to load clinics. Please try again.'));
        // Set empty array to prevent further errors
        setClinics([]);
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const handleCreateClinic = async (data) => {
    try {
      // Each email can only be used once — one clinic OR one partner
      const normalizedEmail = data.email.trim().toLowerCase();
      const emailExists = clinics.some(c => c.email?.toLowerCase() === normalizedEmail);
      if (emailExists) {
        toast.error(`A clinic/partner with email "${data.email}" already exists. Please use a different email.`);
        return;
      }

      const clinicData = {
        ...data,
        clinic_type: data.clinicType || 'lbl_partner', // Snake_case for Supabase
        countryCode: data.countryCode || '+91', // Save country code separately
        phone: data.phone, // Save phone number separately
        contactPerson: data.contactPerson || data.name,
        subscription_status: 'pending', // Clinic must select package & pay before accessing dashboard
        subscriptionStatus: 'pending', // Legacy field
        reports_allowed: 0, // No reports until package is purchased
        reportsAllowed: 0, // Legacy field
        reports_used: 0,
        reportsUsed: 0, // Legacy field
        is_active: true, // Super admin created clinics are pre-approved
        isActive: true, // Legacy field
        isActivated: true, // Super admin created clinics are pre-approved
        trial_start_date: new Date().toISOString(),
        trial_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days trial
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        createdAt: new Date().toISOString(), // Legacy field
        registrationMethod: 'super_admin_created', // Track how this was created
        // contract_agreed not saved — column not yet in DB
        // Use single password field for authentication
        password: await hashPassword(data.password), // Encrypted password for login
        // Remove confirmPassword from stored data
        confirmPassword: undefined
      };

      const createdClinic = await DatabaseService.add('clinics', clinicData);

      // Close modal and reset form immediately after successful creation
      setShowModal(false);
      reset();

      // Send login credentials email to the verified email
      try {
        await sendCredentialsEmail(
          { name: data.name, email: data.email, contactPerson: data.contactPerson || data.name },
          data.password,
          null
        );
        toast.success(`Clinic "${data.name}" created successfully! Login credentials sent to ${data.email}.`, { duration: 5000 });
      } catch (emailError) {
        console.warn('Credentials email failed:', emailError);
        toast.success(`Clinic "${data.name}" created successfully! But failed to send credentials email. Please share credentials manually.`, { duration: 6000 });
      }

      // Reload clinics list (don't await to avoid blocking UI)
      loadClinics().catch(err => {
        console.warn('Warning: Failed to reload clinics list:', err);
      });

      // Call update callback if provided
      if (onUpdate) {
        try {
          onUpdate();
        } catch (callbackError) {
          console.warn('Warning: onUpdate callback failed:', callbackError);
        }
      }

    } catch (error) {
      console.error('ERROR: Failed to create clinic:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to create the clinic. Please try again.'));
    }
  };

  const handleEditClinic = async (data) => {
    try {
      if (!selectedClinic?.id) {
        toast.error('No clinic selected for editing');
        return;
      }

      if (data.editPassword && data.editPassword.length < 8) {
        toast.error('New password must be at least 8 characters');
        return;
      }

      if (data.editPassword && data.editPassword !== data.editConfirmPassword) {
        toast.error('New password and confirm password do not match');
        return;
      }

      const hashedPassword = data.editPassword ? await hashPassword(data.editPassword) : undefined;

      // Keep country code and phone separate
      const updateData = {
        name: data.name,
        clinicType: data.clinicType,
        city: data.city,
        email: data.email,
        contactPerson: data.contactPerson,
        countryCode: data.countryCode || '+91',
        phone: data.phone,
        address: data.address,
        clinic_type: data.clinicType || undefined, // Snake_case for Supabase
        contact_person: data.contactPerson || undefined, // Snake_case for Supabase
        country_code: data.countryCode || '+91', // Snake_case for Supabase
        // contract_agreed not saved — column not yet in DB
        password: hashedPassword || undefined,
        passwordResetAt: hashedPassword ? new Date().toISOString() : undefined
      };


      await DatabaseService.update('clinics', selectedClinic.id, updateData);

      if (hashedPassword) {
        // Send new credentials to clinic email
        try {
          await sendCredentialsEmail(
            { name: data.name, email: data.email, contactPerson: data.contactPerson || data.name },
            data.editPassword,
            null
          );
          toast.success('Clinic updated! New credentials sent to ' + data.email, { duration: 5000 });
        } catch (emailError) {
          toast.success('Clinic and password updated successfully', { duration: 4000 });
          toast.error('Could not send credentials email. Please share password manually.', { duration: 5000 });
        }
      } else {
        toast.success('Clinic updated successfully');
      }

      loadClinics();
      setShowModal(false);
      setSelectedClinic(null);
      reset();
      onUpdate?.();
    } catch (error) {
      toast.error('Error updating clinic');
      console.error(error);
    }
  };

  const handleDeactivateClinic = async (clinicId) => {
    try {
      const clinic = await DatabaseService.findById('clinics', clinicId);
      const newStatus = !clinic.isActive;
      const action = newStatus ? 'activate' : 'deactivate';

      if (window.confirm(`Are you sure you want to ${action} "${clinic.name}"?\n\n${newStatus ? 'Clinic will be able to login and use the system.' : 'Clinic will be unable to login or access the system.'}`)) {

        // Prepare update data
        const updateData = {
          isActive: newStatus,
          is_active: newStatus, // Also update snake_case field for consistency
          updated_at: new Date().toISOString()
        };

        // If activating the clinic, also update subscription status if it's pending_approval
        if (newStatus && (clinic.subscription_status === 'pending_approval' || clinic.subscriptionStatus === 'pending_approval')) {
          updateData.subscription_status = 'trial'; // Change from pending_approval to trial
          updateData.subscriptionStatus = 'trial'; // Legacy field
          updateData.reports_allowed = 10; // Give trial credits
          updateData.reportsAllowed = 10; // Legacy field
          updateData.reports_used = 0; // Reset usage
          updateData.reportsUsed = 0; // Legacy field
          updateData.trial_start_date = new Date().toISOString();
          updateData.trial_end_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days trial
          updateData.activatedAt = new Date().toISOString();
        }

        await DatabaseService.update('clinics', clinicId, updateData);

        const successMessage = newStatus
          ? `Clinic "${clinic.name}" activated successfully! They can now login with their credentials.`
          : `Clinic "${clinic.name}" deactivated successfully.`;

        toast.success(successMessage, {
          duration: 4000
        });
        loadClinics();
        onUpdate?.();
      }
    } catch (error) {
      toast.error('Error updating clinic status');
      console.error('Error in handleDeactivateClinic:', error);
    }
  };

  const handleDeleteClinic = async (clinicId) => {
    
    // Force an alert to ensure the function is being called
    alert(`Delete function called for clinic ID: ${clinicId}`);
    
    if (!clinicId) {
      console.error('ERROR: No clinic ID provided for deletion');
      alert('ERROR: No clinic ID found');
      toast.error('Cannot delete: No clinic ID found');
      return;
    }
    
    const confirmed = window.confirm(`Are you sure you want to delete clinic with ID: ${clinicId}?\n\nThis action cannot be undone.`);
    
    if (confirmed) {
      try {
        
        // First, let's manually check localStorage before deletion
        const currentData = JSON.parse(localStorage.getItem('clinics') || '[]');
        
        const result = await DatabaseService.delete('clinics', clinicId);
        
        // Check localStorage after deletion
        const afterData = JSON.parse(localStorage.getItem('clinics') || '[]');
        
        toast.success('Clinic deleted successfully!');
        await loadClinics();
        onUpdate?.();
      } catch (error) {
        console.error('ERROR: Error during delete operation:', error);
        console.error('Error details:', { 
          message: error.message, 
          stack: error.stack,
          clinicId: clinicId 
        });
        alert(getFriendlyErrorMessage(error, 'Failed to delete the clinic. Please try again.'));
        toast.error(getFriendlyErrorMessage(error, 'Failed to delete the clinic. Please try again.'));
      }
    } else {
      alert('Delete cancelled by user');
    }
  };

  const handleManualActivation = async (clinicId) => {
    if (window.confirm('Manually activate this clinic? This will allow them to login to their clinic portal.')) {
      try {
        // Get clinic details for notification
        const clinic = await DatabaseService.findById('clinics', clinicId);

        // Update local database
        await DatabaseService.update('clinics', clinicId, {
          isActivated: true,
          activatedAt: new Date().toISOString(),
          activationOTP: null,
          otpExpiresAt: null
        });

        // If clinic has Supabase credentials, update their email confirmation status
        if (clinic.supabaseUserId) {
          try {
            // Note: In production, you'd need admin Supabase credentials to update user records
            // For now, we'll rely on the local database authentication fallback
          } catch (supabaseError) {
            console.warn('WARNING: Could not update Supabase profile:', supabaseError);
          }
        }

        toast.success(`Clinic "${clinic.name}" activated successfully! They can now login to their portal.`);
        loadClinics();
        onUpdate?.();

        // Show activation confirmation
        setTimeout(() => {
          toast.success(`EMAIL: Activation notification would be sent to ${clinic.email}`, {
            duration: 3000
          });
        }, 1000);

      } catch (error) {
        toast.error('Error activating clinic');
        console.error(error);
      }
    }
  };

  const handleClinicApproval = async (clinicId) => {
    if (window.confirm('Approve this clinic registration? This will activate their account and give them trial credits.')) {
      try {
        // Get clinic details
        const clinic = await DatabaseService.findById('clinics', clinicId);

        // Update clinic status to approved and activated
        await DatabaseService.update('clinics', clinicId, {
          subscription_status: 'trial', // Change from 'pending_approval' to 'trial'
          is_active: true, // Activate the clinic
          isActivated: true, // Legacy field for compatibility
          reports_allowed: 10, // Give trial credits
          trial_start_date: new Date().toISOString(),
          trial_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days trial
          activatedAt: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        toast.success(`Clinic "${clinic.name}" approved and activated! They now have 10 trial reports and can login.`, {
          duration: 4000
        });

        // Reload clinic list to reflect changes
        loadClinics();
        onUpdate?.();

      } catch (error) {
        toast.error('Error approving clinic registration');
        console.error('Clinic approval error:', error);
      }
    }
  };

  const handleAutoClinicLogin = async (clinic) => {
    try {

      // Create a mock login session for the clinic
      const clinicUser = {
        id: clinic.id,
        email: clinic.email,
        name: clinic.name,
        role: 'clinic_admin',
        avatar: clinic.logo_url || null,
        isActivated: true,
        clinicId: clinic.id,
        token: `auto_login_${Date.now()}`
      };

      // Save to localStorage for session persistence
      localStorage.setItem('neuro360_user', JSON.stringify(clinicUser));
      localStorage.setItem('neuro360_token', clinicUser.token);

      // Show success message
      toast.success(`COMPLETE: Auto-login successful! Redirecting to ${clinic.name} clinic dashboard...`, {
        duration: 2000
      });

      // Redirect to clinic dashboard after short delay
      setTimeout(() => {
        // Redirect to clinic portal (adjust URL as needed)
        window.location.href = '/clinic'; // or '/dashboard' based on your routing
      }, 2000);

    } catch (error) {
      console.error('ERROR: Auto-login failed:', error);
      toast.error('Auto-login failed. Please login manually with clinic credentials.');
    }
  };

  const openModal = (clinic = null) => {
    setSelectedClinic(clinic);
    if (clinic) {
      reset({
        name: clinic.name || '',
        clinicType: clinic.clinicType || clinic.clinic_type || '',
        city: clinic.city || '',
        email: clinic.email || '',
        contactPerson: clinic.contactPerson || clinic.contact_person || '',
        countryCode: clinic.countryCode || clinic.country_code || '+91',
        phone: clinic.phone || clinic.phone_number || '',
        address: clinic.address || '',
      });
    } else {
      reset({});
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClinic(null);
    reset({});
  };

  const viewClinicDetails = (clinic) => {
    setSelectedClinic(clinic);
    setViewMode('details');
  };

  const openAdminAssignment = (clinic) => {
    setSelectedClinicForAdmin(clinic);
    setShowAdminModal(true);
  };

  const generateRandomPassword = () => {
    const length = 8;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  };

  const handlePasswordReset = async (clinic) => {
    setSelectedClinic(clinic);
    setNewPassword('');
    setIsManualPassword(false);
    setOtp('');
    setShowPasswordReset(true);
  };

  const generateNewPassword = () => {
    const password = generateRandomPassword();
    setNewPassword(password);
    setIsManualPassword(false);
  };

  const handleManualPassword = () => {
    setIsManualPassword(true);
    setNewPassword('');
  };

  // Get base URL for API calls
  const getBaseUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    return apiUrl.replace(/\/api\/?$/, '');
  };

  const sendCredentialsEmail = async (clinic, password, otp) => {
    try {
      const BASE_URL = getBaseUrl();

      const response = await fetch(`${BASE_URL}/api/clinic-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName: clinic.name,
          email: clinic.email,
          contactPerson: clinic.contactPerson || clinic.name,
          password: password,
          otp: otp || null
        })
      });

      const data = await response.json();

      if (data.success) {
        return true;
      } else {
        console.error('Email API returned failure:', data.message);
        throw new Error(data.message || 'Failed to send credentials email');
      }
    } catch (error) {
      console.error('Failed to send credentials email:', error);
      throw error;
    }
  };

  const confirmPasswordReset = async () => {
    if (!newPassword.trim()) {
      toast.error('Please enter a password');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const otpCode = generateOTP();
      
      // Update clinic with new password and OTP
      if (!selectedClinic?.id) {
        toast.error('No clinic selected for password reset');
        return;
      }
      const hashedPassword = await hashPassword(newPassword);
      await DatabaseService.update('clinics', selectedClinic.id, {
        password: hashedPassword,
        passwordResetAt: new Date().toISOString(),
        activationOTP: otpCode,
        otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      });

      // Try to send email with credentials and OTP
      try {
        console.log('Sending email with credentials:', {
          clinic: selectedClinic?.name || 'Unknown Clinic',
          email: selectedClinic?.email || 'Unknown Email',
          username: selectedClinic?.email || 'Unknown Email',
          password: newPassword,
          otp: otpCode
        });
        
        await sendCredentialsEmail(selectedClinic, newPassword, otpCode);
        toast.success('SUCCESS: Password set successfully! Credentials and activation OTP sent to clinic email.', {
          duration: 5000
        });
      } catch (emailError) {
        // Email failed, but password was set - show manual delivery option
        toast.error('WARNING: Password set but email failed. Please manually share credentials with clinic.', {
          duration: 8000
        });
        
        // Show credentials in a separate modal or alert for manual delivery
        const credentialsMessage = `
EMAIL DELIVERY FAILED - MANUAL DELIVERY REQUIRED:

Clinic: ${selectedClinic?.name || 'Unknown Clinic'}
Email: ${selectedClinic?.email || 'Unknown Email'}
Username: ${selectedClinic?.email || 'Unknown Email'}
Password: ${newPassword}
OTP: ${otpCode}
Expires: 15 minutes

Please manually share these credentials with the clinic.`;
        
        // Show alert with credentials
        alert(credentialsMessage);
        
        // Also copy to clipboard for easy sharing
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(credentialsMessage);
            toast.success('INFO: Credentials copied to clipboard for manual sharing');
          } else {
            // Fallback for non-secure context
            const textArea = document.createElement('textarea');
            textArea.value = credentialsMessage;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            toast.success('INFO: Credentials copied to clipboard (fallback)');
          }
        } catch (clipboardError) {
          console.warn('Could not copy to clipboard:', clipboardError);
          toast.info('NOTE: Please manually copy the credentials from the alert above');
        }
      }
      
      setShowPasswordReset(false);
      setNewPassword('');
      setSelectedClinic(null);
      setIsManualPassword(false);
      setOtp('');
      onUpdate?.();
    } catch (error) {
      toast.error('Error setting password');
      console.error(error);
    }
  };

  const copyPasswordToClipboard = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(newPassword);
        toast.success('Password copied to clipboard!');
      } else {
        // Fallback for non-secure context
        const textArea = document.createElement('textarea');
        textArea.value = newPassword;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success('Password copied to clipboard!');
      }
    } catch (error) {
      console.warn('Could not copy to clipboard:', error);
      toast.info('NOTE: Please manually copy the password');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading Clinic Management...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto mt-20">
          <h3 className="text-red-800 font-semibold">Error Loading Clinic Management</h3>
          <p className="text-red-600 mt-2 text-sm">{error}</p>
          <div className="flex space-x-3 mt-4">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                loadClinics(false);
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.href = '/admin'}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'details' && selectedClinic) {
    return <ClinicDetails
      clinic={selectedClinic}
      onBack={() => {setViewMode('list'); setSelectedClinic(null);}}
      navigate={navigate}
    />;
  }

  const searchTerm = (localSearch || searchParams.get('search') || '').toLowerCase().trim();
  const getNormalizedType = (clinic) => {
    const rawType = clinic.clinicType || clinic.clinic_type || clinic.category || '';
    return rawType === 'lbl_partner' ? 'partner' : 'clinic';
  };
  const getNormalizedStatus = (clinic) => {
    if (clinic.subscriptionStatus === 'pending' || clinic.subscription_status === 'pending') {
      return 'pending';
    }
    return clinic.isActive ? 'active' : 'inactive';
  };
  const getNormalizedVerification = (clinic) => (clinic.isActivated ? 'verified' : 'pending');
  const getNormalizedSubscription = (clinic) =>
    (clinic.subscriptionStatus || clinic.subscription_status || 'trial').toLowerCase();

  const displayedClinics = clinics.filter((clinic) => {
    const matchesSearch = !searchTerm || (
      (clinic.name || '').toLowerCase().includes(searchTerm) ||
      (clinic.email || '').toLowerCase().includes(searchTerm) ||
      (clinic.contactPerson || '').toLowerCase().includes(searchTerm) ||
      (clinic.phone || '').toLowerCase().includes(searchTerm) ||
      (clinic.city || '').toLowerCase().includes(searchTerm) ||
      getNormalizedSubscription(clinic).includes(searchTerm) ||
      getNormalizedType(clinic).includes(searchTerm)
    );

    const matchesType = typeFilter === 'all' || getNormalizedType(clinic) === typeFilter;
    const matchesStatus = statusFilter === 'all' || getNormalizedStatus(clinic) === statusFilter;
    const matchesVerification =
      verificationFilter === 'all' || getNormalizedVerification(clinic) === verificationFilter;
    const matchesSubscription =
      subscriptionFilter === 'all' || getNormalizedSubscription(clinic) === subscriptionFilter;

    return matchesSearch && matchesType && matchesStatus && matchesVerification && matchesSubscription;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">

      {/* Clean Professional Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 mb-4">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                    Clinic/Partner Management
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                    Manage your registered clinics  and partners with modern precision FEATURE:
                  </p>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span className="text-xs font-medium text-gray-700">
                    {loading ? (
                      <div className="flex items-center space-x-1.5">
                        <div className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-green-500 border-t-transparent"></div>
                        <span>Loading...</span>
                      </div>
                    ) : (
                      `${clinics.length} Active Clinics/Partners`
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg">
                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600">
                    Updated: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-row gap-2 w-full lg:w-auto items-center">
              <PendingClinicsNotification onUpdate={loadClinics} autoShow={true} variant="badge" />
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    await loadClinics(false);
                    toast.success('Clinic data refreshed successfully!');
                  } catch (error) {
                    console.error('Refresh failed:', error);
                    toast.error('Failed to refresh data');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="flex items-center justify-center space-x-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex-1 lg:flex-initial"
                title="Refresh clinic data from database"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh Data</span>
              </button>

              <button
                onClick={() => openModal()}
                className="flex items-center justify-center space-x-1.5 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex-1 lg:flex-initial"
              >
                <Plus className="h-4 w-4" />
                <span>Add Clinic/Partner</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* All Clinics Section */}
      <div className="relative">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          {/* Count badge */}
          <div className="inline-flex items-center space-x-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="w-6 h-6 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
              {loading ? (
                <div className="flex items-center space-x-1.5">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent"></div>
                  <span>Loading Clinics...</span>
                </div>
              ) : (
                (() => {
                  const partnerCount = displayedClinics.filter(c => (c.clinicType || c.clinic_type) === 'lbl_partner').length;
                  const clinicCount = displayedClinics.filter(c => (c.clinicType || c.clinic_type) === 'lbl_clinic').length;
                  const otherCount = displayedClinics.length - partnerCount - clinicCount;
                  const suffix = searchTerm ? ` of ${clinics.length}` : '';
                  return `All (${displayedClinics.length}${suffix}) | Clinics (${clinicCount + otherCount}) | Partners (${partnerCount})`;
                })()
              )}
            </h2>
          </div>

          {/* Inline Search Bar */}
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by name, email, city, type..."
              className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="clinic">Clinic</option>
              <option value="partner">Partner</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>

            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Verification</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
            </select>

            <select
              value={subscriptionFilter}
              onChange={(e) => setSubscriptionFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Subscriptions</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="pending_approval">Pending Approval</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setStatusFilter('all');
                setVerificationFilter('all');
                setSubscriptionFilter('all');
              }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
        
        {/* Mobile Card View - Only visible on small screens */}
        <div className="block md:hidden space-y-3">
          {displayedClinics.map((clinic, index) => {
            const safeName = clinic?.name || 'Unknown Clinic';
            const safeInitial = safeName.charAt(0).toUpperCase();
            const usagePercent = Math.round(((clinic.reportsUsed || 0) / (clinic.reportsAllowed || 10)) * 100);

            return (
              <div key={clinic.id || `mobile-clinic-${index}`} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                {/* Header Row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm relative">
                      {clinic.avatar ? (
                        <img src={clinic.avatar} alt={safeName} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        safeInitial
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${clinic.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{safeName}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{clinic.email || '-'}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    clinic.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {clinic.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-gray-500 dark:text-gray-400">Phone</p>
                    <p className="font-medium text-gray-900 dark:text-white truncate">{clinic.phone ? `${clinic.countryCode || '+91'} ${clinic.phone}` : '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-gray-500 dark:text-gray-400">Contact</p>
                    <p className="font-medium text-gray-900 dark:text-white truncate">{clinic.contactPerson || '-'}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-gray-500 dark:text-gray-400">Verification</p>
                    <p className={`font-medium ${clinic.isActivated ? 'text-blue-600' : 'text-yellow-600'}`}>
                      {clinic.isActivated ? 'Verified' : 'Pending'}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="text-gray-500 dark:text-gray-400">Subscription</p>
                    <p className="font-medium text-purple-600">{clinic.subscriptionStatus || 'Trial'}</p>
                  </div>
                </div>

                {/* Reports Usage */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Reports Usage</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{clinic.reportsUsed || 0}/{clinic.reportsAllowed || 10}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${usagePercent}%` }}></div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => viewClinicDetails(clinic)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={() => openModal(clinic)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeactivateClinic(clinic.id)}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      clinic.isActive
                        ? 'bg-orange-50 hover:bg-orange-100 text-orange-600'
                        : 'bg-green-50 hover:bg-green-100 text-green-600'
                    }`}
                  >
                    {clinic.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View - Hidden on mobile */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Clinic</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">City</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden xl:table-cell">Phone</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Verification</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">Subscription</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden xl:table-cell">Reports Usage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap hidden lg:table-cell">Date Added</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {(() => {
            try {
              
              if (!Array.isArray(clinics)) {
                console.error('ERROR: CRITICAL: clinics is not an array!', clinics);
                return (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center">
                      <div className="bg-red-100 border border-red-300 rounded-lg p-4 inline-block">
                        <p className="text-red-700">Error: Clinics data is not an array</p>
                        <p className="text-xs text-red-500">Type: {typeof clinics}</p>
                      </div>
                    </td>
                  </tr>
                );
              }
              
              return displayedClinics.map((clinic, index) => {
                try {
                  
                  // Safety check for clinic object
                  if (clinic === null) {
                    console.warn(`WARNING: CLINIC ${index}: clinic is null`);
                    return (
                      <div key={`null-${index}`} className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
                        <p className="text-yellow-700">Warning: Null clinic at index {index}</p>
                      </div>
                    );
                  }
                  
                  if (clinic === undefined) {
                    console.warn(`WARNING: CLINIC ${index}: clinic is undefined`);
                    return (
                      <div key={`undefined-${index}`} className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
                        <p className="text-yellow-700">Warning: Undefined clinic at index {index}</p>
                      </div>
                    );
                  }
                  
                  if (typeof clinic !== 'object') {
                    console.warn(`WARNING: CLINIC ${index}: clinic is not an object:`, typeof clinic, clinic);
                    return (
                      <div key={`invalid-${index}`} className="bg-yellow-100 border border-yellow-300 rounded-lg p-4">
                        <p className="text-yellow-700">Warning: Invalid clinic object at index {index}</p>
                        <p className="text-xs text-yellow-600">Type: {typeof clinic}</p>
                        <p className="text-xs text-yellow-600">Value: {String(clinic)}</p>
                      </div>
                    );
                  }
                  
                  // Deep inspection of clinic object
                  
                  // Convert name to safe string if needed
                  let safeName = 'Unknown Clinic';
                  let safeInitial = 'C';
                  
                  try {
                    
                    if (clinic.name !== null && clinic.name !== undefined) {
                      if (typeof clinic.name === 'string') {
                        safeName = clinic.name;
                        
                        if (clinic.name && clinic.name.length > 0) {
                          try {
                            safeInitial = clinic.name.charAt(0).toUpperCase();
                          } catch (charError) {
                            console.error(`ERROR: CLINIC ${index}: Error in charAt:`, charError);
                            safeInitial = 'C';
                          }
                        } else {
                          safeInitial = 'E'; // E for Empty
                        }
                      } else {
                        safeName = String(clinic.name);
                        if (safeName && safeName.length > 0) {
                          try {
                            safeInitial = safeName.charAt(0).toUpperCase();
                          } catch (charError) {
                            console.error(`ERROR: CLINIC ${index}: Error in safeName charAt:`, charError);
                            safeInitial = 'S';
                          }
                        } else {
                          safeInitial = 'X'; // X for converted
                        }
                      }
                    } else {
                      safeName = 'Unknown Clinic';
                      safeInitial = 'U'; // U for Unknown
                    }
                  } catch (nameError) {
                    console.error(`ERROR: CLINIC ${index}: Error processing name:`, nameError);
                    console.error(`ERROR: CLINIC ${index}: clinic.name was:`, clinic.name);
                    console.error(`ERROR: CLINIC ${index}: Full clinic object:`, clinic);
                    safeName = 'Error Processing Name';
                    safeInitial = '!';
                  }
                  

                  const usagePercent = Math.round(((clinic.reportsUsed || 0) / (clinic.reportsAllowed || 10)) * 100);

                  return (
                    <tr key={clinic.id || `clinic-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      {/* Clinic Name with Avatar */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm relative">
                            {clinic.avatar ? (
                              <img src={clinic.avatar} alt={safeName} className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              safeInitial
                            )}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${clinic.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{safeName}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{clinic.email || '-'}</div>
                      </td>

                      {/* Clinic Type */}
                      <td className="px-4 py-3 whitespace-nowrap text-center hidden lg:table-cell">
                        {(() => {
                          const type = clinic.clinicType || clinic.clinic_type || clinic.category || '';
                          if (type === 'lbl_clinic') return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Clinic</span>;
                          if (type === 'lbl_partner') return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Partner</span>;
                          return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Clinic</span>;
                        })()}
                      </td>

                      {/* City */}
                      <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                        <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[120px]">{clinic.city || '-'}</div>
                      </td>

                      {/* Contact Person */}
                      <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                        <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[120px]">{clinic.contactPerson || '-'}</div>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 whitespace-nowrap hidden xl:table-cell">
                        <div className="text-sm text-gray-600 dark:text-gray-300">{clinic.phone ? `${clinic.countryCode || '+91'} ${clinic.phone}` : '-'}</div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          (clinic.subscriptionStatus === 'pending' || clinic.subscription_status === 'pending')
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : clinic.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            (clinic.subscriptionStatus === 'pending' || clinic.subscription_status === 'pending')
                              ? 'bg-yellow-500'
                              : clinic.isActive ? 'bg-green-500' : 'bg-red-500'
                          }`}></div>
                          {(clinic.subscriptionStatus === 'pending' || clinic.subscription_status === 'pending')
                            ? 'Pending'
                            : clinic.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Verification */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          clinic.isActivated
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}>
                          {clinic.isActivated ? (
                            <><CheckCircle className="w-3 h-3 mr-1" /> Verified</>
                          ) : (
                            <><AlertTriangle className="w-3 h-3 mr-1" /> Pending</>
                          )}
                        </span>
                      </td>

                      {/* Subscription */}
                      <td className="px-4 py-3 whitespace-nowrap text-center hidden lg:table-cell">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          clinic.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' :
                          clinic.subscriptionStatus === 'expired' ? 'bg-red-100 text-red-700' :
                          'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        }`}>
                          {clinic.subscriptionStatus || 'trial'}
                        </span>
                      </td>

                      {/* Reports Usage */}
                      <td className="px-4 py-3 whitespace-nowrap hidden xl:table-cell">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 min-w-[80px]">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {clinic.reportsUsed || 0}/{clinic.reportsAllowed || 10}
                          </span>
                        </div>
                      </td>

                      {/* Date Added */}
                      <td className="px-4 py-3 whitespace-nowrap hidden lg:table-cell">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {clinic.createdAt ? new Date(clinic.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true }) : '-'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => viewClinicDetails(clinic)}
                            className="p-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => openModal(clinic)}
                            className="p-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleDeactivateClinic(clinic.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              clinic.isActive
                                ? 'bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-600 dark:text-orange-400'
                                : 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400'
                            }`}
                            title={clinic.isActive ? 'Deactivate Clinic' : 'Activate Clinic'}
                          >
                            {clinic.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
            } catch (error) {
              console.error(`ERROR: CLINIC ${index}: Error rendering clinic row:`, error);
              console.error(`ERROR: CLINIC ${index}: Error stack:`, error.stack);
              console.error(`ERROR: CLINIC ${index}: Error message:`, error.message);
              console.error(`ERROR: CLINIC ${index}: Clinic data:`, clinic);
              console.error(`ERROR: CLINIC ${index}: Clinic JSON:`, JSON.stringify(clinic, null, 2));
              return (
                <tr key={`error-${index}`} className="bg-red-50">
                  <td colSpan="10" className="px-4 py-4 text-center">
                    <div className="text-red-700 text-sm">
                      <p>ERROR: Error displaying clinic {index + 1}</p>
                      <p className="text-xs text-red-500 font-mono">Error: {error.message}</p>
                    </div>
                  </td>
                </tr>
              );
            }
          });
            } catch (mapError) {
              console.error('ERROR: CRITICAL: Error in clinics.map:', mapError);
              console.error('ERROR: CRITICAL: Error stack:', mapError.stack);
              console.error('ERROR: CRITICAL: Clinics data:', clinics);
              return (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center">
                    <div className="bg-red-100 border border-red-300 rounded-lg p-4 inline-block">
                      <p className="text-red-700">ERROR: Critical Error: Unable to render clinics</p>
                      <p className="text-xs text-red-500 font-mono">Map Error: {mapError.message}</p>
                    </div>
                  </td>
                </tr>
              );
            }
          })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Empty State - Responsive */}
        {searchTerm && displayedClinics.length === 0 && clinics.length > 0 && (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No results found</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">No clinics match "<span className="font-medium">{searchTerm}</span>"</p>
            <button
              onClick={() => setLocalSearch('')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear search
            </button>
          </div>
        )}
        {clinics.length === 0 && (
          <div className="text-center py-12 sm:py-16 md:py-20 px-4">
            <div className="relative">
              <div className="w-20 h-20 sm:w-28 sm:h-28 md:w-32 md:h-32 mx-auto mb-6 sm:mb-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                <Users className="h-10 w-10 sm:h-14 sm:w-14 md:h-16 md:w-16 text-slate-400" />
              </div>
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">No clinics registered yet</h3>
              <p className="text-slate-500 text-sm sm:text-base md:text-lg mb-6 sm:mb-8 max-w-md mx-auto">Start by adding your first clinic to the platform</p>
              <button
                onClick={() => openModal()}
                className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base md:text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <div className="relative flex items-center justify-center space-x-2 sm:space-x-3">
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span>Add Your First Clinic</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ClinicModal
          clinic={selectedClinic}
          clinics={clinics}
          user={user}
          onSubmit={selectedClinic ? handleEditClinic : handleCreateClinic}
          onResetPassword={handlePasswordReset}
          onClose={closeModal}
          register={register}
          handleSubmit={handleSubmit}
          errors={errors}
          watch={watch}
          reset={reset}
        />
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <PasswordResetModal
          clinic={selectedClinic}
          newPassword={newPassword}
          isManualPassword={isManualPassword}
          onConfirm={confirmPasswordReset}
          onClose={() => {
            setShowPasswordReset(false);
            setNewPassword('');
            setSelectedClinic(null);
            setIsManualPassword(false);
          }}
          onCopy={copyPasswordToClipboard}
          onGeneratePassword={generateNewPassword}
          onManualPassword={handleManualPassword}
          onPasswordChange={setNewPassword}
        />
      )}

      {/* Admin Assignment Modal */}
      <AdminAssignmentModal
        clinic={selectedClinicForAdmin}
        isOpen={showAdminModal}
        onClose={() => {
          setShowAdminModal(false);
          setSelectedClinicForAdmin(null);
        }}
        onUpdate={loadClinics}
      />
    </div>
  );
};

// Clinic Modal Component  
const ClinicModal = ({ clinic, clinics, user, onSubmit, onClose, register, handleSubmit, errors, watch, reset, onResetPassword }) => {
  const watchPassword = watch ? watch('password', '') : '';
  const watchEditPassword = watch ? watch('editPassword', '') : '';
  const clinicStoredPassword = clinic?.password || '';
  const canRevealStoredPassword = Boolean(clinicStoredPassword) && !isHashed(clinicStoredPassword);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [cityList, setCityList] = React.useState([]);
  // Existing clinics are hardcoded as agreed; new clinics must check manually
  const [contractAgreed, setContractAgreed] = React.useState(
    clinic ? true : false
  );

  // Sync contractAgreed when the clinic prop changes (e.g. switching between edits)
  React.useEffect(() => {
    setContractAgreed(clinic ? true : false);
  }, [clinic]);

  // Fetch cities from preferred_locations
  React.useEffect(() => {
    const fetchCities = async () => {
      try {
        const locations = await LocationService.getLocations();
        setCityList((locations || []).filter(loc => loc.toUpperCase() !== 'OTHER'));
      } catch (err) {
        console.warn('Failed to load cities:', err);
      }
    };
    fetchCities();
  }, []);

  // Re-apply form values after city list loads so dropdowns populate correctly
  React.useEffect(() => {
    if (clinic && cityList.length > 0 && reset) {
      reset({
        name: clinic.name || '',
        clinicType: clinic.clinicType || clinic.clinic_type || '',
        city: clinic.city || '',
        email: clinic.email || '',
        contactPerson: clinic.contactPerson || clinic.contact_person || '',
        countryCode: clinic.countryCode || clinic.country_code || '+91',
        phone: clinic.phone || clinic.phone_number || '',
        address: clinic.address || '',
        editPassword: '',
        editConfirmPassword: ''
      });
    }
  }, [clinic, cityList, reset]);

  // Wrapper for form submission
  // Convert text fields to uppercase (except email/password)
  const handleFormSubmit = (data) => {
    const formData = {
      ...data,
      name: data.name ? data.name.toUpperCase() : data.name,
      city: data.city ? data.city.toUpperCase() : data.city,
      contactPerson: data.contactPerson ? data.contactPerson.toUpperCase() : data.contactPerson,
      address: data.address ? data.address.toUpperCase() : data.address,
      contractAgreed: contractAgreed,
    };
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-start justify-center pt-4 sm:pt-8 px-2">
      <div className="relative w-full max-w-md p-4 sm:p-5 border shadow-lg rounded-lg bg-white max-h-[85vh] overflow-y-auto mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">
            {clinic ? 'Edit Clinic/Partner' : 'Add new Clinic/Partner'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Clinic Profile Picture Display */}
        {clinic && clinic.avatar && (
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E4EFFF]0 via-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg overflow-hidden">
                <img 
                  src={clinic.avatar} 
                  alt={`${clinic.name} Profile`} 
                  className="w-20 h-20 object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-20 h-20 flex items-center justify-center hidden">
                  <Users className="h-8 w-8 text-white" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-white">
                {clinic.isActive ? (
                  <div className="w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse"></div>
                ) : (
                  <div className="w-3 h-3 bg-gradient-to-r from-red-400 to-red-500 rounded-full"></div>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-3">
          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Category *
            </label>
            <select
              {...register('clinicType', { required: 'Category is required' })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select category</option>
              <option value="lbl_partner">Partner</option>
              <option value="lbl_clinic">Clinic</option>
            </select>
            {errors.clinicType && <p className="text-red-500 text-xs mt-0.5">{errors.clinicType.message}</p>}
          </div>

          {/* Clinic/Partner Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {watch('clinicType') === 'lbl_partner' ? 'Partner Name' : 'Clinic Name'} *
            </label>
            <input
              type="text"
              {...register('name', { required: `${watch('clinicType') === 'lbl_partner' ? 'Partner' : 'Clinic'} name is required` })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
            />
            {errors.name && <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>}
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              City
            </label>
            <select
              {...register('city')}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select city</option>
              {cityList.map((city, idx) => (
                <option key={idx} value={city}>{city}</option>
              ))}
            </select>
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
                },
                validate: (value) => {
                  if (!clinic && clinics) {
                    const exists = clinics.some(c => c.email?.toLowerCase() === value.trim().toLowerCase());
                    if (exists) return 'A clinic/partner with this email already exists';
                  }
                  if (clinic && clinics) {
                    const exists = clinics.some(c => c.email?.toLowerCase() === value.trim().toLowerCase() && c.id !== clinic.id);
                    if (exists) return 'A clinic/partner with this email already exists';
                  }
                  return true;
                }
              })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="clinic@example.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>}
          </div>

          {/* Contact Person */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contact Person
            </label>
            <input
              type="text"
              {...register('contactPerson')}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="flex gap-2">
              {/* Country Code Selector */}
              <select
                {...register('countryCode')}
                className="w-28 sm:w-32 px-1.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-medium appearance-none cursor-pointer bg-white pr-6"
                style={{
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
                  backgroundPosition: "right 0.3rem center",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "1.3em 1.3em",
                  fontFamily: "sans-serif",
                  fontSize: "13px",
                  lineHeight: "1.5"
                }}
              >
                {/* North America */}
                <option value="+1">US +1</option>
                <option value="+1">CA +1</option>
                <option value="+52">MX +52</option>

                {/* Europe */}
                <option value="+44">UK +44</option>
                <option value="+49">DE +49</option>
                <option value="+33">FR +33</option>
                <option value="+39">IT +39</option>
                <option value="+34">ES +34</option>
                <option value="+31">NL +31</option>
                <option value="+32">BE +32</option>
                <option value="+41">CH +41</option>
                <option value="+43">AT +43</option>
                <option value="+46">SE +46</option>
                <option value="+47">NO +47</option>
                <option value="+45">DK +45</option>
                <option value="+358">FI +358</option>
                <option value="+48">PL +48</option>
                <option value="+351">PT +351</option>
                <option value="+30">GR +30</option>
                <option value="+353">IE +353</option>
                <option value="+420">CZ +420</option>
                <option value="+36">HU +36</option>
                <option value="+40">RO +40</option>
                <option value="+380">UA +380</option>
                <option value="+7">RU +7</option>

                {/* Asia - South */}
                <option value="+91">IN +91</option>
                <option value="+92">PK +92</option>
                <option value="+880">BD +880</option>
                <option value="+94">LK +94</option>
                <option value="+977">NP +977</option>
                <option value="+975">BT +975</option>
                <option value="+960">MV +960</option>
                <option value="+93">AF +93</option>

                {/* Asia - East */}
                <option value="+86">CN +86</option>
                <option value="+81">JP +81</option>
                <option value="+82">KR +82</option>
                <option value="+852">HK +852</option>
                <option value="+853">MO +853</option>
                <option value="+886">TW +886</option>
                <option value="+976">MN +976</option>

                {/* Asia - Southeast */}
                <option value="+65">SG +65</option>
                <option value="+60">MY +60</option>
                <option value="+66">TH +66</option>
                <option value="+84">VN +84</option>
                <option value="+62">ID +62</option>
                <option value="+63">PH +63</option>
                <option value="+95">MM +95</option>
                <option value="+855">KH +855</option>
                <option value="+856">LA +856</option>
                <option value="+673">BN +673</option>

                {/* Middle East */}
                <option value="+971">AE +971</option>
                <option value="+966">SA +966</option>
                <option value="+974">QA +974</option>
                <option value="+965">KW +965</option>
                <option value="+968">OM +968</option>
                <option value="+973">BH +973</option>
                <option value="+962">JO +962</option>
                <option value="+961">LB +961</option>
                <option value="+972">IL +972</option>
                <option value="+90">TR +90</option>
                <option value="+98">IR +98</option>
                <option value="+964">IQ +964</option>
                <option value="+963">SY +963</option>
                <option value="+967">YE +967</option>

                {/* Africa */}
                <option value="+20">EG +20</option>
                <option value="+27">ZA +27</option>
                <option value="+234">NG +234</option>
                <option value="+254">KE +254</option>
                <option value="+255">TZ +255</option>
                <option value="+256">UG +256</option>
                <option value="+233">GH +233</option>
                <option value="+212">MA +212</option>
                <option value="+213">DZ +213</option>
                <option value="+216">TN +216</option>
                <option value="+251">ET +251</option>
                <option value="+260">ZM +260</option>
                <option value="+263">ZW +263</option>
                <option value="+225">CI +225</option>
                <option value="+221">SN +221</option>
                <option value="+237">CM +237</option>

                {/* Oceania */}
                <option value="+61">AU +61</option>
                <option value="+64">NZ +64</option>
                <option value="+679">FJ +679</option>
                <option value="+675">PG +675</option>

                {/* South America */}
                <option value="+55">BR +55</option>
                <option value="+54">AR +54</option>
                <option value="+56">CL +56</option>
                <option value="+57">CO +57</option>
                <option value="+51">PE +51</option>
                <option value="+58">VE +58</option>
                <option value="+593">EC +593</option>
                <option value="+591">BO +591</option>
                <option value="+595">PY +595</option>
                <option value="+598">UY +598</option>

                {/* Central America & Caribbean */}
                <option value="+502">GT +502</option>
                <option value="+503">SV +503</option>
                <option value="+504">HN +504</option>
                <option value="+505">NI +505</option>
                <option value="+506">CR +506</option>
                <option value="+507">PA +507</option>
                <option value="+509">HT +509</option>
                <option value="+1809">DO +1809</option>
                <option value="+1876">JM +1876</option>
                <option value="+53">CU +53</option>
              </select>

              {/* Phone Number Input */}
              <input
                type="tel"
                {...register('phone', {
                  pattern: {
                    value: /^[0-9]{5,15}$/,
                    message: 'Please enter a valid phone number'
                  }
                })}
                placeholder="Enter phone number"
                className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs mt-0.5">{errors.phone.message}</p>}
            <p className="text-xs text-gray-500 mt-0.5">
              Select your country code from the dropdown and enter your phone number
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              {...register('address')}
              rows="2"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 uppercase"
            />
          </div>

          {/* Change Password — edit mode only (optional) — hidden for now */}
          {false && clinic && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  New Password <span className="text-gray-400 font-normal">(optional — leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    {...register('editPassword', {
                      minLength: {
                        value: 8,
                        message: 'Password must be at least 8 characters'
                      }
                    })}
                    className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.editPassword && <p className="text-red-500 text-xs mt-0.5">{errors.editPassword.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    {...register('editConfirmPassword', {
                      validate: (value, formValues) => {
                        if (formValues.editPassword && !value) return 'Please confirm the new password';
                        if (formValues.editPassword && value !== formValues.editPassword) return 'Passwords do not match';
                        return true;
                      }
                    })}
                    className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.editConfirmPassword && <p className="text-red-500 text-xs mt-0.5">{errors.editConfirmPassword.message}</p>}
              </div>
            </>
          )}

          {!clinic && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    {...register('password', {
                      required: 'Password is required',
                      minLength: {
                        value: 8,
                        message: 'Password must be at least 8 characters'
                      },
                      validate: {
                        hasUpperCase: (v) => /[A-Z]/.test(v) || 'Must contain at least one uppercase letter',
                        hasLowerCase: (v) => /[a-z]/.test(v) || 'Must contain at least one lowercase letter',
                        hasNumber: (v) => /[0-9]/.test(v) || 'Must contain at least one number',
                        hasSpecialChar: (v) => /[^a-zA-Z0-9]/.test(v) || 'Must contain at least one special character (!@#$%^&* etc.)'
                      }
                    })}
                    className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    title={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-0.5">{errors.password.message}</p>}
                {watchPassword && (
                  <div className="mt-1.5 space-y-0.5">
                    {[
                      { test: watchPassword.length >= 8, label: 'At least 8 characters' },
                      { test: /[A-Z]/.test(watchPassword), label: 'One uppercase letter' },
                      { test: /[a-z]/.test(watchPassword), label: 'One lowercase letter' },
                      { test: /[0-9]/.test(watchPassword), label: 'One number' },
                      { test: /[^a-zA-Z0-9]/.test(watchPassword), label: 'One special character' },
                    ].map((rule, i) => (
                      <p key={i} className={`text-xs flex items-center gap-1 ${rule.test ? 'text-green-600' : 'text-gray-400'}`}>
                        {rule.test ? '✓' : '○'} {rule.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    {...register('confirmPassword', {
                      required: 'Password confirmation is required',
                      validate: (value, formValues) =>
                        value === formValues.password || 'Passwords do not match'
                    })}
                    className="w-full px-2.5 py-1.5 pr-8 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-0.5">{errors.confirmPassword.message}</p>}
              </div>

            </>
          )}

          <div className="flex items-start space-x-2 pt-3 mt-3">
            {clinic ? (
              /* Edit mode — always checked, blue, not editable */
              <div className="mt-0.5 h-4 w-4 rounded bg-blue-600 border-blue-600 border flex items-center justify-center flex-shrink-0">
                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ) : (
              <input
                type="checkbox"
                id="contractAgreed"
                checked={contractAgreed}
                onChange={(e) => setContractAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              />
            )}
            <label htmlFor="contractAgreed" className={`text-sm text-gray-700 select-none ${clinic ? 'cursor-default' : 'cursor-pointer'}`}>
              Received Signed Contract &amp; Agreements
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!clinic && !contractAgreed}
              className={`px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white transition-all duration-200 shadow-lg ${
                !clinic && !contractAgreed
                  ? 'bg-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl'
              }`}
            >
              {clinic ? 'Update Clinic/Partner' : 'Create Clinic/Partner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Clinic Details Component
const ClinicDetails = ({ clinic, onBack, navigate }) => {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [usage, setUsage] = useState({});
  const [showPatientsList, setShowPatientsList] = useState(false);

  useEffect(() => {
    if (clinic) {
      const loadData = async () => {
        const [clinicPatients, clinicReports, clinicUsage] = await Promise.all([
          DatabaseService.getPatientsByClinic(clinic.id),
          DatabaseService.getReportsByClinic(clinic.id),
          DatabaseService.getClinicUsage(clinic.id),
        ]);
        setPatients(clinicPatients || []);
        setReports(clinicReports || []);
        setUsage(clinicUsage || {});
      };
      loadData();
    }
  }, [clinic]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={onBack}
          className="text-primary-600 hover:text-primary-800 font-medium"
        >
          ← Back to Clinics
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 via-purple-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg overflow-hidden">
                {clinic.avatar ? (
                  <img
                    src={clinic.avatar}
                    alt={`${clinic.name} Profile`}
                    className="h-16 w-16 object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`h-16 w-16 flex items-center justify-center ${clinic.avatar ? 'hidden' : ''}`}>
                  {(clinic.name || '')
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map(w => w[0])
                    .join('')
                    .toUpperCase() || '?'}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md border-2 border-white">
                {clinic.isActive ? (
                  <div className="w-2.5 h-2.5 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse"></div>
                ) : (
                  <div className="w-2.5 h-2.5 bg-gradient-to-r from-red-400 to-red-500 rounded-full"></div>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{clinic.name}</h2>
              <p className="text-gray-600">{clinic.email}</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            clinic.isActive
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {clinic.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">{clinic.email}</span>
              </div>
              {clinic.phone && (
                <div className="flex items-center space-x-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">{clinic.countryCode || '+91'} {clinic.phone}</span>
                </div>
              )}
              {clinic.address && (
                <div className="flex items-start space-x-3">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <span className="text-sm text-gray-600">{clinic.address}</span>
                </div>
              )}
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Joined {new Date(clinic.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true })}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Usage Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Reports Used:</span>
                <span className="font-semibold">{clinic.reportsUsed || 0} / {clinic.reportsAllowed || 10}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Patients:</span>
                <span className="font-semibold">{patients.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Reports:</span>
                <span className="font-semibold">{reports.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Subscription:</span>
                <span className="font-semibold capitalize">{clinic.subscriptionStatus || 'Trial'}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (patients.length === 0) {
                    toast('No patients registered for this clinic yet.', {
                      icon: '👥',
                      duration: 3000,
                    });
                  } else {
                    setShowPatientsList(prev => !prev);
                  }
                }}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-[#E4EFFF] hover:text-[#323956] rounded-md text-sm flex items-center space-x-2 transition-colors"
              >
                <Users className="h-4 w-4" />
                <span>View All Patients</span>
                {patients.length > 0 && (
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                    {patients.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate(`/admin/reports?clinic=${clinic.id}`)}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-[#E4EFFF] hover:text-[#323956] rounded-md text-sm flex items-center space-x-2 transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span>View All Reports</span>
              </button>
              <button
                onClick={() => navigate(`/admin/payments?clinic=${clinic.id}`)}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-[#E4EFFF] hover:text-[#323956] rounded-md text-sm flex items-center space-x-2 transition-colors"
              >
                <CreditCard className="h-4 w-4" />
                <span>Manage Subscription</span>
              </button>
              <button
                onClick={() => setShowNotificationModal(true)}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-[#E4EFFF] hover:text-[#323956] rounded-md text-sm flex items-center space-x-2 transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span>Send Notification</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Patients List */}
      {showPatientsList && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Patients — {clinic.name}
              <span className="text-sm font-normal text-gray-500 ml-1">({patients.length} total)</span>
            </h3>
            <button
              onClick={() => setShowPatientsList(false)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Registered On</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient, idx) => (
                  <tr key={patient.id || idx} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-900">
                      {patient.name || patient.full_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{patient.email || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-600">{patient.phone || patient.mobile || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {patient.created_at || patient.createdAt
                        ? new Date(patient.created_at || patient.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Send Notification to {clinic.name}</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                <textarea
                  value={notificationMsg}
                  onChange={(e) => setNotificationMsg(e.target.value)}
                  rows="4"
                  placeholder="Type your notification message..."
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#323956] text-sm resize-none"
                />
              </div>
              <p className="text-xs text-gray-500">
                This will be sent to <span className="font-medium">{clinic.email}</span>
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => { setShowNotificationModal(false); setNotificationMsg(''); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={!notificationMsg.trim() || sendingNotification}
                onClick={async () => {
                  setSendingNotification(true);
                  try {
                    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                    const { data: notifSession } = await supabase.auth.getSession();
                    const notifToken = notifSession?.session?.access_token;
                    const notifHeaders = { 'Content-Type': 'application/json' };
                    if (notifToken) notifHeaders['Authorization'] = `Bearer ${notifToken}`;
                    await fetch(`${API_URL}/notifications/send`, {
                      method: 'POST',
                      headers: notifHeaders,
                      body: JSON.stringify({
                        to: clinic.email,
                        clinicId: clinic.id,
                        clinicName: clinic.name,
                        message: notificationMsg,
                        type: 'admin_notification'
                      })
                    });
                    toast.success(`Notification sent to ${clinic.name}!`);
                    setShowNotificationModal(false);
                    setNotificationMsg('');
                  } catch (error) {
                    console.error('Error sending notification:', error);
                    toast.error('Failed to send notification');
                  } finally {
                    setSendingNotification(false);
                  }
                }}
                className="px-4 py-2 bg-[#323956] text-white rounded-lg text-sm font-medium hover:bg-[#252d45] disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {sendingNotification ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Password Reset Modal Component
const PasswordResetModal = ({ 
  clinic, 
  newPassword, 
  isManualPassword,
  onConfirm, 
  onClose, 
  onCopy,
  onGeneratePassword,
  onManualPassword,
  onPasswordChange
}) => {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-6 border max-w-lg w-full shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900">Set Password & Send Credentials</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-[#E4EFFF] border border-blue-200 rounded-md p-4">
            <div className="flex items-start space-x-3">
              <Mail className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-blue-800">
                  Email Notification for {clinic?.name}
                </h4>
                <p className="text-sm text-blue-700 mt-1">
                  Username, password, and activation OTP will be sent to: <strong>{clinic?.email}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Password Input Options */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Choose Password Method:
            </label>
            
            <div className="flex space-x-3">
              <button
                onClick={onGeneratePassword}
                className={`flex-1 p-3 border rounded-md text-sm font-medium transition-colors ${
                  !isManualPassword 
                    ? 'border-primary-500 bg-primary-50 text-primary-700' 
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <RefreshCw className="h-4 w-4 mx-auto mb-1" />
                Generate Random
              </button>
              <button
                onClick={onManualPassword}
                className={`flex-1 p-3 border rounded-md text-sm font-medium transition-colors ${
                  isManualPassword 
                    ? 'border-primary-500 bg-primary-50 text-primary-700' 
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Edit className="h-4 w-4 mx-auto mb-1" />
                Manual Entry
              </button>
            </div>
          </div>

          {/* Password Input Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isManualPassword ? 'Enter Password:' : 'Generated Password:'}
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newPassword}
                onChange={(e) => onPasswordChange(e.target.value)}
                readOnly={!isManualPassword}
                placeholder={isManualPassword ? "Enter password (min 6 characters)" : "Click 'Generate Random' to create password"}
                className={`flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${
                  !isManualPassword ? 'bg-gray-50 font-mono' : ''
                }`}
              />
              {!isManualPassword && newPassword && (
                <button
                  onClick={onCopy}
                  className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  title="Copy to clipboard"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>
            {isManualPassword && (
              <p className="text-xs text-gray-500 mt-1">
                Password must be at least 6 characters
              </p>
            )}
          </div>

          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-700">
              <strong>What happens next:</strong>
              <br />• Username (email) and password will be sent to clinic
              <br />• 6-digit OTP will be sent for account activation
              <br />• Clinic must verify OTP to activate their account
              <br />• OTP expires in 15 minutes
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!newPassword.trim()}
            className="px-4 py-2 bg-[#323956] border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Mail className="h-4 w-4" />
            <span>Send Credentials & OTP</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default ClinicManagement;