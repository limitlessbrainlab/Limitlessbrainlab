import { PUBLIC_COLUMNS } from './publicColumns.js';
import axios from 'axios';
import Cookies from 'js-cookie';
import DatabaseService from './databaseService';
import { hashPassword, comparePassword } from '../utils/passwordUtils';
import credentialRpc from './credentialRpc';
import { getOriginUrl, resolveEnv, canonicalUrlForEnv, sameEnv } from '../utils/environment';

// Import shared Supabase service to avoid multiple client instances
import SupabaseService from './supabaseService';

// Get reference to the shared Supabase client
const supabase = SupabaseService.supabase;

// Base API URL - replace with your actual API endpoint
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

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

    // Thrown when a pre-login table read fails (network down, or an expired session
    // token that 401s). The "Network error:" prefix makes getFriendlyErrorMessage map
    // it to the connectivity message, so a read failure is never shown to the user as
    // "Invalid email or password" (including the LoginForm fallback that re-runs the
    // friendly-error mapper on this text).
    const SERVER_UNREACHABLE = 'Network error: unable to reach the server. Please check your connection and try again.';
    const establishPatientSession = async () => {
      try {
        const repair = await fetch(`${API_BASE_URL}/ensure-patient-auth`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, password })
        });
        if (!repair.ok) return false;
        const retry = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (retry.error || !retry.data?.session?.access_token) return false;
        const binding = await fetch(`${API_BASE_URL}/ensure-patient-auth`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${retry.data.session.access_token}` },
          body: JSON.stringify({ email: normalizedEmail, password })
        });
        if (!binding.ok) return false;
        const result = await binding.json();
        return result.success === true && result.bound === true;
      } catch (error) {
        console.warn('WARNING: patient Supabase session repair failed:', error?.message);
        return false;
      }
    };

    // Clear any stale/expired Supabase session so the pre-login table reads run as the
    // anonymous role. A leftover expired JWT makes clinics/profiles reads 401, which the
    // read helpers used to flatten to [] — surfacing to the user as "Invalid email or
    // password" even though the credentials were correct.
    try {
      if (supabase) await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      // ignore — worst case the reads run with whatever session exists
    }

    try {
      // SUCCESS: PRIORITY 1: Check clinics table first (local password auth)
      // Must be before super admin check — an email may exist in both tables,
      // and clinic passwords are stored locally (not in Supabase Auth).

      // Helper: check clinics table
      const checkClinicsTable = async () => {
        let clinics;
        let credentialVerified = false; // true when the DATABASE verified the password (RPC path)
        try {
          // RPC path: the database checks the credentials and returns only the rows
          // that matched, WITHOUT any credential columns — the browser never sees
          // password data. Falls back to the legacy read+compare path when the RPC
          // is not deployed on this database yet.
          const rpcRows = await credentialRpc.verifyClinicLogin(normalizedEmail, password);
          if (rpcRows !== null) {
            clinics = rpcRows;
            credentialVerified = true;
          } else {
            // Filter by email server-side (was a full-table scan). Case-insensitive to
            // match the previous client-side .trim().toLowerCase() comparison.
            clinics = await DatabaseService.get('clinics', { throwOnError: true, email: normalizedEmail }) || [];
          }
        } catch (readErr) {
          console.error('ALERT: clinics read failed during login:', readErr?.message);
          throw new Error(SERVER_UNREACHABLE);
        }
        const clinicByEmail = clinics.find(c => (c.email || '').trim().toLowerCase() === normalizedEmail);

        if (clinicByEmail) {

          if (clinicByEmail.deletedAt || clinicByEmail.deleted_at) throw new Error('This account has been removed. Please contact support.');

          const isActive = clinicByEmail.isActivated || clinicByEmail.is_active;
          const subscriptionStatus = clinicByEmail.subscriptionStatus || clinicByEmail.subscription_status;

          if (subscriptionStatus === 'pending_approval') {
            throw new Error('Your account is pending activation. Please wait for admin approval. You will receive an email with login credentials once approved.');
          }
          if (!isActive) {
            // Previously approved but since disabled — a "pending activation"
            // message here misled deactivated clinics
            throw new Error('Your account has been deactivated. Please contact support at info@limitlessbrainlab.com.');
          }

          if (credentialVerified) {
            // Password already verified inside the database on the RPC path —
            // the row was only returned because the credentials matched, and it
            // carries no credential fields.
          } else {
            const clinicPasswordMatch = await comparePassword(password, clinicByEmail.password);
            if (!clinicPasswordMatch) {
              throw new Error('Invalid email or password');
            }
          }

          // Environment scoping: an account created on one environment (production vs
          // staging URL) can only log in on that same environment. Skipped when
          // origin_url is absent (accounts created before this feature) so legacy
          // clinics are never locked out.
          if (!sameEnv(clinicByEmail.origin_url, getOriginUrl())) {
            const target = canonicalUrlForEnv(resolveEnv(clinicByEmail.origin_url));
            throw new Error(`This account was created on ${target}. Please log in there.`);
          }

          let clinicSession;
          try {
            const response = await fetch(`${API_BASE_URL}/clinic-session`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: normalizedEmail, password })
            });
            if (!response.ok) throw new Error('Clinic session request failed');
            const exchange = await response.json();
            if (!exchange.token_hash || !exchange.auth_user_id || exchange.clinic_id !== clinicByEmail.id) {
              throw new Error('Clinic session identity mismatch');
            }
            const { data, error } = await supabase.auth.verifyOtp({ token_hash: exchange.token_hash, type: 'magiclink' });
            if (error || !data?.session?.access_token || data.user?.id !== exchange.auth_user_id ||
                data.user?.app_metadata?.role !== 'clinic_admin' || data.user?.app_metadata?.clinic_id !== clinicByEmail.id) {
              throw new Error('Clinic session exchange failed');
            }
            clinicSession = data.session;
          } catch (error) {
            try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* Preserve the login error. */ }
            throw new Error('Unable to establish a secure clinic session. Please try again.');
          }

          return {
            success: true,
            token: clinicSession.access_token,
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
              isActivated: isActive,
              // Baseline for the session-validity poll: if the DB value later advances
              // (email/password changed by an admin), the open session is force-logged-out.
              credentialsUpdatedAt: clinicByEmail.credentials_updated_at || null
            }
          };
        }
        return null;
      };

      // Helper: check patients table
      const checkPatientsTable = async () => {
        let patients = null;
        let credentialVerified = false; // true when the DATABASE verified the password (RPC path)
        try {
          // RPC path: database verifies credentials, returns matched rows WITHOUT
          // credential columns (newest first). Falls back to the legacy read+compare
          // path when the RPC is not deployed on this database yet.
          const rpcRows = await credentialRpc.verifyPatientLogin(normalizedEmail, password);
          if (rpcRows !== null) {
            patients = rpcRows;
            credentialVerified = true;
          }
        } catch (rpcErr) {
          console.error('ALERT: patients RPC login failed:', rpcErr?.message);
          throw new Error(SERVER_UNREACHABLE);
        }

        if (patients === null) {
          const { data: patientsData, error: patientsError } = await supabase
            .from('patients')
            .select('*')
            .eq('email', normalizedEmail)
            // Newest row first: with duplicate-email rows, the Supabase-Auth
            // fallback below picks patients[0], which must match the
            // resolvePatientForUser newest-row rule
            .order('created_at', { ascending: false });

          if (patientsError) {
            console.error('ALERT: patients read failed during login:', patientsError?.message);
            throw new Error(SERVER_UNREACHABLE);
          }
          patients = patientsData;
        }

        if (patients && patients.length > 0) {
          let patient = null;
          let patientHasSupabaseSession = false;
          if (credentialVerified) {
            // Database already verified the credentials; rows arrive newest-first
            // (same ordering rule as the legacy path below).
            patient = patients[0];
          } else {
            for (const p of patients) {
              if (await comparePassword(password, p.password)) {
                patient = p;
                break;
              }
            }
          }

          // Fallback: the email exists as a patient but no row matched the local
          // bcrypt/plaintext password. Clinic-created patients also have a Supabase
          // Auth user (created server-side via /api/create-patient-auth) whose
          // password is authoritative. This recovers logins for rows whose local
          // password is missing/stale (e.g. a client-side hash failure or a bad
          // de-dup merge). Verify against Supabase Auth; if the credentials are
          // genuinely valid, accept the login and self-heal the local hash so
          // subsequent logins take the fast bcrypt path. A wrong password (or a
          // self-registered patient with no auth user) fails here and we fall
          // through to "Invalid email or password" exactly as before.
          if (!patient) {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password
            });
            if (!authError && authData?.user) {
              patient = patients[0];
              patientHasSupabaseSession = Boolean(authData.session?.access_token);
              try {
                const healed = await credentialRpc.healPatientPassword(patient.id, password);
                if (healed === null) {
                  // RPC not deployed (pre-migration DB) — legacy browser-side write
                  await supabase
                    .from('patients')
                    .update({ password: await hashPassword(password) })
                    .eq('id', patient.id);
                }
              } catch (healErr) {
                console.warn('WARNING: could not self-heal patient password hash:', healErr?.message);
              }
            }
          }

          if (patient) {
            // Environment scoping (same rule as clinics): a patient created on one
            // environment can only log in on that environment. Skipped when origin_url
            // is absent so legacy patients are never locked out.
            if (!sameEnv(patient.origin_url, getOriginUrl())) {
              const target = canonicalUrlForEnv(resolveEnv(patient.origin_url));
              throw new Error(`This account was created on ${target}. Please log in there.`);
            }

            // Patient login requires a Supabase session for protected purchases.
            // Rebind only after current local credential proof, even when native Auth still accepts an old password.
            patientHasSupabaseSession = await establishPatientSession();
            if (!patientHasSupabaseSession) {
              await supabase.auth.signOut({ scope: 'local' });
              throw new Error('Unable to establish a secure patient session. Please try again.');
            }

            // Login activity is informational only; it must never change subscription access.
            const { error: loginActivityError } = await supabase
              .from('patients')
              .update({ last_login_at: new Date().toISOString() })
              .eq('id', patient.id);
            if (loginActivityError) console.warn('WARNING: could not record patient login:', loginActivityError.message);

            const { data: { session: patientSession } } = await supabase.auth.getSession();
            if (!patientSession?.access_token) throw new Error('Unable to establish a secure patient session. Please try again.');
            return {
              success: true,
              token: patientSession.access_token,
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
                isActivated: true,
                // Baseline for the session-validity poll: if the DB value later advances
                // (email/password changed by the clinic), the open session is force-logged-out.
                credentialsUpdatedAt: patient.credentials_updated_at || null
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
      let clinicAccessError = null;

      const swallowClinicErrors = (err) => {
        if (err.message === 'Invalid email or password') { clinicPasswordFailed = true; return null; }
        // A pending/removed clinic must not block a separate admin or patient with the same email.
        if (err.message && (err.message.includes('pending') || err.message.includes('account has been removed'))) { clinicAccessError = err; return null; }
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

      // Authenticate before reading a profile: anonymous users cannot enumerate admins.
      const { data: adminAuth, error: adminAuthError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (!adminAuthError && adminAuth?.session?.access_token && adminAuth.user?.id) {
        const { data: profile, error: profileError } = await supabase.from('profiles')
          .select(PUBLIC_COLUMNS.profiles).eq('id', adminAuth.user.id).maybeSingle();
        if (profileError) {
          await supabase.auth.signOut({ scope: 'local' });
          throw new Error(SERVER_UNREACHABLE);
        }
        if (profile?.role === 'super_admin' && profile.id === adminAuth.user.id) {
          return {
            success: true, token: adminAuth.session.access_token,
            user: { id: profile.id, email: profile.email, name: profile.full_name || 'Super Admin',
              role: 'super_admin', avatar: profile.avatar_url || null, isActivated: true }
          };
        }
        await supabase.auth.signOut({ scope: 'local' });
      }

      // Re-throw the clinic access error only after checking other identities
      if (clinicAccessError) throw clinicAccessError;

      // If email was found in clinics but password was wrong, and it's not a superAdmin,
      // fail fast — don't try Supabase Auth with a locally-stored clinic password
      if (clinicPasswordFailed) {
        throw new Error('Invalid email or password');
      }

      throw new Error('Invalid email or password');

    } catch (error) {
      console.error('ALERT: Login error:', error.message);
      throw error;
    }
  },

  // Keep legacy callers on the same verified login path.
  async localAuthenticationOnly(email, password) {
    return this.loginWithEmail({ email, password });
  },

  async registerWithEmail({ name, email, password, confirmPassword, userType = 'patient', dateOfBirth, gender, phone, countryCode, address, city, clinicName, clinicType, clinic_type }) {
    if (!['patient', 'clinic'].includes(userType)) throw new Error('Invalid user type selected');
    if (password !== confirmPassword) throw new Error('Passwords do not match');
    const response = await fetch(`${API_BASE_URL}/register-account`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, userType, dateOfBirth, gender, phone, countryCode, address, city, clinicName, clinicType, clinic_type })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.account?.id) throw new Error(result.message || 'Registration failed');
    const account = result.account;
    try {
      await fetch(`${API_BASE_URL}/registration-confirmation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: account.name || account.full_name, email: account.email,
          clinicName: userType === 'clinic' ? account.name : null, type: userType })
      });
    } catch (error) {
      console.warn('Registration confirmation email failed');
    }
    if (userType === 'clinic') return {
      success: true, needsActivation: true,
      message: 'Clinic registration submitted successfully! Your account is pending activation by our administrator.',
      user: { id: account.id, email: account.email, name: account.name, role: 'clinic_admin' }
    };
    // The account exists even if automatic sign-in fails; never invent a session token.
    try {
      return await this.loginWithEmail({ email: account.email, password, userType: 'patient' });
    } catch {
      throw new Error('Your account was created, but automatic sign-in failed. Please log in to continue.');
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

  // Reset Password
};

export default authService;
