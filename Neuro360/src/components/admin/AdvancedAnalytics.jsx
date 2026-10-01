import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Banknote,
  Calendar,
  MapPin,
  AlertTriangle,
  Activity,
  Clock,
  Target,
  Zap,
  Download,
  Filter,
  RefreshCw
} from 'lucide-react';
import DatabaseService from '../../services/databaseService';
import toast from 'react-hot-toast';
import AdminPageSkeleton from './AdminPageSkeleton';

const AdvancedAnalytics = () => {
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30'); // days
  const [selectedClinic, setSelectedClinic] = useState('all');
  const [clinics, setClinics] = useState([]);

  useEffect(() => {
    loadAnalyticsData();
    loadClinics();
  }, [dateRange, selectedClinic]);

  const loadClinics = async () => {
    try {
      const clinicsData = await DatabaseService.getAll('clinics');
      setClinics(clinicsData || []);
    } catch (error) {
      console.error('Error loading clinics:', error);
    }
  };

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);

      // In a real app, this would be API calls to analytics service
      // For now, we'll generate mock data based on actual clinic data
      const allClinics = await DatabaseService.getAll('clinics');
      const reportsData = await DatabaseService.getAll('reports');
      const paymentsData = await DatabaseService.getAll('payments') || [];

      // Honor the clinic filter — when a specific clinic is selected, scope the
      // analytics to just that clinic (otherwise the dropdown does nothing).
      const clinicsData = selectedClinic === 'all'
        ? allClinics
        : allClinics.filter(clinic => clinic.id === selectedClinic);

      const analyticsData = generateAnalytics(clinicsData, reportsData, paymentsData);
      setAnalytics(analyticsData);

    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const generateAnalytics = (clinics = [], reports = [], payments = []) => {
    const now = new Date();
    const daysBack = parseInt(dateRange);
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Filter data by date range
    const filteredReports = reports.filter(report =>
      new Date(report.createdAt) >= startDate
    );

    const filteredPayments = payments.filter(payment =>
      new Date(payment.createdAt || payment.timestamp) >= startDate
    );

    // Test metrics by clinic. Legacy reports are stored with clinic_id = NULL but
    // an org_id set (see databaseService.getReportsByClinic), so attribute by
    // clinicId OR orgId — otherwise every legacy report is dropped and counts read 0.
    const testsByClinic = clinics.map(clinic => {
      const clinicReports = filteredReports.filter(report => (report.clinicId || report.orgId) === clinic.id);
      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        location: clinic.address || 'Unknown',
        testsCompleted: clinicReports.length,
        reportsAllowed: clinic.reportsAllowed || 0,
        reportsUsed: clinic.reportsUsed || 0,
        utilizationRate: clinic.reportsAllowed ?
          ((clinic.reportsUsed || 0) / clinic.reportsAllowed * 100).toFixed(1) : 0
      };
    });

    // Revenue by clinic
    const revenueByClinic = clinics.map(clinic => {
      const clinicPayments = filteredPayments.filter(payment => payment.clinicId === clinic.id);
      const totalRevenue = clinicPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        revenue: totalRevenue,
        paymentCount: clinicPayments.length
      };
    });

    // Enhanced Location-based metrics
    const locationMetrics = testsByClinic.reduce((acc, clinic) => {
      // Parse location more thoroughly
      const locationParts = clinic.location.split(',');
      const city = locationParts[0]?.trim() || 'Unknown City';
      const state = locationParts[1]?.trim() || 'Unknown State';
      const locationKey = `${city}, ${state}`;

      if (!acc[locationKey]) {
        acc[locationKey] = {
          city,
          state,
          testsCount: 0,
          clinicsCount: 0,
          revenue: 0,
          avgTestsPerClinic: 0,
          utilizationRate: 0,
          topPerformingClinic: null
        };
      }

      acc[locationKey].testsCount += clinic.testsCompleted;
      acc[locationKey].clinicsCount += 1;

      const clinicRevenue = revenueByClinic.find(r => r.clinicId === clinic.clinicId);
      acc[locationKey].revenue += clinicRevenue?.revenue || 0;

      // Track top performing clinic in location
      if (!acc[locationKey].topPerformingClinic ||
          clinic.testsCompleted > acc[locationKey].topPerformingClinic.testsCompleted) {
        acc[locationKey].topPerformingClinic = clinic;
      }

      // Calculate averages
      acc[locationKey].avgTestsPerClinic = acc[locationKey].testsCount / acc[locationKey].clinicsCount;
      acc[locationKey].utilizationRate = acc[locationKey].clinicsCount > 0 ?
        testsByClinic
          .filter(c => c.location.includes(city))
          .reduce((sum, c) => sum + parseFloat(c.utilizationRate), 0) / acc[locationKey].clinicsCount
        : 0;

      return acc;
    }, {});

    // Utilization patterns
    const utilizationPatterns = testsByClinic.map(clinic => ({
      ...clinic,
      utilizationStatus: clinic.utilizationRate > 80 ? 'high' :
                       clinic.utilizationRate > 50 ? 'medium' : 'low',
      burnRate: clinic.reportsAllowed > 0 ?
        (clinic.reportsUsed / Math.max(1, daysBack)) : 0
    }));

    // Overall metrics
    const totalTests = filteredReports.length;
    const totalRevenue = filteredPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const totalReportsAllowed = clinics.reduce((sum, clinic) => sum + (clinic.reportsAllowed || 0), 0);
    const totalReportsUsed = clinics.reduce((sum, clinic) => sum + (clinic.reportsUsed || 0), 0);

    return {
      overview: {
        totalTests,
        totalClinics: clinics.length,
        totalRevenue,
        averageUtilization: totalReportsAllowed > 0 ?
          (totalReportsUsed / totalReportsAllowed * 100).toFixed(1) : 0,
        totalReportsAllowed,
        totalReportsUsed
      },
      testsByClinic,
      revenueByClinic,
      locationMetrics,
      utilizationPatterns,
      trends: generateTrendData(daysBack)
    };
  };

  const generateTrendData = (days) => {
    // Generate mock trend data for the last N days
    const trends = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      trends.push({
        date: date.toISOString().split('T')[0],
        tests: Math.floor(Math.random() * 20) + 5,
        revenue: Math.floor(Math.random() * 1000) + 200,
        newClinics: i % 7 === 0 ? Math.floor(Math.random() * 3) : 0
      });
    }
    return trends;
  };

  const exportAnalytics = () => {
    const csvData = generateCSVData();
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Analytics data exported successfully');
  };

  const generateCSVData = () => {
    const headers = ['Clinic Name', 'Location', 'Tests Completed', 'Reports Allowed', 'Reports Used', 'Utilization Rate', 'Revenue'];
    const rows = analytics.testsByClinic?.map(clinic => {
      const revenue = analytics.revenueByClinic?.find(r => r.clinicId === clinic.clinicId)?.revenue || 0;
      return [
        clinic.clinicName,
        clinic.location,
        clinic.testsCompleted,
        clinic.reportsAllowed,
        clinic.reportsUsed,
        `${clinic.utilizationRate}%`,
        `USD ${revenue}`
      ];
    }) || [];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  };

  if (loading) {
    return <AdminPageSkeleton cards={3} />;
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#323956]" />
              Analytics & Tracking
            </h2>
            <p className="text-gray-600 mt-1">
              Comprehensive analytics for tests, utilization, and revenue patterns
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Range Filter */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>

            {/* Clinic Filter */}
            <select
              value={selectedClinic}
              onChange={(e) => setSelectedClinic(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Clinics</option>
              {clinics.map(clinic => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>

            {/* Export Button */}
            <button
              onClick={exportAnalytics}
              className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#323956] transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            {/* Refresh Button */}
            <button
              onClick={loadAnalyticsData}
              className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#323956] transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tests</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview?.totalTests || 0}</p>
            </div>
            <div className="p-3 bg-[#CAE0FF] rounded-full">
              <FileText className="w-6 h-6 text-[#323956]" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-[#323956] mr-1" />
            <span className="text-[#323956]">+12% from last period</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Clinics</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview?.totalClinics || 0}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Users className="w-6 h-6 text-[#323956]" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-[#323956] mr-1" />
            <span className="text-[#323956]">+3 new this month</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">USD {analytics.overview?.totalRevenue?.toLocaleString() || 0}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Banknote className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <TrendingUp className="w-4 h-4 text-[#323956] mr-1" />
            <span className="text-[#323956]">+8% from last period</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Utilization</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.overview?.averageUtilization || 0}%</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Activity className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <Target className="w-4 h-4 text-[#323956] mr-1" />
            <span className="text-[#323956]">Target: 75%</span>
          </div>
        </div>
      </div>

      {/* Reports Usage Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-[#323956]" />
          Reports Usage Overview
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#323956]">
              {analytics.overview?.totalReportsAllowed || 0}
            </div>
            <div className="text-sm text-gray-600">Total Reports Purchased</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-[#323956]">
              {analytics.overview?.totalReportsUsed || 0}
            </div>
            <div className="text-sm text-gray-600">Reports Used</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">
              {(analytics.overview?.totalReportsAllowed || 0) - (analytics.overview?.totalReportsUsed || 0)}
            </div>
            <div className="text-sm text-gray-600">Reports Remaining</div>
          </div>
        </div>

        {/* Usage Progress Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Overall Usage</span>
            <span>{analytics.overview?.averageUtilization || 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-[#323956] h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, analytics.overview?.averageUtilization || 0)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Tests by Clinic */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#323956]" />
          Tests by Clinic
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Clinic</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Location</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Tests Done</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Reports Bought</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Reports Used</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Utilization</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {analytics.testsByClinic?.map((clinic, index) => {
                const utilization = parseFloat(clinic.utilizationRate);
                const statusColor = utilization > 80 ? 'text-red-600 bg-red-50' :
                                  utilization > 50 ? 'text-yellow-600 bg-yellow-50' :
                                  'text-[#323956] bg-green-50';
                const statusText = utilization > 80 ? 'High Usage' :
                                 utilization > 50 ? 'Medium Usage' :
                                 'Low Usage';

                return (
                  <tr key={clinic.clinicId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{clinic.clinicName}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {clinic.location}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-medium">{clinic.testsCompleted}</td>
                    <td className="py-3 px-4 text-center">{clinic.reportsAllowed}</td>
                    <td className="py-3 px-4 text-center">{clinic.reportsUsed}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-[#323956] h-2 rounded-full"
                            style={{ width: `${Math.min(100, utilization)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">{clinic.utilizationRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by Clinic */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-yellow-500" />
          Revenue Patterns per Clinic
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analytics.revenueByClinic?.slice(0, 6).map((clinic, index) => (
            <div key={clinic.clinicId} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800 truncate">{clinic.clinicName}</h4>
                <span className="text-xs text-gray-500">{clinic.paymentCount} payments</span>
              </div>
              <div className="text-2xl font-bold text-[#323956]">
                USD {clinic.revenue.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">
                Avg: USD {clinic.paymentCount > 0 ? (clinic.revenue / clinic.paymentCount).toFixed(0) : 0}/payment
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Location-based Analytics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-purple-500" />
          Location-based Analytics
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(analytics.locationMetrics || {}).map(([location, metrics]) => (
            <div key={location} className="bg-gradient-to-br from-[#E4EFFF] to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">{location}</h4>
                <MapPin className="w-4 h-4 text-[#323956]" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tests:</span>
                  <span className="font-medium">{metrics.testsCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Clinics:</span>
                  <span className="font-medium">{metrics.clinicsCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Revenue:</span>
                  <span className="font-medium text-[#323956]">USD {metrics.revenue?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Tests/Clinic:</span>
                  <span className="font-medium">{metrics.avgTestsPerClinic?.toFixed(1) || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Utilization:</span>
                  <span className="font-medium text-purple-600">{metrics.utilizationRate?.toFixed(1) || 0}%</span>
                </div>
                {metrics.topPerformingClinic && (
                  <div className="mt-3 pt-2 border-t border-blue-200">
                    <div className="text-xs text-gray-500">Top Performer:</div>
                    <div className="text-sm font-medium text-blue-700">
                      {metrics.topPerformingClinic.clinicName}
                    </div>
                    <div className="text-xs text-gray-600">
                      {metrics.topPerformingClinic.testsCompleted} tests
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Utilization Patterns & Alerts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          Utilization Patterns & Alerts
        </h3>

        <div className="space-y-4">
          {analytics.utilizationPatterns?.filter(clinic => clinic.utilizationRate > 70).map((clinic) => (
            <div key={clinic.clinicId} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <div>
                    <h4 className="font-medium text-gray-800">{clinic.clinicName}</h4>
                    <p className="text-sm text-gray-600">
                      High utilization rate: {clinic.utilizationRate}%
                      ({clinic.reportsUsed}/{clinic.reportsAllowed} reports used)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Burn Rate</div>
                  <div className="font-medium text-orange-600">
                    {clinic.burnRate.toFixed(1)} reports/day
                  </div>
                </div>
              </div>
            </div>
          ))}

          {analytics.utilizationPatterns?.filter(clinic => clinic.utilizationRate > 70).length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No high utilization alerts at this time</p>
            </div>
          )}
        </div>
      </div>

      {/* Trends Chart Placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#323956]" />
          Trends Over Time
        </h3>

        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Chart visualization would go here</p>
            <p className="text-sm">Showing trends for the last {dateRange} days</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnalytics;
