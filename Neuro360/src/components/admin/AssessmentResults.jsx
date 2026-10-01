import React, { useState, useEffect } from 'react';
import { RefreshCw, X, Eye, CheckCircle, Clock, CircleDashed } from 'lucide-react';
import AdminPageSkeleton from './AdminPageSkeleton';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';

// Admin view of assessment purchases and their completion state, including
// the patient's submitted answers (captured via the JotForm webhook).
const AssessmentResults = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null); // row whose answers are open

  const load = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('assessment_purchases')
        .select('id, patient_email, assessment_name, amount_paid, currency, purchased_at, link_opened_at, assessment_completed_at, submission_data')
        .order('purchased_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error('Error loading assessment results:', err);
      toast.error('Failed to load assessment results');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stateBadge = (r) => {
    if (r.assessment_completed_at) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" /> Completed</span>;
    }
    if (r.link_opened_at) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><Clock className="h-3 w-3" /> Opened</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600"><CircleDashed className="h-3 w-3" /> Not started</span>;
  };

  // A row's submission_data is either one submission (webhook / single-form
  // API capture) or a bundle: { submissions: [...] }. Normalize to an array.
  const submissionsOf = (data) => {
    if (!data) return [];
    if (Array.isArray(data.submissions)) return data.submissions;
    return [data];
  };

  // Score(s) captured from the submission (extractAssessmentScore on the
  // server); a bundle may have one per completed part.
  const scoreOf = (data) => submissionsOf(data).map((s) => s.score).filter(Boolean).join(' · ');

  const answerRows = (submission) => {
    if (!submission) return [];
    if (submission.pretty) {
      return String(submission.pretty).split(', ').map((pair) => {
        const idx = pair.indexOf(':');
        return idx > -1 ? [pair.slice(0, idx), pair.slice(idx + 1)] : [pair, ''];
      });
    }
    if (submission.answers && typeof submission.answers === 'object') {
      return Object.entries(submission.answers).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    }
    return [];
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Assessment Purchases & Results</h3>
          <p className="text-xs text-gray-500 mt-0.5">Completion is reported by the JotForm submission webhook; answers appear under "View".</p>
        </div>
        <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="p-4"><AdminPageSkeleton rows={4} /></div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-gray-500 text-sm">No assessment purchases yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Patient Email</th>
                <th className="px-4 py-3">Assessment</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Answers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.purchased_at ? new Date(r.purchased_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{r.patient_email}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.assessment_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.amount_paid != null ? `${r.currency || 'USD'} ${Number(r.amount_paid).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">{stateBadge(r)}</td>
                  <td className="px-4 py-3">
                    {r.submission_data ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewing(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#323956] text-white rounded-lg text-xs font-medium hover:bg-[#232D3C] transition-colors"
                        >
                          <Eye className="h-3 w-3" /> View
                        </button>
                        {scoreOf(r.submission_data) && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 whitespace-nowrap">
                            Score: {scoreOf(r.submission_data)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Answers modal */}
      {viewing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setViewing(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{viewing.assessment_name || 'Assessment'} — Answers</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewing.patient_email} · completed {viewing.assessment_completed_at ? new Date(viewing.assessment_completed_at).toLocaleString() : '—'}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-5">
              {submissionsOf(viewing.submission_data).map((sub, si) => {
                const rows = answerRows(sub);
                const multi = submissionsOf(viewing.submission_data).length > 1;
                return (
                  <div key={si}>
                    {multi && (
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Assessment {si + 1}{sub.submitted_at ? ` · ${new Date(sub.submitted_at).toLocaleString()}` : ''}
                      </p>
                    )}
                    {sub.score && (
                      <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                        Score: <span className="text-purple-700 dark:text-purple-300">{sub.score}</span>
                      </p>
                    )}
                    {rows.length ? (
                      <table className="w-full text-sm">
                        <tbody>
                          {rows.map(([q, a], i) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                              <td className="px-3 py-2 text-gray-500 align-top w-1/2">{q}</td>
                              <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{a}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{JSON.stringify(sub, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentResults;
