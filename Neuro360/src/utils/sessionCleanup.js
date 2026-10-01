// Session / cache cleanup helpers.
// Used to guarantee a fresh state on new deployment, inactivity timeout, logout and login.
import Cookies from 'js-cookie';
import { supabase } from '../lib/supabaseClient';

// Key under which "Remember me" stores { email, password }. Deliberately preserved
// across every session wipe so remembered credentials survive logout.
export const REMEMBER_KEY = 'rememberedCredentials';

// Best-effort wipe of the browser's Cache Storage and any service workers.
// (JS cannot purge the HTTP disk cache directly; this + a reload loads fresh assets.)
export async function wipeBrowserCaches() {
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { /* ignore */ }
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { /* ignore */ }
}

// Full wipe + sign out. For deploy gate, inactivity timeout and manual logout.
export async function clearAllAndSignOut({ preserveRemembered = true } = {}) {
  // This runs before the login screen is usable after a deploy. Local sign-out
  // clears the persisted session without waiting for a networked global logout.
  try { if (supabase) await supabase.auth.signOut({ scope: 'local' }); } catch (e) { /* ignore */ }
  try { Cookies.remove('authToken'); Cookies.remove('authToken', { path: '/' }); } catch (e) { /* ignore */ }
  try {
    const remembered = preserveRemembered ? localStorage.getItem(REMEMBER_KEY) : null;
    localStorage.clear();
    if (remembered !== null) localStorage.setItem(REMEMBER_KEY, remembered);
  } catch (e) { /* ignore */ }
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  void wipeBrowserCaches();
}

// Clear stale cached app DATA but keep the (just-established) auth session. For login.
export async function clearAppDataCachesKeepSession() {
  void wipeBrowserCaches();
  try {
    const stale = ['reports', 'clinics'];
    Object.keys(localStorage).forEach((k) => {
      if (/^(dbCache_|patients_|patient_reports_|patient_portal_v1:|admin_report_page_|clinic_)/.test(k) || stale.includes(k)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) { /* ignore */ }
}
