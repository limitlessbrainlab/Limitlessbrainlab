import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import DatabaseService from '../../services/databaseService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import DashboardLayout from '../layout/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import AdminPageSkeleton from './AdminPageSkeleton';

// Tab panels are lazy-loaded: eagerly importing all ~24 admin screens made
// this route's chunk ~1.7MB — admins downloaded every panel to view one.
const ClinicManagement = lazy(() => import('./ClinicManagement'));
const PatientReports = lazy(() => import('./PatientReports'));
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));
const AlertDashboard = lazy(() => import('./AlertDashboard'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const RecentActivities = lazy(() => import('./RecentActivities'));
const SystemSettings = lazy(() => import('./SystemSettings'));
const PaymentHistory = lazy(() => import('./PaymentHistory'));
const DataAccess = lazy(() => import('./DataAccess'));
const BrandingConfiguration = lazy(() => import('./BrandingConfiguration'));
const AdvancedAnalytics = lazy(() => import('./AdvancedAnalytics'));
const NotificationCenter = lazy(() => import('./NotificationCenter'));
const AgreementManager = lazy(() => import('./AgreementManager'));
const AlgorithmDataProcessor = lazy(() => import('./AlgorithmDataProcessor'));
const CoachManagement = lazy(() => import('./CoachManagement'));
const AssessmentManagement = lazy(() => import('./AssessmentManagement'));
const StaticPageManagement = lazy(() => import('./StaticPageManagement'));
const WebsiteInquiries = lazy(() => import('./WebsiteInquiries'));
const WebsitePayments = lazy(() => import('./WebsitePayments'));
const PatientSubscriptions = lazy(() => import('./PatientSubscriptions'));
const PricingManagement = lazy(() => import('./PricingManagement'));

const SuperAdminPanel = () => {

  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState('');
  const [error, setError] = useState(null);
  const [isMounted, setIsMounted] = useState(true);

  // Get active tab from URL pathname
  // Example: /admin/clinics -> activeTab = 'clinics'
  // Example: /admin -> activeTab = 'dashboard'
  const pathParts = location.pathname.split('/').filter(Boolean);
  const activeTab = pathParts.length > 1 ? pathParts[1] : 'dashboard';
  const urlClinic = searchParams.get('clinic') || null;

  useEffect(() => {
    try {
      // loadAnalytics also populates the clinic selector list (setClinics), so the
      // previous separate loadClinics() full-table fetch is no longer needed.
      loadAnalytics();
    } catch (error) {
      console.error('Error initializing SuperAdminPanel:', error);
      if (isMounted) {
        setError(getFriendlyErrorMessage(error, 'Failed to load the admin panel. Please refresh the page and try again.'));
        setLoading(false);
      }
    }

    // Cleanup function
    return () => {
      setIsMounted(false);
    };
  }, []);

  // Reset mounted state when component mounts
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    // Set selected clinic from URL parameter
    if (urlClinic) {
      setSelectedClinic(urlClinic);
    }
  }, [urlClinic]);

  const loadAnalytics = async () => {
    try {
      // Counters used to scan whole tables (patients/reports/payments) just for
      // .length/sum — reports pulled the full report_data JSONB per row, blocking
      // the spinner. Now: keep the small clinics list (also feeds the selector),
      // use head-only count() for patients/reports, and select only payments.amount.
      // All in parallel.
      const [clinics, totalPatients, totalReports, payments] = await Promise.all([
        DatabaseService.get('clinics'),
        DatabaseService.count('patients'),
        DatabaseService.count('reports'),
        DatabaseService.get('payments', { columns: 'amount' })
      ]);

      const data = {
        activeClinics: clinics.filter(c => c.isActive).length,
        totalClinics: clinics.length,
        totalPatients,
        totalReports,
        monthlyRevenue: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
      };

      // Only update state if component is still mounted
      if (isMounted) {
        setClinics(clinics);
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const renderContent = () => {
    try {
      
      // Clear any previous errors when switching tabs
      if (error) {
        setError(null);
      }
      
      switch (activeTab) {
        case 'dashboard':
          return <AdminDashboard analytics={analytics} />;
        case 'activities':
          return <RecentActivities />;
        case 'clinics':
          return <ClinicManagement onUpdate={loadAnalytics} />;
        case 'reports':
          return <PatientReports onUpdate={loadAnalytics} selectedClinic={selectedClinic} />;
        case 'payments':
          return <PaymentHistory selectedClinic={selectedClinic} />;
        case 'patient-subscriptions':
          return <PatientSubscriptions />;
        case 'alerts':
          return <AlertDashboard />;
        case 'pricing':
          return <PricingManagement />;
        case 'analytics':
          return <AnalyticsDashboard analytics={analytics} />;
        case 'advanced-analytics':
          return <AdvancedAnalytics />;
        case 'algorithm-processor':
          return <AlgorithmDataProcessor />;
        case 'data-access':
          return <DataAccess />;
        case 'branding':
          return <BrandingConfiguration />;
        case 'notifications':
          return <NotificationCenter />;
        case 'agreements':
          return <AgreementManager />;
        case 'coaches':
          return <CoachManagement />;
        case 'assessments':
          return <AssessmentManagement />;
        case 'static-pages':
          return <StaticPageManagement />;
        case 'website-payments':
          return <WebsitePayments />;
        case 'inquiries':
          return <WebsiteInquiries subTab={pathParts[2] || 'contact'} />;
        case 'settings':
          return <SystemSettings />;
        default:
          return <AdminDashboard analytics={analytics} />;
      }
    } catch (error) {
      console.error('ERROR: Error rendering content:', error);
      setError(getFriendlyErrorMessage(error, 'Something went wrong while loading this page. Please try again.'));
      return (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h3 className="text-red-800 dark:text-red-400 font-medium">Error Loading Content</h3>
          <p className="text-red-600 dark:text-red-400 mt-2">{error || 'Unknown error occurred'}</p>
          <div className="flex space-x-3 mt-4">
            <button
              onClick={() => {
                setError(null);
                window.location.reload();
              }}
              className="bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded hover:bg-red-700 dark:hover:bg-red-800"
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                setError(null);
                // Try to navigate to dashboard
                window.location.href = '/admin';
              }}
              className="bg-gray-600 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-700 dark:hover:bg-gray-800"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Super Admin Dashboard';
      case 'activities': return 'Recent Activities';
      case 'clinics': return 'Clinic/Partner Management';
      case 'reports': return selectedClinic ? `Patient Reports - ${clinics.find(c => c.id === selectedClinic)?.name || 'Selected Clinic'}` : 'Patient Reports';
      case 'payments': return selectedClinic ? `Payment History - ${clinics.find(c => c.id === selectedClinic)?.name || 'Selected Clinic'}` : 'Payment History';
      case 'patient-subscriptions': return 'Patient Subscriptions';
      case 'pricing': return 'Pricing Management';
      case 'alerts': return 'Alerts & Monitoring';
      case 'analytics': return 'Analytics & Reports';
      case 'advanced-analytics': return 'Advanced Analytics & Tracking';
      case 'algorithm-processor': return 'Algorithm Data Processor';
      case 'data-access': return 'Data Access Center';
      case 'branding': return 'Branding & Co-labeling';
      case 'notifications': return 'Notification Center';
      case 'agreements': return 'Agreement Management';
      case 'coaches': return 'Coach Management';
      case 'assessments': return 'Assessment Management';
      case 'static-pages': return 'Static Pages';
      case 'website-payments': return 'Website Payments';
      case 'settings': return 'System Settings';
      default: return 'Super Admin Dashboard';
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading...">
        <AdminPageSkeleton cards={3} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={getPageTitle()}
    >
      <div className="space-y-6">
        {/* Clinic Selection for Reports and Payments tabs */}
        {(activeTab === 'reports' || activeTab === 'payments') && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {activeTab === 'reports' ? 'Select Clinic for Patient Reports' : 'Select Clinic for Payment History'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedClinic
                    ? `Viewing data for: ${clinics.find(c => c.id === selectedClinic)?.name}`
                    : 'Select a clinic to view their specific data'
                  }
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <select
                  value={selectedClinic}
                  onChange={(e) => setSelectedClinic(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">All Clinics</option>
                  {clinics.map(clinic => (
                    <option key={clinic.id} value={clinic.id}>
                      {clinic.name} ({clinic.email})
                    </option>
                  ))}
                </select>
                {selectedClinic && (
                  <button
                    onClick={() => setSelectedClinic('')}
                    className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        
        <Suspense fallback={<div className="flex items-center justify-center min-h-[300px]"><div className="w-8 h-8 border-4 border-[#323956] border-t-transparent rounded-full animate-spin" /></div>}>
          {renderContent()}
        </Suspense>
      </div>
    </DashboardLayout>
  );
};

export default SuperAdminPanel;
