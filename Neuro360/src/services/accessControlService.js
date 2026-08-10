/**
 * Access Control Service
 * Manages feature access based on subscription tiers and payment status
 */

import { supabase } from '../lib/supabaseClient';

// Subscription Tiers and their features
export const SUBSCRIPTION_TIERS = {
  FREE: {
    id: 'free',
    name: 'Free',
    price: 0,
    features: [
      'welcome',
      'profile',
      'about-brain',
      'brain-parameters',
      'goals',
      'care-program-basic',
      'daily-inspiration'
    ],
    reports: 0,
    description: 'Basic access to brain health information'
  },
  BASIC: {
    id: 'basic',
    name: 'Basic',
    price: 999,
    features: [
      'welcome',
      'profile',
      'about-brain',
      'brain-parameters',
      'goals',
      'care-program-basic',
      'daily-inspiration',
      'ans-reset',
      'movers',
      'five-pillars'
    ],
    reports: 10,
    description: 'Access to core protocols and exercises'
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    price: 1999,
    features: [
      'welcome',
      'profile',
      'about-brain',
      'brain-parameters',
      'goals',
      'care-program',
      'daily-inspiration',
      'ans-reset',
      'movers',
      'five-pillars',
      'frequencies',
      'meditations',
      'supplements'
    ],
    reports: 25,
    description: 'Full access to protocols, frequencies & meditations'
  },
  PREMIUM: {
    id: 'premium',
    name: 'Premium',
    price: 3499,
    features: [
      'welcome',
      'profile',
      'about-brain',
      'brain-parameters',
      'goals',
      'care-program',
      'daily-inspiration',
      'ans-reset',
      'movers',
      'five-pillars',
      'frequencies',
      'meditations',
      'supplements',
      'brain-coach',
      'neurofeedback',
      'assessments'
    ],
    reports: 50,
    description: 'Complete access including coaching & neurofeedback'
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 5999,
    features: ['*'], // All features
    reports: 100,
    description: 'Unlimited access for clinics and organizations'
  }
};

// Feature metadata for display
export const FEATURE_METADATA = {
  'welcome': { name: 'Welcome', icon: 'Home', tier: 'FREE' },
  'profile': { name: 'Profile', icon: 'User', tier: 'FREE' },
  'about-brain': { name: 'About the Brain', icon: 'Brain', tier: 'FREE' },
  'brain-parameters': { name: 'Brain Parameters', icon: 'Activity', tier: 'FREE' },
  'goals': { name: 'Top 2-3 Goals', icon: 'Target', tier: 'FREE' },
  'care-program-basic': { name: 'Care Program (Basic)', icon: 'Heart', tier: 'FREE' },
  'care-program': { name: 'Customized Care Program', icon: 'Heart', tier: 'PRO' },
  'daily-inspiration': { name: 'Weekly Inspiration', icon: 'Sparkles', tier: 'FREE' },
  'ans-reset': { name: 'ANS Reset Protocol', icon: 'Wind', tier: 'BASIC' },
  'movers': { name: 'MOVERS', icon: 'Footprints', tier: 'BASIC' },
  'five-pillars': { name: 'Five Pillars', icon: 'Star', tier: 'BASIC' },
  'frequencies': { name: 'Frequencies', icon: 'Music', tier: 'PRO' },
  'meditations': { name: 'Meditations', icon: 'Brain', tier: 'PRO' },
  'supplements': { name: 'Supplements & Nootropics', icon: 'Pill', tier: 'PRO' },
  'brain-coach': { name: 'Brain Coach', icon: 'Users', tier: 'PREMIUM' },
  'neurofeedback': { name: 'Home Neurofeedback', icon: 'Zap', tier: 'PREMIUM' },
  'assessments': { name: 'Assessments', icon: 'ClipboardList', tier: 'PREMIUM' }
};

class AccessControlService {
  constructor() {
    this.cachedAccess = null;
    this.cacheExpiry = null;
  }

  /**
   * Get user's current subscription tier
   * @param {string} userEmail - User's email
   * @returns {Promise<Object>} Subscription info
   */
  async getUserSubscription(userEmail) {
    try {
      // Check patient's subscription status. Duplicate-email rows exist, so
      // .single() would throw — take the newest row instead.
      const { data: patientRows, error } = await supabase
        .from('patients')
        .select('id, subscription_status, subscription_tier, reports_unlocked, dashboard_access, clinic_id')
        .eq('email', userEmail.toLowerCase())
        .order('created_at', { ascending: false })
        .limit(1);
      const patient = patientRows?.[0];

      if (error || !patient) {
        // Default to free tier if no patient found
        return {
          tier: 'FREE',
          tierData: SUBSCRIPTION_TIERS.FREE,
          reportsUnlocked: false,
          dashboardAccess: false,
          clinicId: null
        };
      }

      // Determine tier from subscription_tier or subscription_status
      let tier = 'FREE';
      if (patient.subscription_tier) {
        tier = patient.subscription_tier.toUpperCase();
      } else if (patient.subscription_status === 'active') {
        tier = 'BASIC';
      } else if (patient.subscription_status === 'premium') {
        tier = 'PREMIUM';
      }

      // Validate tier exists
      if (!SUBSCRIPTION_TIERS[tier]) {
        tier = 'FREE';
      }

      return {
        tier,
        tierData: SUBSCRIPTION_TIERS[tier],
        reportsUnlocked: patient.reports_unlocked || false,
        dashboardAccess: patient.dashboard_access || false,
        clinicId: patient.clinic_id,
        reportsIncluded: SUBSCRIPTION_TIERS[tier]?.reports || 0
      };
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return {
        tier: 'FREE',
        tierData: SUBSCRIPTION_TIERS.FREE,
        reportsUnlocked: false,
        dashboardAccess: false,
        clinicId: null,
        reportsIncluded: 0
      };
    }
  }

  /**
   * Check if user has access to a specific feature
   * @param {string} userEmail - User's email
   * @param {string} featureId - Feature identifier
   * @returns {Promise<Object>} Access result with reason
   */
  async checkFeatureAccess(userEmail, featureId) {
    try {
      const subscription = await this.getUserSubscription(userEmail);
      const { tier, tierData } = subscription;

      // Enterprise tier has access to everything
      if (tier === 'ENTERPRISE' || tierData.features.includes('*')) {
        return {
          hasAccess: true,
          tier,
          reason: 'Enterprise access',
          upgradeRequired: null
        };
      }

      // Check if feature is in user's tier
      const hasAccess = tierData.features.includes(featureId);

      // Find minimum tier required for this feature
      const featureMeta = FEATURE_METADATA[featureId];
      const requiredTier = featureMeta?.tier || 'FREE';

      return {
        hasAccess,
        tier,
        reason: hasAccess ? 'Included in subscription' : `Requires ${requiredTier} or higher`,
        upgradeRequired: hasAccess ? null : requiredTier,
        featureName: featureMeta?.name || featureId
      };
    } catch (error) {
      console.error('Error checking feature access:', error);
      return {
        hasAccess: false,
        tier: 'FREE',
        reason: 'Error checking access',
        upgradeRequired: 'BASIC'
      };
    }
  }

  /**
   * Get all accessible features for a user
   * @param {string} userEmail - User's email
   * @returns {Promise<Array>} List of accessible feature IDs
   */
  async getAccessibleFeatures(userEmail) {
    try {
      const subscription = await this.getUserSubscription(userEmail);
      const { tierData } = subscription;

      if (tierData.features.includes('*')) {
        return Object.keys(FEATURE_METADATA);
      }

      return tierData.features;
    } catch (error) {
      console.error('Error getting accessible features:', error);
      return SUBSCRIPTION_TIERS.FREE.features;
    }
  }

  /**
   * Get locked features for a user (features they don't have access to)
   * @param {string} userEmail - User's email
   * @returns {Promise<Array>} List of locked feature IDs with upgrade info
   */
  async getLockedFeatures(userEmail) {
    try {
      const accessibleFeatures = await this.getAccessibleFeatures(userEmail);
      const allFeatures = Object.keys(FEATURE_METADATA);

      return allFeatures
        .filter(f => !accessibleFeatures.includes(f))
        .map(featureId => ({
          id: featureId,
          ...FEATURE_METADATA[featureId],
          requiredTier: FEATURE_METADATA[featureId]?.tier || 'BASIC'
        }));
    } catch (error) {
      console.error('Error getting locked features:', error);
      return [];
    }
  }

  /**
   * Update user's subscription tier
   * @param {string} userEmail - User's email
   * @param {string} newTier - New tier ID
   * @param {Object} paymentInfo - Payment details
   * @returns {Promise<Object>} Update result
   */
  async updateSubscription(userEmail, newTier, paymentInfo = {}) {
    try {
      const tierData = SUBSCRIPTION_TIERS[newTier.toUpperCase()];
      if (!tierData) {
        throw new Error('Invalid subscription tier');
      }

      const { data, error } = await supabase
        .from('patients')
        .update({
          subscription_tier: newTier.toLowerCase(),
          subscription_status: 'active',
          dashboard_access: true,
          reports_unlocked: tierData.reports > 0,
          updated_at: new Date().toISOString()
        })
        .eq('email', userEmail.toLowerCase())
        .select()
        .single();

      if (error) throw error;

      // Log the subscription change
      await this.logAccessEvent(userEmail, 'SUBSCRIPTION_UPGRADE', {
        newTier,
        paymentInfo
      });

      return {
        success: true,
        data,
        tier: newTier,
        features: tierData.features
      };
    } catch (error) {
      console.error('Error updating subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log access event for audit trail
   * @param {string} userEmail - User's email
   * @param {string} action - Action type
   * @param {Object} metadata - Additional data
   */
  async logAccessEvent(userEmail, action, metadata = {}) {
    try {
      await supabase.from('access_logs').insert({
        user_email: userEmail,
        action,
        resource_type: 'subscription',
        metadata,
        accessed_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging access event:', error);
    }
  }

  /**
   * Get upgrade options for a user
   * @param {string} currentTier - User's current tier
   * @returns {Array} Available upgrade tiers
   */
  getUpgradeOptions(currentTier) {
    const tierOrder = ['FREE', 'BASIC', 'PRO', 'PREMIUM', 'ENTERPRISE'];
    const currentIndex = tierOrder.indexOf(currentTier.toUpperCase());

    if (currentIndex === -1 || currentIndex >= tierOrder.length - 1) {
      return [];
    }

    return tierOrder
      .slice(currentIndex + 1)
      .map(tier => ({
        id: tier,
        ...SUBSCRIPTION_TIERS[tier]
      }));
  }

  /**
   * Check if profile is complete (required for feature access)
   * @param {Object} user - User object
   * @returns {boolean} Profile completion status
   */
  isProfileComplete(user) {
    if (!user) return false;
    return !!(user.name && user.email && user.phone && user.address);
  }
}

// Export singleton instance
export default new AccessControlService();
