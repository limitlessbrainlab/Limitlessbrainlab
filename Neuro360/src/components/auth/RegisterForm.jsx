import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, Loader2, Phone, MapPin, LocateFixed } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { countryCodes, validatePhoneNumber } from '../../utils/countryCodes';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const RegisterForm = () => {
  const location = useLocation();
  const userTypeFromState = location.state?.userType || 'clinic';
  const isPatient = userTypeFromState === 'patient';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(countryCodes.find(c => c.code === '+91'));
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Safety check for AuthContext
  let registerUser, loading;
  try {
    const auth = useAuth();
    registerUser = auth.register;
    loading = auth.loading;
  } catch (error) {
    console.error('RegisterForm: AuthContext not available', error);
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    watch,
    setValue,
  } = useForm();

  const watchPassword = watch('password');
  const watchCountryCode = watch('countryCode', '+91');

  // Get current location and address using Google Geocoding API
  const getCurrentLocation = async () => {
    setLocationError('');
    setLocationLoading(true);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      setLocationLoading(false);
      return;
    }

    // Check and request permission explicitly
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });

      if (permission.state === 'denied') {
        setLocationError('Location blocked. Please enable in browser settings: Click lock icon → Site settings → Location → Allow');
        setLocationLoading(false);
        return;
      }
    } catch (e) {
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;

          // Call server API to get address from coordinates
          const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          const response = await fetch(`${baseUrl}/geocode`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ latitude, longitude }),
          });

          const data = await response.json();

          if (data.success) {
            setValue('address', data.address);
            setLocationError('');
          } else {
            setLocationError(getFriendlyErrorMessage(data.message, 'We could not find your address. Please type it in manually.'));
          }
        } catch (error) {
          console.error('Geocoding error:', error);
          setLocationError('Failed to get address. Please try again.');
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied. Please allow location access.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError('An unknown error occurred.');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000
      }
    );
  };

  const onSubmit = async (data) => {
    try {

      const registrationData = {
        ...data,
        name: data.name ? data.name.toUpperCase() : data.name,
        address: data.address ? data.address.toUpperCase() : data.address,
        city: data.city ? data.city.toUpperCase() : data.city,
        countryCode: data.countryCode || '+91',
        userType: isPatient ? 'patient' : 'clinic',
        clinic_type: isPatient ? undefined : (data.clinicType || 'lbl_partner'),
        clinicType: isPatient ? undefined : (data.clinicType || 'lbl_partner'),
      };


      const result = await registerUser(registrationData, 'email');
      
      if (result && result.success) {
        // Check if account needs activation
        if (result.needsActivation) {
          navigate('/activation-pending');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError('root', { message: getFriendlyErrorMessage(result?.error, 'Registration failed. Please try again.') });
      }
    } catch (error) {
      console.error('ALERT: Registration form error:', error);
      setError('root', { message: 'An unexpected error occurred. Please try again.' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E4EFFF] via-[#CAE0FF] to-white py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-[#323956]/30 to-[#F5D05D]/30 rounded-full blur-3xl animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-[#232D3C]/20 to-[#CAE0FF]/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/4 right-1/4 w-32 h-32 bg-gradient-to-br from-[#F5D05D]/20 to-[#323956]/20 rounded-full blur-2xl animate-float" style={{ animationDelay: '4s' }}></div>
      </div>
      
      <div className="auth-card animate-fade-in-up floating-elements relative z-10">
        <div className="text-center mb-6 sm:mb-8 animate-slide-up">
          <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2 sm:mb-3">{isPatient ? 'Patient Registration' : 'Create Account'}</h2>
          <p className="text-gray-600 font-medium text-sm sm:text-base">{isPatient ? 'Create your patient account' : 'Join us today and get started'}</p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 animate-slide-in-right" style={{ animationDelay: '0.6s' }}>
          {errors.root && (
            <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm animate-shake shadow-lg">
              {errors.root.message}
            </div>
          )}

          {/* Name Field */}
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <label htmlFor="name" className="field-label">
              {isPatient ? 'Full Name' : 'Clinic Name / Contact Person'}
            </label>
            <div className="relative">
              <User className={`input-icon ${errors.name ? 'text-red-400' : ''}`} />
              <input
                id="name"
                type="text"
                className={`auth-input pl-11 uppercase ${errors.name ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder={isPatient ? 'Enter your full name' : 'Enter clinic name or contact person'}
                {...register('name', {
                  required: 'Name is required',
                  minLength: {
                    value: 2,
                    message: 'Name must be at least 2 characters',
                  },
                })}
              />
            </div>
            {errors.name && (
              <p className="error-message">{errors.name.message}</p>
            )}
          </div>

          {/* Category Field — only for clinic/partner registration */}
          {!isPatient && (
            <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.15s' }}>
              <label htmlFor="clinicType" className="field-label">
                Category *
              </label>
              <select
                id="clinicType"
                className={`auth-input ${errors.clinicType ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                {...register('clinicType', { required: 'Please select a category' })}
                defaultValue=""
              >
                <option value="" disabled>Select category</option>
                <option value="lbl_clinic">Clinic</option>
                <option value="lbl_partner">Partner</option>
              </select>
              {errors.clinicType && (
                <p className="error-message">{errors.clinicType.message}</p>
              )}
            </div>
          )}

          {/* Email Field */}
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <label htmlFor="email" className="field-label">
              Email Address
            </label>
            <div className="relative">
              <Mail className={`input-icon ${errors.email ? 'text-red-400' : ''}`} />
              <input
                id="email"
                type="email"
                className={`auth-input pl-11 ${errors.email ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="Enter your email"
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
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
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <div className="relative">
              <Lock className={`input-icon ${errors.password ? 'text-red-400' : ''}`} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`auth-input pl-11 pr-11 ${errors.password ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="Create a password"
                data-lpignore="true"
                data-form-type="other"
                autoComplete="new-password"
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

          {/* Confirm Password Field */}
          <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <label htmlFor="confirmPassword" className="field-label">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className={`input-icon ${errors.confirmPassword ? 'text-red-400' : ''}`} />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`auth-input pl-11 pr-11 ${errors.confirmPassword ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                placeholder="Confirm your password"
                data-lpignore="true"
                data-form-type="other"
                autoComplete="new-password"
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) =>
                    value === watchPassword || 'Passwords do not match',
                })}
              />
              <button
                type="button"
                className="absolute right-3 top-3 h-5 w-5 text-gray-400 hover:text-[#323956] transition-colors duration-200 transform hover:scale-110"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="error-message">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Contact Number with Country Code */}
              <div className="field-wrapper animate-slide-up country-code-wrapper" style={{ animationDelay: '0.5s', marginBottom: '2rem' }}>
                <label htmlFor="phone" className="field-label">
                  Contact Number *
                </label>
                <div className="flex gap-2">
                  {/* Country Code Selector */}
                  <div className="relative">
                    <select
                      {...register('countryCode')}
                      className="h-11 w-32 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium focus:outline-none focus:ring-2 focus:ring-[#323956] focus:border-transparent appearance-none cursor-pointer pr-7"
                      defaultValue="+91"
                      onChange={(e) => {
                        const country = countryCodes.find(c => c.code === e.target.value);
                        setSelectedCountry(country);
                        setValue('countryCode', e.target.value);
                      }}
                      style={{
                        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
                        backgroundPosition: "right 0.3rem center",
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "1.3em 1.3em",
                        fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI Symbol', sans-serif",
                        fontSize: "14px",
                        lineHeight: "1.5"
                      }}
                    >
                      {countryCodes.map((country) => (
                        <option
                          key={country.code}
                          value={country.code}
                          disabled={country.disabled}
                          className={country.disabled ? 'font-semibold text-gray-500 bg-gray-100' : ''}
                        >
                          {country.disabled ? country.country : `${country.flag} ${country.code}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Phone Number Input */}
                  <div className="relative flex-1">
                    <Phone className={`input-icon ${errors.phone ? 'text-red-400' : ''}`} />
                    <input
                      id="phone"
                      type="tel"
                      className={`auth-input pl-11 ${errors.phone ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                      placeholder={`Enter ${selectedCountry?.minLength === selectedCountry?.maxLength ? selectedCountry?.minLength : `${selectedCountry?.minLength}-${selectedCountry?.maxLength}`} digit number`}
                      data-lpignore="true"
                      data-form-type="other"
                      autoComplete="tel"
                      maxLength={selectedCountry?.maxLength}
                      onInput={(e) => {
                        // Remove any non-numeric characters
                        e.target.value = e.target.value.replace(/\D/g, '');
                      }}
                      {...register('phone', {
                        required: isPatient ? 'Contact number is required' : 'Contact number is required for clinics',
                        validate: (value) => {
                          if (!value) return 'Phone number is required';
                          // Only allow digits
                          if (!/^[0-9]+$/.test(value)) {
                            return 'Please enter only numbers (without country code)';
                          }
                          // Validate based on selected country code
                          const isValid = validatePhoneNumber(value, watchCountryCode);
                          if (!isValid) {
                            const country = countryCodes.find(c => c.code === watchCountryCode);
                            if (country) {
                              return `Phone number must be ${country.minLength}-${country.maxLength} digits for ${country.country}`;
                            }
                            return 'Please enter a valid phone number';
                          }
                          return true;
                        },
                      })}
                    />
                  </div>
                </div>
                {errors.phone && (
                  <p className="error-message">{errors.phone.message}</p>
                )}
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                        {selectedCountry?.flag} {selectedCountry?.country} ({selectedCountry?.code})
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        Phone number should be <span className="font-semibold">{selectedCountry?.minLength === selectedCountry?.maxLength ? `${selectedCountry?.minLength}` : `${selectedCountry?.minLength}-${selectedCountry?.maxLength}`} digits</span>
                      </p>
                      <p className="text-blue-600 dark:text-blue-400 mt-1 text-[11px]">
                        Enter only numbers without country code or special characters
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* City — clinics only */}
              {!isPatient && (
                <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.5s' }}>
                  <label htmlFor="city" className="field-label">
                    City *
                  </label>
                  <div className="relative">
                    <MapPin className={`input-icon ${errors.city ? 'text-red-400' : 'text-gray-400'}`} />
                    <input
                      id="city"
                      type="text"
                      className={`auth-input pl-11 uppercase ${errors.city ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                      placeholder="Enter your city"
                      {...register('city', {
                        required: 'City is required',
                      })}
                    />
                  </div>
                  {errors.city && (
                    <p className="error-message">{errors.city.message}</p>
                  )}
                </div>
              )}

              {/* Address */}
              <div className="field-wrapper animate-slide-up" style={{ animationDelay: '0.5s' }}>
                <label htmlFor="address" className="field-label">
                  {isPatient ? 'Address' : 'Clinic Address *'}
                </label>
                <div className="relative">
                  <MapPin className={`input-icon ${errors.address ? 'text-red-400' : 'text-gray-400'}`} />
                  <textarea
                    id="address"
                    rows="3"
                    className={`auth-input pl-11 pr-12 uppercase ${errors.address ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : ''}`}
                    placeholder={isPatient ? 'Enter your address' : 'Enter complete clinic address'}
                    data-lpignore="true"
                    data-form-type="other"
                    autoComplete="street-address"
                    {...register('address', {
                      required: isPatient ? false : 'Clinic address is required',
                      minLength: {
                        value: 10,
                        message: 'Address must be at least 10 characters',
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={locationLoading}
                    className="absolute right-3 top-3 p-1.5 rounded-full bg-[#323956] hover:bg-[#232D3C] text-white transition-all duration-200 disabled:opacity-50"
                    title="Get current location"
                  >
                    {locationLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LocateFixed className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {locationError && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {locationError}
                  </p>
                )}
                {errors.address && (
                  <p className="error-message">{errors.address.message}</p>
                )}
              </div>

          {/* Terms and Conditions */}
          <div className="flex items-start animate-slide-up" style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center h-5">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                className="h-4 w-4 text-[#323956] focus:ring-[#323956] border-gray-300 rounded transition-transform duration-200 hover:scale-110"
                {...register('terms', {
                  required: 'You must accept the terms and conditions',
                })}
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="terms" className="text-gray-700 font-medium">
                I agree to the{' '}
                <Link to="/terms" className="text-[#323956] hover:text-[#232D3C] font-semibold transition-all duration-200 hover:underline hover:underline-offset-4">
                  Terms and Conditions
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-[#323956] hover:text-[#232D3C] font-semibold transition-all duration-200 hover:underline hover:underline-offset-4">
                  Privacy Policy
                </Link>
              </label>
            </div>
          </div>
          {errors.terms && (
            <p className="error-message">{errors.terms.message}</p>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="auth-button animate-bounce-soft" style={{ animationDelay: '0.6s' }}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="animate-pulse">Creating account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>

        {/* Sign In Link */}
        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: '1s' }}>
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link
              to="/login"
              state={{ userType: isPatient ? 'patient' : 'clinic' }}
              className="font-semibold text-[#323956] hover:text-[#232D3C] transition-all duration-200 hover:underline hover:underline-offset-4"
            >
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;
