import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, CheckCircle } from 'lucide-react';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';

const AboutUs = () => {
  const navigate = useNavigate();
  const [sectionsVisible, setSectionsVisible] = useState({});
  const sectionRefs = useRef({});

  useEffect(() => {
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

  const conditions = [
    {
      title: "ADHD",
      description: "Attention deficit hyperactivity or inactivity disease"
    },
    {
      title: "ANXIETY/DEPRESSION",
      description: "Highly useful in corelating and measuring the levels with clinical diagnosis ofcourse"
    },
    {
      title: "AUTISM",
      description: "Valuable in understanding the autistic spectrum or learning disease"
    },
    {
      title: "DEMENTIA",
      description: "Very valuable with the conflit analysis for diagnosing and quantifying the types of dementia"
    },
    {
      title: "MENTAL WELLNESS",
      description: "To understand the optimum functioning of the brain and the mental functions"
    },
    {
      title: "PTSD",
      description: "Understanding the post traumatic stress disease better and mapping some biomarkers for assisting in therapy."
    }
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <NavBar />

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInDown {
          from {
            opacity: 0;
            transform: translateY(-40px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
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

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        .animate-fadeInUp {
          animation: fadeInUp 0.8s ease-out forwards;
        }

        .animate-fadeInDown {
          animation: fadeInDown 0.8s ease-out forwards;
        }

        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }

        .animate-slideInLeft {
          animation: slideInLeft 0.8s ease-out forwards;
        }

        .animate-slideInRight {
          animation: slideInRight 0.8s ease-out forwards;
        }

        .animate-scaleIn {
          animation: scaleIn 0.6s ease-out forwards;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse 2s ease-in-out infinite;
        }

        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-400 { animation-delay: 0.4s; }
        .delay-500 { animation-delay: 0.5s; }
        .delay-600 { animation-delay: 0.6s; }
        .delay-700 { animation-delay: 0.7s; }
        .delay-800 { animation-delay: 0.8s; }

        .hover-lift {
          transition: all 0.3s ease;
        }
        .hover-lift:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }

        .hover-glow {
          transition: all 0.3s ease;
        }
        .hover-glow:hover {
          box-shadow: 0 0 30px rgba(50, 57, 86, 0.3);
        }

        .card-3d {
          transition: all 0.4s ease;
          transform-style: preserve-3d;
        }
        .card-3d:hover {
          transform: perspective(1000px) rotateX(2deg) rotateY(-2deg) translateY(-5px);
        }
      `}</style>

      {/* Main Content */}
      <div className="w-full pt-14 sm:pt-16">
        {/* Hero Section */}
        <section
          ref={(el) => (sectionRefs.current.hero = el)}
          data-section="hero"
          className={`bg-gradient-to-br from-blue-50 via-white to-blue-50 py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 transition-all duration-1000 ${
            sectionsVisible.hero ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 md:gap-12 items-center">
              <div className={sectionsVisible.hero ? 'animate-slideInLeft' : 'opacity-0'}>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-[#323956] mb-3 sm:mb-4 md:mb-6 leading-tight">
                  Mapping NeuroPsychiatry
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-gray-700 mb-2 sm:mb-3 md:mb-4 leading-relaxed">
                  Unlock your brain's full potential with personalized wellness through cutting edge precision analysis.
                </p>
                <p className="text-xs sm:text-sm md:text-base text-gray-700 leading-relaxed">
                  Limitless Brain Lab is a pioneering company at the forefront of neurotechnology, specializing in advanced brain mapping techniques using electroencephalography (EEG) and Quantitative analysis using the world's credible and reliable databases.
                </p>
              </div>
              <div className={`relative ${sectionsVisible.hero ? 'animate-slideInRight' : 'opacity-0'}`}>
                <div className="flex justify-center sm:justify-end mb-2">
                  <div className="bg-gradient-to-r from-[#323956] to-[#323956] text-white px-3 sm:px-5 md:px-6 py-2 sm:py-3 rounded-lg shadow-xl animate-pulse text-center">
                    <p className="text-[10px] sm:text-xs md:text-sm font-semibold">We have Mapped over</p>
                    <p className="text-sm sm:text-lg md:text-2xl font-bold">1000 Brains & Counting</p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <img
                    src="/brain0.png"
                    alt="Brain Health"
                    className="w-44 h-44 sm:w-60 sm:h-60 md:w-72 md:h-72 lg:w-80 lg:h-80 xl:w-96 xl:h-96 object-contain animate-float"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Precision Brain Analysis Section */}
        <section
          ref={(el) => (sectionRefs.current.precision = el)}
          data-section="precision"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-white transition-all duration-1000 ${
            sectionsVisible.precision ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-6xl mx-auto text-center">
            <h2 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-[#323956] mb-3 sm:mb-5 md:mb-8 ${sectionsVisible.precision ? 'animate-fadeInUp' : 'opacity-0'}`}>
              Precision Brain Analysis For All
            </h2>
            <div className={`space-y-3 sm:space-y-4 md:space-y-6 text-xs sm:text-sm md:text-base lg:text-lg text-gray-700 max-w-5xl mx-auto ${sectionsVisible.precision ? 'animate-fadeIn delay-200' : 'opacity-0'}`}>
              <p className="leading-relaxed">
                Precision brain analysis transforms brain health by providing detailed insights into brain function, leading to more accurate diagnoses and personalized treatment plans. It enhances neuropsychiatric care with targeted interventions and reduces trial and error in treatment.
              </p>
              <p className="leading-relaxed">
                For neuropsychiatric conditions, it enables customized care based on specific brain patterns, improving treatment outcomes. In brain wellness, it supports cognitive optimization and preventive care by identifying strengths and risks early, promoting overall well being.
              </p>
              <p className="leading-relaxed font-semibold">
                Our dedicated 20 page analysis Neuro Sense Report is detailed and intuitive. We focus on individualized, holistic, and integrative recommendations.
              </p>
            </div>
          </div>
        </section>

        {/* Get Your Brain Mapped Section */}
        <section
          ref={(el) => (sectionRefs.current.steps = el)}
          data-section="steps"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-gradient-to-br from-gray-50 to-blue-50 transition-all duration-1000 ${
            sectionsVisible.steps ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <h2 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-[#323956] text-center mb-6 sm:mb-8 md:mb-12 lg:mb-16 ${sectionsVisible.steps ? 'animate-fadeInUp' : 'opacity-0'}`}>
              Get Your Brain Mapped For A<br className="hidden sm:block" /><span className="sm:hidden"> </span>Bright Future
            </h2>

            <div className="space-y-3 sm:space-y-5 md:space-y-8 lg:space-y-12">
              {/* Step 01 */}
              <div className={`bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl p-4 sm:p-5 md:p-6 lg:p-8 border-l-4 border-[#323956] hover-lift card-3d hover-shine hover-glow ${sectionsVisible.steps ? 'animate-fadeInUp delay-100' : 'opacity-0'}`}>
                <div className="flex flex-row gap-3 sm:gap-5 md:gap-8">
                  <div className="flex-shrink-0">
                    <div className="text-[#323956]">
                      <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold uppercase tracking-wider">Step</p>
                      <p className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold leading-none">01</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 md:mb-3 leading-snug">
                      Measure EEG The Comprehensive Package
                    </h3>
                    <p className="text-[13px] sm:text-sm md:text-base text-gray-600 leading-relaxed">
                      Capture comprehensive EEG data with our full package, designed for both clinical and wellness applications. Our advanced EEG recording system ensures high quality, reliable measurements, offering a detailed view of brainwave activity across multiple channels. With this complete setup, you can uncover vital information about brain function and detect potential abnormalities.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 02 */}
              <div className={`bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl p-4 sm:p-5 md:p-6 lg:p-8 border-l-4 border-[#323956] hover-lift card-3d hover-shine hover-glow ${sectionsVisible.steps ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
                <div className="flex flex-row gap-3 sm:gap-5 md:gap-8">
                  <div className="flex-shrink-0">
                    <div className="text-[#323956]">
                      <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold uppercase tracking-wider">Step</p>
                      <p className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold leading-none" style={{animationDelay: '0.5s'}}>02</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 md:mb-3 leading-snug">
                      Upload EEG & allow us to run your report
                    </h3>
                    <p className="text-[13px] sm:text-sm md:text-base text-gray-600 leading-relaxed">
                      Easily upload your EEG data in the standard .EDF (European Data Format) to our platform for expert analysis. The .EDF format ensures compatibility and consistency, allowing us to process and interpret your brainwave data efficiently. Once uploaded, our team of specialists will analyze the data to uncover meaningful patterns and insights that are critical for both diagnostic and wellness purposes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 03 */}
              <div className={`bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl p-4 sm:p-5 md:p-6 lg:p-8 border-l-4 border-[#323956] hover-lift card-3d hover-shine hover-glow ${sectionsVisible.steps ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
                <div className="flex flex-row gap-3 sm:gap-5 md:gap-8">
                  <div className="flex-shrink-0">
                    <div className="text-[#323956]">
                      <p className="text-[9px] sm:text-[10px] md:text-xs font-semibold uppercase tracking-wider">Step</p>
                      <p className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold leading-none" style={{animationDelay: '1s'}}>03</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 md:mb-3 leading-snug">
                      Get a Detailed Brain Wellness Report
                    </h3>
                    <p className="text-[13px] sm:text-sm md:text-base text-gray-600 leading-relaxed">
                      Receive an in depth QEEG report that provides a comprehensive overview of your brain's electrical activity. Our reports include detailed maps, statistical analyses, and comparisons with normative databases, highlighting areas that may require attention. This detailed analysis supports accurate diagnosis and helps in crafting personalized treatment or wellness plans to optimize brain health and function.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Conditions Section */}
        <section
          ref={(el) => (sectionRefs.current.conditions = el)}
          data-section="conditions"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-white transition-all duration-1000 ${
            sectionsVisible.conditions ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <h2 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-[#323956] text-center mb-3 sm:mb-5 md:mb-8 ${sectionsVisible.conditions ? 'animate-fadeInUp' : 'opacity-0'}`}>
              Conditions Where Brain Wellness Analysis<br className="hidden sm:block" /><span className="sm:hidden"> </span>is Indicated
            </h2>
            <p className={`text-center text-xs sm:text-sm md:text-base lg:text-lg text-gray-700 max-w-4xl mx-auto mb-5 sm:mb-6 md:mb-10 lg:mb-12 leading-relaxed ${sectionsVisible.conditions ? 'animate-fadeIn delay-200' : 'opacity-0'}`}>
              We use a non invasive EEG analysis tool for brain wellness and neuropsychiatric practice. Our hardware is easy to use and point of care. Our software analyzes brainwave patterns to identify abnormalities and optimize brain function. We help monitor conditions like ADHD, depression, and anxiety by offering personalized insights into brain health, promoting overall mental well being. The findings from Limitless Brain Lab provide valuable support in adding integrative and Neuromodulation practices in your routine.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 lg:gap-8 mb-5 sm:mb-6 md:mb-10 lg:mb-12">
              {conditions.map((condition, index) => (
                <div
                  key={index}
                  className={`bg-gradient-to-br from-blue-50 to-white rounded-lg sm:rounded-xl p-3 sm:p-4 md:p-6 lg:p-8 text-center hover-lift hover-glow border border-blue-100 ${
                    sectionsVisible.conditions ? 'animate-scaleIn' : 'opacity-0'
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 bg-gradient-to-r from-[#323956] to-[#323956] rounded-full mx-auto mb-2 sm:mb-3 md:mb-4 flex items-center justify-center shadow-lg">
                    <Brain className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
                  </div>
                  <h3 className="text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-bold text-gray-900 mb-1 sm:mb-2 md:mb-3">{condition.title}</h3>
                  <p className="text-gray-600 text-[10px] sm:text-xs md:text-sm leading-relaxed">
                    {condition.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Objective Measurement Section */}
        <section
          ref={(el) => (sectionRefs.current.objective = el)}
          data-section="objective"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-gradient-to-r from-[#323956] to-[#323956] relative overflow-hidden transition-all duration-1000 ${
            sectionsVisible.objective ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-24 sm:w-36 md:w-48 lg:w-64 h-24 sm:h-36 md:h-48 lg:h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-32 sm:w-48 md:w-72 lg:w-96 h-32 sm:h-48 md:h-72 lg:h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2"></div>
          </div>
          <div className="max-w-5xl mx-auto text-white relative z-10">
            <h2 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold mb-3 sm:mb-4 md:mb-6 text-center ${sectionsVisible.objective ? 'animate-fadeInUp' : 'opacity-0'}`}>
              Objective Measurement Matters
            </h2>
            <div className={`text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed ${sectionsVisible.objective ? 'animate-fadeIn delay-200' : 'opacity-0'}`}>
              <p className="mb-3 sm:mb-4 text-center">
                Objective clinical measurements, such as X rays or electrocardiograms, are utilized in treating, diagnosing, and managing various medical conditions across different medical modalities. <span className="font-bold bg-white/20 px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs md:text-sm lg:text-base">Yet, they remain mostly absent in Neuropsychiatric care</span>. Objective measurements are crucial because they provide quantifiable and reliable data to ensure consistent and evidence based healthcare practices.
              </p>
            </div>
          </div>
        </section>

        {/* Report Sections */}
        <section
          ref={(el) => (sectionRefs.current.reports = el)}
          data-section="reports"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-white transition-all duration-1000 ${
            sectionsVisible.reports ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 md:gap-10 lg:gap-12 mb-8 sm:mb-12 md:mb-16 lg:mb-20 items-center">
              {/* A Detailed Report */}
              <div className={sectionsVisible.reports ? 'animate-slideInLeft' : 'opacity-0'}>
                <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-[#323956] mb-2 sm:mb-3 md:mb-4">A Detailed Report</h3>
                <p className="text-xs sm:text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed mb-3 sm:mb-4 md:mb-6">
                  The Neuro Sense Report delivers comprehensive insights into cognitive function, emotional regulation, sleep analysis, neurological markers, and peak performance optimization. It also provides recommendations for meditation, diet, neurofeedback therapies, the types of medications, and much more.
                </p>
                <div className="space-y-1.5 sm:space-y-2 md:space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#323956] flex-shrink-0" />
                    <span className="text-xs sm:text-sm md:text-base text-gray-700">Comprehensive cognitive analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#323956] flex-shrink-0" />
                    <span className="text-xs sm:text-sm md:text-base text-gray-700">Personalized treatment recommendations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[#323956] flex-shrink-0" />
                    <span className="text-xs sm:text-sm md:text-base text-gray-700">Detailed statistical analyses</span>
                  </div>
                </div>
              </div>
              <div className={sectionsVisible.reports ? 'animate-slideInRight' : 'opacity-0'}>
                <div className="flex items-center justify-center">
                  <img
                    src="/brain1.png"
                    alt="Brain Analysis"
                    className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 lg:w-72 lg:h-72 xl:w-80 xl:h-80 object-contain animate-float"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 md:gap-10 lg:gap-12 items-center">
              <div className={`order-2 md:order-1 ${sectionsVisible.reports ? 'animate-slideInLeft delay-300' : 'opacity-0'}`}>
                <div className="flex items-center justify-center">
                  <img
                    src="/brain2.png"
                    alt="Brain Insights"
                    className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 lg:w-72 lg:h-72 xl:w-80 xl:h-80 object-contain animate-float"
                  />
                </div>
              </div>
              <div className={`order-1 md:order-2 ${sectionsVisible.reports ? 'animate-slideInRight delay-300' : 'opacity-0'}`}>
                <h3 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-[#323956] mb-2 sm:mb-3 md:mb-4">
                  Personalized Recommendations<br className="hidden sm:block" /><span className="sm:hidden"> </span>& Insights
                </h3>
                <p className="text-xs sm:text-sm md:text-base lg:text-lg text-gray-700 leading-relaxed">
                  Limitless Brain Lab utilizes your brain information to provide tailored suggestions and analysis. Get personalized insights for supplements, medications, meditation, and a range of neuro modulation services to optimize your overall well being.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Neuro Coaching 360 */}
        <section
          ref={(el) => (sectionRefs.current.academy = el)}
          data-section="academy"
          className={`py-8 sm:py-12 md:py-16 lg:py-20 px-3 sm:px-4 md:px-6 lg:px-10 bg-[#323956] text-white transition-all duration-1000 ${
            sectionsVisible.academy ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="max-w-6xl mx-auto">
            {/* Header Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 md:gap-10 lg:gap-12 items-center mb-6 sm:mb-8 md:mb-12 lg:mb-16">
              <div className={sectionsVisible.academy ? 'animate-slideInLeft' : 'opacity-0'}>
                <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 md:mb-6">Neuro Coaching 360</h2>
                <p className="text-sm sm:text-base md:text-lg text-gray-300 mb-2 sm:mb-3 md:mb-4">Powered by Limitless Brain Lab</p>
                <p className="text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed mb-2 sm:mb-3 md:mb-4">
                  We warmly invite coaches, therapists, wellness practitioners, educators, and integrative health professionals to be part of Neuro Coaching 360, an advanced learning experience designed to elevate your practice through brain-based precision coaching using Limitless Brain Lab.
                </p>
                <p className="text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed">
                  This program is created for professionals who want to move beyond generic coaching frameworks and step into data-driven, neuroscience-backed transformation.
                </p>
              </div>
              <div className={`flex justify-center md:justify-end ${sectionsVisible.academy ? 'animate-slideInRight' : 'opacity-0'}`}>
                <img
                  src="/Neurosense Academy.jpeg"
                  alt="Neuro Coaching 360"
                  className="w-full max-w-[280px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg object-contain rounded-lg sm:rounded-xl md:rounded-2xl"
                />
              </div>
            </div>

            {/* What is Neuro Coaching 360 */}
            <div className={`bg-white/10 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-5 md:p-6 lg:p-8 mb-5 sm:mb-6 md:mb-10 lg:mb-12 ${sectionsVisible.academy ? 'animate-fadeInUp delay-200' : 'opacity-0'}`}>
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-2 sm:mb-3 md:mb-4">What is Neuro Coaching 360?</h3>
              <p className="text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed mb-2 sm:mb-3 md:mb-4">
                Neuro Coaching 360 is a specialized certification-style learning journey where you will learn how to read, understand, and apply Limitless Brain Lab brain analysis in real-world coaching and wellness settings. It bridges neuroscience, behavior change, emotional regulation, and performance optimization, making your interventions more accurate, measurable, and impactful.
              </p>
              <p className="text-[10px] sm:text-xs md:text-sm lg:text-base text-gray-300 italic">
                This is not theory-heavy neuroscience. This is applied neuro-coaching, simple, practical, and powerful.
              </p>
            </div>

            {/* What You Will Learn */}
            <div className={`mb-5 sm:mb-6 md:mb-10 lg:mb-12 ${sectionsVisible.academy ? 'animate-fadeInUp delay-300' : 'opacity-0'}`}>
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 md:mb-6 text-center">What You Will Learn</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to understand Limitless Brain Lab brain reports</p>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to identify patterns related to focus, stress, emotions, burnout, and performance</p>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to translate brain data into clear coaching conversations</p>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to design personalized brain optimization plans for clients</p>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to guide clients into flow states and sustainable high performance</p>
                </div>
                <div className="flex items-start gap-2 sm:gap-3 bg-white/5 p-2.5 sm:p-3 md:p-4 rounded-lg hover:bg-white/10 transition-all duration-300 transform hover:scale-[1.02]">
                  <span className="text-green-400 text-sm sm:text-base md:text-xl flex-shrink-0">✓</span>
                  <p className="text-[11px] sm:text-xs md:text-sm lg:text-base">How to ethically and confidently use Limitless Brain Lab as a coaching and wellness tool</p>
                </div>
              </div>
            </div>

            {/* Why This Matters */}
            <div className={`mb-5 sm:mb-6 md:mb-10 lg:mb-12 ${sectionsVisible.academy ? 'animate-fadeInUp delay-400' : 'opacity-0'}`}>
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 md:mb-6 text-center">Why This Matters for Coaches & Wellness Practitioners</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">1. From Intuition to Precision</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">You already sense what your clients need. Neuro Coaching 360 gives you objective brain insights to validate, refine, and strengthen your guidance.</p>
                </div>
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">2. Stronger Client Outcomes</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">Clients experience faster clarity, deeper trust, and measurable progress when coaching is aligned with their brain patterns.</p>
                </div>
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">3. Differentiation in a Crowded Market</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">Limitless Brain Lab-powered coaching positions you as a next-generation practitioner, not just another coach.</p>
                </div>
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">4. Ethical, Non-Diagnostic, Science-Based</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">You learn how to use neuroscience responsibly, without diagnosing, while staying firmly within coaching and wellness boundaries.</p>
                </div>
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">5. Expand Your Practice & Impact</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">Whether you work with students, executives, parents, or healing clients, Neuro Coaching 360 helps you scale impact without burnout.</p>
                </div>
                <div className="bg-white/10 p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-xl">
                  <h4 className="font-bold text-sm sm:text-base md:text-lg mb-1.5 sm:mb-2">6. Continuous Learning & Support</h4>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-300">Access ongoing training, resources, and a community of like-minded practitioners to stay updated with the latest neuroscience developments.</p>
                </div>
              </div>
            </div>

            {/* Who Should Join */}
            <div className={`bg-white/10 rounded-lg sm:rounded-xl md:rounded-2xl p-3 sm:p-5 md:p-6 lg:p-8 ${sectionsVisible.academy ? 'animate-fadeInUp delay-500' : 'opacity-0'}`}>
              <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold mb-3 sm:mb-4 md:mb-6 text-center">Who Should Join</h3>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 md:gap-3">
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Life, Executive & Performance Coaches</span>
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Wellness & Holistic Practitioners</span>
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Therapists (Non-clinical Application)</span>
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Educators & Student Mentors</span>
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Yoga & Meditation Facilitators</span>
                <span className="bg-white/20 px-2.5 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-full text-[10px] sm:text-xs md:text-sm hover:bg-white/40 transition-all duration-300 cursor-default hover:scale-105">Breathwork & Mind-Body Practitioners</span>
              </div>
              <div className="mt-4 sm:mt-6 md:mt-8 text-center">
                <a
                  href="/professional-onboarding"
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-5 sm:px-6 md:px-8 py-2.5 sm:py-3 md:py-4 bg-[#F5D05D] hover:bg-[#e5c04d] text-[#323956] rounded-full text-xs sm:text-sm md:text-base lg:text-lg font-semibold transition-all hover:scale-105 shadow-lg"
                >
                  Apply Now
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>

      </div>

      <Footer />
    </div>
  );
};

export default AboutUs;
