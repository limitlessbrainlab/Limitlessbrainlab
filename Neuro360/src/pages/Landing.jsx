import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, ShieldCheck, Users, Truck, ArrowDown, Menu, X, MapPin, Instagram, Linkedin, Youtube, Facebook, Heart, Droplets, Stethoscope, Dna, FlaskConical, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';
import BrainParametersSlider from '../components/BrainParametersSlider';
import Footer from '../components/Footer';
import LocationsPopup from '../components/LocationsPopup';
import { useContactForm } from '../context/ContactFormContext';
import { useProfessionalForm } from '../context/ProfessionalFormContext';
import { useProgramForm } from '../context/ProgramFormContext';

const Landing = () => {
  const navigate = useNavigate();
  const { openContactForm } = useContactForm();
  const { openProfessionalForm } = useProfessionalForm();
  const { openProgramForm } = useProgramForm();
  const [showOptions, setShowOptions] = useState(false);
  const [showLocationsPopup, setShowLocationsPopup] = useState(false);
  const [showProtectBrain, setShowProtectBrain] = useState(false);
  const [showFixBrain, setShowFixBrain] = useState(false);
  const [showProtectHero, setShowProtectHero] = useState(false);
  const [showFixHero, setShowFixHero] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sectionsVisible, setSectionsVisible] = useState({});
  const sectionRefs = useRef({});
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const carouselRef = useRef(null);
  const [showFullBio, setShowFullBio] = useState(false);
  const [showBFSPaymentModal, setShowBFSPaymentModal] = useState(false);
  const [bfsPaymentEmail, setBfsPaymentEmail] = useState('');
  const [bfsPaymentName, setBfsPaymentName] = useState('');
  const [bfsProcessing, setBfsProcessing] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const handleBFSPayment = async () => {
    if (!bfsPaymentEmail) {
      toast.error('Please enter your email address');
      return;
    }
    setBfsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/create-assessment-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentName: 'Brain Fitness Score™',
          customerEmail: bfsPaymentEmail,
          customerName: bfsPaymentName.toUpperCase(),
          currency: 'USD',
          amount: 2.99,
          assessmentLink: 'https://form.jotform.com/232184893262057'
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
      setBfsProcessing(false);
    }
  };

  // Stat counter states
  const [stats, setStats] = useState({
    sleep: 0,
    stress: 0,
    mental: 0
  });
  const [statsAnimated, setStatsAnimated] = useState(false);
  const statsRef = useRef(null);

  // Scroll animation states
  const [visibleSections, setVisibleSections] = useState(new Set());
  const observerRefs = useRef([]);

  useEffect(() => {
    setIsVisible(true);

    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setSectionsVisible((prev) => ({
              ...prev,
              [entry.target.dataset.section]: true,
            }));
          }
        });
      },
      { threshold: 0.1 }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  // Stat Counter Animation with Intersection Observer
  useEffect(() => {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !statsAnimated) {
            setStatsAnimated(true);

            // Animate sleep stat (62%)
            animateValue('sleep', 0, 62, 2000);

            // Animate stress stat (77%)
            animateValue('stress', 0, 77, 2000);

            // Animate mental health stat (displayed as "1 in 4")
            animateValue('mental', 0, 25, 2000); // 25 for calculation
          }
        });
      },
      { threshold: 0.3 }
    );

    if (statsRef.current) {
      statsObserver.observe(statsRef.current);
    }

    return () => {
      if (statsRef.current) {
        statsObserver.unobserve(statsRef.current);
      }
    };
  }, [statsAnimated]);

  // Easing function for smooth counter animation
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  const animateValue = (key, start, end, duration) => {
    const startTime = performance.now();

    const updateValue = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      const currentValue = Math.floor(start + (end - start) * easedProgress);

      setStats((prev) => ({
        ...prev,
        [key]: currentValue
      }));

      if (progress < 1) {
        requestAnimationFrame(updateValue);
      }
    };

    requestAnimationFrame(updateValue);
  };

  // Body scroll lock when any overlay/modal is open
  useEffect(() => {
    const anyOpen = mobileMenuOpen || showOptions || showProtectBrain || showFixBrain || showProtectHero || showFixHero || showBFSPaymentModal;
    if (anyOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen, showOptions, showProtectBrain, showFixBrain, showProtectHero, showFixHero, showBFSPaymentModal]);

  // Scroll-triggered animations for all sections
  useEffect(() => {
    const scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.getAttribute('data-scroll-section');
            if (sectionId) {
              setVisibleSections((prev) => new Set([...prev, sectionId]));
              entry.target.classList.add('animate-in');
            }
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    // Observe all elements with data-scroll-section attribute
    const elements = document.querySelectorAll('[data-scroll-section]');
    elements.forEach((el) => {
      scrollObserver.observe(el);
      observerRefs.current.push(el);
    });

    return () => {
      observerRefs.current.forEach((el) => {
        if (el) scrollObserver.unobserve(el);
      });
    };
  }, []);

  // 3D circular carousel rotation for Measure section
  useEffect(() => {
    let rotation = 0;
    const rotationInterval = setInterval(() => {
      rotation += 120; // Rotate 120 degrees (360/3 cards)
      if (carouselRef.current) {
        carouselRef.current.style.transform = `rotateY(${rotation}deg)`;
      }
      setCurrentCardIndex((prev) => (prev + 1) % 3);
    }, 3500); // Rotate every 3.5 seconds

    return () => clearInterval(rotationInterval);
  }, []);

  const handlePersonalSignup = () => {
    setShowProtectHero(true);
  };

  const handleClinicSignup = () => {
    setShowFixHero(true);
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const handleRegister = (userType = 'clinic') => {
    // Navigate to register page with state to pre-select user type
    navigate('/register', {
      state: {
        userType: userType,
        fromLanding: true
      }
    });
  };

  return (
    <div className="w-full min-h-screen bg-white m-0 p-0 overflow-x-hidden">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 py-3 sm:py-4 px-4 sm:px-6 bg-white/80 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          {/* Center Navigation Pill with Logo, Links and Buttons ALL INSIDE */}
          <div className="hidden lg:flex items-center bg-white/95 backdrop-blur-lg rounded-full shadow-lg px-6 py-3 gap-6 border border-gray-100">
            {/* Logo INSIDE Pill */}
            <div className="flex items-center justify-center pr-4 border-r border-gray-200">
              <img
                src="/IBW Logo.png"
                alt="Limitless Brain Lab"
                className="h-[70px] w-[70px] rounded-full object-cover"
              />
            </div>

            {/* Navigation Links */}
            <a href="/" className="text-gray-700 hover:text-gray-900 text-base font-semibold transition-colors whitespace-nowrap">
              Home
            </a>
            <a href="/lbw-updates" className="text-gray-700 hover:text-gray-900 text-base font-semibold transition-colors whitespace-nowrap">
              How It Works
            </a>
            <a href="/lbw" className="text-gray-700 hover:text-gray-900 text-base font-semibold transition-colors whitespace-nowrap">
              Our Method
            </a>
            <button
              onClick={openContactForm}
              className="px-5 py-2 bg-[#323956] text-white rounded-xl text-base font-semibold hover:bg-[#252a45] transition-colors whitespace-nowrap shadow-md"
            >
              Unlock My Brain
            </button>
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden flex items-center justify-between w-full px-1">
            {/* Logo - Left */}
            <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
              <img
                src="/IBW Logo.png"
                alt="Limitless Brain Lab"
                className="h-9 w-9 object-contain rounded-full"
              />
            </div>

            {/* Menu Button - Right */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-800 hover:bg-gray-100 rounded-full transition-all duration-300"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Menu Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Dropdown Menu - slides from top */}
          <div className="fixed top-0 left-0 right-0 bg-white z-50 lg:hidden shadow-2xl transform transition-transform duration-300 rounded-b-2xl">
            {/* Close Button */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center cursor-pointer" onClick={() => { setMobileMenuOpen(false); navigate('/'); }}>
                <img src="/IBW Logo.png" alt="Logo" className="h-9 w-9 object-contain rounded-full" />
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 pb-6">
              {/* Navigation Links */}
              <div className="flex flex-col space-y-1">
                <a href="/" className="text-gray-900 hover:text-[#323956] hover:bg-gray-50 text-base font-semibold transition-colors py-3 px-3 rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                  Home
                </a>
                <a href="/lbw-updates" className="text-gray-900 hover:text-[#323956] hover:bg-gray-50 text-base font-semibold transition-colors py-3 px-3 rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                  How It Works
                </a>
                <a href="/lbw" className="text-gray-900 hover:text-[#323956] hover:bg-gray-50 text-base font-semibold transition-colors py-3 px-3 rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                  Our Method
                </a>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openContactForm();
                }}
                className="mt-5 px-6 py-3 bg-[#323956] text-white rounded-xl text-base font-semibold hover:bg-[#252a45] transition-colors text-center shadow-md w-full"
              >
                Unlock My Brain
              </button>
            </div>
          </div>
        </>
      )}

      {/* Hero Section - Myndlift Style */}
      <section
        id="start"
        className="relative w-full bg-white pt-[72px] sm:pt-3 pb-4 sm:pb-6 px-2 sm:px-3 md:px-3 lg:px-4"
        style={{ opacity: 1, transform: 'none' }}
      >
        {/* Hero Container with Rounded Corners */}
        <div className="w-[96%] sm:w-[98%] lg:w-[99.5%] mx-auto relative overflow-hidden rounded-[1.25rem] sm:rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3rem] border border-gray-200/60"
          style={{
            minHeight: 'clamp(350px, 50vh, 500px)'
          }}>

          {/* Background */}
          <div className="absolute inset-0 bg-[#EEF0F5]" />


          {/* Content Section */}
          <section
            className="relative z-10 h-full flex items-center px-3 sm:px-6 md:px-12 lg:px-20 py-6 sm:py-12 md:py-14"
            style={{ opacity: 1, transform: 'none' }}
          >
            <div className="flex flex-col-reverse lg:flex-row items-center justify-between w-full gap-4 sm:gap-8 lg:gap-12">
            <div className="max-w-full sm:max-w-2xl lg:max-w-xl flex-shrink-0" style={{ animation: 'heroSlideLeft 1s ease-out forwards' }}>
              {/* Text Container */}
              <div className="mb-5 sm:mb-8">
                {/* Main Heading */}
                <div className="framer-37bogi animate-slide-down text-center lg:text-left" style={{ justifyContent: 'center' }}>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-3 sm:mb-6">
                    The Future Of Personalized Brain Care Is Here
                  </h1>
                </div>

                {/* Subtitle */}
                <div className="framer-fun1vz animate-slide-up delay-200 text-center lg:text-left" style={{ justifyContent: 'center' }}>
                  <h5 className="text-sm sm:text-lg md:text-2xl lg:text-3xl font-bold text-gray-800 mb-6 sm:mb-8" style={{ letterSpacing: '0.05em' }}>
                    UNLOCK & TRANSFORM YOUR BRAIN AT LIMITLESS BRAIN LAB
                  </h5>
                </div>

                {/* Description Text */}
                <div className="mt-4 sm:mt-6 animate-fade-in-up delay-400">
                  <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-600 leading-relaxed max-w-2xl text-center sm:text-left">
                    Comprehensive brain health solutions targeting stress management, enhanced focus, improved mood and memory, better sleep, and preventive care for optimal brain wellness. Blending the wisdom of yoga, pranayama, and sacred sound practices with modern neuroscience to create a truly holistic brain health experience.
                  </p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-row gap-2 sm:gap-4 justify-center lg:justify-start flex-wrap">
                <button
                  onClick={() => setShowProtectHero(true)}
                  className="whitespace-nowrap cursor-pointer animate-slide-in-left delay-600 bg-[#323956] hover:bg-[#232D3C] text-white px-4 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl text-xs sm:text-base md:text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-md text-center"
                >
                  PROTECT MY BRAIN
                </button>

                <button
                  onClick={() => setShowFixHero(true)}
                  className="whitespace-nowrap cursor-pointer animate-slide-in-right delay-600 bg-gray-900 hover:bg-black text-white px-4 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl text-xs sm:text-base md:text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg text-center"
                >
                  TREAT MY BRAIN
                </button>
              </div>

              {/* Trust & Stats Bar */}
              <div className="mt-6 sm:mt-8 animate-fade-in-up delay-800">
                <p className="text-gray-500 text-xs sm:text-base text-center lg:text-left mb-2 sm:mb-3">Trusted by Over <span className="font-bold text-gray-800">50K+</span> Customers</p>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 sm:gap-4">
                  {/* Google Review */}
                  <div className="flex items-center gap-1.5 sm:gap-3 bg-gray-100 backdrop-blur-sm rounded-full px-2.5 py-1.5 sm:px-6 sm:py-3">
                    <svg className="w-5 h-5 sm:w-8 sm:h-8 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <span className="text-gray-800 font-bold text-sm sm:text-lg">5.0</span>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => (
                            <svg key={i} className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                          ))}
                        </div>
                      </div>
                      <span className="text-gray-400 text-[9px] sm:text-sm">442 Google reviews</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 sm:gap-8">
                    <div className="text-center">
                      <p className="text-gray-800 font-bold text-sm sm:text-2xl">50K+</p>
                      <p className="text-gray-400 text-[9px] sm:text-sm">Customers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-800 font-bold text-sm sm:text-2xl">5k+</p>
                      <p className="text-gray-400 text-[9px] sm:text-sm">Brain maps</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              {/* Dr. Sweta Image - Right Side */}
              <div className="flex flex-shrink-0 flex-col items-center justify-end relative" style={{ animation: 'heroSlideRight 1s ease-out 0.3s forwards', opacity: 0 }}>
                <img
                  src="/dr.sweta-removebg-preview.png"
                  alt="Dr. Sweta"
                  className="w-[160px] sm:w-[280px] md:w-[350px] lg:w-[420px] xl:w-[500px] max-w-[75vw] h-auto max-h-[200px] sm:max-h-none object-contain object-top drop-shadow-2xl"
                />

                {/* Stats below image */}
                <div className="flex items-start justify-center gap-5 mt-4">
                  {/* Patients Treated */}
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                    </svg>
                    <p className="text-gray-800 font-bold text-xs sm:text-sm">50000+</p>
                    <p className="text-gray-400 text-[9px] sm:text-[10px]">Patients Treated</p>
                  </div>

                  {/* Gold Medals */}
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-4.5A3.375 3.375 0 0012.75 10.5h-1.5A3.375 3.375 0 007.5 14.25v4.5m4.5-12V3.75m0 3a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                    </svg>
                    <p className="text-gray-800 font-bold text-xs sm:text-sm">13+</p>
                    <p className="text-gray-400 text-[9px] sm:text-[10px]">Gold Medals</p>
                  </div>

                  {/* Views */}
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <p className="text-gray-800 font-bold text-xs sm:text-sm">30 Million</p>
                    <p className="text-gray-400 text-[9px] sm:text-[10px] leading-tight">+ <br/>Views Various social<br/>media</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Scroll Indicator - Arrow Down */}
          <div
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 hidden sm:block"
            style={{ borderRadius: 'inherit' }}
          >
            <div className="flex flex-col items-center">
              <ArrowDown
                className="h-6 w-6 text-gray-400"
                style={{
                  animation: 'bounce-smooth 2s ease-in-out infinite'
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Options Modal - Fixed Position Overlay */}
      {showOptions && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
            onClick={() => setShowOptions(false)}
            style={{
              animation: 'fadeIn 0.3s ease-out'
            }}
          />

          {/* Modal Content */}
          <div
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[101] w-[95%] max-w-[calc(100vw-16px)] sm:w-auto"
            style={{
              animation: 'slideUp 0.4s ease-out'
            }}
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md mx-auto shadow-2xl">
              <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">
                {selectedType === 'personal' ? "Personal Account" : "Clinic Account"}
              </h3>
              <p className="text-xl text-gray-600 mb-6 text-center">
                {selectedType === 'personal'
                  ? "Get started with your personal neurofeedback journey"
                  : "Register your clinic for professional neurofeedback services"
                }
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleRegister(selectedType === 'personal' ? 'patient' : 'clinic')}
                  className="bg-[#323956] hover:bg-[#232D3C] text-white px-6 py-3.5 rounded-xl text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover-shine btn-ripple animate-pulse-glow"
                >
                  Create New Account
                </button>
                <button
                  onClick={handleLogin}
                  className="bg-gray-900 hover:bg-black text-white px-6 py-3.5 rounded-xl text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg hover-shine btn-ripple"
                >
                  I Already Have an Account
                </button>
                <button
                  onClick={() => setShowOptions(false)}
                  className="text-sm text-gray-600 hover:text-gray-900 underline mt-2 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Protect My Brain Modal */}
      {showProtectBrain && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-md"
            onClick={() => setShowProtectBrain(false)}
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setShowProtectBrain(false)}
          >
            <div
              className="bg-white rounded-2xl w-[95vw] max-w-xl shadow-2xl relative max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideUp 0.4s ease-out' }}
            >
              {/* Close button */}
              <button
                onClick={() => setShowProtectBrain(false)}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all z-10"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Decorative circles */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#F5D05D]/8 rounded-full -translate-y-1/2 translate-x-1/3"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#F5D05D]/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>

              <div className="relative p-4 sm:p-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#F5D05D] to-[#e5c04d] rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#F5D05D]/30">
                    <svg className="w-6 h-6 text-[#323956]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-wide">PROTECT MY BRAIN</h3>
                  <p className="text-[#d4a017] text-xs sm:text-sm italic mt-1">"Have You Ever Tested Your Brain Fitness?"</p>
                  <p className="text-gray-500 text-xs mt-1">Optimize before decline. Protect before disease.</p>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                {/* How it Works + Take Expert Advice */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* How it works */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <h4 className="text-gray-900 text-sm font-bold mb-3 text-center italic">How it works</h4>
                    {[
                      { num: '1', title: 'Neuro Coach Session', points: ['Personalized brain wellness guidance.', 'Assess cognitive health status.', 'Identify areas for improvement.'] },
                      { num: '2', title: 'Custom Wellness Plan', points: ['Tailored neuro-habits & routines.', 'Lifestyle & habit optimization.'] },
                      { num: '3', title: 'Track Progress', points: ['Stay consistent with your plan.', 'Monitor results over time.', 'Achieve improved well-being.'] }
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 mb-3 last:mb-0">
                        <div className="flex flex-col items-center">
                          <div className="w-9 h-9 border-2 border-[#323956] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[#323956] text-sm font-bold">{step.num}</span>
                          </div>
                          {i < 2 && <div className="w-px flex-1 bg-gray-300 mt-1"></div>}
                        </div>
                        <div className="pb-1 pt-1">
                          <p className="text-gray-900 text-[15px] font-bold leading-tight">{step.title}</p>
                          {step.points.map((p, j) => (
                            <p key={j} className="text-gray-500 text-xs leading-snug mt-1.5 flex items-start gap-2">
                              <span className="inline-block w-1.5 h-1.5 bg-[#d4a017] rounded-full mt-1 flex-shrink-0"></span>
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4 justify-center mt-8">
                    <h4 className="text-gray-900 text-sm font-bold text-center">Take Expert Advice</h4>
                    {/* Appointment with Neuro Coach */}
                    <button onClick={() => { setShowProtectBrain(false); openContactForm('protect-my-brain'); }} className="relative hover:opacity-90 transition-all group block mt-6 w-full text-left cursor-pointer">
                      <img src="/Gemini_Generated_Image_4wsbhk4wsbhk4wsb-removebg-preview.png" alt="Neuro Coach" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">Inquire Now</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </button>
                    {/* WhatsApp Chat */}
                    <a href="https://w.app/protectmybrain" target="_blank" rel="noopener noreferrer" className="relative hover:opacity-90 transition-all group block mt-6">
                      <img src="/Gemini_Generated_Image_qhdn3cqhdn3cqhdn-removebg-preview.png" alt="Neuro Coach" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">WhatsApp Chat</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </a>
                    {/* Trust badges */}
                    <div className="flex items-start justify-center gap-4 mt-auto">
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Online<br/>Support</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">2k+ Trusted<br/>Reviews</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Send<br/>Message</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </>
      )}

      {/* Treat My Brain Modal */}
      {showFixBrain && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-md"
            onClick={() => setShowFixBrain(false)}
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setShowFixBrain(false)}
          >
            <div
              className="bg-white rounded-2xl w-[95vw] max-w-xl shadow-2xl relative max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideUp 0.4s ease-out' }}
            >
              {/* Close button */}
              <button
                onClick={() => setShowFixBrain(false)}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all z-10"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Decorative circles */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/8 rounded-full -translate-y-1/2 translate-x-1/3"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full translate-y-1/2 -translate-x-1/4"></div>

              <div className="relative p-4 sm:p-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/30">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-wide">TREAT MY BRAIN</h3>
                  <p className="text-cyan-600 text-xs sm:text-sm italic mt-1">"Comprehensive Integrative Neuromodulation"</p>
                  <p className="text-gray-500 text-xs mt-1">Science + Ancient Wisdom. Precision + Personalization.</p>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                {/* How it Works + Take Expert Advice */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* How it works */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <h4 className="text-gray-900 text-sm font-bold mb-3 text-center italic">How it works</h4>
                    {[
                      { num: '1', title: 'Neurological Assessment', points: ['Consultation with a neurologist.', 'EEG-based brain function evaluation (Neurosense).', 'Identification of individual brain patterns.'] },
                      { num: '2', title: 'Personalized Brain Protocol', points: ['Data-informed, individualized brain care approach.', 'Integration of neuromodulation insights from ancient wisdom.', 'Inclusion of integrative practices aligned with brain patterns.'] },
                      { num: '3', title: 'Track Recovery', points: ['Monitor brain improvements.', 'Adjust protocols over time.', 'Achieve lasting results.'] }
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 mb-3 last:mb-0">
                        <div className="flex flex-col items-center">
                          <div className="w-9 h-9 border-2 border-[#323956] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[#323956] text-sm font-bold">{step.num}</span>
                          </div>
                          {i < 2 && <div className="w-px flex-1 bg-gray-300 mt-1"></div>}
                        </div>
                        <div className="pb-1 pt-1">
                          <p className="text-gray-900 text-[15px] font-bold leading-tight">{step.title}</p>
                          {step.points.map((p, j) => (
                            <p key={j} className="text-gray-500 text-xs leading-snug mt-1.5 flex items-start gap-2">
                              <span className="inline-block w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1 flex-shrink-0"></span>
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Book Neurologist Appointment */}
                  <div className="flex flex-col gap-4 justify-center mt-8">
                    <h4 className="text-gray-900 text-sm font-bold text-center">Take Expert Advice</h4>
                    {/* Appointment with Neurologist */}
                    <button onClick={() => { setShowFixBrain(false); openContactForm('treat-my-brain'); }} className="relative hover:opacity-90 transition-all group block mt-6 w-full text-left cursor-pointer">
                      <img src="/Gemini_Generated_Image_4wsbhk4wsbhk4wsb-removebg-preview.png" alt="Neurologist" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">Appointment with<br/>Neurologist</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </button>
                    {/* WhatsApp Chat */}
                    <a href="https://w.app/treatmybrain" target="_blank" rel="noopener noreferrer" className="relative hover:opacity-90 transition-all group block mt-6">
                      <img src="/Gemini_Generated_Image_qhdn3cqhdn3cqhdn-removebg-preview.png" alt="Neurologist" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">WhatsApp Chat</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </a>
                    {/* Trust badges */}
                    <div className="flex items-start justify-center gap-4 mt-auto">
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Online<br/>Support</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">2k+ Trusted<br/>Reviews</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Send<br/>Message</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </>
      )}

      {/* Hero Protect My Brain Popup (with full text) */}
      {showProtectHero && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-md"
            onClick={() => setShowProtectHero(false)}
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setShowProtectHero(false)}
          >
            <div
              className="bg-white rounded-2xl w-[95vw] max-w-2xl shadow-2xl relative max-h-[92vh] overflow-y-auto overflow-x-hidden"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideUp 0.4s ease-out' }}
            >
              <button
                onClick={() => setShowProtectHero(false)}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all z-10"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="relative p-4 sm:p-6 md:p-8">
                {/* Header */}
                <div className="text-center mb-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 bg-gradient-to-br from-[#F5D05D] to-[#e5c04d] rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#F5D05D]/30">
                    <svg className="w-5 h-5 sm:w-7 sm:h-7 text-[#323956]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-wide">PROTECT MY BRAIN</h3>
                  <p className="text-[#d4a017] text-xs sm:text-sm md:text-base italic mt-1 sm:mt-2">"Have You Ever Tested Your Brain Fitness?"</p>
                  <p className="text-gray-500 text-xs sm:text-sm mt-1">Optimize before decline. Protect before disease.</p>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-5"></div>

                {/* Program Content */}
                <div className="mb-5">
                  <p className="text-gray-800 text-sm sm:text-base font-semibold mb-3">Our Proactive Brain Fitness Program helps you:</p>
                  <div className="space-y-2.5 mb-4">
                    {[
                      'Detect early stress patterns',
                      'Monitor attention, memory & executive function',
                      'Customize neuro-habits to prevent dementia & cognitive decline',
                      'Ancient Neuro Regulation Techniques (Yoga-based breathing & Meditation)',
                      'Improve productivity & emotional regulation',
                      'Build resilience against burnout'
                    ].map((item, i) => (
                      <p key={i} className="text-gray-600 text-sm flex items-start gap-3">
                        <span className="inline-block w-2 h-2 bg-[#d4a017] rounded-full mt-1.5 flex-shrink-0"></span>
                        {item}
                      </p>
                    ))}
                  </div>
                  <div className="bg-[#fdf8e8] border-l-4 border-[#d4a017] rounded-r-lg px-4 py-3">
                    <p className="text-gray-700 text-sm italic leading-relaxed">You don't wait for a heart attack to test your heart.<br/>Why wait for cognitive decline to test your brain?</p>
                  </div>
                </div>

                {/* How it Works + Take Expert Advice */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  {/* How it works */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <h4 className="text-gray-900 text-sm font-bold mb-3 text-center italic">How it works</h4>
                    {[
                      { num: '1', title: 'Neuro Coach Session', points: ['Personalized brain wellness guidance.', 'Assess cognitive health status.', 'Identify areas for improvement.'] },
                      { num: '2', title: 'Custom Wellness Plan', points: ['Tailored neuro-habits & routines.', 'Lifestyle & habit optimization.'] },
                      { num: '3', title: 'Track Progress', points: ['Stay consistent with your plan.', 'Monitor results over time.', 'Achieve improved well-being.'] }
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 mb-3 last:mb-0">
                        <div className="flex flex-col items-center">
                          <div className="w-9 h-9 border-2 border-[#323956] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[#323956] text-sm font-bold">{step.num}</span>
                          </div>
                          {i < 2 && <div className="w-px flex-1 bg-gray-300 mt-1"></div>}
                        </div>
                        <div className="pb-1 pt-1">
                          <p className="text-gray-900 text-[15px] font-bold leading-tight">{step.title}</p>
                          {step.points.map((p, j) => (
                            <p key={j} className="text-gray-500 text-xs leading-snug mt-1.5 flex items-start gap-2">
                              <span className="inline-block w-1.5 h-1.5 bg-[#d4a017] rounded-full mt-1 flex-shrink-0"></span>
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4 justify-center mt-8">
                    <h4 className="text-gray-900 text-sm font-bold text-center">Take Expert Advice</h4>
                    {/* Appointment with Neuro Coach */}
                    <button onClick={() => { setShowProtectHero(false); openContactForm('protect-my-brain'); }} className="relative hover:opacity-90 transition-all group block mt-6 w-full text-left cursor-pointer">
                      <img src="/Gemini_Generated_Image_4wsbhk4wsbhk4wsb-removebg-preview.png" alt="Neuro Coach" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">Inquire Now</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </button>
                    {/* WhatsApp Chat */}
                    <a href="https://w.app/protectmybrain" target="_blank" rel="noopener noreferrer" className="relative hover:opacity-90 transition-all group block mt-6">
                      <img src="/Gemini_Generated_Image_qhdn3cqhdn3cqhdn-removebg-preview.png" alt="Neuro Coach" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">WhatsApp Chat</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </a>
                    {/* Trust badges */}
                    <div className="flex items-start justify-center gap-4 mt-auto">
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Online<br/>Support</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">2k+ Trusted<br/>Reviews</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#d4a017] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Send<br/>Message</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => { setShowProtectHero(false); navigate('/neurosense-booking?type=individual&highlight=neurosense-qeeg'); }}
                  className="w-full bg-[#F5D05D] hover:bg-[#e5c04d] text-[#323956] px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-sm sm:text-lg font-bold transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Inquire Now
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hero Treat My Brain Popup (with full text) */}
      {showFixHero && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-md"
            onClick={() => setShowFixHero(false)}
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-2 sm:p-4"
            onClick={() => setShowFixHero(false)}
          >
            <div
              className="bg-white rounded-2xl w-[95vw] max-w-2xl shadow-2xl relative max-h-[92vh] overflow-y-auto overflow-x-hidden"
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideUp 0.4s ease-out' }}
            >
              <button
                onClick={() => setShowFixHero(false)}
                className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all z-10"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="relative p-4 sm:p-6 md:p-8">
                {/* Header */}
                <div className="text-center mb-5">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/30">
                    <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-wide">TREAT MY BRAIN</h3>
                  <p className="text-cyan-600 text-xs sm:text-sm md:text-base italic mt-1 sm:mt-2">"Comprehensive Integrative Neuromodulation"</p>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-5"></div>

                {/* For individuals facing */}
                <div className="mb-5">
                  <p className="text-gray-800 text-sm sm:text-base font-semibold mb-3">For individuals facing:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5 mb-5">
                    {[
                      'Neurodegenerative Conditions',
                      'Autism Spectrum',
                      'Learning Disabilities (LD)',
                      'ADHD / Attention Deficit',
                      'Depression',
                      'Anxiety',
                      'Cognitive Fatigue'
                    ].map((item, i) => (
                      <p key={i} className="text-gray-600 text-sm flex items-start gap-3">
                        <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full mt-1.5 flex-shrink-0"></span>
                        {item}
                      </p>
                    ))}
                  </div>

                  <p className="text-gray-800 text-sm sm:text-base font-semibold mb-3">We offer non-drug, integrative neuromodulation protocols combining:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                    {[
                      'Clinical EEG-based guidance',
                      'Neurofeedback',
                      'Yoga-based breathing',
                      'Meditation',
                      'Chanting & ancient neuro-regulation practices',
                      'Photobiomodulation',
                      'Supplement optimization'
                    ].map((item, i) => (
                      <p key={i} className="text-gray-600 text-sm flex items-start gap-3">
                        <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full mt-1.5 flex-shrink-0"></span>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>

                {/* How it Works + Take Expert Advice */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  {/* How it works */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                    <h4 className="text-gray-900 text-sm font-bold mb-3 text-center italic">How it works</h4>
                    {[
                      { num: '1', title: 'Neurological Assessment', points: ['Consultation with a neurologist.', 'EEG-based brain function evaluation (Neurosense).', 'Identification of individual brain patterns.'] },
                      { num: '2', title: 'Personalized Brain Protocol', points: ['Data-informed, individualized brain care approach.', 'Integration of neuromodulation insights from ancient wisdom.', 'Inclusion of integrative practices aligned with brain patterns.'] },
                      { num: '3', title: 'Track Recovery', points: ['Monitor brain improvements.', 'Adjust protocols over time.', 'Achieve lasting results.'] }
                    ].map((step, i) => (
                      <div key={i} className="flex gap-3 mb-3 last:mb-0">
                        <div className="flex flex-col items-center">
                          <div className="w-9 h-9 border-2 border-[#323956] rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-[#323956] text-sm font-bold">{step.num}</span>
                          </div>
                          {i < 2 && <div className="w-px flex-1 bg-gray-300 mt-1"></div>}
                        </div>
                        <div className="pb-1 pt-1">
                          <p className="text-gray-900 text-[15px] font-bold leading-tight">{step.title}</p>
                          {step.points.map((p, j) => (
                            <p key={j} className="text-gray-500 text-xs leading-snug mt-1.5 flex items-start gap-2">
                              <span className="inline-block w-1.5 h-1.5 bg-cyan-500 rounded-full mt-1 flex-shrink-0"></span>
                              {p}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4 justify-center mt-8">
                    <h4 className="text-gray-900 text-sm font-bold text-center">Take Expert Advice</h4>
                    {/* Appointment with Neurologist */}
                    <button onClick={() => { setShowFixHero(false); openContactForm('treat-my-brain'); }} className="relative hover:opacity-90 transition-all group block mt-6 w-full text-left cursor-pointer">
                      <img src="/Gemini_Generated_Image_4wsbhk4wsbhk4wsb-removebg-preview.png" alt="Neurologist" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">Appointment with<br/>Neurologist</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </button>
                    {/* WhatsApp Chat */}
                    <a href="https://w.app/treatmybrain" target="_blank" rel="noopener noreferrer" className="relative hover:opacity-90 transition-all group block mt-6">
                      <img src="/Gemini_Generated_Image_qhdn3cqhdn3cqhdn-removebg-preview.png" alt="Neurologist" className="absolute -top-6 left-2 h-[60px] w-[45px] sm:h-[80px] sm:w-[60px] object-cover object-top drop-shadow-lg z-10" />
                      <div className="bg-[#1a1a2e] rounded-full flex items-center justify-end px-4 py-3 shadow-lg pl-[50px] sm:pl-[75px]">
                        <p className="text-white text-xs font-bold leading-tight text-right mr-3">WhatsApp Chat</p>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform shadow-sm flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-[#1a1a2e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </div>
                      </div>
                    </a>
                    {/* Trust badges */}
                    <div className="flex items-start justify-center gap-4 mt-auto">
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Online<br/>Support</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">2k+ Trusted<br/>Reviews</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2 text-center flex-1 border border-gray-100">
                        <svg className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        <p className="text-gray-700 text-[10px] font-semibold leading-tight">Send<br/>Message</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => { setShowFixHero(false); openProfessionalForm(); }}
                  className="w-full bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-sm sm:text-lg font-bold transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Treat My Brain
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        /* Neural Pulse Hero Animation */
        @keyframes neuralPulse {
          0%, 100% {
            opacity: 0.7;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
        }

        .neural-pulse-hero {
          animation: neuralPulse 8s ease-in-out infinite;
        }

        /* Smooth Section Fade */
        @keyframes sectionFadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .section-fade {
          animation: sectionFadeIn 0.8s ease-out forwards;
        }

        /* Medical-Grade Card Hover */
        .medical-card {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(200, 200, 200, 0.3);
        }

        .medical-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 0 20px rgba(0, 150, 255, 0.3);
          border-color: rgba(0, 200, 255, 0.6);
        }

        /* Scroll-triggered animations */
        .scroll-fade-left {
          opacity: 0;
          transform: translateX(-100px) translateY(20px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-fade-left.animate-in {
          opacity: 1;
          transform: translateX(0) translateY(0);
        }

        .scroll-fade-right {
          opacity: 0;
          transform: translateX(100px) translateY(20px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-fade-right.animate-in {
          opacity: 1;
          transform: translateX(0) translateY(0);
        }

        .scroll-fade-up {
          opacity: 0;
          transform: translateY(60px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-fade-up.animate-in {
          opacity: 1;
          transform: translateY(0);
        }

        .scroll-fade-down {
          opacity: 0;
          transform: translateY(-60px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-fade-down.animate-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* Staggered animations for children */
        .stagger-item {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .animate-in .stagger-item:nth-child(1) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.1s;
        }

        .animate-in .stagger-item:nth-child(2) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.2s;
        }

        .animate-in .stagger-item:nth-child(3) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.3s;
        }

        .animate-in .stagger-item:nth-child(4) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.4s;
        }

        .animate-in .stagger-item:nth-child(5) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.5s;
        }

        .animate-in .stagger-item:nth-child(6) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.6s;
        }

        /* Alternating card animations - odd from left, even from right */
        .card-slide-alternate:nth-child(odd) {
          opacity: 0;
          transform: translateX(-120px) translateY(40px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .card-slide-alternate:nth-child(even) {
          opacity: 0;
          transform: translateX(120px) translateY(40px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .animate-in .card-slide-alternate:nth-child(odd) {
          opacity: 1;
          transform: translateX(0) translateY(0);
        }

        .animate-in .card-slide-alternate:nth-child(even) {
          opacity: 1;
          transform: translateX(0) translateY(0);
        }

        /* Staggered delays for alternating cards */
        .animate-in .card-slide-alternate:nth-child(1) {
          transition-delay: 0.15s;
        }

        .animate-in .card-slide-alternate:nth-child(2) {
          transition-delay: 0.3s;
        }

        .animate-in .card-slide-alternate:nth-child(3) {
          transition-delay: 0.45s;
        }

        .animate-in .card-slide-alternate:nth-child(4) {
          transition-delay: 0.6s;
        }

        .animate-in .card-slide-alternate:nth-child(5) {
          transition-delay: 0.75s;
        }

        .animate-in .card-slide-alternate:nth-child(6) {
          transition-delay: 0.9s;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes bounce-smooth {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes floatUpDown {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes floatLeftRight {
          0%, 100% {
            transform: translateX(0px);
          }
          50% {
            transform: translateX(15px);
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes rotateIn {
          from {
            opacity: 0;
            transform: rotate(-10deg) scale(0.9);
          }
          to {
            opacity: 1;
            transform: rotate(0deg) scale(1);
          }
        }

        @keyframes brainwave {
          0%, 100% {
            transform: scaleX(1) scaleY(1);
            opacity: 0.8;
          }
          50% {
            transform: scaleX(1.05) scaleY(0.95);
            opacity: 1;
          }
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(0, 137, 123, 0.4);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 0 20px 10px rgba(0, 137, 123, 0);
          }
        }

        @keyframes neuronPulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(0.98);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 10px rgba(0, 137, 123, 0.2);
          }
          50% {
            box-shadow: 0 0 25px rgba(0, 137, 123, 0.6);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        .animate-slide-up {
          animation: slideUp 0.8s ease-out forwards;
        }

        .animate-slide-down {
          animation: slideDown 0.8s ease-out forwards;
        }

        .animate-slide-in-left {
          animation: slideInLeft 0.8s ease-out forwards;
        }

        .animate-slide-in-right {
          animation: slideInRight 0.8s ease-out forwards;
        }

        .animate-float-up-down {
          animation: floatUpDown 3s ease-in-out infinite;
        }

        .animate-float-left-right {
          animation: floatLeftRight 4s ease-in-out infinite;
        }

        .animate-scale-in {
          animation: scaleIn 0.6s ease-out forwards;
        }

        .animate-rotate-in {
          animation: rotateIn 0.8s ease-out forwards;
        }

        .animate-brainwave {
          animation: brainwave 3s ease-in-out infinite;
        }

        .animate-pulse-card {
          animation: pulse 2s ease-in-out infinite;
        }

        .animate-neuron {
          animation: neuronPulse 2.5s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
        }

        .animate-fade-in-down {
          animation: fadeInDown 0.8s ease-out forwards;
        }

        .animate-glow {
          animation: glow 2s ease-in-out infinite;
        }

        .animate-shimmer {
          background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
          background-size: 1000px 100%;
          animation: shimmer 2s infinite;
        }

        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
        .delay-600 { animation-delay: 0.6s; }
        .delay-700 { animation-delay: 0.7s; }
        .delay-800 { animation-delay: 0.8s; }
        .delay-900 { animation-delay: 0.9s; }
        .delay-1000 { animation-delay: 1s; }

        @keyframes dashFlow {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: 0 40px;
          }
        }

        @keyframes dotPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            box-shadow: 0 0 0 0 rgba(0, 137, 123, 0.7);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
            box-shadow: 0 0 0 10px rgba(0, 137, 123, 0);
          }
        }

        @keyframes lineGrow {
          from {
            height: 0;
            opacity: 0;
          }
          to {
            height: 100%;
            opacity: 1;
          }
        }
      `}</style>

      {/* Featured On Section */}
      <section className="py-10 sm:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#323956] text-center mb-12 tracking-tight scroll-fade-down" data-scroll-section="featured-title">
            CHANGING ONE BRAIN AT A TIME
          </h2>

          {/* Media Logos */}
          <div className="py-6 px-4 overflow-hidden" data-scroll-section="featured-logos">
            <div className="flex items-center justify-center gap-6 sm:gap-10 md:gap-14 lg:gap-20 flex-wrap mx-auto">
              {[
                { src: '/tedx-logo.png', alt: 'TEDx' },
                { src: '/gulf news.png', alt: 'Gulf News' },
                { src: '/dubaione.png', alt: 'Dubai One' },
                { src: '/toi.png', alt: 'TOI' },
              ].map((logo, i) => (
                <img
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  className="h-6 sm:h-8 md:h-12 w-auto object-contain transform transition-all duration-500 hover:scale-110 opacity-0 animate-logo-reveal"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Protect & Treat My Brain Cards */}
      <section className="py-10 sm:py-20 md:py-24 bg-gradient-to-b from-[#f8f9fc] to-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-[#c9a227]/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/3"></div>
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/3"></div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#323956] mb-4">
              Your Brain. Your Choice.
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
              Whether you want to safeguard your cognitive future or address existing concerns, we have a path for you.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Protect My Brain Card */}
            <div className="group bg-white rounded-2xl p-5 sm:p-8 md:p-10 flex flex-col border-2 border-[#c9a227]/20 hover:border-[#c9a227]/60 transition-all duration-500 hover:shadow-2xl hover:shadow-[#c9a227]/10 shadow-lg hover:-translate-y-1 relative overflow-hidden">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c9a227] to-[#e5c04d]"></div>
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#c9a227]/15 to-[#c9a227]/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-[#c9a227]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[#323956] mb-3">Protect My Brain</h3>
              <p className="text-gray-500 mb-6 leading-relaxed text-sm sm:text-[15px]">
                Optimize before decline. Protect before disease. Take proactive steps to safeguard your brain's peak performance.
              </p>
              <ul className="space-y-3.5 mb-8 flex-grow">
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-[#c9a227] flex-shrink-0"></span>
                  Detect early stress patterns
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-[#c9a227] flex-shrink-0"></span>
                  Monitor cognitive function
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-[#c9a227] flex-shrink-0"></span>
                  Build neural resilience
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-[#c9a227] flex-shrink-0"></span>
                  Neuro-regulation techniques
                </li>
              </ul>
              <button
                onClick={() => setShowProtectBrain(true)}
                className="w-full py-3 sm:py-4 rounded-xl bg-gradient-to-r from-[#c9a227] to-[#d4b03a] hover:from-[#b8911f] hover:to-[#c9a227] text-white font-semibold text-base sm:text-lg transition-all duration-300 hover:shadow-lg hover:shadow-[#c9a227]/30 transform hover:scale-[1.02]"
              >
                Protect My Brain
              </button>
            </div>

            {/* Treat My Brain Card */}
            <div className="group bg-white rounded-2xl p-5 sm:p-8 md:p-10 flex flex-col border-2 border-cyan-400/20 hover:border-cyan-400/60 transition-all duration-500 hover:shadow-2xl hover:shadow-cyan-500/10 shadow-lg hover:-translate-y-1 relative overflow-hidden">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 to-blue-500"></div>
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-cyan-500/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[#323956] mb-3">Treat My Brain</h3>
              <p className="text-gray-500 mb-6 leading-relaxed text-sm sm:text-[15px]">
                Comprehensive Integrative Neuromodulation. Address existing neurological and cognitive challenges head-on.
              </p>
              <ul className="space-y-3.5 mb-8 flex-grow">
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0"></span>
                  Dementia and Memory
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0"></span>
                  ADHD & Attention Disorders
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0"></span>
                  Insomnia & sleep issues
                </li>
                <li className="flex items-center gap-3 text-gray-700 text-sm sm:text-[15px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0"></span>
                  Learning Disabilities
                </li>
              </ul>
              <button
                onClick={() => setShowFixBrain(true)}
                className="w-full py-3 sm:py-4 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white font-semibold text-base sm:text-lg transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/30 transform hover:scale-[1.02]"
              >
                Treat My Brain
              </button>
            </div>
          </div>
        </div>
      </section>


      {/* Why Brain Fitness Section */}
      <section className="py-10 sm:py-20 md:py-24 bg-white relative overflow-hidden">
        {/* Subtle background elements */}
        <div className="hidden sm:block absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-[#c9a227]/[0.04] rounded-full blur-[100px]"></div>
        <div className="hidden sm:block absolute bottom-[-10%] right-[-5%] w-[350px] h-[350px] bg-[#323956]/[0.04] rounded-full blur-[100px]"></div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Title */}
          <div className="text-center scroll-fade-down" data-scroll-section="brain-fitness-title">
            <div className="inline-flex items-center gap-2 bg-[#323956] text-white text-xs sm:text-sm font-medium px-5 py-2 rounded-full mb-6">
              <Brain className="w-4 h-4 text-[#c9a227]" />
              Think About It
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#323956] mb-3 tracking-tight">
              Why Brain Fitness?
            </h2>
            <p className="text-lg sm:text-xl text-gray-400 mb-14 sm:mb-16">
              You regularly test your:
            </p>
          </div>

          {/* Health Test Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-5 mb-14 sm:mb-16 scroll-fade-up" data-scroll-section="brain-fitness-cards">
            {[
              { Icon: Heart, label: 'Heart', gradient: 'from-red-500 to-rose-600', bg: 'bg-red-50', glow: 'hover:shadow-red-200/60' },
              { Icon: Droplets, label: 'Liver', gradient: 'from-orange-500 to-amber-600', bg: 'bg-orange-50', glow: 'hover:shadow-orange-200/60' },
              { Icon: Stethoscope, label: 'Kidney', gradient: 'from-sky-500 to-blue-600', bg: 'bg-sky-50', glow: 'hover:shadow-sky-200/60' },
              { Icon: Dna, label: 'Blood Sugar', gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50', glow: 'hover:shadow-violet-200/60' },
              { Icon: FlaskConical, label: 'Vitamins', gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', glow: 'hover:shadow-emerald-200/60' },
              { Icon: Activity, label: 'Thyroid', gradient: 'from-pink-500 to-fuchsia-600', bg: 'bg-pink-50', glow: 'hover:shadow-pink-200/60' },
            ].map((item, index) => (
              <div
                key={item.label}
                className={`stagger-item group relative ${item.bg} border border-gray-100 rounded-2xl p-3 sm:p-6 flex flex-col items-center text-center hover:-translate-y-2 hover:shadow-xl ${item.glow} transition-all duration-500 cursor-default`}
              >
                <div className={`w-10 h-10 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-2 sm:mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg`}>
                  <item.Icon className="w-5 h-5 sm:w-8 sm:h-8 text-white" strokeWidth={1.8} />
                </div>
                <span className="text-[#323956] font-semibold text-xs sm:text-base leading-tight">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Question + CTA */}
          <div className="text-center scroll-fade-up" data-scroll-section="brain-fitness-question">
            <div className="relative max-w-4xl mx-auto">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#c9a227]/40 via-[#c9a227]/20 to-[#c9a227]/40 rounded-[28px] blur-sm"></div>
              <div className="relative bg-white rounded-3xl py-8 sm:py-10 md:py-14 px-4 sm:px-8 md:px-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-[#323956] to-[#4a5280] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#323956]/30">
                  <Brain className="w-8 h-8 sm:w-10 sm:h-10 text-[#c9a227]" strokeWidth={1.5} />
                </div>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-3 sm:mb-4">
                  But have you ever tested your <span className="text-[#c9a227]">Brain Fitness</span>?
                </h3>
                <div className="flex items-center justify-center gap-3 mb-5 sm:mb-6">
                  <div className="w-10 h-[2px] bg-gradient-to-r from-transparent to-[#c9a227]"></div>
                  <div className="w-2 h-2 rounded-full bg-[#c9a227]"></div>
                  <div className="w-10 h-[2px] bg-gradient-to-l from-transparent to-[#c9a227]"></div>
                </div>
                <p className="text-gray-500 text-base sm:text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
                  For the first time in India, you can measure your brain's functional health through a clinical-grade <span className="font-bold text-[#323956]">Quantitative EEG (qEEG)</span> brain optimization scan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* NeuroSense Information & Philosophy Section */}
      <section
        ref={(el) => (sectionRefs.current.neurosenseInfo = el)}
        data-section="neurosenseInfo"
        className="py-12 sm:py-16 md:py-20 bg-white transition-all duration-1000 relative opacity-100 translate-y-0"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

          {/* Call to Action Section */}
          <div className="text-center mb-20 relative z-10 scroll-fade-up" data-scroll-section="cta-main">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#323956] mb-6">
              Take Control Of Your Brain Health Today
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto mb-10">
              Join thousands who have transformed their lives by adopting a brain-first approach, understanding and optimizing the brain's power to enhance mental strength, emotional balance, and overall well-being.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={openContactForm}
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-[#323956] hover:bg-[#232D3C] text-white rounded-xl text-base sm:text-lg font-medium transition-all hover:scale-105 shadow-lg"
              >
                Start Your Journey
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Problem Statement Section */}
          <div className="my-20 relative z-10">
            <div className="text-center mb-12 scroll-fade-down" data-scroll-section="crisis-title">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-3 sm:mb-4">
                The Global Brain Health Crisis
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
                Protect from brain degeneration and the impact of stress
              </p>
            </div>

            <div ref={statsRef} className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 md:gap-8" data-scroll-section="stat-cards">
              {/* Sleep Crisis */}
              <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg stagger-item">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-10 sm:w-12 md:w-16 h-10 sm:h-12 md:h-16 bg-[#323956] rounded-xl sm:rounded-2xl mb-3 sm:mb-4">
                    <svg className="w-6 sm:w-7 md:w-8 h-6 sm:h-7 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[#323956] mb-2">{stats.sleep}%</h3>
                  <h4 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3">Sleep Crisis</h4>
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    Of adults worldwide report chronic sleep problems affecting their daily performance and mental health
                  </p>
                </div>
              </div>

              {/* Stress Epidemic */}
              <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg stagger-item">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-10 sm:w-12 md:w-16 h-10 sm:h-12 md:h-16 bg-[#F5D05D] rounded-xl sm:rounded-2xl mb-3 sm:mb-4">
                    <svg className="w-6 sm:w-7 md:w-8 h-6 sm:h-7 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[#F5D05D] mb-2">{stats.stress}%</h3>
                  <h4 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3">Stress Epidemic</h4>
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    Experience stress that impacts their physical and mental wellbeing on a regular basis
                  </p>
                </div>
              </div>

              {/* Mental Health Crisis */}
              <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg stagger-item col-span-1">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-10 sm:w-12 md:w-16 h-10 sm:h-12 md:h-16 bg-[#323956] rounded-xl sm:rounded-2xl mb-3 sm:mb-4">
                    <svg className="w-6 sm:w-7 md:w-8 h-6 sm:h-7 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl sm:text-3xl md:text-5xl font-bold text-[#323956] mb-2">1 in 4</h3>
                  <h4 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 mb-2 sm:mb-3">Mental Health</h4>
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                    People worldwide will experience a mental health challenge in their lifetime
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Solution Section */}
          <div className="medical-card bg-gray-50 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 mb-8 sm:mb-12 shadow-lg relative z-10 scroll-fade-up" data-scroll-section="solution-section">
            <div className="text-center mb-5 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-3 sm:mb-4">
                The Solution: Limitless Brain Lab
              </h2>
            </div>
            <div className="space-y-6">
              <p className="text-base sm:text-lg text-gray-900 leading-relaxed font-normal">
                For the very first time, a clinical grade EEG combined with proprietary and globally validated brain assessment parameters to measure your true brain performance, trusted all over the world.
              </p>

              <p className="text-base sm:text-lg text-gray-900 leading-relaxed font-semibold animate-brainwave text-center">
                Don't just track your bank balance, track your brain's balance.
              </p>
            </div>
          </div>

          {/* Philosophy Section with MOVERS and 3M Animation */}
          <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 mb-8 sm:mb-12 shadow-lg relative z-10 scroll-fade-up" data-scroll-section="philosophy-section">
            <div className="text-center mb-5 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-4 sm:mb-6">
                Our Core Philosophy
              </h2>
            </div>

            {/* MOVERS Protocol Text */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-8 sm:mb-10 scroll-fade-left" data-scroll-section="movers-text">
              <p className="text-base sm:text-lg leading-relaxed font-normal text-center">
                We blend ancient truths with modern scientific proofs to create a personalized <span className="font-bold">MOVERS protocol</span> integrating <span className="font-semibold">M</span>editation, <span className="font-semibold">O</span>xygenation (breathwork), <span className="font-semibold">V</span>isualization or Theta techniques, <span className="font-semibold">E</span>xercises, Affirmations, targeted <span className="font-semibold">R</span>elaxation and Nutrition, and <span className="font-semibold">S</span>leep or Stress Relief through HRV(Heart rate variability) for complete brain care.
              </p>
            </div>

            {/* 3M Animation Section */}
            <div className="text-center scroll-fade-right" data-scroll-section="3m-section">
              <div className="flex items-center justify-center gap-4 text-xl sm:text-3xl md:text-5xl font-light text-gray-900 mb-6 sm:mb-8">
                <span className="font-semibold text-[#F5D05D] animate-neuron">3 M</span>
              </div>

              {/* 3Ms appearing one by one */}
              <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 md:gap-8 text-sm sm:text-xl md:text-3xl text-gray-900 flex-wrap" data-scroll-section="3m-items">
                <span className="px-3 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-gray-50 rounded-xl font-medium hover:text-[#F5D05D] hover:bg-gray-100 transition-all duration-500 cursor-pointer card-slide-alternate">
                  Measure
                </span>
                <span className="text-gray-400 card-slide-alternate text-xs sm:text-base">&</span>
                <span className="px-3 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-gray-50 rounded-xl font-medium hover:text-[#F5D05D] hover:bg-gray-100 transition-all duration-500 cursor-pointer card-slide-alternate">
                  Monitor
                </span>
                <span className="text-gray-400 card-slide-alternate text-xs sm:text-base">&</span>
                <span className="px-3 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-gray-50 rounded-xl font-medium hover:text-[#F5D05D] hover:bg-gray-100 transition-all duration-500 cursor-pointer card-slide-alternate">
                  Manage
                </span>
              </div>
            </div>
          </div>

          {/* Connect Section - Enhanced */}
          <div className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-gray-50 to-white overflow-hidden relative z-10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-10 sm:mb-16 scroll-fade-down" data-scroll-section="connect-title">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-3 sm:mb-4">
                  Connect
                </h2>
                <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
                  Find Us At A Clinic Near You To Start Your Journey With Limitless Brain Lab.
                </p>
              </div>

              {/* EEG Video Call Mockup */}
              <div className="flex justify-center mb-8 sm:mb-12 scroll-fade-up" data-scroll-section="connect-phone">
                <div className="relative w-[180px] sm:w-[250px] md:w-[280px] lg:w-[300px]">
                  {/* Phone Screen */}
                  <div className="rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden relative shadow-2xl" style={{ aspectRatio: '9/19.5' }}>
                    <img
                      src="/connect-person.png"
                      alt="EEG monitoring session with video consultation"
                      className="w-full h-full object-cover"
                    />

                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-24 h-5 bg-black rounded-b-xl z-20"></div>

                    {/* Yellow CTA Button on Image - covers green button */}
                    <div className="absolute bottom-3 sm:bottom-8 left-1/2 transform -translate-x-1/2 w-[90%] z-20">
                      <button
                        onClick={() => setShowLocationsPopup(true)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-3 bg-[#F5D05D] hover:bg-[#E5C04D] text-gray-900 rounded-xl text-xs sm:text-sm font-bold shadow-xl transition-all duration-300"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        SUPPORT & CARE NEAR YOU
                      </button>
                    </div>
                  </div>

                  {/* Glow Effect */}
                  <div className="absolute -z-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-gradient-to-br from-[#F5D05D]/15 to-purple-400/15 rounded-full blur-3xl"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Brain Parameters Slider Section */}
          <BrainParametersSlider />

          {/* Care Section */}
          <div className="mb-20 relative z-10">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#323956] mb-10 sm:mb-16 text-center bg-white relative z-20 scroll-fade-down" data-scroll-section="care-title">
              Care
            </h2>

            <div className="flex justify-center max-w-7xl mx-auto">
              {/* Left: Image — hidden */}
              {/* <div className="scroll-fade-left" data-scroll-section="care-image">
                <img
                  src="/care.jpeg"
                  alt="Personalized brain care and optimization"
                  className="w-full rounded-3xl shadow-2xl object-cover"
                />
              </div> */}

              <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 shadow-lg scroll-fade-right max-w-2xl w-full" data-scroll-section="care-content">
                <p className="text-base sm:text-lg leading-relaxed">
                  <span className="font-bold">Build a personalized brain optimization plan tailored to your needs.</span> Leverage our lab tested brainwave frequencies, special sounds and music (mantras), ANS (Autonomic Nervous System) reset protocols, guided meditations, and targeted light and sound therapies. Track your progress, refine your plan, and sustain your gains with ongoing expert support. Available for both <span className="font-semibold">home and clinic based care</span>, depending on your requirements.
                </p>
              </div>
            </div>
          </div>

          {/* Bundle Section */}
          <div className="py-16 sm:py-24 relative overflow-hidden">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="text-center mb-14 scroll-fade-down" data-scroll-section="bundle-title">
                <div className="inline-flex items-center gap-2 bg-[#323956] text-white text-xs sm:text-sm font-medium px-5 py-2 rounded-full mb-6">
                  <Brain className="w-4 h-4 text-[#c9a227]" />
                  Get Started
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#323956] mb-3 sm:mb-4">
                  Start Unlocking Your Brain At Comforts Of Your Home
                </h2>
                <p className="text-gray-500 max-w-2xl mx-auto text-sm sm:text-base md:text-lg px-2 sm:px-0">Choose our validated assessments that are right for you to unlock your cognitive health</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 max-w-lg sm:max-w-3xl mx-auto px-2 sm:px-0 scroll-fade-up" data-scroll-section="bundle-cards">
                {/* Brain Fitness Score - $4.99 */}
                <div className="group relative h-full">
                  <div className="absolute -inset-[1px] bg-gradient-to-b from-[#c9a227] via-[#c9a227]/40 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                  <div className="relative bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-9 text-center transition-all duration-500 hover:-translate-y-2 border border-gray-200 hover:border-transparent shadow-sm hover:shadow-2xl hover:shadow-[#c9a227]/10 overflow-hidden h-full flex flex-col">
                    <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-[#c9a227] text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full tracking-wide">POPULAR</div>
                    <div className="relative w-11 h-11 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#c9a227]/20 to-[#c9a227]/5 rounded-2xl rotate-6 group-hover:rotate-12 transition-transform duration-500"></div>
                      <div className="relative w-full h-full bg-gradient-to-br from-[#c9a227] to-[#b8911f] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-500 shadow-lg shadow-[#c9a227]/20">
                        <Brain className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-[#323956] mb-1.5 sm:mb-2"><span className="italic">Brain Fitness Score</span>™</h3>
                    <p className="text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6">Quick assessment to understand your brain health</p>
                    <div className="mb-4 sm:mb-6 py-3 sm:py-4 bg-[#c9a227]/5 rounded-xl sm:rounded-2xl">
                      <span className="text-gray-400 line-through text-sm sm:text-base block mb-1">$9.99</span>
                      <span className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-[#c9a227]">$2.99</span>
                    </div>
                    <ul className="text-left space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-grow">
                      {['Brain health questionnaire', 'Instant score & insights', 'No equipment needed'].map((t) => (
                        <li key={t} className="flex items-center gap-3 text-gray-600 text-sm">
                          <div className="w-5 h-5 rounded-full bg-[#c9a227]/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-[#c9a227]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                          {t}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => { setShowBFSPaymentModal(true); setBfsPaymentEmail(''); setBfsPaymentName(''); }} className="block w-full bg-[#c9a227] hover:bg-[#b8911f] text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] shadow-md hover:shadow-lg hover:shadow-[#c9a227]/25 mt-auto text-xs sm:text-sm md:text-base text-center">
                      <span className="flex items-center justify-center gap-2">
                        Get Started
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Neurosense Cognitive Assessments */}
                <div className="group relative h-full">
                  <div className="absolute -inset-[1px] bg-gradient-to-b from-[#323956] via-[#323956]/40 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
                  <div className="relative bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-9 text-center transition-all duration-500 hover:-translate-y-2 border border-gray-200 hover:border-transparent shadow-sm hover:shadow-2xl hover:shadow-[#323956]/10 overflow-hidden h-full flex flex-col">
                    <div className="relative w-11 h-11 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5 mt-2">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#323956]/20 to-[#323956]/5 rounded-2xl rotate-6 group-hover:rotate-12 transition-transform duration-500"></div>
                      <div className="relative w-full h-full bg-gradient-to-br from-[#323956] to-[#4a5280] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all duration-500 shadow-lg shadow-[#323956]/20">
                        <Brain className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-[#323956] mb-1.5 sm:mb-2">Limitless Brain Lab Cognitive Assessments</h3>
                    <p className="text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6">Choose the right assessment for your brain health journey</p>
                    <div className="mb-4 sm:mb-6 py-3 sm:py-4 bg-gray-50 rounded-xl sm:rounded-2xl">
                      <span className="text-xs sm:text-sm text-gray-400 block mb-1">Starting from</span>
                      <span className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-[#323956]">$29.99</span>
                    </div>
                    <ul className="text-left space-y-2.5 sm:space-y-3 mb-6 sm:mb-8 flex-grow">
                      {['A cognitive report (globally validated)', '25 pages detailed report', 'At the comforts of your home digitally delivered'].map((t) => (
                        <li key={t} className="flex items-center gap-3 text-gray-600 text-sm">
                          <div className="w-5 h-5 rounded-full bg-[#323956]/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3 h-3 text-[#323956]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                          {t}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => navigate('/neurosense-booking?type=individual')} className="w-full bg-[#323956] hover:bg-[#2a3049] text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02] shadow-md hover:shadow-lg hover:shadow-[#323956]/25 mt-auto text-xs sm:text-sm md:text-base">
                      <span className="flex items-center justify-center gap-2">
                        Pay &amp; Take Away
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dedicated Team For Brain Concierge Care */}
          <div className="py-12 sm:py-20 md:py-28 bg-white relative overflow-hidden z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="text-center mb-10 sm:mb-14 scroll-fade-down" data-scroll-section="concierge-title">
                <h2 className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-[#323956] leading-tight">
                  Dedicated Team For Brain Concierge Care
                </h2>
              </div>

              <div className="overflow-hidden relative overflow-x-hidden" data-scroll-section="concierge-grid">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-20 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
                <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-20 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>

                <div className="flex gap-4 sm:gap-6 lg:gap-8 animate-marquee-scroll hover:[animation-play-state:paused]" style={{ width: 'max-content' }}>
                  {[
                    { name: 'Ridheema Bagla', role: 'Brain Concierge', img: '/ridheema.jpg' },
                    { name: 'Komal Narang', role: 'Concierge Care', img: '/komal.jpg' },
                    { name: 'Shilpa Badyal', role: 'Concierge Care', img: '/shilpa.jpg', pos: 'object-top' },
                    { name: 'Yoga Therapist', role: 'Yoga & Wellness', img: null },
                    { name: 'Divya Malhotra', role: 'Counselling Psychologist', img: '/divya-malhotra.jpg' },
                    { name: 'Anubha Gupta Jain', role: 'NLP & Counselling', img: '/anubha-gupta.jpg' },
                    // { name: 'Anubha Jain', role: 'Psychologist', img: '/anubha-jain.jpg' },
                    { name: 'Kanak Kejariwal', role: 'Counselling Psychologist', img: '/kanak.jpg' },
                    { name: 'Sanjh Dubey', role: 'Clinical Psychology & Music Therapy', img: '/sanjh-dubey.jpg', pos: 'object-top' },
                    { name: 'Sara Janvekar', role: 'Mantra Therapist', img: '/sara-janvekar.jpg' },
                    { name: 'Akshitaa Chawla', role: 'Diet Concierge', img: '/akshitaa.jpg', pos: 'object-top' },
                  ].concat([
                    { name: 'Ridheema Bagla', role: 'Brain Concierge', img: '/ridheema.jpg' },
                    { name: 'Komal Narang', role: 'Concierge Care', img: '/komal.jpg' },
                    { name: 'Shilpa Badyal', role: 'Concierge Care', img: '/shilpa.jpg', pos: 'object-top' },
                    { name: 'Yoga Therapist', role: 'Yoga & Wellness', img: null },
                    { name: 'Divya Malhotra', role: 'Counselling Psychologist', img: '/divya-malhotra.jpg' },
                    { name: 'Anubha Gupta Jain', role: 'NLP & Counselling', img: '/anubha-gupta.jpg' },
                    // { name: 'Anubha Jain', role: 'Psychologist', img: '/anubha-jain.jpg' },
                    { name: 'Kanak Kejariwal', role: 'Counselling Psychologist', img: '/kanak.jpg' },
                    { name: 'Sanjh Dubey', role: 'Clinical Psychology & Music Therapy', img: '/sanjh-dubey.jpg', pos: 'object-top' },
                    { name: 'Sara Janvekar', role: 'Mantra Therapist', img: '/sara-janvekar.jpg' },
                    { name: 'Akshitaa Chawla', role: 'Diet Concierge', img: '/akshitaa.jpg', pos: 'object-top' },
                  ]).map((member, index) => (
                    <div key={index} className="group text-center flex-shrink-0 min-w-[120px] w-[120px] sm:min-w-[180px] sm:w-[180px] lg:min-w-[220px] lg:w-[220px]">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full mx-auto mb-3 sm:mb-4 overflow-hidden border-3 border-gray-200 group-hover:border-[#c9a227] transition-all duration-300 shadow-md group-hover:shadow-xl bg-gradient-to-br from-[#323956] to-[#4a5280]">
                        {member.img ? (
                          <img
                            src={member.img}
                            alt={member.name}
                            className={`w-full h-full object-cover ${member.pos || 'object-center'} group-hover:scale-105 transition-transform duration-500`}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-12 h-12 sm:w-16 sm:h-16 text-white/60" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <h3 className="text-sm sm:text-base md:text-lg font-bold text-[#323956]">{member.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500">{member.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* My Vision and Signature Section */}
          <div className="py-10 sm:py-16 md:py-24 bg-gray-50 relative z-10">
            <div className="max-w-[90rem] mx-auto px-4 sm:px-10 lg:px-16">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 lg:gap-24 items-start">
                {/* Left: Vision Quote */}
                <div className="scroll-fade-left" data-scroll-section="vision-quote">
                  <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-5xl font-normal text-gray-900 leading-relaxed sm:leading-snug">
                    "I envision a world where brain health is understood early, nurtured intentionally, and optimized before breakdown begins."
                  </h2>
                </div>

                {/* Right: Details and Signature */}
                <div className="scroll-fade-right" data-scroll-section="vision-details">
                  <p className="text-xs sm:text-sm md:text-base text-gray-700 leading-relaxed mb-6 sm:mb-10">
                    I believe neuroscience should move beyond disease to unlocking human potential, clarity, and emotional resilience. I am committed to integrating <span className="font-bold">science, technology, and awareness</span> to build conscious, high-performing brains. My purpose is to help every individual not just cope with life—but lead it with balance and purpose.
                  </p>

                  {/* Signature */}
                  <div className="mt-6 sm:mt-12">
                    <img
                      src="/signiture.png"
                      alt="Dr. Sweta Adatia Signature"
                      className="h-10 sm:h-14 md:h-20 w-auto mb-4 sm:mb-6"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <p className="text-sm sm:text-base font-bold text-gray-900">Dr. Sweta Adatia<span className="font-normal text-gray-600"> / Founder</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* About Dr. Sweta Adatia Section */}
          <div className="mb-20 relative z-10">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-[#323956] mb-4 text-left max-w-7xl mx-auto px-4 bg-white relative z-20 scroll-fade-left" data-scroll-section="about-title">
              About Dr. Sweta Adatia
            </h2>

            {/* Grid Layout - Content Left, Image Right */}
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto px-4 ${showFullBio ? 'items-start' : 'items-stretch'}`}>
              {/* Left: Content */}
              <div className="medical-card bg-white rounded-3xl p-4 sm:p-6 md:p-10 shadow-lg scroll-fade-left" data-scroll-section="about-content">
                <p className="text-lg text-[#323956] font-semibold mb-6">
                  Neurologist | Author | TEDx Speaker | Coach | Entrepreneur | Spiritual Seeker
                </p>
                <p className="text-base leading-relaxed mb-4 text-gray-700">
                  Dr. Sweta Adatia is a dynamic and accomplished neurologist currently leading the Neurology department at Gargash Hospital in the UAE. With ten years of experience in the region, she previously served as the Medical Director of RAK Hospital for close to 4 years. Dr. Adatia completed her medical degree in Mumbai, India, followed by a paralytic stroke fellowship in Calgary, Canada. She is a fellow of the American College of Physicians, USA, and holds an impressive 13 Gold medals in various subjects.
                </p>

                {showFullBio && (
                  <>
                    <p className="text-base leading-relaxed mb-4 text-gray-700">
                      Having worked across three continents – Asia, Central Africa, and North America – Dr. Adatia's global perspective enriches her medical practice. She pursued an MBA in Healthcare and finance at Cambridge University, where she was selected to work with the NCD UN on a funding program for 90 LMIC countries. Her exceptional achievements were recognized with the Brightest Minds in Cambridge scholarship for her MBA program.
                    </p>
                    <p className="text-base leading-relaxed mb-4 text-gray-700">
                      Dr. Adatia's innovative work extends to mapping high achievers' brains through her Limitless Brain Lab in Dubai, utilizing AI algorithms to analyze the peak markers in the brain leading to success. She has built AI algorithms for mapping the brain's function to optimize and upgrade brain health and peak performance.
                    </p>
                    <p className="text-base leading-relaxed mb-4 text-gray-700">
                      A multi-talented individual, she has excelled in music with a Bachelor of Arts in harmonium, sports with table tennis championships, and spiritual pursuits including advanced training in Pranic Healing, Hypnotherapy, past life regression and Neurofeedback Therapy from renowned experts worldwide. Her dedication to mastering diverse fields beyond medicine and neurology exemplifies her commitment to holistic well-being and innovation in healthcare.
                    </p>
                    <p className="text-base leading-relaxed mb-4 text-gray-700">
                      Dr. Adatia empowers the next generation to map their brains to help them embrace their limitless potential through her startup Mylimitlessbrain. Her book on this subject FUTURE READY NOW has achieved global bestseller status on Amazon.
                    </p>
                    <p className="text-base leading-relaxed mb-4 text-gray-700">
                      A sought-after keynote speaker, she has delivered a TEDx talk on the impact of storytelling on the brain and conducted more than 500 seminars on neuroscience-based topics, bridging science and spirituality, Neuro parenting, Neuro manifestation, total transformation of the brain, A journey from Illness to Wellness and neuroscience for daily life. Her YouTube channel @drsweta.adatia is fast growing with over 55 million impressions and over 10 million views. Some of her talks are vividly viral and appreciated by a global audience. Dr Adatia lives in Dubai currently and has a collaborative lab in Cambridge and USA.
                    </p>
                  </>
                )}

                <button
                  onClick={() => setShowFullBio(!showFullBio)}
                  className="mt-4 text-[#323956] font-semibold hover:underline text-sm"
                >
                  {showFullBio ? 'Read Less' : 'Read More'}
                </button>

                <p className="text-base leading-relaxed text-gray-700 mt-4">
                  More about her – <a href="https://www.drswetaadatia.com" target="_blank" rel="noopener noreferrer" className="text-[#323956] hover:underline font-semibold">www.drswetaadatia.com</a>
                </p>

                {/* Statistics Section Inside Card */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-scroll-section="about-stats">
                    {/* Stat 1 - Patients Treated */}
                    <div className="flex flex-col items-center text-center card-slide-alternate">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 mb-2 flex items-center justify-center">
                        <svg className="w-full h-full text-[#323956]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-[#323956] mb-0.5">50000+</h3>
                      <p className="text-[10px] text-gray-700 font-medium leading-tight">Patients Treated</p>
                    </div>

                    {/* Stat 2 - Gold Medals */}
                    <div className="flex flex-col items-center text-center card-slide-alternate">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 mb-2 flex items-center justify-center">
                        <svg className="w-full h-full text-[#323956]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 7a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 1.5l1.323 2.68 2.957.43-2.14 2.085.505 2.946L12 17.25l-2.645 1.39.505-2.945-2.14-2.086 2.957-.43L12 10.5zM18 2v3l-1.363 1.138A9.935 9.935 0 0 0 13 5.049V2h5zm-7-.001v3.05a9.935 9.935 0 0 0-3.637 1.088L6 5V2h5z"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-[#323956] mb-0.5">13+</h3>
                      <p className="text-[10px] text-gray-700 font-medium leading-tight">Gold Medals</p>
                    </div>

                    {/* Stat 3 - Social Media Views */}
                    <div className="flex flex-col items-center text-center card-slide-alternate">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 mb-2 flex items-center justify-center">
                        <svg className="w-full h-full text-[#323956]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-[#323956] mb-0.5">30 Million +</h3>
                      <p className="text-[10px] text-gray-700 font-medium leading-tight">Views Various social media</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Image */}
              <div className={`relative scroll-fade-right ${showFullBio ? 'lg:sticky lg:top-24' : ''}`} data-scroll-section="about-image">
                <div className="bg-white rounded-3xl overflow-hidden shadow-2xl h-full">
                  <img
                    src="/dr.sweta.JPG"
                    alt="Dr. Sweta Adatia"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Ask Dr Sweta Interactive (AI) Section — hidden */}
          {/* <div className="text-center mb-16 relative z-10">
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-3 sm:mb-4 bg-white relative z-20">
                Ask Dr Sweta Interactive (AI)
              </h2>
              <div>
                <div className="relative">
                  <div className="medical-card bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 mx-auto max-w-4xl shadow-lg relative z-20">
                    <p className="text-base sm:text-lg md:text-xl text-gray-900 leading-relaxed mb-4 sm:mb-6">
                      Ask AI trained about your condition and how Limitless Brain Lab can help, in any language.
                    </p>
                    <div className="flex flex-col items-center mb-4 sm:mb-6">
                      <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-1">Dr Sweta Adatia - Free Version 🤖</h3>
                      <div className="flex justify-center mt-4">
                        <a href="https://www.limitlessbrainacademy.com/talk/drsweta" target="_blank" rel="noopener noreferrer"
                          className="bg-[#323956] text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-[#252b42] transition-colors">
                          Ask
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div> */}
        </div>
      </section>

      {/* Clinical Oversight Banner */}
      <section className="py-10 sm:py-16 md:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2.5 bg-[#323956] text-white text-sm sm:text-base font-medium px-6 py-2.5 rounded-full mb-8">
            <ShieldCheck className="w-5 h-5 text-[#c9a227]" />
            Clinically Supervised
          </div>
          <p className="text-gray-500 text-base sm:text-lg md:text-xl mb-3">
            All protocols are supervised by
          </p>
          <h3 className="text-[#323956] text-3xl sm:text-4xl md:text-5xl font-bold mb-2 sm:mb-3">
            Dr. Sweta Adatia
          </h3>
          <p className="text-[#c9a227] text-base sm:text-lg md:text-xl font-semibold mb-6 sm:mb-8">
            Neurologist & Brain Optimization Expert
          </p>
          <p className="text-gray-500 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto mb-2">
            Every case is reviewed with clinical oversight.
          </p>
          <p className="text-gray-500 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto">
            Neuro-coaches, psychologists, and psychiatrists collaborate where required to ensure comprehensive care.
          </p>
        </div>
      </section>

      {/* We Are Coming To Your House Section */}
      <section className="py-10 sm:py-20 md:py-24 bg-white relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="scroll-fade-left" data-scroll-section="coming-to-you-title">
              <div className="inline-flex items-center gap-2 bg-[#323956] text-white text-xs sm:text-sm font-medium px-5 py-2 rounded-full mb-6">
                <Truck className="w-4 h-4 text-[#c9a227]" />
                Home Service
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#323956] mb-5 tracking-tight leading-tight">
                We Are Coming to <span className="text-[#c9a227]">Your House</span>
              </h2>
              <p className="text-gray-500 text-base sm:text-lg mb-8 leading-relaxed">
                No need to travel. Our certified neuro-technicians bring the clinical-grade qEEG brain scan experience right to your doorstep.
              </p>
              <div className="space-y-4">
                {[
                  { text: 'FDA-cleared portable EEG equipment', icon: '🧠' },
                  { text: 'Certified neuro-technicians at your door', icon: '🏠' },
                  { text: 'Complete report within 48 hours', icon: '📊' },
                ].map((feat) => (
                  <div key={feat.text} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#323956]/5 flex items-center justify-center flex-shrink-0 text-base">
                      {feat.icon}
                    </div>
                    <span className="text-[#323956] text-sm sm:text-base font-medium">{feat.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="scroll-fade-right relative" data-scroll-section="coming-to-you-cards">
              <div className="absolute left-[32px] top-[60px] bottom-[60px] w-[2px] bg-gradient-to-b from-[#c9a227]/30 via-[#323956]/20 to-[#c9a227]/30 hidden lg:block"></div>
              <div className="space-y-5">
                {[
                  {
                    icon: (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>),
                    title: 'Book a Slot',
                    desc: 'Schedule a convenient time and our team will come to you.',
                    color: 'bg-[#c9a227]',
                  },
                  {
                    icon: (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" /></svg>),
                    title: 'At-Home Scan',
                    desc: 'A 20-minute painless qEEG scan in the comfort of your home.',
                    color: 'bg-[#323956]',
                  },
                  {
                    icon: (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>),
                    title: 'Get your report at home',
                    desc: 'Receive a detailed brain health report with expert recommendations.',
                    color: 'bg-[#c9a227]',
                  },
                ].map((item, index) => (
                  <div key={item.title} className="group flex items-start gap-5 bg-gray-50 hover:bg-white rounded-2xl p-5 sm:p-6 hover:shadow-lg border border-transparent hover:border-gray-200 transition-all duration-500 cursor-default">
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-2xl ${item.color} flex items-center justify-center text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-md`}>
                        {item.icon}
                      </div>
                      <div className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border-2 ${item.color === 'bg-[#c9a227]' ? 'border-[#c9a227]' : 'border-[#323956]'} flex items-center justify-center text-[10px] font-bold text-[#323956]`}>
                        {index + 1}
                      </div>
                    </div>
                    <div className="pt-1">
                      <h3 className="text-[#323956] text-lg font-bold mb-1 group-hover:text-[#c9a227] transition-colors duration-300">{item.title}</h3>
                      <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brain Fitness Score Payment Modal */}
      {showBFSPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowBFSPaymentModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ animation: 'slideUp 0.3s ease-out' }}>
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
              <button onClick={() => setShowBFSPaymentModal(false)} className="text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              {/* Service Info */}
              <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-5">
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">Brain Fitness Score™</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Quick assessment to understand your brain health</p>
                <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                  <span className="text-gray-400 line-through text-xs sm:text-sm">USD $9.99</span>
                  <span className="text-xl sm:text-2xl font-bold text-[#c9a227]">USD $2.99</span>
                </div>
              </div>

              {/* Name & Email Form */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={bfsPaymentName}
                    onChange={(e) => setBfsPaymentName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#323956]/20 focus:border-[#323956] outline-none transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={bfsPaymentEmail}
                    onChange={(e) => setBfsPaymentEmail(e.target.value)}
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
                onClick={handleBFSPayment}
                disabled={bfsProcessing || !bfsPaymentEmail}
                className="w-full mt-5 py-3 bg-gradient-to-r from-[#c9a227] to-[#b8911f] text-white font-bold rounded-xl hover:shadow-lg hover:shadow-[#c9a227]/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bfsProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Pay USD $4.99 & Continue</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer />

      {/* Locations Popup */}
      <LocationsPopup isOpen={showLocationsPopup} onClose={() => setShowLocationsPopup(false)} />
    </div>
  );
};

export default Landing;
