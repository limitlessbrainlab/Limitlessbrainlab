import React, { useState, useRef, useEffect } from 'react';
import { X, Brain, User, Mail, Phone, MessageSquare, Briefcase, Building, Activity, HelpCircle, CheckCircle, Sparkles, Send, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { countryCodes } from '../utils/countryCodes';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const industries = [
  'Technology', 'Healthcare', 'Finance & Banking', 'Education',
  'Manufacturing', 'Retail', 'Media & Entertainment', 'Real Estate',
  'Consulting', 'Legal', 'Government', 'Non-Profit', 'Other'
];

const professions = [
  'CEO / Founder', 'C-Suite Executive', 'Director / VP', 'Manager',
  'Entrepreneur', 'Professional', 'Consultant', 'Student', 'Other'
];

// Custom Select component that renders dropdown inside the popup
const CustomSelect = ({ name, value, onChange, options, placeholder = 'Select...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectedLabel = options.find(o => (typeof o === 'string' ? o : o.value) === value);
  const displayText = selectedLabel ? (typeof selectedLabel === 'string' ? selectedLabel : selectedLabel.label) : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 rounded-lg sm:rounded-xl text-base text-left flex items-center justify-between transition-all duration-200 ${isOpen ? 'border-[#323956] shadow-lg shadow-[#323956]/10' : 'border-gray-200'}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {options.map((option, i) => {
            const val = typeof option === 'string' ? option : option.value;
            const label = typeof option === 'string' ? option : option.label;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange({ target: { name, value: val } });
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base hover:bg-gray-50 transition-colors ${val === value ? 'bg-[#323956]/5 text-[#323956] font-medium' : 'text-gray-700'} ${i === 0 ? 'rounded-t-xl' : ''} ${i === options.length - 1 ? 'rounded-b-xl' : ''}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Custom Country Code Select
const CountryCodeSelect = ({ name, value, onChange, countryCodes: codes }) => {
  const [isOpenState, setIsOpenState] = useState(false);
  const ref = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setIsOpenState(false); setSearch(''); }
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
    <div ref={ref} className="relative">
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

const ProgramFormPopup = ({ isOpen, onClose }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    countryCode: '+91',
    email: '',
    message: '',
    profession: '',
    customProfession: '',
    industry: '',
    customIndustry: '',
    brainFitnessScore: '',
    hasDoneBrainScan: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Phone accepts digits only, capped at 10 — letters/symbols never reach state.
    const nextValue = name === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value;
    setFormData(prev => ({ ...prev, [name]: nextValue }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!/^\d{10}$/.test(formData.phone)) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsSubmitting(true);

    try {
      const fullPhone = `${formData.countryCode} ${formData.phone}`;
      const selectedProfession = formData.profession === 'Other' ? formData.customProfession.trim() : formData.profession;
      const selectedIndustry = formData.industry === 'Other' ? formData.customIndustry.trim() : formData.industry;

      const { error } = await supabase
        .from('program_inquiries')
        .insert([{
          name: formData.name,
          email: formData.email,
          phone: fullPhone,
          message: formData.message,
          profession: selectedProfession,
          industry: selectedIndustry,
          // brain_fitness_score is an INTEGER column — extract the leading number
          // ("75/100" -> 75) so a free-text entry never rejects the whole insert.
          brain_fitness_score: (String(formData.brainFitnessScore).match(/\d+/)
            ? parseInt(String(formData.brainFitnessScore).match(/\d+/)[0], 10)
            : null),
          has_done_brain_scan: formData.hasDoneBrainScan,
          program_type: '100X Brain Optimization',
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.error('Database error:', error);
      }

      // Send email via backend nodemailer API
      try {
        const emailResponse = await fetch(`${API_BASE_URL}/program-inquiry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            phone: fullPhone,
            message: formData.message,
            profession: selectedProfession,
            industry: selectedIndustry,
            brainFitnessScore: formData.brainFitnessScore,
            hasDoneBrainScan: formData.hasDoneBrainScan
          })
        });

        const emailResult = await emailResponse.json();
        if (!emailResponse.ok || !emailResult.success) {
          console.error('Email error:', emailResult);
        }
      } catch (emailError) {
        console.error('Email sending error:', emailError);
      }

      // Only report success if the row actually persisted — a swallowed insert
      // error here is how earlier submissions were silently lost.
      if (error) {
        toast.error('We could not save your submission — please try again.');
      } else {
        setIsSuccess(true);
        toast.success('Your application has been submitted!');

        setTimeout(() => {
          resetForm();
          onClose();
        }, 3000);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', phone: '', countryCode: '+91', email: '', message: '',
      profession: '', customProfession: '', industry: '', customIndustry: '', brainFitnessScore: '', hasDoneBrainScan: ''
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
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Thank You!</h3>
            <p className="text-gray-600 text-sm sm:text-base max-w-sm mx-auto">
              Your application has been submitted successfully! We will contact you soon.
            </p>
          </div>
        ) : (
          <>
            {/* Form Header */}
            <div className="relative bg-gradient-to-br from-[#323956] via-[#3d4566] to-[#1a1f36] px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 overflow-hidden">
              <div className="hidden sm:block absolute top-0 right-0 w-32 md:w-40 h-32 md:h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>

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
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight">Coach Application</h2>
                  <p className="text-gray-300/90 text-[11px] sm:text-xs md:text-sm mt-0.5 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    100X Brain Optimization Program
                  </p>
                </div>
              </div>
            </div>

            {/* Form Body */}
            <div className="p-4 sm:p-5 md:p-6 lg:p-8 overflow-y-auto max-h-[calc(90vh-100px)] sm:max-h-[calc(88vh-110px)] md:max-h-[calc(88vh-120px)] bg-gradient-to-b from-gray-50/80 to-white">
              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                {/* Full Name */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'name' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="John Doe"
                    className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    required
                  />
                </div>

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
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="john@example.com"
                    className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    required
                  />
                </div>

                {/* Phone Number */}
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
                      className="flex-1 h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                      required
                    />
                  </div>
                </div>

                {/* Profession & Industry */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'profession' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Profession
                    </label>
                    <CustomSelect
                      name="profession"
                      value={formData.profession}
                      onChange={handleInputChange}
                      options={professions}
                    />
                    {formData.profession === 'Other' && (
                      <input
                        type="text"
                        name="customProfession"
                        value={formData.customProfession}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField('customProfession')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Enter your profession"
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400 mt-2"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'industry' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Building className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Industry
                    </label>
                    <CustomSelect
                      name="industry"
                      value={formData.industry}
                      onChange={handleInputChange}
                      options={industries}
                    />
                    {formData.industry === 'Other' && (
                      <input
                        type="text"
                        name="customIndustry"
                        value={formData.customIndustry}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField('customIndustry')}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Enter your industry"
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400 mt-2"
                      />
                    )}
                  </div>
                </div>

                {/* Brain Fitness Score & Brain Scan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'brainFitnessScore' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Brain Fitness Score
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      name="brainFitnessScore"
                      value={formData.brainFitnessScore}
                      onChange={handleInputChange}
                      onFocus={() => setFocusedField('brainFitnessScore')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g., 75"
                      className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 placeholder-gray-400"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'hasDoneBrainScan' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                        <HelpCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                      Done Brain Scan?
                    </label>
                    <CustomSelect
                      name="hasDoneBrainScan"
                      value={formData.hasDoneBrainScan}
                      onChange={handleInputChange}
                      options={['Yes', 'No', 'Planning to']}
                    />
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold text-gray-700">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg flex items-center justify-center transition-all duration-200 ${focusedField === 'message' ? 'bg-[#323956] text-white' : 'bg-gray-100 text-[#323956]'}`}>
                      <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    Your Goals
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('message')}
                    onBlur={() => setFocusedField(null)}
                    rows={3}
                    placeholder="Share your goals or what you're looking to achieve..."
                    className="w-full px-3 sm:px-4 py-3 bg-white border-2 border-gray-200 rounded-lg sm:rounded-xl text-base focus:ring-0 focus:border-[#323956] focus:shadow-lg focus:shadow-[#323956]/10 transition-all duration-200 resize-none placeholder-gray-400"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 sm:h-12 md:h-14 bg-gradient-to-r from-[#323956] to-[#1a1f36] hover:from-[#252a45] hover:to-[#0f1220] text-white rounded-xl sm:rounded-2xl font-semibold text-sm sm:text-base transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-[#323956]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:gap-2.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Submit Application</span>
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] sm:text-xs text-gray-400 pb-1">
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

export default ProgramFormPopup;
