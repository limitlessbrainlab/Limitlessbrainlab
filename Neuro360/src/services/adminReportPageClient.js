import { supabase } from '../lib/supabaseClient';

export const REPORT_PAGE_STALE_TIME = 30_000;
const PERSISTED_REPORT_PAGE_PREFIX = 'admin_report_page_v1:';
const PERSISTED_REPORT_PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const adminReportPageQueryKey = (userId, params) => [
  'admin-report-page', userId || 'anonymous', params.toString()
];

const persistedReportPageKey = (userId, params) => `${PERSISTED_REPORT_PAGE_PREFIX}${userId}:${params}`;

export const readPersistedAdminReportPage = (userId, params) => {
  if (!userId) return null;
  try {
    const key = persistedReportPageKey(userId, params);
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (!cached?.data || Date.now() - cached.savedAt > PERSISTED_REPORT_PAGE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return cached;
  } catch (error) {
    return null;
  }
};

export const persistAdminReportPage = (userId, params, data) => {
  if (!userId) return;
  try {
    localStorage.setItem(persistedReportPageKey(userId, params), JSON.stringify({ savedAt: Date.now(), data }));
  } catch (error) {
    // Storage can be disabled or full; fresh network data remains usable.
  }
};

export const fetchAdminReportPage = async (params, accessToken) => {
  const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
  const baseUrl = apiUrl.replace(/\/api\/?$/, '');
  const response = await fetch(`${baseUrl}/api/admin/reports/page?${params}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Could not load reports');
  return result;
};

export const prefetchDefaultAdminReportPage = async (queryClient, userId) => {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ page: '1', pageSize: '15', sort: 'desc' });
  return queryClient.prefetchQuery({
    queryKey: adminReportPageQueryKey(userId, params),
    staleTime: REPORT_PAGE_STALE_TIME,
    queryFn: () => fetchAdminReportPage(params, session?.access_token)
  });
};
