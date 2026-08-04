/**
 * Per-request Supabase client selection (prod vs staging).
 *
 * One backend (limitlessbrainlab-backend) serves both the prod frontend
 * (limitlessbrainlab.vercel.app) and the staging frontend
 * (limitlessbrainlab-eight.vercel.app). Each request must reach the DB that
 * matches its origin: staging-origin requests → staging DB, everything else →
 * prod DB. Selection is concurrency-safe via AsyncLocalStorage (never a mutated
 * global), so concurrent requests never cross wires.
 *
 * SAFETY: when STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY are not
 * set, createRoutedClient() returns the PLAIN prod client (no Proxy) — production
 * behavior is bit-for-bit unchanged. The routed Proxy only activates once the
 * staging env vars are configured on the host.
 */

const { AsyncLocalStorage } = require('async_hooks');
const { createClient } = require('@supabase/supabase-js');

const PROD_URL = process.env.SUPABASE_URL;
const PROD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STAGING_URL = process.env.STAGING_SUPABASE_URL;
const STAGING_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const STAGING_ORIGIN = (process.env.STAGING_ORIGIN || 'https://limitlessbrainlab-eight.vercel.app').replace(/\/$/, '');

const stagingEnabled = !!(STAGING_URL && STAGING_KEY);

// Real clients, created once at startup.
const prodClient = (PROD_URL && PROD_KEY) ? createClient(PROD_URL, PROD_KEY) : null;
const stagingClient = stagingEnabled ? createClient(STAGING_URL, STAGING_KEY) : null;

// Per-request async context: { staging: true } when the request is staging-origin.
const store = new AsyncLocalStorage();

function activeClient() {
  const ctx = store.getStore();
  if (ctx && ctx.staging && stagingClient) return stagingClient;
  return prodClient;
}

// Proxy that delegates every property access to the active client for the
// current async context. Functions are bound to the chosen client so method
// `this` is correct (e.g. `supabase.from('x').select(...)`).
function makeRoutedProxy() {
  return new Proxy({}, {
    get(_target, prop) {
      const client = activeClient();
      const value = client ? client[prop] : undefined;
      return typeof value === 'function' ? value.bind(client) : value;
    }
  });
}

/**
 * Returns a Supabase client to use. When staging is not configured this is the
 * plain prod client (no Proxy). When configured it is a routed Proxy that
 * resolves to prod or staging per request via the AsyncLocalStorage store.
 */
function createRoutedClient() {
  if (!stagingEnabled) return prodClient;
  return makeRoutedProxy();
}

/**
 * Express middleware. If the request originated from the staging frontend
 * (Origin or Referer header matches STAGING_ORIGIN), scope the whole request
 * (including downstream async work) to the staging DB. Otherwise it runs in the
 * default prod context.
 */
function stagingOriginMiddleware(req, res, next) {
  if (!stagingEnabled) return next();
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin === STAGING_ORIGIN || referer.startsWith(STAGING_ORIGIN + '/')) {
    return store.run({ staging: true }, next);
  }
  return next();
}

module.exports = {
  createRoutedClient,
  stagingOriginMiddleware,
  store,
  activeClient,
  stagingEnabled
};
