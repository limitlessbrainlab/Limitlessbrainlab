const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAuth({ exchangeError = false, wrongIdentity = false, backendError = false } = {}) {
  const clinic = { id: 'clinic-1', email: 'shared@example.com', is_active: true };
  let exchanges = 0;
  const client = { auth: {
    signOut: async () => {},
    verifyOtp: async args => {
      exchanges++;
      assert.equal(args.token_hash, 'one-use-token'); assert.equal(args.type, 'magiclink');
      return { error: exchangeError ? new Error('expired') : null, data: {
        session: { access_token: 'real-supabase-jwt' },
        user: { id: wrongIdentity ? 'other-user' : 'auth-clinic', app_metadata: { role: 'clinic_admin', clinic_id: clinic.id } }
      } };
    }
  } };
  const api = { interceptors: { request: { use() {} }, response: { use() {} } } };
  const context = { module: { exports: {} }, console: { error() {}, warn() {} },
    axios: { create: () => api }, Cookies: {}, SupabaseService: { supabase: client },
    credentialRpc: { verifyClinicLogin: async () => [clinic] },
    sameEnv: () => true, getOriginUrl: () => '',
    fetch: async (url, opts) => {
      assert.match(url, /\/clinic-session$/);
      assert.deepEqual(JSON.parse(opts.body), { email: clinic.email, password: 'clinic-password' });
      return { ok: !backendError, json: async () => ({ token_hash: 'one-use-token', auth_user_id: 'auth-clinic', clinic_id: clinic.id }) };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/authService.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/import\.meta\.env/g, '({})')
    .replace(/export const authService/, 'const authService').replace(/export default authService;?/, '') + '\nmodule.exports = authService;';
  vm.runInNewContext(source, context);
  return { login: () => context.module.exports.loginWithEmail({ email: clinic.email, password: 'clinic-password', userType: 'clinic' }), exchanges: () => exchanges };
}

test('clinic login returns only a genuine matching Supabase session', async () => {
  const f = loadAuth(); const result = await f.login();
  assert.equal(result.token, 'real-supabase-jwt'); assert.equal(result.user.clinicId, 'clinic-1'); assert.equal(f.exchanges(), 1);
});
for (const scenario of [{ exchangeError: true }, { wrongIdentity: true }, { backendError: true }]) {
  test('clinic session failures cannot fall back to timestamp tokens: ' + JSON.stringify(scenario), async () => {
    await assert.rejects(loadAuth(scenario).login, /secure clinic session/i);
  });
}
