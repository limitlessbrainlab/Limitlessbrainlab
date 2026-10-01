export async function shareReport(reportData, { getToken, fetchImpl = fetch } = {}) {
  const token = await getToken?.();
  const response = await fetchImpl('/api/share-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(reportData),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Could not save report (${response.status})`);
  return payload.report;
}
