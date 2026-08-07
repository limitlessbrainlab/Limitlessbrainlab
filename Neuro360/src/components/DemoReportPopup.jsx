import React, { useState } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { countryCodes } from '../utils/countryCodes';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
const BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

const DemoReportPopup = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setEmail('');
    setCountryCode('+91');
    setPhone('');
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !phone) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    setSubmitting(true);
    try {
      const fullPhone = `${countryCode} ${phone}`;

      // The backend persists the request with its service-role connection and
      // sends the email. Keeping both operations server-side avoids anonymous
      // Supabase RLS failures that previously stopped the email request.
      const response = await fetch(`${BASE_URL}/api/request-demo-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone: fullPhone })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to send the demo report email');
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting demo report request:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center px-3 sm:px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-md p-4 sm:p-6 relative animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {submitted ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Thank You!</h3>
            <p className="text-sm text-gray-600 mt-3">
              Your request has been received. We've sent the demo report to{' '}
              <strong className="text-[#323956]">{email}</strong> &mdash; please check your inbox (and spam folder).
            </p>
            <button
              onClick={handleClose}
              className="mt-6 w-full py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all duration-300"
            >
              Close
            </button>
          </div>
        ) : (
        <>
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-[#323956] to-[#4A6FA5] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900">Demo Report Request</h3>
          <p className="text-sm text-gray-500 mt-1">Enter your details and we'll send you a demo report</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#323956] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-[110px] px-2 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#323956] focus:border-transparent cursor-pointer bg-white"
              >
                {countryCodes.map((country) => (
                  <option
                    key={`${country.code}-${country.country}`}
                    value={country.code}
                    disabled={country.disabled}
                  >
                    {country.disabled ? country.country : `${country.flag} ${country.code}`}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                required
                className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#323956] focus:border-transparent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
};

export default DemoReportPopup;
