import React, { useState, useRef, useEffect } from 'react';
import { X, Brain, User, Mail, Phone, MapPin, Building, Award, Briefcase, Clock, Users, CheckCircle, Sparkles, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { countryCodes } from '../utils/countryCodes';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const professionalCategories = [
  'Life / Executive / Performance Coach',
  'Wellness & Holistic Practitioner',
  'Therapist (Non-clinical)',
  'Educator / Student Mentor',
  'Yoga & Meditation Facilitator',
  'Breathwork / Mind-Body Practitioner',
  'Integrative Health Professional',
  'Other'
];

const experienceOptions = [
  '<1 year',
  '1-3 years',
  '3-7 years',
  '7-12 years',
  '12+ years'
];

const clientSegmentOptions = [
  'Children & Teens',
  'College Students',
  'Working Professionals',
  'Corporate Leaders',
  'Athletes / Performers',
  'Individuals with Stress/Anxiety',
  'Wellness & Lifestyle Clients',
  'Others'
];

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
            {filtered.map((country) => (
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

// Custom Select for experience dropdown
const CustomSelect = ({ name, value, onChange, options, placeholder = 'Select...' }) => {
  const [isOpenState, setIsOpenState] = useState(false);
  const sRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (sRef.current && !sRef.current.contains(e.target)) setIsOpenState(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  return (
    <div ref={sRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpenState(!isOpenState)}
        className={`w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 rounded-lg sm:rounded-xl text-base text-left flex items-center justify-between transition-all duration-200 ${isOpenState ? 'border-[#323956] shadow-lg shadow-[#323956]/10' : 'border-gray-200'}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value || placeholder}</span>
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

const ProfessionalFormPopup = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    countryCode: '+91',
    phone: '',
    cityCountry: '',
    organization: '',
    certifications: '',
    professionalCategory: [],
    otherCategory: '',
    yearsExperience: '',
    clientSegments: [],
    otherSegments: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Phone accepts digits only, capped at 10 — letters/symbols never reach state.
    const nextValue = name === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value;
    setFormData(prev => ({ ...prev, [name]: nextValue }));
  };

  const handleCategoryChange = (category) => {
    setFormData(prev => {
      const categories = prev.professionalCategory.includes(category)
        ? prev.professionalCategory.filter(c => c !== category)
        : [...prev.professionalCategory, category];
      return { ...prev, professionalCategory: categories };
    });
  };

  const handleSegmentChange = (segment) => {
    setFormData(prev => {
      const segments = prev.clientSegments.includes(segment)
        ? prev.clientSegments.filter(s => s !== segment)
        : [...prev.clientSegments, segment];
      return { ...prev, clientSegments: segments };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.fullName || !formData.email || !formData.phone || !formData.cityCountry) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!/^\d{10}$/.test(formData.phone)) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    if (formData.professionalCategory.length === 0) {
      toast.error('Please select at least one professional category');
      return;
    }

    setIsSubmitting(true);

    try {
      const fullPhone = `${formData.countryCode} ${formData.phone}`;

      let categories = [...formData.professionalCategory];
      if (categories.includes('Other') && formData.otherCategory) {
        categories = categories.map(c => c === 'Other' ? `Other: ${formData.otherCategory}` : c);
      }

      let segments = [...formData.clientSegments];
      if (segments.includes('Others') && formData.otherSegments) {
        segments = segments.map(s => s === 'Others' ? `Others: ${formData.otherSegments}` : s);
      }

      const { error } = await supabase
        .from('professional_onboarding')
        .insert([{
          full_name: formData.fullName,
          email: formData.email,
          phone: fullPhone,
          city_country: formData.cityCountry,
          organization: formData.organization || null,
          certifications: formData.certifications || null,
          professional_category: categories,
          years_experience: formData.yearsExperience || null,
          client_segments: segments,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('Database error:', error);
      }

      // Send email via backend nodemailer API
      try {
        const emailResponse = await fetch(`${API_BASE_URL}/professional-inquiry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName: formData.fullName,
            email: formData.email,
            phone: fullPhone,
            cityCountry: formData.cityCountry,
            organization: formData.organization,
            certifications: formData.certifications,
            professionalCategory: categories,
            yearsExperience: formData.yearsExperience,
            clientSegments: segments
          })
        });

        const emailResult = await emailResponse.json();
        if (!emailResponse.ok || !emailResult.success) {
          console.error('Email error:', emailResult);
        }
      } catch (emailError) {
        console.error('Email sending error:', emailError);
      }

      setIsSuccess(true);
      toast.success('Your application has been submitted successfully!');

      setTimeout(() => {
        resetForm();
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      countryCode: '+91',
      phone: '',
      cityCountry: '',
      organization: '',
      certifications: '',
      professionalCategory: [],
      otherCategory: '',
      yearsExperience: '',
      clientSegments: [],
      otherSegments: ''
    });
    setIsSuccess(false);
  };

  const handleClose = () => {
    resetForm();
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
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[600px] lg:max-w-[700px] max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
        style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isSuccess ? (
          <div className="p-6 sm:p-8 md:p-12 text-center">
            <div className="relative inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-4 sm:mb-6">
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-25"></div>
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
              </div>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Thank You!</h3>
            <p className="text-gray-600 text-sm sm:text-base max-w-sm mx-auto">Your application has been submitted successfully! We will contact you soon.</p>
          </div>
        ) : (
          <>
            {/* Form Header */}
            <div className="relative bg-gradient-to-br from-[#323956] via-[#3d4566] to-[#1a1f36] px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 overflow-hidden">
              {/* Decorative elements */}
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
                  <Brain className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight">Professional Coach Application</h2>
                  <p className="text-gray-300/90 text-[11px] sm:text-xs md:text-sm mt-0.5 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    Join our network of experts
                  </p>
                </div>
              </div>
            </div>

            {/* Form Body */}
            <div className="p-4 sm:p-5 md:p-6 lg:p-8 overflow-y-auto max-h-[calc(92vh-80px)] sm:max-h-[calc(88vh-100px)] md:max-h-[calc(88vh-120px)] bg-gradient-to-b from-gray-50/80 to-white">
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                {/* Full Name - Full Width */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'fullName' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    onFocus={() => setFocusedField('fullName')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Enter your full name"
                    className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    style={{ fontSize: '16px' }}
                    required
                  />
                </div>

                {/* Email & City Row - Stack on mobile, side by side on tablet+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Email */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'email' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="your@email.com"
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    style={{ fontSize: '16px' }}
                      required
                    />
                  </div>

                  {/* City & Country */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'cityCountry' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      City & Country <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="cityCountry"
                      value={formData.cityCountry}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('cityCountry')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Mumbai, India"
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>

                {/* Phone - Full Width */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'phone' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Mobile / WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2 sm:gap-3">
                    <CountryCodeSelect
                      name="countryCode"
                      value={formData.countryCode}
                      onChange={handleChange}
                      countryCodes={countryCodes}
                    />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('phone')}
                      onBlur={() => setFocusedField(null)}
                      onKeyDown={(e) => {
                        // Block "e", "+", "-", "." which type="tel"/number inputs otherwise allow
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault();
                      }}
                      placeholder="9876543210"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      pattern="\d{10}"
                      title="Enter a 10-digit mobile number"
                      className="flex-1 h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                      style={{ fontSize: '16px' }}
                      required
                    />
                  </div>
                </div>

                {/* Organization & Certifications Row - Stack on mobile, side by side on tablet+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Organization */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'organization' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Building className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Organization
                    </label>
                    <input
                      type="text"
                      name="organization"
                      value={formData.organization}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('organization')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Your organization"
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    style={{ fontSize: '16px' }}
                    />
                  </div>

                  {/* Certifications */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'certifications' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Certifications
                    </label>
                    <input
                      type="text"
                      name="certifications"
                      value={formData.certifications}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('certifications')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="ICF, RYT-200, etc."
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>

                {/* Professional Category */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center bg-gray-100 text-[#323956]">
                      <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Professional Category <span className="text-red-500">*</span>
                    <span className="text-[10px] sm:text-xs text-gray-500 font-normal">(Select all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
                    {professionalCategories.map((category) => (
                      <label
                        key={category}
                        className={`flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all text-xs sm:text-sm ${
                          formData.professionalCategory.includes(category)
                            ? 'border-[#323956] bg-[#323956]/10 text-[#323956] font-medium'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.professionalCategory.includes(category)}
                          onChange={() => handleCategoryChange(category)}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#323956] rounded focus:ring-[#323956] border-gray-300 flex-shrink-0"
                        />
                        <span className="text-gray-700 leading-tight">{category}</span>
                      </label>
                    ))}
                  </div>
                  {formData.professionalCategory.includes('Other') && (
                    <input
                      type="text"
                      name="otherCategory"
                      value={formData.otherCategory}
                      onChange={handleChange}
                      placeholder="Please specify your category"
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] transition-all duration-200 placeholder-gray-400"
                      style={{ fontSize: '16px' }}
                    />
                  )}
                </div>

                {/* Years of Experience */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'experience' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Years of Experience
                  </label>
                  <CustomSelect
                    name="yearsExperience"
                    value={formData.yearsExperience}
                    onChange={handleChange}
                    options={experienceOptions}
                    placeholder="Select experience"
                  />
                </div>

                {/* Primary Client Segments */}
                <div className="space-y-2 sm:space-y-3">
                  <label className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center bg-gray-100 text-[#323956]">
                      <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Client Segments
                    <span className="text-[10px] sm:text-xs text-gray-500 font-normal">(Select all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
                    {clientSegmentOptions.map((segment) => (
                      <label
                        key={segment}
                        className={`flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all text-xs sm:text-sm ${
                          formData.clientSegments.includes(segment)
                            ? 'border-[#323956] bg-[#323956]/10 text-[#323956] font-medium'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.clientSegments.includes(segment)}
                          onChange={() => handleSegmentChange(segment)}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#323956] rounded focus:ring-[#323956] border-gray-300 flex-shrink-0"
                        />
                        <span className="text-gray-700 leading-tight">{segment}</span>
                      </label>
                    ))}
                  </div>
                  {formData.clientSegments.includes('Others') && (
                    <input
                      type="text"
                      name="otherSegments"
                      value={formData.otherSegments}
                      onChange={handleChange}
                      placeholder="Please specify your client segments"
                      className="w-full h-11 sm:h-12 md:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-sm sm:text-base focus:ring-0 focus:border-[#323956] transition-all duration-200 placeholder-gray-400"
                      style={{ fontSize: '16px' }}
                    />
                  )}
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
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Application</span>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
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

export default ProfessionalFormPopup;
