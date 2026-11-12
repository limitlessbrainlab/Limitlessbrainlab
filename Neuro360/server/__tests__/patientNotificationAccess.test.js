const { test } = require('node:test');
const assert = require('node:assert/strict');
const { patientNotificationAccess } = require('../middleware/patientNotificationAccess');
test('credential notification denies unrelated recipients and derives owned recipient fields', async () => {
  let owned = false, scope;
  const db = { from(table) {
    const q = { select() { return q; }, eq() { return q; }, or(value) { scope = value; return q; }, order() { return q; }, limit() { return q; },
      async maybeSingle() { return { data: table === 'patients' ? (owned ? { id: 'owned', email: 'p@example.test', full_name: 'Patient', clinic_id: 'clinic-a' } : null) : { name: 'Clinic A', email: 'clinic@example.test' } }; } };
    return q;
  } };
  const middleware = patientNotificationAccess('newEmail', db);
  const req = { user: { role: 'clinic_admin', clinic_id: 'clinic-a' }, body: { newEmail: 'p@example.test', clinicEmail: 'attacker@example.test' } };
  let status, passed = false;
  const res = { status(s) { status = s; return res; }, json() {} };
  await middleware(req, res, () => { passed = true; });
  assert.equal(status, 403); assert.equal(passed, false); assert.match(scope, /clinic_id.eq.clinic-a/);
  owned = true;
  await middleware(req, res, () => { passed = true; });
  assert.equal(passed, true); assert.equal(req.authorizedPatient.id, 'owned'); assert.equal(req.body.clinicEmail, 'clinic@example.test');
  req.user = { role: 'patient' }; passed = false;
  await middleware(req, res, () => { passed = true; });
  assert.equal(status, 403); assert.equal(passed, false);
});

test('report email signs only the authorized patient or legacy clinic document', async () => {
  let owner = 'unrelated', clinicOwner = null, signed = 0;
  const db = { supabaseUrl: 'https://example.supabase.co', from(table) {
    const q = { select() { return q; }, eq() { return q; }, or() { return q; }, order() { return q; }, limit() { return q; }, async maybeSingle() {
      return { data: table === 'patients' ? { id: 'patient', email: 'p@example.test', clinic_id: 'clinic' } : { email: 'c@example.test' } };
    } }; return q;
  }, async rpc(name) { return { data: name === 'resolve_document_owner' ? owner : clinicOwner }; },
  storage: { from() { return { async createSignedUrl(path, expiry) { signed++; assert.equal(path, 'patient/report.pdf'); assert.equal(expiry, 604800); return { data: { signedUrl: 'https://example.supabase.co/signed' } }; } }; } } };
  const handler = patientNotificationAccess('patientEmail', db);
  async function request(url = 'https://example.supabase.co/storage/v1/object/public/neurosense-reports/patient/report.pdf') {
    const req = { user: { role: 'super_admin' }, body: { patientEmail: 'p@example.test', reportUrl: url } };
    let status = 200, passed = false; const res = { status(s) { status = s; return res; }, json() {} };
    await handler(req, res, () => { passed = true; }); return { status, passed, req };
  }
  assert.equal((await request()).status, 403); assert.equal(signed, 0);
  owner = 'patient'; let result = await request(); assert.equal(result.passed, true); assert.match(result.req.body.reportUrl, /signed$/);
  assert.equal((await request('https://attacker.example/report.pdf')).status, 400);
  owner = null; clinicOwner = 'clinic'; assert.equal((await request()).passed, true);
});
