import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);

  // Safety check for AuthContext
  let login, loading;
  try {
    const auth = useAuth();
    login = auth.login;
    loading = auth.loading;
  } catch (error) {
    console.error('LoginForm: AuthContext not available', error);
    // Return a loading state while AuthContext initializes
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#323956] mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const navigate = useNavigate();
  const location = useLocation();

  // Get user type from navigation state (from landing page)
  const userTypeFromState = location.state?.userType;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm();

  const onSubmit = async (data) => {
    
    try {
      const result = await login({ ...data, userType: userTypeFromState }, 'email');

      if (result && result.success) {

        // Validate that user role matches the selected login type
        const userRole = result.user?.role;
        // super_admin can login from any tab — skip tab validation
        if (userRole !== 'super_admin') {
          if (userTypeFromState === 'patient' && userRole !== 'patient') {
            setError('root', {
              type: 'manual',
              message: 'No patient account found with these credentials. Please use Clinic Login instead.'
            });
            return;
          }
          if (userTypeFromState === 'clinic' && !['clinic', 'clinic_admin'].includes(userRole)) {
            setError('root', {
              type: 'manual',
              message: 'No clinic account found with these credentials. Please use Patient Login instead.'
            });
            return;
          }
        }

        // Determine redirect path based on user role
        let redirectPath = '/dashboard'; // Default to dashboard
        if (result.user) {
          switch (userRole) {
            case 'super_admin':
              redirectPath = '/admin';
              break;
            case 'clinic_admin':
            case 'clinic':
              redirectPath = '/clinic';
              break;
            case 'patient':
              redirectPath = '/patient-dashboard';
              break;
            default:
              redirectPath = '/dashboard'; // Fallback to dashboard
          }
        }

        // Check if there's a payment return URL (user was redirected from Stripe)
        const paymentReturnUrl = localStorage.getItem('paymentReturnUrl');
        if (paymentReturnUrl) {
          localStorage.removeItem('paymentReturnUrl');
          navigate(paymentReturnUrl, { replace: true });
        } else {
          navigate(redirectPath, { replace: true });
        }
      } else {
        setError('root', {
          type: 'manual',
          message: getFriendlyErrorMessage(result?.error, 'Invalid email or password. Please try again.')
        });
      }
    } catch (error) {
      console.error('ALERT: LoginForm: Unexpected error:', error);
      setError('root', {
        type: 'manual',
        message: getFriendlyErrorMessage(error, 'Login failed. Please try again.')
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-[#CAE0FF] to-white py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-[#323956]/30 to-[#232D3C]/30 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-[#F5D05D]/20 to-[#CAE0FF]/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-gradient-to-br from-[#323956]/20 to-[#CAE0FF]/20 rounded-full blur-2xl animate-float" style={{ animationDelay: '4s' }}></div>
      </div>
      
      <div className="auth-card animate-fade-in-up floating-elements relative z-10">
        <div className="text-center mb-6 sm:mb-8 animate-slide-up">
          <img
            src="/IBW Logo.png"
            alt="Limitless Brain Lab Logo"
            className="h-20 w-auto mx-auto mb-4"
          />
          <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2 sm:mb-3">
            {userTypeFromState === 'patient' ? 'Patient Login' :
             userTypeFromState === 'clinic' ? 'Clinic Login' :
             'Welcome Back'}
          </h2>
          <p className="text-gray-600 font-medium text-sm sm:text-base">
            Sign in to your account
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6 animate-slide-in-right" style={{ animationDelay: '0.6s' }}>
          {errors.root && (
            <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-shake shadow-lg">
              {errors.root.message}
            </div>
          )}

          {/* Email Field */}
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <label htmlFor="email" className="field-label">
              Email Address
            </label>
            <div className="relative">
              <Mail className={`input-icon ${errors.email ? 'text-red-400' : ''}`} />
              <input
                id="email"
                type="email"
                className={`auth-input ${errors.email ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="Enter your email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
              />
            </div>
            {errors.email && (
              <p className="error-message">{errors.email.message}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <div className="relative">
              <Lock className={`input-icon ${errors.password ? 'text-red-400' : ''}`} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`auth-input ${errors.password ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="Enter your password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
              />
              <button
                type="button"
                className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956] transition-colors duration-200 transform hover:scale-110"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.password && (
              <p className="error-message">{errors.password.message}</p>
            )}
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center group">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-[#323956] focus:ring-[#323956] border-gray-300 rounded transition-transform duration-200 group-hover:scale-110"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 font-medium group-hover:text-gray-900 transition-colors duration-200">
                Remember me
              </label>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-[#323956] hover:text-[#232D3C] font-semibold transition-all duration-200 hover:underline hover:underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="auth-button animate-bounce-soft" style={{ animationDelay: '0.4s' }}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="animate-pulse">Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Register Link - Show for patient users */}
        {userTypeFromState === 'patient' && (
          <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: '0.8s' }}>
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                to="/register"
                state={{
                  userType: 'patient',
                  fromLogin: true
                }}
                className="font-semibold text-[#323956] hover:text-[#232D3C] transition-all duration-200 hover:underline hover:underline-offset-4"
              >
                Register here
              </Link>
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default LoginForm;
