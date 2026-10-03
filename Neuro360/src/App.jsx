import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { WHATSAPP_URL } from './config/whatsapp';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ContactFormProvider } from './context/ContactFormContext';
import { ProfessionalFormProvider } from './context/ProfessionalFormContext';
import { ProgramFormProvider } from './context/ProgramFormContext';
import { LocationsPopupProvider } from './context/LocationsPopupContext';
import { testSupabaseConnection } from './utils/supabaseTest';
import { guardedReload } from './utils/guardedReload';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';

// Eagerly loaded — small, critical-path auth components
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import ForgotPasswordForm from './components/auth/ForgotPasswordForm';
import ActivationPending from './components/auth/ActivationPending';
import DashboardRouter from './components/DashboardRouter';

// Lazy loaded — pages only load when navigated to
const LandingPage                = lazy(() => import('./pages/Landing.jsx'));
const AboutUs                    = lazy(() => import('./pages/AboutUs.jsx'));
const FAQ                        = lazy(() => import('./pages/FAQ.jsx'));
const ProgramJoinForm            = lazy(() => import('./pages/ProgramJoinForm.jsx'));
const ProfessionalOnboardingForm = lazy(() => import('./pages/ProfessionalOnboardingForm.jsx'));
const Science                    = lazy(() => import('./pages/Science.jsx'));
const Technicians                = lazy(() => import('./pages/Technicians.jsx'));
const GuideToBrainwaves          = lazy(() => import('./pages/GuideToBrainwaves.jsx'));
const LBWProjectUpdates          = lazy(() => import('./pages/LBWProjectUpdates.jsx'));
const LBWAssessments             = lazy(() => import('./pages/LBWAssessments.jsx'));
const LBWCoaching                = lazy(() => import('./pages/LBWCoaching.jsx'));
const LBWMainLanding             = lazy(() => import('./pages/LBWMainLanding.jsx'));
const LBWDashboard               = lazy(() => import('./pages/LBWDashboard.jsx'));
const LBWProgress                = lazy(() => import('./pages/LBWProgress.jsx'));
const LBWContent                 = lazy(() => import('./pages/LBWContent.jsx'));
const ContactForm                = lazy(() => import('./pages/ContactForm.jsx'));
const NeurosenseBooking          = lazy(() => import('./pages/NeurosenseBooking.jsx'));
const TakeAssessment             = lazy(() => import('./pages/TakeAssessment.jsx'));
const Pricing                    = lazy(() => import('./pages/Pricing.jsx'));
const CoachCertification         = lazy(() => import('./pages/CoachCertification.jsx'));
const Locations                  = lazy(() => import('./pages/Locations.jsx'));
const StaticPage                 = lazy(() => import('./pages/StaticPage'));
const SuperAdminPanel            = lazy(() => import('./components/admin/SuperAdminPanel'));
const ClinicDashboard            = lazy(() => import('./components/clinic/ClinicDashboard'));
const SubscriptionManager        = lazy(() => import('./components/clinic/SubscriptionManager'));
const PatientDashboard           = lazy(() => import('./components/patient/PatientDashboard'));
const PatientSubscription        = lazy(() => import('./pages/PatientSubscription'));

// Spinner shown while a lazy page is loading
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
    <div className="w-8 h-8 border-4 border-[#323956] border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  // Detect Stripe payment return and save URL before auth redirect happens
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasPayment = params.get('payment') === 'success' || params.get('meditation_payment') === 'success';
    if (hasPayment && window.location.pathname.includes('/dashboard')) {
      localStorage.setItem('paymentReturnUrl', window.location.pathname + window.location.search);
    }

    if (window.location.pathname === '/' || window.location.pathname === '/login') {
      const returnUrl = localStorage.getItem('paymentReturnUrl');
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('authToken');
      if (returnUrl && storedUser && storedToken) {
        localStorage.removeItem('paymentReturnUrl');
        window.location.href = returnUrl;
      }
    }
  }, []);

  // Test Supabase connection on app startup — dev only; in production it
  // burned two database round trips on every page load for a console log
  useEffect(() => {
    if (import.meta.env.PROD) return;
    const runConnectionTest = async () => {
      await testSupabaseConnection();
    };
    runConnectionTest();
  }, []);

  // Global error handler
  React.useEffect(() => {
    const handleError = (event) => {
      console.error('ALERT: Global error caught:', event.error);
      if (event.error && (
        event.error.message.includes('Loading chunk') ||
        event.error.message.includes('Failed to fetch') ||
        event.error.name === 'ChunkLoadError'
      )) {
        console.error('ALERT: Navigation/Chunk loading error detected');
        // Guarded: at most one auto-reload per minute — a deterministic render
        // error must land on the ErrorBoundary screen, not loop the page.
        guardedReload('chunk');
      }
    };

    const handleUnhandledRejection = (event) => {
      console.error('ALERT: Unhandled promise rejection:', event.reason);
      if (event.reason && (
        String(event.reason).includes('Loading chunk') ||
        String(event.reason).includes('Failed to fetch') ||
        String(event.reason).includes('Cannot read properties')
      )) {
        console.error('ALERT: Navigation promise rejection detected');
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true
            }}
          >
            <ScrollToTop />
            <ContactFormProvider>
            <ProfessionalFormProvider>
            <ProgramFormProvider>
            <LocationsPopupProvider>
            <div className="App w-full min-h-screen overflow-x-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/about-us" element={<AboutUs />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/100x-program-join" element={<ProgramJoinForm />} />
                  <Route path="/professional-onboarding" element={<ProfessionalOnboardingForm />} />
                  <Route path="/science" element={<Science />} />
                  <Route path="/technicians" element={<Technicians />} />
                  <Route path="/guide-to-brainwaves" element={<GuideToBrainwaves />} />
                  <Route path="/lbw" element={<LBWMainLanding />} />
                  <Route path="/lbw-updates" element={<LBWProjectUpdates />} />
                  <Route path="/assessments" element={<LBWAssessments />} />
                  <Route path="/coaching" element={<LBWCoaching />} />
                  <Route path="/lbw/dashboard" element={<LBWDashboard />} />
                  <Route path="/lbw/progress" element={<LBWProgress />} />
                  <Route path="/lbw/content" element={<LBWContent />} />
                  <Route path="/contact" element={<ContactForm />} />
                  <Route path="/neurosense-booking" element={<NeurosenseBooking />} />
                  <Route path="/assessment/take/:token" element={<TakeAssessment />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/coach-certification" element={<CoachCertification />} />
                  <Route path="/locations" element={<Locations />} />
                  <Route path="/page/:slug" element={<StaticPage />} />
                  <Route path="/privacy-policy" element={<StaticPage />} />
                  <Route path="/login" element={<LoginForm />} />
                  {/* Role-scoped login URLs — only the matching role can sign in here */}
                  <Route path="/patient/login" element={<LoginForm userType="patient" />} />
                  <Route path="/patients/login" element={<LoginForm userType="patient" />} />
                  <Route path="/clinic/login" element={<LoginForm userType="clinic" />} />
                  <Route path="/clinics/login" element={<LoginForm userType="clinic" />} />
                  <Route path="/admin/login" element={<LoginForm userType="admin" />} />
                  <Route path="/register" element={<RegisterForm />} />
                  <Route path="/activation-pending" element={<ActivationPending />} />
                  <Route path="/forgot-password" element={<ForgotPasswordForm />} />
                  {/* Token-based reset was never wired server-side; the working flow is the OTP one at /forgot-password */}
                  <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />

                  {/* Super Admin Routes */}
                  <Route path="/admin" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/activities" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/clinics" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/reports" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/payments" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/pricing" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/analytics" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/algorithm-processor" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/coaches" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/alerts" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/assessments" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/static-pages" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/website-payments" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/contact" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/partnership" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/investment" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/professional" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/program" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/inquiries/feedback" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/settings" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/patient-subscriptions" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/advanced-setup" element={<ProtectedRoute requiredRole="super_admin"><SuperAdminPanel /></ProtectedRoute>} />

                  {/* Clinic Routes — accept both 'clinic' and 'clinic_admin' roles */}
                  <Route path="/clinic" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/patients" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/reports" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/subscription" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/usage" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/admin" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />
                  <Route path="/clinic/settings" element={<ProtectedRoute requiredRole={['clinic', 'clinic_admin']}><ClinicDashboard /></ProtectedRoute>} />

                  {/* Patient Routes */}
                  <Route path="/patient" element={<ProtectedRoute requiredRole="patient"><PatientDashboard /></ProtectedRoute>} />
                  <Route path="/patient-dashboard" element={<ProtectedRoute requiredRole="patient"><PatientDashboard /></ProtectedRoute>} />

                  {/* Smart Dashboard Route */}
                  <Route path="/dashboard" element={<ProtectedRoute><DashboardRouter /></ProtectedRoute>} />

                  {/* Patient Subscription */}
                  <Route path="/dashboard/subscription" element={<ProtectedRoute requiredRole="patient"><PatientSubscription /></ProtectedRoute>} />

                  {/* All Patient Dashboard Routes */}
                  <Route path="/dashboard/*" element={<ProtectedRoute><PatientDashboard /></ProtectedRoute>} />

                  {/* Catch all */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>

              {/* Toast notifications */}
              <Toaster
                position="top-right"
                containerStyle={{ top: '5rem', right: '1.5rem' }}
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#fff',
                    color: '#374151',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e5e7eb',
                  },
                  success: { iconTheme: { primary: '#323956', secondary: '#fff' } },
                  error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                }}
              />

              {/* WhatsApp Floating Button */}
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-2 right-2 z-50 w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300"
                aria-label="Chat on WhatsApp"
              >
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </a>
            </div>
            </LocationsPopupProvider>
            </ProgramFormProvider>
            </ProfessionalFormProvider>
            </ContactFormProvider>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
