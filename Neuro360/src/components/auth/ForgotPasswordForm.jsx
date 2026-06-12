import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import DatabaseService from '../../services/databaseService';
import SupabaseService from '../../services/supabaseService';
import { hashPassword } from '../../utils/passwordUtils';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ForgotPasswordForm = () => {
  const [step, setStep] = useState(1); // 1=email, 2=otp, 3=new password
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [accountType, setAccountType] = useState(null);
  const [account, setAccount] = useState(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors }, setError, watch } = useForm();

  // Step 1: Verify email exists and send OTP
  const handleSendOtp = async (data) => {
    try {
      setIsLoading(true);
      const normalizedEmail = data.email.trim().toLowerCase();
      let foundAccount = null;
      let foundType = null;

      // Check clinics table
      const clinics = await DatabaseService.get('clinics') || [];
      const clinic = clinics.find(c => c.email === normalizedEmail);
      if (clinic) {
        foundType = 'clinic';
        foundAccount = clinic;
      }

      // Check patients table
      if (!foundAccount) {
        const supabase = SupabaseService.supabase;
        if (supabase && SupabaseService.isAvailable()) {
          const { data: patients, error } = await supabase
            .from('patients')
            .select('*')
            .eq('email', normalizedEmail);
          if (!error && patients && patients.length > 0) {
            foundType = 'patient';
            foundAccount = patients[0];
          }
        }
      }

      if (!foundAccount) {
        setError('root', { message: 'No account found with this email address' });
        setIsLoading(false);
        return;
      }

      setAccountType(foundType);
      setAccount(foundAccount);

      // Send OTP
      const response = await fetch(`${API_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const result = await response.json();

      if (result.success) {
        setEmail(normalizedEmail);
        setStep(2);
        toast.success('OTP sent to your email!');
      } else {
        setError('root', { message: getFriendlyErrorMessage(result.message, 'We could not send the OTP. Please try again.') });
      }
    } catch (err) {
      setError('root', { message: getFriendlyErrorMessage(err, 'We could not send the OTP. Please check your connection and try again.') });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 4) {
      toast.error('Please enter a valid OTP');
      return;
    }
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const result = await response.json();

      if (result.success) {
        setStep(3);
        toast.success('OTP verified successfully!');
      } else {
        toast.error(getFriendlyErrorMessage(result.message, 'The OTP is incorrect or has expired. Please try again.'));
      }
    } catch (err) {
      toast.error('Failed to verify OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Change password
  const handleChangePassword = async (data) => {
    try {
      setIsLoading(true);

      if (data.newPassword.length < 6) {
        setError('root', { message: 'Password must be at least 6 characters' });
        setIsLoading(false);
        return;
      }
      if (data.newPassword !== data.confirmPassword) {
        setError('root', { message: 'Passwords do not match' });
        setIsLoading(false);
        return;
      }

      // Update Supabase Auth password
      const supabase = SupabaseService.supabase;
      if (supabase && SupabaseService.isAvailable() && account?.password) {
        try {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email, password: account.password
          });
          if (!loginError && loginData?.session) {
            await supabase.auth.updateUser({ password: data.newPassword });
            await supabase.auth.signOut();
          }
        } catch (authErr) {
          console.warn('Supabase Auth update skipped:', authErr.message);
        }
      }

      // Hash and update in DB
      const hashedPassword = await hashPassword(data.newPassword);
      if (accountType === 'clinic') {
        await DatabaseService.update('clinics', account.id, { password: hashedPassword });
      } else if (accountType === 'patient') {
        await DatabaseService.update('patients', account.id, { password: hashedPassword });
      }

      // Send new password to email
      try {
        await fetch(`${API_URL}/send-password-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password: data.newPassword,
            name: account?.name || account?.contactPerson || account?.contact_person || 'User'
          })
        });
      } catch (emailErr) {
        console.warn('Password email sending failed:', emailErr.message);
      }

      setPasswordChanged(true);
    } catch (err) {
      setError('root', { message: getFriendlyErrorMessage(err, 'We could not change your password. Please try again.') });
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (result.success) {
        toast.success('OTP resent to your email!');
      } else {
        toast.error('Failed to resend OTP');
      }
    } catch {
      toast.error('Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  if (passwordChanged) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF] py-12 px-4">
        <div className="auth-card animate-fade-in text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Password Changed!</h2>
          <p className="text-gray-600 mb-2">
            Your password for <span className="font-medium text-gray-900">{email}</span> has been updated.
          </p>
          <p className="text-sm text-gray-500 mb-6">New password has been sent to your registered email.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-[#323956] hover:bg-[#232D3C] text-white font-semibold py-3 px-4 rounded-lg transition-all"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-white to-[#CAE0FF] py-12 px-4">
      <div className="auth-card animate-fade-in">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s ? 'bg-[#323956] text-white' : 'bg-gray-200 text-gray-500'
              }`}>{s}</div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-[#323956]' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {step === 1 ? 'Reset Password' : step === 2 ? 'Verify OTP' : 'Set New Password'}
          </h2>
          <p className="text-gray-500 text-sm">
            {step === 1 ? 'Enter your registered email address' : step === 2 ? `OTP sent to ${email}` : 'Create your new password'}
          </p>
        </div>

        {errors.root && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {errors.root.message}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 1 && (
          <form onSubmit={handleSubmit(handleSendOtp)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  className={`auth-input pl-11 ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="Enter your email address"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Invalid email' }
                  })}
                />
              </div>
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="auth-button">
              {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Sending OTP...</> : 'Send OTP'}
            </button>
          </form>
        )}

        {/* Step 2: OTP Verification */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Enter OTP</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  maxLength="6"
                  className="auth-input pl-11 text-center text-xl tracking-[0.5em] font-bold"
                  placeholder="- - - - - -"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
            <button
              onClick={handleVerifyOtp}
              disabled={isLoading || otp.length < 4}
              className="auth-button"
            >
              {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Verifying...</> : 'Verify OTP'}
            </button>
            <div className="text-center">
              <button onClick={handleResendOtp} disabled={isLoading} className="text-sm text-[#323956] hover:underline font-medium">
                Resend OTP
              </button>
            </div>
          </div>
        )}

        {/* Step 3: New Password */}
        {step === 3 && (
          <form onSubmit={handleSubmit(handleChangePassword)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className={`auth-input pl-11 pr-11 ${errors.newPassword ? 'border-red-500' : ''}`}
                  placeholder="Enter new password (min 6 characters)"
                  {...register('newPassword', {
                    required: 'New password is required',
                    minLength: { value: 6, message: 'Minimum 6 characters' }
                  })}
                />
                <button type="button" className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956]" onClick={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {errors.newPassword && <p className="mt-1 text-sm text-red-600">{errors.newPassword.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={`auth-input pl-11 pr-11 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                  placeholder="Confirm your new password"
                  {...register('confirmPassword', {
                    required: 'Please confirm password',
                    validate: (v) => v === watch('newPassword') || 'Passwords do not match'
                  })}
                />
                <button type="button" className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956]" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={isLoading} className="auth-button">
              {isLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Changing...</> : 'Change Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="inline-flex items-center text-sm text-[#323956] hover:text-[#232D3C] font-medium">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
