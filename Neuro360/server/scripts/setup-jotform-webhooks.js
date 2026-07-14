// One-time, idempotent: register the answer-capture webhook on every JotForm
// form used by assessment packages, so submissions reach
// POST /api/jotform-webhook even when the buyer closes the tab before the
// embedded form reports completion.
//
// Usage: JOTFORM_API_KEY=... node scripts/setup-jotform-webhooks.js
// (or put JOTFORM_API_KEY in server/.env)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || '';
const WEBHOOK_URL = process.env.JOTFORM_WEBHOOK_URL || 'https://limitlessbrainlab-eight.vercel.app/api/jotform-webhook';

// Every numeric form id referenced by neurosense_assessments.link,
// PatientDashboard.jsx and the legacy Landing.jsx default.
const FORM_IDS = [
  '252245065792056', // Neuro Age Estimator
  '260117244562148', // Brain (Neuro) Burnout Score
  '260034749079159', // Neuro Performance / Dementia Probability Index
  '261594031348457', // Brain (Neuro) Fitness Score Advanced
  '233250136675151', // Brain Fitness Score
  '232184893262057', // Brain Fitness Score™ (legacy landing default)
];

async function main() {
  if (!JOTFORM_API_KEY) {
    console.error('JOTFORM_API_KEY is not set — aborting.');
    process.exit(1);
  }
  for (const formId of FORM_IDS) {
    const base = `https://api.jotform.com/form/${formId}/webhooks?apiKey=${encodeURIComponent(JOTFORM_API_KEY)}`;
    try {
      const listResp = await fetch(base);
      const list = await listResp.json();
      if (listResp.status !== 200 || list?.responseCode !== 200) {
        console.error(`form ${formId}: cannot list webhooks (${list?.message || listResp.status})`);
        continue;
      }
      const existing = Object.values(list.content || {});
      if (existing.includes(WEBHOOK_URL)) {
        console.log(`form ${formId}: webhook already registered`);
        continue;
      }
      const addResp = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `webhookURL=${encodeURIComponent(WEBHOOK_URL)}`
      });
      const add = await addResp.json();
      if (add?.responseCode === 200) console.log(`form ${formId}: webhook ADDED`);
      else console.error(`form ${formId}: webhook add failed — ${add?.message || addResp.status}`);
    } catch (e) {
      console.error(`form ${formId}: ${e.message}`);
    }
  }
}

main();
