const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('void credential writes are success, missing RPCs stay distinct, and denials propagate', async () => {
  let response = { data: null, error: null };
  const context = {
    module: { exports: {} }, console: { warn() {} },
    SupabaseService: { supabase: { rpc: async () => response } }
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/credentialRpc.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace('export const credentialRpc', 'const credentialRpc')
    .replace('export default credentialRpc;', 'module.exports = credentialRpc;');
  vm.runInNewContext(source, context);
  const rpc = context.module.exports;
  const writes = [
    () => rpc.claimCredentials('patients', 'patient@example.com', 'new-password'),
    () => rpc.claimCredentials('clinics', 'clinic@example.com', 'new-password'),
    () => rpc.setClinicPassword('clinic-id', 'new-password'),
    () => rpc.setPatientPasswordByClinic('clinic-id', 'patient-id', 'new-password')
  ];
  for (const write of writes) assert.equal(await write(), true, 'void success must never trigger a fallback write');
  response = { error: { code: 'PGRST202', message: 'Could not find the function' } };
  for (const write of writes) assert.equal(await write(), null);
  response = { error: { code: '42501', message: 'Permission denied' } };
  for (const write of writes) await assert.rejects(write, /Permission denied/);
});
