import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Brain, Clock, MapPin, Phone, Mail, User, Globe, MessageSquare, Send, X, Sparkles } from 'lucide-react';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';
import { supabase } from '../lib/supabaseClient';
import { countryCodes } from '../utils/countryCodes';
import LocationService, { DEFAULT_LOCATIONS } from '../services/locationService';

// API Base URL for backend email
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const NeurosenseBooking = () => {
  const location = useLocation();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    countryCode: '+971',
    phone: '',
    city: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [highlightedCard, setHighlightedCard] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cities, setCities] = useState(DEFAULT_LOCATIONS);
  const [services, setServices] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);

  // Fetch locations from database
  useEffect(() => {
    LocationService.getLocations().then(locs => setCities(locs));
  }, []);

  // Fetch assessments from database
  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        const { data, error } = await supabase
          .from('neurosense_assessments')
          .select('*')
          .eq('is_active', true)
          .order('display_order', { ascending: true });

        if (error) throw error;

        const allAssessments = (data || []).map(item => ({
          id: item.id,
          title: item.title,
          description: item.description,
          link: item.link || null,
          isFree: item.is_free,
          inquire: item.is_inquire,
          originalPrice: {
            usd: parseFloat(item.original_price_usd) || 0,
            ...(item.original_price_aed != null && { aed: parseFloat(item.original_price_aed) }),
            ...(item.original_price_inr != null && { inr: parseFloat(item.original_price_inr) })
          },
          salePrice: {
            usd: parseFloat(item.sale_price_usd) || 0,
            ...(item.sale_price_aed != null && { aed: parseFloat(item.sale_price_aed) }),
            ...(item.sale_price_inr != null && { inr: parseFloat(item.sale_price_inr) })
          },
          category: item.category,
          includes: item.bundle_includes || []
        }));

        setServices(allAssessments.filter(a => a.category === 'individual'));
        setBundles(allAssessments.filter(a => a.category === 'bundle'));
      } catch (err) {
        console.error('Error fetching assessments:', err);
        // Fallback to empty - page will show no cards
      } finally {
        setLoadingAssessments(false);
      }
    };

    fetchAssessments();
  }, []);

  const [selectedService, setSelectedService] = useState(null);
  const [paymentEmail, setPaymentEmail] = useState('');
  const [paymentName, setPaymentName] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Read highlight query param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const highlight = params.get('highlight');
    if (highlight) {
      setHighlightedCard(highlight);
      // Auto-scroll to the highlighted card after a short delay
      setTimeout(() => {
        const card = document.getElementById(`service-card-${highlight}`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      // Remove highlight after 5 seconds
      setTimeout(() => setHighlightedCard(null), 5000);
    }
  }, [location.search]);

  // Auto-scroll to contact form if hash is present
  useEffect(() => {
    if (location.hash === '#contact-form') {
      setTimeout(() => {
        const contactForm = document.getElementById('contact-form');
        if (contactForm) {
          contactForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash]);

  // Handle payment success redirect
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentStatus = params.get('payment');
    const assessmentId = params.get('assessment');
    const sessionId = params.get('session_id');

    if (paymentStatus === 'success' && assessmentId) {
      toast.success(
        'Payment successful! The assessment link has been sent to your email. Please check your inbox.',
        { duration: 6000 }
      );

      // Verify session and trigger confirmation email
      if (sessionId) {
        fetch(`${API_BASE_URL}/stripe/verify-session/${sessionId}`)
          .then(r => r.json())
          .then(data => {
            if (data.success) {
            }
          })
          .catch(err => console.error('Session verification failed:', err));
      }

      // Clean URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (paymentStatus === 'cancelled') {
      toast.error('Payment was cancelled.');
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
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

    setIsSubmitting(true);

    const fullName = `${formData.firstName.toUpperCase()} ${formData.lastName.toUpperCase()}`.trim();
    const fullPhone = `${formData.countryCode} ${formData.phone}`;

    try {
      // Save to Supabase database
      const { error: dbError } = await supabase
        .from('contact_inquiries')
        .insert([
          {
            name: fullName,
            email: formData.email,
            phone: fullPhone,
            city: formData.city,
            message: formData.message ? formData.message.toUpperCase() : null
          }
        ]);

      if (dbError) {
        console.error('Database error:', dbError);
        // Continue with email even if DB fails
      }

      // Send email via backend API (nodemailer)
      try {
        const emailResponse = await fetch(`${API_BASE_URL}/contact`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            firstName: formData.firstName.toUpperCase(),
            lastName: formData.lastName.toUpperCase(),
            email: formData.email,
            phone: fullPhone,
            city: formData.city,
            message: formData.message ? formData.message.toUpperCase() : ''
          })
        });

        const emailResult = await emailResponse.json();

        if (emailResult.success) {
        } else {
          console.error('Email error:', emailResult.message);
        }
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
        // Don't fail the whole submission if email fails
      }

      toast.success('Message sent successfully! We will contact you soon.');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        countryCode: '+971',
        phone: '',
        city: '',
        message: ''
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Stripe payment for paid assessments
  const handlePayForAssessment = async () => {
    if (!paymentEmail) {
      toast.error('Please enter your email address');
      return;
    }

    setIsProcessingPayment(true);

    try {
      const response = await fetch(`${API_BASE_URL}/create-assessment-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: selectedService.id,
          assessmentName: selectedService.title,
          customerEmail: paymentEmail,
          customerName: paymentName.toUpperCase(),
          currency: 'USD',
          amount: selectedService.salePrice.usd,
          assessmentLink: selectedService.link
        })
      });

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment page could not be opened. Please try again.'));
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes highlightGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(201, 162, 39, 0.3); }
          50% { box-shadow: 0 0 25px 8px rgba(201, 162, 39, 0.4); }
        }
      `}</style>
      <NavBar />

      {/* Hero Banner */}
      <section className="pt-14 sm:pt-16 relative">
        <img
          src="/neurobooking.jpg"
          alt="Limitless Brain Lab Booking Banner"
          className="w-full h-[180px] sm:h-[240px] md:h-[320px] lg:h-auto object-cover"
        />
        <div className="absolute inset-0 mt-14 sm:mt-16 bg-black/30 flex flex-col items-center justify-center text-center px-3 sm:px-4 md:px-6">
          <h1 className="text-lg sm:text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-2 sm:mb-4 md:mb-6 drop-shadow-lg leading-tight">
            Brain Health Assessment
          </h1>
          <p className="text-[11px] sm:text-sm md:text-base lg:text-xl text-white max-w-3xl mx-auto drop-shadow-lg leading-relaxed">
            Book your brain health assessment and take the first step towards optimizing your cognitive performance.
          </p>
        </div>
      </section>

      {/* Services Section */}
      <section id="services-section" className="py-8 sm:py-12 md:py-16 lg:py-20 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 left-0 w-40 sm:w-56 md:w-72 h-40 sm:h-56 md:h-72 bg-[#323956]/5 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-48 sm:w-72 md:w-96 h-48 sm:h-72 md:h-96 bg-[#4A6FA5]/5 rounded-full translate-x-1/3 translate-y-1/3"></div>

        <div className="max-w-7xl mx-auto px-3 sm:px-5 md:px-6 lg:px-8 relative">
          <div className="text-center mb-6 sm:mb-8 md:mb-12 lg:mb-14">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-[#323956]/10 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full mb-2 sm:mb-3 md:mb-4">
              <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-[#323956]" />
              <span className="text-[#323956] text-[10px] sm:text-xs font-bold uppercase tracking-wider">Assessments</span>
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-[#323956] mb-1.5 sm:mb-2 md:mb-3">
              Our Services
            </h2>
            <p className="text-gray-500 text-xs sm:text-sm md:text-base lg:text-lg max-w-2xl mx-auto">Individual assessments available at special pricing</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-7">
            {services.map((service, index) => {
              const isFreeWithLink = service.isFree && service.link;
              const CardWrapper = isFreeWithLink ? 'a' : 'div';
              const cardProps = isFreeWithLink ? { href: service.link, target: '_blank', rel: 'noopener noreferrer' } : {};

              const isHighlighted = highlightedCard === service.id;

              return (
                <CardWrapper
                  key={service.id}
                  id={`service-card-${service.id}`}
                  {...cardProps}
                  className={`group bg-white rounded-xl sm:rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 border-2 flex flex-col h-full transform hover:-translate-y-2 ${service.link ? 'cursor-pointer' : ''} ${isHighlighted ? 'border-[#c9a227] shadow-2xl shadow-[#c9a227]/30 ring-2 ring-[#c9a227]/40 animate-pulse-once scale-[1.03]' : 'border-gray-100 hover:border-[#323956]/30'}`}
                  style={isHighlighted ? { animation: 'highlightGlow 2s ease-in-out 3' } : {}}
                >
                  {/* Top gradient bar */}
                  <div className="h-1 sm:h-1.5 bg-gradient-to-r from-[#323956] via-[#4A6FA5] to-[#323956] group-hover:h-2 transition-all duration-300"></div>

                  <div className="p-3.5 sm:p-5 md:p-6 lg:p-7 flex flex-col h-full">
                    {/* Top content - grows to fill space */}
                    <div className="flex-grow">
                      {/* Icon */}
                      <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-gradient-to-br from-[#323956] to-[#4A6FA5] rounded-lg sm:rounded-xl flex items-center justify-center mb-3 sm:mb-4 md:mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                        <Brain className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                      </div>

                      {/* Title */}
                      <h3 className="text-[15px] sm:text-base md:text-lg lg:text-xl font-bold text-gray-900 mb-2 sm:mb-3 group-hover:text-[#323956] transition-colors duration-300 min-h-[2.5rem] sm:min-h-[3rem] md:min-h-[3.5rem] leading-snug">
                        {service.title}
                      </h3>

                      {/* Description */}
                      <p className="text-gray-500 text-xs sm:text-[13px] md:text-sm leading-relaxed line-clamp-4">
                        {service.description}
                      </p>
                    </div>

                    {/* Bottom section - always aligned */}
                    <div className="mt-auto">
                      {/* Pricing */}
                      <div className="mt-3 sm:mt-4 md:mt-5 pt-3 sm:pt-4 border-t border-gray-100 min-h-[3.5rem] sm:min-h-[4rem] md:min-h-[4.5rem]">
                        {service.isFree ? (
                          <div className="flex items-baseline gap-2 mb-1 sm:mb-1.5">
                            <span className="text-gray-400 line-through text-xs sm:text-sm">USD ${service.originalPrice.usd}</span>
                            <span className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600">FREE</span>
                          </div>
                        ) : service.originalPrice.usd === service.salePrice.usd ? (
                          <div className="flex items-baseline gap-2 mb-1 sm:mb-1.5">
                            <span className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-[#323956] to-[#4A6FA5] bg-clip-text text-transparent">USD ${service.salePrice.usd}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-baseline gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                              <span className="text-gray-400 line-through text-[10px] sm:text-xs md:text-sm">USD ${service.originalPrice.usd}</span>
                              <span className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-[#323956] to-[#4A6FA5] bg-clip-text text-transparent">USD ${service.salePrice.usd}</span>
                            </div>
                            {service.originalPrice.aed && (
                              <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-[10px] md:text-[11px] text-gray-400">
                                <span><span className="line-through">AED {service.originalPrice.aed}</span> <span className="font-semibold text-[#323956]">AED {service.salePrice.aed}</span></span>
                                <span><span className="line-through">INR {service.originalPrice.inr}</span> <span className="font-semibold text-[#323956]">INR {service.salePrice.inr}</span></span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Free assessment - direct link */}
                      {service.isFree && service.link && (
                        <div className="mt-3 sm:mt-4">
                          <span className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl group-hover:shadow-lg group-hover:shadow-[#323956]/25 transition-all duration-300">
                            Take Assessment
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </span>
                        </div>
                      )}

                      {/* Paid assessment - payment flow */}
                      {!service.isFree && service.link && (
                        <div className="mt-3 sm:mt-4">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedService(service);
                              setShowPaymentModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:shadow-lg hover:shadow-[#323956]/25 transition-all duration-300"
                          >
                            Pay & Take Assessment
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {service.inquire && (
                        <div className="mt-3 sm:mt-4">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowContactModal(true); }}
                            className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:shadow-lg hover:shadow-[#323956]/25 transition-all duration-300"
                          >
                            Inquire Now
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {!service.link && !service.inquire && (
                        <div className="mt-3 sm:mt-4">
                          <span className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl group-hover:shadow-lg group-hover:shadow-[#323956]/25 transition-all duration-300">
                            Take Assessment
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardWrapper>
              );
            })}
          </div>
        </div>
      </section>

      {/* Neurosense Cognitive Assessments Banner — hidden */}
      {/* <section className="py-8 sm:py-10 md:py-12 lg:py-16 bg-white">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 md:px-6 lg:px-8">
          <div
            className="relative bg-gradient-to-br from-[#323956] to-[#1a1f36] rounded-xl sm:rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 lg:p-10 text-white shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 sm:w-48 md:w-64 h-32 sm:h-48 md:h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-24 sm:w-36 md:w-48 h-24 sm:h-36 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>

            <div className="relative flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 md:gap-6">
              <div className="text-center sm:text-left">
                <h3 className="text-base sm:text-lg md:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2">
                  Limitless Brain Lab Cognitive Assessments
                </h3>
                <p className="text-gray-300 text-xs sm:text-sm md:text-base lg:text-lg">
                  Bundle: <span className="text-gray-400 line-through text-sm sm:text-base">$89.95</span> <span className="text-[#F5D05D] font-bold text-base sm:text-lg md:text-xl lg:text-2xl">$19.99</span>
                </p>
              </div>
              <button
                onClick={() => {
                  const bundle = bundles.find(b => b.title?.toLowerCase().includes('neurosense bundle')) || {
                    id: 'neurosense-bundle',
                    title: 'Neurosense Bundle',
                    description: 'All 4 assessments: Neuro Age Estimator, Neuro Performance Score, Brain Burnout Score & Brain Fitness Score',
                    originalPrice: { usd: 89.95 },
                    salePrice: { usd: 19.99 },
                    link: services.map(s => s.link).filter(Boolean).join(','),
                    includes: ['Neuro Age Estimator', 'Neuro Performance Score', 'Brain Burnout Score', 'Brain Fitness Score']
                  };
                  setSelectedService(bundle);
                  setShowPaymentModal(true);
                }}
                className="inline-block px-5 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-3.5 bg-[#F5D05D] hover:bg-[#e5c04d] text-[#323956] rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm md:text-base transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl whitespace-nowrap"
              >
                Buy Bundle - $19.99
              </button>
            </div>
          </div>
        </div>
      </section> */}

      <Footer />

      {/* Payment Modal */}
      {showPaymentModal && selectedService && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowPaymentModal(false); setSelectedService(null); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-white">Secure Payment</h2>
                  <p className="text-blue-200 text-[10px] sm:text-xs">Powered by Stripe</p>
                </div>
              </div>
              <button onClick={() => { setShowPaymentModal(false); setSelectedService(null); }} className="text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              {/* Service Info */}
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">{selectedService.title}</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1 line-clamp-2">{selectedService.description}</p>
                <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                  <span className="text-gray-400 line-through text-xs sm:text-sm">USD ${selectedService.originalPrice.usd}</span>
                  <span className="text-xl sm:text-2xl font-bold text-[#323956]">USD ${selectedService.salePrice.usd}</span>
                </div>
              </div>

              {/* Email Form */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <User className="h-4 w-4 text-gray-400" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={paymentName}
                    onChange={(e) => setPaymentName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <Mail className="h-4 w-4 text-gray-400" />
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={paymentEmail}
                    onChange={(e) => setPaymentEmail(e.target.value)}
                    placeholder="john@example.com"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Secure badge */}
              <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Your payment is secured by Stripe. We never store your card details.</span>
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePayForAssessment}
                disabled={isProcessingPayment || !paymentEmail}
                className="w-full mt-5 py-3 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white font-bold rounded-xl hover:shadow-lg hover:shadow-[#323956]/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingPayment ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Pay USD ${selectedService.salePrice.usd} & Continue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Get in Touch Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowContactModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-t-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-white">Customer Inquiry</h2>
                  <p className="text-blue-200 text-[10px] sm:text-xs flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> We'd love to hear from you
                  </p>
                </div>
              </div>
              <button onClick={() => setShowContactModal(false)} className="text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={(e) => { handleSubmit(e); setShowContactModal(false); }} className="p-4 sm:p-6 space-y-3 sm:space-y-5">
              {/* Name Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <User className="h-4 w-4 text-gray-400" />
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="John"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <User className="h-4 w-4 text-gray-400" />
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Mail className="h-4 w-4 text-gray-400" />
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="john@example.com"
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Phone className="h-4 w-4 text-gray-400" />
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    name="countryCode"
                    value={formData.countryCode}
                    onChange={handleInputChange}
                    className="w-[110px] px-2 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all bg-white"
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
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="98765 43210"
                    required
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
              </div>

              {/* Preferred Location */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <Globe className="h-4 w-4 text-gray-400" />
                  Preferred Location <span className="text-red-500">*</span>
                </label>
                <select
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all bg-white"
                >
                  <option value="">Select your city</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  Your Message
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Tell us how we can help you..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all resize-none uppercase"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-gradient-to-r from-[#323956] to-[#4A6FA5] text-white font-bold rounded-xl hover:shadow-lg hover:shadow-[#323956]/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Inquiry
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NeurosenseBooking;
