const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

function loadRoutes(isAdmin) {
  const routes = new Map();
  const filters = [];
  let mailCount = 0;
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    limit: async () => ({ data: isAdmin ? [{ id: 'verified-user' }] : [] }),
  };
  const authMiddleware = () => {};
  const context = {
    app: { post: (url, ...handlers) => routes.set(url, handlers) },
    authMiddleware,
    supabase: { from: () => query },
    emailTransporter: { sendMail: async () => { mailCount++; } },
    EMAIL_FROM: 'sender@example.test', INTERNAL_COPY_EMAIL: 'internal@example.test',
    escapeHtml: text => text, getLogoAttachment: () => [], console,
  };
  const helper = source.slice(source.indexOf('const callerIsSuperAdmin ='), source.indexOf('// Resolve a clinic'));
  const route = source.slice(source.indexOf('// 6. PARTNER EMAIL UPDATE'), source.indexOf('// 7. PARTNER REJECTION'));
  vm.runInNewContext(helper + route, context);
  return { handlers: routes.get('/api/send-partner-email-update'), authMiddleware, filters, mailCount: () => mailCount };
}

test('partner credential email requires authentication before its handler', () => {
  const fixture = loadRoutes(false);
  assert.equal(fixture.handlers[0], fixture.authMiddleware);
});

test('a non-admin cannot send a credential email', async () => {
  const fixture = loadRoutes(false);
  let status;
  const res = { status(code) { status = code; return this; }, json() {} };
  await fixture.handlers.at(-1)({ user: { id: 'verified-user', email: 'admin@example.test' },
    body: { partnerName: 'Clinic', newEmail: 'clinic@example.test', oldEmail: 'attacker@example.test', password: 'test-only' } }, res);
  assert.equal(status, 403);
  assert.equal(fixture.mailCount(), 0);
  assert.deepEqual(fixture.filters, [['id', 'verified-user'], ['role', 'super_admin']]);
});

test('verified admin retains the email-update notification', async () => {
  const fixture = loadRoutes(true);
  let result;
  const res = { status() { return this; }, json(value) { result = value; } };
  await fixture.handlers.at(-1)({ user: { id: 'verified-user', email: 'admin@example.test' },
    body: { partnerName: 'Clinic', newEmail: 'clinic@example.test', oldEmail: 'previous@example.test', password: 'test-only' } }, res);
  assert.equal(result.success, true);
  assert.equal(fixture.mailCount(), 1);
});
