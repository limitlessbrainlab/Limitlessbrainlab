import SupabaseService from './supabaseService';

// Central access to the security-definer credential RPCs
// (supabase/migrations/056_credential_rpcs.sql).
//
// Every helper returns `null` when the RPC layer is unavailable
// (e.g. a database that has not been migrated yet), so callers can
// transparently fall back to the legacy browser-side path. Once
// 057_lockdown_credential_columns.sql is applied the legacy path can
// no longer read credential columns and the RPC path is the only one
// that works — rollout stays safe in any deploy order.

const supabase = SupabaseService.supabase;

const FUNC_MISSING_RE =
  /Could not find the function|function .* does not exist|PGRST202|40401/i;

async function callRpc(fn, args) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      if (FUNC_MISSING_RE.test(error.message || '') || error.code === 'PGRST202' || error.code === '40401') {
        console.warn(`credentialRpc: ${fn} not available on this database — using legacy path`);
        return null;
      }
      throw Object.assign(new Error(error.message || `RPC ${fn} failed`), { code: error.code, rpc: fn });
    }
    return data;
  } catch (err) {
    if (FUNC_MISSING_RE.test(err.message || '')) {
      console.warn(`credentialRpc: ${fn} not available on this database — using legacy path`);
      return null;
    }
    throw err;
  }
}

export const credentialRpc = {
  /** Rows whose stored credential matches (bcrypt or legacy plaintext),
   *  returned WITHOUT any credential fields. [] = no match. null = RPC unavailable. */
  verifyClinicLogin: (email, password) =>
    callRpc('verify_clinic_login', { p_email: email, p_password: password }),

  verifyPatientLogin: (email, password) =>
    callRpc('verify_patient_login', { p_email: email, p_password: password }),

  /** Single super-admin profile row (no password) or null. null = RPC unavailable. */
  verifyAdminLogin: async (email, password) => {
    const r = await callRpc('verify_admin_login', { p_email: email, p_password: password });
    return r === null ? null : r; // object or null match; null-over-null indistinguishable by design
  },

  /** Authenticated (admin or self). Throws on refusal. */
  setClinicPassword: (clinicId, newPassword) =>
    callRpc('set_clinic_password', { p_clinic_id: clinicId, p_new_password: newPassword }),

  /** Authenticated (admin or self). Throws on refusal. */
  setPatientPassword: (patientId, newPassword) =>
    callRpc('set_patient_password', { p_patient_id: patientId, p_new_password: newPassword }),

  /** Clinic editing its own patient (ownership gate via clinic_id). */
  setPatientPasswordByClinic: (clinicId, patientId, newPassword) =>
    callRpc('set_patient_password_by_clinic', {
      p_clinic_id: clinicId, p_patient_id: patientId, p_new_password: newPassword,
    }),

  /** Patient self-heal after a successful Supabase Auth sign-in. */
  healPatientPassword: (patientId, newPassword) =>
    callRpc('heal_patient_password', { p_patient_id: patientId, p_new_password: newPassword }),

  /** Set credentials on an account created < 15 min ago with no password yet. */
  claimCredentials: (tableName, email, newPassword) =>
    callRpc('claim_credentials_for_new_account', {
      p_table: tableName, p_email: email, p_new_password: newPassword,
    }),
};

export default credentialRpc;
