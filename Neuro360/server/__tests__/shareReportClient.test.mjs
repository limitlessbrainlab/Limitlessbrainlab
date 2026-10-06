import assert from 'node:assert/strict';
import { shareReport } from '../../src/utils/shareReport.js';

let request;
await shareReport({ patientId: 'patient-1' }, {
  getToken: async () => 'token-1',
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ report: { id: 'report-1' } }) };
  },
});

assert.equal(request.url, '/api/share-report');
assert.equal(request.options.headers.Authorization, 'Bearer token-1');
assert.deepEqual(JSON.parse(request.options.body), { patientId: 'patient-1' });
console.log('shareReportClient.test.mjs: ok');
