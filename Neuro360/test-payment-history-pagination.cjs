const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('src/components/admin/PaymentHistory.jsx', 'utf8');

assert.match(page, /const PAGE_SIZE = 10/, 'payment history must use 10-row pages');
assert.match(page, /filteredPayments\.slice\(page \* PAGE_SIZE, \(page \+ 1\) \* PAGE_SIZE\)/, 'table must render only the selected page');
assert.match(page, /from-blue-500 to-blue-600/, 'monthly revenue icon needs a visible blue background');
assert.match(page, /min-h-screen bg-gray-50 p-4 sm:p-5 lg:p-6 space-y-5/, 'payment sections need deliberate vertical spacing');
assert.ok((page.match(/<div className="p-5">/g) || []).length >= 3, 'summary cards must use compact padding');

console.log('payment history pagination checks passed');
