const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
async function requirePatientEmailAccess(user, requestedEmail, db) {
  if (!user) fail('Authentication required', 401);
  const email = String(requestedEmail || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Valid patient email required', 400);
  if (user.role === 'super_admin') return email;
  if (!['patient', 'clinic_admin'].includes(user.role)) fail('Patient access denied');
  let query = db.from('patients').select('id,email,clinic_id,org_id').eq('email', email);
  const { data, error } = await query;
  if (error) throw error;
  // Email-keyed legacy records cannot safely distinguish patients sharing an address.
  if (!data?.length || !data.every(p => user.role === 'patient' ? p.id === user.patient_id : (p.clinic_id || p.org_id) === user.clinic_id)) fail('Patient access denied');
  return email;
}
function requireAdmin(user) {
  if (!user) fail('Authentication required',401);
  if (user.role !== 'super_admin') fail('Administrator access required');
}
module.exports = { requirePatientEmailAccess, requireAdmin };
