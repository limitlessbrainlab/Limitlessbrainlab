import assert from 'node:assert/strict';
import { validateShareRequest } from '../../api/share-report.js';
assert.equal(validateShareRequest({ clinicId: 'c', patientId: 'p', fileName: 'r.pdf', filePath: 'r.pdf', reportData: {} }), null);
assert.equal(validateShareRequest({ clinicId: 'c', patientId: 'p', fileName: 'r.pdf', reportData: {} }), 'filePath is required');
console.log('shareReportValidation.test.mjs: ok');
