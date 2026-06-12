import React, { useState } from 'react';
import {
  GraduationCap, BookOpen, Award, Star, Clock, Globe,
  CheckCircle, ExternalLink, Calendar, FileText, Zap,
  Users, Briefcase, Heart, BrainCircuit, X, Mail, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const NeuroCoaching = () => {
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentName, setPaymentName] = useState('');
  const [paymentEmail, setPaymentEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEnrollPayment = async () => {
    if (!paymentEmail) {
      toast.error('Please enter your email address');
      return;
    }
    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/create-assessment-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentName: selectedPlan?.name,
          customerEmail: paymentEmail,
          customerName: paymentName.toUpperCase(),
          currency: 'USD',
          amount: selectedPlan?.priceUSD
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
      setIsProcessing(false);
    }
  };

  const schoolOptions = [
    {
      id: 'foundation',
      name: 'Foundation Certificate',
      duration: '8 weeks',
      format: 'Online Self-Paced',
      price: '₹24,999',
      priceUSD: 299,
      features: [
        'All 5 Pillars core curriculum',
        'Video lessons & workbooks',
        'Self-assessment tools',
        'Community access',
        'Certificate of Completion'
      ],
      color: 'from-blue-500 to-indigo-600',
      icon: BookOpen,
      badge: 'Most Popular'
    },
    {
      id: 'practitioner',
      name: 'Certified Practitioner',
      duration: '16 weeks',
      format: 'Online + Live Sessions',
      price: '₹49,999',
      priceUSD: 599,
      features: [
        'Everything in Foundation',
        'Live coaching sessions with Dr. Shweta',
        'Client assessment training',
        'Case study practice',
        'Practitioner certification',
        '1-on-1 mentorship calls'
      ],
      color: 'from-purple-500 to-pink-600',
      icon: Award,
      badge: 'Professional'
    },
    {
      id: 'master',
      name: 'Master Coach Program',
      duration: '6 months',
      format: 'Hybrid (Online + In-Person)',
      price: '₹99,999',
      priceUSD: 1199,
      features: [
        'Everything in Practitioner',
        'Advanced neuroscience modules',
        'Business setup guidance',
        'In-person intensive workshop',
        'Neuro360 affiliate partnership',
        'Ongoing supervision & support',
        'Master Coach certification'
      ],
      color: 'from-amber-500 to-orange-600',
      icon: Star,
      badge: 'Elite'
    }
  ];

  const syllabusDetails = {
    foundation: {
      weeks: [
        { week: '1-2', topic: 'Pillar 1: Stress & ANS Mastery', description: 'Understanding the autonomic nervous system and mastering regulation techniques' },
        { week: '3-4', topic: 'Pillar 2: Sleep & Recovery', description: 'Sleep science, circadian optimization, and recovery protocols' },
        { week: '5', topic: 'Pillar 3: Focus & Attention', description: 'Attention training, flow states, and concentration techniques' },
        { week: '6', topic: 'Pillar 4: Learning & Memory', description: 'Memory systems, learning strategies, and neuroplasticity' },
        { week: '7', topic: 'Pillar 5: Emotional Regulation', description: 'Emotional intelligence and resilience building' },
        { week: '8', topic: 'Integration & Assessment', description: 'Bringing it all together, final assessment' }
      ]
    },
    practitioner: {
      weeks: [
        { week: '1-4', topic: 'Foundation Curriculum', description: 'Complete 5 Pillars foundation with deeper understanding' },
        { week: '5-8', topic: 'Client Assessment', description: 'Learn to assess clients, use Limitless Brain Lab tools, create personalized plans' },
        { week: '9-12', topic: 'Coaching Skills', description: 'Active listening, questioning techniques, session structure' },
        { week: '13-14', topic: 'Case Studies', description: 'Practice with real scenarios, supervised coaching sessions' },
        { week: '15-16', topic: 'Certification & Launch', description: 'Final assessment, certification, practice setup guidance' }
      ]
    },
    master: {
      weeks: [
        { week: 'Month 1-2', topic: 'Practitioner Curriculum', description: 'Complete practitioner training with advanced modules' },
        { week: 'Month 3', topic: 'Advanced Neuroscience', description: 'Deep dive into brain science, research methods, evidence-based practice' },
        { week: 'Month 4', topic: 'Specialized Populations', description: 'Working with executives, athletes, students, clinical considerations' },
        { week: 'Month 5', topic: 'Business & Marketing', description: 'Practice setup, marketing, client acquisition, pricing strategies' },
        { week: 'Month 6', topic: 'In-Person Intensive + Certification', description: '3-day workshop, final assessment, Master Coach certification' }
      ]
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#323956] to-[#4a5578] mb-2 sm:mb-3">
          <BrainCircuit className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
        </div>
        <h1 className="text-xl sm:text-3xl font-bold text-[#323956] dark:text-white">NeuroCoaching</h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">Become a certified brain health coach</p>
      </div>

      {/* Certification Path */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2.5 sm:space-x-3 mb-3 sm:mb-6">
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="h-4 w-4 sm:h-6 sm:w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm sm:text-xl font-bold text-gray-900 dark:text-white">Choose Your Certification Path</h2>
            <p className="text-[11px] sm:text-sm text-gray-600 dark:text-gray-400">Three levels to match your goals</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {schoolOptions.map((school) => {
            const Icon = school.icon;
            return (
              <div
                key={school.id}
                className={`relative bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl border-2 transition-all cursor-pointer hover:shadow-xl flex flex-col ${
                  selectedSchool === school.id
                    ? 'border-[#323956] dark:border-blue-500 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setSelectedSchool(selectedSchool === school.id ? null : school.id)}
              >
                {school.badge && (
                  <div className={`absolute -top-2.5 sm:-top-3 left-1/2 transform -translate-x-1/2 px-2.5 sm:px-3 py-0.5 sm:py-1 bg-gradient-to-r ${school.color} text-white text-[10px] sm:text-xs font-bold rounded-full shadow-md`}>
                    {school.badge}
                  </div>
                )}

                <div className={`bg-gradient-to-r ${school.color} p-3 sm:p-5 text-white rounded-t-xl sm:rounded-t-2xl min-h-[100px] sm:min-h-[140px]`}>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-3">
                    <div className="w-9 h-9 sm:w-12 sm:h-12 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                    <span className="text-lg sm:text-2xl font-bold">{school.price}</span>
                  </div>
                  <h3 className="text-sm sm:text-lg font-bold truncate">{school.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 sm:mt-2 text-white/80 text-[10px] sm:text-sm">
                    <span className="flex items-center whitespace-nowrap"><Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />{school.duration}</span>
                    <span className="flex items-center"><Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />{school.format}</span>
                  </div>
                </div>

                <div className="p-3 sm:p-5 flex flex-col flex-grow">
                  <ul className="space-y-1.5 sm:space-y-2.5 flex-grow">
                    {school.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start space-x-1.5 sm:space-x-2">
                        <CheckCircle className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] sm:text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 sm:mt-4">
                    <button
                      className={`w-full py-2 sm:py-3 font-semibold rounded-lg sm:rounded-xl transition-all text-xs sm:text-base ${
                        selectedSchool === school.id
                          ? `bg-gradient-to-r ${school.color} text-white`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {selectedSchool === school.id ? 'View Syllabus Below' : 'Select & View Syllabus'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlan(school);
                        setPaymentName('');
                        setPaymentEmail('');
                        setShowPaymentModal(true);
                      }}
                      className={`w-full mt-2 py-2 sm:py-3 font-semibold rounded-lg sm:rounded-xl transition-all text-xs sm:text-base bg-gradient-to-r ${school.color} text-white hover:shadow-lg hover:scale-[1.02]`}
                    >
                      Enroll Now — ${school.priceUSD}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Syllabus Details */}
      {selectedSchool && (
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2.5 sm:space-x-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                {schoolOptions.find(s => s.id === selectedSchool)?.name} - Syllabus
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Detailed curriculum breakdown</p>
            </div>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {syllabusDetails[selectedSchool]?.weeks.map((item, idx) => (
              <div key={idx} className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg sm:rounded-xl">
                <div className="w-16 sm:w-20 flex-shrink-0">
                  <span className="text-xs sm:text-sm font-bold text-[#323956] dark:text-blue-400">{item.week}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">{item.topic}</h4>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Why Become a Coach */}
      <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-6">
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 sm:h-6 sm:w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-gray-900 dark:text-white">Why Become a Brain Health Coach?</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg sm:rounded-xl">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1">Growing Demand</h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Mental wellness is a booming industry with increasing demand for qualified coaches.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-lg sm:rounded-xl">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
              <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1">Flexible Career</h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Work from anywhere, set your own hours, and build a practice that fits your life.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg sm:rounded-xl">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
              <Heart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1">Make Impact</h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Help others transform their lives through better brain health and mental performance.</p>
          </div>
          <div className="p-3 sm:p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg sm:rounded-xl">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center mb-2 sm:mb-3">
              <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h4 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1">Credentialed</h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Earn recognized certification backed by Dr. Shweta and the Neuro360 platform.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <h3 className="text-sm sm:text-xl font-bold mb-1 sm:mb-2 leading-tight">Ready to Become a Certified Brain Health Coach?</h3>
            <p className="text-blue-200 text-xs sm:text-base">Join Dr. Shweta's 5 Pillars of Mastery program and start your coaching journey today.</p>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <a
              href="https://wa.me/971501382897?text=Hi%20Dr.%20Shweta,%0AI%27m%20interested%20in%20the%205%20Pillars%20of%20Mastery%20program.%0APlease%20schedule%20an%20info%20call."
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none px-3 sm:px-6 py-2 sm:py-3 bg-white text-[#323956] font-semibold rounded-lg sm:rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center text-xs sm:text-base"
            >
              <Calendar className="h-3.5 w-3.5 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 flex-shrink-0" />
              <span>Schedule Info Call</span>
            </a>
            <a
              href="/assets/neurosense brochure.pdf"
              download
              className="flex-1 sm:flex-none px-3 sm:px-6 py-2 sm:py-3 bg-white/20 text-white font-semibold rounded-lg sm:rounded-xl hover:bg-white/30 transition-colors flex items-center justify-center text-xs sm:text-base"
            >
              <ExternalLink className="h-3.5 w-3.5 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 flex-shrink-0" />
              <span>Download Brochure</span>
            </a>
          </div>
        </div>
      </div>

      {/* Early Bird Note */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-start space-x-2 sm:space-x-3">
        <Star className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
          <strong>Early Bird Offer:</strong> Enroll before the next batch starts and get 20% off on any certification program. Limited seats available for each batch.
        </p>
      </div>

      {/* Stripe Payment Modal */}
      {showPaymentModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={`bg-gradient-to-r ${selectedPlan.color} rounded-t-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between`}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-white">Secure Payment</h2>
                  <p className="text-white/70 text-[10px] sm:text-xs">Powered by Stripe</p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              {/* Plan Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">{selectedPlan.name}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">{selectedPlan.duration} · {selectedPlan.format}</p>
                <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                  <span className="text-gray-400 text-xs sm:text-sm">{selectedPlan.price}</span>
                  <span className="text-xl sm:text-2xl font-bold text-[#323956] dark:text-white">USD ${selectedPlan.priceUSD}</span>
                </div>
              </div>

              {/* Name & Email Form */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    <User className="h-4 w-4 text-gray-400" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={paymentName}
                    onChange={(e) => setPaymentName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    <Mail className="h-4 w-4 text-gray-400" />
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={paymentEmail}
                    onChange={(e) => setPaymentEmail(e.target.value)}
                    placeholder="john@example.com"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all"
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
                onClick={handleEnrollPayment}
                disabled={isProcessing || !paymentEmail}
                className={`w-full mt-5 py-3 bg-gradient-to-r ${selectedPlan.color} text-white font-bold rounded-xl hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Pay USD ${selectedPlan.priceUSD} & Enroll</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concierge Care Package */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] px-4 sm:px-6 py-4 sm:py-5">
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-300" />
            Brain Concierge Care Package
          </h2>
          <p className="text-blue-200 text-xs sm:text-sm mt-1">
            Holistic brain wellness with a dedicated team of experts
          </p>
        </div>

        <div className="p-4 sm:p-6">
          {/* Team */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Dedicated Team</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { role: 'Nutritionist', icon: '🥗', desc: 'Personalized brain-nutrition plans' },
                { role: 'Yoga & Wellness Expert', icon: '🧘', desc: 'Movement & breath practices' },
                { role: 'Mantra Therapist', icon: '🕉️', desc: 'Sound healing & mantra therapy' },
              ].map((member) => (
                <div key={member.role} className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="text-2xl mb-2">{member.icon}</div>
                  <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{member.role}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-1">{member.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
              All sessions coordinated via a shared WhatsApp group for seamless communication.
            </p>
          </div>

          {/* Pricing Plans */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 4 Sessions */}
            <div className="border-2 border-gray-200 dark:border-gray-600 rounded-xl p-5 hover:border-[#323956] transition-colors">
              <div className="text-center">
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Starter</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-[#323956] dark:text-white">₹12,000</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">4 Sessions (2 per expert)</p>
              </div>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  2 Nutritionist sessions
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  1 Yoga & Wellness session
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  1 Mantra Therapy session
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Shared WhatsApp support
                </li>
              </ul>
              <button
                onClick={() => window.open('https://w.app/protectmybrain', '_blank')}
                className="w-full mt-4 py-2.5 border-2 border-[#323956] text-[#323956] dark:text-white dark:border-white font-semibold rounded-xl hover:bg-[#323956] hover:text-white dark:hover:bg-white dark:hover:text-gray-900 transition-colors text-sm"
              >
                Inquire Now
              </button>
            </div>

            {/* 8 Sessions */}
            <div className="border-2 border-[#323956] dark:border-blue-500 rounded-xl p-5 relative bg-blue-50/50 dark:bg-blue-900/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-[#323956] text-white text-xs font-bold px-3 py-1 rounded-full">Best Value</span>
              </div>
              <div className="text-center">
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Complete</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-[#323956] dark:text-white">₹21,000</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">8 Sessions (4 per expert)</p>
              </div>
              <ul className="mt-4 space-y-2">
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  4 Nutritionist sessions
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  2 Yoga & Wellness sessions
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  2 Mantra Therapy sessions
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Shared WhatsApp support
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Priority scheduling
                </li>
              </ul>
              <button
                onClick={() => window.open('https://w.app/protectmybrain', '_blank')}
                className="w-full mt-4 py-2.5 bg-gradient-to-r from-[#323956] to-[#4a5578] text-white font-semibold rounded-xl hover:shadow-lg transition-all text-sm"
              >
                Inquire Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NeuroCoaching;
