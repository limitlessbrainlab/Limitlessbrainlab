import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain } from 'lucide-react';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';
import { useContactForm } from '../context/ContactFormContext';
import { useLocationsPopup } from '../context/LocationsPopupContext';

const LBWProjectUpdates = () => {
  const navigate = useNavigate();
  const { openContactForm } = useContactForm();
  const { openLocationsPopup } = useLocationsPopup();
  const [visibleSections, setVisibleSections] = useState(new Set());
  const observerRefs = useRef([]);

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

  const steps = [
    {
      number: 1,
      title: "Measure your brain activity",
      description: "Electrical signals generated in the brain reflect your current mental state. Limitless Brain Lab uses proprietary technology to study and measure your brain activity",
      image: "/neuro1.mp4",
      isVideo: true
    },
    {
      number: 2,
      title: "Understand your brain",
      description: "Limitless Brain Lab scans and decodes your brain activity to give you deep, actionable insights into how your brain truly functions, your Brain Map, explained. The Limitless Brain Lab report analyzes 13 key brain health parameters, including attention, emotional regulation, connectivity, energy balance, flexibility, and executive control.",
      image: "/neuro2.mp4",
      isVideo: true
    },
    {
      number: 3,
      title: "Get a personalized brain training plan",
      description: "We create a personalized, holistic frequency modulation plan based on your brain activity, brain type, and goals, helping your brain reach its ultimate capacity.",
      image: "/neuro3.mp4",
      isVideo: true
    },
    {
      number: 4,
      title: "Practice for best results",
      description: "We turn your data into clear next steps. You implement, we adapt. Personalized insights, targeted changes, measurable gains. Get the exact changes in your brain, stay consistent, and watch progress stack tracked with metrics in the Limitless Brain Lab webapp.",
      image: "/neuro4.mp4",
      isVideo: true
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      <NavBar />

      <style>{`
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
      `}</style>

      {/* Main Content */}
      <div className="pt-20">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8 lg:p-10">
        {/* Title Section */}
        <div className="text-center mb-8 sm:mb-12 md:mb-16 scroll-fade-down" data-scroll-section="title">
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-normal text-gray-900 mb-4">
            A Step By Step Guide To Using <span className="text-[#4A6FA5] font-bold">Limitless Brain Lab</span>
          </h1>
        </div>

        {/* Steps Section */}
        <div className="space-y-4 sm:space-y-6 md:space-y-8 lg:space-y-12" data-scroll-section="steps">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="bg-gray-50 rounded-2xl p-4 sm:p-6 md:p-8 lg:p-12 card-slide-alternate"
            >
              <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6 md:gap-8">
                {/* Left Content */}
                <div className="flex-1">
                  <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-normal text-gray-900 mb-2 sm:mb-3 md:mb-4">
                    {step.number}. {step.title}
                  </h2>
                  <p className="text-sm sm:text-base md:text-lg text-gray-700 mb-4 sm:mb-5 md:mb-6 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Right Image/Video */}
                <div className="w-full md:w-1/2 lg:w-[500px] flex justify-center">
                  <div className={`rounded-lg p-2 sm:p-4 md:p-6 w-full h-48 sm:h-60 md:h-72 lg:h-80 flex items-center justify-center ${step.isVideo ? '' : 'bg-black'}`}>
                    {step.isVideo ? (
                      <video
                        src={step.image}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={step.image}
                        alt={step.title}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Book Discovery Call CTA */}
        <div className="mt-8 sm:mt-12 md:mt-16 mb-8 sm:mb-12 md:mb-16 text-center">
          <button
            onClick={openContactForm}
            className="inline-flex items-center justify-center px-4 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 bg-[#323956] hover:bg-[#252a42] text-white text-sm sm:text-base md:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
          >
            Book Your Discovery Call
            <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Why is NeuroSense better for you Section */}
        <div className="mt-12 sm:mt-16 md:mt-20 mb-8 sm:mb-12 md:mb-16 scroll-fade-up" data-scroll-section="why-better">
          <div className="text-center mb-8 sm:mb-12 md:mb-16">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 mb-6 sm:mb-8 md:mb-12">
              Why Should You Choose Limitless Brain Lab?
            </h2>

            <div className="relative">
              <div className="bg-gray-50 rounded-3xl p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12 mx-auto max-w-5xl shadow-lg border border-gray-200">
                <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-gray-900 mb-4 sm:mb-5 md:mb-6">
                  Evidence Based Research
                </h3>

                <div className="text-sm sm:text-base md:text-lg text-gray-700 leading-relaxed space-y-3 sm:space-y-4 text-left">
                  <p>
                    Quantitative EEG (qEEG) has emerged as a scientifically validated tool in brain wellness and care, enabling the visualization and measurement of electrical activity patterns that reflect cognitive performance, emotional regulation, and mental resilience. Unlike conventional EEG, qEEG maps the brain's functional networks using advanced analytics and normative databases, allowing clinicians to identify dysregulated circuits linked to stress, focus, sleep, and mood.
                  </p>

                  <p>
                    At Limitless Brain Lab, we have harnessed this evidence backed technology to create an integrative, clinical grade brain assessment system that translates complex neurodata into clear, actionable insights for personalized brain optimization. By combining qEEG findings with lifestyle, nutrition, and neuro modulation strategies, Limitless Brain Lab bridges the gap between medical neuroscience and everyday brain care.
                  </p>
                </div>
              </div>
            </div>

            {/* What Makes Us Different - 4 Dark Cards */}
            <div className="mt-10 sm:mt-14">
              <div className="text-center mb-12 sm:mb-16">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[#323956] tracking-tight mb-3">
                  What Makes Us Different
                </h2>
                <p className="text-gray-400 text-base sm:text-lg">A complete brain health ecosystem</p>
              </div>

              <div className="space-y-5 sm:space-y-6">

                {/* Card 1 — Text Left, Image Right */}
                <div className="relative group rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#161622] to-[#1a1a2e] border border-gray-800 overflow-hidden hover:border-[#c9a227]/40 transition-all duration-500 shadow-xl">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-[#c9a227]/8 rounded-full blur-[80px] pointer-events-none" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 items-center">
                    <div className="p-6 sm:p-8 md:p-10 relative z-10">
                      <h3 className="text-white text-xl sm:text-2xl md:text-3xl font-bold leading-tight mb-3">
                        The First Binaurals & Music<br />Tested and Designed for ADHD
                      </h3>
                      <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                        Improve focus and attention by using the binaural beats everyday for 15 minutes.
                      </p>
                    </div>
                    <div className="relative flex items-center justify-center min-h-[220px] sm:min-h-[260px]">
                      <img src="/1.webp" alt="Binaural Beats" className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-all duration-700" />
                    </div>
                  </div>
                </div>

                {/* Card 2 — Image Left, Text Right */}
                <div className="relative group rounded-2xl sm:rounded-3xl bg-gradient-to-bl from-[#161622] to-[#1a1a2e] border border-gray-800 overflow-hidden hover:border-purple-500/40 transition-all duration-500 shadow-xl">
                  <div className="absolute top-0 left-0 w-48 h-48 bg-purple-500/8 rounded-full blur-[80px] pointer-events-none" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 items-center">
                    <div className="relative flex items-center justify-center min-h-[220px] sm:min-h-[260px] order-2 md:order-1">
                      <img src="/2.webp" alt="Meditation" className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-all duration-700" />
                      <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                          <span className="text-gray-300 text-[10px] sm:text-xs font-medium">AI Processing</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 sm:p-8 md:p-10 relative z-10 order-1 md:order-2">
                      <h3 className="text-white text-xl sm:text-2xl md:text-3xl font-bold leading-tight mb-3">
                        Special Meditations Made<br />To Perfection In The Lab
                      </h3>
                      <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                        Neuro Meditation with Alfa, Beta, Gamma, Theta and Delta meditations for stress, calm, anxiety relief, deep sleep and focus.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card 3 — Text Left, Image Right */}
                <div className="relative group rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#161622] to-[#1a1a2e] border border-gray-800 overflow-hidden hover:border-cyan-500/40 transition-all duration-500 shadow-xl">
                  <div className="absolute bottom-0 right-0 w-48 h-48 bg-cyan-500/8 rounded-full blur-[80px] pointer-events-none" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 items-center">
                    <div className="p-6 sm:p-8 md:p-10 relative z-10">
                      <h3 className="text-white text-xl sm:text-2xl md:text-3xl font-bold leading-tight mb-3">
                        Personalized<br />Optimization Protocols
                      </h3>
                      <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                        Custom neurofeedback, sound therapy, meditation protocols, and ANS reset plans designed specifically for your brain.
                      </p>
                      <div className="mt-5 inline-flex items-center gap-2 bg-white/5 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span className="text-gray-300 text-xs sm:text-sm font-medium">Custom Protocols</span>
                      </div>
                    </div>
                    <div className="relative flex items-center justify-center min-h-[220px] sm:min-h-[260px]">
                      <img src="/3.webp" alt="Optimization Protocols" className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-all duration-700" />
                    </div>
                  </div>
                </div>

                {/* Card 4 — Binaural Beats for ADHD — hidden */}
                {/* <div className="relative group rounded-2xl sm:rounded-3xl bg-gradient-to-bl from-[#161622] to-[#1a1a2e] border-0 overflow-hidden hover:border-[#c9a227]/40 transition-all duration-500 shadow-xl">
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#c9a227]/8 rounded-full blur-[80px] pointer-events-none" />
                  <div className="flex flex-col md:flex-row items-center">
                    <div className="relative flex items-center justify-center min-h-[220px] sm:min-h-[260px] w-full md:w-1/2 order-2 md:order-1">
                      <img src="/4.webp" alt="Binaural Beats ADHD" className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-all duration-700" />
                    </div>
                    <div className="p-6 sm:p-8 md:p-10 relative z-10 order-1 md:order-2 w-full md:w-1/2">
                      <h3 className="text-white text-xl sm:text-2xl md:text-3xl font-bold leading-tight mb-3">
                        Binaural Beats<br />for ADHD
                      </h3>
                      <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                        55% increase in focus after every session of the binaural beats. Never get distracted with the power of the limitless binaural beats.
                      </p>
                    </div>
                  </div>
                </div> */}

              </div>
            </div>

            {/* Our Location Button - Outside Card */}
            <div className="mt-6 sm:mt-8 md:mt-10 text-center">
              <button
                onClick={openLocationsPopup}
                className="inline-flex items-center justify-center gap-2 sm:gap-3 px-6 sm:px-8 md:px-10 py-2 sm:py-3 md:py-4 bg-[#323956] hover:bg-[#232D3C] text-white rounded-full text-sm sm:text-base md:text-lg font-semibold transition-all hover:scale-105 shadow-lg"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Our Physical Location
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

      </div>
      </div>

      <Footer />
    </div>
  );
};

export default LBWProjectUpdates;
