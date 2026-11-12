const { createRoutedClient } = require('../dbRouter');

// Resolve recipients from an owned patient record before reading credentials or sending mail.
function patientNotificationAccess(emailField, db = createRoutedClient()) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ message: 'Authentication required' });
      if (!['super_admin', 'clinic_admin'].includes(user.role)) return res.status(403).json({ message: 'Clinic access required' });
      const email = req.body?.[emailField];
      if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ message: 'Patient email required' });
      let query = db.from('patients').select('id,email,full_name,clinic_id,org_id').eq('email', email.trim().toLowerCase());
      if (user.role === 'clinic_admin') query = query.or(`clinic_id.eq.${user.clinic_id},and(clinic_id.is.null,org_id.eq.${user.clinic_id})`);
      const { data: patient, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!patient) return res.status(403).json({ message: 'Patient access denied' });
      const { data: clinic, error: clinicError } = await db.from('clinics').select('name,email').eq('id', patient.clinic_id || patient.org_id).maybeSingle();
      if (clinicError) throw clinicError;
      if (req.body.reportUrl) {
        const url = new URL(req.body.reportUrl);
        const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
        if (url.origin !== new URL(db.supabaseUrl).origin || !match ||
            !['patients_documents','neurosense-reports','patient-reports','edf-files','qeeg-uploads'].includes(match[1])) {
          return res.status(400).json({ message: 'Invalid report location' });
        }
        const args = { p_bucket: match[1], p_path: decodeURIComponent(match[2]) };
        const { data: owner, error: ownerError } = await db.rpc('resolve_document_owner', args);
        if (ownerError) throw ownerError;
        if (owner !== patient.id) {
          const { data: ownerClinic, error: clinicOwnerError } = await db.rpc('resolve_document_clinic', args);
          if (clinicOwnerError) throw clinicOwnerError;
          if (owner || ownerClinic !== (patient.clinic_id || patient.org_id)) return res.status(403).json({ message: 'Report access denied' });
        }
        const { data: signed, error: signedError } = await db.storage.from(args.p_bucket).createSignedUrl(args.p_path, 604800);
        if (signedError || !signed?.signedUrl) throw signedError || new Error('Report signing failed');
        req.body.reportUrl = signed.signedUrl;
      }
      req.authorizedPatient = patient;
      req.body[emailField] = patient.email;
      req.body.patientName = patient.full_name;
      req.body.clinicEmail = clinic?.email || '';
      req.body.clinicName = clinic?.name || '';
      next();
    } catch {
      return res.status(503).json({ message: 'Unable to verify patient access' });
    }
  };
}
module.exports = { patientNotificationAccess };
