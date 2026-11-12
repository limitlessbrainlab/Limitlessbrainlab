const assert = require('node:assert/strict');
const { test } = require('node:test');
const { applyVerifiedPatientPurchase } = require('../services/verifiedPatientPurchases');

function fixture() {
  const tables = { patients: [{ id: 'patient-row', email: 'buyer@example.com', clinic_id: 'clinic-row', full_name: 'Buyer' }], neurosense_assessments: [] };
  let failure = null;
  const db = { from(table) {
    let inserted;
    const filters = [];
    const q = {
      select() { return q; }, eq(key, value) { filters.push(row => row[key] === value); return q; }, limit() { return q; }, order() { return q; },
      insert(row) { inserted = row; return q; },
      then(resolve) {
        if (failure === table && inserted) return Promise.resolve({ error: { message: 'Write failed' } }).then(resolve);
        tables[table] ||= [];
        if (inserted) tables[table].push({ id: `${table}-${tables[table].length}`, ...inserted });
        return Promise.resolve({ data: tables[table].filter(row => filters.every(filter => filter(row))), error: null }).then(resolve);
      }
    }; return q;
  } };
  return { db, tables, fail: value => { failure = value; } };
}
const session = (type, item, extra = {}) => ({
  id: `cs_${type}_${item}`, payment_status: 'paid', customer_email: 'Buyer@Example.com', amount_total: 2200,
  currency: 'usd', payment_intent: 'pi_fixture', metadata: { type, assessment_id: item, pack_id: item, coach_id: item, coach_name: 'Fixture Coach', assessment_name: 'Fixture Assessment', ...extra }
});

test('verified purchases persist minimal-schema entitlements and accurate patient payment rows once', async () => {
  for (const [type, table, item] of [['assessment', 'assessment_purchases', 'assessment-one'], ['frequency', 'frequency_purchases', 'solfeggio_528'], ['meditation', 'meditation_purchases', 'gamma'], ['coaching_session', null, 'coach-one']]) {
    const f = fixture(); const paid = session(type, item, { patient_id: 'auth-uid' });
    const result = await applyVerifiedPatientPurchase(paid, f.db);
    await applyVerifiedPatientPurchase(paid, f.db);
    assert.equal(result.itemId, item);
    assert.equal(result.email, 'buyer@example.com');
    assert.equal(f.tables.patient_payments.length, 1);
    const payment = f.tables.patient_payments[0];
    assert.equal(payment.patient_id, 'patient-row'); assert.equal(payment.clinic_id, 'clinic-row');
    assert.equal(payment.amount, 22); assert.equal(payment.currency, 'USD');
    assert.equal(payment.type, type === 'coaching_session' ? 'coaching' : type);
    if (table) assert.equal(f.tables[table].length, 1);
    if (type === 'meditation') {
      assert.equal(f.tables.frequency_purchases, undefined, 'gamma meditation must not grant frequency access');
      assert.deepEqual(Object.keys(f.tables[table][0]).sort(), ['id', 'meditation_id', 'patient_email', 'purchased_at']);
    }
  }
});

test('catalog and legacy assessment bundles retain every child entitlement on retries', async () => {
  const f = fixture();
  f.tables.neurosense_assessments = [
    { id: 'bundle', title: 'Bundle', category: 'bundle', is_active: true },
    { id: 'child-a', title: 'Child A', link: 'https://fixture.invalid/a', category: 'individual', is_active: true },
    { id: 'child-b', title: 'Child B', link: 'https://fixture.invalid/b', category: 'individual', is_active: true }
  ];
  const paid = session('assessment', 'bundle');
  await applyVerifiedPatientPurchase(paid, f.db); await applyVerifiedPatientPurchase(paid, f.db);
  assert.deepEqual(f.tables.assessment_purchases.map(p => p.assessment_id), ['bundle', 'child-a', 'child-b']);
  assert.deepEqual(f.tables.assessment_purchases.map(p => p.amount_paid), [22, 0, 0]);
  assert.equal(f.tables.assessment_purchases[1].stripe_session_id, `${paid.id}_child-a`);
  const fallback = fixture(); fallback.tables.neurosense_assessments = f.tables.neurosense_assessments;
  await applyVerifiedPatientPurchase(session('assessment', 'neurosense-bundle'), fallback.db);
  assert.deepEqual(fallback.tables.assessment_purchases.map(p => p.assessment_id), ['neurosense-bundle', 'child-a', 'child-b']);
  const legacy = fixture(); await applyVerifiedPatientPurchase(session('assessment', 'assessment_bundle'), legacy.db);
  assert.deepEqual(legacy.tables.assessment_purchases.map(p => p.assessment_id), ['assessment_bundle', 'brain_fitness', 'brain_burnout', 'brain_age', 'dementia_index']);
});

test('unpaid sessions never grant access; failed persistence remains retryable', async () => {
  const f = fixture(); const paid = session('meditation', 'gamma');
  await assert.rejects(() => applyVerifiedPatientPurchase({ ...paid, payment_status: 'unpaid' }, f.db), /verified paid/);
  assert.equal(f.tables.meditation_purchases, undefined);
  f.fail('patient_payments'); await assert.rejects(() => applyVerifiedPatientPurchase(paid, f.db));
  assert.equal(f.tables.meditation_purchases.length, 1);
  f.fail(null); await applyVerifiedPatientPurchase(paid, f.db);
  assert.equal(f.tables.meditation_purchases.length, 1); assert.equal(f.tables.patient_payments.length, 1);
});

test('browser confirmation rejects unpaid or mismatched receipts before updating purchase UI', async () => {
  const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
  let response = { success: true, purchase: { email: 'buyer@example.com', type: 'meditation', itemId: 'gamma' } };
  let requests = 0;
  const context = { module: { exports: {} }, checkoutCatalog: require('../config/checkoutCatalog.json'), console: { warn() {}, error() {} },
    fetch: async () => { requests++; return { ok: true, json: async () => response }; } };
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/stripeService.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '').replace(/import\.meta\.env/g, '({})')
    .replace('export default new StripeService();', 'module.exports = new StripeService();');
  vm.runInNewContext(source, context);
  const verify = id => context.module.exports.verifyPaymentSuccess(id, { email: 'Buyer@Example.com', type: 'meditation', itemId: 'gamma' });
  assert.equal((await verify('cs_paid')).success, true);
  await assert.rejects(() => verify(''), /session is missing/); assert.equal(requests, 1);
  for (const invalid of [{ success: false }, { success: true },
    { success: true, purchase: { email: 'other@example.com', type: 'meditation', itemId: 'gamma' } },
    { success: true, purchase: { email: 'buyer@example.com', type: 'frequency', itemId: 'gamma' } },
    { success: true, purchase: { email: 'buyer@example.com', type: 'meditation', itemId: 'other' } }]) {
    response = invalid; await assert.rejects(() => verify('cs_paid'), /could not be confirmed/);
  }
});
