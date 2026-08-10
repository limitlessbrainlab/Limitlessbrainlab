import React, { useState, useEffect } from 'react';
import { X, Check, Star, Zap, Crown, AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import PaymentSuccessModal from '../payment/PaymentSuccessModal';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

// Report packages configuration
const REPORT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Pack',
    reports: 10,
    price: 999,
    priceUSD: 12,
    features: ['10 EEG brain reports', 'Basic analytics', 'Email support'],
    savings: null
  },
  {
    id: 'basic',
    name: 'Basic Pack',
    reports: 25,
    price: 1999,
    priceUSD: 24,
    features: ['25 EEG brain reports', 'Advanced analytics', 'Priority support', 'Export options'],
    savings: 'Save 20%'
  },
  {
    id: 'professional',
    name: 'Professional Pack',
    reports: 50,
    price: 3499,
    priceUSD: 42,
    features: ['50 EEG brain reports', 'Full analytics suite', 'Dedicated support', 'Custom branding', 'API access'],
    popular: true,
    savings: 'Save 30%'
  },
  {
    id: 'enterprise',
    name: 'Enterprise Pack',
    reports: 100,
    price: 5999,
    priceUSD: 72,
    features: ['100 EEG brain reports', 'Enterprise analytics', '24/7 support', 'White labeling', 'Custom integrations'],
    savings: 'Save 40%'
  }
];

const SubscriptionPopup = ({ isOpen, onClose, clinicId, currentUsage, onSubscribe, clinicInfo }) => {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPaymentData, setSuccessPaymentData] = useState(null);
  const [successPackageInfo, setSuccessPackageInfo] = useState(null);
  const [userCurrency, setUserCurrency] = useState({ currency: 'INR', symbol: '₹' });

  useEffect(() => {
    detectCurrency();
    checkPaymentSuccess();
  }, []);

  const detectCurrency = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      if (data.country_code === 'IN') {
        setUserCurrency({ currency: 'INR', symbol: '₹' });
      } else {
        setUserCurrency({ currency: 'USD', symbol: 'USD ' });
      }
    } catch {
      setUserCurrency({ currency: 'USD', symbol: 'USD ' });
    }
  };

  const checkPaymentSuccess = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const reports = urlParams.get('reports');

    if (payment === 'success' && reports) {
      toast.success(`Successfully purchased ${reports} reports!`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const getPrice = (plan) => {
    return userCurrency.currency === 'INR' ? plan.price : plan.priceUSD;
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) {
      toast.error('Please select a subscription plan');
      return;
    }

    try {
      setIsProcessing(true);

      const response = await fetch(`${API_URL}/create-report-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPlan.id,
          packageName: selectedPlan.name,
          reports: selectedPlan.reports,
          amount: getPrice(selectedPlan),
          currency: userCurrency.currency,
          customerEmail: clinicInfo?.email,
          customerName: clinicInfo?.name,
          clinicId: clinicId
        })
      });

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment processing failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const getPlanIcon = (planId) => {
    if (planId.includes('starter')) return <Star className="h-6 w-6 text-gray-500" />;
    if (planId.includes('basic')) return <Star className="h-6 w-6 text-[#323956]" />;
    if (planId.includes('professional')) return <Zap className="h-6 w-6 text-yellow-500" />;
    if (planId.includes('enterprise')) return <Crown className="h-6 w-6 text-purple-500" />;
    return <Star className="h-6 w-6 text-[#323956]" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Upgrade Your Plan</h2>
              <p className="text-gray-600">You've reached your report limit. Choose a plan to continue.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Usage Alert */}
        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mx-6 mt-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5" />
            <div className="ml-3">
              <p className="text-sm text-orange-700">
                <strong>Report Limit Reached:</strong> You've used {currentUsage}/10 reports in your trial plan.
                To continue uploading and downloading reports, please upgrade to a paid plan.
              </p>
            </div>
          </div>
        </div>

        {/* Plans */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REPORT_PACKAGES.map((plan) => (
              <div
                key={plan.id}
                className={`relative border-2 rounded-lg p-5 cursor-pointer transition-all ${
                  selectedPlan?.id === plan.id
                    ? 'border-[#323956] bg-[#323956]/5'
                    : 'border-gray-200 hover:border-gray-300'
                } ${plan.popular ? 'ring-2 ring-[#F5D05D]' : ''}`}
                onClick={() => setSelectedPlan(plan)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-[#F5D05D] text-gray-900 px-3 py-1 rounded-full text-xs font-bold">
                      POPULAR
                    </span>
                  </div>
                )}

                <div className="flex items-center space-x-2 mb-3">
                  {getPlanIcon(plan.id)}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                </div>

                <div className="mb-3">
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-bold text-gray-900">
                      {userCurrency.symbol}{getPrice(plan).toLocaleString()}
                    </span>
                  </div>
                  {plan.savings && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      {plan.savings}
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <p className="text-xl font-bold text-[#323956]">
                    {plan.reports} Reports
                  </p>
                  <p className="text-gray-500 text-xs">one-time purchase</p>
                </div>

                <ul className="space-y-2 mb-4">
                  {plan.features.slice(0, 3).map((feature, index) => (
                    <li key={index} className="flex items-center space-x-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span className="text-xs text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className={`w-full py-2 px-4 rounded-md text-center text-sm font-medium ${
                  selectedPlan?.id === plan.id
                    ? 'bg-[#323956] text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {selectedPlan?.id === plan.id ? 'Selected' : 'Select'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <p>• Secure payment via Stripe</p>
            <p>• Reports added instantly after payment</p>
            <p>• 24/7 customer support</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              onClick={handleSubscribe}
              disabled={!selectedPlan || isProcessing}
              className={`px-6 py-2 rounded-md font-medium transition-colors flex items-center ${
                selectedPlan && !isProcessing
                  ? 'bg-[#323956] text-white hover:bg-[#252a42]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay with Stripe
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Payment Success Modal */}
      {showSuccessModal && (
        <PaymentSuccessModal
          isOpen={showSuccessModal}
          paymentData={successPaymentData}
          packageInfo={successPackageInfo}
          onClose={() => {
            setShowSuccessModal(false);
            setSuccessPaymentData(null);
            setSuccessPackageInfo(null);
            setTimeout(() => {
              onClose();
            }, 500);
          }}
        />
      )}
    </div>
  );
};

export default SubscriptionPopup;
