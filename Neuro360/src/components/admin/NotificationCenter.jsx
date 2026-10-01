import React, { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, CheckCircle, X, Settings, Filter, Download, RefreshCw, FileText, CreditCard, Building2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import NotificationService from '../../services/notificationService';
import AdminPageSkeleton from './AdminPageSkeleton';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    category: 'all'
  });
  const [alertSettings, setAlertSettings] = useState({
    warningThreshold: 80,
    criticalThreshold: 95,
    enableEmailAlerts: true,
    enablePushNotifications: true
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const filterParams = {};
      if (filters.type !== 'all') filterParams.type = filters.type;
      if (filters.status === 'unread') filterParams.isRead = false;
      if (filters.status === 'read') filterParams.isRead = true;
      if (filters.category !== 'all') filterParams.category = filters.category;

      const data = await NotificationService.getNotifications(filterParams);
      setNotifications(data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load notifications on mount and when filters change
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Real-time subscription
  useEffect(() => {
    NotificationService.startRealtime((newNotification) => {
      setNotifications((prev) => [newNotification, ...prev]);
      toast.success(newNotification.title, { icon: '🔔', duration: 4000 });
    });

    return () => NotificationService.stopRealtime();
  }, []);

  const markAsRead = async (notificationId) => {
    const success = await NotificationService.markAsRead(notificationId);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    const success = await NotificationService.markAllAsRead();
    if (success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    }
  };

  const deleteNotification = async (notificationId) => {
    const success = await NotificationService.deleteNotification(notificationId);
    if (success) {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      toast.success('Notification deleted');
    }
  };

  const handleAction = (notification) => {
    switch (notification.action) {
      case 'view_report':
        toast.success(`Opening reports for ${notification.patientName || notification.clinicName}`);
        break;
      case 'approve_clinic':
        toast.success(`Opening clinic approval for ${notification.clinicName}`);
        break;
      case 'increase_limit':
        toast.success(`Opening plan management for ${notification.clinicName}`);
        break;
      case 'view_payment':
        toast.success('Opening payment history');
        break;
      default:
        markAsRead(notification.id);
    }
  };

  const exportNotifications = () => {
    if (notifications.length === 0) {
      toast.error('No notifications to export');
      return;
    }
    const csvContent = notifications.map((n) => ({
      Type: n.type,
      Category: n.category,
      Title: n.title,
      Message: n.message,
      'Clinic Name': n.clinicName || 'N/A',
      'Patient Name': n.patientName || 'N/A',
      Timestamp: new Date(n.createdAt).toLocaleString(),
      Status: n.isRead ? 'Read' : 'Unread'
    }));

    const csvString = [
      Object.keys(csvContent[0]).join(','),
      ...csvContent.map((row) =>
        Object.values(row)
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(',')
      )
    ].join('\n');

    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notifications_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Notifications exported');
  };

  const getNotificationIcon = (type, category) => {
    if (category === 'report_delivery') return <FileText className="w-5 h-5 text-indigo-500" />;
    if (category === 'payment') return <CreditCard className="w-5 h-5 text-green-500" />;
    if (category === 'clinic') return <Building2 className="w-5 h-5 text-blue-500" />;

    switch (type) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case 'critical': return 'border-l-red-500';
      case 'warning': return 'border-l-yellow-500';
      case 'success': return 'border-l-green-500';
      default: return 'border-l-blue-500';
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'report_delivery': return 'Report';
      case 'clinic': return 'Clinic';
      case 'payment': return 'Payment';
      case 'usage': return 'Usage';
      default: return 'General';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'report_delivery': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'clinic': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'payment': return 'bg-green-50 text-green-700 border-green-200';
      case 'usage': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Center</h2>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadNotifications}
            className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={exportNotifications}
            className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors text-sm"
            >
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: notifications.length, color: 'bg-gray-50 dark:bg-gray-800' },
          { label: 'Unread', value: unreadCount, color: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Reports', value: notifications.filter((n) => n.category === 'report_delivery').length, color: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: 'Critical', value: notifications.filter((n) => n.type === 'critical').length, color: 'bg-red-50 dark:bg-red-900/20' }
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-lg p-3 text-center border dark:border-gray-700`}>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
          </div>

          <select
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
            className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Types</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            className="px-3 py-1.5 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All Categories</option>
            <option value="report_delivery">Reports</option>
            <option value="clinic">Clinics</option>
            <option value="payment">Payments</option>
            <option value="usage">Usage Alerts</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <AdminPageSkeleton rows={5} />
        ) : notifications.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-8 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No notifications found.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Notifications will appear here when reports are uploaded, clinics register, or payments are received.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${getBorderColor(notification.type)} p-4 transition-colors ${
                !notification.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.type, notification.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{notification.title}</h3>
                      {!notification.isRead && (
                        <span className="w-2 h-2 bg-[#323956] rounded-full flex-shrink-0"></span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${getCategoryColor(notification.category)}`}>
                        {getCategoryLabel(notification.category)}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2">{notification.message}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                      <span>{formatTime(notification.createdAt)}</span>
                      {notification.clinicName && <span>Clinic: {notification.clinicName}</span>}
                      {notification.patientName && <span>Patient: {notification.patientName}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {notification.action && (
                    <button
                      onClick={() => handleAction(notification)}
                      className="px-3 py-1 bg-[#323956] text-white text-xs rounded hover:bg-[#232D3C] transition-colors"
                    >
                      View
                    </button>
                  )}
                  {!notification.isRead && (
                    <button
                      onClick={() => markAsRead(notification.id)}
                      className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Read
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold dark:text-white">Notification Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Warning Threshold (%)</label>
                <input
                  type="number"
                  value={alertSettings.warningThreshold}
                  onChange={(e) => setAlertSettings((prev) => ({ ...prev, warningThreshold: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  min="1"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Critical Threshold (%)</label>
                <input
                  type="number"
                  value={alertSettings.criticalThreshold}
                  onChange={(e) => setAlertSettings((prev) => ({ ...prev, criticalThreshold: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  min="1"
                  max="100"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertSettings.enableEmailAlerts}
                    onChange={(e) => setAlertSettings((prev) => ({ ...prev, enableEmailAlerts: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm dark:text-gray-300">Enable Email Alerts</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={alertSettings.enablePushNotifications}
                    onChange={(e) => setAlertSettings((prev) => ({ ...prev, enablePushNotifications: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm dark:text-gray-300">Enable Push Notifications</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  toast.success('Settings saved');
                }}
                className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
