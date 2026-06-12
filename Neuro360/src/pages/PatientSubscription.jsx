/**
 * Patient Subscription Page
 * Allows patients to view and upgrade their subscription
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Crown,
  Check,
  X,
  Sparkles,
  ArrowLeft,
  Shield,
  Zap,
  Brain,
  Heart,
  Music,
  Users,
  Star,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AccessControlService, { SUBSCRIPTION_TIERS } from '../services/accessControlService';
import PaymentGatewayService from '../services/paymentGatewayService';
import ContactFormPopup from '../components/ContactFormPopup';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';

const PatientSubscription = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTier, setCurrentTier] = useState('FREE');
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedTier, setSelectedTier] = useState(location.state?.selectedTier || null);
  const [userLocation, setUserLocation] = useState(null);
  const [localizedPackages, setLocalizedPackages] = useState([]);
  const [showContactForm, setShowContactForm] = useState(false);

  useEffect(() => {
    loadSubscription();
    loadLocationAndPackages();
    handlePaymentCallback();
  }, [user]);

  const loadSubscription = async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }

    try {
      const subscription = await AccessControlService.getUserSubscription(user.email);
      setCurrentTier(subscription.tier);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLocationAndPackages = async () => {
    try {
      const loc = await PaymentGatewayService.getLocation();
      setUserLocation(loc);
      const packages = await PaymentGatewayService.getSubscriptionPackages();
      setLocalizedPackages(packages);
    } catch (error) {
      console.error('Error loading location:', error);
    }
  };

  // Handle payment callback from Stripe redirect
  const handlePaymentCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const tier = urlParams.get('tier');
    const sessionId = urlParams.get('session_id');

    if (payment === 'success' && tier && user?.email) {
      try {
        const result = await PaymentGatewayService.handlePaymentSuccess(
          { payment, tier, session_id: sessionId },
          user.email
        );

        if (result.success) {
          toast.success(`Successfully upgraded to ${tier}!`);
          setCurrentTier(tier);
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          // Redirect after delay
          setTimeout(() => navigate('/dashboard'), 2000);
        }
      } catch (error) {
        console.error('Payment callback error:', error);
      }
    } else if (payment === 'cancelled') {
      toast.error('Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const handleUpgrade = async (tierId) => {
    if (processingPayment) return;

    // Find the package from localized packages or fallback to SUBSCRIPTION_TIERS
    const localPkg = localizedPackages.find(p => p.id === tierId);
    const tierData = localPkg || SUBSCRIPTION_TIERS[tierId];

    if (!tierData || tierData.price === 0) {
      toast.error('Please select a paid plan to upgrade');
      return;
    }

    setProcessingPayment(true);
    setSelectedTier(tierId);

    try {
      // Use the unified payment gateway service
      const result = await PaymentGatewayService.processSubscriptionPayment(
        {
          id: tierId,
          name: tierData.name,
          price: tierData.price,
          currency: tierData.currency || (userLocation?.currency || 'INR'),
          gateway: tierData.gateway,
          reports: tierData.reports || 0
        },
        {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || ''
        },
        {
          onSuccess: async (paymentData) => {
            // Update subscription in database
            const updateResult = await AccessControlService.updateSubscription(
              user.email,
              tierId,
              {
                paymentId: paymentData.paymentId,
                amount: tierData.price,
                gateway: paymentData.gateway || tierData.gateway
              }
            );

            if (updateResult.success) {
              toast.success(`Successfully upgraded to ${tierData.name}!`);
              setCurrentTier(tierId);

              // Redirect to dashboard after 2 seconds
              setTimeout(() => {
                navigate('/dashboard');
              }, 2000);
            }
          },
          onError: (error) => {
            toast.error(getFriendlyErrorMessage(error, 'The payment could not be completed. Please try again.'));
          },
          onProcessing: () => {
            toast.loading('Redirecting to payment...', { duration: 3000 });
          }
        }
      );

      // If Stripe redirected, we don't need to do anything else here
      if (result?.redirected) {
        return;
      }
    } catch (error) {
      console.error('Payment error:', error);

      // Check if it's a configuration error
      if (error.message?.includes('not configured')) {
        toast.error('Payment system is being set up. Please contact support to complete your upgrade.', {
          duration: 5000
        });
        // Open contact form for support
        setShowContactForm(true);
      } else {
        toast.error(getFriendlyErrorMessage(error, 'The payment could not be completed. Please try again.'));
      }
    } finally {
      setProcessingPayment(false);
      setSelectedTier(null);
    }
  };

  // Get localized price for a tier
  const getLocalizedPrice = (tierId) => {
    const localPkg = localizedPackages.find(p => p.id === tierId);
    if (localPkg) {
      return { price: localPkg.price, symbol: localPkg.symbol || (userLocation?.symbol || '₹') };
    }
    // Fallback to INR prices
    const defaultPrices = { BASIC: 999, PRO: 1999, PREMIUM: 3499 };
    return { price: defaultPrices[tierId] || 0, symbol: '₹' };
  };

  const tiers = [
    {
      id: 'FREE',
      name: 'Free',
      price: 0,
      symbol: userLocation?.symbol || '₹',
      description: 'Get started with basic brain health insights',
      features: [
        'Profile & brain parameters',
        'Top 2-3 goals tracking',
        'Weekly inspiration',
        'Basic care program info',
        'About the Brain content'
      ],
      notIncluded: [
        'ANS Reset Protocol',
        'MOVERS exercises',
        'Frequencies & Meditations',
        'Brain Coach access',
        'Assessments'
      ],
      icon: Heart,
      color: 'gray',
      popular: false
    },
    {
      id: 'BASIC',
      name: 'Basic',
      ...getLocalizedPrice('BASIC'),
      description: 'Access core protocols and exercises',
      features: [
        'Everything in Free',
        'ANS Reset Protocol',
        'MOVERS exercises',
        'Five Pillars program',
        '10 brain reports'
      ],
      notIncluded: [
        'Frequencies & Meditations',
        'Supplements guide',
        'Brain Coach access',
        'Home Neurofeedback'
      ],
      icon: Zap,
      color: 'blue',
      popular: false
    },
    {
      id: 'PRO',
      name: 'Pro',
      ...getLocalizedPrice('PRO'),
      description: 'Full access to protocols & audio content',
      features: [
        'Everything in Basic',
        'Frequencies library',
        'Meditations collection',
        'Supplements & Nootropics',
        '25 brain reports',
        'Priority support'
      ],
      notIncluded: [
        'Brain Coach access',
        'Home Neurofeedback'
      ],
      icon: Star,
      color: 'purple',
      popular: true
    },
    {
      id: 'PREMIUM',
      name: 'Premium',
      ...getLocalizedPrice('PREMIUM'),
      description: 'Complete access with coaching & neurofeedback',
      features: [
        'Everything in Pro',
        'Brain Coach access',
        'Home Neurofeedback',
        'All assessments',
        '50 brain reports',
        'Dedicated support',
        'Early access to new features'
      ],
      notIncluded: [],
      icon: Crown,
      color: 'yellow',
      popular: false
    }
  ];

  const getColorClasses = (color, isSelected) => {
    const colors = {
      gray: {
        bg: 'bg-gray-100 dark:bg-gray-800',
        border: isSelected ? 'border-gray-500' : 'border-gray-200 dark:border-gray-700',
        badge: 'bg-gray-200 text-gray-700',
        button: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      },
      blue: {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: isSelected ? 'border-blue-500' : 'border-blue-200 dark:border-blue-800',
        badge: 'bg-blue-100 text-blue-700',
        button: 'bg-blue-600 text-white hover:bg-blue-700'
      },
      purple: {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: isSelected ? 'border-purple-500' : 'border-purple-200 dark:border-purple-800',
        badge: 'bg-purple-100 text-purple-700',
        button: 'bg-purple-600 text-white hover:bg-purple-700'
      },
      yellow: {
        bg: 'bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20',
        border: isSelected ? 'border-yellow-500' : 'border-yellow-200 dark:border-yellow-800',
        badge: 'bg-yellow-100 text-yellow-700',
        button: 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600'
      }
    };
    return colors[color] || colors.gray;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#323956]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] text-white py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-blue-200 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
              <Crown className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Choose Your Plan
            </h1>
            <p className="text-lg text-blue-100 max-w-2xl mx-auto">
              Unlock your brain's full potential with our comprehensive training programs
            </p>
            {currentTier !== 'FREE' && (
              <div className="mt-4 inline-flex items-center px-4 py-2 bg-white/20 rounded-full">
                <Shield className="h-4 w-4 mr-2" />
                <span>Current Plan: <strong>{currentTier}</strong></span>
              </div>
            )}
            {userLocation && (
              <div className="mt-2 text-sm text-blue-200">
                Prices shown in {userLocation.currency} • Secure Stripe Checkout
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => {
            const colors = getColorClasses(tier.color, selectedTier === tier.id);
            const isCurrentTier = currentTier === tier.id;
            const isDowngrade = tiers.findIndex(t => t.id === tier.id) < tiers.findIndex(t => t.id === currentTier);

            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl border-2 ${colors.border} ${colors.bg} overflow-hidden transition-all hover:shadow-xl ${
                  tier.popular ? 'ring-2 ring-purple-500 ring-offset-2' : ''
                }`}
              >
                {/* Popular Badge */}
                {tier.popular && (
                  <div className="absolute top-0 right-0 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}

                <div className="p-6">
                  {/* Icon & Name */}
                  <div className="flex items-center space-x-3 mb-4">
                    <div className={`p-2 rounded-xl ${colors.badge}`}>
                      <tier.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {tier.name}
                      </h3>
                      {isCurrentTier && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          Current Plan
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">
                      {tier.price === 0 ? 'Free' : `${tier.symbol || '₹'}${tier.price}`}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm">/month</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    {tier.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-3 mb-6">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                      </li>
                    ))}
                    {tier.notIncluded.map((feature, idx) => (
                      <li key={`not-${idx}`} className="flex items-start opacity-50">
                        <X className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 line-through">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <button
                    onClick={() => !isCurrentTier && !isDowngrade && handleUpgrade(tier.id)}
                    disabled={isCurrentTier || isDowngrade || processingPayment || tier.price === 0}
                    className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center space-x-2 ${
                      isCurrentTier
                        ? 'bg-green-100 text-green-700 cursor-default'
                        : isDowngrade || tier.price === 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : colors.button
                    } ${processingPayment && selectedTier === tier.id ? 'opacity-75' : ''}`}
                  >
                    {processingPayment && selectedTier === tier.id ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : isCurrentTier ? (
                      <>
                        <Check className="h-5 w-5" />
                        <span>Current Plan</span>
                      </>
                    ) : isDowngrade ? (
                      <span>Downgrade not available</span>
                    ) : tier.price === 0 ? (
                      <span>Free Forever</span>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        <span>Upgrade to {tier.name}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Features Comparison */}
        <div className="mt-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            What's Included in Each Plan
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-4 px-4 font-medium text-gray-500">Feature</th>
                  {tiers.map(tier => (
                    <th key={tier.id} className="text-center py-4 px-4 font-medium text-gray-900 dark:text-white">
                      {tier.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[
                  { name: 'Brain Parameters', tiers: ['FREE', 'BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'Weekly Inspiration', tiers: ['FREE', 'BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'Goals Tracking', tiers: ['FREE', 'BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'ANS Reset Protocol', tiers: ['BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'MOVERS Exercises', tiers: ['BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'Five Pillars', tiers: ['BASIC', 'PRO', 'PREMIUM'] },
                  { name: 'Frequencies Library', tiers: ['PRO', 'PREMIUM'] },
                  { name: 'Meditations', tiers: ['PRO', 'PREMIUM'] },
                  { name: 'Supplements Guide', tiers: ['PRO', 'PREMIUM'] },
                  { name: 'Brain Coach', tiers: ['PREMIUM'] },
                  { name: 'Home Neurofeedback', tiers: ['PREMIUM'] },
                  { name: 'All Assessments', tiers: ['PREMIUM'] }
                ].map((feature, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-4 px-4 text-gray-700 dark:text-gray-300">{feature.name}</td>
                    {tiers.map(tier => (
                      <td key={tier.id} className="py-4 px-4 text-center">
                        {feature.tiers.includes(tier.id) ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Questions?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Contact our support team for help choosing the right plan
          </p>
          <button
            onClick={() => setShowContactForm(true)}
            className="inline-flex items-center px-6 py-3 bg-[#323956] text-white font-medium rounded-xl hover:bg-[#232D3C] transition-colors"
          >
            Contact Support
            <ChevronRight className="h-5 w-5 ml-2" />
          </button>
        </div>
      </div>

      {/* Contact Form Popup */}
      <ContactFormPopup
        isOpen={showContactForm}
        onClose={() => setShowContactForm(false)}
      />
    </div>
  );
};

export default PatientSubscription;
