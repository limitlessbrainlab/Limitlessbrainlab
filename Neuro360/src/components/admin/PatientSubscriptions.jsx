import React, { useState, useEffect } from 'react';
import {
  Crown, Search, Filter, Download, RefreshCw, User, CreditCard,
  Calendar, CheckCircle, XCircle, Clock, AlertTriangle, Eye, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import useRealtimeRefetch from '../../hooks/useRealtimeRefetch';
import AdminPageSkeleton from './AdminPageSkeleton';

const TIER_COLORS = {
  free: 'bg-gray-100 text-gray-700 border-gray-200',
  basic: 'bg-blue-50 text-blue-700 border-blue-200',
  pro: 'bg-purple-50 text-purple-700 border-purple-200',
  premium: 'bg-amber-50 text-amber-700 border-amber-200'
};

const STATUS_COLORS = {
  active: 'bg-green-50 text-green-700 border-green-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  trial: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  'not subscribed': 'bg-gray-100 text-gray-600 border-gray-200'
};

const PAGE_SIZE = 10;

const PatientSubscriptions = () => {
  const [patients, setPatients] = useState([]);
  const [totalPatients, setTotalPatients] = useState(0);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, premium: 0, pro: 0, basic: 0, free: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientPayments, setPatientPayments] = useState([]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadData();
  }, [page, searchTerm, tierFilter, statusFilter]);

  const applyFilters = (query) => {
    const search = searchTerm.trim().replace(/[%(),]/g, '');
    if (search) query = query.or(`full_name.ilike.%${search}%,name.ilike.%${search}%,email.ilike.%${search}%`);
    if (tierFilter === 'free') query = query.or('subscription_tier.eq.free,subscription_tier.is.null');
    else if (tierFilter !== 'all') query = query.eq('subscription_tier', tierFilter);
    if (statusFilter === 'active') query = query.eq('subscription_status', 'active');
    else if (statusFilter === 'expired') query = query.eq('subscription_status', 'expired');
    else if (statusFilter !== 'all') query = query.eq('subscription_status', statusFilter);
    return query;
  };

  const loadStats = async () => {
    const countPatients = async (filter) => {
      let query = supabase.from('patients').select('id', { count: 'exact', head: true });
      if (filter) query = filter(query);
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    };

    try {
      const [total, active, premium, pro, basic, free] = await Promise.all([
        countPatients(),
        countPatients((query) => query.eq('subscription_status', 'active')),
        countPatients((query) => query.eq('subscription_tier', 'premium')),
        countPatients((query) => query.eq('subscription_tier', 'pro')),
        countPatients((query) => query.eq('subscription_tier', 'basic')),
        countPatients((query) => query.or('subscription_tier.eq.free,subscription_tier.is.null'))
      ]);
      setStats({ total, active, premium, pro, basic, free });
    } catch (err) {
      console.error('Error loading patient subscription counts:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch only the current page; the count drives the next/previous controls.
      const patientQuery = applyFilters(
        supabase
        .from('patients')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      );

      const [{ data: patientsData, error: patientsErr, count }, { data: clinicsData }] = await Promise.all([
        patientQuery,
        supabase.from('clinics').select('id, name')
      ]);

      if (patientsErr) throw patientsErr;

      const clinicMap = {};
      (clinicsData || []).forEach((c) => { clinicMap[c.id] = c.name; });

      const enriched = (patientsData || []).map((p) => ({
        ...p,
        displayName: p.full_name || p.name || 'Unknown',
        clinicName: clinicMap[p.clinic_id] || 'N/A',
        tier: (p.subscription_tier || 'free').toLowerCase(),
        status: p.subscription_status || 'not subscribed'
      }));

      setPatients(enriched);
      setTotalPatients(count || 0);
    } catch (err) {
      console.error('Error loading patient subscriptions:', err);
      toast.error('Failed to load patient subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeRefetch([{ table: 'patients' }], loadData);

  const viewPatientHistory = async (patient) => {
    setSelectedPatient(patient);
    setShowHistoryModal(true);
    setPatientPayments([]);

    const email = patient.email?.toLowerCase();
    if (!email) return;

    // Patient purchases are spread across several tables (the same ones the
    // Wallet reads). payment_history holds ONLY subscription events, so reading
    // it alone left this modal empty for patients who bought coaching /
    // assessments / frequencies / meditations. Fetch them all and merge.
    try {
      const [payHist, patientPays, assessments, freqs, meds] = await Promise.all([
        supabase.from('payment_history').select('*').eq('patient_email', email),
        supabase.from('patient_payments').select('*').eq('patient_email', email),
        supabase.from('assessment_purchases').select('*').eq('patient_email', email),
        supabase.from('frequency_purchases').select('*').eq('patient_email', email),
        supabase.from('meditation_purchases').select('*').eq('patient_email', email),
      ]);

      const rows = [];

      // Subscription events (already in the shape the modal expects)
      (payHist.data || []).forEach((p) => rows.push({ ...p, rowKey: `payHist-${p.id}` }));

      // Unified purchases table — coaching is written ONLY here
      (patientPays.data || []).forEach((p) => rows.push({
        rowKey: `patientPays-${p.id}`,
        id: p.id,
        payment_type: p.item_name || (p.type ? `${p.type} purchase` : 'Payment'),
        amount: p.amount,
        currency: p.currency,
        created_at: p.created_at,
        payment_provider: p.payment_provider,
        status: p.status,
        stripe_session_id: p.stripe_session_id,
      }));

      // Specific purchase tables
      (assessments.data || []).forEach((a) => rows.push({
        rowKey: `assessment-${a.id}`,
        id: a.id,
        payment_type: a.assessment_name || 'Brain Assessment',
        amount: a.amount_paid,
        currency: a.currency,
        created_at: a.purchased_at,
        status: 'completed',
        stripe_session_id: a.stripe_session_id,
      }));
      (freqs.data || []).forEach((f) => rows.push({
        rowKey: `frequency-${f.id}`,
        id: f.id,
        payment_type: (f.pack_id || 'Frequency Pack').replace(/_/g, ' '),
        amount: f.amount_paid,
        currency: f.currency,
        created_at: f.purchased_at,
        status: 'completed',
        stripe_session_id: f.stripe_session_id,
      }));
      (meds.data || []).forEach((m) => rows.push({
        rowKey: `meditation-${m.id}`,
        id: m.id,
        payment_type: (m.meditation_id || 'Meditation Pack').replace(/_/g, ' '),
        amount: m.amount_paid,
        currency: m.currency,
        created_at: m.purchased_at,
        status: 'completed',
        stripe_session_id: m.stripe_session_id,
      }));

      // De-dup rows written to more than one table (by Stripe session id);
      // rows without a session id are always kept.
      const seen = new Set();
      const merged = rows.filter((r) => {
        if (!r.stripe_session_id) return true;
        if (seen.has(r.stripe_session_id)) return false;
        seen.add(r.stripe_session_id);
        return true;
      });

      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setPatientPayments(merged);
    } catch (err) {
      console.error('Error loading patient payment history:', err);
      toast.error('Failed to load payment history');
    }
  };

  const exportCSV = () => {
    if (patients.length === 0) {
      toast.error('No data to export');
      return;
    }
    const rows = patients.map((p) => ({
      Name: p.displayName,
      Email: p.email || '',
      Tier: (p.tier || 'free').toUpperCase(),
      Status: p.status || 'unknown',
      Clinic: p.clinicName,
      'Dashboard Access': p.dashboard_access ? 'Yes' : 'No',
      'Last Updated': p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ''
    }));

    const header = Object.keys(rows[0]).join(',');
    const csv = [header, ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient-subscriptions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="w-6 h-6 text-amber-500" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Patient Subscriptions</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadStats(); loadData(); }} className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportCSV} className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'bg-gray-50 dark:bg-gray-800' },
          { label: 'Active', value: stats.active, color: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Premium', value: stats.premium, color: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Pro', value: stats.pro, color: 'bg-purple-50 dark:bg-purple-900/20' },
          { label: 'Basic', value: stats.basic, color: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Free', value: stats.free, color: 'bg-gray-50 dark:bg-gray-800' }
        ].map((s) => (
          <div key={s.label} className={`${s.color} rounded-lg p-3 text-center border dark:border-gray-700`}>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>
          <select
            value={tierFilter}
            onChange={(e) => { setTierFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Tiers</option>
            <option value="premium">Premium</option>
            <option value="pro">Pro</option>
            <option value="basic">Basic</option>
            <option value="free">Free</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="trial">Trial</option>
          </select>
        </div>
      </div>

      {/* Patient List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 overflow-hidden">
        {loading ? (
          <AdminPageSkeleton rows={5} />
        ) : patients.length === 0 ? (
          <div className="p-8 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No patients found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Clinic</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Tier</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Subscription</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Last login</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Updated</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">History</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {patients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{patient.displayName}</p>
                        <p className="text-xs text-gray-400">{patient.email || 'No email'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{patient.clinicName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${TIER_COLORS[patient.tier] || TIER_COLORS.free}`}>
                        {patient.tier || 'FREE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_COLORS[patient.status] || STATUS_COLORS.expired}`}>
                        {patient.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {patient.last_login_at ? new Date(patient.last_login_at).toLocaleString() : 'Never'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {patient.updated_at ? new Date(patient.updated_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => viewPatientHistory(patient)}
                        className="p-1.5 bg-[#323956] text-white rounded hover:bg-[#232D3C] transition-colors"
                        title="View payment history"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && patients.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 text-xs text-gray-500 dark:text-gray-400">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalPatients)} of {totalPatients} patients</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((current) => current - 1)}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span>Page {page + 1} of {Math.ceil(totalPatients / PAGE_SIZE)}</span>
              <button
                onClick={() => setPage((current) => current + 1)}
                disabled={(page + 1) * PAGE_SIZE >= totalPatients}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payment History Modal */}
      {showHistoryModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold dark:text-white">{selectedPatient.displayName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedPatient.email}</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Current Subscription */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/30 border-b dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Subscription</p>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold uppercase ${TIER_COLORS[selectedPatient.tier] || TIER_COLORS.free}`}>
                  {selectedPatient.tier || 'FREE'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_COLORS[selectedPatient.status] || STATUS_COLORS.expired}`}>
                  {selectedPatient.status}
                </span>
                {selectedPatient.dashboard_access && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Dashboard Active
                  </span>
                )}
              </div>
            </div>

            {/* Payment Timeline */}
            <div className="flex-1 overflow-y-auto p-5">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Payment History</h4>
              {patientPayments.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">No payment records found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {patientPayments.map((payment) => (
                    <div key={payment.rowKey || payment.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 border dark:border-gray-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {payment.payment_type === 'subscription' ? `${(payment.tier || 'Plan').toUpperCase()} Subscription` : payment.payment_type || 'Payment'}
                        </span>
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {payment.currency || 'USD'} {(payment.amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {payment.created_at ? new Date(payment.created_at).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {payment.payment_provider || 'Stripe'}
                        </span>
                        {payment.status && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                            payment.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {payment.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientSubscriptions;
