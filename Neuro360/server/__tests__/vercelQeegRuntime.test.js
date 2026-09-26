const assert = require('assert');

const { getReportUploadDir, needsInstanceReportLock } = require('../services/reportRuntime');

assert.strictEqual(getReportUploadDir({ VERCEL: '1' }), '/tmp/neuro360-uploads');
assert.strictEqual(needsInstanceReportLock({ VERCEL: '1' }), false);
assert.strictEqual(needsInstanceReportLock({}), true);

console.log('vercelQeegRuntime: ok');
