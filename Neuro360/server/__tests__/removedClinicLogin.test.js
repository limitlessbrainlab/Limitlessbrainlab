const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('removed clinic denies its login without blocking a separate admin using the same email', async () => {
  const email = 'shared@example.com';
  let adminExists = true;
  const clinic = { id: 'clinic', email, is_active: false, deletedAt: '2026-11-06', password: 'clinic-password' };
  const client = { auth: {
    signOut: async () => {},
    signInWithPassword: async ({ password }) => ({ error: password === 'admin-password' ? null : new Error('bad password') })
  }, from: () => ({select: () => ({eq: () => ({order: async () => ({data:[],error:null})})})}) };
  const api = { interceptors: { request: { use() {} }, response: { use() {} } } };
  const context = { module: {exports:{}}, console: { log() {}, warn() {}, error() {} },
    axios: {create: () => api}, Cookies: {}, SupabaseService: {supabase:client},
    DatabaseService: {get: async table => table === 'clinics' ? [clinic] : table === 'superAdmins' && adminExists ? [{id:'admin',email,role:'super_admin'}] : []},
    comparePassword: async (a,b) => a === b, getOriginUrl: () => '', sameEnv: () => true
  };
  // Load the actual Vite module with its external services supplied as fixtures.
  const source = fs.readFileSync(path.join(__dirname,'../../src/services/authService.js'),'utf8')
    .replace(/^import .*;\r?$/gm,'').replace(/import\.meta\.env/g,'({})')
    .replace(/export const authService/,'const authService').replace(/export default authService;?/,'')
    + '\nmodule.exports = authService;';
  vm.runInNewContext(source, context);
  const login = password => context.module.exports.loginWithEmail({email,password,userType:'clinic'});
  const result = await login('admin-password');
  assert.equal(result.user.role,'super_admin');
  assert.equal(result.user.id,'admin');
  await assert.rejects(() => login('clinic-password'), /Invalid email or password/);
  adminExists = false;
  await assert.rejects(() => login('clinic-password'), /account has been removed/i);
});
