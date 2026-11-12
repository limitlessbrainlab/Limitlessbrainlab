const jwt = require('jsonwebtoken');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createClinicSmtpRouter } = require('../routes/clinicSmtpRoutes');

test('SMTP settings require a verified admin UID or the active owning clinic identity', async (t) => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const clinic = { id, auth_user_id: 'owner', is_active: true, deleted_at: null, subscription_status: 'trial', smtp_email: 'sender@example.com', smtp_password: 'initial-app-password' };
  let role = 'patient';
  let writes = 0;
  let secretReads = 0;
  let fail = false;
  let deactivateBeforeRead = false;
  const db = {
    auth: { getUser: async token => ({ data: { user: token === 'invalid' ? null : { id: jwt.decode(token)?.sub, email: 'same@example.com', user_metadata: { role: 'super_admin', clinic_id: id } } } }) },
    rpc: async (_name, args) => ({data:{id:args.p_user_id,role:args.p_user_id === 'admin' ? role : 'clinic_admin'}}),
    from(table) {
      let patch;
      let columns;
      const filters = [];
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        or(value) { assert.equal(value, 'subscription_status.is.null,subscription_status.neq.pending_approval'); filters.push(row => row.subscription_status === null || row.subscription_status !== 'pending_approval'); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        update(value) { patch = value; return query; },
        async maybeSingle() {
          if (fail) return { error: new Error('provider failure') };
          if (table === 'profiles') {
            const profile = { id: 'admin', role };
            return { data: filters.every(f => f(profile)) ? profile : null };
          }
          assert.equal(table, 'clinics');
          if (columns.includes('smtp_password')) {
            secretReads++;
            if (deactivateBeforeRead) clinic.is_active = false;
          }
          if (!filters.every(f => f(clinic))) return { data: null };
          if (patch) {
            assert.deepEqual(Object.keys(patch).sort(), ['smtp_email', 'smtp_password', 'updated_at']);
            writes++;
            Object.assign(clinic, patch);
          }
          return { data: Object.fromEntries(columns.split(',').map(key => [key, clinic[key]])) };
        }
      };
      return query;
    }
  };
  const app = express();
  app.use(express.json());
  app.use('/api/clinic-smtp', createClinicSmtpRouter(db));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const request = (token = 'owner', method = 'GET', body, target = id) => fetch(`http://127.0.0.1:${server.address().port}/api/clinic-smtp?clinicId=${target}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token === 'invalid' ? token : jwt.sign({sub:token,session_id:'session'},'test-only')}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.equal((await request('')).status, 401);
  assert.equal((await request('invalid')).status, 401);
  assert.equal((await request('owner', 'GET', null, 'bad-id')).status, 400);
  for (const method of ['GET', 'PUT']) {
    assert.equal((await request('outsider', method, method === 'PUT' ? { smtp_email: 'bad@example.com', smtp_password: 'attack' } : null)).status, 403);
  }
  assert.equal(secretReads, 0, 'metadata and matching email cannot grant secret access');
  let response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { smtp_email: clinic.smtp_email, smtp_password: clinic.smtp_password });
  response = await request('owner', 'PUT', { smtp_email: ' new@example.com ', smtp_password: 'new-app-password', auth_user_id: 'attacker' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { smtp_email: 'new@example.com', smtp_password: 'new-app-password' });
  assert.equal(clinic.auth_user_id, 'owner');
  assert.equal(writes, 1);
  for (const body of [{}, { smtp_email: 'invalid', smtp_password: 'valid' }, { smtp_email: 'x@y.com', smtp_password: '' }, { smtp_email: 'x@y.com', smtp_password: 42 }]) {
    assert.equal((await request('owner', 'PUT', body)).status, 400);
  }
  clinic.is_active = false;
  assert.equal((await request()).status, 403);
  clinic.is_active = true;
  clinic.subscription_status = 'pending_approval';
  assert.equal((await request()).status, 403);
  clinic.subscription_status = null;
  assert.equal((await request()).status, 200, 'active legacy clinics with NULL status retain access');
  assert.equal((await request('outsider')).status, 403, 'NULL status does not bypass ownership');
  clinic.subscription_status = 'trial';
  deactivateBeforeRead = true;
  assert.equal((await request('owner', 'PUT', { smtp_email: 'x@y.com', smtp_password: 'attempt' })).status, 403, 'revoked access between authorization and write must fail');
  assert.equal(writes, 1);
  deactivateBeforeRead = false;
  role = 'super_admin';
  assert.equal((await request('admin')).status, 200, 'trusted admin profile UID can manage inactive clinics');
  clinic.deleted_at = new Date().toISOString();
  assert.equal((await request('admin')).status, 403);
  clinic.deleted_at = null;
  fail = true;
  response = await request('admin');
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes(clinic.smtp_password));
});
