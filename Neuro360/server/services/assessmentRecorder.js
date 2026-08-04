/**
 * Assessment submission recorder — single home for matching a JotForm
 * submission to an assessment_purchases row and storing its answers, shared by
 * the /api/jotform-webhook route, the email-notification ingest service and
 * the email backfill script. Matching is EMAIL-FIRST: a submission must never
 * complete another patient's purchase; a form-id-only match is accepted only
 * when exactly one open row exists for that form.
 */

const { createRoutedClient } = require('../dbRouter');

// Routed per-request (prod vs staging by origin); plain prod client otherwise.
const supabase = createRoutedClient();

// Best-effort score pickup for the admin Assessment Results view: the first
// answered field whose question/key mentions score/result/total/points —
// JotForm calculation widgets ("Your Score") land here. Returns null when the
// form simply has no such field.
function extractAssessmentScore(answers) {
  if (!answers || typeof answers !== 'object') return null;
  const isScoreKey = (s) => /score|result|total|points/i.test(String(s || ''));
  for (const [key, val] of Object.entries(answers)) {
    // JotForm-API map ({ "Your Score": "42" }) and webhook rawRequest
    // ({ q12_yourScore: "42" } or { text, answer } objects) both pass here.
    const nested = (val && typeof val === 'object') ? val : null;
    const label = nested?.text ? String(nested.text) : key;
    if (!isScoreKey(label)) continue;
    const raw = nested ? (nested.answer ?? Object.values(nested).filter(v => typeof v !== 'object').join(' ')) : val;
    const value = String(raw ?? '').trim();
    if (value) return value;
  }
  return null;
}

// Same dedupe backing as claimNotificationOnce in server/index.js — the
// sent_notifications table (unique dedupe_key) makes the claim atomic across
// the webhook, the email ingest and any backfill run. Fail-open on DB errors.
async function claimSubmissionOnce(key) {
  if (!key || !supabase) return true;
  try {
    const { error } = await supabase.from('sent_notifications').insert({ dedupe_key: key });
    if (!error) return true;
    if (error.code === '23505') return false; // duplicate -> already recorded
    console.warn('assessmentRecorder claim error (proceeding anyway):', error.message);
    return true;
  } catch (e) {
    console.warn('assessmentRecorder claim exception (proceeding anyway):', e.message);
    return true;
  }
}

// The submitter's email is whatever answer value looks like an email address,
// skipping our own / JotForm addresses that can appear in footers or links.
function extractSubmitterEmail(answers, pretty) {
  const text = JSON.stringify(answers || {}) + ' ' + String(pretty || '');
  const all = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  const own = /jotform|limitlessbrainlab|noreply|no-reply/i;
  return all.find(e => !own.test(e)) || null;
}

/**
 * Match + record one submission. Returns
 *   { status: 'recorded'|'duplicate'|'no-match'|'skipped'|'error',
 *     purchase, submitterEmail, score }
 * dryRun skips the dedupe claim and the DB write but reports the would-be match.
 */
async function recordAssessmentSubmission({ formID, submissionID, pretty, answers, source, submittedAt, dryRun }) {
  if (!supabase) return { status: 'skipped', reason: 'supabase not configured' };
  formID = String(formID || '').trim();
  submissionID = String(submissionID || '').trim();
  pretty = String(pretty || '');
  if (!submissionID) return { status: 'skipped', reason: 'no submissionID' };

  if (!dryRun && !(await claimSubmissionOnce(`jotform:${submissionID}`))) {
    return { status: 'duplicate', submitterEmail: extractSubmitterEmail(answers, pretty) };
  }

  const submitterEmail = extractSubmitterEmail(answers, pretty);

  let candidates = [];
  if (formID) {
    const { data } = await supabase.from('assessment_purchases')
      .select('id, patient_email, assessment_name, assessment_completed_at, submission_data')
      .ilike('assessment_link', `%${formID}%`)
      .order('created_at', { ascending: false })
      .limit(25);
    candidates = data || [];
  }

  let purchase = null;
  if (submitterEmail) {
    const em = submitterEmail.toLowerCase();
    const mine = candidates.filter(c => c.patient_email === em);
    purchase = mine.find(c => !c.assessment_completed_at) || mine[0] || null;
    if (!purchase) {
      // Stored links may use a named JotForm alias while the submission carries
      // the numeric form id — match the submitter's newest open purchase instead.
      const { data: byEmail } = await supabase.from('assessment_purchases')
        .select('id, patient_email, assessment_name, assessment_completed_at, submission_data')
        .eq('patient_email', em)
        .is('assessment_completed_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      purchase = byEmail?.[0] || null;
      if (!purchase) {
        // Backfill case: the purchase may already be marked completed (e.g. by
        // the link-complete signal) but still have no answers stored.
        const { data: closedNoData } = await supabase.from('assessment_purchases')
          .select('id, patient_email, assessment_name, assessment_completed_at, submission_data')
          .eq('patient_email', em)
          .is('submission_data', null)
          .order('created_at', { ascending: false })
          .limit(1);
        purchase = closedNoData?.[0] || null;
      }
    }
  } else if (formID) {
    const open = candidates.filter(c => !c.assessment_completed_at);
    if (open.length === 1) purchase = open[0];
  }

  if (!purchase) {
    console.warn(`assessmentRecorder: submission ${submissionID} (form ${formID || 'unknown'}, ${submitterEmail || 'no email'}) matched no purchase`);
    return { status: 'no-match', submitterEmail };
  }

  const score = extractAssessmentScore(answers);
  if (dryRun) return { status: 'recorded', purchase, submitterEmail, score, dryRun: true };

  const { error } = await supabase.from('assessment_purchases')
    .update({
      assessment_completed_at: purchase.assessment_completed_at || new Date().toISOString(),
      submission_data: {
        ...(formID ? { formID } : {}),
        submissionID,
        pretty,
        answers,
        ...(score ? { score } : {}),
        ...(source ? { source } : {}),
        submitted_at: submittedAt || new Date().toISOString()
      }
    })
    .eq('id', purchase.id);
  if (error) {
    console.error(`assessmentRecorder: submission_data update failed for purchase ${purchase.id}:`, error.message);
    return { status: 'error', purchase, submitterEmail, score };
  }
  console.log(`SUCCESS: JotForm submission ${submissionID} matched purchase ${purchase.id} (${purchase.patient_email})${source ? ` via ${source}` : ''}`);
  return { status: 'recorded', purchase, submitterEmail, score };
}

module.exports = { recordAssessmentSubmission, extractAssessmentScore, extractSubmitterEmail };
