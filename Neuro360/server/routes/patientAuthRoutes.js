const express = require('express');
const { findAuthUserByEmail } = require('../utils/findAuthUserByEmail');
const { createRoutedClient } = require('../dbRouter');

function createPatientAuthRouter(db = createRoutedClient()) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || !password.trim() || password.length > 1024) {
      return res.status(400).json({ success: false, error: 'Invalid email or password' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const denied = () => res.status(401).json({ success: false, error: 'Invalid email or password' });
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (req.headers.authorization && !token) return denied();
    try {
      let nativeUser = null;
      if (token) {
        const { data, error } = await db.auth.getUser(token);
        if (error || !data?.user || data.user.email?.trim().toLowerCase() !== normalizedEmail) return denied();
        nativeUser = data.user;
      }
      const { data: patients, error: verifyError } = await db.rpc('verify_patient_login', { p_email: normalizedEmail, p_password: password });
      if (verifyError) throw verifyError;
      const patient = patients?.[0];
      if (!patient?.id) return denied();
      // Protected APIs resolve the newest email row; an older duplicate's password cannot reset it.
      const { data: latest, error: latestError } = await db.from('patients').select('id')
        .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
        .order('created_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      if (latest?.id !== patient.id) return denied();

      let authUser = await findAuthUserByEmail(db, normalizedEmail);
      if (nativeUser && nativeUser.id !== authUser?.id) return denied();
      if (patient.auth_user_id && patient.auth_user_id !== authUser?.id) return denied();
      if (authUser) {
        const role = authUser.app_metadata?.role;
        if (role && role !== 'patient') return denied();
        const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', authUser.id).maybeSingle();
        if (profileError) throw profileError;
        if (profile?.role && profile.role !== 'patient') return denied();
        if (!token) {
          const { error } = await db.auth.admin.updateUserById(authUser.id, { password });
          if (error) throw error;
        }
      } else {
        const { data: created, error } = await db.auth.admin.createUser({
          email: normalizedEmail, password, email_confirm: true,
          app_metadata: { role: 'patient' }, user_metadata: { full_name: patient.full_name || '' }
        });
        // Concurrent creation is not permission to update a now-existing identity; retry the checks.
        if (error || !created?.user?.id) throw error || new Error('Identity creation failed');
        authUser = created.user;
      }
      if (!token) return res.json({ success: true, bound: false });
      if (patient.auth_user_id !== authUser.id) {
        // Rebinding the same UID must not revive old sessions after a credential reset.
        const { error } = await db.auth.admin.signOut(token, 'others');
        if (error) throw error;
      }
      const { data: current, error: currentError } = await db.rpc('verify_patient_login', { p_email: normalizedEmail, p_password: password });
      if (currentError) throw currentError;
      const verified = current?.[0];
      if (verified?.id !== patient.id || (verified.credentials_updated_at || null) !== (patient.credentials_updated_at || null) ||
          (verified.auth_user_id && verified.auth_user_id !== authUser.id)) return denied();
      let binding = db.from('patients').update({ auth_user_id: authUser.id }).eq('id', patient.id);
      binding = patient.credentials_updated_at ? binding.eq('credentials_updated_at', patient.credentials_updated_at) : binding.is('credentials_updated_at', null);
      binding = verified.auth_user_id ? binding.eq('auth_user_id', verified.auth_user_id) : binding.is('auth_user_id', null);
      const { data: bound, error: bindError } = await binding.select('id').maybeSingle();
      if (bindError) throw bindError;
      if (!bound) return denied();
      return res.json({ success: true, bound: true });
    } catch {
      console.error('Patient Auth repair could not be completed');
      return res.status(503).json({ success: false, error: 'Could not establish a secure patient session. Please try again.' });
    }
  });
  return router;
}
module.exports = { createPatientAuthRouter };
