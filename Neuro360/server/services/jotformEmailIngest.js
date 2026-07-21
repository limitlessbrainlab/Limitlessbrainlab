/**
 * JotForm notification-email ingest — captures assessment answers WITHOUT a
 * JotForm API key or webhook. JotForm emails each submission's full Q&A to its
 * notification recipients; when info@limitlessbrainlab.com is a recipient
 * (form Settings → Emails → Notification), this service reads those emails
 * over IMAP (same EMAIL_USER/EMAIL_PASS Gmail app password the SMTP sender
 * uses) and records the answers via assessmentRecorder, exactly like the
 * /api/jotform-webhook path would.
 *
 * Runs as a poller inside the API server (single Render instance). Messages
 * are marked \Seen once processed; the dedupe key in assessmentRecorder makes
 * reprocessing harmless anyway.
 */

const { recordAssessmentSubmission } = require('./assessmentRecorder');

const IMAP_HOST = process.env.JOTFORM_INGEST_IMAP_HOST || 'imap.gmail.com';
const POLL_MS = Number(process.env.JOTFORM_INGEST_POLL_MS || 5 * 60 * 1000);
const DISABLED = process.env.JOTFORM_INGEST_DISABLED === '1';

// --- Notification email parsing -------------------------------------------

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Parse a JotForm notification email into the webhook-equivalent payload.
 * Default JotForm notifications render the Q&A as an HTML table with one row
 * per question (question cell + answer cell). Returns null when the message
 * doesn't look like a submission notification.
 */
function parseNotificationEmail({ html, text, date, messageId }) {
  const body = String(html || '');
  const plain = String(text || '');

  // Submission id comes ONLY from the "Edit Submission" link — the per-form
  // "submissions/<formID>" link would dedupe every submission of a form as
  // one. Without an edit link, a hash of the email's Message-ID still gives a
  // unique, stable dedupe key.
  const idSource = body + ' ' + plain;
  let submissionID = (idSource.match(/\/edit\/(\d{8,})/) || [])[1] || '';
  if (!submissionID && messageId) {
    submissionID = 'email-' + require('crypto').createHash('sha1').update(String(messageId)).digest('hex').slice(0, 16);
  }
  const formID = (idSource.match(/jotform\.com\/(?:form\/)?(\d{8,})(?!\d)/) || [])[1] || '';

  const answers = {};
  const prettyParts = [];

  // Q&A table rows: any <tr> whose cells reduce to [question, answer(s)].
  const rows = body.split(/<tr[\s>]/i).slice(1);
  for (const row of rows) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let m;
    while ((m = cellRe.exec(row)) !== null) cells.push(stripTags(m[1]));
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const q = nonEmpty[0];
    const a = nonEmpty.slice(1).join(' ').trim();
    if (!q || !a || q.length > 200) continue;
    if (/view submission|edit submission|unsubscribe/i.test(q)) continue;
    answers[q] = a;
    prettyParts.push(`${q}:${a}`);
  }

  // Fallback for text-only notifications: "Question\nAnswer" or "Question: Answer" lines.
  if (!prettyParts.length && plain) {
    for (const line of plain.split(/\r?\n/)) {
      const mm = line.match(/^\s*([^:]{2,120}):\s*(.+)\s*$/);
      if (!mm) continue;
      const q = mm[1].trim();
      const a = mm[2].trim();
      if (/^https?:/i.test(a) || /unsubscribe|jotform/i.test(q)) continue;
      answers[q] = a;
      prettyParts.push(`${q}:${a}`);
    }
  }

  if (!submissionID || !prettyParts.length) return null;
  return {
    formID,
    submissionID,
    pretty: prettyParts.join(', '),
    answers,
    source: 'jotform-notification-email',
    submittedAt: date ? new Date(date).toISOString() : new Date().toISOString()
  };
}

// --- IMAP plumbing ----------------------------------------------------------

async function withImap(fn) {
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    logger: false
  });
  // ImapFlow is an EventEmitter: an 'error' event with NO listener (e.g. a socket
  // timeout when the IMAP port is blocked, as on Render's free tier) is thrown by
  // Node and CRASHES the whole API server — it fires asynchronously from the
  // socket, so the try/catch around connect()/the poll cannot catch it. Attach a
  // listener so such failures are logged and swallowed instead of taking the
  // process (and any in-flight report generation) down. The awaited connect()
  // below still rejects normally on failure, handled by the caller's try/catch.
  client.on('error', (err) => {
    console.error('jotformEmailIngest: IMAP client error (ignored):', err?.message || err);
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Process JotForm notification emails in one mailbox.
 * opts: { mailbox='INBOX', all=false (unseen only), dryRun=false, markSeen=true }
 * Returns a summary array of { uid, subject, status, email }.
 */
async function processMailboxOnce(opts = {}) {
  const { mailbox = 'INBOX', all = false, dryRun = false, markSeen = !dryRun } = opts;
  const { simpleParser } = require('mailparser');
  return withImap(async (client) => {
    const results = [];
    const lock = await client.getMailboxLock(mailbox, { readOnly: !markSeen });
    try {
      const query = all ? { from: 'jotform' } : { from: 'jotform', seen: false };
      const uids = await client.search(query, { uid: true });
      if (!uids || !uids.length) return results;

      for (const uid of uids) {
        let status = 'parse-failed';
        let parsed = null;
        let subject = '';
        try {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          const mail = await simpleParser(msg.source);
          subject = mail.subject || '';
          parsed = parseNotificationEmail({ html: mail.html, text: mail.text, date: mail.date, messageId: mail.messageId });
          if (parsed) {
            const rec = await recordAssessmentSubmission({ ...parsed, dryRun });
            status = rec.status;
            results.push({ uid, subject, status, email: rec.submitterEmail || null, parsed });
          } else {
            results.push({ uid, subject, status, email: null });
          }
        } catch (e) {
          console.error(`jotformEmailIngest: uid ${uid} failed:`, e.message);
          results.push({ uid, subject, status: 'error', email: null });
          continue; // leave unseen so the next poll retries
        }
        if (markSeen && status !== 'error') {
          await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
    return results;
  });
}

let timer = null;
function startJotformEmailIngest() {
  if (DISABLED) { console.log('jotformEmailIngest: disabled via JOTFORM_INGEST_DISABLED'); return; }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('jotformEmailIngest: EMAIL_USER/EMAIL_PASS not set — not starting');
    return;
  }
  if (timer) return;
  const tick = async () => {
    try {
      const results = await processMailboxOnce({});
      const recorded = results.filter(r => r.status === 'recorded').length;
      if (results.length) {
        console.log(`jotformEmailIngest: processed ${results.length} email(s), recorded ${recorded}`);
      }
    } catch (e) {
      console.error('jotformEmailIngest poll failed:', e.message);
    }
  };
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  setTimeout(tick, 15 * 1000).unref?.(); // first pass shortly after boot
  console.log(`jotformEmailIngest: polling ${IMAP_HOST} as ${process.env.EMAIL_USER} every ${Math.round(POLL_MS / 1000)}s`);
}

module.exports = { startJotformEmailIngest, processMailboxOnce, parseNotificationEmail };
