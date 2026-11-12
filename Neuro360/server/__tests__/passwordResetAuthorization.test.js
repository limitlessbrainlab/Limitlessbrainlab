const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
function fixture() {
  const otpStore = new Map([['owner@example.test', { otp: '123456', attempts: 0, expiresAt: Date.now() + 60000 }]]);
  let handler, writes = 0;
  const query = { select() { return this; }, eq() { return this; }, limit() { return this; }, update() { writes++; return this; }, then(resolve) { return Promise.resolve({ data: [{ id: 'clinic' }] }).then(resolve); } };
  vm.runInNewContext(source.slice(source.indexOf("app.post('/api/reset-password'"), source.indexOf('// =====================================================\n// SESSION VALIDITY')), {
    app: { post(_url, fn) { handler = fn; } }, otpStore, console, Buffer,
    bcrypt: { hash: async () => 'hashed' }, supabase: { from: () => query }
  });
  const request = async otp => {
    let status = 200, body;
    const res = { status(s) { status = s; return res; }, json(b) { body = b; } };
    await handler({ body: { email: 'owner@example.test', otp, newPassword: 'new-password' } }, res);
    return { status, body };
  };
  return { request, writes: () => writes, otpStore };
}
test('reset endpoint counts guesses itself and rejects the correct code after exhaustion', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) assert.equal((await f.request('000000')).status, 400);
  assert.equal((await f.request('123456')).status, 400); assert.equal(f.writes(), 0);
});
test('one OTP cannot authorize concurrent password resets', async () => {
  const f = fixture(); const responses = await Promise.all([f.request('123456'), f.request('123456')]);
  assert.equal(responses.filter(x => x.body.success).length, 1); assert.equal(f.writes(), 1); assert.equal(f.otpStore.size, 0);
});
