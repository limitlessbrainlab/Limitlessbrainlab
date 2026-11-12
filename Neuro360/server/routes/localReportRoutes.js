const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { authMiddleware } = require('../middleware/authMiddleware');
const { createRoutedClient } = require('../dbRouter');
const { requirePatientAccess } = require('../utils/patientAccess');

function createLocalReportRouter({ db = createRoutedClient(), authenticate = authMiddleware,
  uploadsDir = path.join(__dirname, '../uploads') } = {}) {
  const router = express.Router();
  router.get('/:filename', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const filename = req.params.filename;
    if (!filename || filename.length > 255 || filename !== path.basename(filename) || /[\\\0]/.test(filename) || !/\.(pdf|txt|json)$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid report filename' });
    }
    try {
      if (req.user?.role !== 'super_admin') {
        const { data: patientId, error } = await db.rpc('resolve_local_report_owner', { p_filename: filename });
        if (error) throw error;
        if (!patientId) return res.status(403).json({ error: 'Report access denied' });
        await requirePatientAccess(req.user, patientId, null, db);
      }
      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
      return res.download(filePath, filename);
    } catch (error) {
      if (!error.status) console.error('Local report download failed');
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to access report' });
    }
  });
  return router;
}
module.exports = createLocalReportRouter();
module.exports.createLocalReportRouter = createLocalReportRouter;
