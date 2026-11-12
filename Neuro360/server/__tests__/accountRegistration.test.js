const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createAccountRegistrationRouter } = require('../routes/accountRegistrationRoutes');
async function fixture(options = {}) {
  const writes = [];
  const db = { from(table) {
    let row;
    const q = { select() { return q; }, ilike() { return q; }, eq() { return q; }, is() { return q; }, limit() { return q; },
      insert(value) { row = value; writes.push({ table, row }); return q; },
      async single() { return { data: { id: 'new-id', name: row.name, full_name: row.full_name, email: row.email } }; },
      then(resolve) { return Promise.resolve(options.error ? { error: new Error('unavailable') } : { data: options.duplicate ? [{ id: 'existing' }] : [] }).then(resolve); }
    }; return q;
  } };
  const app = express(); app.use(express.json()); app.use(createAccountRegistrationRouter(db));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { writes, close: () => new Promise(resolve => server.close(resolve)), async request(extra = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New User', email: ' NEW@example.com ', password: ' password ', dateOfBirth:'2000-01-01', gender:'other', userType: 'clinic', ...extra }) });
    return { status: response.status, body: await response.json() };
  } };
}
for (const userType of ['clinic', 'patient']) test(userType + ' inserts complete credentials once without accepting privileged fields', async t => {
  const f = await fixture(); t.after(f.close);
  const r = await f.request({ userType, role: 'super_admin', is_active: true, owner_user: 'attacker', auth_user_id: 'attacker' });
  assert.equal(r.status, 201); assert.equal(f.writes.length, 1);
  const { row } = f.writes[0]; assert.equal(row.email, 'new@example.com');
  assert.equal(row.plain_password, 'password'); assert.equal(await bcrypt.compare('password', row.password), true);
  assert.equal(row.role, undefined); assert.equal(row.owner_user, undefined); assert.equal(row.auth_user_id, undefined);
  if (userType === 'patient') assert.equal(row.org_id, 'e34abedf-9d27-4000-a9c1-b8bad8bc8c30');
  if (userType === 'clinic') { assert.equal(row.is_active, false); assert.equal(row.subscription_status, 'pending_approval'); }
  assert.equal(r.body.account.password, undefined); assert.equal(r.body.account.plain_password, undefined);
});
for (const body of [{ userType: 'super_admin' }, { name: {} }, { password: '   ' }, { email: 'bad' }, { gender: {} }]) test('invalid registration cannot write: ' + JSON.stringify(body), async t => {
  const f = await fixture(); t.after(f.close); assert.equal((await f.request(body)).status, 400); assert.equal(f.writes.length, 0);
});
for (const [options, status] of [[{ duplicate: true }, 409], [{ error: true }, 503]]) test('duplicate or lookup outage never inserts', async t => {
  const f = await fixture(options); t.after(f.close); assert.equal((await f.request()).status, status); assert.equal(f.writes.length, 0);
});
test('unavailable clinic cannot be attached to a patient', async t => {
  const f = await fixture(); t.after(f.close); assert.equal((await f.request({ userType: 'patient', clinicName: 'missing' })).status, 400); assert.equal(f.writes.length, 0);
});

for (const invalid of [{dateOfBirth:undefined},{gender:undefined},{dateOfBirth:'2000-02-31'}]) test('patient required fields reject before DB writes', async t => {
  const f=await fixture();t.after(f.close);assert.equal((await f.request({userType:'patient',...invalid})).status,400);assert.equal(f.writes.length,0);
});
