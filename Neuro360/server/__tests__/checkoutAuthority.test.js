const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { resolveCheckout } = require('../services/checkoutAuthority');
const catalog = require('../config/checkoutCatalog.json');
const patientId = '11111111-1111-4111-8111-111111111111';
const clinicId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const user = { role: 'patient', patient_id: patientId };
function db(extra = {}) {
  const rows = { patients: { id: patientId, email: 'patient@example.test', full_name: 'Patient', clinic_id: clinicId }, ...extra };
  return { from(table) {
    const filters = {};
    const q = { select() { return q; }, eq(k,v) { filters[k] = v; return q; },
      maybeSingle: async () => ({ data: rows[table] || null, error: null }),
      then(resolve) { resolve({data: rows[table] || [], error: null}); } };
    return q;
  } };
}
test('subscription prices use shipped currency rounding and reject forged price, identity and price IDs', async () => {
  for (const cfg of Object.values(catalog.currencyConfig)) {
    const result = await resolveCheckout('subscription', { tierId: 'PREMIUM', currency: cfg.currency, metadata: { type: 'clinic_report', reports: 999 }, patientId: itemId }, user, db());
    assert.equal(result.amount, Math.round(42 * cfg.multiplier));
    assert.equal(result.patientId, patientId);
    assert.equal(result.customerEmail, 'patient@example.test');
    assert.equal(result.reports, undefined);
  }
  await assert.rejects(resolveCheckout('subscription', {tierId:'PREMIUM', price:0.01}, user, db()), /price has changed/);
  await assert.rejects(resolveCheckout('subscription', {tierId:'PREMIUM', priceId:'price_attacker'}, user, db(), {}, {}), /not configured/);
  await assert.rejects(resolveCheckout('subscription', {tierId:'PREMIUM', customerEmail:'victim@example.test'}, user, db()), /email must match/);
  const stripe = { prices: { retrieve: async id => ({id, active:true, currency:'usd', unit_amount:4200}) } };
  const result = await resolveCheckout('subscription', {tierId:'PREMIUM', priceId:'price_real'}, user, db(), stripe, {STRIPE_PRICE_PREMIUM:'price_real'});
  assert.equal(result.amount,42);
});
test('guest catalog purchases preserve shipped links and cannot attach patient or clinic identity', async () => {
  for (const [id, product] of Object.entries(catalog.legacyAssessments)) {
    const result = await resolveCheckout('assessment', {assessmentId:id, customerEmail:'guest@example.test', patientId, clinicId, assessmentLink:'https://attacker.test', amount:product.USD}, null, db());
    assert.equal(result.amount, product.USD);
    assert.equal(result.assessmentLink, product.link);
    assert.equal(result.patientId,''); assert.equal(result.clinicId,'');
  }
  await assert.rejects(resolveCheckout('assessment', {assessmentId:'anything',customerEmail:'guest@example.test',amount:1}, null,db()),/Unknown assessment/);
  await assert.rejects(resolveCheckout('frequency', {packId:'alpha'},null,db()),/sign in/);
});
test('public fallback bundle resolves links from the server catalog', async () => {
  const result = await resolveCheckout('assessment', {assessmentId:'neurosense-bundle', customerEmail:'guest@example.test'}, null,
    db({neurosense_assessments:[{link:'https://form.test/one',category:'individual'},{link:'https://form.test/bundle',category:'bundle'}]}));
  assert.equal(result.amount,19.99); assert.equal(result.assessmentLink,'https://form.test/one');
});
test('music and coaching use trusted catalog prices and database coach details', async () => {
  for (const kind of ['frequency','meditation']) {
    for (const [id, product] of Object.entries(catalog[kind])) {
      const result = await resolveCheckout(kind,{packId:id,packName:'Fake',isBundle:true},user,db());
      assert.equal(result.amount,product.USD); assert.equal(result.packName,product.name); assert.equal(result.isBundle,false);
    }
    await assert.rejects(resolveCheckout(kind,{packId:'gamma',amount:0.01},user,db()),/price has changed/);
  }
  const coach = {id:itemId,name:'Coach',email:'coach@example.test',price:90,calendly_url:'https://calendly.com/real',is_active:true};
  for (const currency of ['INR','USD']) {
    const result = await resolveCheckout('coaching',{coachId:itemId,currency,coachEmail:'attacker@example.test'},user,db({coaches:coach}));
    assert.equal(result.price,90); assert.equal(result.coachEmail,coach.email); assert.equal(result.calendlyUrl,coach.calendly_url);
  }
  await assert.rejects(resolveCheckout('coaching',{coachId:itemId,currency:'EUR'},user,db({coaches:coach})),/unsupported currency/);
  await assert.rejects(resolveCheckout('coaching',{coachId:itemId},user,db({coaches:{...coach,is_active:false}})),/not available/);
});
test('database assessments and clinic packages enforce availability and owning clinic', async () => {
  const assessment = {id:itemId,title:'Assessment',link:'https://form.test/1',is_active:true,sale_price_usd:17.99};
  const result = await resolveCheckout('assessment',{assessmentId:itemId},user,db({neurosense_assessments:assessment}));
  assert.equal(result.amount,17.99); assert.equal(result.assessmentLink,assessment.link);
  await assert.rejects(resolveCheckout('assessment',{assessmentId:itemId},user,db({neurosense_assessments:{...assessment,is_free:true}})),/not available/);
  const clinic = {id:clinicId,email:'clinic@example.test',name:'Clinic',clinic_type:'lbl_clinic'};
  const actor = {role:'clinic_admin',clinic_id:clinicId};
  const pack = {label:'Custom',reports:7,price_inr:1234,price_usd:15,is_active:true};
  const purchase = await resolveCheckout('clinic_report',{clinicId,packageId:'custom',reports:1000,currency:'INR'},actor,db({clinics:clinic,pricing_config:pack}));
  assert.equal(purchase.reports,7); assert.equal(purchase.amount,1234);
  await assert.rejects(resolveCheckout('clinic_report',{clinicId:itemId,packageId:'custom'},actor,db()),/access denied/);
  await assert.rejects(resolveCheckout('clinic_report',{clinicId,packageId:'clinic-5'},actor,db({clinics:clinic,pricing_config:{...pack,is_active:false}})),/not active/);
  const fallback = await resolveCheckout('clinic_report',{clinicId,packageId:'clinic-10'},actor,db({clinics:clinic}));
  assert.equal(fallback.amount,30); assert.equal(fallback.reports,10);
  await assert.rejects(resolveCheckout('subscription',{patientId,tierId:'BASIC'},{role:'clinic_admin',clinic_id:itemId},db()),/access denied/);
});
test('actual checkout handlers reject penny purchases before Stripe and discard malicious metadata', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'),'utf8');
  const handlers = {};
  const calls = [];
  const app = { post(path,...fns) { handlers[path] = fns; } };
  const context = {app, require: () => ({resolveCheckout}), supabase:db(), stripe:{checkout:{sessions:{create: async payload => {calls.push(payload); return {id:'fixture',url:'https://checkout.test'};}}}},
    authMiddleware(req,res,next) {if (!req.user) return res.status(401).json({}); next();}, CHECKOUT_UI:{}, checkoutProductImages:()=>[], resolveCheckoutBase:()=> 'https://app.test',console:{log(){},error(){}}};
  for (const path of ['/api/stripe/create-checkout-session','/api/create-assessment-checkout']) {
    const start = source.indexOf(`app.post('${path}'`);
    vm.runInNewContext(source.slice(start,source.indexOf('\n});',start)+4),context);
  }
  async function invoke(path, body, actor=user) {
    const req={body,user:actor,headers:{}};
    let status=200;
    const res={status(n){status=n;return res;},json(value){this.body=value;return this;}};
    await handlers[path].at(-1)(req,res);
    return {status,body:res.body};
  }
  assert.equal((await invoke('/api/stripe/create-checkout-session',{tierId:'ENTERPRISE',price:0.01})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await invoke('/api/stripe/create-checkout-session',{tierId:'BASIC',price:12,metadata:{type:'clinic_report',tier:'ENTERPRISE',reports:'999'}})).status,200);
  assert.equal(calls[0].metadata.type,'subscription'); assert.equal(calls[0].metadata.tier,'BASIC'); assert.equal(calls[0].metadata.reports,undefined);
  assert.equal(calls[0].line_items[0].price_data.unit_amount,1200);
  assert.equal((await invoke('/api/create-assessment-checkout',{assessmentId:'landing_brain_fitness',amount:2.99,customerEmail:'guest@example.test',patientId,clinicId},null)).status,200);
  assert.equal(calls[1].line_items[0].price_data.unit_amount,299);
  assert.equal(calls[1].metadata.patient_id,''); assert.equal(calls[1].metadata.clinic_id,'');
});
test('wallet returned errors or zero affected rows never show a successful state change', async () => {
  const source=fs.readFileSync(require.resolve('../../src/pages/Wallet.jsx'),'utf8');
  for (const handler of ['handleToggleSubscription','handleCancelSubscription']) {
    const start=source.indexOf(`const ${handler} =`);
    const code=source.slice(start,source.indexOf('\n  };',start)+5);
    for (const result of [{data:null,error:new Error('denied')},{data:null,error:null},{data:{id:'s1'},error:null}]) {
      let changes=0,success=0,errors=0;
      const q={update(){return q;},eq(){return q;},select(){return q;},maybeSingle:async()=>result};
      const context={supabase:{from:()=>q},setSubscriptions(){changes++;},setWalletBalance(){},toast:{success(){success++;},error(){errors++;}}};
      vm.runInNewContext(`${code}; this.run=${handler};`,context);
      await context.run('s1','Active');
      assert.equal(changes,result.data?1:0); assert.equal(success,result.data?1:0); assert.equal(errors,result.data?0:1);
    }
  }
});
