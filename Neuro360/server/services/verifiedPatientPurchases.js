// Called only with a Checkout Session retrieved from Stripe (or a verified webhook).
async function applyVerifiedPatientPurchase(session, db) {
  const metadata = session?.metadata || {};
  const rawType = metadata.type || (metadata.pack_id?.startsWith('solfeggio_') || metadata.pack_id?.includes('meditation') ? 'meditation' : 'frequency');
  if (!['assessment', 'frequency', 'meditation', 'coaching_session'].includes(rawType)) return null;
  const email = (session.customer_email || session.customer_details?.email || '').trim().toLowerCase();
  if (session.payment_status !== 'paid' || !session.id || !email || !Number.isFinite(session.amount_total)) {
    throw new Error('A verified paid session with buyer details is required');
  }
  const type = rawType === 'coaching_session' ? 'coaching' : rawType;
  const itemId = type === 'assessment' ? metadata.assessment_id : type === 'coaching' ? metadata.coach_id || metadata.coach_name : metadata.pack_id;
  if (!itemId) throw new Error('Purchase item metadata is missing');
  const amount = session.amount_total / 100;
  const currency = (session.currency || 'USD').toUpperCase();
  const now = new Date().toISOString();

  async function insertOnce(table, row, keys) {
    const lookup = () => {
      let query = db.from(table).select('id');
      for (const [key, value] of Object.entries(keys)) query = query.eq(key, value);
      return query.limit(1);
    };
    const { data: existing, error: readError } = await lookup();
    if (readError) throw readError;
    if (existing?.length) return;
    // shortcut: existing tables without unique session keys use check-then-insert; add unique keys to serialize concurrent webhook/return writes.
    const { error } = await db.from(table).insert(row);
    if (error) {
      if (error.code !== '23505') throw error;
      const retry = await lookup();
      if (retry.error || !retry.data?.length) throw retry.error || error;
    }
  }

  let itemName = metadata.assessment_name || metadata.pack_name || metadata.pack_id?.replace(/_/g, ' ') || 'Purchase';
  if (type === 'assessment') {
    const purchase = {
      patient_email: email, assessment_id: itemId, assessment_name: itemName,
      assessment_link: metadata.assessment_link || '', stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent || null, amount_paid: amount, currency,
      status: 'completed', purchased_at: now
    };
    await insertOnce('assessment_purchases', purchase, { stripe_session_id: session.id });
    const { data: catalog, error } = await db.from('neurosense_assessments').select('id,title,link,category').eq('is_active', true);
    if (error) throw error;
    let children = [];
    if (itemId === 'neurosense-bundle' || catalog?.some(row => row.id === itemId && String(row.category).toLowerCase() === 'bundle')) {
      children = catalog.filter(row => String(row.category || 'individual').toLowerCase() !== 'bundle');
    } else if (itemId === 'assessment_bundle') {
      children = [
        { id: 'brain_fitness', title: 'Brain Fitness Score', link: 'https://form.jotform.com/233250136675151' },
        { id: 'brain_burnout', title: 'Brain Burnout Score', link: 'https://form.jotform.com/260117244562148' },
        { id: 'brain_age', title: 'Neuro Age Estimator', link: 'https://form.jotform.com/252245065792056' },
        { id: 'dementia_index', title: 'Dementia Probability Index', link: 'https://form.jotform.com/260034749079159' }
      ];
    }
    for (const child of children) {
      const childSessionId = `${session.id}_${child.id}`;
      await insertOnce('assessment_purchases', { ...purchase, assessment_id: child.id, assessment_name: child.title,
        assessment_link: child.link || '', stripe_session_id: childSessionId, amount_paid: 0
      }, { stripe_session_id: childSessionId });
    }
  } else if (type === 'meditation') {
    await insertOnce('meditation_purchases', { patient_email: email, meditation_id: itemId, purchased_at: now }, { patient_email: email, meditation_id: itemId });
  } else if (type === 'frequency') {
    await insertOnce('frequency_purchases', { patient_email: email, frequency_id: itemId, pack_id: itemId, purchased_at: now }, { patient_email: email, pack_id: itemId });
  } else {
    itemName = `Brain Coaching - ${metadata.coach_name || 'Session'}`;
  }

  // Resolve the business patient row; an Auth UID from older checkout metadata is not a patient ID.
  let patient = null;
  if (metadata.patient_id) {
    const result = await db.from('patients').select('id,clinic_id,org_id,full_name,name').eq('id', metadata.patient_id).eq('email', email).limit(1);
    if (result.error) throw result.error;
    patient = result.data?.[0];
  }
  if (!patient) {
    const result = await db.from('patients').select('id,clinic_id,org_id,full_name,name').eq('email', email).order('created_at', { ascending: false }).limit(1);
    if (result.error) throw result.error;
    patient = result.data?.[0];
  }
  await insertOnce('patient_payments', {
    clinic_id: patient?.clinic_id || patient?.org_id || null, patient_id: patient?.id || null,
    patient_email: email, patient_name: patient?.full_name || patient?.name || metadata.customer_name || metadata.patient_name || '',
    amount, currency, status: 'completed', type, item_name: itemName, assessment_id: itemId,
    assessment_link: type === 'assessment' ? metadata.assessment_link || '' : null,
    stripe_session_id: session.id, stripe_payment_intent: session.payment_intent || null,
    source: { assessment: 'About the Brain', frequency: 'Frequencies', meditation: 'Meditations', coaching: 'Brain Coach' }[type], created_at: now
  }, { stripe_session_id: session.id });
  return { type, itemId, itemName, amount, currency, email };
}

module.exports = { applyVerifiedPatientPurchase };
