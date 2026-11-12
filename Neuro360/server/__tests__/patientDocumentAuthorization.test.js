const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createPatientDocumentRouter } = require('../routes/patientDocumentRoutes');
const { requirePatientAccess, requireClinicAccess } = require('../utils/patientAccess');

const patientId = '12345678-1234-4234-8234-123456789abc';
const clinicId = '22345678-1234-4234-8234-123456789abc';
const otherId = '32345678-1234-4234-8234-123456789abc';
const patient = { id: patientId, clinic_id: clinicId, full_name: 'Fixture Patient' };
const owner = { role: 'clinic_admin', clinic_id: clinicId };
function database(registry = new Map()) {
  return {
    from(table) {
      assert.equal(table, 'patients');
      let target;
      const query = { select() { return query; }, eq(key, value) { assert.equal(key, 'id'); target = value; return query; }, maybeSingle: async () => ({ data: target === patientId ? patient : null }) };
      return query;
    },
    async rpc(fn, args) {
      const key = `${args.p_bucket}/${args.p_path}`;
      if (fn === 'register_document_owner') { registry.set(key, args.p_patient_id); return { data: null }; }
      if (fn === 'resolve_document_clinic') return {data:args.p_path === 'clinic-only.pdf' ? clinicId : null};
      assert.equal(fn, 'resolve_document_owner');
      return { data: registry.get(key) || null };
    }
  };
}

test('patient/report ownership rejects forged clinic IDs and unrelated identities', async () => {
  const db = database();
  assert.equal((await requirePatientAccess(owner, patientId, clinicId, db)).id, patientId);
  assert.equal((await requirePatientAccess({ role: 'patient', patient_id: patientId }, patientId, null, db)).id, patientId);
  assert.equal((await requirePatientAccess({ role: 'super_admin' }, patientId, clinicId, db)).id, patientId);
  for (const user of [null, { role: 'clinic_admin', clinic_id: otherId }, { role: 'patient', patient_id: otherId }, { role: 'patient', id: patientId }]) {
    await assert.rejects(() => requirePatientAccess(user, patientId, clinicId, db));
  }
  await assert.rejects(() => requirePatientAccess(owner, patientId, otherId, db), /access denied/);
  await assert.rejects(() => requirePatientAccess(owner, '../folder', null, db), /valid patient ID/);
  assert.throws(() => requireClinicAccess(owner, otherId), /access denied/);
  assert.throws(() => requireClinicAccess({ role: 'patient', clinic_id: clinicId }, clinicId), /access denied/);
});

test('document endpoints require ownership registry, scope storage, and preserve registered legacy paths', async t => {
  const legacyPath = 'Legacy_Clinic/Fixture_Patient/report.pdf';
  const registry = new Map([[`patients_documents/${legacyPath}`, patientId], ['patients_documents/Other/report.pdf', otherId]]);
  let currentUser = owner;
  const operations = [];
  const app = express(); app.use(express.json());
  app.use(createPatientDocumentRouter({ db: database(registry), authenticate(req, res, next) { req.user = currentUser; next(); }, storageService: {
    async uploadFile(temp, bucket, filePath, mime, db, ownerId) { await db.rpc('register_document_owner',{p_bucket:bucket,p_path:filePath,p_patient_id:ownerId}); operations.push(['upload', bucket, filePath]); return { path: filePath }; },
    async getSignedUrl(bucket, filePath, expiry) { operations.push(['read', bucket, filePath, expiry]); return { signedUrl: 'https://fixture.invalid/signed' }; },
    async deleteFile(filePath, bucket) { operations.push(['delete', bucket, filePath]); }
  } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const endpoint = name => `http://127.0.0.1:${server.address().port}/${name}`;
  const request = (name, body) => fetch(endpoint(name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId, path: legacyPath, ...body }) });
  for (const name of ['signed-url', 'delete']) {
    for (const body of [{ bucket: 'private-secrets' }, { path: '../report.pdf' }, { path: 'Other/report.pdf' }, { path: 'unknown.pdf' }, { patientId: otherId }]) {
      assert.ok((await request(name, body)).status >= 400);
    }
  }
  assert.equal(operations.length, 0);
  currentUser = {role:'super_admin'};
  assert.equal((await request('signed-url',{path:'ownerless.pdf',patientId:null})).status,200);
  assert.equal((await request('delete',{path:'ownerless.pdf',patientId:null})).status,403);
  operations.length = 0;
  currentUser = owner;
  assert.equal((await request('signed-url',{patientId:undefined})).status,200);
  operations.length = 0;
  assert.equal((await request('signed-url',{path:'clinic-only.pdf',patientId:null})).status,200);
  currentUser = { role: 'clinic_admin', clinic_id: otherId };
  assert.equal((await request('signed-url',{path:'clinic-only.pdf',patientId:null})).status,403);
  assert.equal((await request('signed-url')).status, 403);
  currentUser = null;
  assert.equal((await request('signed-url')).status, 401);
  currentUser = owner;
  assert.equal((await request('signed-url', { expiresIn: 999999 })).status, 200);
  assert.deepEqual(operations.pop(), ['read', 'patients_documents', legacyPath, 3600]);
  assert.equal((await request('delete')).status, 200);
  assert.deepEqual(operations.pop(), ['delete', 'patients_documents', legacyPath]);
  const body = new FormData(); body.append('patientId', patientId); body.append('filePath', legacyPath); body.append('file', new Blob(['fixture']), 'fixture.txt');
  const upload = await fetch(endpoint('upload'), { method: 'POST', body });
  assert.equal(upload.status, 200);
  const uploaded = await upload.json();
  assert.ok(uploaded.path.startsWith(`${patientId}/`));
  assert.equal(registry.get(`patients_documents/${uploaded.path}`), patientId);
  assert.equal((await request('signed-url', { path: uploaded.path })).status, 200);
});
