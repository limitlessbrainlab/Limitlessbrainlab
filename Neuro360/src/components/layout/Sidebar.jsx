import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Bell,
  BarChart3,
  Shield,
  Building2,
  UserPlus,
  Upload,
  Download,
  CreditCard,
  Activity,
  AlertTriangle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Brain,
  Home,
  Database,
  PieChart,
  ShieldCheck,
  Monitor,
  Cog,
  UserCheck,
  FileSpreadsheet,
  TrendingUp,
  Zap,
  Menu,
  X,
  Cpu,
  Quote,
  Sparkles,
  Footprints,
  Wind,
  Music,
  Star,
  Lock,
  Crown,
  Mail,
  ChevronDown,
  HandMetal,
  GraduationCap
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import AccessControlService, { SUBSCRIPTION_TIERS } from '../../services/accessControlService';
import { queryClient } from '../../lib/queryClient';
import { prefetchDefaultAdminReportPage } from '../../services/adminReportPageClient';

// Dr. Shweta's Daily Quotes & Affirmations
const drShwetaQuotes = [
  { quote: "Your brain is your greatest asset. Invest in it daily.", category: "motivation", author: "Dr. Shweta" },
  { quote: "Small consistent steps lead to massive brain transformation.", category: "growth", author: "Dr. Shweta" },
  { quote: "Today's neural patterns become tomorrow's reality.", category: "mindset", author: "Dr. Shweta" },
  { quote: "Your thoughts shape your brain. Choose them wisely.", category: "awareness", author: "Dr. Shweta" },
  { quote: "Every breath is an opportunity to reset your nervous system.", category: "wellness", author: "Dr. Shweta" },
  { quote: "Peak performance starts with peak brain health.", category: "performance", author: "Dr. Shweta" },
  { quote: "Neuroplasticity means it's never too late to change.", category: "hope", author: "Dr. Shweta" },
  { quote: "Feed your brain with positivity, it will reward you with clarity.", category: "positivity", author: "Dr. Shweta" },
  { quote: "Sleep is not a luxury, it's brain maintenance.", category: "sleep", author: "Dr. Shweta" },
  { quote: "Stress managed today is dementia prevented tomorrow.", category: "prevention", author: "Dr. Shweta" },
  { quote: "Your brain thrives on challenge and novelty.", category: "growth", author: "Dr. Shweta" },
  { quote: "Meditation is not escape, it's brain training.", category: "mindfulness", author: "Dr. Shweta" },
  { quote: "Connection heals the brain like nothing else.", category: "relationships", author: "Dr. Shweta" },
  { quote: "Movement is medicine for your mind.", category: "exercise", author: "Dr. Shweta" },
  { quote: "Gratitude rewires your brain for happiness.", category: "gratitude", author: "Dr. Shweta" },
  { quote: "Focus is a skill. Train it like a muscle.", category: "focus", author: "Dr. Shweta" },
  { quote: "Your brain believes what you tell it. Tell it good things.", category: "self-talk", author: "Dr. Shweta" },
  { quote: "Hydration is the simplest brain hack.", category: "nutrition", author: "Dr. Shweta" },
  { quote: "Silence is not empty, it's full of brain restoration.", category: "rest", author: "Dr. Shweta" },
  { quote: "Curiosity keeps your neurons young.", category: "learning", author: "Dr. Shweta" },
  { quote: "Breathe deeply. Your brain depends on it.", category: "breathing", author: "Dr. Shweta" },
  { quote: "Emotional regulation is cognitive liberation.", category: "emotions", author: "Dr. Shweta" },
  { quote: "Nature therapy is brain therapy.", category: "nature", author: "Dr. Shweta" },
  { quote: "Your morning routine sets your brain's tone for the day.", category: "routine", author: "Dr. Shweta" },
  { quote: "Laughter literally changes your brain chemistry.", category: "joy", author: "Dr. Shweta" },
  { quote: "Learning something new creates new neural pathways.", category: "learning", author: "Dr. Shweta" },
  { quote: "Your brain needs downtime to process and grow.", category: "rest", author: "Dr. Shweta" },
  { quote: "Music is a powerful brain optimizer.", category: "frequencies", author: "Dr. Shweta" },
  { quote: "Visualization activates the same brain regions as action.", category: "visualization", author: "Dr. Shweta" },
  { quote: "Self-compassion is not weakness, it's neural resilience.", category: "self-care", author: "Dr. Shweta" },
  { quote: "Your brain is always listening. Speak kindly to yourself.", category: "self-talk", author: "Dr. Shweta" }
];

// Dr. Roland's Daily Quotes & Affirmations (Neurofeedback focused)
const drRolandQuotes = [
  { quote: "Neurofeedback is like a mirror for your brain—see it, train it, transform it.", category: "neurofeedback", author: "Dr. Roland" },
  { quote: "Your brain already knows how to be calm. Neurofeedback helps it remember.", category: "calm", author: "Dr. Roland" },
  { quote: "Every session is a step toward a more resilient mind.", category: "resilience", author: "Dr. Roland" },
  { quote: "The brain that trains together, performs together.", category: "performance", author: "Dr. Roland" },
  { quote: "Focus isn't found, it's trained through consistent practice.", category: "focus", author: "Dr. Roland" },
  { quote: "Real-time feedback creates real-time change.", category: "neurofeedback", author: "Dr. Roland" },
  { quote: "Your brainwaves tell a story. Let's write a better chapter.", category: "transformation", author: "Dr. Roland" },
  { quote: "Calm is not the absence of stress, it's mastery over your response.", category: "calm", author: "Dr. Roland" },
  { quote: "Neurofeedback doesn't add anything to your brain—it unlocks what's already there.", category: "potential", author: "Dr. Roland" },
  { quote: "The path to peak performance runs through optimal brain states.", category: "performance", author: "Dr. Roland" },
  { quote: "Sleep quality improves when your brain learns to regulate itself.", category: "sleep", author: "Dr. Roland" },
  { quote: "Anxiety is a pattern. Patterns can be retrained.", category: "anxiety", author: "Dr. Roland" },
  { quote: "Your brain is always learning. Guide it intentionally.", category: "learning", author: "Dr. Roland" },
  { quote: "Consistency in training leads to lasting neural change.", category: "consistency", author: "Dr. Roland" },
  { quote: "The brain that observes itself begins to heal itself.", category: "awareness", author: "Dr. Roland" },
  { quote: "Neurofeedback is safe, non-invasive, and remarkably effective.", category: "safety", author: "Dr. Roland" },
  { quote: "Alpha waves bring clarity. Train your brain to access them at will.", category: "alpha", author: "Dr. Roland" },
  { quote: "Emotional balance is a skill your brain can master.", category: "emotions", author: "Dr. Roland" },
  { quote: "Every brain is unique. Your training protocol should be too.", category: "personalization", author: "Dr. Roland" },
  { quote: "The journey to brain wellness starts with a single session.", category: "beginning", author: "Dr. Roland" }
];

// Combined quotes for daily rotation
const allCoachQuotes = [...drShwetaQuotes, ...drRolandQuotes];
const preloadAdminReports = (userId) => {
  void import('../admin/PatientReports');
  void prefetchDefaultAdminReportPage(queryClient, userId).catch(() => {});
};

const Sidebar = ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isDarkMode } = useTheme();
  const [dailyQuote, setDailyQuote] = useState(null);
  const [userTier, setUserTier] = useState('FREE');
  const [expandedMenus, setExpandedMenus] = useState({});

  // Warm the default admin report page as soon as the authenticated app shell is
  // ready, so normal navigation does not begin its network request on click.
  useEffect(() => {
    if (user?.role === 'super_admin' && user?.id) preloadAdminReports(user.id);
  }, [user?.id, user?.role]);

  // Auto-expand parent menu when a child route is active
  useEffect(() => {
    if (location.pathname.startsWith('/admin/inquiries')) {
      setExpandedMenus(prev => ({ ...prev, inquiries: true }));
    }
  }, [location.pathname]);

  // Ref to track nav scroll position
  const navRef = useRef(null);
  const scrollPositionRef = useRef(0);

  // Preserve sidebar scroll position on route change and collapsed state change
  useLayoutEffect(() => {
    const savedPosition = scrollPositionRef.current;
    if (navRef.current && savedPosition > 0) {
      // Immediate restore
      navRef.current.scrollTop = savedPosition;

      // Multiple restore attempts to handle various timing issues
      requestAnimationFrame(() => {
        if (navRef.current) {
          navRef.current.scrollTop = savedPosition;
        }
      });

      // Delayed restore to handle any late resets
      const timeoutId = setTimeout(() => {
        if (navRef.current) {
          navRef.current.scrollTop = savedPosition;
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [location.pathname, collapsed]);

  // Get user's subscription tier
  useEffect(() => {
    const fetchUserTier = async () => {
      if (user?.email && user?.role !== 'super_admin' && user?.role !== 'clinic_admin') {
        try {
          const subscription = await AccessControlService.getUserSubscription(user.email);
          setUserTier(subscription.tier || 'FREE');
        } catch (error) {
          console.error('Error fetching user tier:', error);
          setUserTier('FREE');
        }
      }
    };
    fetchUserTier();
  }, [user]);

  // Get daily quote based on day of year (changes every day)
  useEffect(() => {
    const getDayOfYear = () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const diff = now - start;
      const oneDay = 1000 * 60 * 60 * 24;
      return Math.floor(diff / oneDay);
    };

    const dayOfYear = getDayOfYear();
    const quoteIndex = dayOfYear % allCoachQuotes.length;
    setDailyQuote(allCoachQuotes[quoteIndex]);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  // Define navigation items based on user role
  const getNavigationItems = () => {
    if (user?.role === 'super_admin') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/admin' },
        { id: 'clinics', label: 'Clinic/Partner Management', icon: Building2, path: '/admin/clinics' },
        { id: 'reports', label: 'Patient Reports', icon: FileSpreadsheet, path: '/admin/reports' },
        { id: 'algorithm-processor', label: 'Algorithm Processor', icon: Cpu, path: '/admin/algorithm-processor' },
        { id: 'payments', label: 'Payment History', icon: CreditCard, path: '/admin/payments' },
        { id: 'patient-subscriptions', label: 'Patient Subscriptions', icon: Crown, path: '/admin/patient-subscriptions' },
        { id: 'pricing', label: 'Pricing Management', icon: Zap, path: '/admin/pricing' },
        { id: 'advanced-setup', label: 'Patient Brain Courses', icon: GraduationCap, path: '/admin/advanced-setup' },
        { id: 'analytics', label: 'Analytics', icon: PieChart, path: '/admin/analytics' },
        { id: 'alerts', label: 'Alerts & Monitoring', icon: Monitor, path: '/admin/alerts' },
        { id: 'coaches', label: 'Coach Management', icon: Users, path: '/admin/coaches' },
        { id: 'assessments', label: 'Assessments', icon: Brain, path: '/admin/assessments' },
        { id: 'static-pages', label: 'Static Pages', icon: FileText, path: '/admin/static-pages' },
        { id: 'website-payments', label: 'Website Payments', icon: CreditCard, path: '/admin/website-payments' },
        {
          id: 'inquiries',
          label: 'Website Inquiries',
          icon: Mail,
          children: [
            { id: 'contact-inquiries', label: 'Contact Inquiries', icon: Mail, path: '/admin/inquiries/contact' },
            { id: 'partnership-inquiries', label: 'Partnership Inquiries', icon: HandMetal, path: '/admin/inquiries/partnership' },
            { id: 'investment-inquiries', label: 'Investment Inquiries', icon: TrendingUp, path: '/admin/inquiries/investment' },
            { id: 'professional-inquiries', label: 'Professional Inquiries', icon: UserPlus, path: '/admin/inquiries/professional' },
            { id: 'program-inquiries', label: 'Program Inquiries', icon: GraduationCap, path: '/admin/inquiries/program' },
            { id: 'feedback-inquiries', label: 'Patient Feedback', icon: Star, path: '/admin/inquiries/feedback' },
          ]
        },
        { id: 'settings', label: 'System Settings', icon: Cog, path: '/admin/settings' }
      ];
    } else if (user?.role === 'clinic_admin') {
      return [
        { id: 'overview', label: 'Dashboard', icon: Home, path: '/clinic' },
        { id: 'patients', label: 'Patient Management', icon: UserCheck, path: '/clinic/patients' },
        { id: 'reports', label: 'Reports & Files', icon: FileSpreadsheet, path: '/clinic/reports' },
        { id: 'subscription', label: 'Subscription', icon: CreditCard, path: '/clinic/subscription' },
        { id: 'usage', label: 'Usage Tracking', icon: TrendingUp, path: '/clinic/usage' },
        // { id: 'settings', label: 'Settings', icon: Settings, path: '/clinic/settings' } // hidden from sidebar per request
      ];
    } else {
      // Patient navigation with tier badges
      return [
        { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/dashboard' },
        { id: 'profile', label: 'Profile', icon: UserCheck, path: '/dashboard/profile' },
        { id: 'movers', label: 'Movers', icon: Footprints, path: '/dashboard/movers', tier: 'BASIC' },
        { id: 'ans-reset', label: 'ANS Reset', icon: Wind, path: '/dashboard/ans-reset', tier: 'BASIC' },
        { id: 'frequencies', label: 'Frequencies', icon: Music, path: '/dashboard/frequencies', tier: 'PRO' },
        { id: 'supplements', label: 'Supplements', icon: Zap, path: '/dashboard/supplements', tier: 'PRO' },
        { id: 'five-pillars', label: 'Five Pillars', icon: Star, path: '/dashboard/five-pillars', tier: 'BASIC' },
        { id: 'brain-coach', label: 'Neurosense Coach', icon: Users, path: '/dashboard/brain-coach', tier: 'PREMIUM' },
        { id: 'subscription', label: 'Upgrade Plan', icon: Crown, path: '/dashboard/subscription', highlight: true },
        { id: 'activity', label: 'Activity', icon: Activity, path: '/dashboard/activity' },
        { id: 'notifications', label: 'Notifications', icon: Bell, path: '/dashboard/notifications' },
        { id: 'settings', label: 'Settings', icon: Cog, path: '/dashboard/settings' }
      ];
    }
  };

  const navigationItems = getNavigationItems();

  // Check if user has access to a specific tier
  const hasAccessToTier = (requiredTier) => {
    if (!requiredTier) return true; // No tier requirement = accessible
    const tierOrder = ['FREE', 'BASIC', 'PRO', 'PREMIUM', 'ENTERPRISE'];
    const userTierIndex = tierOrder.indexOf(userTier);
    const requiredTierIndex = tierOrder.indexOf(requiredTier);
    return userTierIndex >= requiredTierIndex;
  };

  // Get tier badge color
  const getTierBadgeColor = (tier) => {
    switch (tier) {
      case 'BASIC': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'PRO': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'PREMIUM': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const isActive = (path) => {
    try {
      return location.pathname === path;
    } catch (error) {
      console.warn('Error checking active path:', error);
      return false;
    }
  };

  const getRoleColor = () => {
    switch (user?.role) {
      case 'super_admin': return 'bg-gradient-to-r from-red-50 to-pink-50 text-red-700 border-red-200 shadow-sm';
      case 'clinic_admin': return 'bg-gradient-to-r from-[#E4EFFF] to-indigo-50 text-blue-700 border-blue-200 shadow-sm';
      default: return 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border-green-200 shadow-sm';
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'super_admin': return 'Super Admin';
      case 'clinic_admin': return 'Clinic Admin';
      default: return 'User';
    }
  };

  const getDisplayName = () => {
    try {
      // For super admin with clinic name, show clinic name
      if (user?.role === 'super_admin' && user?.clinicName) {
        return user.clinicName;
      }
      // For clinic admin, show clinic name
      if (user?.role === 'clinic_admin' && user?.clinicName) {
        return user.clinicName;
      }
      // For super admin, show name (which might be clinic name)
      if (user?.role === 'super_admin' && user?.name) {
        return user.name;
      }
      // For others, show user name
      return user?.name || 'User';
    } catch (error) {
      console.error('Error getting display name:', error, user);
      return 'User';
    }
  };

  const getProfileInitial = () => {
    try {
      // For super admin with clinic name, show clinic name initial
      if (user?.role === 'super_admin' && user?.clinicName) {
        return user.clinicName.charAt(0).toUpperCase();
      }
      // For clinic admin, show clinic name initial
      if (user?.role === 'clinic_admin' && user?.clinicName) {
        return user.clinicName.charAt(0).toUpperCase();
      }
      // For super admin, show name initial (which might be clinic name)
      if (user?.role === 'super_admin' && user?.name) {
        return user.name.charAt(0).toUpperCase();
      }
      // For regular users, show name initial
      if (user?.name && typeof user.name === 'string' && user.name.length > 0) {
        return user.name.charAt(0).toUpperCase();
      }
      return 'U';
    } catch (error) {
      console.error('Error getting profile initial:', error, user);
      return 'U';
    }
  };

  // Mobile overlay
  const MobileOverlay = () => (
    <div 
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 lg:hidden ${
        mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={() => setMobileOpen(false)}
    />
  );

  return (
    <>
      {/* Mobile Overlay */}
      <MobileOverlay />
      
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 sm:top-4 sm:left-4 z-50 p-2 sm:p-3 bg-white/90 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-lg border border-white/30 lg:hidden transition-all duration-300 hover:scale-105"
      >
        {mobileOpen ? (
          <X className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600" />
        ) : (
          <Menu className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600" />
        )}
      </button>

      {/* Sidebar */}
      <div
        data-preserve-scroll="true"
        className={`
          fixed lg:relative inset-y-0 left-0 z-50
          bg-[#232D3C] border-r border-[#1a2332] shadow-lg
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-16 sm:w-20' : 'w-[260px] sm:w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col h-screen flex-shrink-0 overflow-hidden
        `}
        onMouseEnter={() => {
          // Only apply hover behavior on desktop (lg breakpoint and above)
          if (window.innerWidth >= 1024) {
            setCollapsed(false);
          }
        }}
        onMouseLeave={() => {
          // Only apply hover behavior on desktop (lg breakpoint and above)
          if (window.innerWidth >= 1024) {
            setCollapsed(true);
          }
        }}
      >

        {/* Clean Header */}
        <div className="relative p-3 sm:p-4 border-b border-[#1a2332]">

          {/* Brand Logo */}
          <div className="flex items-center justify-center">
            {!collapsed && (
              <div className="flex items-center justify-center w-full px-2">
                <img
                  src={isDarkMode ? "/footer logo.png" : "/IBW Logo.png"}
                  alt="NeuroSense360 Logo"
                  className="h-16 sm:h-20 lg:h-28 w-auto object-contain max-w-full"
                  onError={(e) => {
                    // Fallback to text if image fails to load
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                  <span className="text-white font-bold text-base">NeuroSense360</span>
                </div>
              </div>
            )}
            {collapsed && (
              <div className="flex items-center justify-center">
                <img
                  src={isDarkMode ? "/footer logo.png" : "/IBW Logo.png"}
                  alt="Logo"
                  className="h-12 w-12 object-contain"
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden w-8 h-8 bg-blue-600 rounded-lg items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Navigation */}
        <nav
          ref={navRef}
          data-preserve-scroll="true"
          className="relative flex-1 p-2 sm:p-3 space-y-0.5 sm:space-y-1 overflow-y-auto"
          style={{ scrollBehavior: 'auto' }}
          onScroll={(e) => {
            // Store scroll position when user scrolls
            scrollPositionRef.current = e.target.scrollTop;
          }}
        >
          {navigationItems.map((item) => {
            try {
              const Icon = item.icon;

              // Expandable menu with children
              if (item.children) {
                const isExpanded = expandedMenus[item.id];
                const isChildActive = item.children.some(child => isActive(child.path));

                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setExpandedMenus(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                        isChildActive
                          ? 'bg-[#1a2332] text-white'
                          : 'text-gray-300 hover:bg-[#2a3442] hover:text-white'
                      }`}
                      title={collapsed ? item.label : ''}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="ml-3 flex-1 text-left">{item.label}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </>
                      )}
                    </button>
                    {isExpanded && !collapsed && (
                      <div className="mt-0.5 ml-4 pl-3 border-l border-gray-600/40 space-y-0.5">
                        {item.children.map(child => {
                          const ChildIcon = child.icon;
                          const childActive = isActive(child.path);
                          return (
                            <Link
                              key={child.id}
                              to={child.path}
                              className={`flex items-center px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                                childActive
                                  ? 'bg-[#1a2332] text-white'
                                  : 'text-gray-400 hover:bg-[#2a3442] hover:text-white'
                              }`}
                              onClick={() => setMobileOpen(false)}
                            >
                              <ChildIcon className="h-4 w-4 flex-shrink-0" />
                              <span className="ml-2.5">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const active = isActive(item.path);
              const isLocked = item.tier && !hasAccessToTier(item.tier);
              const isHighlight = item.highlight;

              // Highlight style for upgrade link
              if (isHighlight) {
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg'
                        : 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 hover:from-yellow-500/30 hover:to-orange-500/30 border border-yellow-500/30'
                    }`}
                    title={collapsed ? item.label : ''}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="ml-3 flex items-center">
                        {item.label}
                        <Sparkles className="h-3 w-3 ml-1.5 animate-pulse" />
                      </span>
                    )}
                  </Link>
                );
              }

              // Locked feature style
              if (isLocked) {
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#1a2332] text-gray-400'
                        : 'text-gray-500 hover:bg-[#2a3442] hover:text-gray-400'
                    }`}
                    title={collapsed ? `${item.label} (${item.tier})` : ''}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0 opacity-60" />
                    {!collapsed && (
                      <div className="ml-3 flex items-center justify-between flex-1">
                        <span className="opacity-70">{item.label}</span>
                        <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded border flex items-center ${getTierBadgeColor(item.tier)}`}>
                          <Lock className="h-2.5 w-2.5 mr-0.5" />
                          {item.tier}
                        </span>
                      </div>
                    )}
                    {collapsed && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500/80 rounded-full flex items-center justify-center">
                        <Lock className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </Link>
                );
              }

              // Normal accessible item
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#1a2332] text-white'
                      : 'text-gray-300 hover:bg-[#2a3442] hover:text-white'
                  }`}
                  title={collapsed ? item.label : ''}
                  onClick={() => {
                    try {
                      setMobileOpen(false);
                    } catch (error) {
                      console.error('Navigation error:', error);
                    }
                  }}
                  onMouseEnter={item.id === 'reports' && user?.role === 'super_admin' ? () => preloadAdminReports(user.id) : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && (
                    <span className="ml-3">{item.label}</span>
                  )}
                </Link>
              );
            } catch (error) {
              console.error('Error rendering navigation item:', error);
              return null;
            }
          })}
        </nav>

        {/* Daily Quote Section - Only for patients */}
        {user?.role !== 'super_admin' && user?.role !== 'clinic_admin' && dailyQuote && !collapsed && (
          <div className="mx-2 sm:mx-3 mb-2 sm:mb-3 p-2 sm:p-3 bg-gradient-to-br from-[#F5D05D]/20 to-[#F5D05D]/5 rounded-xl border border-[#F5D05D]/30 relative overflow-hidden">
            {/* Sparkle decoration */}
            <Sparkles className="absolute top-2 right-2 h-3 sm:h-4 w-3 sm:w-4 text-[#F5D05D]/50 animate-pulse" />

            {/* Quote icon */}
            <div className="flex items-start gap-1.5 sm:gap-2 mb-1 sm:mb-2">
              <Quote className="h-3 sm:h-4 w-3 sm:w-4 text-[#F5D05D] flex-shrink-0 mt-0.5" />
              <p className="text-[10px] sm:text-xs text-gray-200 italic leading-relaxed line-clamp-3 sm:line-clamp-none">
                "{dailyQuote.quote}"
              </p>
            </div>

            {/* Author */}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[9px] sm:text-[10px] text-[#F5D05D] font-medium">— {dailyQuote.author}</span>
            </div>

            {/* Category badge */}
            <div className="mt-1 sm:mt-2">
              <span className="inline-block px-1.5 sm:px-2 py-0.5 bg-[#F5D05D]/20 text-[#F5D05D] text-[8px] sm:text-[9px] rounded-full uppercase tracking-wider font-medium">
                {dailyQuote.category}
              </span>
            </div>
          </div>
        )}

        {/* Collapsed state - show only quote icon for patients */}
        {user?.role !== 'super_admin' && user?.role !== 'clinic_admin' && collapsed && (
          <div className="mx-2 mb-3 p-2 bg-gradient-to-br from-[#F5D05D]/20 to-[#F5D05D]/5 rounded-lg border border-[#F5D05D]/30 flex justify-center" title={dailyQuote?.quote || 'Daily Quote'}>
            <Quote className="h-5 w-5 text-[#F5D05D] animate-pulse" />
          </div>
        )}

        {/* Footer */}
        <div className="relative p-2 sm:p-3 border-t border-[#1a2332] space-y-1 sm:space-y-2">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-300 hover:bg-[#2a3442] hover:text-white rounded-lg transition-colors`}
            title={collapsed ? 'Logout' : ''}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <span className="ml-3">Logout</span>
            )}
          </button>

          {!collapsed && (
            <div className="mt-3 text-center">
              <p className="text-xs text-gray-500">Version 1.0.0</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
