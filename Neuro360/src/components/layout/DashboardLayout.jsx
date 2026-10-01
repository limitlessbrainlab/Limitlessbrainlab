import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Bell, CheckCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import ProfileModal from './ProfileModal';
import NotificationService from '../../services/notificationService';
import ClinicNotificationDropdown from '../clinic/ClinicNotificationDropdown';
import TextType from './TextType';

const SUPER_ADMIN_WELCOME = ['Welcome back, Super Admin'];

const notificationDestination = (notification) => {
  if (notification.action === 'view_report' || notification.category === 'report_delivery') return '/admin/reports';
  if (notification.action === 'view_payment' || notification.category === 'payment') return '/admin/payments';
  if (notification.category === 'clinic') return '/admin/clinics';
  return '/admin/alerts';
};

const showNotificationToast = (notification, onView) => {
  const isCritical = notification.type === 'critical';
  const isWarning = notification.type === 'warning';
  const Icon = isCritical ? AlertTriangle : isWarning ? Bell : CheckCircle;
  const tone = isCritical
    ? { accent: 'bg-red-500', border: 'border-red-200', icon: 'bg-red-100 text-red-600', label: 'Critical alert' }
    : isWarning
      ? { accent: 'bg-amber-500', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-600', label: 'Warning' }
      : { accent: notification.category === 'payment' ? 'bg-violet-500' : 'bg-blue-500', border: 'border-gray-200', icon: notification.category === 'payment' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600', label: notification.category === 'payment' ? 'Payment update' : 'New notification' };

  toast.custom((toastItem) => (
    <div
      role={isCritical ? 'alert' : 'status'}
      className={`w-[360px] overflow-hidden rounded-xl border bg-white shadow-xl transition-all duration-200 ${tone.border} ${toastItem.visible ? 'motion-reduce:animate-none animate-[slideInRight_200ms_ease-out] opacity-100' : 'translate-x-6 opacity-0'}`}
    >
      <div className={`h-1 ${tone.accent}`}></div>
      <div className="flex gap-3 p-4 pb-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{tone.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{notification.title}</p>
          <p className="mt-1 text-xs text-gray-600 line-clamp-2">{notification.message}</p>
        </div>
        <button
          onClick={() => toast.dismiss(toastItem.id)}
          className="shrink-0 self-start text-gray-400 hover:text-gray-600"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5">
        <span className="text-[11px] text-gray-400">Just now</span>
        <button
          onClick={() => {
            toast.dismiss(toastItem.id);
            onView(notification);
          }}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          View details →
        </button>
      </div>
      {!isCritical && <div className={`h-1 origin-left motion-reduce:animate-none animate-toast-countdown ${tone.accent}`}></div>}
    </div>
  ), { duration: isCritical ? Infinity : 6000 });
};

const DashboardLayout = ({ children, title = 'Dashboard', customNotification = null, hideSidebar = false, headerAction = null }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showClinicNotifications, setShowClinicNotifications] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const bellRef = useRef(null);

  // Fetch unread notification count and subscribe to real-time updates
  useEffect(() => {
    if (user?.role === 'super_admin') {
      NotificationService.getUnreadCount().then(setUnreadCount);
      NotificationService.startRealtime();
      const remove = NotificationService.addListener((notification) => {
        setUnreadCount((prev) => prev + 1);
        showNotificationToast(notification, (item) => navigate(notificationDestination(item)));
      });
      return () => {
        remove();
        NotificationService.stopRealtime();
      };
    }

    if (user?.role === 'clinic_admin' && user?.clinicId) {
      NotificationService.getClinicUnreadCount(user.clinicId).then(setUnreadCount);
      const stop = NotificationService.startClinicRealtime(user.clinicId, () => {
        setUnreadCount((prev) => prev + 1);
      });
      return stop;
    }
  }, [navigate, user?.role, user?.clinicId]);

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Responsive Sidebar */}
      {!hideSidebar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Clean Professional Header */}
        <header className="flex-shrink-0 sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 lg:px-8 shadow-sm">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
              {/* Mobile menu button spacing */}
              {!hideSidebar && <div className="lg:hidden w-10 sm:w-12 flex-shrink-0"></div>}

              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                  {user?.role === 'super_admin' ? (
                    <TextType text={SUPER_ADMIN_WELCOME} typingSpeed={75} showCursor cursorCharacter="|" loop={false} />
                  ) : (
                    <>Welcome back, {user?.name || 'User'}</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {headerAction && <div className="hidden sm:block">{headerAction}</div>}

              {customNotification || (user?.role === 'super_admin' || (user?.role === 'clinic_admin' && user?.clinicId)) && (
                <div className="relative" ref={bellRef}>
                  <button
                    onClick={() => setShowClinicNotifications((prev) => !prev)}
                    aria-label="Notifications"
                    aria-expanded={showClinicNotifications}
                    className="relative p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full ring-2 ring-white dark:ring-gray-800 px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {showClinicNotifications && (
                    <ClinicNotificationDropdown
                      clinicId={user?.role === 'clinic_admin' ? user.clinicId : undefined}
                      limit={user?.role === 'super_admin' ? 5 : 20}
                      destination={user?.role === 'super_admin' ? '/admin/alerts' : '/clinic/reports'}
                      viewAllLabel={user?.role === 'super_admin' ? 'View all notifications →' : 'View all reports →'}
                      onClose={() => setShowClinicNotifications(false)}
                      onCountChange={setUnreadCount}
                    />
                  )}
                </div>
              )}

              {/* User Profile Button */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileModalOpen(true)}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt="Profile"
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      (() => {
                        try {
                          if (user?.role === 'super_admin' && user?.clinicName) {
                            return user.clinicName.charAt(0).toUpperCase();
                          }
                          if (user?.role === 'clinic_admin' && user?.clinicName) {
                            return user.clinicName.charAt(0).toUpperCase();
                          }
                          if (user?.role === 'super_admin' && user?.name) {
                            return user.name.charAt(0).toUpperCase();
                          }
                          if (user?.name && typeof user.name === 'string' && user.name.length > 0) {
                            return user.name.charAt(0).toUpperCase();
                          }
                          return 'U';
                        } catch (error) {
                          console.error('Error getting user initial in DashboardLayout:', error, user);
                          return 'U';
                        }
                      })()
                    )}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name || 'User'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
};

export default DashboardLayout;
