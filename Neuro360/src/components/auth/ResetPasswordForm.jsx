import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const ResetPasswordForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const { resetPassword, loading } = useAuth();
  const navigate = useNavigate();
  
  const token = searchParams.get('token');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
  } = useForm();

  const watchPassword = watch('password');

  const onSubmit = async (data) => {
    if (!token) {
      setError('root', { message: 'Invalid or missing reset token' });
      return;
    }

    const result = await resetPassword(token, data.password);
    if (result.success) {
      setResetSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } else {
      setError('root', { message: getFriendlyErrorMessage(result.error, 'We could not reset your password. Please try again.') });
    }
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF] py-12 px-4 sm:px-6 lg:px-8">
        <div className="auth-card animate-fade-in text-center">
          <div className="mb-8">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Password Reset!</h2>
            <p className="text-gray-600">
              Your password has been successfully reset. You'll be redirected to login shortly.
            </p>
          </div>

          <Link
            to="/login"
            className="auth-button"
          >
            Continue to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF] py-12 px-4 sm:px-6 lg:px-8">
        <div className="auth-card animate-fade-in text-center">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Invalid Link</h2>
            <p className="text-gray-600">
              This password reset link is invalid or has expired.
            </p>
          </div>

          <div className="space-y-4">
            <Link
              to="/forgot-password"
              className="auth-button"
            >
              Request New Reset Link
            </Link>

            <Link
              to="/login"
              className="block text-sm text-[#323956] hover:text-[#232D3C] font-medium"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF] py-12 px-4 sm:px-6 lg:px-8">
      <div className="auth-card animate-fade-in">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h2>
          <p className="text-gray-600">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {errors.root && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {errors.root.message}
            </div>
          )}

          {/* New Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`auth-input pl-11 pr-11 ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Enter your new password"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters',
                  },
                  pattern: {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
                    message: 'Password must contain uppercase, lowercase, number and special character',
                  },
                })}
              />
              <button
                type="button"
                className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956]"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`auth-input pl-11 pr-11 ${errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Confirm your new password"
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) =>
                    value === watchPassword || 'Passwords do not match',
                })}
              />
              <button
                type="button"
                className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956]"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Password Requirements */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</p>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• At least 8 characters long</li>
              <li>• Contains uppercase and lowercase letters</li>
              <li>• Contains at least one number</li>
              <li>• Contains at least one special character (@$!%*?&)</li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="auth-button"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Resetting password...
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>

        {/* Back to Login */}
        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="text-sm text-[#323956] hover:text-[#232D3C] font-medium"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordForm;
