const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function middleware(user, { profileRole = 'patient', clinic = null } = {}) {
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: user.id, session_id: 'verified-session', ...user } } }),
      getUser: async () => ({ data: { user } }) },
    async rpc(name, args) {
      assert.equal(name, 'resolve_portal_identity');
      assert.equal(args.p_user_id, user.id);
      assert.equal(args.p_session_id, 'verified-session');
      if (user.app_metadata?.role === 'clinic_admin') {
        return { data: clinic?.is_active ? { id: user.id, email: clinic.email, role: 'clinic_admin', clinic_id: clinic.id } : null };
      }
      return { data: { id: user.id, email: user.email, role: profileRole } };
    }
  };
  const context = { module: { exports: {} }, console, performance, require: name =>
    name === '../dbRouter' ? { createRoutedClient: () => db } : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../middleware/authMiddleware.js'), 'utf8'), context);
  return context.module.exports.authMiddleware;
}

async function request(auth) {
  const req = { headers: { authorization: 'Bearer test' } };
  let status, passed = false;
  const res = { status(code) { status = code; return this; }, json() {} };
  await auth(req, res, () => { passed = true; });
  return { user: req.user, status, passed };
}

test('user-editable role metadata cannot grant admin access', async () => {
  const result = await request(middleware({ id: 'patient', email: 'p@example.test', user_metadata: { role: 'super_admin' } }));
  assert.equal(result.passed, true);
  assert.equal(result.user.role, 'patient');
});

test('verified profile preserves administrator access', async () => {
  const result = await request(middleware({ id: 'admin', email: 'a@example.test' }, { profileRole: 'super_admin' }));
  assert.equal(result.user.role, 'super_admin');
});

test('clinic identity requires a current active database mapping', async () => {
  const user = { id: 'internal-auth-id', app_metadata: { role: 'clinic_admin', clinic_id: 'clinic' } };
  assert.equal((await request(middleware(user))).status, 401);
  assert.equal((await request(middleware(user, { clinic: { id: 'clinic', is_active: false } }))).status, 401);
  const auth = middleware(user, { clinic: { id: 'clinic', email: 'c@example.test', is_active: true } });
  const result = await request(auth);
  assert.equal(result.passed, true);
  assert.equal(result.user.clinic_id, 'clinic');
  assert.equal(result.user.email, 'c@example.test');
});
