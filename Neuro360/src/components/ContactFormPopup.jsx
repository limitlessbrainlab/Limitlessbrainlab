import React, { useState, useRef, useEffect } from 'react';
import { X, Send, User, Mail, Phone, Globe, MessageSquare, CheckCircle, Sparkles, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { countryCodes } from '../utils/countryCodes';
import LocationService, { DEFAULT_LOCATIONS } from '../services/locationService';
import { getFriendlyErrorMessage } from '../utils/friendlyError';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Custom Select that renders dropdown inside popup
const CustomSelect = ({ name, value, onChange, options, placeholder = 'Select...', required }) => {
  const [isOpenState, setIsOpenState] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpenState(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const displayText = value || placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpenState(!isOpenState)}
        className={`w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 rounded-lg sm:rounded-xl text-base text-left flex items-center justify-between transition-all duration-200 ${isOpenState ? 'border-[#323956] shadow-lg shadow-[#323956]/10' : 'border-gray-200'}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpenState ? 'rotate-180' : ''}`} />
      </button>
      {isOpenState && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange({ target: { name, value: option } });
                setIsOpenState(false);
              }}
              className={`w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base hover:bg-gray-50 transition-colors ${option === value ? 'bg-[#323956]/5 text-[#323956] font-medium' : 'text-gray-700'} ${i === 0 ? 'rounded-t-xl' : ''} ${i === options.length - 1 ? 'rounded-b-xl' : ''}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Custom Country Code Select
const CountryCodeSelect = ({ name, value, onChange, countryCodes: codes }) => {
  const [isOpenState, setIsOpenState] = useState(false);
  const cRef = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cRef.current && !cRef.current.contains(e.target)) { setIsOpenState(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selected = codes.find(c => c.code === value && !c.disabled);
  const displayText = selected ? `${selected.flag} ${selected.code}` : value;
  const filtered = codes.filter(c => !c.disabled && (c.country.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)));

  return (
    <div ref={cRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpenState(!isOpenState)}
        className={`w-[100px] sm:w-[120px] h-11 sm:h-12 px-2 sm:px-3 bg-white border-2 rounded-lg sm:rounded-xl text-sm text-left flex items-center justify-between transition-all duration-200 ${isOpenState ? 'border-[#323956]' : 'border-gray-200'}`}
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isOpenState ? 'rotate-180' : ''}`} />
      </button>
      {isOpenState && (
        <div className="absolute z-50 top-full left-0 mt-1 w-[200px] bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#323956]"
              autoFocus
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filtered.map((country, i) => (
              <button
                key={`${country.code}-${country.country}`}
                type="button"
                onClick={() => {
                  onChange({ target: { name, value: country.code } });
                  setIsOpenState(false);
                  setSearch('');
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${country.code === value ? 'bg-[#323956]/5 font-medium' : ''}`}
              >
                {country.flag} {country.code} <span className="text-gray-400 text-xs">{country.country}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ContactFormPopup = ({ isOpen, onClose, source = null }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    countryCode: '+91',
    phone: '',
    city: '',
    customCity: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [cities, setCities] = useState(DEFAULT_LOCATIONS);

  // Fetch locations from database
  useEffect(() => {
    LocationService.getLocations().then(locs => setCities(locs));
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.firstName || !formData.email || !formData.phone || !formData.city) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.city === 'OTHER' && !formData.customCity.trim()) {
      toast.error('Please enter your city name');
      return;
    }

    setIsSubmitting(true);

    const fullName = `${formData.firstName.toUpperCase()} ${formData.lastName.toUpperCase()}`.trim();
    const fullPhone = `${formData.countryCode} ${formData.phone}`;
    const selectedCity = formData.city === 'OTHER' ? formData.customCity.trim().toUpperCase() : formData.city;

    try {
      // Save to Supabase database
      const { error: dbError } = await supabase
        .from('contact_inquiries')
        .insert([
          {
            name: fullName,
            email: formData.email,
            phone: fullPhone,
            city: selectedCity,
            message: formData.message ? formData.message.toUpperCase() : null
          }
        ]);

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save your message. Please try again.');
      }

      // Send email via backend nodemailer API
      const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName.toUpperCase(),
          lastName: formData.lastName.toUpperCase(),
          email: formData.email,
          phone: fullPhone,
          city: selectedCity,
          message: formData.message ? formData.message.toUpperCase() : '',
          source
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Email error:', result);
        throw new Error(result?.message || 'Failed to send message. Please try again.');
      }

      setIsSuccess(true);
      toast.success('Message sent successfully! We will contact you soon.');

      // Reset form after delay and close
      setTimeout(() => {
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          countryCode: '+91',
          phone: '',
          city: '',
          customCity: '',
          message: ''
        });
        setIsSuccess(false);
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to send your message. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      countryCode: '+91',
      phone: '',
      city: '',
      message: ''
    });
    setIsSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 backdrop-blur-md"
      style={{ animation: 'fadeIn 0.3s ease-out' }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-[550px] lg:max-w-[600px] max-h-[90vh] sm:max-h-[88vh] overflow-hidden"
        style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success State */}
        {isSuccess ? (
          <div className="p-6 sm:p-8 md:p-12 text-center">
            <div className="relative inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 sm:mb-6">
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-25"></div>
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">
              Thank You!
            </h3>
            <p className="text-gray-600 text-sm sm:text-base max-w-sm mx-auto">
              Your message has been sent successfully. Our team will get back to you shortly.
            </p>
          </div>
        ) : (
          <>
            {/* Form Header */}
            <div className="relative bg-gradient-to-br from-[#323956] via-[#3d4566] to-[#1a1f36] px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 overflow-hidden">
              {/* Decorative elements - hidden on mobile */}
              <div className="hidden sm:block absolute top-0 right-0 w-32 md:w-40 h-32 md:h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="hidden sm:block absolute bottom-0 left-0 w-24 md:w-32 h-24 md:h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

              <button
                onClick={handleClose}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center transition-all duration-200 z-10"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <div className="relative flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg border border-white/10">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight">Customer Inquiry</h2>
                  <p className="text-gray-300/90 text-[11px] sm:text-xs md:text-sm mt-0.5 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    We'd love to hear from you
                  </p>
                </div>
              </div>
            </div>

            {/* Form Body */}
            <div className="p-4 sm:p-5 md:p-6 lg:p-8 overflow-y-auto max-h-[calc(90vh-100px)] sm:max-h-[calc(88vh-110px)] md:max-h-[calc(88vh-120px)] bg-gradient-to-b from-gray-50/80 to-white">
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                {/* First Name & Last Name - Stack on mobile, side by side on sm+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'firstName' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      onFocus={() => setFocusedField('firstName')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="John"
                      className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400 uppercase"
                      required
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'lastName' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Last Name
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      onFocus={() => setFocusedField('lastName')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Doe"
                      className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400 uppercase"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'email' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="john@example.com"
                    className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    required
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'phone' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 sm:gap-3">
                    <CountryCodeSelect
                      name="countryCode"
                      value={formData.countryCode}
                      onChange={handleInputChange}
                      countryCodes={countryCodes}
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      onFocus={() => setFocusedField('phone')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="98765 43210"
                      className="flex-1 min-w-0 h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                      required
                    />
                  </div>
                </div>

                {/* City */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'city' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Preferred Location <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    options={cities}
                    placeholder="Select your city"
                  />
                  {formData.city === 'OTHER' && (
                    <input
                      type="text"
                      name="customCity"
                      value={formData.customCity}
                      onChange={handleInputChange}
                      onFocus={() => setFocusedField('customCity')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter your city name"
                      className="w-full h-10 sm:h-11 md:h-12 px-3 sm:px-4 mt-2 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400 uppercase"
                      required
                    />
                  )}
                </div>

                {/* Message */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'message' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Your Message
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('message')}
                    onBlur={() => setFocusedField(null)}
                    rows={3}
                    placeholder="Tell us how we can help you..."
                    className="w-full px-3 sm:px-4 py-3 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 resize-none placeholder-gray-400 uppercase"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 sm:h-12 md:h-14 bg-gradient-to-r from-[#323956] via-[#3d4566] to-[#1a1f36] hover:from-[#252a45] hover:via-[#323956] hover:to-[#0f1220] text-white rounded-lg sm:rounded-xl text-sm sm:text-base font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-[#323956]/25 flex items-center justify-center gap-2 group mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                      </svg>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform duration-200" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>

                {/* Privacy Note */}
                <p className="text-center text-[10px] sm:text-xs text-gray-500 pt-1">
                  By submitting, you agree to our privacy policy. We'll never share your information.
                </p>
              </form>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default ContactFormPopup;
