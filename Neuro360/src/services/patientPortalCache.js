const PREFIX = 'patient_portal_v1:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const keyFor = (userId) => `${PREFIX}${userId}`;
const sensitiveKeys = new Set(['password', 'plain_password', 'plainPassword', 'access_token', 'authToken']);

const withoutSecrets = (value) => {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveKeys.has(key))
    .map(([key, nested]) => [key, withoutSecrets(nested)]));
};

export const readPatientPortalCache = (userId) => {
  if (!userId) return null;
  try {
    const entry = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    if (!entry?.data || Date.now() - entry.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(userId));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
};

export const writePatientPortalCache = (userId, data) => {
  if (!userId) return;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ savedAt: Date.now(), data: withoutSecrets(data) }));
  } catch {
    // A full or unavailable browser store must not block live patient data.
  }
};
