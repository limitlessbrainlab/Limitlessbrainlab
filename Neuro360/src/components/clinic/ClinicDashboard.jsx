import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CreditCard, Zap, FileText, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import DatabaseService from '../../services/databaseService';
import DashboardLayout from '../layout/DashboardLayout';
import PatientManagement from './PatientManagement';
import ReportViewer from './ReportViewer';
import OverviewTab from './OverviewTab';
import SubscriptionTab from './SubscriptionTab';
import AdvancedAnalytics from './AdvancedAnalytics';
import ClinicAdminPanel from './ClinicAdminPanel';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Minimal package selection gate for first-time clinic login
const PendingSubscriptionGate = ({ user, clinic, onPaymentSuccess }) => {
  const [packages, setPackages] = useState([]);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [userCurrency, setUserCurrency] = useState({ currency: 'INR', symbol: '\u20b9' });

  const clinicType = clinic?.clinic_type || clinic?.clinicType || 'lbl_partner';

  useEffect(() => {
    loadPackages();
    detectCurrency();
    checkPaymentReturn();
  }, []);

  const detectCurrency = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data.country_code !== 'IN') {
        setUserCurrency({ currency: 'USD', symbol: '$' });
      }
    } catch { /* default INR */ }
  };

  const loadPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .eq('clinic_type', clinicType)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data && data.length > 0) {
        const mapped = data.map(pkg => ({
          id: pkg.package_id,
          reports: pkg.reports,
          priceINR: Number(pkg.price_inr),
          priceUSD: Number(pkg.price_usd),
          label: pkg.label,
          popular: pkg.popular
        })).filter(pkg => pkg.reports === 5);
        setPackages(mapped);
        setSelectedPkg(mapped[0]);
      }
    } catch (err) {
      console.warn('Failed to load pricing:', err);
    } finally {
      setLoadingPkgs(false);
    }
  };

  const checkPaymentReturn = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const reports = urlParams.get('reports');
    const sessionId = urlParams.get('session_id');

    if (payment === 'success' && reports) {
      toast.success(`Successfully purchased ${reports} report credits!`);
      window.history.replaceState({}, document.title, window.location.pathname);

      if (user?.clinicId) {
        const { data: clinicData } = await supabase
          .from('clinics')
          .select('reports_allowed')
          .eq('id', user.clinicId)
          .single();

        const newAllowed = (clinicData?.reports_allowed || 0) + parseInt(reports, 10);

        await Promise.all([
          supabase.from('clinics').update({ subscription_status: 'active', is_active: true, reports_allowed: newAllowed, updated_at: new Date().toISOString() }).eq('id', user.clinicId),
          supabase.from('organizations').update({ subscription_status: 'active', reports_allowed: newAllowed, updated_at: new Date().toISOString() }).eq('id', user.clinicId)
        ]);

        // Save payment record
        const pendingPayment = JSON.parse(localStorage.getItem('pending_payment') || '{}');
        localStorage.removeItem('pending_payment');

        const { data: existing } = await supabase.from('payments').select('id').eq('stripe_session_id', sessionId).limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from('payments').insert({
            clinic_id: user.clinicId,
            amount: pendingPayment.amount || 0,
            currency: pendingPayment.currency || 'INR',
            status: 'completed',
            type: 'subscription',
            package_name: pendingPayment.packageName || `${reports} EEG Reports`,
            reports_allowed: parseInt(reports, 10),
            payment_method: 'stripe',
            payment_id: sessionId || `session_${Date.now()}`,
            stripe_payment_id: sessionId || null,
            stripe_session_id: sessionId || null,
            created_at: new Date().toISOString()
          });
        }

        if (onPaymentSuccess) onPaymentSuccess();
      }
    } else if (payment === 'cancelled') {
      toast.error('Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const getPrice = (pkg) => userCurrency.currency === 'INR' ? pkg.priceINR : pkg.priceUSD;

  const handlePurchase = async () => {
    if (!selectedPkg) {
      toast.error('Please select a package');
      return;
    }
    setProcessing(true);
    try {
      const price = getPrice(selectedPkg);
      const response = await fetch(`${API_URL}/create-report-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPkg.id,
          packageName: selectedPkg.label,
          reports: selectedPkg.reports,
          amount: price,
          currency: userCurrency.currency,
          customerEmail: user?.email,
          customerName: user?.clinicName || user?.name,
          clinicId: user?.clinicId,
          clinicType: clinicType
        })
      });
      const data = await response.json();
      if (data.success && data.checkoutUrl) {
        localStorage.setItem('pending_payment', JSON.stringify({
          amount: price, currency: userCurrency.currency, reports: selectedPkg.reports, packageName: selectedPkg.label, clinicId: user?.clinicId
        }));
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loadingPkgs) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#323956]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4A6FA5] rounded-2xl p-8 text-white text-center">
        <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-90" />
        <h1 className="text-2xl font-bold mb-2">Welcome to Limitless Brain Lab!</h1>
        <p className="text-white/80 max-w-md mx-auto">
          Select a credit package below to activate your clinic dashboard and start generating EEG reports.
        </p>
      </div>

      {/* Reports Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{clinic?.reportsUsed || clinic?.reports_used || 0}</p>
          <p className="text-xs text-gray-500">Reports Used</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <FileText className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{clinic?.reportsAllowed || clinic?.reports_allowed || 0}</p>
          <p className="text-xs text-gray-500">Reports Available</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <FileText className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {Math.max(0, (clinic?.reportsAllowed || clinic?.reports_allowed || 0) - (clinic?.reportsUsed || clinic?.reports_used || 0))}
          </p>
          <p className="text-xs text-gray-500">Reports Remaining</p>
        </div>
      </div>

      {/* Package Cards */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Choose Your Package</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">
          {clinicType === 'lbl_clinic' ? 'LBL Clinic' : 'LBL Partner'} pricing
        </p>

        {packages.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No packages available. Please contact support.</p>
        ) : (
          <div className={`grid gap-5 mb-6 ${packages.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : packages.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {packages.map(pkg => {
              const isSelected = selectedPkg?.id === pkg.id;
              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPkg(pkg)}
                  className={`relative rounded-2xl p-6 text-center transition-all duration-200 ${
                    isSelected
                      ? 'border-2 border-[#323956] bg-[#E4EFFF] shadow-xl scale-[1.03]'
                      : 'border-2 border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap">Best Value</span>
                  )}

                  {/* Report count - big number */}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    isSelected ? 'bg-[#323956] text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                    <span className="text-2xl font-black">{pkg.reports}</span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1">{pkg.label}</h3>
                  <p className="text-sm text-gray-500 mb-4">{pkg.reports} EEG Report Credits</p>

                  {/* Price */}
                  <div className="mb-3">
                    <p className="text-3xl font-black text-[#323956]">
                      {userCurrency.symbol}{getPrice(pkg).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {userCurrency.symbol}{Math.round(getPrice(pkg) / pkg.reports).toLocaleString()} per report
                    </p>
                  </div>

                  {/* Select indicator */}
                  <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium ${
                    isSelected
                      ? 'bg-[#323956] text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isSelected ? (
                      <><Zap className="h-4 w-4" /> Selected</>
                    ) : (
                      'Select'
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {packages.length > 0 && (
          <button
            onClick={handlePurchase}
            disabled={processing || !selectedPkg}
            className="w-full bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                Pay {userCurrency.symbol}{selectedPkg ? getPrice(selectedPkg).toLocaleString() : '0'} & Activate
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// Credits Exhausted Popup with inline package selection
const CreditsExhaustedPopup = ({ user, clinic, onDismiss, onPaymentSuccess }) => {
  const [showPackages, setShowPackages] = useState(false);
  const [packages, setPackages] = useState([]);
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [userCurrency, setUserCurrency] = useState({ currency: 'INR', symbol: '\u20b9' });

  const clinicType = clinic?.clinic_type || clinic?.clinicType || 'lbl_partner';
  const previousReports = clinic?.reportsAllowed || clinic?.reports_allowed || 0;

  useEffect(() => {
    if (showPackages) {
      loadPackages();
      detectCurrency();
    }
  }, [showPackages]);

  const detectCurrency = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data.country_code !== 'IN') setUserCurrency({ currency: 'USD', symbol: '$' });
    } catch { /* default INR */ }
  };

  const loadPackages = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .eq('clinic_type', clinicType)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (!error && data) {
        const mapped = data.map(pkg => ({
          id: pkg.package_id, reports: pkg.reports,
          priceINR: Number(pkg.price_inr), priceUSD: Number(pkg.price_usd),
          label: pkg.label, popular: pkg.popular
        })).filter(pkg => pkg.reports === 5);
        setPackages(mapped);
      }
    } catch (err) { console.warn('Failed to load packages:', err); }
  };

  const getPrice = (pkg) => userCurrency.currency === 'INR' ? pkg.priceINR : pkg.priceUSD;

  const handlePurchase = async (pkg) => {
    setProcessing(true);
    try {
      const price = getPrice(pkg);
      const response = await fetch(`${API_URL}/create-report-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id, packageName: pkg.label, reports: pkg.reports,
          amount: price, currency: userCurrency.currency,
          customerEmail: user?.email, customerName: user?.clinicName || user?.name,
          clinicId: user?.clinicId, clinicType
        })
      });
      const data = await response.json();
      if (data.success && data.checkoutUrl) {
        localStorage.setItem('pending_payment', JSON.stringify({
          amount: price, currency: userCurrency.currency, reports: pkg.reports, packageName: pkg.label, clinicId: user?.clinicId
        }));
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
      }
    } catch (err) {
      console.error('Payment error:', err);
      toast.error('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-90" />
          <h2 className="text-xl font-bold">Report Credits Exhausted!</h2>
          <p className="text-white/80 text-sm mt-1">Purchase a new package to continue uploading and downloading reports.</p>
        </div>

        <div className="p-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5 text-center text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{clinic?.reportsUsed || clinic?.reports_used || 0}</p>
              <p className="text-xs text-gray-500">Used</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{clinic?.reportsAllowed || clinic?.reports_allowed || 0}</p>
              <p className="text-xs text-gray-500">Allowed</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-lg font-bold text-red-600">0</p>
              <p className="text-xs text-red-500">Remaining</p>
            </div>
          </div>

          {!showPackages ? (
            /* Initial view - two buttons */
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                View Only Mode
              </button>
              <button
                onClick={() => setShowPackages(true)}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white rounded-lg hover:opacity-90 transition-opacity font-medium flex items-center justify-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Renew Package
              </button>
            </div>
          ) : (
            /* Package cards view */
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1 text-center">Choose a Package</h3>
              <p className="text-sm text-gray-500 mb-4 text-center">{clinicType === 'lbl_clinic' ? 'LBL Clinic' : 'LBL Partner'} pricing</p>

              {packages.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#323956]"></div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {packages.map(pkg => {
                    const isPrevious = pkg.reports === previousReports;
                    const isSelected = selectedPkg?.id === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => setSelectedPkg(pkg)}
                        className={`relative rounded-xl p-4 text-center transition-all border-2 ${
                          isSelected
                            ? 'border-[#323956] bg-[#E4EFFF] shadow-lg scale-[1.02]'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {isPrevious && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Previous Plan</span>
                        )}
                        {pkg.popular && !isPrevious && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">Best Value</span>
                        )}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          isSelected ? 'bg-[#323956] text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                          <span className="text-xl font-black">{pkg.reports}</span>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm">{pkg.label}</p>
                        <p className="text-xl font-bold text-[#323956] mt-1">{userCurrency.symbol}{getPrice(pkg).toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">{userCurrency.symbol}{Math.round(getPrice(pkg) / pkg.reports).toLocaleString()}/report</p>
                        <div className={`mt-2 text-xs font-semibold px-3 py-1 rounded-full inline-block ${
                          isPrevious
                            ? 'bg-orange-100 text-orange-700'
                            : isSelected ? 'bg-[#323956] text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isPrevious ? 'Buy Again' : isSelected ? 'Selected' : 'Select & Pay'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPackages(false)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  onClick={() => selectedPkg && handlePurchase(selectedPkg)}
                  disabled={processing || !selectedPkg}
                  className="flex-1 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    <><CreditCard className="h-4 w-4" /> Pay {userCurrency.symbol}{selectedPkg ? getPrice(selectedPkg).toLocaleString() : '0'}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ClinicDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [clinic, setClinic] = useState(null);
  const [patients, setPatients] = useState([]);
  const [reports, setReports] = useState([]);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isMounted, setIsMounted] = useState(true);
  const [showCreditsExhausted, setShowCreditsExhausted] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(() => {
    // Check if this is a payment return URL - if so, delay data loading
    const params = new URLSearchParams(window.location.search);
    return params.get('payment') === 'success';
  });

  // Get active tab from URL pathname
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeTab = pathParts.length > 1 ? pathParts[1] : 'overview';

  // Helper function to get clinic ID from user
  const getClinicId = (user) => {
    if (!user) return null;
    if (user.role === 'clinic_admin') {
      return user.clinicId || user.id;
    }
    return user.clinicId;
  };

  // Handle payment success redirect BEFORE loading clinic data
  useEffect(() => {
    const processPaymentReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const payment = urlParams.get('payment');
      const reports = urlParams.get('reports');
      const sessionId = urlParams.get('session_id');

      if (payment === 'success' && reports && user?.clinicId) {
        window.history.replaceState({}, document.title, window.location.pathname);

        try {
          const purchasedReports = parseInt(reports, 10);

          // Get current reports_allowed
          const { data: clinicData } = await supabase
            .from('clinics')
            .select('reports_allowed')
            .eq('id', user.clinicId)
            .single();

          const currentAllowed = clinicData?.reports_allowed || 0;
          const newAllowed = currentAllowed + purchasedReports;

          // Update clinics table - reset reports_used on renewal
          await supabase.from('clinics').update({
            reports_allowed: newAllowed,
            reports_used: 0,
            subscription_status: 'active',
            is_active: true,
            updated_at: new Date().toISOString()
          }).eq('id', user.clinicId);

          // Update organizations table
          await supabase.from('organizations').update({
            reports_allowed: newAllowed,
            reports_used: 0,
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          }).eq('id', user.clinicId).catch(() => {});

          // Save payment record
          const pendingPayment = JSON.parse(localStorage.getItem('pending_payment') || '{}');
          localStorage.removeItem('pending_payment');

          const { data: existing } = await supabase.from('payments').select('id').eq('stripe_session_id', sessionId).limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from('payments').insert({
              clinic_id: user.clinicId,
              amount: pendingPayment.amount || 0,
              currency: pendingPayment.currency || 'INR',
              status: 'completed',
              type: 'subscription',
              package_name: pendingPayment.packageName || `${purchasedReports} EEG Reports`,
              reports_allowed: purchasedReports,
              payment_method: 'stripe',
              payment_id: sessionId || `session_${Date.now()}`,
              stripe_payment_id: sessionId || null,
              stripe_session_id: sessionId || null,
              created_at: new Date().toISOString()
            });
          }

          toast.success(`Successfully purchased ${purchasedReports} report credits!`);

          // Force reload clinic data with updated values
          setShowCreditsExhausted(false);
          setDataLoaded(false);
        } catch (err) {
          console.error('ERROR: Failed to process payment return:', err);
          toast.error('Payment recorded but failed to update credits. Please refresh.');
        } finally {
          setPaymentProcessing(false);
        }
      } else {
        if (payment === 'cancelled') {
          toast.error('Payment was cancelled');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        setPaymentProcessing(false);
      }
    };

    if (user?.clinicId) {
      processPaymentReturn();
    } else {
      setPaymentProcessing(false);
    }
  }, [user?.clinicId]);

  useEffect(() => {
    if (paymentProcessing) return; // Wait for payment processing to finish first
    try {
      const clinicId = getClinicId(user);
      if (user && clinicId && !dataLoaded) {
        loadClinicData();
      } else if (user && !clinicId) {
        console.warn('WARNING: User loaded but no clinicId found:', user);
        if (isMounted) {
          setLoading(false);
        }
      } else if (user && clinicId && dataLoaded) {
        if (isMounted) {
          setLoading(false);
        }
      } else {
      }
    } catch (error) {
      console.error('Error initializing ClinicDashboard:', error);
      if (isMounted) {
        setLoading(false);
      }
    }

    // Cleanup function
    return () => {
      setIsMounted(false);
    };
  }, [user, dataLoaded, isMounted, paymentProcessing]);

  const loadClinicData = async () => {
    try {

      const clinicId = getClinicId(user);
      if (!user || !clinicId) {
        console.error('ERROR: No clinic ID found for user:', user);
        setLoading(false);
        return;
      }


      // Get current user's clinic data only
      let currentClinic = await DatabaseService.findById('clinics', clinicId);

      if (!currentClinic) {
        console.warn('WARNING: Clinic not found for ID:', clinicId, '- Creating new clinic record');

        // Create clinic record in database
        try {
          const newClinic = {
            id: clinicId,
            name: user.clinicName || 'Sai Clinic',
            email: user.email,
            contactPerson: user.name || '',
            phone: user.phone || '',
            address: '',
            adminName: user.name,
            createdAt: new Date().toISOString(),
            reportsUsed: 0,
            reportsAllowed: 0, // Default allowance
            subscriptionStatus: 'trial'
          };

          currentClinic = await DatabaseService.add('clinics', newClinic);
        } catch (error) {
          console.error('ERROR: Failed to create clinic record:', error);
          setLoading(false);
          return;
        }
      }

      
      // Get ONLY this clinic's patients and reports
      let clinicPatients = await DatabaseService.getPatientsByClinic(currentClinic.id);
      let clinicReports = await DatabaseService.getReportsByClinic(currentClinic.id);
      
      // If no patients in database but exist in localStorage, migrate them
      if (clinicPatients.length === 0) {

        const localStoragePatients = JSON.parse(localStorage.getItem('patients') || '[]');
        const localStorageReports = JSON.parse(localStorage.getItem('reports') || '[]');

        const clinicPatientsFromLocal = localStoragePatients.filter(p =>
          p.clinicId === currentClinic.id ||
          p.clinicId == currentClinic.id || // eslint-disable-line eqeqeq
          String(p.clinicId) === String(currentClinic.id)
        );

        if (clinicPatientsFromLocal.length > 0) {
          
          // Migrate patients
          for (const patient of clinicPatientsFromLocal) {
            try {
              await DatabaseService.add('patients', patient);
            } catch (error) {
              console.error(`ERROR: Failed to migrate patient ${patient.name}:`, error);
            }
          }
          
          // Migrate reports
          const clinicReportsFromLocal = localStorageReports.filter(r => 
            r.clinicId === currentClinic.id || 
            r.clinicId == currentClinic.id || // eslint-disable-line eqeqeq
            String(r.clinicId) === String(currentClinic.id)
          );
          
          for (const report of clinicReportsFromLocal) {
            try {
              // Ensure report has required fields
              const reportToMigrate = {
                ...report,
                id: report.id || `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: report.createdAt || new Date().toISOString()
              };
              
              await DatabaseService.add('reports', reportToMigrate);
            } catch (error) {
              console.error(`ERROR: Failed to migrate report ${report.fileName}:`, error);
            }
          }
          
          // Reload data after migration
          clinicPatients = await DatabaseService.getPatientsByClinic(currentClinic.id);
          clinicReports = await DatabaseService.getReportsByClinic(currentClinic.id);
          
        }
      }
      
      // Calculate clinic usage
      const clinicUsage = {
        totalReports: clinicReports.length,
        reportsUsed: currentClinic.reportsUsed || 0,
        reportsAllowed: currentClinic.reportsAllowed || 0
      };
      
      console.log('DATA: Clinic data loaded:', {
        clinic: currentClinic.name,
        patients: clinicPatients.length,
        reports: clinicReports.length
      });
      
      setClinic(currentClinic);
      setPatients(clinicPatients);
      setReports(clinicReports);
      setUsage(clinicUsage);
      setDataLoaded(true); // Mark data as loaded

      // Check if credits are exhausted - show popup
      const allowed = currentClinic.reportsAllowed || currentClinic.reports_allowed || 0;
      const used = currentClinic.reportsUsed || currentClinic.reports_used || 0;
      const remaining = allowed - used;
      if (allowed > 0 && remaining <= 0 && currentClinic.subscriptionStatus !== 'pending' && currentClinic.subscription_status !== 'pending') {
        setShowCreditsExhausted(true);
      } else {
        setShowCreditsExhausted(false);
      }
    } catch (error) {
      console.error('Error loading clinic data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Separate refresh function that forces a reload
  const refreshClinicData = async () => {
    setDataLoaded(false); // This will trigger a reload
    await loadClinicData();
  };

  // Check if credits are exhausted
  const creditsExhausted = clinic && (
    (clinic.reportsAllowed || clinic.reports_allowed || 0) > 0 &&
    ((clinic.reportsAllowed || clinic.reports_allowed || 0) - (clinic.reportsUsed || clinic.reports_used || 0)) <= 0
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab clinic={clinic} patients={patients} reports={reports} usage={usage} onRefresh={refreshClinicData} />;
      case 'patients':
        return <PatientManagement key={`patients-${clinic?.id}`} clinicId={clinic?.id} onUpdate={refreshClinicData} creditsExhausted={creditsExhausted} />;
      case 'reports':
        return <ReportViewer clinicId={clinic?.id} patients={patients} reports={reports} onUpdate={refreshClinicData} creditsExhausted={creditsExhausted} />;
      case 'usage':
        return <UsageTracking clinic={clinic} usage={usage} />;
      case 'analytics':
        return <AdvancedAnalytics clinicId={clinic?.id} clinic={clinic} />;
      case 'subscription':
        return <SubscriptionTab user={user} clinic={clinic} onPaymentSuccess={refreshClinicData} />;
      case 'admin':
        return <ClinicAdminPanel clinicId={clinic?.id} clinic={clinic} />;
      case 'settings':
        return <ClinicSettings clinic={clinic} />;
      default:
        return <OverviewTab clinic={clinic} patients={patients} reports={reports} usage={usage} onRefresh={refreshClinicData} />;
    }
  };

  const getPageTitle = () => {
    const isPartner = clinic?.clinic_type === 'lbl_partner' || clinic?.clinicType === 'lbl_partner';
    const typeLabel = isPartner ? 'Partner' : 'Clinic';

    switch (activeTab) {
      case 'overview': return `${typeLabel} Dashboard`;
      case 'patients': return 'Patient Management';
      case 'reports': return 'Reports & Files';
      case 'usage': return 'Usage Tracking';
      case 'analytics': return 'Advanced Analytics';
      case 'subscription': return 'Subscription & Billing';
      case 'admin': return 'Admin Panel';
      case 'settings': return `${typeLabel} Settings`;
      default: return `${typeLabel} Dashboard`;
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading Clinic Portal...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Check if clinic has pending subscription (no package purchased yet)
  const isPendingSubscription = clinic && (
    clinic.subscriptionStatus === 'pending' ||
    clinic.subscription_status === 'pending'
  );

  if (isPendingSubscription) {
    return (
      <DashboardLayout title="Select a Package" hideSidebar>
        <div className="max-w-4xl mx-auto">
          <PendingSubscriptionGate user={user} clinic={clinic} onPaymentSuccess={refreshClinicData} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={getPageTitle()}>
      <div className="space-y-6">
        {/* Credits exhausted banner on all pages */}
        {creditsExhausted && activeTab !== 'subscription' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-800">Report credits exhausted</p>
                <p className="text-sm text-red-600">Upload & download are disabled. Purchase more credits to continue.</p>
              </div>
            </div>
            <button onClick={() => setShowCreditsExhausted(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors whitespace-nowrap">
              Renew Package
            </button>
          </div>
        )}

        {renderContent()}
      </div>

      {/* Credits Exhausted Popup */}
      {showCreditsExhausted && (
        <CreditsExhaustedPopup
          user={user}
          clinic={clinic}
          onDismiss={() => setShowCreditsExhausted(false)}
          onPaymentSuccess={() => { setShowCreditsExhausted(false); refreshClinicData(); }}
        />
      )}
    </DashboardLayout>
  );
};

// Usage Tracking Component
const UsageTracking = ({ clinic, usage }) => {
  const usagePercentage = clinic?.reportsUsed && clinic?.reportsAllowed
    ? (clinic.reportsUsed / clinic.reportsAllowed) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Usage Overview</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#323956] dark:text-blue-400">{clinic?.reportsUsed || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Reports Used</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-[#323956] dark:text-blue-400">{clinic?.reportsAllowed || 10}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Reports Allowed</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{Math.max(0, (clinic?.reportsAllowed || 10) - (clinic?.reportsUsed || 0))}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Remaining</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Usage Progress</span>
            <span>{usagePercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                usagePercentage >= 90 ? 'bg-red-500 dark:bg-red-600' :
                usagePercentage >= 70 ? 'bg-yellow-500 dark:bg-yellow-600' : 'bg-[#323956] dark:bg-blue-500'
              }`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Clinic Settings Component
const ClinicSettings = ({ clinic }) => {
  const [formData, setFormData] = useState({
    name: clinic?.name || '',
    contactPerson: clinic?.contactPerson || clinic?.contact_person || '',
    email: clinic?.email || '',
    phone: clinic?.phone || '',
    address: clinic?.address || '',
    smtp_email: clinic?.smtpEmail || clinic?.smtp_email || '',
    smtp_password: clinic?.smtpPassword || clinic?.smtp_password || ''
  });
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [originalData, setOriginalData] = useState({});

  useEffect(() => {
    if (clinic) {
      const clinicData = {
        name: clinic.name || '',
        contactPerson: clinic.contactPerson || clinic.contact_person || '',
        email: clinic.email || '',
        phone: clinic.phone || '',
        address: clinic.address || '',
        smtp_email: clinic.smtpEmail || clinic.smtp_email || '',
        smtp_password: clinic.smtpPassword || clinic.smtp_password || ''
      };
      setFormData(clinicData);
      setOriginalData(clinicData); // Store original data for change tracking
    }
  }, [clinic]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getChangedFields = () => {
    const changes = {};
    Object.keys(formData).forEach(key => {
      if (formData[key] !== originalData[key]) {
        changes[key] = {
          old: originalData[key],
          new: formData[key]
        };
      }
    });
    return changes;
  };

  const createProfileChangeAlert = async (changes) => {
    try {
      const changesList = Object.keys(changes).map(field => {
        const fieldNames = {
          name: 'Clinic Name',
          contactPerson: 'Contact Person',
          email: 'Email',
          phone: 'Phone',
          address: 'Address',
          smtp_email: 'SMTP Email',
          smtp_password: 'SMTP Password'
        };
        
        return `${fieldNames[field]}: "${changes[field].old}" → "${changes[field].new}"`;
      }).join('\n');

      const alert = {
        id: `alert_${Date.now()}`,
        type: 'profile_change',
        severity: 'info',
        title: `Profile Updated - ${clinic?.name}`,
        message: `Clinic "${clinic?.name}" has updated their profile information:\n\n${changesList}`,
        clinicId: clinic?.id,
        clinicName: clinic?.name,
        changes: changes,
        createdAt: new Date().toISOString(),
        read: false,
        actionRequired: false
      };

      // Add alert to database
      await DatabaseService.add('alerts', alert);
      
      return true;
    } catch (error) {
      console.error('ERROR: Failed to create profile change alert:', error);
      return false;
    }
  };

  const handleSaveChanges = async () => {
    if (!clinic?.id) {
      toast.error('Clinic ID not found');
      return;
    }

    setLoading(true);
    try {
      // Get changed fields
      const changes = getChangedFields();
      
      if (Object.keys(changes).length === 0) {
        toast.info('No changes to save');
        setLoading(false);
        return;
      }

      // Update clinic profile in database
      await DatabaseService.update('clinics', clinic.id, formData);
      
      // Create alert for super admin
      const alertCreated = await createProfileChangeAlert(changes);
      
      // Update original data to reflect saved state
      setOriginalData({ ...formData });
      
      // Success message
      if (alertCreated) {
        toast.success('Profile updated successfully! Super Admin has been notified of the changes.');
      } else {
        toast.success('Profile updated successfully!');
      }
      
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = Object.keys(getChangedFields()).length > 0;

  // Separate save handler for SMTP config
  const [savingSmtp, setSavingSmtp] = useState(false);
  const handleSaveSmtpConfig = async () => {
    if (!clinic?.id) {
      toast.error('Clinic ID not found');
      return;
    }
    if (!formData.smtp_email || !formData.smtp_password) {
      toast.error('Please enter both Gmail address and App Password');
      return;
    }
    setSavingSmtp(true);
    try {
      await DatabaseService.update('clinics', clinic.id, {
        smtp_email: formData.smtp_email,
        smtp_password: formData.smtp_password
      });
      setOriginalData(prev => ({ ...prev, smtp_email: formData.smtp_email, smtp_password: formData.smtp_password }));
      toast.success(`Email configuration saved! Emails will be sent from ${formData.smtp_email}`);
    } catch (error) {
      console.error('Error saving SMTP config:', error);
      toast.error('Failed to save email configuration. Please try again.');
    } finally {
      setSavingSmtp(false);
    }
  };

  const smtpHasChanges = formData.smtp_email !== originalData.smtp_email || formData.smtp_password !== originalData.smtp_password;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {clinic?.clinic_type === 'lbl_partner' || clinic?.clinicType === 'lbl_partner' ? 'Partner' : 'Clinic'} Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {clinic?.clinic_type === 'lbl_partner' || clinic?.clinicType === 'lbl_partner' ? 'Partner' : 'Clinic'} Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder={`Enter ${clinic?.clinic_type === 'lbl_partner' || clinic?.clinicType === 'lbl_partner' ? 'partner' : 'clinic'} name`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contact Person</label>
            <input
              type="text"
              value={formData.contactPerson}
              onChange={(e) => handleInputChange('contactPerson', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter contact person name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter phone number"
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
          <textarea
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter clinic address"
          />
        </div>

        {hasChanges && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-400">
              <strong>Pending Changes:</strong> You have unsaved changes. Click "Save Changes" to update your profile.
            </p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSaveChanges}
            disabled={loading || !hasChanges}
            className={`px-6 py-2 rounded-lg transition-colors ${
              loading || !hasChanges
                ? 'bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed'
                : 'bg-primary-600 dark:bg-blue-600 text-white hover:bg-primary-700 dark:hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </span>
            ) : (
              'Save Changes'
            )}
          </button>

          {hasChanges && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Super Admin will be notified of these changes
            </p>
          )}
        </div>
      </div>

      {/* Email Configuration Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Email Configuration</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Configure your clinic's Gmail to send patient emails (welcome, credentials) from your own email address.
        </p>

        {/* Step 1: Enable 2-Step Verification */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2">Step 1: Enable 2-Step Verification (Gmail/Google)</h4>
          <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
            <li>Go to your Google Account: <a href="https://myaccount.google.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">https://myaccount.google.com</a></li>
            <li>Click <strong>Security</strong> in the left navigation</li>
            <li>Under "How you sign in to Google", click <strong>2-Step Verification</strong></li>
            <li>Click <strong>Get started</strong></li>
            <li>Follow the prompts to add your phone number and verify</li>
            <li>Complete the setup</li>
          </ol>
        </div>

        {/* Step 2: Generate App Password */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-5">
          <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-2">Step 2: Generate an App Password</h4>
          <p className="text-xs text-amber-700 dark:text-amber-400 mb-2 italic">After 2-step verification is enabled:</p>
          <ol className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-decimal list-inside">
            <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-medium">https://myaccount.google.com/apppasswords</a></li>
            <li>You may need to sign in again</li>
            <li>Select App: Choose <strong>"Mail"</strong> or <strong>"Other (custom name)"</strong></li>
            <li>Select Device: Choose your device or enter a custom name (e.g., "Limitlessbrainlab form")</li>
            <li>Click <strong>Generate</strong></li>
            <li>Copy the <strong>16-character password</strong> shown (no spaces needed)</li>
            <li>Paste the password in the <strong>"Gmail App Password"</strong> field below</li>
          </ol>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Gmail Address</label>
            <input
              type="email"
              value={formData.smtp_email}
              onChange={(e) => handleInputChange('smtp_email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              placeholder="clinic@gmail.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Gmail App Password</label>
            <div className="relative">
              <input
                type={showSmtpPassword ? 'text' : 'password'}
                value={formData.smtp_password}
                onChange={(e) => handleInputChange('smtp_password', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 pr-10"
                placeholder="xxxx xxxx xxxx xxxx"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showSmtpPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        {formData.smtp_email && formData.smtp_password ? (
          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
            <p className="text-sm text-green-700 dark:text-green-400">
              Patient emails will be sent from <strong>{formData.smtp_email}</strong>
            </p>
          </div>
        ) : (
          <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Patient emails will be sent from the default system email (limitlessbrainlab@gmail.com)
            </p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
          <button
            onClick={handleSaveSmtpConfig}
            disabled={savingSmtp || !formData.smtp_email || !formData.smtp_password}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              savingSmtp || !formData.smtp_email || !formData.smtp_password
                ? 'bg-gray-400 dark:bg-gray-600 text-white cursor-not-allowed'
                : 'bg-[#323956] text-white hover:bg-[#252a45]'
            }`}
          >
            {savingSmtp ? (
              <span className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </span>
            ) : originalData.smtp_email ? (
              'Update Email Config'
            ) : (
              'Save Email Config'
            )}
          </button>
          {smtpHasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
        </div>
      </div>

    </div>
  );
};

export default ClinicDashboard;