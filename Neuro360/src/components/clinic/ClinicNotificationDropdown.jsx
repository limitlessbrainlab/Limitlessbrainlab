import React, { useState, useEffect, useRef } from 'react';
import { Bell, FileText, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationService from '../../services/notificationService';
import toast from 'react-hot-toast';

const ClinicNotificationDropdown = ({ clinicId, onClose, onCountChange, limit = 20, destination = '/clinic/reports', viewAllLabel = 'View all reports →' }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const loadNotifications = async () => {
    const data = clinicId
      ? await NotificationService.getClinicNotifications(clinicId, { limit })
      : await NotificationService.getNotifications({ limit });
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, [clinicId, limit]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    await Promise.all(unread.map((n) => NotificationService.markAsRead(n.id)));
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onCountChange(0);
    toast.success('All notifications marked as read');
  };

  const handleClickItem = async (notification) => {
    if (!notification.isRead) {
      await NotificationService.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      const newUnread = notifications.filter((n) => !n.isRead && n.id !== notification.id).length;
      onCountChange(newUnread);
    }
    onClose();
    navigate(destination);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-12 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[#323956] dark:text-white" />
          <span className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</span>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#323956]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
            <Bell className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleClickItem(notification)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex gap-3 items-start ${
                !notification.isRead ? 'border-l-4 border-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'border-l-4 border-transparent'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${!notification.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  {notification.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {notification.message}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  {formatTime(notification.createdAt)}
                </p>
              </div>
              {!notification.isRead && (
                <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={() => { navigate(destination); onClose(); }}
            className="w-full text-center text-xs text-blue-600 dark:text-blue-400 hover:underline py-1"
          >
            {viewAllLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default ClinicNotificationDropdown;
