const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load({ admin = false, session = true, patient = false, provision = false, bound = false } = {}) {
  const calls = [];
  const client = { auth: {
    signOut: async () => {},
    signInWithPassword: async () => { calls.push('auth'); return { data: { user: { id: 'verified-id' }, session: session ? { access_token: 'jwt' } : null }, error: admin ? null : new Error('bad') }; },
    getSession: async () => ({ data: { session: session ? { access_token: 'jwt' } : null } })
  }, from(table) { calls.push(table); if (table === 'patients') return { update: () => ({ eq: async () => ({error:null}) }) }; return { select() { return this; }, eq(key, value) { assert.equal(key, 'id'); assert.equal(value, 'verified-id'); return this; }, async maybeSingle() { return { data: { id: 'verified-id', role: 'super_admin', email: 'admin@example.com' } }; } }; } };
  const api = { interceptors: { request: { use() {} }, response: { use() {} } } };
  const context = { module: { exports: {} }, console: { warn() {}, error() {} }, axios: { create: () => api }, Cookies: {}, SupabaseService: { supabase: client },
    credentialRpc: { verifyClinicLogin: async () => [], verifyPatientLogin: async () => patient ? [{id:'patient-id',email:'patient@example.com'}] : [] },
    sameEnv: () => true, getOriginUrl: () => '',
    DatabaseService: { get() { throw Error('public scan forbidden'); } }, PUBLIC_COLUMNS: { profiles: 'id,role,email' },
    fetch: async (url, options) => { calls.push(url); if (url.endsWith('/ensure-patient-auth') && calls.includes('auth')) assert.equal(options.headers.Authorization, 'Bearer jwt'); return { ok: provision || !url.endsWith('/ensure-patient-auth'), json: async () => ({ success: true, bound, account: { id: 'new', name: 'New', email: 'new@example.com' } }) }; }
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/authService.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/import\.meta\.env/g, '({})').replace('export const authService', 'const authService').replace(/export default authService;?/, '') + '\nmodule.exports=authService;';
  vm.runInNewContext(source, context); return { auth: context.module.exports, calls };
}
test('admin authenticates before ID-bound profile lookup and returns real session', async () => {
  const f = load({ admin: true }); const r = await f.auth.loginWithEmail({ email: 'admin@example.com', password: 'password' });
  assert.equal(r.token, 'jwt'); assert.equal(r.user.id, 'verified-id'); assert.deepEqual(f.calls, ['auth', 'profiles']);
});
test('admin login without a session cannot succeed', async () => {
  const f = load({ admin: true, session: false }); await assert.rejects(() => f.auth.loginWithEmail({ email: 'admin@example.com', password: 'password' }), /Invalid email or password/);
});
test('clinic registration uses server without public scans or credential claim', async () => {
  const f = load(); const r = await f.auth.registerWithEmail({ name: 'New', email: 'new@example.com', password: 'password', confirmPassword: 'password', userType: 'clinic' });
  assert.equal(r.needsActivation, true); assert.equal(r.user.id, 'new'); assert.ok(f.calls[0].endsWith('/register-account'));
});
test('public administrator registration is rejected before requests', async () => {
  const f = load(); await assert.rejects(() => f.auth.registerWithEmail({ name: 'New', email: 'new@example.com', password: 'password', confirmPassword: 'password', userType: 'super_admin' }), /Invalid user type/); assert.equal(f.calls.length, 0);
});
test('patient signup requires real login and reports persisted account on session failure', async () => {
  const f = load(); let invoked = false;
  f.auth.loginWithEmail = async args => { invoked = true; assert.equal(args.userType, 'patient'); throw new Error('Auth unavailable'); };
  await assert.rejects(() => f.auth.registerWithEmail({ name: 'New', email: 'new@example.com', password: 'password', confirmPassword: 'password', userType: 'patient' }), /account was created.*sign-in failed/);
  assert.equal(invoked, true);
});

test('patient login requires current credential binding even when native password would succeed', async () => {
  const f = load({ admin: true, patient: true });
  await assert.rejects(() => f.auth.loginWithEmail({ email: 'patient@example.com', password: 'password', userType: 'patient' }), /secure patient session/);
  assert.equal(f.calls.length, 1); assert.ok(f.calls[0].endsWith('/ensure-patient-auth'));
});

test('native sign-in alone cannot complete login when binding was not confirmed', async () => {
  const f = load({ admin:true, patient:true, provision:true });
  await assert.rejects(() => f.auth.loginWithEmail({email:'patient@example.com',password:'password',userType:'patient'}), /secure patient session/);
  assert.equal(f.calls.length, 3); assert.equal(f.calls[1], 'auth'); assert.ok(f.calls[2].endsWith('/ensure-patient-auth'));
});
test('patient login exchanges native JWT for confirmed binding before success', async () => {
  const f = load({ admin:true, patient:true, provision:true, bound:true });
  const result = await f.auth.loginWithEmail({email:'patient@example.com',password:'password',userType:'patient'});
  assert.equal(result.token, 'jwt'); assert.equal(f.calls[1], 'auth'); assert.ok(f.calls[2].endsWith('/ensure-patient-auth')); assert.equal(f.calls[3], 'patients');
});
