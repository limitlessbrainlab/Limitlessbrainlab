import assert from 'node:assert/strict';
import purchases from '../services/brainCoursePurchases.js';

const { normalizeCoursePayload, applyBrainCoursePurchase } = purchases;

assert.throws(() => normalizeCoursePayload({ course_url: 'http://example.com' }), /HTTPS/);
assert.throws(() => normalizeCoursePayload({ course_url: 'https://example.com', currency: 'RUPEE' }), /currency/);
assert.throws(() => normalizeCoursePayload({ course_url: 'https://example.com', is_free: false, sale_price: '0' }), /positive/);
assert.deepEqual(
  normalizeCoursePayload({ course_url: 'https://example.com', original_price: '', sale_price: '', is_free: true }),
  { course_url: 'https://example.com/', original_price: null, sale_price: null, is_free: true, currency: 'INR' }
);

let insertCalls = 0;
let existing = null;
const fakeDatabase = {
  from(table) {
    assert.equal(table, 'brain_course_purchases');
    const query = {
      inserted: null,
      insert(values) { insertCalls += 1; this.inserted = values; return this; },
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({ data: existing, error: null }),
      single: async () => {
        existing = { id: 'purchase-1', ...query.inserted };
        return { data: existing, error: null };
      },
    };
    return query;
  },
};
const paidSession = {
  id: 'cs_test_1', payment_status: 'paid', amount_total: 409900, currency: 'inr',
  metadata: { type: 'brain_course', patient_id: 'patient-1', course_id: 'course-1' },
};
const firstResult = await applyBrainCoursePurchase(paidSession, fakeDatabase);
const repeatedResult = await applyBrainCoursePurchase(paidSession, fakeDatabase);
assert.equal(firstResult.ok, true);
assert.equal(firstResult.alreadyApplied, false);
assert.equal(repeatedResult.ok, true);
assert.equal(repeatedResult.alreadyApplied, true);
assert.equal(insertCalls, 1);
assert.deepEqual(repeatedResult.purchase, existing);

console.log('brainCoursePurchases.test.mjs: ok');
