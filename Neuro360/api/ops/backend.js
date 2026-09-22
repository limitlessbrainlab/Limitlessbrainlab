import { createClient } from '@supabase/supabase-js';

const healthUrl = process.env.BACKEND_HEALTH_URL || 'https://limitlessbrainlab-backend.onrender.com/api/health';

const json = (res, status, body) => res.status(status).json(body);

async function requireSuperAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !key) return false;

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await supabase.auth.getUser(token);
  if (!authData?.user) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
  return profile?.role === 'super_admin';
}

async function backendHealth() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    return { healthy: response.ok, status: response.status };
  } catch (error) {
    return { healthy: false, status: null, error: error.name === 'TimeoutError' ? 'Timed out' : 'Unreachable' };
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { message: 'Method not allowed' });
  try {
    if (!await requireSuperAdmin(req)) return json(res, 401, { message: 'Super admin access is required' });

    if (req.method === 'GET') {
      const backend = await backendHealth();
      return json(res, 200, {
        backend,
        checkedAt: new Date().toISOString(),
        restartConfigured: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID),
      });
    }

    if (req.body?.action !== 'restart') return json(res, 400, { message: 'Unknown action' });
    if (!process.env.RENDER_API_KEY || !process.env.RENDER_SERVICE_ID) {
      return json(res, 503, { message: 'Restart control is not configured' });
    }

    const response = await fetch(`https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` },
    });
    if (!response.ok) return json(res, 502, { message: 'Restart request was rejected' });
    return json(res, 202, { message: 'The report service is restarting. Retry in two minutes.' });
  } catch (error) {
    console.error('Backend operations failed:', error.message);
    return json(res, 500, { message: 'Unable to check the report service' });
  }
}
