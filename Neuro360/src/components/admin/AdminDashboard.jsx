import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Building2, 
  FileText, 
  Banknote, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Activity,
  Clock,
  Eye,
  Shield,
  Database
} from 'lucide-react';
import DatabaseService from '../../services/databaseService';
import { buildRecentActivities, getIconColor } from './recentActivitiesHelpers';

const formatRevenue = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const CountUp = ({ value, format = (number) => Math.round(number).toLocaleString('en-IN') }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const start = previousValue.current;

    if (start === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previousValue.current = target;
      setDisplayValue(target);
      return undefined;
    }

    const startedAt = performance.now();
    let frameId;
    const animate = (now) => {
      const progress = Math.min((now - startedAt) / 700, 1);
      setDisplayValue(start + (target - start) * (1 - (1 - progress) ** 3));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        previousValue.current = target;
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <span aria-label={format(value)}><span aria-hidden="true">{format(displayValue)}</span></span>;
};

const AdminDashboard = ({ analytics = {} }) => {
  const navigate = useNavigate();
  const [realTimeData, setRealTimeData] = useState({});
  const [allClinics, setAllClinics] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [activityFilter, setActivityFilter] = useState('all');

  useEffect(() => {
    loadRealTimeData();
    // Near-real-time: new clinic registrations and payments land in the DB via
    // the backend (signup + Stripe webhook). Refresh periodically so they reflect
    // in the portal without a manual reload. Counters are now cheap head-count
    // queries, so the interval is inexpensive; the extra window-focus refetch was
    // dropped to cut sustained load.
    const interval = setInterval(loadRealTimeData, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadRealTimeData = async () => {
    try {
      // Counters used to scan whole tables (patients/reports/payments) — reports
      // pulled the full report_data JSONB per row. Now: head-only count() for
      // patients/reports, payments.amount only for the revenue sum, a small clinics
      // fetch (feeds active-count + the "total registered" subtitle + recent
      // activity), and just the 6 most-recent reports/payments for the activity
      // widget. All in parallel.
      const [clinics, totalPatientsCount, totalReportsCount, paymentAmounts, recentReports, recentPayments] = await Promise.all([
        DatabaseService.get('clinics'),
        DatabaseService.count('patients'),
        DatabaseService.count('reports'),
        DatabaseService.get('payments', { columns: 'amount' }),
        DatabaseService.get('reports', { limit: 6 }),
        DatabaseService.get('payments', { limit: 6 })
      ]);

      setAllClinics(clinics);
      setAllReports(recentReports);
      setAllPayments(recentPayments);

      // Calculate real-time analytics
      const activeClinicCount = clinics.filter(c => c.isActive).length;
      const totalRevenue = paymentAmounts.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

      setRealTimeData({
        totalClinics: activeClinicCount,
        totalPatients: totalPatientsCount,
        totalReports: totalReportsCount,
        monthlyRevenue: totalRevenue
      });

    } catch (error) {
      console.error('Error loading real-time data:', error);
    }
  };

  const stats = [
    {
      name: 'Active Clinics',
      value: realTimeData.totalClinics || 0,
      change: '+4.75%',
      changeType: 'increase',
      icon: Building2,
      color: 'blue',
      subtitle: `${allClinics.length} total registered`,
      path: '/admin/clinics'
    },
    {
      name: 'Total Patients',
      value: realTimeData.totalPatients || 0,
      change: '+54.02%',
      changeType: 'increase',
      icon: Users,
      color: 'green',
      subtitle: 'Across all clinics',
      path: '/admin/reports'
    },
    {
      name: 'Reports Generated',
      value: realTimeData.totalReports || 0,
      change: '+12.35%',
      changeType: 'increase',
      icon: FileText,
      color: 'purple',
      subtitle: 'Total system reports',
      path: '/admin/reports'
    },
    {
      name: 'Total Revenue',
      value: realTimeData.monthlyRevenue || 0,
      format: formatRevenue,
      change: '+8.12%',
      changeType: 'increase',
      icon: Banknote,
      color: 'yellow',
      subtitle: 'All time earnings',
      valueClassName: 'leading-tight break-all pr-2',
      iconClassName: 'ml-3',
      path: '/admin/payments'
    }
  ];

  // Real-time activities from actual data, newest first (widget shows 6).
  const recentActivities = buildRecentActivities(allClinics, allReports, allPayments, 6).slice(0, 5);
  const inactiveClinics = allClinics.filter((clinic) => !clinic.isActive).length;
  const filteredActivities = activityFilter === 'all'
    ? recentActivities
    : recentActivities.filter((activity) => activity.type === activityFilter);

  return (
    <div className="space-y-5">
      {/* Welcome Section - Clean Design */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard Overview
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Healthcare Management Platform
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md border border-green-200 dark:border-green-700">
              <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full"></div>
              <span className="font-medium">System Online</span>
            </div>
          </div>
        </div>
      </div>

      {inactiveClinics > 0 && (
        <button
          onClick={() => navigate('/admin/clinics')}
          className="w-full flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <span className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span><strong>{inactiveClinics} {inactiveClinics === 1 ? 'clinic needs' : 'clinics need'} attention.</strong> Review their status.</span>
          </span>
          <span className="text-sm font-semibold">Review clinics →</span>
        </button>
      )}

      {/* Stats Grid - Clean Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.name}
              onClick={() => navigate(stat.path)}
              aria-label={`View ${stat.name}`}
              type="button"
              className="w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-xl dark:hover:shadow-gray-900/20 hover:border-blue-300 dark:hover:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{stat.name}</p>
                  <p className={`text-2xl font-bold text-gray-900 dark:text-white mb-1 ${stat.valueClassName || ''}`}>
                    <CountUp value={stat.value} format={stat.format} />
                  </p>
                  {stat.subtitle && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">{stat.subtitle}</p>
                  )}

                  <div className="mt-3 flex items-center text-xs">
                    {stat.changeType === 'warning' ? (
                      <div className="flex items-center text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                        <span className="font-medium">{stat.change}</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-green-600 dark:text-green-400">
                        <TrendingUp className="h-3.5 w-3.5 mr-1" />
                        <span className="font-medium">{stat.change}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 p-2.5 rounded-lg ${stat.iconClassName || ''} ${
                  stat.color === 'blue' ? 'bg-blue-50 dark:bg-blue-900/30' :
                  stat.color === 'green' ? 'bg-green-50 dark:bg-green-900/30' :
                  stat.color === 'yellow' ? 'bg-yellow-50 dark:bg-yellow-900/30' :
                  stat.color === 'red' ? 'bg-red-50 dark:bg-red-900/30' :
                  'bg-gray-50 dark:bg-gray-700'
                }`}>
                  <Icon className={`h-5 w-5 ${
                    stat.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                    stat.color === 'green' ? 'text-green-600 dark:text-green-400' :
                    stat.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                    stat.color === 'red' ? 'text-red-600 dark:text-red-400' :
                    'text-gray-600 dark:text-gray-400'
                  }`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Overview</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">System Status</span>
              </div>
              <span className="text-sm font-semibold text-green-600 dark:text-green-400">Operational</span>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Clinics</span>
              </div>
              <button onClick={() => navigate('/admin/clinics')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                {realTimeData.totalClinics || 0} active
              </button>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Clinics Needing Attention</span>
              </div>
              <button onClick={() => navigate('/admin/clinics')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                {inactiveClinics} inactive
              </button>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Reports</span>
              </div>
              <button onClick={() => navigate('/admin/reports')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                {realTimeData.totalReports || 0} reports
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activities</h3>
            </div>
            <button
              onClick={() => navigate('/admin/activities')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              View All
            </button>
          </div>
          <div className="flex gap-2 mb-3" role="group" aria-label="Filter activities">
            {['all', 'clinic', 'report', 'payment'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActivityFilter(filter)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${activityFilter === filter ? 'bg-[#323956] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
              >
                {filter === 'all' ? 'All' : `${filter}s`}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {filteredActivities.map((activity) => {
              const Icon = activity.icon;
              return (
                <button
                  key={activity.id}
                  onClick={() => navigate(activity.type === 'clinic' ? '/admin/clinics' : activity.type === 'payment' ? '/admin/payments' : '/admin/reports')}
                  className="w-full flex items-start space-x-3 p-2.5 text-left bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <div className={`p-1.5 rounded-lg ${getIconColor(activity.color)}`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{activity.message}</p>
                    <div className="flex items-center space-x-1 mt-1">
                      <Clock className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                      <p className="text-xs text-gray-500 dark:text-gray-400">{activity.time}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filteredActivities.length && <p className="py-6 text-center text-sm text-gray-500">No {activityFilter} activity yet.</p>}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => navigate('/admin/clinics')}
            className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white text-center">Add Clinic</span>
          </button>

          <button
            onClick={() => navigate('/admin/reports')}
            className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-3">
              <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white text-center">Upload Report</span>
          </button>

          <button
            onClick={() => navigate('/admin/analytics')}
            className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-3">
              <Eye className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white text-center">View Analytics</span>
          </button>

          <button
            onClick={() => navigate('/admin/alerts')}
            className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white text-center">Check Alerts</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
