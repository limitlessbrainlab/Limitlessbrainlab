import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import DatabaseService from '../../services/databaseService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import ClinicManagement from './ClinicManagement';
import PatientReports from './PatientReports';
import AnalyticsDashboard from './AnalyticsDashboard';
import AlertDashboard from './AlertDashboard';
import DashboardLayout from '../layout/DashboardLayout';
import DDOLink from '../DDOLink';
import AdminDashboard from './AdminDashboard';
import SystemSettings from './SystemSettings';
import PaymentHistory from './PaymentHistory';
import DataAccess from './DataAccess';
import BrandingConfiguration from './BrandingConfiguration';
import AdvancedAnalytics from './AdvancedAnalytics';
import NotificationCenter from './NotificationCenter';
import AgreementManager from './AgreementManager';
import AlgorithmDataProcessor from './AlgorithmDataProcessor';
import PendingClinicsNotification from './PendingClinicsNotification';
import CoachManagement from './CoachManagement';
import AssessmentManagement from './AssessmentManagement';
import StaticPageManagement from './StaticPageManagement';
import WebsiteInquiries from './WebsiteInquiries';
import WebsitePayments from './WebsitePayments';
import PatientSubscriptions from './PatientSubscriptions';
import PricingManagement from './PricingManagement';
import { useAuth } from '../../contexts/AuthContext';

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
      loadAnalytics();
      loadClinics();
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

  const loadClinics = async () => {
    try {
      const clinicsData = await DatabaseService.get('clinics');
      
      // Only update state if component is still mounted
      if (isMounted) {
        setClinics(clinicsData);
      }
    } catch (error) {
      console.error('ERROR: Error loading clinics:', error);
      if (isMounted) {
        setError(getFriendlyErrorMessage(error, 'Failed to load clinics. Please try again.'));
        setClinics([]); // Set empty array to prevent further errors
      }
    }
  };

  const loadAnalytics = async () => {
    try {
      // SuperAdmin gets all system analytics
      const clinics = await DatabaseService.get('clinics');
      const patients = await DatabaseService.get('patients');
      const reports = await DatabaseService.get('reports');
      const payments = await DatabaseService.get('payments');
      
      const data = {
        activeClinics: clinics.filter(c => c.isActive).length,
        totalClinics: clinics.length,
        totalPatients: patients.length,
        totalReports: reports.length,
        monthlyRevenue: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
      };
      
      // Only update state if component is still mounted
      if (isMounted) {
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
          return <AdminDashboard analytics={analytics} onRefresh={loadAnalytics} />;
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
          return <AdminDashboard analytics={analytics} onRefresh={loadAnalytics} />;
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
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading Super Admin Panel...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={getPageTitle()}
      headerAction={<DDOLink label="DDO Admin Panel" className="text-sm" />}
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
        
        {renderContent()}
      </div>
    </DashboardLayout>
  );
};

export default SuperAdminPanel;