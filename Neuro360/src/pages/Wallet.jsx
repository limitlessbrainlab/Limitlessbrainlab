import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import toast, { Toaster } from 'react-hot-toast';
import {
  Wallet as WalletIcon,
  CreditCard,
  ChevronLeft,
  Plus,
  Trash2,
  Check,
  X,
  Download,
  Filter,
  Calendar,
  Search,
  ChevronDown,
  Clock,
  Pause,
  Play,
  Settings,
  FileText,
  Music,
  Video,
  Users,
  Monitor,
  Ticket,
  Package,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Receipt,
  Eye,
  Mail,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Gift,
  Star,
  Shield
} from 'lucide-react';

const formatDateOnly = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const titleCaseStatus = (status, fallback = 'Paid') => {
  if (!status) return fallback;
  const normalized = String(status).toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const normalizePurchaseStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'completed', 'complete', 'succeeded', 'success', 'active'].includes(normalized)) return 'Paid';
  if (['failed', 'refunded', 'pending'].includes(normalized)) return titleCaseStatus(normalized);
  return titleCaseStatus(status);
};

const normalizeSubscriptionStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'completed', 'complete', 'paid', 'succeeded', 'success'].includes(normalized)) return 'Active';
  if (['paused', 'cancelled', 'canceled', 'pending'].includes(normalized)) return titleCaseStatus(normalized);
  return titleCaseStatus(status, 'Active');
};

const categoryFromType = (type) => ({
  coaching: 'Session',
  coach: 'Session',
  subscription: 'Subscription',
  frequency: 'Frequencies',
  meditation: 'Meditation',
  assessment: 'Assessment',
  credit: 'Credits',
  refund: 'Refund'
}[String(type || '').toLowerCase()] || 'Session');

const parseExpiry = (expiry) => {
  const [month, year] = String(expiry || '').split('/');
  return {
    exp_month: Number(month) || null,
    exp_year: Number(year?.length === 2 ? `20${year}` : year) || null
  };
};

const Wallet = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [patientEmail, setPatientEmail] = useState('');
  const [patientName, setPatientName] = useState('');

  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [upiIds, setUpiIds] = useState([]);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddUPI, setShowAddUPI] = useState(false);

  // New card form state
  const [newCard, setNewCard] = useState({ number: '', expiry: '', cvv: '', name: '', isDefault: false });
  const [newUPI, setNewUPI] = useState({ upi: '', isDefault: false });

  // Purchase History Filters
  const [dateRange, setDateRange] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Wallet Balance
  const [walletBalance, setWalletBalance] = useState({
    totalSpent: 0,
    thisMonth: 0,
    lastMonth: 0,
    credits: 0,
    pendingRefunds: 0,
    activeSubscriptions: 0
  });

  // Purchase History
  const [purchases, setPurchases] = useState([]);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState([]);

  // Session Packs
  const [sessionPacks, setSessionPacks] = useState([]);

  // Invoices
  const [invoices, setInvoices] = useState([]);

  // Percent change in spend vs last month (computed dynamically)
  const [spendChange, setSpendChange] = useState(0);

  // Map a card row from the DB into the shape the UI expects
  const mapCardRow = (m) => ({
    id: m.id,
    type: m.card_type || m.brand || m.type,
    last4: m.last_four || m.last4,
    exp: m.expiry || (m.exp_month && m.exp_year ? `${String(m.exp_month).padStart(2, '0')}/${String(m.exp_year).slice(-2)}` : '-'),
    name: m.cardholder_name || 'Saved card',
    isDefault: m.is_default
  });

  const mapWalletTransaction = (t) => {
    const invoiceSource = t.invoice_id || t.reference_id || t.stripe_payment_intent || t.id;
    const type = t.type || t.category;
    return {
      id: t.id,
      date: t.transaction_date || t.created_at,
      item: t.item_name || t.description || (type ? `${titleCaseStatus(type, 'Wallet')} transaction` : 'Wallet transaction'),
      category: t.category || categoryFromType(type),
      partner: t.partner || 'Limitless Brain Lab',
      status: normalizePurchaseStatus(t.status),
      amount: Math.abs(Number(t.amount) || 0),
      invoiceId: invoiceSource ? String(invoiceSource).slice(-8).toUpperCase() : null
    };
  };

  // Fetch wallet data
  const fetchWalletData = useCallback(async (email) => {
    try {
      setLoading(true);

      // Fetch payment methods
      const { data: methods } = await supabase
        .from('wallet_payment_methods')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });

      setPaymentMethods((methods || []).filter(m => m.method_type === 'card').map(mapCardRow));
      setUpiIds((methods || []).filter(m => m.method_type === 'upi').map(u => ({
        id: u.id,
        upi: u.upi_id,
        isDefault: u.is_default
      })));

      // Fetch purchases from all real purchase tables
      let allPurchases = [];

      // 1. wallet_transactions (if any)
      const { data: trans } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });
      if (trans && trans.length > 0) {
        allPurchases.push(...trans.map(mapWalletTransaction));
      }

      // 2. assessment_purchases
      const { data: assessments } = await supabase
        .from('assessment_purchases')
        .select('*')
        .eq('patient_email', email)
        .order('purchased_at', { ascending: false });
      if (assessments && assessments.length > 0) {
        allPurchases.push(...assessments.map(a => ({
          id: a.id, date: a.purchased_at, item: a.assessment_name || 'Brain Assessment',
          category: 'Assessment', partner: 'Limitless Brain Lab', status: 'Paid',
          amount: a.amount_paid, sessionId: a.stripe_session_id,
          invoiceId: a.stripe_session_id?.slice(-8)?.toUpperCase()
        })));
      }

      // 3. frequency_purchases
      const { data: freqs } = await supabase
        .from('frequency_purchases')
        .select('*')
        .eq('patient_email', email)
        .order('purchased_at', { ascending: false });
      if (freqs && freqs.length > 0) {
        allPurchases.push(...freqs.map(f => ({
          id: f.id, date: f.purchased_at, item: (f.pack_id || 'Frequency Pack').replace(/_/g, ' '),
          category: 'Frequencies', partner: 'Limitless Brain Lab', status: 'Paid',
          amount: f.amount_paid, sessionId: f.stripe_session_id,
          invoiceId: f.stripe_session_id?.slice(-8)?.toUpperCase()
        })));
      }

      // 4. meditation_purchases
      const { data: meds } = await supabase
        .from('meditation_purchases')
        .select('*')
        .eq('patient_email', email)
        .order('purchased_at', { ascending: false });
      if (meds && meds.length > 0) {
        allPurchases.push(...meds.map(m => ({
          id: m.id, date: m.purchased_at, item: (m.meditation_id || 'Meditation Pack').replace(/_/g, ' '),
          category: 'Meditation', partner: 'Limitless Brain Lab', status: 'Paid',
          amount: m.amount_paid, sessionId: m.stripe_session_id,
          invoiceId: m.stripe_session_id?.slice(-8)?.toUpperCase()
        })));
      }

      // 5. payment_history (subscriptions)
      const { data: payHist } = await supabase
        .from('payment_history')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });
      if (payHist && payHist.length > 0) {
        allPurchases.push(...payHist.map(p => ({
          id: p.id, date: p.created_at, item: `${p.tier || 'Subscription'} Plan`,
          category: 'Subscription', partner: 'Limitless Brain Lab', status: 'Paid',
          amount: p.amount, sessionId: p.stripe_session_id,
          invoiceId: p.stripe_session_id?.slice(-8)?.toUpperCase()
        })));
      }

      // 6. patient_payments — the unified table EVERY patient purchase writes to
      // (coaching, frequency, meditation, assessment). Coaching is written ONLY
      // here, so without this read it never appears in the Wallet. Pushed last so
      // the more specific *_purchases rows win during de-dup below.
      const patientPaymentCategory = (type) => ({
        coaching: 'Session', frequency: 'Frequencies',
        meditation: 'Meditation', assessment: 'Assessment'
      }[type] || 'Session');
      const { data: patientPays } = await supabase
        .from('patient_payments')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });
      if (patientPays && patientPays.length > 0) {
        allPurchases.push(...patientPays.map(p => ({
          id: p.id, date: p.created_at,
          item: p.item_name || (p.type ? `${p.type} purchase` : 'Purchase'),
          category: patientPaymentCategory(p.type),
          partner: 'Limitless Brain Lab',
          status: (p.status === 'completed' || p.status === 'active') ? 'Paid' : (p.status || 'Paid'),
          amount: p.amount, sessionId: p.stripe_session_id,
          invoiceId: p.stripe_session_id?.slice(-8)?.toUpperCase()
        })));
      }

      // De-dup across tables by Stripe session id — frequency/meditation purchases
      // are written to BOTH their *_purchases table and patient_payments, so they
      // would otherwise appear twice. Rows without a session id are always kept.
      const seenSessions = new Set();
      allPurchases = allPurchases.filter(p => {
        if (!p.sessionId) return true;
        if (seenSessions.has(p.sessionId)) return false;
        seenSessions.add(p.sessionId);
        return true;
      });

      // Sort by date and set (real data only — empty if nothing purchased)
      allPurchases.sort((a, b) => new Date(b.date) - new Date(a.date));
      setPurchases(allPurchases);

      // Fetch subscriptions — prefer admin-managed wallet_subscriptions,
      // otherwise derive from the patient's real subscription payments.
      const { data: subs } = await supabase
        .from('wallet_subscriptions')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });

      const iconMap = { 'star': Star, 'music': Music, 'video': Video, 'users': Users };
      let subscriptionsForUi;
      if (subs && subs.length > 0) {
        subscriptionsForUi = subs.map(s => ({
          id: s.id,
          name: s.name || s.plan_name || 'Subscription',
          plan: s.plan || s.plan_name || 'Plan',
          renewal: formatDateOnly(s.renewal_date || s.current_period_end) || '-',
          status: normalizeSubscriptionStatus(s.status),
          amount: Number(s.amount) || 0,
          period: s.period || 'mo',
          icon: iconMap[s.icon] || Star
        }));
      } else {
        // Derive one entry per distinct subscription tier (latest payment wins)
        const subPayments = (payHist || []).filter(p => p.payment_type === 'subscription' || p.tier);
        const byTier = {};
        subPayments.forEach(p => {
          const key = p.tier || 'Subscription';
          if (!byTier[key] || new Date(p.created_at) > new Date(byTier[key].created_at)) {
            byTier[key] = p;
          }
        });
        subscriptionsForUi = Object.entries(byTier).map(([tier, p]) => ({
          id: p.id,
          name: `${tier} Plan`,
          plan: 'Subscription',
          renewal: '-',
          status: normalizeSubscriptionStatus(p.status),
          amount: Number(p.amount) || 0,
          period: 'mo',
          icon: Star
        }));
      }
      setSubscriptions(subscriptionsForUi);

      // Fetch session packs/credits
      const { data: packs } = await supabase
        .from('wallet_credits')
        .select('*')
        .eq('patient_email', email);

      setSessionPacks((packs || []).map(p => {
        const remaining = p.used_at ? 0 : Number(p.remaining ?? p.amount ?? 0);
        const total = Number(p.total ?? p.amount ?? remaining);
        return {
          id: p.id,
          name: p.name || p.description || 'Wallet Credits',
          remaining,
          total,
          expiry: formatDateOnly(p.expiry_date || p.expires_at) || '-',
          type: p.credit_type || 'rupees'
        };
      }));

      // Fetch invoices
      const { data: invs } = await supabase
        .from('wallet_invoices')
        .select('*')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });

      if (invs && invs.length > 0) {
        setInvoices(invs.map(i => ({
          id: i.invoice_number || i.stripe_invoice_id || `INV-${String(i.id).slice(-6).toUpperCase()}`,
          date: formatDateOnly(i.invoice_date || i.created_at || i.paid_at || i.due_date),
          description: i.description || 'Wallet invoice',
          amount: Number(i.amount) || 0,
          status: normalizePurchaseStatus(i.status),
          dueDate: formatDateOnly(i.due_date)
        })));
      } else {
        // Derive invoices from the patient's real purchases
        setInvoices(allPurchases.map((p) => ({
          id: p.invoiceId || `INV-${String(p.id).slice(-6).toUpperCase()}`,
          date: p.date ? new Date(p.date).toISOString().slice(0, 10) : '',
          description: p.item,
          amount: Number(p.amount) || 0,
          status: p.status === 'Paid' ? 'Paid' : p.status,
          dueDate: p.date ? new Date(p.date).toISOString().slice(0, 10) : ''
        })));
      }

      // Calculate wallet balance from REAL purchases only
      const paidPurchases = allPurchases.filter(p => p.status === 'Paid');
      const totalSpent = paidPurchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const thisMonthSpent = paidPurchases
        .filter(p => new Date(p.date) >= thisMonthStart)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const lastMonthSpent = paidPurchases
        .filter(p => {
          const d = new Date(p.date);
          return d >= lastMonthStart && d < thisMonthStart;
        })
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const activeSubs = subscriptionsForUi.filter(s => s.status === 'Active').length;
      const creditsBalance = (packs || []).reduce((sum, p) => (
        sum + (p.used_at ? 0 : Number(p.remaining ?? p.amount ?? 0))
      ), 0);

      // Month-over-month spend change (%) — only when there is a prior baseline
      setSpendChange(lastMonthSpent > 0
        ? Math.round(((thisMonthSpent - lastMonthSpent) / lastMonthSpent) * 100)
        : 0);

      setWalletBalance({
        totalSpent,
        thisMonth: thisMonthSpent,
        lastMonth: lastMonthSpent,
        credits: creditsBalance,
        pendingRefunds: 0,
        activeSubscriptions: activeSubs
      });

    } catch (error) {
      console.error('Error fetching wallet data:', error);
      // On error show empty wallet rather than fake data
      setPaymentMethods([]);
      setUpiIds([]);
      setPurchases([]);
      setSubscriptions([]);
      setSessionPacks([]);
      setInvoices([]);
      setSpendChange(0);
      setWalletBalance({
        totalSpent: 0,
        thisMonth: 0,
        lastMonth: 0,
        credits: 0,
        pendingRefunds: 0,
        activeSubscriptions: 0
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    // Identity comes from the auth context (same source every other patient page
    // uses), with a fallback to the persisted localStorage 'user' object. The old
    // 'patientEmail' localStorage key is NEVER set anywhere, so reading it left the
    // wallet permanently empty. Purchases are written with email.toLowerCase(), so
    // normalize here too or the patient_email filters return zero rows.
    let authUser = user;
    if (!authUser?.email) {
      try { authUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch { authUser = null; }
    }
    const rawEmail = authUser?.email
      || localStorage.getItem('patientEmail') || sessionStorage.getItem('patientEmail');
    const email = rawEmail ? rawEmail.toLowerCase() : rawEmail;
    const name = authUser?.name || authUser?.full_name
      || localStorage.getItem('patientName') || sessionStorage.getItem('patientName');
    if (email) {
      setPatientEmail(email);
      setPatientName(name || '');
      fetchWalletData(email);
    } else {
      // Not logged in — show empty wallet, no fake data
      setLoading(false);
    }
  }, [user, fetchWalletData]);

  // Add payment card
  const handleAddCard = async () => {
    if (!newCard.number || !newCard.expiry || !newCard.name) {
      toast.error('Please fill all card details');
      return;
    }

    const last4 = newCard.number.replace(/\s/g, '').slice(-4);
    const cardType = newCard.number.startsWith('4') ? 'visa' :
                     newCard.number.startsWith('5') ? 'mastercard' : 'rupay';
    const expiryParts = parseExpiry(newCard.expiry);

    if (!patientEmail) {
      toast.error('Please log in to add a payment method');
      return;
    }

    const cardData = {
      patient_email: patientEmail,
      method_type: 'card',
      card_type: cardType,
      type: cardType,
      brand: cardType,
      last_four: last4,
      last4,
      expiry: newCard.expiry,
      ...expiryParts,
      cardholder_name: newCard.name,
      is_default: newCard.isDefault
    };

    try {
      const { error } = await supabase
        .from('wallet_payment_methods')
        .insert([cardData]);

      if (error) throw error;

      setShowAddCard(false);
      setNewCard({ number: '', expiry: '', cvv: '', name: '', isDefault: false });
      toast.success('Card added successfully!');
      // Reload from DB so the list reflects the persisted record
      fetchWalletData(patientEmail);
    } catch (error) {
      console.error('Error adding card:', error);
      toast.error('Could not save card. Please try again.');
    }
  };

  // Add UPI
  const handleAddUPI = async () => {
    if (!newUPI.upi) {
      toast.error('Please enter UPI ID');
      return;
    }

    if (!patientEmail) {
      toast.error('Please log in to add a UPI ID');
      return;
    }

    try {
      const { error } = await supabase
        .from('wallet_payment_methods')
        .insert([{
          patient_email: patientEmail,
          method_type: 'upi',
          type: 'upi',
          upi_id: newUPI.upi,
          is_default: newUPI.isDefault
        }]);

      if (error) throw error;

      setShowAddUPI(false);
      setNewUPI({ upi: '', isDefault: false });
      toast.success('UPI ID added successfully!');
      // Reload from DB so the list reflects the persisted record
      fetchWalletData(patientEmail);
    } catch (error) {
      console.error('Error adding UPI:', error);
      toast.error('Could not save UPI ID. Please try again.');
    }
  };

  // Remove UPI
  const handleRemoveUPI = async (id) => {
    try {
      await supabase.from('wallet_payment_methods').delete().eq('id', id);
      setUpiIds(prev => prev.filter(u => u.id !== id));
      toast.success('UPI ID removed');
    } catch (error) {
      setUpiIds(prev => prev.filter(u => u.id !== id));
      toast.success('UPI ID removed');
    }
  };

  // Toggle subscription status
  const handleToggleSubscription = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    try {
      await supabase
        .from('wallet_subscriptions')
        .update({ status: newStatus })
        .eq('id', id);

      setSubscriptions(prev => prev.map(s =>
        s.id === id ? { ...s, status: newStatus } : s
      ));
      toast.success(`Subscription ${newStatus === 'Active' ? 'resumed' : 'paused'}`);
    } catch (error) {
      setSubscriptions(prev => prev.map(s =>
        s.id === id ? { ...s, status: newStatus } : s
      ));
      toast.success(`Subscription ${newStatus === 'Active' ? 'resumed' : 'paused'}`);
    }
  };

  // Cancel subscription
  const handleCancelSubscription = async (id) => {
    try {
      await supabase
        .from('wallet_subscriptions')
        .update({ status: 'Cancelled' })
        .eq('id', id);

      setSubscriptions(prev => prev.filter(s => s.id !== id));
      setWalletBalance(prev => ({
        ...prev,
        activeSubscriptions: prev.activeSubscriptions - 1
      }));
      toast.success('Subscription cancelled');
    } catch (error) {
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      toast.success('Subscription cancelled');
    }
  };

  // Build a printable, self-contained HTML invoice/receipt from an invoice-like record
  const buildInvoiceHtml = (inv) => {
    const amount = Number(inv.amount) || 0;
    const issued = inv.date ? new Date(inv.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 40px; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 700; color: #2563eb; }
  .muted { color: #6b7280; font-size: 13px; }
  h1 { font-size: 18px; margin: 24px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
  th { background: #f9fafb; text-transform: uppercase; font-size: 11px; color: #6b7280; }
  .right { text-align: right; }
  .total { font-size: 18px; font-weight: 700; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #dcfce7; color: #15803d; }
  .foot { margin-top: 32px; color: #6b7280; font-size: 12px; text-align: center; }
  @media print { body { padding: 0; } }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div><div class="brand">Neuro360</div><div class="muted">Brain Health & Wellness</div></div>
    <div class="right"><div style="font-weight:700">INVOICE</div><div class="muted">${esc(inv.id)}</div><div class="muted">${esc(issued)}</div></div>
  </div>
  <h1>Billed To</h1>
  <div class="muted">${esc(patientName || 'Patient')}<br>${esc(patientEmail || '')}</div>
  <table>
    <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
    <tbody>
      <tr><td>${esc(inv.description || 'Purchase')}</td><td class="right">USD ${amount.toFixed(2)}</td></tr>
    </tbody>
    <tfoot>
      <tr><td class="right total">Total</td><td class="right total">USD ${amount.toFixed(2)}</td></tr>
      <tr><td class="right">Status</td><td class="right"><span class="badge">${esc(inv.status || 'Paid')}</span></td></tr>
    </tfoot>
  </table>
  <div class="foot">Thank you for choosing Neuro360. This is a computer-generated invoice.</div>
</div></body></html>`;
  };

  // View invoice — open the rendered invoice in a new tab/window (printable)
  const handleViewInvoice = (inv) => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups to view the invoice'); return; }
    w.document.write(buildInvoiceHtml(inv));
    w.document.close();
  };

  // Download invoice — save the rendered invoice as a real file
  const handleDownloadInvoice = (inv) => {
    try {
      const blob = new Blob([buildInvoiceHtml(inv)], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${inv.id}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Invoice ${inv.id} downloaded`);
    } catch (e) {
      console.error('Invoice download failed:', e);
      toast.error('Could not download the invoice');
    }
  };

  // Email invoice — render server-side and send via the backend mailer
  const handleEmailInvoice = async (inv) => {
    if (!patientEmail) { toast.error('Please log in to email your invoice'); return; }
    const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
    const t = toast.loading(`Emailing invoice ${inv.id}...`);
    try {
      const res = await fetch(`${API_URL}/wallet/invoice-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: patientEmail,
          name: patientName || '',
          invoice: { id: inv.id, date: inv.date, description: inv.description, amount: Number(inv.amount) || 0, status: inv.status || 'Paid' }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Invoice ${inv.id} sent to ${patientEmail}`, { id: t });
    } catch (e) {
      console.error('Invoice email failed:', e);
      toast.error('Could not email the invoice. Please try again.', { id: t });
    }
  };

  // Use session pack
  const handleUseSessionPack = (packId, packName) => {
    setSessionPacks(prev => prev.map(p =>
      p.id === packId ? { ...p, remaining: Math.max(0, p.remaining - 1) } : p
    ));
    toast.success(`Using ${packName} - redirecting to booking...`);
    // Navigate to relevant booking page
  };

  // Categories
  const categories = ['Report', 'Course', 'Frequencies', 'Session', 'Device rental', 'Event'];
  const partners = ['Limitless Brain Lab', 'Dr. Shweta', 'Neuro360', 'Dr. Roland', 'Neurobics'];

  // Get category icon
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Report': return FileText;
      case 'Course': return Video;
      case 'Frequencies': return Music;
      case 'Session': return Users;
      case 'Device rental': return Monitor;
      case 'Event': return Ticket;
      default: return Package;
    }
  };

  // Filter purchases
  const filteredPurchases = purchases.filter(p => {
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (partnerFilter !== 'all' && p.partner !== partnerFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  // Set default payment method
  const setDefaultMethod = async (id) => {
    try {
      // Update all to non-default first
      await supabase
        .from('wallet_payment_methods')
        .update({ is_default: false })
        .eq('patient_email', patientEmail);

      // Set selected as default
      await supabase
        .from('wallet_payment_methods')
        .update({ is_default: true })
        .eq('id', id);

      setPaymentMethods(prev => prev.map(m => ({
        ...m,
        isDefault: m.id === id
      })));
      toast.success('Default payment method updated');
    } catch (error) {
      setPaymentMethods(prev => prev.map(m => ({
        ...m,
        isDefault: m.id === id
      })));
      toast.success('Default payment method updated');
    }
  };

  // Remove payment method
  const removeMethod = async (id) => {
    try {
      await supabase
        .from('wallet_payment_methods')
        .delete()
        .eq('id', id);

      setPaymentMethods(prev => prev.filter(m => m.id !== id));
      toast.success('Payment method removed');
    } catch (error) {
      setPaymentMethods(prev => prev.filter(m => m.id !== id));
      toast.success('Payment method removed');
    }
  };

  // Tabs
  const tabs = [
    { id: 'overview', label: 'Overview', icon: WalletIcon },
    { id: 'payments', label: 'Payment Methods', icon: CreditCard },
    { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw },
    { id: 'credits', label: 'Credits', icon: Ticket },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'history', label: 'Purchase History', icon: Clock }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#323956] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Toaster position="top-center" />
      {/* Header */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <button
            onClick={() => navigate('/dashboard/welcome')}
            className="flex items-center space-x-2 text-blue-200 hover:text-white mb-3 sm:mb-4 transition-colors text-sm sm:text-base"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-2.5 sm:space-x-4">
              <div className="bg-white/20 rounded-lg sm:rounded-xl p-2 sm:p-3 flex-shrink-0">
                <WalletIcon className="h-5 w-5 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl md:text-3xl font-bold">Wallet</h1>
                <p className="text-blue-200 mt-0.5 sm:mt-1 text-[11px] sm:text-sm md:text-base leading-relaxed">
                  Track purchases, subscriptions, credits, and invoices in one place.
                </p>
              </div>
            </div>

            {/* Quick Stats in Header */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-3">
                <p className="text-[10px] sm:text-xs text-blue-200">Credits Balance</p>
                <p className="text-lg sm:text-xl font-bold flex items-center">
                  <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5" />
                  {walletBalance.credits}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-3 hidden sm:block">
                <p className="text-[10px] sm:text-xs text-blue-200">Active Subscriptions</p>
                <p className="text-lg sm:text-xl font-bold">{walletBalance.activeSubscriptions}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex overflow-x-auto scrollbar-hide -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-3 sm:py-4 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#323956] text-[#323956] dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Wallet Balance Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Total Spent</span>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">USD {walletBalance.totalSpent.toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">All time</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                  </div>
                  {spendChange !== 0 && (
                    <span className={`flex items-center text-[10px] sm:text-xs ${spendChange < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {spendChange < 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {Math.abs(spendChange)}%
                    </span>
                  )}
                </div>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">USD {walletBalance.thisMonth.toLocaleString()}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">This Month</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Gift className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">₹{walletBalance.credits}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">Credits Available</p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{walletBalance.activeSubscriptions}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">Active Subscriptions</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <button
                  onClick={() => setActiveTab('payments')}
                  className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400 mb-1.5 sm:mb-2" />
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">Add Card</span>
                </button>
                <button
                  onClick={() => setActiveTab('subscriptions')}
                  className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400 mb-1.5 sm:mb-2" />
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">Manage Subs</span>
                </button>
                <button
                  onClick={() => setActiveTab('invoices')}
                  className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Receipt className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400 mb-1.5 sm:mb-2" />
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">View Invoices</span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className="flex flex-col items-center p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400 mb-1.5 sm:mb-2" />
                  <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">History</span>
                </button>
              </div>
            </div>

            {/* Recent Transactions Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Recent Transactions</h3>
                <button
                  onClick={() => setActiveTab('history')}
                  className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {purchases.length === 0 && (
                  <p className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-6">No transactions yet.</p>
                )}
                {purchases.slice(0, 4).map((purchase) => {
                  const CategoryIcon = getCategoryIcon(purchase.category);
                  return (
                    <div key={purchase.id} className="flex items-center justify-between p-2.5 sm:p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl">
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                          <CategoryIcon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white line-clamp-1">{purchase.item}</p>
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{purchase.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">USD {purchase.amount}</p>
                        <span className={`text-[10px] sm:text-xs ${purchase.status === 'Paid' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {purchase.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Payment Methods Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Cards */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Debit/Credit Cards</h2>
                </div>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors text-xs sm:text-sm font-medium"
                >
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Add Card
                </button>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {paymentMethods.length === 0 && (
                  <p className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-6">No cards added yet.</p>
                )}
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all gap-3 ${
                      method.isDefault
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className={`w-10 h-7 sm:w-12 sm:h-8 rounded flex items-center justify-center text-white text-[10px] sm:text-xs font-bold ${
                        method.type === 'visa' ? 'bg-blue-600' : method.type === 'mastercard' ? 'bg-orange-500' : 'bg-green-600'
                      }`}>
                        {method.type === 'visa' ? 'VISA' : method.type === 'mastercard' ? 'MC' : 'RUPAY'}
                      </div>
                      <div>
                        <p className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">
                          •••• •••• •••• {method.last4}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{method.name} · Expires {method.exp}</p>
                      </div>
                      {method.isDefault && (
                        <span className="px-2 py-0.5 sm:py-1 bg-blue-500 text-white text-[10px] sm:text-xs font-medium rounded">Default</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 self-end sm:self-auto">
                      {!method.isDefault && (
                        <button
                          onClick={() => setDefaultMethod(method.id)}
                          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => removeMethod(method.id)}
                        className="p-1.5 sm:p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* UPI */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <span className="text-xs sm:text-sm font-bold text-purple-600 dark:text-purple-400">UPI</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">UPI IDs</h2>
                </div>
                <button
                  onClick={() => setShowAddUPI(true)}
                  className="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors text-xs sm:text-sm font-medium"
                >
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Add UPI
                </button>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {upiIds.length === 0 && (
                  <p className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-6">No UPI IDs added yet.</p>
                )}
                {upiIds.map((upi) => (
                  <div
                    key={upi.id}
                    className={`flex items-center justify-between p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all ${
                      upi.isDefault
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <p className="font-medium text-sm sm:text-base text-gray-900 dark:text-white">{upi.upi}</p>
                      {upi.isDefault && (
                        <span className="px-2 py-0.5 sm:py-1 bg-purple-500 text-white text-[10px] sm:text-xs font-medium rounded">Default</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveUPI(upi.id)}
                      className="p-1.5 sm:p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Digital Wallets */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-4">Digital Wallets</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['Paytm', 'PhonePe', 'Google Pay', 'Amazon Pay'].map((wallet) => (
                  <div key={wallet} className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl border border-gray-200 dark:border-gray-600 text-center opacity-75">
                    <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{wallet}</p>
                    <button
                      disabled
                      title="Coming soon"
                      className="mt-2 text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                      Coming soon
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-6">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Active Subscriptions</h2>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {subscriptions.length === 0 && (
                <p className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-6">No active subscriptions.</p>
              )}
              {subscriptions.map((sub) => {
                const SubIcon = sub.icon;
                return (
                  <div
                    key={sub.id}
                    className={`flex flex-col lg:flex-row lg:items-center justify-between p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 transition-all gap-4 ${
                      sub.status === 'Active'
                        ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                        : sub.status === 'Paused'
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-start space-x-3 sm:space-x-4">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center ${
                        sub.status === 'Active' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                      }`}>
                        <SubIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${sub.status === 'Active' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">{sub.name}</h4>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                            sub.status === 'Active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {sub.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          <span>Plan: <strong>{sub.plan}</strong></span>
                          {sub.renewal !== '-' && <span>Renewal: <strong>{sub.renewal}</strong></span>}
                          <span>
                            <strong>USD {sub.amount}</strong>
                            {sub.period !== 'one-time' && <span>/{sub.period}</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 self-end lg:self-auto">
                      <button
                        onClick={() => navigate('/dashboard/subscription')}
                        className="px-2.5 sm:px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs sm:text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Change Plan
                      </button>
                      {sub.status === 'Active' ? (
                        <button
                          onClick={() => handleToggleSubscription(sub.id, sub.status)}
                          className="px-2.5 sm:px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-xs sm:text-sm hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors flex items-center"
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </button>
                      ) : sub.status === 'Paused' ? (
                        <button
                          onClick={() => handleToggleSubscription(sub.id, sub.status)}
                          className="px-2.5 sm:px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs sm:text-sm hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleCancelSubscription(sub.id)}
                        className="px-2.5 sm:px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs sm:text-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Credits Tab */}
        {activeTab === 'credits' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Credits Balance */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-amber-100 text-xs sm:text-sm mb-1">Available Credits</p>
                  <p className="text-2xl sm:text-4xl font-bold">₹{walletBalance.credits}</p>
                  <p className="text-amber-100 text-xs sm:text-sm mt-2">Use credits for any purchase on Neuro360</p>
                </div>
                <button
                  onClick={() => navigate('/dashboard/subscription')}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-amber-600 font-semibold rounded-lg sm:rounded-xl hover:bg-amber-50 transition-colors text-sm sm:text-base"
                >
                  Upgrade Plan
                </button>
              </div>
            </div>

            {/* Session Packs */}
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 sm:space-x-3 mb-4 sm:mb-6">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Ticket className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Session Packs & Credits</h2>
              </div>

              {sessionPacks.length === 0 && (
                <p className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-6">No session packs or credits yet.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {sessionPacks.map((pack) => {
                  const isLow = pack.type !== 'rupees' && pack.remaining <= 1;
                  const percentRemaining = pack.type === 'rupees' ? 100 : (pack.remaining / pack.total) * 100;

                  return (
                    <div
                      key={pack.id}
                      className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 ${
                        isLow
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
                          : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
                      }`}
                    >
                      <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-2 sm:mb-3">{pack.name}</h4>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs sm:text-sm mb-1">
                          <span className="text-gray-600 dark:text-gray-400">
                            {pack.type === 'rupees' ? 'Balance' : 'Remaining'}
                          </span>
                          <span className={`font-medium ${isLow ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                            {pack.type === 'rupees' ? `₹${pack.remaining}` : `${pack.remaining} / ${pack.total}`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 sm:h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isLow ? 'bg-amber-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${percentRemaining}%` }}
                          ></div>
                        </div>
                      </div>

                      {pack.expiry !== '-' && (
                        <div className="flex items-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                          <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                          Expires: {pack.expiry}
                        </div>
                      )}

                      {pack.type !== 'rupees' && (
                        <button
                          onClick={() => handleUseSessionPack(pack.id, pack.name)}
                          className="w-full px-3 py-1.5 sm:py-2 bg-[#323956] text-white rounded-lg text-xs sm:text-sm hover:bg-[#232D3C] transition-colors"
                        >
                          {pack.type === 'session' ? 'Schedule' : 'Use Credit'}
                        </button>
                      )}

                      {isLow && (
                        <div className="mt-2 sm:mt-3 flex items-center text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                          Running low
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Invoices</h2>
              </div>
              <button
                onClick={() => {
                  if (!invoices.length) { toast.error('No invoices to download'); return; }
                  invoices.forEach(inv => handleDownloadInvoice(inv));
                }}
                className="flex items-center px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-xs sm:text-sm font-medium self-end sm:self-auto"
              >
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                Download All
              </button>
            </div>

            {/* Invoices Table */}
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invoice #</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="text-right py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                    <th className="text-right py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">No invoices yet.</td>
                    </tr>
                  )}
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 sm:py-4 px-3 sm:px-4 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">{invoice.id}</td>
                      <td className="py-3 sm:py-4 px-3 sm:px-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">{invoice.date}</td>
                      <td className="py-3 sm:py-4 px-3 sm:px-4 text-xs sm:text-sm text-gray-900 dark:text-white">{invoice.description}</td>
                      <td className="py-3 sm:py-4 px-3 sm:px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${
                          invoice.status === 'Paid'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {invoice.status === 'Paid' ? <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" /> : <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />}
                          {invoice.status}
                        </span>
                      </td>
                      <td className="py-3 sm:py-4 px-3 sm:px-4 text-right text-xs sm:text-sm font-medium text-gray-900 dark:text-white">USD {invoice.amount}</td>
                      <td className="py-3 sm:py-4 px-3 sm:px-4 text-right">
                        <div className="flex items-center justify-end space-x-1 sm:space-x-2">
                          <button
                            onClick={() => handleViewInvoice(invoice)}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="View"
                          >
                            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadInvoice(invoice)}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            onClick={() => handleEmailInvoice(invoice)}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                            title="Email"
                          >
                            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Purchase History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Package className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Purchase History</h2>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm font-medium self-end sm:self-auto ${
                  showFilters
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                Filters
              </button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl">
                <div>
                  <label className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Date Range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs sm:text-sm"
                  >
                    <option value="all">All Time</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Category</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs sm:text-sm"
                  >
                    <option value="all">All</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Partner</label>
                  <select
                    value={partnerFilter}
                    onChange={(e) => setPartnerFilter(e.target.value)}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs sm:text-sm"
                  >
                    <option value="all">All</option>
                    {partners.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs sm:text-sm"
                  >
                    <option value="all">All</option>
                    <option value="Paid">Paid</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </div>
              </div>
            )}

            {/* Purchases Table */}
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Item</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Partner</th>
                    <th className="text-left py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="text-right py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                    <th className="text-right py-2.5 sm:py-3 px-3 sm:px-4 text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400">No purchases found.</td>
                    </tr>
                  )}
                  {filteredPurchases.map((purchase) => {
                    const CategoryIcon = getCategoryIcon(purchase.category);
                    return (
                      <tr key={purchase.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-3 sm:py-4 px-3 sm:px-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">{purchase.date}</td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4">
                          <div className="flex items-center space-x-2">
                            <CategoryIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 hidden sm:block" />
                            <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">{purchase.item}</span>
                          </div>
                        </td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4">
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 dark:bg-gray-700 rounded text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                            {purchase.category}
                          </span>
                        </td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">{purchase.partner}</td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4">
                          <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${
                            purchase.status === 'Paid'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {purchase.status === 'Paid' ? (
                              <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                            ) : (
                              <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                            )}
                            {purchase.status}
                          </span>
                        </td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4 text-right text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                          USD {purchase.amount}
                        </td>
                        <td className="py-3 sm:py-4 px-3 sm:px-4 text-right">
                          <button
                            onClick={() => handleDownloadInvoice({
                              id: purchase.invoiceId || `INV-${String(purchase.id).slice(-6).toUpperCase()}`,
                              date: purchase.date,
                              description: purchase.item,
                              amount: purchase.amount,
                              status: purchase.status
                            })}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Download receipt"
                          >
                            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add Card Modal */}
        {showAddCard && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Add Payment Card</h3>
                <button
                  onClick={() => setShowAddCard(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Card Number</label>
                  <input
                    type="text"
                    value={newCard.number}
                    onChange={(e) => setNewCard({ ...newCard, number: e.target.value })}
                    placeholder="1234 5678 9012 3456"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry</label>
                    <input
                      type="text"
                      value={newCard.expiry}
                      onChange={(e) => setNewCard({ ...newCard, expiry: e.target.value })}
                      placeholder="MM/YY"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                    <input
                      type="text"
                      value={newCard.cvv}
                      onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value })}
                      placeholder="123"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    value={newCard.name}
                    onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newCard.isDefault}
                    onChange={(e) => setNewCard({ ...newCard, isDefault: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Set as default payment method</span>
                </label>
              </div>

              <div className="flex space-x-3 mt-4 sm:mt-6">
                <button
                  onClick={() => {
                    setShowAddCard(false);
                    setNewCard({ number: '', expiry: '', cvv: '', name: '', isDefault: false });
                  }}
                  className="flex-1 px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCard}
                  className="flex-1 px-4 py-2.5 sm:py-3 bg-[#323956] text-white rounded-lg sm:rounded-xl hover:bg-[#232D3C] transition-colors text-sm"
                >
                  Add Card
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add UPI Modal */}
        {showAddUPI && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Add UPI ID</h3>
                <button
                  onClick={() => setShowAddUPI(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UPI ID</label>
                  <input
                    type="text"
                    value={newUPI.upi}
                    onChange={(e) => setNewUPI({ ...newUPI, upi: e.target.value })}
                    placeholder="yourname@upi"
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUPI.isDefault}
                    onChange={(e) => setNewUPI({ ...newUPI, isDefault: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Set as default UPI</span>
                </label>
              </div>

              <div className="flex space-x-3 mt-4 sm:mt-6">
                <button
                  onClick={() => {
                    setShowAddUPI(false);
                    setNewUPI({ upi: '', isDefault: false });
                  }}
                  className="flex-1 px-4 py-2.5 sm:py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUPI}
                  className="flex-1 px-4 py-2.5 sm:py-3 bg-[#323956] text-white rounded-lg sm:rounded-xl hover:bg-[#232D3C] transition-colors text-sm"
                >
                  Add UPI
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
