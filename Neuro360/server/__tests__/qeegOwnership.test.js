const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const access = require('../utils/patientAccess');

test('QEEG endpoints deny unrelated records before storage or report processing', async t => {
  const patientId = '12345678-1234-4234-8234-123456789abc';
  const clinicId = '22345678-1234-4234-8234-123456789abc';
  let user = { role: 'clinic_admin', clinic_id: 'other-clinic' };
  let storageReads = 0;
  const db = { from() { const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: { id: patientId, clinic_id: clinicId } }) }; return query; } };
  const context = {
    module: { exports: {} }, __dirname: path.join(__dirname, '../routes'), process,
    console: { log() {}, warn() {}, error() {} }, Buffer,
    require(name) {
      if (['express', 'multer', 'path', 'fs'].includes(name)) return require(name);
      if (name === '../dbRouter') return { createRoutedClient: () => db };
      if (name === '../utils/patientAccess') return { ...access, requirePatientAccess: (u, p, c) => access.requirePatientAccess(u, p, c, db) };
      if (name === '../services/supabaseStorage') return { listPatientQEEGFiles: async () => { storageReads++; return { eyesOpen: [], eyesClosed: [] }; } };
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/qeegRoutes.js'), 'utf8'), context);
  const router = context.module.exports;
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = user; next(); }); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const url = endpoint => `http://127.0.0.1:${server.address().port}/${endpoint}`;
  assert.equal((await fetch(url(`patient-qeeg-files/${patientId}`))).status, 403);
  assert.equal(storageReads, 0);
  assert.equal((await fetch(url('supabase-pdfs'))).status, 403);
  assert.equal((await fetch(url('generate-pdf'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientData: { patientId, clinicId } }) })).status, 403);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await router.processQeegRequest({ user, body: { patientId, clinicId }, files: { eyesOpen: [{ path: '/nonexistent-fixture-eo.pdf' }], eyesClosed: [{ path: '/nonexistent-fixture-ec.pdf' }] } }, response);
  assert.equal(response.code, 403, 'direct Vercel entry also checks ownership before validation/AI/storage');
  user = { role: 'clinic_admin', clinic_id: clinicId };
  assert.equal((await fetch(url(`patient-qeeg-files/${patientId}`))).status, 200);
  assert.equal(storageReads, 1);
  user = { role: 'patient', patient_id: patientId };
  assert.equal((await fetch(url(`patient-qeeg-files/${patientId}`))).status, 200);
  assert.equal(storageReads, 2);
});

test('performance report requires native authentication and ownership before extraction', async t => {
  const patientId = '12345678-1234-4234-8234-123456789abc';
  const clinicId = '22345678-1234-4234-8234-123456789abc';
  let currentUser = { role: 'clinic_admin', clinic_id: 'other' };
  let extractions = 0;
  const db = { from() { const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: { id: patientId, clinic_id: clinicId } }) }; return q; } };
  const context = {
    module: { exports: {} }, __dirname: path.join(__dirname, '../routes'), process, Buffer, setInterval, clearInterval,
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (['express', 'multer', 'path', 'fs'].includes(name)) return require(name);
      if (name === 'pdf-parse') return async () => ({ text: 'Fixture report' });
      if (name === '../middleware/authMiddleware') return { authMiddleware: (req, res, next) => {
        if (req.headers.authorization !== 'Bearer verified-session') return res.status(401).json({ error: 'Authentication required' });
        req.user = currentUser; next();
      } };
      if (name === '../utils/patientAccess') return { requirePatientAccess: (u, p, c) => access.requirePatientAccess(u, p, c, db) };
      if (name === '../services/performanceReportBuilder') return { engineWarmupRequired: () => false };
      if (name === '../services/performanceReportService') return { extractReportSource: async () => { extractions++; throw new Error('Fixture stops at extraction'); }, postLesson() {} };
      return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/performanceReportRoutes.js'), 'utf8'), context);
  const app = express(); app.use(context.module.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => server.close());
  const request = token => {
    const body = new FormData(); body.append('patientId', patientId); body.append('clinicId', clinicId); body.append('pdf', new Blob(['fixture'], { type: 'application/pdf' }), 'fixture.pdf');
    return fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  };
  assert.equal((await request('old-static-token')).status, 401);
  assert.equal((await request('verified-session')).status, 403);
  assert.equal(extractions, 0);
  currentUser = { role: 'clinic_admin', clinic_id: clinicId };
  const allowed = await request('verified-session');
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /event: progress/);
  assert.equal(extractions, 1);
});
