import test from 'node:test';
import assert from 'node:assert/strict';
import { readPatientPortalCache, writePatientPortalCache } from './patientPortalCache.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

test('patient portal cache is scoped to a patient', () => {
  store.clear();
  writePatientPortalCache('patient-a', { patientReports: [{ id: 'report-a' }] });
  assert.deepEqual(readPatientPortalCache('patient-a').patientReports, [{ id: 'report-a' }]);
  assert.equal(readPatientPortalCache('patient-b'), null);
});

test('patient portal cache never stores password fields', () => {
  store.clear();
  writePatientPortalCache('patient-a', { patientData: { profile: { name: 'A', password: 'secret' } } });
  assert.equal(readPatientPortalCache('patient-a').patientData.profile.password, undefined);
});
