import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Wrench } from 'lucide-react';
import SupabaseService from '../../services/supabaseService';

const getToken = async () => {
  const { data } = await SupabaseService.supabase.auth.getSession();
  return data?.session?.access_token || localStorage.getItem('authToken');
};

export default function SystemHealth({ compact = false }) {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('Checking report service…');
  const [working, setWorking] = useState(false);
  const autoRestarted = useRef(false);

  const check = useCallback(async () => {
    setWorking(true);
    try {
      const response = await fetch('/api/ops/backend', { headers: { Authorization: `Bearer ${await getToken()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setStatus(data);
      setMessage(data.backend.healthy ? 'All report systems are working.' : 'Report service is temporarily unavailable.');
    } catch (error) {
      setStatus(null);
      setMessage('Unable to check the report service right now.');
    } finally {
      setWorking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [check]);

  const restart = useCallback(async (automatic = false) => {
    if (!automatic && !window.confirm('Restore the report service? Reports may be unavailable for about two minutes.')) return;
    setWorking(true);
    try {
      const response = await fetch('/api/ops/backend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ action: 'restart' }),
      });
      const data = await response.json();
      setMessage(response.ok && automatic ? 'The report service is restarting. Please retry in two minutes.' : data.message);
      if (response.ok) setTimeout(check, 120000);
    } catch { setMessage('Restart could not be requested.'); }
    finally {
      setWorking(false);
    }
  }, [check]);

  useEffect(() => {
    if (status?.backend?.healthy) autoRestarted.current = false;
    else if (status?.restartConfigured && !autoRestarted.current) {
      autoRestarted.current = true;
      restart(true);
    }
  }, [restart, status]);

  const healthy = status?.backend?.healthy;
  if (compact) {
    const color = healthy ? 'bg-green-400' : status ? 'bg-red-500' : 'bg-amber-400';
    const label = healthy ? 'Report service is working' : status ? 'Report service needs attention' : 'Checking report service';
    return <div className="flex items-center gap-2">
      <button onClick={check} disabled={working} title={label} aria-label={label} className="relative flex h-5 w-5 items-center justify-center disabled:opacity-50">
        <span className={`absolute inline-flex h-4 w-4 rounded-full ${color} opacity-75 animate-ping`} />
        <span className={`relative inline-flex h-3 w-3 rounded-full ${color} ring-2 ring-white`} />
      </button>
      {!healthy && status?.restartConfigured && <button onClick={() => restart()} disabled={working} className="rounded bg-white/15 px-2 py-1 text-xs font-medium text-white hover:bg-white/25 disabled:opacity-50"><Wrench className="mr-1 inline h-3 w-3" />Restore service</button>}
    </div>;
  }
  return <div className="max-w-3xl space-y-5">
    <div className={`rounded-xl border p-6 ${healthy ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex gap-4">
        <Activity className={healthy ? 'text-green-600' : 'text-amber-600'} />
        <div><h2 className="text-lg font-semibold">System Status</h2><p className="mt-1 text-gray-700">{message}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={check} disabled={working} className="rounded-lg bg-white px-4 py-2 text-sm font-medium shadow border disabled:opacity-50"><RefreshCw className="mr-2 inline h-4 w-4" />Check again</button>
        {!healthy && status?.restartConfigured && <button onClick={() => restart()} disabled={working} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Wrench className="mr-2 inline h-4 w-4" />Restart report service</button>}
      </div>
    </div>
    <details className="rounded-xl border bg-white p-5">
      <summary className="cursor-pointer font-medium">Technical details for future support</summary>
      <dl className="mt-4 grid gap-2 text-sm text-gray-600">
        <div><dt className="font-medium text-gray-800">Backend check</dt><dd>{status?.backend?.healthy ? 'Healthy' : status?.backend?.error || 'Not available'}</dd></div>
        <div><dt className="font-medium text-gray-800">HTTP status</dt><dd>{status?.backend?.status ?? 'No response'}</dd></div>
        <div><dt className="font-medium text-gray-800">Checked at</dt><dd>{status?.checkedAt || 'Not available'}</dd></div>
        <div><dt className="font-medium text-gray-800">Restart control</dt><dd>{status?.restartConfigured ? 'Configured' : 'Needs RENDER_API_KEY and RENDER_SERVICE_ID in Vercel staging settings'}</dd></div>
      </dl>
    </details>
  </div>;
}
