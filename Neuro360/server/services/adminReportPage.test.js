const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReportPage } = require('./adminReportPage');

test('parseReportPage bounds report list pagination', () => {
  assert.deepEqual(parseReportPage({ page: '0', pageSize: '500' }), { page: 1, pageSize: 50, offset: 0 });
  assert.deepEqual(parseReportPage({ page: '3', pageSize: '15' }), { page: 3, pageSize: 15, offset: 30 });
});
