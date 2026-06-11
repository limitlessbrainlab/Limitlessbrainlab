import React, { useState, useEffect, useRef } from 'react';

// Label scale for positive parameters (Cognition, Focus & Attention, Emotional Regulation, Learning, Creativity)
const POSITIVE_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High' };
// Label scale for negative parameters (Burnout, Stress)
const NEGATIVE_LABELS = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' };

// Color for each level
const LEVEL_COLORS = {
  positive: { 1: '#ef4444', 2: '#f59e0b', 3: '#22c55e' },   // Low=red, Medium=amber, High=green
  negative: { 1: '#22c55e', 2: '#f59e0b', 3: '#ef4444' }    // Mild=green, Moderate=amber, Severe=red
};

const BrainParametersSlider = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [animatedLevels, setAnimatedLevels] = useState({});
  const scrollContainerRef = useRef(null);
  const sectionRef = useRef(null);

  const parameters = [
    { name: 'Cognition', level: 3, type: 'positive', circleColor: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.5)', description: 'Mental processing speed & clarity' },
    { name: 'Focus & Attention', level: 2, type: 'positive', circleColor: '#3b82f6', glowColor: 'rgba(59, 130, 246, 0.5)', description: 'Concentration & sustained attention' },
    { name: 'Emotional Regulation', level: 2, type: 'positive', circleColor: '#f43f5e', glowColor: 'rgba(244, 63, 94, 0.5)', description: 'Emotional control & resilience' },
    { name: 'Learning', level: 3, type: 'positive', circleColor: '#8b5cf6', glowColor: 'rgba(139, 92, 246, 0.5)', description: 'Ability to acquire new knowledge' },
    { name: 'Creativity', level: 2, type: 'positive', circleColor: '#ec4899', glowColor: 'rgba(236, 72, 153, 0.5)', description: 'Innovative & divergent thinking' },
    { name: 'Burnout', level: 1, type: 'negative', circleColor: '#f97316', glowColor: 'rgba(249, 115, 22, 0.5)', description: 'Physical & mental exhaustion level' },
    { name: 'Stress', level: 2, type: 'negative', circleColor: '#ef4444', glowColor: 'rgba(239, 68, 68, 0.5)', description: 'Mental pressure & tension levels' },
  ];

  // Get label for a parameter based on its type and level
  const getLabel = (param) => {
    const labels = param.type === 'negative' ? NEGATIVE_LABELS : POSITIVE_LABELS;
    return labels[param.level] || '';
  };

  // Get level color based on type and level
  const getLevelColor = (param, lvl) => {
    const colors = param.type === 'negative' ? LEVEL_COLORS.negative : LEVEL_COLORS.positive;
    return colors[lvl] || '#d1d5db';
  };

  // Intersection Observer for scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            // Animate level indicators sequentially
            parameters.forEach((param, index) => {
              setTimeout(() => {
                setAnimatedLevels(prev => ({ ...prev, [param.name]: param.level }));
              }, index * 200 + 300);
            });
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Auto-scroll functionality
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % parameters.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [parameters.length]);

  // Scroll to current index
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = container.offsetWidth;
      container.scrollTo({
        left: currentIndex * cardWidth,
        behavior: 'smooth'
      });
    }
  }, [currentIndex]);

  return (
    <section
      ref={sectionRef}
      className="py-16 sm:py-20 md:py-24 bg-gradient-to-b from-gray-50 to-white relative overflow-hidden"
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-64 h-64 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" style={{animationDelay: '2s'}}></div>
        <div className="absolute bottom-20 left-1/3 w-64 h-64 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" style={{animationDelay: '4s'}}></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Title Section with Animation */}
        <div className={`text-center mb-16 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Measure
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Receive Your NeuroSense Brain and Mental Health Optimization Report
          </p>
        </div>

        {/* Horizontal Scrolling Container */}
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-6 pb-8"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {parameters.map((param, index) => {
              const currentAnimLevel = animatedLevels[param.name] || 0;
              const progressPercent = (param.level / 3) * 100;
              const label = getLabel(param);
              const labelColor = getLevelColor(param, param.level);

              return (
                <div
                  key={param.name}
                  className={`flex-shrink-0 w-full sm:w-80 snap-center transition-all duration-700 ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'
                  }`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div
                    className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl transition-all duration-500 h-full group hover:-translate-y-2 hover-shine relative overflow-hidden"
                    style={{
                      '--glow-color': param.glowColor
                    }}
                  >
                    {/* Hover glow effect */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at 50% 50%, ${param.glowColor}, transparent 70%)`
                      }}
                    ></div>

                    {/* Circular Progress */}
                    <div className="flex justify-center mb-4 relative z-10">
                      <div className="relative w-40 h-40 group-hover:scale-105 transition-transform duration-500">
                        {/* Outer glow ring */}
                        <div
                          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 animate-pulse"
                          style={{
                            boxShadow: `0 0 30px ${param.glowColor}, 0 0 60px ${param.glowColor}`
                          }}
                        ></div>

                        <svg className="w-full h-full transform -rotate-90 drop-shadow-lg">
                          {/* Background circle */}
                          <circle
                            cx="80"
                            cy="80"
                            r="72"
                            stroke="#f3f4f6"
                            strokeWidth="12"
                            fill="none"
                            className="transition-all duration-500"
                          />
                          {/* Animated Progress circle */}
                          <circle
                            cx="80"
                            cy="80"
                            r="72"
                            stroke={param.circleColor}
                            strokeWidth="12"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 72}`}
                            strokeDashoffset={isVisible ? `${2 * Math.PI * 72 * (1 - progressPercent / 100)}` : `${2 * Math.PI * 72}`}
                            strokeLinecap="round"
                            className="transition-all duration-[1500ms] ease-out"
                            style={{
                              filter: `drop-shadow(0 0 6px ${param.circleColor})`,
                              transitionDelay: `${index * 150}ms`
                            }}
                          />
                        </svg>

                        {/* Center text - fraction and label */}
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span
                            className="text-3xl font-bold text-gray-900 transition-all duration-300 group-hover:scale-110"
                            style={{
                              textShadow: `0 0 20px ${param.glowColor}`
                            }}
                          >
                            {currentAnimLevel}/3
                          </span>
                          <span
                            className="text-sm font-semibold mt-1 transition-all duration-300"
                            style={{ color: labelColor }}
                          >
                            {currentAnimLevel > 0 ? label : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 3-Step Level Indicator */}
                    <div className="flex justify-center gap-2 mb-4 relative z-10">
                      {[1, 2, 3].map((lvl) => {
                        const isActive = currentAnimLevel >= lvl;
                        const dotColor = isActive ? getLevelColor(param, lvl) : '#e5e7eb';
                        return (
                          <div
                            key={lvl}
                            className="flex flex-col items-center"
                          >
                            <div
                              className="w-8 h-2 rounded-full transition-all duration-500"
                              style={{
                                backgroundColor: dotColor,
                                transitionDelay: `${lvl * 200}ms`,
                                boxShadow: isActive ? `0 0 8px ${dotColor}` : 'none'
                              }}
                            ></div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Parameter Name with hover effect */}
                    <h3 className="text-xl font-bold text-center text-gray-900 mb-2 relative z-10 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-gray-900 group-hover:to-gray-600 transition-all duration-300">
                      {param.name}
                    </h3>

                    {/* Description with fade effect */}
                    <p className="text-center text-gray-600 text-sm relative z-10 group-hover:text-gray-700 transition-colors duration-300">
                      {param.description}
                    </p>

                    {/* Bottom accent line */}
                    <div
                      className="absolute bottom-0 left-0 h-1 bg-gradient-to-r transition-all duration-500 group-hover:w-full w-0"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${param.circleColor}, transparent)`
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation Dots with enhanced styling */}
          <div className="flex justify-center gap-2 mt-8">
            {parameters.map((param, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`h-3 rounded-full transition-all duration-500 hover:scale-125 ${
                  index === currentIndex
                    ? 'w-8 shadow-lg'
                    : 'w-3 bg-gray-300 hover:bg-gray-400'
                }`}
                style={{
                  backgroundColor: index === currentIndex ? param.circleColor : undefined,
                  boxShadow: index === currentIndex ? `0 0 10px ${param.glowColor}` : undefined
                }}
                aria-label={`Go to parameter ${index + 1}`}
              />
            ))}
          </div>
        </div>

      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .hover-shine {
          position: relative;
          overflow: hidden;
        }

        .hover-shine::before {
          content: '';
          position: absolute;
          top: 0;
          left: -75%;
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
          transform: skewX(-25deg);
          transition: left 0.6s ease;
          z-index: 20;
        }

        .hover-shine:hover::before {
          left: 125%;
        }
      `}</style>
    </section>
  );
};

export default BrainParametersSlider;
