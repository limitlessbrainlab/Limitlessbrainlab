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

const existing = { id: 'purchase-1', patient_id: 'patient-1', course_id: 'course-1', stripe_session_id: 'cs_test_1' };
const fakeDatabase = {
  from(table) {
    assert.equal(table, 'brain_course_purchases');
    const query = {
      inserted: false,
      insert() { this.inserted = true; return this; },
      select() { return this; },
      eq() { return this; },
      single: async () => query.inserted
        ? { data: null, error: { code: '23505' } }
        : { data: existing, error: null },
    };
    return query;
  },
};
const result = await applyBrainCoursePurchase({
  id: 'cs_test_1', payment_status: 'paid', amount_total: 409900, currency: 'inr',
  metadata: { type: 'brain_course', patient_id: 'patient-1', course_id: 'course-1' },
}, fakeDatabase);
assert.equal(result.ok, true);
assert.equal(result.alreadyApplied, true);
assert.deepEqual(result.purchase, existing);

console.log('brainCoursePurchases.test.mjs: ok');
