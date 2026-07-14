// Environment-state helpers.
//
// Staging and production share ONE Supabase database, so a clinic/patient created on
// one environment is also visible to the other. To avoid cross-environment login
// confusion, we record where each account was created (`origin_url`) and restrict login
// to the matching environment. These helpers classify a URL into an environment and map
// an environment back to its canonical login URL.

// Hostnames that belong to each environment.
const PRODUCTION_HOSTS = [
  'limitlessbrainlab.com',
  'www.limitlessbrainlab.com',
  'limitlessbrainlab-production.vercel.app',
];
const STAGING_HOSTS = [
  'limitlessbrainlab-eight.vercel.app',
];

const CANONICAL_URL = {
  production: 'https://limitlessbrainlab.com',
  staging: 'https://limitlessbrainlab-eight.vercel.app',
  development: 'http://localhost:5173',
};

// The origin the current app is running on (e.g. "https://limitlessbrainlab.com").
// Guarded so it never throws in a non-browser context.
export const getOriginUrl = () => {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return '';
};

// Classify a URL (or origin) into an environment label.
// Unknown/empty hosts fail OPEN to 'production' so a missing/odd value never locks a
// user out — it just means they can log in on production.
export const resolveEnv = (url) => {
  if (!url) return 'production';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // `url` may already be a bare hostname
    host = String(url).toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'development';
  if (STAGING_HOSTS.includes(host)) return 'staging';
  if (PRODUCTION_HOSTS.includes(host)) return 'production';
  return 'production';
};

// Canonical login URL for an environment label (used for email links and the
// "please log in there" message).
export const canonicalUrlForEnv = (envOrUrl) => {
  const env = envOrUrl in CANONICAL_URL ? envOrUrl : resolveEnv(envOrUrl);
  return CANONICAL_URL[env] || CANONICAL_URL.production;
};

// True when two URLs/labels resolve to the same environment. A null/empty stored value
// means "created before environment tracking existed" → allowed everywhere (returns true).
export const sameEnv = (storedUrl, currentUrl) => {
  if (!storedUrl) return true;
  // Staging is a shared-DB test mirror of production: accept accounts created on ANY
  // environment so existing production clinics/patients can log in here. This only
  // relaxes staging — on production resolveEnv(currentUrl) === 'production', so the
  // cross-environment scoping stays fully enforced there.
  if (resolveEnv(currentUrl) === 'staging') return true;
  return resolveEnv(storedUrl) === resolveEnv(currentUrl);
};
