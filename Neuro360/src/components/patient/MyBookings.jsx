import StripeService from '../../services/stripeService';
import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Video,
  MapPin,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const MyBookings = ({ limit, showTitle = true, compact = false }) => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming'); // upcoming, past, all

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

  useEffect(() => {
    if (user?.email) {
      fetchBookings();
    }
  }, [user, filter]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter === 'upcoming') {
        params.append('upcoming', 'true');
      } else if (filter === 'past') {
        params.append('status', 'completed');
      }

      const response = await fetch(`${API_URL}/bookings/${encodeURIComponent(user.email)}?${params}`, { headers: await StripeService.getCheckoutHeaders() });
      const data = await response.json();

      if (data.success) {
        let filteredBookings = data.bookings || [];

        // If no upcoming bookings found, also fetch all scheduled bookings as fallback
        if (filter === 'upcoming' && filteredBookings.length === 0) {
          const allResponse = await fetch(`${API_URL}/bookings/${encodeURIComponent(user.email)}?status=scheduled`, { headers: await StripeService.getCheckoutHeaders() });
          const allData = await allResponse.json();
          if (allData.success && allData.bookings?.length > 0) {
            filteredBookings = allData.bookings;
          }
        }

        // Additional client-side filtering for past bookings
        // Pending-schedule bookings have a placeholder (past) start_time but aren't really past.
        if (filter === 'past') {
          filteredBookings = filteredBookings.filter(b =>
            !isPendingSchedule(b) &&
            (new Date(b.start_time) < new Date() || b.status === 'completed' || b.status === 'cancelled')
          );
        }

        // Apply limit if specified
        if (limit) {
          filteredBookings = filteredBookings.slice(0, limit);
        }

        setBookings(filteredBookings);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status, startTime, pending = false) => {
    const isPast = new Date(startTime) < new Date();

    if (pending && status === 'scheduled') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <Clock className="w-3 h-3 mr-1" />
          Awaiting link
        </span>
      );
    }

    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </span>
      );
    }

    if (status === 'completed' || (status === 'scheduled' && isPast)) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </span>
      );
    }

    if (status === 'no_show') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          <AlertCircle className="w-3 h-3 mr-1" />
          No Show
        </span>
      );
    }

    // Upcoming
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <Clock className="w-3 h-3 mr-1" />
        Upcoming
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const isUpcoming = (startTime) => {
    return new Date(startTime) > new Date();
  };

  // Booking made via the new flow (no calendar): time/link will be shared by the admin later.
  // Its stored start_time is a placeholder, so don't treat it as a real scheduled time.
  const isPendingSchedule = (booking) =>
    booking.status === 'scheduled' &&
    !booking.meeting_url && !booking.calendly_event_url && !booking.calendly_reschedule_url;

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-[#323956]" />
          <span className="ml-2 text-gray-500">Loading bookings...</span>
        </div>
      </div>
    );
  }

  if (compact) {
    // Compact view for dashboard widget
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-[#323956]" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Your Scheduled Bookings</h3>
          </div>
          <button
            onClick={fetchBookings}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {bookings.length === 0 ? (
          <div className="p-6 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No upcoming sessions</p>
            <a
              href="/dashboard/brain-coach"
              className="text-[#323956] text-sm hover:underline mt-2 inline-block"
            >
              Book a session →
            </a>
          </div>
        ) : (
          <>
            <div className="p-3 sm:p-4 space-y-3">
              {bookings.map((booking) => {
                const startDate = new Date(booking.start_time);
                const now = new Date();
                const diffMs = startDate - now;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const pending = isPendingSchedule(booking);
                const isSoon = !pending && diffMs > 0 && diffHours < 24;
                const isToday = startDate.toDateString() === now.toDateString();

                return (
                  <div
                    key={booking.id}
                    className={`relative rounded-xl p-4 border-2 transition-all hover:shadow-md ${
                      isSoon
                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-300 dark:border-blue-600 shadow-blue-100 dark:shadow-blue-900/30 shadow-md'
                        : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-750 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {/* Soon/Today badge */}
                    {isSoon && (
                      <div className="absolute -top-2 right-3 px-2.5 py-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[10px] font-bold rounded-full shadow-sm">
                        {isToday ? 'TODAY' : `In ${diffHours}h`}
                      </div>
                    )}

                    <div className="flex items-start space-x-3">
                      {/* Date block */}
                      <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center ${
                        isSoon
                          ? 'bg-gradient-to-b from-blue-500 to-indigo-600 text-white shadow-lg'
                          : 'bg-[#323956] text-white'
                      }`}>
                        {pending ? (
                          <>
                            <Clock className="w-5 h-5" />
                            <span className="text-[9px] font-medium uppercase leading-none mt-1">TBD</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-medium uppercase leading-none">
                              {startDate.toLocaleDateString('en-US', { month: 'short' })}
                            </span>
                            <span className="text-xl font-bold leading-tight">
                              {startDate.getDate()}
                            </span>
                            <span className="text-[9px] uppercase leading-none opacity-80">
                              {startDate.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Coach Name & Status */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-3.5 h-3.5 text-[#323956] dark:text-blue-400" />
                            <p className="font-bold text-gray-900 dark:text-white text-sm truncate">
                              {booking.coach_name || 'Brain Coach'}
                            </p>
                          </div>
                          {getStatusBadge(booking.status, booking.start_time, pending)}
                        </div>

                        {/* Event Name */}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {booking.event_name || 'Brain Coaching Session'}
                        </p>

                        {/* Time & Details Row */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className={`flex items-center px-2 py-1 rounded-lg font-medium ${
                            isSoon
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            <Clock className="w-3 h-3 mr-1" />
                            {pending ? 'Time to be confirmed' : formatTime(booking.start_time)}
                          </span>
                          <span className="flex items-center bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-lg">
                            {booking.duration_minutes || 30} min
                          </span>
                          <span className="flex items-center bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-lg">
                            {booking.location === 'Online' ? (
                              <><Video className="w-3 h-3 mr-1" /> Online</>
                            ) : (
                              <><MapPin className="w-3 h-3 mr-1" /> {booking.location}</>
                            )}
                          </span>
                        </div>

                        {/* Action Buttons */}
                        {pending ? (
                          <div className="mt-2.5">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                              Our team will email you the session link
                            </span>
                          </div>
                        ) : isUpcoming(booking.start_time) && booking.status === 'scheduled' && (
                          <div className="flex items-center gap-2 mt-2.5">
                            {booking.meeting_url ? (
                              <a
                                href={booking.meeting_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-700 flex items-center shadow-sm transition-all"
                              >
                                <Video className="w-3 h-3 mr-1" />
                                Join Meeting
                              </a>
                            ) : booking.calendly_reschedule_url ? (
                              <a
                                href={booking.calendly_reschedule_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center transition-all"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Reschedule
                              </a>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">Meeting link will be shared soon</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* View All Link */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <a
                href="/dashboard/my-sessions"
                className="text-[#323956] text-sm font-medium hover:underline flex items-center justify-center"
              >
                View All Sessions
                <ChevronRight className="w-4 h-4 ml-1" />
              </a>
            </div>
          </>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {showTitle && (
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg">
                <Calendar className="w-6 h-6 text-[#323956]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Coaching Sessions</h2>
                <p className="text-sm text-gray-500">View and manage your scheduled sessions</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#323956]"
              >
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="all">All</option>
              </select>
              <button
                onClick={fetchBookings}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Sessions Found</h3>
          <p className="text-gray-500 mb-4">
            {filter === 'upcoming'
              ? "You don't have any upcoming coaching sessions."
              : filter === 'past'
              ? "You don't have any past sessions."
              : "You haven't booked any sessions yet."}
          </p>
          <a
            href="/dashboard/brain-coach"
            className="inline-flex items-center px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232d3c] transition-colors"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Book a Session
          </a>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {bookings.map((booking) => {
            const pending = isPendingSchedule(booking);
            return (
            <div
              key={booking.id}
              className="p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-[#323956] flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {(booking.coach_name || 'C').charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 flex-wrap gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {booking.coach_name || 'Brain Coach'}
                      </h3>
                      {getStatusBadge(booking.status, booking.start_time, pending)}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{booking.event_name || 'Brain Coaching Session'}</p>

                    <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {pending ? (
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          Session time to be confirmed
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            {formatDate(booking.start_time)}
                          </span>
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </>
                      )}
                      <span className="flex items-center">
                        {booking.location === 'Online' ? (
                          <Video className="w-4 h-4 mr-1" />
                        ) : (
                          <MapPin className="w-4 h-4 mr-1" />
                        )}
                        {booking.location || 'Online'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 sm:flex-shrink-0">
                  {pending ? (
                    <span className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Our team will email you the session link
                    </span>
                  ) : isUpcoming(booking.start_time) && booking.status === 'scheduled' && (
                    <>
                      {booking.meeting_url && (
                        <a
                          href={booking.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-[#323956] text-white text-sm rounded-lg hover:bg-[#232d3c] flex items-center"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Join Meeting
                        </a>
                      )}
                      {booking.calendly_reschedule_url && (
                        <a
                          href={booking.calendly_reschedule_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Reschedule
                        </a>
                      )}
                      {booking.calendly_cancel_url && (
                        <a
                          href={booking.calendly_cancel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 text-red-600 text-sm hover:underline"
                        >
                          Cancel
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyBookings;
