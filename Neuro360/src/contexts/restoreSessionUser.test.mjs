import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreSessionUser } from './restoreSessionUser.js';
function fixture({ authUser = { id: 'auth-clinic', email: 'internal@clinic-auth.invalid' }, clinic = null, patient = null, profile = null, authError = null } = {}) {
  const filters = [];
  const db = { auth: { getUser: async () => ({ data: { user: authUser }, error: authError }) }, from(table) {
    const q = { select(columns) { assert.notEqual(columns, '*'); return q; }, eq(k,v) { filters.push([table,k,v]); return q; }, ilike(k,v) { filters.push([table,k,v]); return q; }, order() { return q; }, limit() { return q; },
      async maybeSingle() { return { data: table === 'clinics' ? clinic : table === 'patients' ? patient : profile }; }
    }; return q;
  } };
  return { db, filters };
}
const clinic = { id: 'business-clinic', auth_user_id: 'auth-clinic', email: 'clinic@example.com', name: 'Clinic', is_active: true, credentials_updated_at: 'now' };
test('native-only clinic restore uses mapped business identity', async () => {
  const f = fixture({ clinic }); const u = await restoreSessionUser(f.db);
  assert.equal(u.id, 'business-clinic'); assert.equal(u.clinicId, 'business-clinic'); assert.equal(u.email, 'clinic@example.com'); assert.equal(u.role, 'clinic_admin');
  assert.deepEqual(f.filters[0], ['clinics','auth_user_id','auth-clinic']);
});
test('valid cached clinic is refreshed from database', async () => {
  const f = fixture({ clinic }); const u = await restoreSessionUser(f.db, { id: clinic.id, role: 'clinic_admin', name: 'stale' }); assert.equal(u.name, 'Clinic'); assert.equal(u.credentialsUpdatedAt, 'now');
});
for (const override of [{ auth_user_id: 'other' }, { is_active: false }, { deleted_at: 'now' }, { subscription_status: 'pending_approval' }]) test('mismatched or inactive clinic cannot restore: ' + JSON.stringify(override), async () => {
  const f = fixture({ clinic: { ...clinic, ...override } }); await assert.rejects(() => restoreSessionUser(f.db, { id: clinic.id, role: 'clinic_admin' }));
});
test('cached other clinic id cannot be combined with current identity', async () => {
  const f = fixture({ clinic }); await assert.rejects(() => restoreSessionUser(f.db, { id: 'other', role: 'clinic_admin' }));
});
test('browser-only login blob without verified Auth cannot restore', async () => {
  const f = fixture({ authUser: null }); await assert.rejects(() => restoreSessionUser(f.db, { id: clinic.id, role: 'clinic_admin' }));
});
test('patient restore requires matching verified email and refreshes patient fields', async () => {
  const f = fixture({ authUser: { id: 'auth-patient', email: 'PATIENT@example.com' }, patient: { id: 'patient-id', auth_user_id: 'auth-patient', email: 'patient@example.com', full_name: 'Patient', clinic_id: 'clinic' } });
  const u = await restoreSessionUser(f.db, { id: 'patient-id', role: 'patient' }); assert.equal(u.patientId, 'patient-id'); assert.equal(u.clinicId, 'clinic');
});
test('patient email mismatch denies cached access', async () => {
  const f = fixture({ authUser: { id: 'auth-patient', email: 'other@example.com' }, patient: { id: 'patient-id', auth_user_id: 'auth-patient', email: 'patient@example.com' } }); await assert.rejects(() => restoreSessionUser(f.db, { id: 'patient-id', role: 'patient' }));
});
test('editable user metadata never supplies administrator authority', async () => {
  const f = fixture({ authUser: { id: 'user', email: 'user@example.com', user_metadata: { role: 'super_admin' } } }); await assert.rejects(() => restoreSessionUser(f.db));
});
test('native-only administrator requires matching trusted profile UID', async () => {
  const f = fixture({ authUser: { id: 'admin', email: 'admin@example.com' }, profile: { id: 'admin', role: 'super_admin', full_name: 'Admin' } }); assert.equal((await restoreSessionUser(f.db)).role, 'super_admin');
});

test('unbound patient cannot restore even with matching email', async () => {
  const f = fixture({ authUser: { id: 'auth-patient', email: 'patient@example.com' }, patient: { id: 'patient-id', email: 'patient@example.com' } });
  await assert.rejects(() => restoreSessionUser(f.db, { id: 'patient-id', role: 'patient' }));
});
