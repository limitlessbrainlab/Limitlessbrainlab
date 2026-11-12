import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

/**
 * Generate SSO token and redirect to DDO portal.
 * @param {string} userId - User's LBW ID
 * @param {string} email - User's email
 * @param {string} role - LBW role: 'patient', 'clinic_admin', or 'super_admin'
 * @param {string} [doctorSlug] - Optional doctor booking slug for patient booking redirect
 * @returns {Promise<string>} The redirect URL
 */
export async function generateSSORedirect(userId, email, role, doctorSlug = null) {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Please sign in again to continue');

  const payload = { userId, email, role };
  if (doctorSlug) {
    payload.doctorSlug = doctorSlug;
  }

  const res = await axios.post(
    `${API_URL}/sso/generate-token`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data.redirectUrl;
}

/**
 * Open DDO in the current tab via SSO.
 */
export async function openDDO(userId, email, role, doctorSlug = null) {
  const redirectUrl = await generateSSORedirect(userId, email, role, doctorSlug);
  window.location.href = redirectUrl;
}

/**
 * Open DDO in a new tab via SSO.
 */
export async function openDDONewTab(userId, email, role, doctorSlug = null) {
  const redirectUrl = await generateSSORedirect(userId, email, role, doctorSlug);
  window.open(redirectUrl, '_blank');
}
