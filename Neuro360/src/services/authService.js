import axios from 'axios';
import Cookies from 'js-cookie';
import DatabaseService from './databaseService';
import { generatePatientUID } from '../utils/patientUidGenerator';
import { hashPassword, comparePassword } from '../utils/passwordUtils';

// Import shared Supabase service to avoid multiple client instances
import SupabaseService from './supabaseService';

// Get reference to the shared Supabase client
const supabase = SupabaseService.supabase;

// Base API URL - replace with your actual API endpoint
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests - use Supabase session token
api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    } else {
      const token = Cookies.get('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // Continue without token if session fetch fails
  }
  return config;
});

// Handle token expiration and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      Cookies.remove('authToken');
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data?.error);
    }
    return Promise.reject(error);
  }
);

export const authService = {
  // Email/Password Authentication
  async loginWithEmail({ email, password, userType }) {

    // Input validation
    if (!email) {
      throw new Error('Email is required');
    }
    if (!password) {
      throw new Error('Password is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // SUCCESS: PRIORITY 1: Check clinics table first (local password auth)
      // Must be before super admin check — an email may exist in both tables,
      // and clinic passwords are stored locally (not in Supabase Auth).

      // Helper: check clinics table
      const checkClinicsTable = async () => {
        const clinics = await DatabaseService.get('clinics') || [];
        const clinicByEmail = clinics.find(c => c.email === normalizedEmail);

        if (clinicByEmail) {

          const isActive = clinicByEmail.isActivated || clinicByEmail.is_active;
          const subscriptionStatus = clinicByEmail.subscriptionStatus || clinicByEmail.subscription_status;

          if (!isActive || subscriptionStatus === 'pending_approval') {
            throw new Error('Your account is pending activation. Please wait for admin approval. You will receive an email with login credentials once approved.');
          }

          const clinicPasswordMatch = await comparePassword(password, clinicByEmail.password);
          if (!clinicPasswordMatch) {
            throw new Error('Invalid email or password');
          }

          try {
            await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
          } catch (e) { /* non-critical */ }
          return {
            success: true,
            token: `local_token_${Date.now()}`,
            user: {
              id: clinicByEmail.id,
              email: clinicByEmail.email,
              name: clinicByEmail.contact_person || clinicByEmail.name,
              clinicName: clinicByEmail.clinic_name || clinicByEmail.name,
              phone: clinicByEmail.phone,
              address: clinicByEmail.address,
              role: 'clinic_admin',
              avatar: clinicByEmail.logo_url || clinicByEmail.avatar,
              clinicId: clinicByEmail.id,
              isActivated: isActive
            }
          };
        }
        return null;
      };

      // Helper: check patients table
      const checkPatientsTable = async () => {
        const { data: patients, error: patientsError } = await supabase
          .from('patients')
          .select('*')
          .eq('email', normalizedEmail);

        if (!patientsError && patients && patients.length > 0) {
          let patient = null;
          for (const p of patients) {
            if (await comparePassword(password, p.password)) {
              patient = p;
              break;
            }
          }

          if (patient) {
            try {
              await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
            } catch (e) { /* non-critical */ }
            return {
              success: true,
              token: `patient_token_${Date.now()}`,
              user: {
                id: patient.id,
                email: patient.email,
                name: patient.full_name || patient.name,
                phone: patient.phone,
                address: patient.address,
                dateOfBirth: patient.date_of_birth,
                gender: patient.gender,
                role: 'patient',
                avatar: patient.avatar || patient.profile_image || patient.avatar_url,
                clinicId: patient.clinic_id || patient.org_id,
                patientId: patient.id,
                externalId: patient.external_id,
                isActivated: true
              }
            };
          }
        }
        return null;
      };

      // Check tables in order based on which login form the user is on
      // If patient login, check patients first; otherwise clinics first (default)
      // NOTE: checkClinicsTable throws when email found but password wrong.
      // We catch that so we can still check superAdmins (email may be in both tables).
      let result = null;
      let clinicPasswordFailed = false;
      let clinicPendingError = null;

      const swallowClinicErrors = (err) => {
        if (err.message === 'Invalid email or password') { clinicPasswordFailed = true; return null; }
        // If account is pending, save the error but don't throw yet —
        // the same email may also be a super admin and we must check that first.
        if (err.message && err.message.includes('pending')) { clinicPendingError = err; return null; }
        throw err;
      };

      if (userType === 'patient') {
        result = await checkPatientsTable();
        if (!result) result = await checkClinicsTable().catch(swallowClinicErrors);
      } else {
        result = await checkClinicsTable().catch(swallowClinicErrors);
        if (!result) result = await checkPatientsTable();
      }

      if (result) return result;

      // PRIORITY 2: Check super admins — always check even if clinic password failed
      // (same email may be registered as both a clinic applicant and a super admin)
      // Super admin passwords are verified via Supabase Auth (no local password stored)
      const superAdmins = await DatabaseService.get('superAdmins') || [];
      const superAdminProfile = superAdmins.find(a => a.email === normalizedEmail && a.role === 'super_admin');

      if (superAdminProfile) {
        const { data: saData, error: saError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (saError || !saData?.session) {
          throw new Error('Invalid email or password');
        }
        return {
          success: true,
          token: saData.session.access_token,
          user: {
            id: superAdminProfile.id,
            email: superAdminProfile.email,
            name: superAdminProfile.full_name || superAdminProfile.name || 'Super Admin',
            role: 'super_admin',
            avatar: superAdminProfile.avatar_url || null,
            isActivated: true
          }
        };
      }


      // Re-throw pending activation error now that superAdmin check is done
      if (clinicPendingError) throw clinicPendingError;

      // If email was found in clinics but password was wrong, and it's not a superAdmin,
      // fail fast — don't try Supabase Auth with a locally-stored clinic password
      if (clinicPasswordFailed) {
        throw new Error('Invalid email or password');
      }

      // PRIORITY 3: Try Supabase Auth (fallback for legacy users)
      if (!supabase || !SupabaseService.isAvailable()) {
        throw new Error('Invalid email or password');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password
      });

      if (error) {
        throw new Error('Invalid email or password');
      }

      if (!data.user) {
        throw new Error('Login failed - no user returned');
      }

      // Get user profile from database
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      // If user is clinic_admin, check clinic activation status
      if (profile?.role === 'clinic_admin') {
        const { data: clinicData } = await supabase
          .from('clinics')
          .select('*')
          .eq('id', data.user.id)
          .single();

        // Check if clinic is activated
        if (clinicData && !clinicData.is_active) {
          throw new Error('Your clinic account is pending activation by super admin. Please wait for approval.');
        }

        // Check subscription status
        if (clinicData && clinicData.subscription_status === 'pending_approval') {
          throw new Error('Your clinic registration is pending approval. You will be notified once approved.');
        }
      }

      const user = {
        id: data.user.id,
        email: data.user.email,
        name: profile?.full_name || data.user.user_metadata?.full_name || 'User',
        role: profile?.role || data.user.user_metadata?.role || 'patient',
        avatar: profile?.avatar_url,
        isActivated: true
      };


      return {
        success: true,
        token: data.session.access_token,
        user: user
      };

    } catch (error) {
      console.error('ALERT: Login error:', error.message);
      throw error;
    }
  },

  // TEMPORARY: Local authentication only (bypass Supabase)
  async localAuthenticationOnly(email, password) {
    try {

      // Check super admins from database
      const superAdmins = await DatabaseService.get('superAdmins') || [];

      let superAdmin = null;
      for (const admin of superAdmins) {
        if (admin.email === email && await comparePassword(password, admin.password)) {
          superAdmin = admin;
          break;
        }
      }

      if (superAdmin) {
        return {
          success: true,
          token: `local_token_${Date.now()}`,
          user: {
            id: superAdmin.id,
            email: superAdmin.email,
            name: superAdmin.name,
            role: 'super_admin',
            avatar: superAdmin.avatar,
            isActivated: true
          }
        };
      }

      // Check clinics
      let clinics = [];

      try {
        clinics = await DatabaseService.get('clinics') || [];
      } catch (clinicFetchError) {
        console.error('ALERT: Error fetching clinics:', clinicFetchError);
        clinics = [];
      }

      if (clinics.length > 0) {

        clinics.forEach((c, index) => {
          console.log(`DEBUG: Clinic ${index + 1}:`, {
            id: c.id,
            name: c.name,
            email: c.email,
            hasPassword: !!c.password,
            passwordLength: c.password ? c.password.length : 0,
            actualPassword: c.password || 'NONE',
            isActive: c.is_active || c.isActive,
            subscriptionStatus: c.subscription_status || c.subscriptionStatus,
            allFields: Object.keys(c)
          });
        });
      } else {
      }


      // Find clinic matching email and password
      let clinic = null;
      for (const c of clinics) {
        if (c.email === email && await comparePassword(password, c.password)) {
          clinic = c;
          break;
        }
      }

      if (clinic) {

        // Check if clinic is activated
        const isActive = clinic.isActivated || clinic.is_active;
        const subscriptionStatus = clinic.subscriptionStatus || clinic.subscription_status;

        if (!isActive) {
          throw new Error('Your clinic account is pending activation by super admin. Please wait for approval.');
        }

        if (subscriptionStatus === 'pending_approval') {
          throw new Error('Your clinic registration is pending approval. You will be notified once approved.');
        }

        return {
          success: true,
          token: `local_token_${Date.now()}`,
          user: {
            id: clinic.id,
            email: clinic.email,
            name: clinic.name,
            role: 'clinic_admin',
            avatar: clinic.avatar || clinic.logoUrl,
            isActivated: isActive
          }
        };
      }

      throw new Error('Invalid email or password');
    } catch (error) {
      console.error('ALERT: Local authentication failed:', error.message);
      throw new Error('Invalid email or password');
    }
  },

  async registerWithEmail({ name, email, password, confirmPassword, userType = 'patient', dateOfBirth, gender, phone, countryCode, address, city, clinicName, clinicType, clinic_type }) {
    try {

      // Input validation
      if (!name || name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters long');
      }
      if (!email || !email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (!['patient', 'clinic', 'super_admin'].includes(userType)) {
        throw new Error('Invalid user type selected');
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if email already exists in local database
      const existingClinics = await DatabaseService.get('clinics') || [];
      const existingPatients = await DatabaseService.get('patients') || [];
      const existingSuperAdmins = await DatabaseService.get('superAdmins') || [];

      if (existingClinics.some(c => c.email === normalizedEmail) ||
          existingPatients.some(p => p.email === normalizedEmail) ||
          existingSuperAdmins.some(sa => sa.email === normalizedEmail)) {
        throw new Error('An account with this email already exists. Please try logging in instead.');
      }

      // Handle CLINIC registration - Save directly to clinics table
      if (userType === 'clinic') {

        const hashedPwd = await hashPassword(password);
        const clinicData = {
          name: name.trim(),
          email: normalizedEmail,
          contact_person: name.trim(),
          country_code: countryCode || '+91',
          phone: phone || '',
          address: address || '',
          city: city || '',
          clinic_type: clinicType || clinic_type || 'lbl_partner',
          password: hashedPwd,
          logo_url: null,
          is_active: false, // Pending approval
          reports_used: 0,
          reports_allowed: 0, // Will be set after approval
          subscription_status: 'pending_approval',
          subscription_tier: 'free',
          trial_start_date: null,
          trial_end_date: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedClinic = await DatabaseService.add('clinics', clinicData);

        // Send confirmation email to clinic via backend API
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          const emailResponse = await fetch(`${API_BASE_URL}/registration-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: clinicData.contact_person || clinicData.name,
              email: clinicData.email,
              clinicName: clinicData.name,
              type: 'clinic'
            })
          });
          const emailResult = await emailResponse.json();
          if (emailResult.success) {
          }
        } catch (emailError) {
          console.error('WARNING: Failed to send confirmation email:', emailError);
          // Don't fail registration if email fails
        }

        return {
          success: true,
          needsActivation: true,
          message: 'Clinic registration submitted successfully! A confirmation email has been sent to your email address. Your account is pending activation by our administrator.',
          user: {
            id: savedClinic?.id || 'pending',
            email: clinicData.email,
            name: clinicData.name,
            role: 'clinic_admin'
          }
        };
      }

      // Handle PATIENT registration - Save directly to patients table
      if (userType === 'patient') {

        // Validate clinic if provided
        let registeredClinic = null;
        if (clinicName && clinicName.trim()) {
          const clinics = await DatabaseService.get('clinics') || [];
          registeredClinic = clinics.find(c =>
            c.name?.toLowerCase() === clinicName.trim().toLowerCase() &&
            (c.is_active || c.isActive)
          );

          if (!registeredClinic) {
            throw new Error('This clinic is not available in Limitless Brain Lab. Please check the clinic name or contact support.');
          }
        }

        const hashedPatientPwd = await hashPassword(password);
        const patientData = {
          full_name: name.trim(),
          email: normalizedEmail,
          password: hashedPatientPwd,
          date_of_birth: dateOfBirth || null,
          gender: gender || null,
          phone: phone || null,
          country_code: countryCode || null,
          address: address || null,
          clinic_id: registeredClinic?.id || null,
          clinic_name: registeredClinic?.name || clinicName || null,
          medical_history: null,
          improvement_focus: ['cognitive_enhancement'],
          brain_fitness_score: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedPatient = await DatabaseService.add('patients', patientData);

        // Send welcome email to patient via backend API
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          const emailResponse = await fetch(`${API_BASE_URL}/registration-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: patientData.full_name,
              email: patientData.email,
              clinicName: null,
              type: 'patient'
            })
          });
          const emailResult = await emailResponse.json();
          if (emailResult.success) {
          }
        } catch (emailError) {
          console.error('WARNING: Failed to send welcome email:', emailError);
          // Don't fail registration if email fails
        }

        return {
          success: true,
          message: 'Registration successful! A confirmation email has been sent. You can now login with your credentials.',
          user: {
            id: savedPatient?.id || 'pending',
            email: patientData.email,
            name: patientData.full_name,
            role: 'patient'
          }
        };
      }

      // Handle SUPER ADMIN registration - Save to superAdmins table (Active immediately)
      if (userType === 'super_admin') {

        const hashedAdminPwd = await hashPassword(password);
        const superAdminData = {
          full_name: name.trim(),
          first_name: name.trim().split(' ')[0] || '',
          last_name: name.trim().split(' ').slice(1).join(' ') || '',
          email: normalizedEmail,
          password: hashedAdminPwd,
          phone: phone || null,
          avatar: null,
          role: 'super_admin',
          is_active: true,   // Active immediately
          is_email_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const savedSuperAdmin = await DatabaseService.add('superAdmins', superAdminData);

        // Send welcome email to super admin via backend API
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          const emailResponse = await fetch(`${API_BASE_URL}/registration-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: superAdminData.name,
              email: superAdminData.email,
              clinicName: null,
              type: 'super_admin'
            })
          });
          const emailResult = await emailResponse.json();
          if (emailResult.success) {
          }
        } catch (emailError) {
          console.error('WARNING: Failed to send welcome email:', emailError);
          // Don't fail registration if email fails
        }

        return {
          success: true,
          needsActivation: false, // No activation needed
          message: 'Super Administrator registration successful! A confirmation email has been sent. You can now login with your credentials.',
          user: {
            id: savedSuperAdmin?.id || 'pending',
            email: superAdminData.email,
            name: superAdminData.full_name,
            role: 'super_admin'
          }
        };
      }

      // If we reach here, it means an unsupported userType was provided
      throw new Error('Unsupported user type: ' + userType);

    } catch (error) {
      console.error('ERROR: Registration error:', error.message);
      throw new Error(error.message || 'Registration failed');
    }
  },

  // Google OAuth registration
  async registerWithGoogle() {
    try {
      const response = await this.simulateOAuthLogin('google');
      return response;
    } catch (error) {
      throw new Error('Google registration failed');
    }
  },

  async simulateOAuthLogin(provider) {
    throw new Error(`${provider} OAuth not implemented yet`);
  },

  // Get current user
  async getCurrentUser() {
    try {
      // First try to get from localStorage
      const user = localStorage.getItem('user');
      if (user) {
        return JSON.parse(user);
      }

      // Fallback to API call
      const response = await api.get('/auth/me');
      return response.data.user;
    } catch (error) {
      throw new Error('Failed to get user data');
    }
  },

  // Logout
  async logout() {

    // Clear cookies FIRST - most important
    Cookies.remove('authToken');
    Cookies.remove('authToken', { path: '/' });

    // Clear localStorage IMMEDIATELY
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('demoUser');
    localStorage.removeItem('demoToken');

    // Sign out from Supabase (non-blocking with timeout)
    if (supabase && SupabaseService.isAvailable()) {
      const supabaseSignOut = async () => {
        try {
          await supabase.auth.signOut();
        } catch (supabaseError) {
          console.warn('WARNING: Supabase signOut failed:', supabaseError);
        }
      };
      // Don't wait more than 2 seconds for Supabase
      Promise.race([
        supabaseSignOut(),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]).catch(() => {});
    }

    // Try API call with timeout (non-blocking)
    const apiLogout = async () => {
      try {
        await api.post('/auth/logout');
      } catch (apiError) {
      }
    };
    // Don't wait more than 2 seconds for API
    Promise.race([
      apiLogout(),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]).catch(() => {});

  },

  // Forgot Password
  async forgotPassword(email) {
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to send reset email');
    }
  },

  // Reset Password
  async resetPassword(token, newPassword) {
    try {
      const response = await api.post('/auth/reset-password', { token, password: newPassword });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Password reset failed');
    }
  }
};

export default authService;
