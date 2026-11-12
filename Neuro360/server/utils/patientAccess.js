const { createRoutedClient } = require('../dbRouter');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requirePatientAccess(user, patientId, clinicId, db = createRoutedClient()) {
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (typeof patientId !== 'string' || !UUID.test(patientId)) throw Object.assign(new Error('A valid patient ID is required'), { status: 400 });
  const { data: patient, error } = await db.from('patients').select('id,clinic_id,org_id,full_name,name,external_id').eq('id', patientId).maybeSingle();
  if (error) throw error;
  const owner = patient?.clinic_id || patient?.org_id;
  const allowed = patient && (user.role === 'super_admin' ||
    (user.role === 'clinic_admin' && user.clinic_id === owner) ||
    (user.role === 'patient' && user.patient_id === patient.id));
  if (!allowed || (clinicId && clinicId !== owner)) throw Object.assign(new Error('Patient access denied'), { status: 403 });
  return { ...patient, clinic_id: owner };
}

function requireClinicAccess(user, clinicId) {
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (typeof clinicId !== 'string' || !UUID.test(clinicId)) throw Object.assign(new Error('A valid clinic ID is required'), { status: 400 });
  if (user.role !== 'super_admin' && !(user.role === 'clinic_admin' && user.clinic_id === clinicId)) {
    throw Object.assign(new Error('Clinic access denied'), { status: 403 });
  }
}

module.exports = { requirePatientAccess, requireClinicAccess, UUID };
