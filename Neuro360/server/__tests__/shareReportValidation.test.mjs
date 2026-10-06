import assert from 'node:assert/strict';
import { validateShareRequest } from '../../api/share-report.js';

assert.deepEqual(
  validateShareRequest({
    clinicId: 'clinic-1', patientId: 'patient-1', fileName: 'report.pdf',
    filePath: 'reports/clinic-1/report.pdf', reportData: {},
  }),
  null,
);
assert.equal(validateShareRequest({ clinicId: 'clinic-1', patientId: 'patient-1', fileName: 'report.pdf', reportData: {} }), 'filePath is required');
assert.equal(validateShareRequest({ clinicId: 'clinic-1', fileName: 'report.pdf', filePath: 'x', reportData: {} }), 'patientId is required');

console.log('shareReportValidation.test.mjs: ok');
