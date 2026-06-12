import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Package,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  Zap,
  Users,
  Shield,
  RefreshCw,
  X,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import PaymentHistory from '../payment/PaymentHistory';
import PaymentSuccessModal from '../payment/PaymentSuccessModal';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Fallback credit packages (used if DB fetch fails)
const FALLBACK_PACKAGES = {
  lbl_partner: [
    { id: 'partner-5', reports: 5, priceINR: 7500, priceUSD: 90, label: '5 Reports' }
  ],
  lbl_clinic: [
    { id: 'clinic-5', reports: 5, priceINR: 3000, priceUSD: 36, label: '5 Reports' },
    { id: 'clinic-10', reports: 10, priceINR: 2500, priceUSD: 30, label: '10 Reports', popular: true }
  ]
};
const LOW_CREDITS_THRESHOLD = 3;

const SubscriptionTab = ({ onPaymentSuccess } = {}) => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('overview');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showLowCreditsPopup, setShowLowCreditsPopup] = useState(false);
  const [lowCreditsDismissed, setLowCreditsDismissed] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [clinicType, setClinicType] = useState(null);
  const [dbPackages, setDbPackages] = useState(null);
  const [usageStats, setUsageStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [userCurrency, setUserCurrency] = useState({ currency: 'INR', symbol: '\u20b9' });

  useEffect(() => {
    if (user?.clinicId) {
      loadUsageStats();
    }
    detectCurrency();
    checkPaymentSuccess();
    loadPricingFromDB();
  }, [user]);

  // Show low credits popup when credits are low
  useEffect(() => {
    if (!loading && !lowCreditsDismissed && usageStats.reportsRemaining <= LOW_CREDITS_THRESHOLD) {
      setShowLowCreditsPopup(true);
    }
  }, [usageStats, loading, lowCreditsDismissed]);

  const detectCurrency = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      if (data.country_code === 'IN') {
        setUserCurrency({ currency: 'INR', symbol: '\u20b9' });
      } else {
        setUserCurrency({ currency: 'USD', symbol: '$' });
      }
    } catch {
      setUserCurrency({ currency: 'USD', symbol: '$' });
    }
  };

  const checkPaymentSuccess = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const reports = urlParams.get('reports');
    const sessionId = urlParams.get('session_id');

    if (payment === 'success' && reports) {
      toast.success(`Successfully purchased ${reports} report credits!`);
      window.history.replaceState({}, document.title, window.location.pathname);
      loadUsageStats();

      if (user?.clinicId) {
        // 1. Get current reports_allowed to calculate new total
        const { data: clinicData } = await supabase
          .from('clinics')
          .select('reports_allowed, clinic_type, name, email')
          .eq('id', user.clinicId)
          .single();

        const currentAllowed = clinicData?.reports_allowed || 0;
        const purchasedReports = parseInt(reports, 10);
        const newAllowed = currentAllowed + purchasedReports;

        // 2. Update subscription status and reports in both tables
        await Promise.all([
          supabase.from('clinics').update({
            subscription_status: 'active',
            is_active: true,
            reports_allowed: newAllowed,
            updated_at: new Date().toISOString()
          }).eq('id', user.clinicId),
          supabase.from('organizations').update({
            subscription_status: 'active',
            reports_allowed: newAllowed,
            updated_at: new Date().toISOString()
          }).eq('id', user.clinicId)
        ]);

        // 3. Save payment record to payments table for SuperAdmin dashboard
        const pendingPayment = JSON.parse(localStorage.getItem('pending_payment') || '{}');
        localStorage.removeItem('pending_payment');

        const paymentAmount = pendingPayment.amount || 0;
        const paymentCurrency = pendingPayment.currency || userCurrency.currency || 'INR';
        const packageLabel = pendingPayment.packageName || `${purchasedReports} EEG Reports`;

        // Check if webhook already saved this record (avoid duplicate)
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('stripe_session_id', sessionId)
          .limit(1);

        if (!existingPayment || existingPayment.length === 0) {
          await supabase.from('payments').insert({
            clinic_id: user.clinicId,
            amount: paymentAmount,
            currency: paymentCurrency,
            status: 'completed',
            type: 'subscription',
            package_name: packageLabel,
            reports_allowed: purchasedReports,
            payment_method: 'stripe',
            payment_id: sessionId || `session_${Date.now()}`,
            stripe_payment_id: sessionId || null,
            stripe_session_id: sessionId || null,
            created_at: new Date().toISOString()
          });
        } else {
        }

        if (onPaymentSuccess) onPaymentSuccess();
      }
    } else if (payment === 'cancelled') {
      toast.error('Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const loadUsageStats = async () => {
    try {
      if (user?.clinicId) {
        // Try organizations table first, fallback to clinics table
        let clinic = null;
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('reports_used, reports_allowed, total_spent, clinic_type, clinicType')
          .eq('id', user.clinicId)
          .single();

        if (!orgError && orgData) {
          clinic = orgData;
        } else {
          // Fallback: read from clinics table
          const { data: clinicData, error: clinicError } = await supabase
            .from('clinics')
            .select('reports_used, reports_allowed, total_spent, clinic_type')
            .eq('id', user.clinicId)
            .single();

          if (!clinicError && clinicData) {
            clinic = clinicData;
          }
        }

        if (clinic) {
          const type = clinic.clinic_type || clinic.clinicType || 'lbl_partner';
          setClinicType(type);
          setUsageStats({
            reportsUsed: clinic.reports_used || 0,
            reportsAllowed: clinic.reports_allowed || 0,
            reportsRemaining: (clinic.reports_allowed || 0) - (clinic.reports_used || 0),
            totalSpent: clinic.total_spent || 0
          });
        }
      }
    } catch (error) {
      console.error('Error loading usage stats:', error);
      setUsageStats({
        reportsUsed: 0,
        reportsAllowed: 0,
        reportsRemaining: 0,
        totalSpent: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPricingFromDB = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data && data.length > 0) {
        const grouped = {};
        data.forEach(pkg => {
          if (!grouped[pkg.clinic_type]) grouped[pkg.clinic_type] = [];
          grouped[pkg.clinic_type].push({
            id: pkg.package_id,
            reports: pkg.reports,
            priceINR: Number(pkg.price_inr),
            priceUSD: Number(pkg.price_usd),
            label: pkg.label,
            popular: pkg.popular
          });
        });
        setDbPackages(grouped);
      }
    } catch (err) {
      console.warn('Failed to load pricing from DB, using fallback:', err);
    }
  };

  const getPackages = () => {
    const source = dbPackages || FALLBACK_PACKAGES;
    const all = source[clinicType] || source.lbl_partner || FALLBACK_PACKAGES.lbl_partner;
    return all.filter(pkg => pkg.reports === 5);
  };

  const getPackagePrice = (pkg) => {
    return userCurrency.currency === 'INR' ? pkg.priceINR : pkg.priceUSD;
  };

  const handleRefillClick = () => {
    const packages = getPackages();
    setSelectedPackage(packages[0]);
    setShowCheckout(true);
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      toast.error('Please select a package');
      return;
    }

    setProcessingPayment(true);

    try {
      const price = getPackagePrice(selectedPackage);

      const response = await fetch(`${API_URL}/create-report-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          packageName: selectedPackage.label,
          reports: selectedPackage.reports,
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
        // Save purchase info for payment record on success redirect
        localStorage.setItem('pending_payment', JSON.stringify({
          amount: price,
          currency: userCurrency.currency,
          reports: selectedPackage.reports,
          packageName: selectedPackage.label,
          clinicId: user?.clinicId
        }));
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment processing failed. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setPaymentData(null);
  };

  const needsMoreReports = usageStats.reportsRemaining <= LOW_CREDITS_THRESHOLD;

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Current Plan Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Current Plan</h3>
            <p className="text-gray-600 mt-1">Manage your subscription and usage</p>
          </div>
          <button
            onClick={loadUsageStats}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Reports Used</p>
                <p className="text-2xl font-bold">{usageStats.reportsUsed || 0}</p>
              </div>
              <div className="p-3 bg-blue-400 rounded-full">
                <Zap className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Reports Available</p>
                <p className="text-2xl font-bold">{usageStats.reportsAllowed || 0}</p>
              </div>
              <div className="p-3 bg-green-400 rounded-full">
                <Package className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Reports Remaining</p>
                <p className="text-2xl font-bold">{usageStats.reportsRemaining || 0}</p>
              </div>
              <div className="p-3 bg-purple-400 rounded-full">
                <Users className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Usage Progress */}
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Usage Progress</span>
            <span>
              {usageStats.reportsUsed || 0} / {usageStats.reportsAllowed || 0}
              ({Math.round(((usageStats.reportsUsed || 0) / (usageStats.reportsAllowed || 0)) * 100)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${
                needsMoreReports ? 'bg-red-500' :
                (usageStats.reportsUsed || 0) / (usageStats.reportsAllowed || 0) > 0.7 ? 'bg-yellow-500' : 'bg-[#323956]'
              }`}
              style={{
                width: `${Math.min(((usageStats.reportsUsed || 0) / (usageStats.reportsAllowed || 0)) * 100, 100)}%`
              }}
            />
          </div>
        </div>

        {/* Inline alert if usage is high */}
        {needsMoreReports && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 mr-3" />
              <div>
                <h4 className="text-sm font-medium text-red-800">Usage Alert</h4>
                <p className="text-sm text-red-700 mt-1">
                  You're running low on report credits ({usageStats.reportsRemaining} remaining). Refill now to continue using our services.
                </p>
                <button
                  onClick={handleRefillClick}
                  className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors"
                >
                  Refill Credits
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Spending Summary */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">Total Spent</h4>
              <p className="text-2xl font-bold text-[#323956]">
                {userCurrency.symbol}{(usageStats.totalSpent || 0).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Status</p>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                <CheckCircle className="h-4 w-4 mr-1" />
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleRefillClick}
            className="flex items-center p-4 border-2 border-dashed border-[#323956]/30 rounded-lg hover:border-[#323956] hover:bg-[#323956]/5 transition-colors group"
          >
            <Plus className="h-8 w-8 text-[#323956] mr-3" />
            <div className="text-left">
              <div className="font-medium text-gray-900">Refill Credits</div>
              <div className="text-sm text-gray-500">Add more report credits</div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('history')}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Clock className="h-8 w-8 text-gray-500 mr-3" />
            <div className="text-left">
              <div className="font-medium text-gray-900">Payment History</div>
              <div className="text-sm text-gray-500">View all transactions</div>
            </div>
          </button>

          <button
            onClick={() => setActiveSection('history')}
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Shield className="h-8 w-8 text-gray-500 mr-3" />
            <div className="text-left">
              <div className="font-medium text-gray-900">Billing Details</div>
              <div className="text-sm text-gray-500">Manage payment methods</div>
            </div>
          </button>
        </div>
      </div>

      {/* Pricing Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Credit Packages</h3>
            <p className="text-gray-600">
              {clinicType === 'lbl_clinic' ? 'LBL Clinic' : 'LBL Partner'} pricing
            </p>
          </div>
          <button
            onClick={handleRefillClick}
            className="bg-[#323956] text-white px-4 py-2 rounded-lg hover:bg-[#252a42] transition-colors"
          >
            Buy Credits
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {getPackages().map(pkg => (
            <div key={pkg.id} className={`relative rounded-lg p-4 flex items-center justify-between ${pkg.popular ? 'bg-[#E4EFFF] border-2 border-[#323956]' : 'bg-gray-50 border border-gray-200'}`}>
              {pkg.popular && (
                <span className="absolute -top-2.5 left-4 bg-[#323956] text-white text-xs px-2 py-0.5 rounded-full">Best Value</span>
              )}
              <div className="flex items-center">
                <div className={`p-3 rounded-full mr-4 ${pkg.popular ? 'bg-[#323956]/10' : 'bg-gray-200'}`}>
                  <Zap className={`h-6 w-6 ${pkg.popular ? 'text-[#323956]' : 'text-gray-600'}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{pkg.label}</p>
                  <p className="text-sm text-gray-500">{pkg.reports} report credits</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-[#323956]">
                  {userCurrency.symbol}{getPackagePrice(pkg).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">
                  {userCurrency.symbol}{Math.round(getPackagePrice(pkg) / pkg.reports).toLocaleString()}/report
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Refill Credits Modal
  const renderCheckoutModal = () => {
    const packages = getPackages();
    const totalPrice = selectedPackage ? getPackagePrice(selectedPackage) : 0;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Buy Report Credits</h2>
              <p className="text-gray-600">
                {clinicType === 'lbl_clinic' ? 'LBL Clinic' : 'LBL Partner'} packages
              </p>
            </div>
            <button
              onClick={() => setShowCheckout(false)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6">
            {/* Package Selection */}
            <div className="space-y-3 mb-6">
              {packages.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`relative w-full text-left rounded-xl p-4 border-2 transition-all ${
                    selectedPackage?.id === pkg.id
                      ? 'border-[#323956] bg-[#E4EFFF] shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-2.5 right-4 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">Best Value</span>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                        selectedPackage?.id === pkg.id ? 'border-[#323956]' : 'border-gray-300'
                      }`}>
                        {selectedPackage?.id === pkg.id && (
                          <div className="w-3 h-3 rounded-full bg-[#323956]" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{pkg.label}</p>
                        <p className="text-sm text-gray-500">
                          {userCurrency.symbol}{Math.round(getPackagePrice(pkg) / pkg.reports).toLocaleString()} per report
                        </p>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-[#323956]">
                      {userCurrency.symbol}{getPackagePrice(pkg).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Selected Package Summary */}
            {selectedPackage && (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                <p className="text-3xl font-bold text-[#323956]">
                  {userCurrency.symbol}{totalPrice.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedPackage.reports} report credits
                </p>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
            <button
              onClick={handlePurchase}
              disabled={processingPayment || !selectedPackage}
              className="w-full bg-[#323956] text-white py-3 rounded-xl font-semibold hover:bg-[#252a42] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5 mr-2" />
                  Pay {userCurrency.symbol}{totalPrice.toLocaleString()} with Stripe
                </>
              )}
            </button>
            <p className="text-center text-sm text-gray-500 mt-3">
              Secure payment powered by Stripe
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Low Credits Popup
  const renderLowCreditsPopup = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Low Report Credits!</h3>
        <p className="text-gray-600 mb-1">
          You have only <span className="font-bold text-red-600">{usageStats.reportsRemaining}</span> report credit{usageStats.reportsRemaining !== 1 ? 's' : ''} remaining.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Refill your credits to continue generating reports without interruption.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setShowLowCreditsPopup(false);
              setLowCreditsDismissed(true);
            }}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              setShowLowCreditsPopup(false);
              setLowCreditsDismissed(true);
              handleRefillClick();
            }}
            className="flex-1 px-4 py-2.5 bg-[#323956] text-white rounded-xl font-medium hover:bg-[#252a42] transition-colors"
          >
            Refill Credits
          </button>
        </div>
      </div>
    </div>
  );

  const renderNavigation = () => (
    <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
      <button
        onClick={() => setActiveSection('overview')}
        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
          activeSection === 'overview'
            ? 'bg-white text-[#323956] shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Overview
      </button>
      <button
        onClick={() => setActiveSection('history')}
        className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
          activeSection === 'history'
            ? 'bg-white text-[#323956] shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Payment History
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#323956]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600">Please log in to access the subscription page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subscription & Billing</h2>
          <p className="text-gray-600">Manage your EEG report credits and payments</p>
        </div>
        <button
          onClick={handleRefillClick}
          className="bg-[#323956] text-white px-4 py-2 rounded-lg hover:bg-[#252a42] transition-colors flex items-center"
        >
          <CreditCard className="h-4 w-4 mr-2" />
          Refill Credits
        </button>
      </div>

      {/* Navigation */}
      {renderNavigation()}

      {/* Content */}
      {activeSection === 'overview' && renderOverview()}
      {activeSection === 'history' && <PaymentHistory clinicId={user?.clinicId} />}

      {/* Refill Credits Modal */}
      {showCheckout && renderCheckoutModal()}

      {/* Low Credits Popup */}
      {showLowCreditsPopup && !showCheckout && renderLowCreditsPopup()}

      {/* Payment Success Modal */}
      {showSuccessModal && paymentData && (
        <PaymentSuccessModal
          paymentData={paymentData}
          packageInfo={{ name: `${selectedPackage?.reports || 0} Report Credits`, reports: selectedPackage?.reports || 0 }}
          onClose={handleSuccessModalClose}
        />
      )}
    </div>
  );
};

export default SubscriptionTab;
