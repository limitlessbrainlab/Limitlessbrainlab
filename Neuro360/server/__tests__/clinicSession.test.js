const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createClinicSessionRouter } = require('../routes/clinicSessionRoutes');

async function fixture(overrides = {}) {
  const clinic = { id: 'clinic-1', email: 'shared@example.com', is_active: true, auth_user_id: null, ...overrides.clinic };
  const calls = [];
  let user;
  const db = {
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      if (overrides.rpcError) return { error: new Error('db unavailable') };
      if (overrides.changed && calls.filter(([name]) => name === 'rpc').length === 2) Object.assign(clinic, overrides.changed);
      return { data: args.p_password === 'correct' ? (overrides.ambiguous ? [{ ...clinic }, { ...clinic, id: 'clinic-2' }] : [{ ...clinic }]) : [] };
    },
    from: () => {
      let values;
      const query = {
        update(v) { values = v; return this; }, eq() { return this; }, is() { return this; }, select() { return this; },
        async maybeSingle() {
          if (overrides.writeError) return { error: new Error('write failed') };
          if (overrides.race) return { data: null };
          Object.assign(clinic, values);
          return { data: { ...clinic } };
        }
      };
      return query;
    },
    auth: { admin: {
      async createUser(args) { calls.push(['create', args]); user = { id: 'auth-clinic', ...args }; return { data: { user } }; },
      async getUserById(id) { calls.push(['get', id]); return { data: { user: overrides.user || user } }; },
      async deleteUser(id) { calls.push(['delete', id]); return {}; },
      async generateLink(args) { calls.push(['link', args]); return { data: { user: overrides.linkUser || overrides.user || user, properties: { hashed_token: 'one-use-token' } } }; }
    } }
  };
  const app = express(); app.use(express.json()); app.use(createClinicSessionRouter(db));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { calls, clinic, async request(body = { email: clinic.email, password: 'correct' }) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }, close: () => new Promise(resolve => server.close(resolve)) };
}

for (const [name, options, body, status] of [
  ['wrong password', {}, { email: 'shared@example.com', password: 'wrong' }, 401],
  ['invalid input', {}, { email: {}, password: 'correct' }, 400],
  ['disabled clinic', { clinic: { is_active: false } }, undefined, 403],
  ['deleted clinic', { clinic: { deleted_at: 'yesterday' } }, undefined, 403],
  ['pending clinic', { clinic: { subscription_status: 'pending_approval' } }, undefined, 403],
  ['verification outage', { rpcError: true }, undefined, 503]
]) test(name + ' never mints an identity or token', async t => {
  const f = await fixture(options); t.after(f.close);
  assert.equal((await f.request(body)).status, status);
  assert.equal(f.calls.some(([name]) => name === 'create' || name === 'link'), false);
});

test('legacy clinic obtains a separate random internal identity without changing shared-email credentials', async t => {
  const f = await fixture(); t.after(f.close);
  const result = await f.request();
  assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
  assert.deepEqual(result.body, { token_hash: 'one-use-token', auth_user_id: 'auth-clinic', clinic_id: 'clinic-1' });
  const created = f.calls.find(([name]) => name === 'create')[1];
  assert.match(created.email, /^[a-f0-9]{64}@clinic-auth\.invalid$/);
  assert.equal(created.email_confirm, true); assert.equal(created.password, undefined);
  assert.deepEqual(created.app_metadata, { role: 'clinic_admin', clinic_id: 'clinic-1' });
  assert.equal(f.clinic.auth_user_id, 'auth-clinic');
  assert.equal(f.calls.filter(([name]) => name === 'rpc').length, 2);
});

test('existing mapping reuses only a matching server-owned clinic identity', async t => {
  const user = { id: 'existing', email: 'a'.repeat(64) + '@clinic-auth.invalid', app_metadata: { role: 'clinic_admin', clinic_id: 'clinic-1' } };
  const f = await fixture({ clinic: { auth_user_id: user.id }, user }); t.after(f.close);
  assert.equal((await f.request()).status, 200);
  assert.equal(f.calls.some(([name]) => name === 'create'), false);
});

for (const user of [
  { id: 'existing', email: 'shared@example.com', app_metadata: { role: 'super_admin' } },
  { id: 'existing', email: 'a'.repeat(64) + '@clinic-auth.invalid', user_metadata: { role: 'clinic_admin', clinic_id: 'clinic-1' } }
]) test('foreign or browser-controlled mapping fails closed', async t => {
  const f = await fixture({ clinic: { auth_user_id: user.id }, user }); t.after(f.close);
  assert.equal((await f.request()).status, 503);
  assert.equal(f.calls.some(([name]) => name === 'link'), false);
});

test('concurrent creation loses safely without issuing an unmapped session', async t => {
  const f = await fixture({ race: true }); t.after(f.close);
  assert.equal((await f.request()).status, 503);
  assert.ok(f.calls.some(([name, id]) => name === 'delete' && id === 'auth-clinic'));
  assert.equal(f.calls.some(([name]) => name === 'link'), false);
});

test('link identity mismatch fails closed', async t => {
  const f = await fixture({ linkUser: { id: 'somebody-else' } }); t.after(f.close);
  assert.equal((await f.request()).status, 503);
});

for (const changed of [{ auth_user_id: null }, { is_active: false }, { deleted_at: 'now' }]) {
  test('clinic changed during provisioning receives no exchange token: ' + JSON.stringify(changed), async t => {
    const f = await fixture({ changed }); t.after(f.close);
    assert.equal((await f.request()).status, 401);
    assert.equal(f.calls.some(([name]) => name === 'link'), false);
  });
}
test('ambiguous credential match never chooses an arbitrary clinic', async t => {
  const f = await fixture({ ambiguous: true }); t.after(f.close);
  assert.equal((await f.request()).status, 401);
  assert.equal(f.calls.some(([name]) => name === 'create' || name === 'link'), false);
});
test('uncertain binding failure never deletes a possibly committed identity', async t => {
  const f = await fixture({ writeError: true }); t.after(f.close);
  assert.equal((await f.request()).status, 503);
  assert.equal(f.calls.some(([name]) => name === 'delete' || name === 'link'), false);
});
