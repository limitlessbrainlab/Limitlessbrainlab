function emptyToNull(value) {
  return value === '' || value === undefined || value === null ? null : value;
}

function toPrice(value, field) {
  value = emptyToNull(value);
  if (value === null) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error(`${field} must be a non-negative number`);
  return price;
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeCoursePayload(payload = {}) {
  let courseUrl;
  try {
    courseUrl = new URL(String(payload.course_url || '').trim());
  } catch (_) {
    throw new Error('course_url must be an HTTPS URL');
  }
  if (courseUrl.protocol !== 'https:') throw new Error('course_url must be an HTTPS URL');

  const currency = String(payload.currency || 'INR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('currency must be a 3-letter ISO code');

  const isFree = toBoolean(payload.is_free);
  const originalPrice = toPrice(payload.original_price, 'original_price');
  const salePrice = isFree ? null : toPrice(payload.sale_price, 'sale_price');
  if (!isFree && !(salePrice > 0)) throw new Error('paid courses require a positive sale_price');

  return {
    course_url: courseUrl.toString(),
    original_price: originalPrice,
    sale_price: salePrice,
    is_free: isFree,
    currency,
  };
}

async function applyBrainCoursePurchase(session, databaseClient) {
  if (!session || session.payment_status !== 'paid' || session.metadata?.type !== 'brain_course') {
    return { ok: false, status: 400, message: 'Session is not a paid brain course purchase' };
  }
  const patientId = session.metadata.patient_id;
  const courseId = session.metadata.course_id;
  if (!patientId || !courseId || !session.id) {
    return { ok: false, status: 400, message: 'Session is missing course purchase metadata' };
  }

  const purchase = {
    patient_id: patientId,
    course_id: courseId,
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent || null,
    amount_paid: (session.amount_total || 0) / 100,
    currency: session.currency?.toUpperCase() || null,
  };
  const { data: alreadyGranted, error: existingError } = await databaseClient
    .from('brain_course_purchases')
    .select('*')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (existingError) return { ok: false, status: 500, message: existingError.message || 'Could not read existing course access' };
  if (alreadyGranted) return { ok: true, purchase: alreadyGranted, alreadyApplied: true };

  const { data, error } = await databaseClient.from('brain_course_purchases').insert(purchase).select().single();
  if (!error) return { ok: true, purchase: data, alreadyApplied: false };
  if (error.code !== '23505') return { ok: false, status: 500, message: error.message || 'Could not grant course access' };

  const { data: existing, error: duplicateReadError } = await databaseClient
    .from('brain_course_purchases')
    .select('*')
    .eq('patient_id', patientId)
    .eq('course_id', courseId)
    .single();
  if (duplicateReadError) return { ok: false, status: 500, message: duplicateReadError.message || 'Could not read existing course access' };
  return { ok: true, purchase: existing, alreadyApplied: true };
}

module.exports = { normalizeCoursePayload, applyBrainCoursePurchase };
