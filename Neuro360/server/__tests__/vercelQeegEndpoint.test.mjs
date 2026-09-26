import assert from 'node:assert/strict';
import handler from '../../api/process-neurosense-report.js';

let status;
let body;
await handler(
  { method: 'POST', headers: {}, url: '/api/process-neurosense-report' },
  { status(code) { status = code; return this; }, json(value) { body = value; return this; } },
);

assert.equal(status, 401);
assert.equal(body.message, 'Authentication is required');
console.log('vercelQeegEndpoint: ok');
