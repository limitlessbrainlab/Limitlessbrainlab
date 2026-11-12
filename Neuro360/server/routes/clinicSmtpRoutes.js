const { verifiedPortalUser } = require('../utils/verifiedPortalUser');
const express = require('express');
const { createRoutedClient } = require('../dbRouter');

function createClinicSmtpRouter(db = createRoutedClient()) {
  const router = express.Router();
  router.route('/').get(handle).put(handle);

  async function handle(req, res) {
    res.set('Cache-Control', 'no-store');
    try {
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return res.status(401).json({ message: 'Authentication required' });
      const user = await verifiedPortalUser(db, token);
      if (!user) return res.status(401).json({ message: 'Invalid or expired session' });
      const clinicId = req.query.clinicId;
      if (typeof clinicId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId)) {
        return res.status(400).json({ message: 'Invalid clinic ID' });
      }
      const isAdmin = user.role === 'super_admin';
      // Read authorization fields first: an unrelated account never fetches the secret.
      let access = db.from('clinics').select('id').eq('id', clinicId).is('deleted_at', null);
      if (!isAdmin) access = access.eq('auth_user_id', user.id).eq('is_active', true).or('subscription_status.is.null,subscription_status.neq.pending_approval');
      const { data: clinic, error: accessError } = await access.maybeSingle();
      if (accessError) throw accessError;
      if (!clinic) return res.status(403).json({ message: 'Clinic access required' });

      let query = db.from('clinics');
      if (req.method === 'PUT') {
        const { smtp_email, smtp_password } = req.body || {};
        if (typeof smtp_email !== 'string' || smtp_email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtp_email.trim()) ||
            typeof smtp_password !== 'string' || !smtp_password.trim() || smtp_password.length > 1024) {
          return res.status(400).json({ message: 'A valid email and App Password are required' });
        }
        query = query.update({ smtp_email: smtp_email.trim(), smtp_password, updated_at: new Date().toISOString() });
      }
      // Reapply ownership and activation checks to the actual operation (removal can race the first read).
      query = query.select('smtp_email,smtp_password').eq('id', clinic.id).is('deleted_at', null);
      if (!isAdmin) query = query.eq('auth_user_id', user.id).eq('is_active', true).or('subscription_status.is.null,subscription_status.neq.pending_approval');
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ message: 'Clinic access required' });
      return res.json({ smtp_email: data.smtp_email || '', smtp_password: data.smtp_password || '' });
    } catch {
      // Provider errors can include the submitted password; never log them.
      console.error('Clinic email settings request failed');
      return res.status(500).json({ message: 'Unable to access email settings. Please try again.' });
    }
  }
  return router;
}

module.exports = { createClinicSmtpRouter };
