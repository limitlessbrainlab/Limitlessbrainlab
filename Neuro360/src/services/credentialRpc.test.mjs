// Run: node --experimental-vm-modules --test src/services/credentialRpc.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./credentialRpc.js', import.meta.url), 'utf8');

async function loadRpc(result) {
  const context = vm.createContext({ console });
  const dependency = new vm.SyntheticModule(['default'], function () {
    this.setExport('default', { supabase: { rpc: async () => result } });
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => dependency);
  await module.evaluate();
  return module.namespace.default;
}

const writes = [
  ['setClinicPassword', ['clinic-id', 'password']],
  ['setPatientPassword', ['patient-id', 'password']],
  ['setPatientPasswordByClinic', ['clinic-id', 'patient-id', 'password']],
  ['healPatientPassword', ['patient-id', 'password']],
  ['claimCredentials', ['patients', 'patient@example.test', 'password']],
];

test('successful void writes do not request a legacy credential-column write', async () => {
  const rpc = await loadRpc({ data: null, error: null });
  for (const [method, args] of writes) {
    assert.equal(await rpc[method](...args), true, method);
  }
});

test('only unavailable RPCs request legacy fallback', async () => {
  const rpc = await loadRpc({ data: null, error: { code: 'PGRST202', message: 'Missing function' } });
  for (const [method, args] of writes) assert.equal(await rpc[method](...args), null, method);
});

test('permission failures are not treated as successful writes or fallback', async () => {
  const rpc = await loadRpc({ data: null, error: { code: '42501', message: 'not-permitted' } });
  for (const [method, args] of writes) {
    await assert.rejects(rpc[method](...args), { code: '42501' });
  }
});

test('login results retain no-match semantics', async () => {
  const empty = await loadRpc({ data: [], error: null });
  assert.equal((await empty.verifyPatientLogin('patient@example.test', 'wrong')).length, 0);
  assert.equal((await empty.verifyClinicLogin('clinic@example.test', 'wrong')).length, 0);
  const noAdmin = await loadRpc({ data: null, error: null });
  assert.equal(await noAdmin.verifyAdminLogin('admin@example.test', 'wrong'), null);
});
