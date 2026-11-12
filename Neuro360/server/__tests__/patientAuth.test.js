const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { createPatientAuthRouter } = require('../routes/patientAuthRoutes');
async function fixture(options = {}) {
  const writes = [], pages = [], bindings = [], revocations = []; let verifications = 0;
  const patient = { id: 'latest', email: 'patient@example.com', full_name: 'Patient Name', ...options.patient };
  const db = {
    rpc: async (name, args) => {
      verifications++;
      if (options.resetDuringRepair && verifications > 1) return { data: [] };
      assert.equal(name, 'verify_patient_login'); assert.equal(args.p_email, patient.email);
      return options.rpcError ? { error: new Error('outage') } : { data: args.p_password === 'correct' ? options.matches || [patient] : [] };
    },
    from(table) {
      let binding = false;
      const q = { update(values) { binding = true; bindings.push(values); return q; }, is() { return q; }, select() { return q; }, eq(key, value) { if (table === 'profiles') { assert.equal(key, 'id'); assert.equal(value, 'existing'); } return q; }, ilike() { return q; }, order() { return q; }, limit() { return q; },
        async maybeSingle() { if (binding) return { data: options.bindingRace ? null : { id: patient.id } }; return options.profileError ? { error: new Error('outage') } : { data: table === 'profiles' ? options.profile || null : patient }; }
      }; return q;
    },
    auth: { getUser: async token => ({ data: { user: options.invalidToken ? null : { id: options.tokenUserId || 'existing', email: 'patient@example.com' } }, error: options.invalidToken ? new Error('bad token') : null }), admin: {
      async signOut(token, scope) { revocations.push({ token, scope }); return options.revokeError ? { error: new Error('revoke failed') } : {}; },
      async listUsers(args) { pages.push(args); assert.equal(args.filter, undefined); return options.listError ? { error: new Error('list failed') } : { data: { users: options.pages?.[args.page - 1] || [] } }; },
      async updateUserById(id, data) { writes.push({ id, data }); return options.writeError ? { error: new Error('write failed') } : {}; },
      async createUser(data) { writes.push({ data }); return options.writeError ? { error: new Error('create failed') } : { data: { user: { id: 'created' } } }; }
    } }
  };
  const app = express(); app.use(express.json()); app.use(createPatientAuthRouter(db));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { writes, pages, bindings, revocations, close: () => new Promise(resolve => server.close(resolve)), async request(extra = {}) {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.bearer ? { Authorization: 'Bearer native-token' } : {}) }, body: JSON.stringify({ email: ' Patient@example.com ', password: 'correct', ...extra }) });
    return { status: r.status, body: await r.json() };
  } };
}
test('finds exact email on second page and updates only that patient identity', async t => {
  const f = await fixture({ pages: [Array.from({ length: 100 }, (_, i) => ({ id: String(i), email: `other${i}@example.com` })), [{ id: 'existing', email: 'PATIENT@example.com' }]] }); t.after(f.close);
  assert.equal((await f.request()).status, 200); assert.equal(f.pages.length, 2);
  assert.deepEqual(f.writes, [{ id: 'existing', data: { password: 'correct' } }]);
});
test('creates absent patient identity only after local proof, without email delivery', async t => {
  const f = await fixture(); t.after(f.close); assert.deepEqual((await f.request()).body, { success: true, bound: false });
  assert.equal(f.bindings.length, 0);
  assert.equal(f.writes[0].data.email_confirm, true); assert.equal(f.writes[0].data.email, 'patient@example.com');
  assert.deepEqual(f.writes[0].data.app_metadata, { role: 'patient' });
});
for (const options of [
  { pages: [[{ id: 'existing', email: 'patient@example.com', app_metadata: { role: 'super_admin' } }]] },
  { pages: [[{ id: 'existing', email: 'patient@example.com' }]], profile: { role: 'super_admin' } },
  { pages: [[{ id: 'existing', email: 'patient@example.com', app_metadata: { role: 'clinic_admin' } }]] },
  { matches: [{ id: 'older', email: 'patient@example.com' }] },
  { matches: [{ id: 'latest', email: 'patient@example.com', auth_user_id: 'other' }], pages: [[{ id:'existing', email:'patient@example.com' }]] }
]) test('privileged/shared identity or older duplicate proof cannot reset Auth: ' + JSON.stringify(options), async t => {
  const f = await fixture(options); t.after(f.close); assert.equal((await f.request()).status, 401); assert.equal(f.writes.length, 0);
});
test('wrong password cannot enumerate Auth or mutate it', async t => {
  const f = await fixture(); t.after(f.close); assert.equal((await f.request({ password: 'wrong' })).status, 401); assert.equal(f.pages.length, 0); assert.equal(f.writes.length, 0);
});
test('duplicate matching patients use latest record', async t => {
  const f = await fixture({ matches: [{ id: 'latest', full_name: 'Newest' }, { id: 'older', full_name: 'Older' }] }); t.after(f.close);
  assert.equal((await f.request()).status, 200); assert.equal(f.writes[0].data.user_metadata.full_name, 'Newest');
});
for (const options of [{ rpcError: true }, { listError: true }, { writeError: true }, { pages: [[{ id: 'existing', email: 'patient@example.com' }]], profileError: true }]) test('provider error fails closed with service unavailable', async t => {
  const f = await fixture(options); t.after(f.close); assert.equal((await f.request()).status, 503);
});
test('invalid input cannot reach Auth', async t => {
  const f = await fixture(); t.after(f.close); assert.equal((await f.request({ email: {} })).status, 400); assert.equal(f.pages.length, 0);
});

for (const options of [{ resetDuringRepair: true }, { bindingRace: true }]) test('credential reset race never returns a bound session: ' + JSON.stringify(options), async t => {
  const f = await fixture({ ...options, bearer: true, pages: [[{ id: 'existing', email: 'patient@example.com' }]] }); t.after(f.close); assert.equal((await f.request()).status, 401);
  if (options.resetDuringRepair) assert.equal(f.bindings.length, 0);
});
test('valid patient is bound to the verified Auth identity', async t => {
  const f = await fixture({ bearer: true, pages: [[{ id: 'existing', email: 'patient@example.com' }]] }); t.after(f.close); assert.deepEqual((await f.request()).body, { success: true, bound: true }); assert.deepEqual(f.bindings, [{ auth_user_id: 'existing' }]);
  assert.deepEqual(f.revocations, [{token:'native-token', scope:'others'}]); assert.equal(f.writes.length, 0);
});

for (const options of [{ invalidToken: true }, { tokenUserId: 'somebody-else' }]) test('invalid or wrong native token cannot bind or change Auth', async t => {
  const f = await fixture({ ...options, bearer: true, pages: [[{id:'existing',email:'patient@example.com'}]] }); t.after(f.close);
  assert.equal((await f.request()).status, 401); assert.equal(f.bindings.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.revocations.length, 0);
});
test('ordinary already-bound login preserves other device sessions', async t => {
  const f = await fixture({ bearer: true, patient: {auth_user_id:'existing'}, pages: [[{id:'existing',email:'patient@example.com'}]] }); t.after(f.close);
  assert.deepEqual((await f.request()).body, {success:true,bound:true}); assert.equal(f.revocations.length, 0);
});
test('failed old-session revocation cannot bind', async t => {
  const f = await fixture({ bearer:true, revokeError:true, pages: [[{id:'existing',email:'patient@example.com'}]] }); t.after(f.close);
  assert.equal((await f.request()).status, 503); assert.equal(f.bindings.length, 0);
});
