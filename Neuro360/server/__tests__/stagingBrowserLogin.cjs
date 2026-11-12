const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

module.exports = async function checkBrowserLogin({ t, config, apiUrl, clinic, patient, admin, password }) {
  assert.equal(config.url, 'https://ukmggjcvjvjodksopngs.supabase.co');
  const root = path.resolve(__dirname, '../..');
  const vite = spawn(process.execPath, ['--input-type=module', '-e', "import {createServer} from 'vite'; const server = await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true,open:false}}); await server.listen();"], {
    cwd: root, env: { ...process.env, VITE_SUPABASE_URL: config.url, VITE_SUPABASE_ANON_KEY: config.anon,
      VITE_API_URL: apiUrl, VITE_DISABLE_AUTH: 'false', VITE_DEV_AUTH_BYPASS: 'false' }, stdio: 'ignore'
  });
  t.after(() => vite.kill());
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { ready = (await fetch('http://127.0.0.1:5199')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Local staging frontend must start');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const [role, account, route] of [['clinic_admin', clinic, 'clinic'], ['patient', patient, 'patient'], ['super_admin', admin, 'admin']]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Keep this login check isolated: no production API, emails, AI, or payments.
    await page.route('**/*', r => {
      const url = new URL(r.request().url());
      if (['127.0.0.1', 'localhost', 'ukmggjcvjvjodksopngs.supabase.co'].includes(url.hostname)) return r.continue();
      return r.abort();
    });
    await page.goto(`http://127.0.0.1:5199/${route}/login`);
    await page.locator('input[type=email]').fill(account.email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('input[type=password]').press('Enter');
    await page.waitForFunction(role => JSON.parse(localStorage.getItem('user') || 'null')?.role === role, role, { timeout: 45000 });
    const stored = await page.evaluate(() => ({ user: JSON.parse(localStorage.getItem('user')), token: localStorage.getItem('authToken') }));
    assert.equal(stored.user.id, account.id); assert.equal(stored.token.split('.').length, 3);
    await page.reload();
    await page.waitForFunction(role => JSON.parse(localStorage.getItem('user') || 'null')?.role === role, role, { timeout: 20000 });
    assert.equal(await page.locator('input[type=password]').count(), 0, 'Reload must preserve dashboard access');
    await context.close();
  }
};
