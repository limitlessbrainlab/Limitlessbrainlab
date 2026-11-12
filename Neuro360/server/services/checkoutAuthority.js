const catalog = require('../config/checkoutCatalog.json');
const { UUID } = require('../utils/patientAccess');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

async function resolveCheckout(kind, input, user, db, stripe, env = process.env) {
  let email;
  let patient = null;
  let clinic = null;
  if (kind === 'clinic_report') {
    if (!user) fail('Please sign in to purchase reports', 401);
    if (!['clinic_admin', 'super_admin'].includes(user.role) || !UUID.test(String(input.clinicId || '')) ||
        (user.role === 'clinic_admin' && user.clinic_id !== input.clinicId)) fail('Clinic access denied', 403);
    const query = await db.from('clinics').select('id,email,name,clinic_type,deleted_at').eq('id', input.clinicId).maybeSingle();
    if (query.error) throw query.error;
    clinic = query.data;
    if (!clinic || clinic.deleted_at) fail('Clinic access denied', 403);
    email = clinic.email;
  } else if (!user) {
    if (kind !== 'assessment') fail('Please sign in to purchase this product', 401);
    email = String(input.customerEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) fail('A valid buyer email is required');
  } else {
    if (!['patient', 'clinic_admin', 'super_admin'].includes(user.role)) fail('Patient access required', 403);
    let query = db.from('patients').select('id,email,full_name,name,clinic_id,org_id');
    if (user.role === 'patient') {
      if (!user.patient_id) fail('Patient identity is unavailable', 403);
      query = query.eq('id', user.patient_id);
    } else {
      if (typeof input.patientId !== 'string' || !UUID.test(input.patientId)) fail('Select a patient to purchase for');
      query = query.eq('id', input.patientId);
    }
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    patient = result.data;
    if (!patient || (user.role === 'clinic_admin' && (patient.clinic_id || patient.org_id) !== user.clinic_id)) fail('Patient access denied', 403);
    email = patient.email?.trim().toLowerCase();
    if (!email) fail('The patient must have an email address');
    const requestedEmail = input.customerEmail || input.patientEmail;
    if (requestedEmail && String(requestedEmail).trim().toLowerCase() !== email) fail('Checkout email must match the selected patient', 403);
  }
  const currency = String(input.currency || (kind === 'coaching' ? 'INR' : 'USD')).toUpperCase();
  const result = {
    currency, customerEmail: email, patientEmail: email,
    customerName: patient?.full_name || patient?.name || String(input.customerName || '').slice(0, 255),
    patientName: patient?.full_name || patient?.name || String(input.patientName || input.customerName || '').slice(0, 255),
    patientId: patient?.id || '', clinicId: patient?.clinic_id || patient?.org_id || '',
    source: patient ? 'patient_dashboard' : 'website', isBundle: false
  };
  if (kind === 'clinic_report') {
    const clinicType = clinic.clinic_type || 'lbl_partner';
    const query = await db.from('pricing_config').select('label,reports,price_inr,price_usd,is_active').eq('package_id', input.packageId).eq('clinic_type', clinicType).maybeSingle();
    if (query.error) throw query.error;
    let pack = query.data;
    if (pack) {
      if (!pack.is_active) fail('Report package is not active');
      pack = { name: pack.label, reports: pack.reports, INR: Number(pack.price_inr), USD: Number(pack.price_usd) };
    } else {
      pack = catalog.clinicReportFallbacks[clinicType]?.[input.packageId] || catalog.legacyClinicReports[input.packageId];
    }
    if (!pack || !Number.isInteger(Number(pack.reports)) || Number(pack.reports) <= 0) fail('Unknown report package');
    Object.assign(result, { packageId: input.packageId, packageName: pack.name, reports: Number(pack.reports), amount: pack[currency],
      clinicId: clinic.id, clinicType, customerEmail: clinic.email, customerName: clinic.name });
  } else if (kind === 'subscription') {
    const tier = String(input.tierId || input.metadata?.tier || '').toUpperCase();
    const base = catalog.subscriptionBaseUSD[tier];
    const currencyConfig = Object.values(catalog.currencyConfig).find(config => config.currency === currency);
    if (!base || !currencyConfig) fail('Unknown subscription tier or currency');
    result.tierId = tier; result.tierName = tier[0] + tier.slice(1).toLowerCase();
    result.price = Math.round(base * currencyConfig.multiplier);
    if (input.priceId) {
      const configuredPrice = env[`STRIPE_PRICE_${tier}`] || env[`VITE_STRIPE_PRICE_${tier}`];
      if (!configuredPrice || input.priceId !== configuredPrice) fail('This Stripe price is not configured for the selected tier');
      const price = await stripe.prices.retrieve(configuredPrice);
      if (!price.active || price.currency?.toUpperCase() !== currency || !Number.isFinite(price.unit_amount)) fail('Configured subscription price is unavailable');
      result.priceId = configuredPrice; result.price = price.unit_amount / 100;
    }
    result.amount = result.price;
  } else if (kind === 'frequency' || kind === 'meditation') {
    const pack = catalog[kind][input.packId];
    if (!pack || !Number.isFinite(pack[currency])) fail('Unknown pack or unsupported currency');
    result.packId = input.packId; result.packName = pack.name; result.amount = pack[currency];
  } else if (kind === 'assessment') {
    let id = input.assessmentId;
    // Backward compatibility for the public landing/school forms that sent a name only.
    if (!id) id = Object.keys(catalog.legacyAssessments).find(key => catalog.legacyAssessments[key].title === input.assessmentName);
    let assessment = catalog.legacyAssessments[id];
    if (assessment) {
      result.amount = assessment[currency];
    } else {
      if (!UUID.test(String(id || ''))) fail('Unknown assessment');
      const query = await db.from('neurosense_assessments').select('id,title,link,category,is_active,is_free,is_inquire,sale_price_usd,sale_price_aed,sale_price_inr').eq('id', id).maybeSingle();
      if (query.error) throw query.error;
      assessment = query.data;
      if (!assessment?.is_active || assessment.is_free || assessment.is_inquire) fail('Assessment is not available for paid checkout');
      result.amount = Number(assessment[`sale_price_${currency.toLowerCase()}`]);
    }
    if (String(assessment.category).toLowerCase() === 'bundle' && !assessment.link) {
      const children = await db.from('neurosense_assessments').select('link,category').eq('is_active', true);
      if (children.error) throw children.error;
      assessment = { ...assessment, link: children.data.filter(row => String(row.category || 'individual').toLowerCase() !== 'bundle').map(row => row.link).filter(Boolean).join(',') };
    }
    result.assessmentId = id; result.assessmentName = assessment.title; result.assessmentLink = assessment.link || '';
  } else if (kind === 'coaching') {
    if (!UUID.test(String(input.coachId || '')) || !['INR', 'USD'].includes(currency)) fail('Unknown coach or unsupported currency');
    const query = await db.from('coaches').select('id,name,email,price,calendly_url,is_active').eq('id', input.coachId).maybeSingle();
    if (query.error) throw query.error;
    const coach = query.data;
    if (!coach?.is_active) fail('Coach is not available for booking');
    // Preserve existing localized checkout: the same catalog numeric price is offered in INR or USD; no FX conversion is introduced here.
    result.price = Number(coach.price); result.amount = result.price;
    result.coachId = coach.id; result.coachName = coach.name; result.coachEmail = coach.email || '';
    result.calendlyUrl = coach.calendly_url || 'https://calendly.com/admin-bettroi/30min';
  } else fail('Unknown checkout product');

  if (!Number.isFinite(result.amount) || result.amount <= 0) fail('A paid catalog price is not configured for this currency');
  const shownAmount = input.amount ?? input.price;
  if (shownAmount !== undefined && (!Number.isFinite(Number(shownAmount)) || Math.round(Number(shownAmount) * 100) !== Math.round(result.amount * 100))) {
    fail('The product price has changed. Refresh the page before purchasing.');
  }
  return result;
}

module.exports = { resolveCheckout };
