const { verifiedPortalUser } = require('../utils/verifiedPortalUser');
const express = require('express');
const { createRoutedClient } = require('../dbRouter');

function createClinicAccountsRouter(db = createRoutedClient()) {
  const router = express.Router();
  router.delete('/:id', async (req, res) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) return res.status(401).json({ message: 'Authentication required' });
      const user = await verifiedPortalUser(db, token);
      if (!user) return res.status(401).json({ message: 'Invalid or expired session' });
      if (user.role !== 'super_admin') return res.status(403).json({ message: 'Super admin access required' });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(400).json({ message: 'Invalid clinic ID' });
      }
      const { data: clinic, error: readError } = await db.from('clinics').select('id, deleted_at').eq('id', req.params.id).maybeSingle();
      if (readError) throw readError;
      if (!clinic) return res.status(404).json({ message: 'Clinic/partner account not found' });
      if (!clinic.deleted_at) {
        const now = new Date().toISOString();
        // One update disables login/session checks while retaining every related record.
        const { error } = await db.from('clinics').update({
          deleted_at: now, is_active: false, credentials_updated_at: now, updated_at: now
        }).eq('id', clinic.id).is('deleted_at', null).select('id').maybeSingle();
        if (error) throw error;
      }
      return res.json({ success: true });
    } catch (error) {
      console.error('Clinic account removal failed:', error.message);
      return res.status(500).json({ message: 'Unable to remove the account. Please try again.' });
    }
  });
  return router;
}

module.exports = { createClinicAccountsRouter };
