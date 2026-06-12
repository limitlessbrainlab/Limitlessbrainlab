/**
 * Stripe Payment Service
 * Handles international payments via Stripe Checkout
 */

import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';

// Stripe configuration
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

class StripeService {
  constructor() {
    this.stripe = null;
    this.hasRealKeys = STRIPE_PUBLISHABLE_KEY &&
                       STRIPE_PUBLISHABLE_KEY !== 'pk_test_demo_key' &&
                       STRIPE_PUBLISHABLE_KEY.startsWith('pk_');

    if (this.hasRealKeys) {
      this.initializeStripe();
    } else {
      console.warn('WARNING: Stripe credentials not configured');
    }

    // Currency configuration by country
    this.currencyConfig = {
      US: { currency: 'USD', symbol: '$', multiplier: 1 },
      IN: { currency: 'INR', symbol: '₹', multiplier: 83 },
      GB: { currency: 'GBP', symbol: '£', multiplier: 0.79 },
      EU: { currency: 'EUR', symbol: '€', multiplier: 0.92 },
      AE: { currency: 'AED', symbol: 'AED ', multiplier: 3.67 },
      AU: { currency: 'AUD', symbol: 'A$', multiplier: 1.53 },
      CA: { currency: 'CAD', symbol: 'C$', multiplier: 1.36 },
      SG: { currency: 'SGD', symbol: 'S$', multiplier: 1.34 },
      DEFAULT: { currency: 'USD', symbol: '$', multiplier: 1 }
    };

    // EU countries for currency mapping
    this.euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'LU', 'MT', 'CY', 'SK', 'SI', 'EE', 'LV', 'LT'];
  }

  // Initialize Stripe.js
  async initializeStripe() {
    try {
      if (window.Stripe) {
        this.stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
        return this.stripe;
      }

      // Load Stripe.js dynamically
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = () => {
          if (window.Stripe) {
            this.stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
            resolve(this.stripe);
          } else {
            reject(new Error('Stripe.js loaded but not accessible'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load Stripe.js'));
        document.head.appendChild(script);
      });
    } catch (error) {
      console.error('ERROR: Failed to initialize Stripe:', error);
      throw error;
    }
  }

  // Get currency config for a country
  getCurrencyConfig(countryCode) {
    if (this.euCountries.includes(countryCode)) {
      return this.currencyConfig.EU;
    }
    return this.currencyConfig[countryCode] || this.currencyConfig.DEFAULT;
  }

  // Detect user's location and currency
  async detectUserLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      const countryCode = data.country_code;

      const currencyConfig = this.getCurrencyConfig(countryCode);
      return {
        country: countryCode,
        countryName: data.country_name,
        ...currencyConfig
      };
    } catch (error) {
      console.warn('Location detection failed, using USD as default');
      return {
        country: 'US',
        ...this.currencyConfig.DEFAULT
      };
    }
  }

  // Get subscription packages with localized pricing
  getSubscriptionPackages(currency = 'USD', multiplier = 1) {
    const basePricesUSD = {
      BASIC: 12,    // ~999 INR
      PRO: 24,      // ~1999 INR
      PREMIUM: 42,  // ~3499 INR
      ENTERPRISE: 72 // ~5999 INR
    };

    return [
      {
        id: 'BASIC',
        name: 'Basic',
        price: Math.round(basePricesUSD.BASIC * multiplier),
        currency,
        description: 'Access core protocols and exercises',
        features: [
          'ANS Reset Protocol',
          'MOVERS exercises',
          'Five Pillars program',
          '10 brain reports'
        ],
        stripePriceId: import.meta.env.VITE_STRIPE_PRICE_BASIC || null
      },
      {
        id: 'PRO',
        name: 'Pro',
        price: Math.round(basePricesUSD.PRO * multiplier),
        currency,
        description: 'Full access to protocols & audio content',
        features: [
          'Everything in Basic',
          'Frequencies library',
          'Meditations collection',
          'Supplements & Nootropics',
          '25 brain reports'
        ],
        popular: true,
        stripePriceId: import.meta.env.VITE_STRIPE_PRICE_PRO || null
      },
      {
        id: 'PREMIUM',
        name: 'Premium',
        price: Math.round(basePricesUSD.PREMIUM * multiplier),
        currency,
        description: 'Complete access with coaching & neurofeedback',
        features: [
          'Everything in Pro',
          'Brain Coach access',
          'Home Neurofeedback',
          'All assessments',
          '50 brain reports'
        ],
        stripePriceId: import.meta.env.VITE_STRIPE_PRICE_PREMIUM || null
      }
    ];
  }

  // Create Stripe Checkout Session via backend
  async createCheckoutSession(tierData, userInfo, successUrl, cancelUrl) {
    try {
      if (!this.hasRealKeys) {
        throw new Error('Payment system not configured. Please contact support.');
      }


      // If we have pre-configured Stripe Price IDs, use them
      if (tierData.stripePriceId) {
        return await this.createCheckoutWithPriceId(tierData, userInfo, successUrl, cancelUrl);
      }

      // Otherwise, create a dynamic checkout session
      const response = await fetch(`${API_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tierId: tierData.id,
          tierName: tierData.name,
          price: tierData.price,
          currency: tierData.currency || 'USD',
          customerEmail: userInfo.email,
          customerName: userInfo.name,
          successUrl: successUrl || `${window.location.origin}/dashboard?payment=success&tier=${tierData.id}`,
          cancelUrl: cancelUrl || `${window.location.origin}/dashboard/subscription?payment=cancelled`,
          metadata: {
            tier: tierData.id,
            type: 'subscription',
            user_email: userInfo.email
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      return data;
    } catch (error) {
      console.error('ERROR: Failed to create checkout session:', error);
      throw error;
    }
  }

  // Create checkout with pre-configured Price ID
  async createCheckoutWithPriceId(tierData, userInfo, successUrl, cancelUrl) {
    try {
      const response = await fetch(`${API_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: tierData.stripePriceId,
          customerEmail: userInfo.email,
          customerName: userInfo.name,
          successUrl: successUrl || `${window.location.origin}/dashboard?payment=success&tier=${tierData.id}`,
          cancelUrl: cancelUrl || `${window.location.origin}/dashboard/subscription?payment=cancelled`,
          metadata: {
            tier: tierData.id,
            type: 'subscription',
            user_email: userInfo.email
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      return data;
    } catch (error) {
      console.error('ERROR: Failed to create checkout with price ID:', error);
      throw error;
    }
  }

  // Redirect to Stripe Checkout
  async redirectToCheckout(sessionId) {
    try {
      if (!this.stripe) {
        await this.initializeStripe();
      }

      if (!this.stripe) {
        throw new Error('Stripe not initialized');
      }

      toast.loading('Redirecting to secure checkout...', { duration: 3000 });

      const { error } = await this.stripe.redirectToCheckout({
        sessionId
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('ERROR: Failed to redirect to checkout:', error);
      toast.error(getFriendlyErrorMessage(error, 'The payment page could not be opened. Please try again.'));
      throw error;
    }
  }

  // Process subscription payment (full flow)
  async processSubscriptionPayment(tierData, userInfo) {
    try {
      // Create checkout session
      const session = await this.createCheckoutSession(tierData, userInfo);

      if (session.url) {
        // Direct URL redirect (for Checkout Sessions with URL)
        window.location.href = session.url;
      } else if (session.sessionId) {
        // Use Stripe.js redirect
        await this.redirectToCheckout(session.sessionId);
      } else {
        throw new Error('Invalid checkout session response');
      }
    } catch (error) {
      console.error('ERROR: Payment processing failed:', error);
      throw error;
    }
  }

  // Verify payment success (called after redirect back)
  async verifyPaymentSuccess(sessionId) {
    try {
      const response = await fetch(`${API_URL}/stripe/verify-session/${sessionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify payment');
      }

      return data;
    } catch (error) {
      console.error('ERROR: Failed to verify payment:', error);
      throw error;
    }
  }

  // Update user subscription after successful payment
  async updateSubscriptionAfterPayment(userEmail, tierId, paymentInfo) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from('patients')
        .select('id')
        .eq('email', userEmail.toLowerCase())
        .single();

      if (fetchError || !patient) {
        throw new Error('Patient not found');
      }

      const { error: updateError } = await supabase
        .from('patients')
        .update({
          subscription_tier: tierId.toLowerCase(),
          subscription_status: 'active',
          dashboard_access: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', patient.id);

      if (updateError) {
        throw updateError;
      }

      // Log the payment
      await supabase.from('payment_history').insert({
        patient_id: patient.id,
        amount: paymentInfo.amount,
        currency: paymentInfo.currency || 'USD',
        payment_provider: 'stripe',
        payment_id: paymentInfo.paymentId || paymentInfo.sessionId,
        tier: tierId,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      console.error('ERROR: Failed to update subscription:', error);
      return { success: false, error: error.message };
    }
  }

  // Create customer portal session (for managing subscriptions)
  async createCustomerPortalSession(customerEmail) {
    try {
      const response = await fetch(`${API_URL}/stripe/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerEmail,
          returnUrl: `${window.location.origin}/dashboard/subscription`
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session');
      }

      return data;
    } catch (error) {
      console.error('ERROR: Failed to create portal session:', error);
      throw error;
    }
  }

  // Check if Stripe is available
  isAvailable() {
    return this.hasRealKeys;
  }

  // Format price with currency symbol
  formatPrice(amount, currency = 'USD') {
    const config = Object.values(this.currencyConfig).find(c => c.currency === currency)
                   || this.currencyConfig.DEFAULT;
    return `${config.symbol}${amount}`;
  }
}

export default new StripeService();
