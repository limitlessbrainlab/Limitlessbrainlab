const express = require('express');
const { randomBytes } = require('node:crypto');
const { createRoutedClient } = require('../dbRouter');

function createClinicSessionRouter(db = createRoutedClient()) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || email.length > 320 ||
        typeof password !== 'string' || !password || password.length > 1024) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
      const verify = () => db.rpc('verify_clinic_login', { p_email: email.trim().toLowerCase(), p_password: password });
      const { data: clinics, error } = await verify();
      if (error) throw error;
      if (!Array.isArray(clinics) || clinics.length !== 1) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const clinic = clinics[0];
      const enabled = row => row.is_active === true && !row.deleted_at && row.subscription_status !== 'pending_approval';
      if (!enabled(clinic)) return res.status(403).json({ message: 'This clinic account is unavailable. Please contact support.' });

      let authUserId = clinic.auth_user_id;
      if (!authUserId) {
        // A random, separate identity prevents shared-email patient/admin credential takeover.
        const { data: created, error: createError } = await db.auth.admin.createUser({
          email: `${randomBytes(32).toString('hex')}@clinic-auth.invalid`,
          email_confirm: true,
          app_metadata: { role: 'clinic_admin', clinic_id: clinic.id }
        });
        if (createError || !created?.user?.id) throw createError || new Error('Identity creation failed');
        authUserId = created.user.id;
        let binding = db.from('clinics').update({ auth_user_id: authUserId }).eq('id', clinic.id).is('auth_user_id', null);
        binding = clinic.credentials_updated_at
          ? binding.eq('credentials_updated_at', clinic.credentials_updated_at)
          : binding.is('credentials_updated_at', null);
        const { data: bound, error: bindError } = await binding.select('id').maybeSingle();
        // A transport error may hide a committed binding: do not delete that identity.
        if (bindError) throw bindError;
        if (!bound) {
          await db.auth.admin.deleteUser(authUserId);
          throw new Error('Clinic changed during login; retry');
        }
      }
      const { data: identity, error: identityError } = await db.auth.admin.getUserById(authUserId);
      const user = identity?.user;
      if (identityError || user?.id !== authUserId ||
          user?.app_metadata?.role !== 'clinic_admin' || user?.app_metadata?.clinic_id !== clinic.id ||
          !/^[a-f0-9]{64}@clinic-auth\.invalid$/.test(user?.email || '')) {
        throw new Error('Invalid clinic identity mapping');
      }
      // Recheck credentials and mapping after provisioning; reset/removal must not mint access.
      const { data: current, error: currentError } = await verify();
      if (currentError) throw currentError;
      if (current?.length !== 1 || current[0].id !== clinic.id ||
          current[0].auth_user_id !== authUserId || !enabled(current[0])) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'magiclink', email: user.email });
      if (linkError || link?.user?.id !== authUserId || !link?.properties?.hashed_token) {
        throw new Error('Clinic session exchange failed');
      }
      // generateLink sends no email; the browser exchanges this one-use token with Supabase Auth.
      return res.json({ token_hash: link.properties.hashed_token, auth_user_id: authUserId, clinic_id: clinic.id });
    } catch (error) {
      // Never log provider errors here: they may contain credentials or generated links.
      console.error('Clinic session could not be established');
      return res.status(503).json({ message: 'Unable to establish a secure clinic session. Please try again.' });
    }
  });
  return router;
}

module.exports = { createClinicSessionRouter };
