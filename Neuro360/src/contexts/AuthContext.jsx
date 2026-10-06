import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';
import { authService } from '../services/authService';
import DatabaseService from '../services/databaseService';
import supabase from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../utils/friendlyError';
import { clearAllAndSignOut } from '../utils/sessionCleanup';
import { reloadAllowed } from '../utils/guardedReload';

/* global __APP_BUILD_ID__ */
// Unique id of the deployed build (injected by vite define). Changes every deployment,
// and prefers a commit-aware signature when the build environment provides one.
const DEPLOY_SIGNATURE = import.meta.env.VITE_DEPLOY_SIGNATURE ||
  import.meta.env.VITE_APP_BUILD_ID ||
  import.meta.env.VITE_COMMIT_SHA ||
  import.meta.env.VITE_GIT_COMMIT ||
  import.meta.env.VITE_GIT_SHA ||
  'dev';
const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : DEPLOY_SIGNATURE;
const INACTIVITY_LIMIT_MS = 20 * 60 * 1000; // 20 minutes

// In production, the backend API may be hosted on a different origin from the
// static frontend. Use VITE_API_URL for backend deploy-version polling.
const BACKEND_API_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (typeof window !== 'undefined' ? window.location.origin : '');

// Bulletproof: strip any trailing /api, then add exactly one. Prevents the
// /api/api/app-version double-prefix that silently broke deploy detection.
const getBackendAppVersionUrl = () => {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  const root = base.replace(/\/api$/, '');
  return `${root}/api/app-version`;
};

// START: DEVELOPMENT MODE: Bypass authentication
const BYPASS_AUTH = import.meta.env.VITE_BYPASS_AUTH === 'true' || false; // Set to false to enable authentication

// A return from Stripe (payment=success on a /dashboard route) must NOT trigger the
// deploy gate or the new-build force-logout. Both wipe the session, which drops the
// user on the landing/login page instead of returning them to the page they bought
// from (e.g. Frequencies) with the purchase applied. The payment query is short-lived
// (the target page clears it on mount), so this only suppresses a wipe during the
// brief return window; the next normal load re-gates as usual.
const isPaymentReturn = () => {
  try {
    const s = window.location.search || '';
    const p = window.location.pathname || '';
    return (s.includes('payment=success') || s.includes('meditation_payment=success')) && p.includes('/dashboard');
  } catch (e) {
    return false;
  }
};

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is logged in on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Auto-logout after 20 minutes of inactivity (clears all cache/storage on the way out).
  useEffect(() => {
    if (BYPASS_AUTH || !isAuthenticated) return;

    const touch = () => { try { localStorage.setItem('lastActivity', String(Date.now())); } catch (e) { /* ignore */ } };
    // Seed on (re)auth so a fresh session starts the clock now.
    touch();

    let lastWrite = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 30000) { lastWrite = now; touch(); } // throttle writes to ~30s
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const forceIdleLogout = async () => {
      await clearAllAndSignOut();
      localStorage.setItem('app_build_id', APP_BUILD_ID); // keep build id so deploy gate doesn't refire
      window.location.replace('/');
    };

    const checkIdle = () => {
      const last = parseInt(localStorage.getItem('lastActivity') || '0', 10);
      if (last && Date.now() - last > INACTIVITY_LIMIT_MS) forceIdleLogout();
    };
    checkIdle(); // covers returning to a tab left idle > 20 min
    const interval = setInterval(checkIdle, 60 * 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Force logout of OPEN sessions when a NEW deployment goes live (Vercel frontend OR
  // Render backend), without needing the user to refresh. Polls a per-build version every
  // 60s + on tab refocus; any change since this session started → full wipe + reload.
  // Authenticated-only so public pages are never disrupted; loop-proof (see below).
  useEffect(() => {
    // Vite dev already hot-reloads changed code; polling deployment versions locally
    // only adds noise to performance traces. Keep the protection in production.
    if (BYPASS_AUTH || !isAuthenticated || !import.meta.env.PROD) return;
    let stopped = false;
    let backendBaseline = null; // backend version present when this session started
    let frontendBaseline = null; // frontend version present when this session started

    const wipeAndReload = async () => {
      stopped = true;
      try { await clearAllAndSignOut({ preserveRemembered: false }); } catch (e) { /* ignore */ }
      localStorage.setItem('app_build_id', APP_BUILD_ID); // keep on-load gate consistent
      // clearAllAndSignOut() wipes sessionStorage — restamp the deploy-reload
      // guard so a version.json/bundle skew can't re-trigger within its window
      try { sessionStorage.setItem('guarded_reload_deploy', String(Date.now())); } catch (e) { /* ignore */ }
      window.location.reload();
    };

    const check = async () => {
      // Force-logout clinic/patient sessions whose email or password was changed server-side.
      // Their session is a self-contained localStorage blob that is otherwise never re-checked;
      // this reuses the same 60s poll. Fail-open — any error keeps the session (never lock out
      // a valid user on a transient hiccup). Suppressed while returning from Stripe.
      try {
        const rawUser = localStorage.getItem('user');
        const u = rawUser ? JSON.parse(rawUser) : null;
        if (u && (u.role === 'clinic_admin' || u.role === 'patient') && !isPaymentReturn()) {
          const root = BACKEND_API_URL.replace(/\/api$/, '');
          const resp = await fetch(`${root}/api/validate-session?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
              userId: u.id,
              role: u.role,
              email: u.email,
              credentialsUpdatedAt: u.credentialsUpdatedAt || null,
            }),
          });
          if (!stopped && resp.ok) {
            const j = await resp.json().catch(() => null);
            if (j && j.valid === false) {
              stopped = true;
              try { await clearAllAndSignOut(); } catch (e) { /* ignore */ }
              localStorage.setItem('app_build_id', APP_BUILD_ID); // keep on-load gate consistent
              const loginPath = u.role === 'patient' ? '/patient/login' : '/clinic/login';
              window.location.href = `${loginPath}?reason=credentials-updated`;
              return;
            }
          }
        }
      } catch (e) { /* offline/transient → keep session */ }
      if (stopped) return;
      try {
        const [f, b] = await Promise.allSettled([
          fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${getBackendAppVersionUrl()}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (stopped) return;
        const front = f.status === 'fulfilled' && f.value
          ? (f.value.buildId || f.value.deploySignature || f.value.version || null)
          : null;
        const back = b.status === 'fulfilled' && b.value
          ? (b.value.deploySignature || b.value.buildId || b.value.version || null)
          : null;
        // Capture baselines on first check (no action — prevents false-positive
        // reload when APP_BUILD_ID defaults to 'dev' and doesn't match version.json)
        if (front != null && frontendBaseline == null) frontendBaseline = front;
        if (back != null && backendBaseline == null) backendBaseline = back;
        const frontChanged = front && frontendBaseline != null && front !== frontendBaseline; // Vercel redeployed
        const backChanged = back != null && backendBaseline != null && back !== backendBaseline; // Render redeployed
        // A tab left open across a deploy runs a bundle OLDER than the live one; the
        // baseline comparison above never catches it (the first check after login adopts
        // the NEW version as baseline). Compare the live build id against the RUNNING
        // bundle's id directly — same-build version.json always matches, so this only
        // fires for a genuinely stale bundle. Rate-limited via reloadAllowed('deploy')
        // so an edge-cache skew can't loop.
        const frontStale = import.meta.env.PROD && front && APP_BUILD_ID && APP_BUILD_ID !== 'dev' && front !== APP_BUILD_ID;
        // Defer the wipe while returning from Stripe — otherwise the purchase page is
        // reloaded into a logged-out state. The payment query clears on mount, so the
        // next 60s/visibility check will still pick up the new build.
        if (!isPaymentReturn() && (frontChanged || backChanged || (frontStale && reloadAllowed('deploy')))) await wipeAndReload();
      } catch (e) { /* offline/transient → ignore */ }
    };

    const id = setInterval(check, 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    check(); // immediate first check (captures baselines only — no reload)

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAuthenticated]);


  const checkAuthStatus = async () => {
    try {
      // DEPLOY GATE: if the running build differs from the one this browser last saw,
      // a new deployment is live → wipe everything and hard-refresh into a clean build.
      if (!BYPASS_AUTH) {
        const storedBuildId = localStorage.getItem('app_build_id');
        if (storedBuildId !== APP_BUILD_ID && isPaymentReturn()) {
          // New build loaded on the way back from Stripe: sync the build id but keep
          // the session so the user lands back on their purchase page, not login.
          localStorage.setItem('app_build_id', APP_BUILD_ID);
        } else if (storedBuildId !== APP_BUILD_ID) {
          let hadSession = !!(localStorage.getItem('authToken') || localStorage.getItem('user'));
          if (!hadSession && supabase) {
            try {
              const { data: { session: maybeSession } } = await supabase.auth.getSession();
              hadSession = !!maybeSession?.user;
            } catch (e) {
              // ignore failures while checking persisted Supabase session
            }
          }
          await clearAllAndSignOut({ preserveRemembered: false });
          localStorage.setItem('app_build_id', APP_BUILD_ID); // set AFTER clear → no reload loop
          if (hadSession) { window.location.reload(); return; } // hard refresh into login
        } else {
          localStorage.setItem('app_build_id', APP_BUILD_ID);
        }
      }

      // START: DEVELOPMENT MODE: Auto-authenticate with default user
      if (BYPASS_AUTH) {

        // Check if user was previously set (from login)
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            setIsAuthenticated(true);
            setLoading(false);
            return;
          } catch (e) {
          }
        }

        // Default super admin user if no stored user
        const defaultUser = {
          id: 'dev-super-admin',
          name: 'Super Admin (Dev)',
          email: 'superadmin@neurosense360.com',
          role: 'super_admin',
          profilePicture: null,
          isActivated: true,
          clinicId: null
        };

        setUser(defaultUser);
        setIsAuthenticated(true);
        setLoading(false);
        localStorage.setItem('user', JSON.stringify(defaultUser));
        return;
      }

      // PRODUCTION MODE: Check for stored authentication
      // First check localStorage for token and user
      const storedToken = localStorage.getItem('authToken') || Cookies.get('authToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);

          // Super admins authenticate via a real Supabase JWT — never trust the
          // localStorage copy blindly. Validate the live session against the
          // Supabase server, confirm it belongs to the same email, and re-derive
          // the role from profiles. If anything is missing/expired/tampered,
          // clear everything and force a fresh login.
          // (Clinics & patients use local_token_* with no Supabase session, so
          //  they keep the existing localStorage-restore behavior below.)
          if (parsedUser.role === 'super_admin') {
            if (!supabase) {
              throw new Error('Supabase unavailable — cannot validate admin session');
            }

            const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
            const sameEmail = authUser?.email?.toLowerCase() === parsedUser.email?.toLowerCase();

            if (authErr || !authUser || !sameEmail) {
              throw new Error('Invalid or expired admin session');
            }

            // Re-derive role from the trusted profiles table (defends against a
            // tampered localStorage role).
            const { data: profile } = await supabase
              .from('profiles')
              .select('role, full_name, avatar_url')
              .eq('id', authUser.id)
              .single();

            if (!profile || profile.role !== 'super_admin') {
              throw new Error('Account is not a super admin');
            }

            const validatedUser = {
              ...parsedUser,
              id: authUser.id,
              email: authUser.email,
              role: 'super_admin',
              name: profile.full_name || parsedUser.name,
              avatar: profile.avatar_url || parsedUser.avatar,
            };

            setUser(validatedUser);
            setIsAuthenticated(true);
            localStorage.setItem('user', JSON.stringify(validatedUser));
            setLoading(false);
            return;
          }

          // Non-admin (clinic/patient): restore from localStorage
          setUser(parsedUser);
          setIsAuthenticated(true);
          setLoading(false);
          return;
        } catch (e) {
          // Validation failed (or bad JSON) — clear any stale auth so the user
          // is sent to /login by ProtectedRoute instead of seeing the admin UI.
          localStorage.removeItem('user');
          localStorage.removeItem('authToken');
          Cookies.remove('authToken');
          Cookies.remove('authToken', { path: '/' });
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }
      }

      // If no localStorage auth, check Supabase session
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Get user profile from database
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          const userData = {
            id: session.user.id,
            email: session.user.email,
            name: profile?.full_name || session.user.user_metadata?.full_name || 'User',
            role: profile?.role || session.user.user_metadata?.role || 'patient',
            avatar: profile?.avatar_url,
            isActivated: true
          };

          setUser(userData);
          setIsAuthenticated(true);
          localStorage.setItem('user', JSON.stringify(userData));
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials, method = 'email') => {

    // START: DEVELOPMENT MODE: Auto-succeed login
    if (BYPASS_AUTH) {
      setLoading(true);

      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 500));

      // Determine user role based on email patterns
      const email = credentials.email || 'dev@neurosense360.com';
      let userRole = 'super_admin'; // default
      let userName = 'Development User';
      let clinicId = null;

      // Role detection based on email patterns
      if (email.includes('superadmin') || email.includes('admin@neurosense')) {
        userRole = 'super_admin';
        userName = 'Super Admin (Dev)';
        clinicId = null;
      } else if (email.includes('clinic') || email.includes('@clinic') ||
                 email.includes('doctor') || email.includes('dr.')) {
        userRole = 'clinic_admin';
        userName = 'Clinic Admin (Dev)';
        clinicId = 'dev-clinic-123';
      } else if (email.includes('patient')) {
        userRole = 'patient';
        userName = 'Patient (Dev)';
        clinicId = 'dev-clinic-123';
      }

      const defaultUser = {
        id: `dev-${userRole}-${Date.now()}`,
        name: userName,
        email: email,
        role: userRole,
        profilePicture: null,
        isActivated: true,
        clinicId: clinicId
      };

      setUser(defaultUser);
      setIsAuthenticated(true);
      setLoading(false);
      localStorage.setItem('user', JSON.stringify(defaultUser));
      localStorage.setItem('authToken', 'dev-bypass-token');

      toast.success(`START: Development mode login as ${userRole}!`);

      return {
        success: true,
        user: defaultUser,
        message: 'Development mode login successful'
      };
    }

    try {
      setLoading(true);
      let response;
      
      
      switch (method) {
        case 'email':
          {
            let timeoutId;
            try {
              response = await Promise.race([
                authService.loginWithEmail(credentials),
                new Promise((_, reject) => {
                  timeoutId = setTimeout(() => reject(new Error('Login request timed out')), 15000);
                }),
              ]);
            } finally {
              clearTimeout(timeoutId);
            }
          }
          break;
        case 'google':
          response = await authService.loginWithGoogle();
          break;
        case 'github':
          response = await authService.loginWithGitHub();
          break;
        case 'facebook':
          response = await authService.loginWithFacebook();
          break;
        default:
          throw new Error('Invalid authentication method');
      }


      if (response && response.success && response.token) {
        // Store authentication data in multiple places for reliability
        Cookies.set('authToken', response.token, { expires: 7 }); // 7 days
        localStorage.setItem('authToken', response.token);
        
        // Fetch the latest user data from database to get updated profile picture
        let latestUserData = response.user;
        try {
          // super_admin: authService already returns name + avatar (full_name/avatar_url)
          // from the profiles row it fetched, so no extra findById round-trip is needed here.
          if (response.user.role === 'clinic_admin') {

            // Try to find clinic by ID first
            let clinicData = await DatabaseService.findById('clinics', response.user.id);

            // If not found by ID, try by email
            if (!clinicData) {
              const clinicsByEmail = await DatabaseService.findBy('clinics', 'email', response.user.email);
              if (clinicsByEmail && clinicsByEmail.length > 0) {
                clinicData = clinicsByEmail[0];
              }
            }


            if (clinicData) {
              // Map contact_person to name and logo_url to avatar for the UI
              latestUserData = {
                ...response.user,
                ...clinicData,
                clinicName: clinicData.name || '',
                name: clinicData.contact_person || clinicData.name || response.user.name,
                avatar: clinicData.logo_url || clinicData.avatar || response.user.avatar
              };
            } else {
            }
          } else if (response.user.role === 'patient') {

            // Try to find patient by ID first
            let patientData = await DatabaseService.findById('patients', response.user.id);

            // If not found by ID, try by email
            if (!patientData) {
              const patientsByEmail = await DatabaseService.findBy('patients', 'email', response.user.email);
              if (patientsByEmail && patientsByEmail.length > 0) {
                patientData = patientsByEmail[0];
              }
            }


            if (patientData) {
              // Map avatar fields from database to user object
              const avatarUrl = patientData.avatar || patientData.profile_image || patientData.profileImage || patientData.avatar_url;

              latestUserData = {
                ...response.user,
                ...patientData,
                name: patientData.name || patientData.full_name || response.user.name,
                avatar: avatarUrl,
                profile_image: avatarUrl,
                profileImage: avatarUrl,
                avatar_url: avatarUrl
              };
            } else {
            }
          }
        } catch (dbError) {
          // Continue with API response if database fetch fails
        }
        
        // Store the latest user data
        localStorage.setItem('user', JSON.stringify(latestUserData));
        
        // Set state
        setUser(latestUserData);
        setIsAuthenticated(true);
        
        
        toast.success('Logged in successfully');
        return { success: true, user: latestUserData };
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error) {
      console.error('ALERT: AuthContext: Login failed:', error);
      toast.error(getFriendlyErrorMessage(error, 'Login failed. Please try again.'));
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData, method = 'email') => {

    // START: DEVELOPMENT MODE: Auto-succeed registration
    if (BYPASS_AUTH) {
      setLoading(true);

      // Simulate loading time
      await new Promise(resolve => setTimeout(resolve, 800));

      const defaultUser = {
        id: 'dev-user-' + Date.now(),
        name: userData.name || 'Development User',
        email: userData.email || 'dev@neurosense360.com',
        role: userData.userType === 'super_admin' ? 'super_admin' :
              userData.userType === 'patient' ? 'patient' : 'clinic_admin',
        profilePicture: null,
        isActivated: true,
        clinicId: 'dev-clinic-123'
      };

      setUser(defaultUser);
      setIsAuthenticated(true);
      setLoading(false);
      localStorage.setItem('user', JSON.stringify(defaultUser));
      localStorage.setItem('authToken', 'dev-bypass-token');

      toast.success('START: Development mode registration successful!');

      return {
        success: true,
        user: defaultUser,
        message: 'Development mode registration successful'
      };
    }

    try {
      setLoading(true);
      let response;
      
      
      switch (method) {
        case 'email':
          response = await authService.registerWithEmail(userData);
          break;
        case 'google':
          response = await authService.registerWithGoogle();
          break;
        case 'github':
          response = await authService.registerWithGitHub();
          break;
        case 'facebook':
          response = await authService.registerWithFacebook();
          break;
        default:
          throw new Error('Invalid registration method');
      }


      if (response && response.success) {
        if (response.needsActivation) {
          // Super admin needs activation - don't login automatically
          toast.success(response.message || 'Registration submitted for approval!');
          return { success: true, needsActivation: true };
        } else if (response.token) {
          // Normal registration with immediate login
          Cookies.set('authToken', response.token, { expires: 7 });
          localStorage.setItem('authToken', response.token);
          
          // Fetch the latest user data from database to get updated profile picture
          let latestUserData = response.user;
          try {
            if (response.user.role === 'super_admin') {
              const superAdminData = await DatabaseService.findById('superAdmins', response.user.id);
              if (superAdminData) {
                latestUserData = { ...response.user, ...superAdminData };
              }
            } else if (response.user.role === 'clinic_admin') {

              // Try to find clinic by ID first
              let clinicData = await DatabaseService.findById('clinics', response.user.id);

              // If not found by ID, try by email
              if (!clinicData) {
                const clinicsByEmail = await DatabaseService.findBy('clinics', 'email', response.user.email);
                if (clinicsByEmail && clinicsByEmail.length > 0) {
                  clinicData = clinicsByEmail[0];
                }
              }


              if (clinicData) {
                // Map contact_person to name and logo_url to avatar for the UI
                latestUserData = {
                  ...response.user,
                  ...clinicData,
                  clinicName: clinicData.name || '',
                  name: clinicData.contact_person || clinicData.name || response.user.name,
                  avatar: clinicData.logo_url || clinicData.avatar || response.user.avatar
                };
              } else {
              }
            }
          } catch (dbError) {
            // Continue with API response if database fetch fails
          }
          
          // Store the latest user data
          localStorage.setItem('user', JSON.stringify(latestUserData));
          
          setUser(latestUserData);
          setIsAuthenticated(true);
          
          
          toast.success(response.message || 'Registration successful!');
          return { success: true };
        } else {
          return { success: false, error: 'Registration completed but login failed' };
        }
      } else {
        // Handle case where response doesn't have success field or is falsy
        const errorMessage = response?.error || response?.message || 'Registration failed with unknown error';
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('Registration failed:', error);
      toast.error(getFriendlyErrorMessage(error, 'Registration failed. Please try again.'));
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    // Clear React state immediately for snappy UI.
    setUser(null);
    setIsAuthenticated(false);
    toast.success('Logged out successfully');

    // authService logout in background (don't await).
    if (!BYPASS_AUTH) {
      authService.logout().catch(err => console.warn('Background authService logout:', err));
    }

    // Full wipe: cookies, all localStorage/sessionStorage, Cache Storage, service workers,
    // and Supabase sign-out — then a hard refresh to a clean state.
    try { await clearAllAndSignOut(); } catch (e) { /* ignore */ }
    localStorage.setItem('app_build_id', APP_BUILD_ID); // keep build id so deploy gate doesn't refire
    window.location.href = '/';
  };



  const updateUser = async (userData) => {
    try {
      setLoading(true);

      // Snapshot current state so we can roll back if the DB write fails
      const previousUser = user;
      const previousUserStorage = localStorage.getItem('user');

      // Update local state immediately for better UX
      const updatedUser = { ...user, ...userData };

      // If avatar is being updated, also add to profile_image and avatar_url for consistency
      if (userData.avatar) {
        updatedUser.profile_image = userData.avatar;
        updatedUser.avatar_url = userData.avatar;
        updatedUser.profileImage = userData.avatar;
      }

      setUser(updatedUser);

      // Update localStorage
      localStorage.setItem('user', JSON.stringify(updatedUser));

      // SUCCESS: CRITICAL: Update Supabase Auth password FIRST if password is being changed
      if (userData.password && supabase) {
        try {
          const { error: authError } = await supabase.auth.updateUser({
            password: userData.password
          });

          if (authError) {
            // Continue anyway to update local database
          } else {
          }
        } catch (authError) {
          // Continue anyway to update local database
        }
      }

      // Save to database based on user role
      try {
        if (user?.role === 'super_admin') {
          // Update super admin in database
          await DatabaseService.update('superAdmins', user.id, userData);
        } else if (user?.role === 'clinic_admin') {
          // Map clinicName to name for database
          const clinicData = { ...userData };
          if (clinicData.clinicName) {
            clinicData.name = clinicData.clinicName;
            delete clinicData.clinicName;
          }
          // Map name (contact person) to contact_person for database
          if (clinicData.name && !clinicData.contact_person) {
            clinicData.contact_person = clinicData.name;
          }
          // Map avatar to logo_url (clinics table doesn't have avatar field)
          if (clinicData.avatar) {
            clinicData.logo_url = clinicData.avatar;
            delete clinicData.avatar;
          }
          // Update clinic admin in database
          const updateResult = await DatabaseService.update('clinics', user.id, clinicData);
        } else {
          // For regular users (patients), find patient record and update

          // Find patient record by email
          const allPatients = await DatabaseService.get('patients');
          const userEmailLower = user.email.trim().toLowerCase();
          const patientRecord = allPatients.find(p => {
            if (!p.email) return false;
            return p.email.trim().toLowerCase() === userEmailLower;
          });

          if (!patientRecord) {
            console.error('ERROR: Patient record not found for email:', user.email);
            throw new Error('Patient record not found');
          }


          // Map avatar field to database fields
          const patientData = { ...userData };

          if (patientData.avatar) {
            // Map avatar to the real DB columns only when we actually have an image URL
            patientData.profile_image = patientData.avatar;
            patientData.avatar_url = patientData.avatar;
          }
          // avatar is a UI-only alias — never send it to the patients table (no such column)
          delete patientData.avatar;

          // Remove password fields from patient data (handled separately by Supabase Auth)
          delete patientData.password;
          delete patientData.currentPassword;
          delete patientData.confirmPassword;


          // Update patient record in database
          const updateResult = await DatabaseService.update('patients', patientRecord.id, patientData);
        }
      } catch (dbError) {
        console.error('ERROR: Database update failed:', dbError);
        // Roll back the optimistic update so the UI reflects reality instead of
        // showing a fake success (e.g. when an RLS policy rejects the write).
        setUser(previousUser);
        if (previousUserStorage !== null) {
          localStorage.setItem('user', previousUserStorage);
        } else {
          localStorage.removeItem('user');
        }
        const message = getFriendlyErrorMessage(dbError, 'We could not save your changes. Please try again.');
        toast.error(message);
        return { success: false, error: message };
      }

      toast.success('Profile updated successfully!');
      return { success: true };
    } catch (error) {
      console.error('Profile update failed:', error);
      toast.error(getFriendlyErrorMessage(error, 'We could not update your profile. Please try again.'));
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Memoized so every AuthProvider render doesn't hand a brand-new object to
  // all consumers (which would re-render everything that calls useAuth)
  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    checkAuthStatus,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, loading, isAuthenticated]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
