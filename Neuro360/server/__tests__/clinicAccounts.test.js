const jwt = require('jsonwebtoken');
const validToken = jwt.sign({sub:'admin',session_id:'session'},'test-only');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createClinicAccountsRouter } = require('../routes/clinicAccountsRoutes');

test('only a verified super admin can remove access; records remain and retries are safe', async (t) => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const clinic = { id, name: 'Test partner', is_active: true, deleted_at: null, reports_used: 7 };
  let role = 'super_admin';
  let readError = null;
  let updateError = null;
  let exists = true;
  let writes = 0;
  const db = {
    auth: { getUser: async token => ({ data: { user: token === validToken ? { id: 'admin', user_metadata: { role: 'super_admin' } } : null } }) },
    rpc: async () => ({data:{id:'admin',role}}),
    from(table) {
      assert.ok(['profiles', 'clinics'].includes(table), 'must not modify patient/report/billing records');
      let patch;
      const query = {
        select() { return query; }, eq() { return query; }, is() { return query; },
        update(value) { patch = value; return query; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { role } };
          if (readError) return { error: readError };
          if (!exists) return { data: null };
          if (patch) {
            if (updateError) return { error: updateError };
            writes++;
            Object.assign(clinic, patch);
          }
          return { data: { ...clinic } };
        }
      };
      return query;
    }
  };
  const app = express();
  app.use('/api/admin/clinics', createClinicAccountsRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const request = (token = 'valid', target = id) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/clinics/${target}`, {
    method: 'DELETE', headers: token ? { Authorization: `Bearer ${token === 'valid' ? validToken : token}` } : {}
  });
  assert.equal((await request('')).status, 401);
  assert.equal((await request('invalid')).status, 401);
  role = 'clinic_admin';
  assert.equal((await request()).status, 403, 'user-editable metadata must not authorize removal');
  role = 'super_admin';
  assert.equal((await request('valid', 'bad-id')).status, 400);
  exists = false;
  assert.equal((await request()).status, 404);
  exists = true;
  readError = new Error('read failed');
  assert.equal((await request()).status, 500);
  readError = null;
  updateError = new Error('write failed');
  assert.equal((await request()).status, 500);
  assert.equal(clinic.is_active, true);
  updateError = null;
  assert.equal((await request()).status, 200);
  assert.equal(clinic.is_active, false);
  assert.ok(clinic.deleted_at);
  assert.equal(clinic.reports_used, 7);
  assert.equal(clinic.name, 'Test partner');
  assert.equal(clinic.credentials_updated_at, clinic.deleted_at);
  const removedAt = clinic.deleted_at;
  assert.equal((await request()).status, 200);
  assert.equal(writes, 1);
  assert.equal(clinic.deleted_at, removedAt);
});
