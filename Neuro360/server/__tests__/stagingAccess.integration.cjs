// Manual staging-only integration check. Never accepts a production project.
// STAGING_SECURITY_TEST_CONFIG=/private/path.json node --test server/__tests__/stagingAccess.integration.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID, randomBytes } = require('node:crypto');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

test('staging native sessions and isolated account access', { skip: !process.env.STAGING_SECURITY_TEST_CONFIG }, async (t) => {
  const config = JSON.parse(fs.readFileSync(process.env.STAGING_SECURITY_TEST_CONFIG, 'utf8'));
  assert.equal(config.url, 'https://ukmggjcvjvjodksopngs.supabase.co', 'Refuse production');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const db = createClient(config.url, config.service, options);
  const testBucket = process.env.STAGING_DOCUMENT_BUCKET || 'patients_documents';
  assert.ok(['patients_documents', 'neurosense-reports'].includes(testBucket));
  const browser = () => createClient(config.url, config.anon, options);
  const { createClinicSessionRouter } = require('../routes/clinicSessionRoutes');
  const { createPatientDocumentRouter } = require('../routes/patientDocumentRoutes');
  const { verifiedPortalUser } = require('../utils/verifiedPortalUser');
  const { createPatientAuthRouter } = require('../routes/patientAuthRoutes');
  const app = express(); app.use(require('cors')()); app.use(express.json());
  app.use('/clinic-session', createClinicSessionRouter(db));
  app.use('/patient-session', createPatientAuthRouter(db));
  app.use('/api/clinic-session', createClinicSessionRouter(db));
  app.use('/api/ensure-patient-auth', createPatientAuthRouter(db));
  app.use('/documents', createPatientDocumentRouter({ db, async authenticate(req, res, next) {
    req.user = await verifiedPortalUser(db, req.headers.authorization?.split(' ')[1]);
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const accounts = [], clinicIds = [], patientIds = [], reportIds = [], organizationIds = [], profileIds = [], storagePaths = [];
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (storagePaths.length) { const { error } = await db.storage.from(testBucket).remove(storagePaths); assert.ifError(error); }
    for (const [table, ids] of [['profiles', profileIds], ['reports', reportIds], ['patients', patientIds], ['clinics', clinicIds], ['organizations', organizationIds]]) {
      if (ids.length) { const { error } = await db.from(table).delete().in('id', ids); assert.ifError(error); }
    }
    for (const id of accounts) { const { error } = await db.auth.admin.deleteUser(id); assert.ifError(error); }
  });
  async function post(route, body, token) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }
  const password = randomBytes(18).toString('base64url');
  const clinic = { id: randomUUID(), email: `security-${randomUUID()}@example.invalid`, name: 'Security test clinic',
    password: await bcrypt.hash(password, 10), is_active: true, subscription_status: 'active' };
  let result = await db.from('clinics').insert(clinic); assert.ifError(result.error); clinicIds.push(clinic.id);
  const otherOrgId = randomUUID();
  result = await db.from('organizations').upsert([{ id: clinic.id, name: `Security test ${clinic.id}` }, { id: otherOrgId, name: `Security test ${otherOrgId}` }]);
  assert.ifError(result.error); organizationIds.push(clinic.id, otherOrgId);
  const exchange = await post('/clinic-session', { email: clinic.email, password });
  assert.equal(exchange.status, 200, 'Clinic must obtain an exchange'); accounts.push(exchange.body.auth_user_id);
  const clinicClient = browser();
  const signedClinic = await clinicClient.auth.verifyOtp({ token_hash: exchange.body.token_hash, type: 'magiclink' });
  assert.ifError(signedClinic.error); assert.ok(signedClinic.data.session?.access_token);
  const clinicClaims = JSON.parse(Buffer.from(signedClinic.data.session.access_token.split('.')[1], 'base64url'));
  const actor = await db.rpc('resolve_portal_identity', { p_user_id: signedClinic.data.user.id, p_session_id: clinicClaims.session_id });
  assert.ifError(actor.error); assert.equal(actor.data?.clinic_id, clinic.id);

  const patient = { id: randomUUID(), email: `security-${randomUUID()}@example.invalid`, full_name: 'Security test patient',
    clinic_id: clinic.id, org_id: clinic.id, date_of_birth: '1990-01-01', gender: 'other', password: await bcrypt.hash(password, 10) };
  result = await db.from('patients').insert(patient); assert.ifError(result.error); patientIds.push(patient.id);
  let provision = await post('/patient-session', { email: patient.email, password });
  assert.equal(provision.status, 200); assert.equal(provision.body.bound, false);
  const patientClient = browser();
  const signedPatient = await patientClient.auth.signInWithPassword({ email: patient.email, password });
  assert.ifError(signedPatient.error); accounts.push(signedPatient.data.user.id);
  provision = await post('/patient-session', { email: patient.email, password }, signedPatient.data.session.access_token);
  assert.equal(provision.status, 200); assert.equal(provision.body.bound, true);
  const patientClaims = JSON.parse(Buffer.from(signedPatient.data.session.access_token.split('.')[1], 'base64url'));
  const patientActor = await db.rpc('resolve_portal_identity', { p_user_id: signedPatient.data.user.id, p_session_id: patientClaims.session_id });
  assert.ifError(patientActor.error); assert.equal(patientActor.data?.patient_id, patient.id);

  const otherPatient = { id: randomUUID(), email: `security-${randomUUID()}@example.invalid`, full_name: 'Other security test patient',
    org_id: otherOrgId, date_of_birth: '1990-01-01', gender: 'other' };
  result = await db.from('patients').insert(otherPatient); assert.ifError(result.error); patientIds.push(otherPatient.id);
  const report = { id: randomUUID(), patient_id: patient.id, clinic_id: clinic.id, file_name: 'security-test.pdf', file_path: 'security-test/not-a-real-file.pdf' };
  result = await db.from('reports').insert(report); assert.ifError(result.error); reportIds.push(report.id);
  for (const client of [clinicClient, patientClient]) {
    const own = await client.from('patients').select('id,full_name').eq('id', patient.id);
    assert.ifError(own.error); assert.equal(own.data.length, 1, 'Own patient data must work');
    const ownReport = await client.from('reports').select('id').eq('id', report.id);
    assert.ifError(ownReport.error); assert.equal(ownReport.data.length, 1, 'Own reports must work');
    const other = await client.from('patients').select('id').eq('id', otherPatient.id);
    assert.ifError(other.error); assert.equal(other.data.length, 0, 'Cross-account reads must be denied');
  }
  const admin = { email: `security-${randomUUID()}@example.invalid` };
  const createdAdmin = await db.auth.admin.createUser({ email: admin.email, password, email_confirm: true });
  assert.ifError(createdAdmin.error); admin.id = createdAdmin.data.user.id; accounts.push(admin.id);
  result = await db.from('profiles').insert({ id: admin.id, email: admin.email, full_name: 'Synthetic administrator', role: 'super_admin' });
  assert.ifError(result.error); profileIds.push(admin.id);
  const adminClient = browser();
  const adminSession = await adminClient.auth.signInWithPassword({ email: admin.email, password });
  assert.ifError(adminSession.error);
  const adminRecords = await adminClient.from('patients').select('id').in('id', patientIds);
  assert.ifError(adminRecords.error); assert.equal(adminRecords.data.length, 2, 'Administrator retains cross-clinic patient management');
  for (const client of [clinicClient, patientClient, adminClient]) {
    const hiddenSecret = await client.from('patients').select('password').eq('id', patient.id);
    assert.ok(hiddenSecret.error, 'Authenticated browser cannot read passwords');
  }
  const anon = browser();
  const anonymousPatient = await anon.from('patients').select('id').eq('id', patient.id);
  assert.ok(anonymousPatient.error || anonymousPatient.data.length === 0, 'Anonymous patient access must fail');
  const form = new FormData();
  form.append('file', new Blob(['synthetic report access test'], { type: 'application/pdf' }), 'test.pdf');
  form.append('bucket', testBucket);
  form.append('patientId', patient.id); form.append('filePath', 'synthetic/report.pdf');
  const upload = await fetch(`http://127.0.0.1:${server.address().port}/documents/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${signedClinic.data.session.access_token}` }, body: form
  });
  const uploaded = await upload.json(); assert.equal(upload.status, 200, 'Clinic report upload must work'); storagePaths.push(uploaded.path);
  const deniedDocument = await post('/documents/signed-url', { bucket: testBucket, path: uploaded.path });
  assert.equal(deniedDocument.status, 401);
  const forgedDocument = await post('/documents/signed-url', { bucket: testBucket, path: uploaded.path, patientId: otherPatient.id }, signedPatient.data.session.access_token);
  assert.equal(forgedDocument.status, 403);
  const publicUrl = db.storage.from(testBucket).getPublicUrl(uploaded.path).data.publicUrl;
  const publicRead = await fetch(publicUrl); assert.notEqual(publicRead.status, 200, 'Raw public report URL must be denied');
  const ownDocument = await post('/documents/signed-url', { bucket: testBucket, path: uploaded.path, patientId: patient.id }, signedPatient.data.session.access_token);
  assert.equal(ownDocument.status, 200, 'Patient report download must work');
  const content = await fetch(ownDocument.body.signedUrl); assert.equal(content.status, 200); assert.equal(await content.text(), 'synthetic report access test');
  const deletedDocument = await post('/documents/delete', { bucket: testBucket, path: uploaded.path, patientId: patient.id }, signedClinic.data.session.access_token);
  assert.equal(deletedDocument.status, 200); storagePaths.length = 0;
  if (process.env.STAGING_SECURITY_BROWSER === '1') {
    await require('./stagingBrowserLogin.cjs')({ t, config, apiUrl: `http://127.0.0.1:${server.address().port}/api`, clinic, patient, admin, password });
  }
  const secret = await anon.from('patients').select('password').eq('id', patient.id);
  assert.ok(secret.error, 'Anonymous credential SELECT must fail');
});
