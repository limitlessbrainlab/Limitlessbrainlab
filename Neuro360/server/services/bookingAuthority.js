const { requirePatientEmailAccess } = require('../utils/patientEmailAccess');
const { UUID } = require('../utils/patientAccess');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
async function createAuthorizedBooking(user, input, db, stripe) {
  const email = await requirePatientEmailAccess(user, input.patient_email, db);
  let coachId = input.coach_id;
  let sessionId = null;
  let creditId = null;
  if (user.role !== 'super_admin') {
    if (input.stripe_session_id) {
      const session = await stripe.checkout.sessions.retrieve(input.stripe_session_id);
      if (session.payment_status !== 'paid' || session.metadata?.type !== 'coaching_session' ||
          (session.customer_email || session.customer_details?.email || '').trim().toLowerCase() !== email) fail('A verified coaching purchase is required',403);
      sessionId = session.id;
      coachId = session.metadata.coach_id;
    } else {
      creditId = input.credit_id;
      if (!UUID.test(String(creditId || ''))) fail('An available coaching credit or verified purchase is required',403);
    }
  }
  if (!UUID.test(String(coachId || ''))) fail('A valid coach is required');
  const { data: coach, error } = await db.from('coaches').select('id,name,email,is_active').eq('id',coachId).maybeSingle();
  if (error) throw error;
  if (!coach || (!sessionId && !coach.is_active)) fail('Coach is unavailable');
  const start = new Date(input.start_time); const end = new Date(input.end_time);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) fail('Valid booking start and end times are required');
  const booking = {
    patient_email: email, patient_name: String(input.patient_name || '').slice(0,255),
    coach_id: coach.id, coach_name: coach.name, coach_email: coach.email,
    event_name: 'Brain Coaching Session - 30 min', start_time:start.toISOString(),end_time:end.toISOString(),
    duration_minutes:30,status:'scheduled',location:'Online',
    notes: creditId ? 'Booked using free credit — session link to be shared by admin' : 'Booked via payment — session link to be shared by admin'
  };
  const { data, error: writeError } = await db.rpc('create_authorized_coach_booking', {
    p_actor_id:user.id,p_patient_email:email,p_booking:booking,p_credit_id:creditId,p_stripe_session_id:sessionId
  });
  if (writeError) throw writeError;
  return data;
}
module.exports={createAuthorizedBooking};
