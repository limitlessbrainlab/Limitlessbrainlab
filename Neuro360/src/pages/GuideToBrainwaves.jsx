import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import Footer from '../components/Footer';

const GuideToBrainwaves = () => {
  const [activeSection, setActiveSection] = useState('brain-regions');
  const [expandedWave, setExpandedWave] = useState('gamma');
  const [mentalState, setMentalState] = useState('idle');

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const sections = document.querySelectorAll('section[id]');
        let current = '';
        sections.forEach((section) => {
          if (window.pageYOffset >= section.offsetTop - 250) {
            current = section.getAttribute('id');
          }
        });
        if (current) setActiveSection(current);
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll Animation Observer
  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observerCallback = (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Add staggered delay based on element's position
          const delay = entry.target.dataset.delay || 0;
          setTimeout(() => {
            entry.target.classList.add('scroll-visible');
          }, delay * 100);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all elements with scroll-animate class
    const animatedElements = document.querySelectorAll('.scroll-animate');
    animatedElements.forEach((el, index) => {
      el.dataset.delay = index % 5; // Stagger in groups of 5
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const toggleWave = (waveId) => {
    setExpandedWave(expandedWave === waveId ? null : waveId);
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 120;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const navigationItems = [
    { id: 'brain-regions', label: 'Brain regions', number: '1.' },
    { id: 'brainwaves-explained', label: 'Brainwaves explained', number: '2.' },
    { id: 'female-brain', label: 'Female brain', number: '3.' },
    { id: 'wiring-differences', label: 'Wiring differences', number: '4.' },
    { id: 'alpha-peak', label: 'Alpha Peak', number: '5.' },
    { id: 'alpha-peak-trends', label: 'Alpha Peak trends', number: '6.' },
    { id: 'alpha-peak-variations', label: 'Alpha Peak variations', number: '7.' },
    { id: 'aging-insights', label: 'Aging insights', number: '8.' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;700&display=swap');

        :root {
          /* Myndlift Color Tokens */
          --color-primary-blue: #2060df;
          --color-secondary-purple: #7420df;
          --color-bg-dark: #050505;
          --color-bg-dark-2: #131415;
          --color-bg-dark-3: #161819;
          --color-bg-dark-4: #1f1f1f;
          --color-text-primary: #fff;
          --color-text-secondary: #9ba1a5;
          --color-text-tertiary: #585e5b;
          --color-green-dark: #2b4841;
          --color-green-medium: #457366;
          --color-green-sage: #599483;
          --color-green-light: #d1ebe3;
        }

        * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .brainwaves-page {
          min-height: 100vh;
          background-color: var(--color-bg-dark);
          color: var(--color-text-primary);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 16px;
          line-height: 1.6;
        }

        .guide-wrapper {
          max-width: 1000px;
          margin: 0 auto;
          padding: 100px 40px 0 40px;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Base responsive breakpoints for guide-wrapper */
        @media (max-width: 1024px) {
          .guide-wrapper {
            padding: 90px 32px 0 32px;
          }
        }

        @media (max-width: 768px) {
          .guide-wrapper {
            padding: 80px 24px 0 24px;
          }
        }

        @media (max-width: 640px) {
          .guide-wrapper {
            padding: 70px 16px 0 16px;
          }
        }

        /* Sidebar Styles */
        .sidebar-nav {
          position: sticky;
          top: 120px;
          width: 220px;
          height: fit-content;
          flex-shrink: 0;
        }

        /* Hide sidebar on tablet and mobile */
        @media (max-width: 768px) {
          .sidebar-nav {
            display: none;
          }
        }

        .sidebar-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 24px;
        }

        .nav-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .nav-item {
          margin-bottom: 4px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          font-size: 15px;
          color: var(--color-text-secondary);
          text-decoration: none;
          border-radius: 6px;
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative;
        }

        .nav-link:hover {
          color: var(--color-text-primary);
          background-color: rgba(255, 255, 255, 0.03);
        }

        .nav-link.active {
          color: var(--color-text-primary);
          background-color: rgba(255, 255, 255, 0.06);
          font-weight: 500;
        }

        .nav-link.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, var(--color-primary-blue), var(--color-secondary-purple));
        }

        .nav-number {
          font-size: 13px;
          font-weight: 400;
          opacity: 0.5;
          min-width: 20px;
        }

        /* Main Content */
        .main-content {
          width: 100%;
          max-width: 100%;
          padding-bottom: 100px;
        }

        /* Responsive main-content */
        @media (max-width: 1024px) {
          .main-content {
            padding-bottom: 80px;
          }
        }

        @media (max-width: 768px) {
          .main-content {
            padding-bottom: 60px;
          }
        }

        @media (max-width: 640px) {
          .main-content {
            padding-bottom: 48px;
          }
        }

        .content-section {
          margin-bottom: 100px;
          opacity: 0;
          transform: translateY(20px);
          animation: fadeInUp 0.8s ease forwards;
        }

        /* Responsive content-section */
        @media (max-width: 1024px) {
          .content-section {
            margin-bottom: 80px;
          }
        }

        @media (max-width: 768px) {
          .content-section {
            margin-bottom: 60px;
          }
        }

        @media (max-width: 640px) {
          .content-section {
            margin-bottom: 48px;
          }
        }

        .content-section:nth-child(1) { animation-delay: 0.1s; }
        .content-section:nth-child(2) { animation-delay: 0.15s; }
        .content-section:nth-child(3) { animation-delay: 0.2s; }
        .content-section:nth-child(4) { animation-delay: 0.25s; }
        .content-section:nth-child(5) { animation-delay: 0.3s; }

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

        /* ===== NEW ANIMATIONS ===== */
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(32, 96, 223, 0.3); }
          50% { box-shadow: 0 0 40px rgba(116, 32, 223, 0.5); }
        }

        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes waveMove {
          0% { transform: translateX(0) translateY(0); }
          25% { transform: translateX(5px) translateY(-3px); }
          50% { transform: translateX(0) translateY(0); }
          75% { transform: translateX(-5px) translateY(3px); }
          100% { transform: translateX(0) translateY(0); }
        }

        @keyframes borderGlow {
          0%, 100% { border-color: rgba(32, 96, 223, 0.3); }
          50% { border-color: rgba(116, 32, 223, 0.6); }
        }

        @keyframes textGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* ===== MORE ANIMATIONS ===== */
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-20px); }
          60% { transform: translateY(-10px); }
        }

        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }

        @keyframes scaleIn {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes flipIn {
          0% { opacity: 0; transform: perspective(400px) rotateY(90deg); }
          40% { transform: perspective(400px) rotateY(-10deg); }
          70% { transform: perspective(400px) rotateY(10deg); }
          100% { opacity: 1; transform: perspective(400px) rotateY(0); }
        }

        @keyframes glitch {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
        }

        @keyframes neonPulse {
          0%, 100% {
            text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 20px currentColor;
          }
          50% {
            text-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 40px currentColor, 0 0 80px currentColor;
          }
        }

        @keyframes ripple {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(4); opacity: 0; }
        }

        @keyframes morphBlob {
          0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          25% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
          50% { border-radius: 50% 60% 30% 60% / 30% 60% 70% 40%; }
          75% { border-radius: 60% 40% 60% 30% / 70% 30% 50% 60%; }
        }

        @keyframes swing {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(15deg); }
          40% { transform: rotate(-10deg); }
          60% { transform: rotate(5deg); }
          80% { transform: rotate(-5deg); }
        }

        @keyframes rubberBand {
          0% { transform: scale(1); }
          30% { transform: scaleX(1.25) scaleY(0.75); }
          40% { transform: scaleX(0.75) scaleY(1.25); }
          50% { transform: scaleX(1.15) scaleY(0.85); }
          65% { transform: scaleX(0.95) scaleY(1.05); }
          75% { transform: scaleX(1.05) scaleY(0.95); }
          100% { transform: scale(1); }
        }

        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          14% { transform: scale(1.1); }
          28% { transform: scale(1); }
          42% { transform: scale(1.1); }
          70% { transform: scale(1); }
        }

        @keyframes typewriter {
          from { width: 0; }
          to { width: 100%; }
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(50px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-50px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes rotateIn {
          from { opacity: 0; transform: rotate(-200deg); }
          to { opacity: 1; transform: rotate(0); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }

        @keyframes wobble {
          0%, 100% { transform: translateX(0) rotate(0); }
          15% { transform: translateX(-15px) rotate(-5deg); }
          30% { transform: translateX(10px) rotate(3deg); }
          45% { transform: translateX(-10px) rotate(-3deg); }
          60% { transform: translateX(5px) rotate(2deg); }
          75% { transform: translateX(-5px) rotate(-1deg); }
        }

        @keyframes flash {
          0%, 50%, 100% { opacity: 1; }
          25%, 75% { opacity: 0; }
        }

        @keyframes tada {
          0%, 100% { transform: scale(1) rotate(0); }
          10%, 20% { transform: scale(0.9) rotate(-3deg); }
          30%, 50%, 70%, 90% { transform: scale(1.1) rotate(3deg); }
          40%, 60%, 80% { transform: scale(1.1) rotate(-3deg); }
        }

        @keyframes jello {
          0%, 100% { transform: skewX(0) skewY(0); }
          11.1% { transform: skewX(-12.5deg) skewY(-12.5deg); }
          22.2% { transform: skewX(6.25deg) skewY(6.25deg); }
          33.3% { transform: skewX(-3.125deg) skewY(-3.125deg); }
          44.4% { transform: skewX(1.5625deg) skewY(1.5625deg); }
          55.5% { transform: skewX(-0.78125deg) skewY(-0.78125deg); }
          66.6% { transform: skewX(0.390625deg) skewY(0.390625deg); }
          77.7% { transform: skewX(-0.1953125deg) skewY(-0.1953125deg); }
        }

        @keyframes electricPulse {
          0%, 100% {
            filter: brightness(1) drop-shadow(0 0 5px rgba(32, 96, 223, 0.5));
          }
          50% {
            filter: brightness(1.3) drop-shadow(0 0 20px rgba(116, 32, 223, 0.8));
          }
        }

        @keyframes scanLine {
          0% { top: 0%; }
          100% { top: 100%; }
        }

        @keyframes particleFloat {
          0%, 100% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 0;
          }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% {
            transform: translateY(-100px) translateX(20px) rotate(360deg);
            opacity: 0;
          }
        }

        @keyframes colorCycle {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }

        @keyframes borderDance {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
            border-color: rgba(32, 96, 223, 0.5);
          }
          25% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
            border-color: rgba(116, 32, 223, 0.5);
          }
          50% {
            border-radius: 50% 60% 30% 60% / 30% 60% 70% 40%;
            border-color: rgba(89, 148, 131, 0.5);
          }
          75% {
            border-radius: 60% 40% 60% 30% / 70% 30% 50% 60%;
            border-color: rgba(32, 96, 223, 0.5);
          }
        }

        /* ===== SCROLL ANIMATION CLASSES ===== */
        .scroll-animate {
          opacity: 0;
          transform: translateY(50px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate.scroll-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Different scroll animation variants */
        .scroll-animate-left {
          opacity: 0;
          transform: translateX(-50px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-left.scroll-visible {
          opacity: 1;
          transform: translateX(0);
        }

        .scroll-animate-right {
          opacity: 0;
          transform: translateX(50px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-right.scroll-visible {
          opacity: 1;
          transform: translateX(0);
        }

        .scroll-animate-scale {
          opacity: 0;
          transform: scale(0.8);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-scale.scroll-visible {
          opacity: 1;
          transform: scale(1);
        }

        .scroll-animate-fade {
          opacity: 0;
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-fade.scroll-visible {
          opacity: 1;
        }

        .scroll-animate-flip {
          opacity: 0;
          transform: perspective(400px) rotateY(-90deg);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-flip.scroll-visible {
          opacity: 1;
          transform: perspective(400px) rotateY(0);
        }

        .scroll-animate-zoom {
          opacity: 0;
          transform: scale(0.5);
          transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .scroll-animate-zoom.scroll-visible {
          opacity: 1;
          transform: scale(1);
        }

        .scroll-animate-bounce {
          opacity: 0;
          transform: translateY(50px);
          transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .scroll-animate-bounce.scroll-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .scroll-animate-rotate {
          opacity: 0;
          transform: rotate(-10deg) translateY(30px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .scroll-animate-rotate.scroll-visible {
          opacity: 1;
          transform: rotate(0) translateY(0);
        }

        /* Stagger delay classes */
        .scroll-delay-1 { transition-delay: 0.1s; }
        .scroll-delay-2 { transition-delay: 0.2s; }
        .scroll-delay-3 { transition-delay: 0.3s; }
        .scroll-delay-4 { transition-delay: 0.4s; }
        .scroll-delay-5 { transition-delay: 0.5s; }
        .scroll-delay-6 { transition-delay: 0.6s; }
        .scroll-delay-7 { transition-delay: 0.7s; }
        .scroll-delay-8 { transition-delay: 0.8s; }

        /* ===== TEXT ANIMATION UTILITY CLASSES ===== */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .animate-on-scroll.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .hover-bounce:hover {
          animation: bounce 0.6s ease;
        }

        .hover-shake:hover {
          animation: shake 0.5s ease;
        }

        .hover-rubberBand:hover {
          animation: rubberBand 0.8s ease;
        }

        .hover-jello:hover {
          animation: jello 0.9s ease;
        }

        .hover-tada:hover {
          animation: tada 0.8s ease;
        }

        .hover-heartbeat:hover {
          animation: heartbeat 1s ease;
        }

        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
        .stagger-3 { animation-delay: 0.3s; }
        .stagger-4 { animation-delay: 0.4s; }
        .stagger-5 { animation-delay: 0.5s; }
        .stagger-6 { animation-delay: 0.6s; }

        .section-title {
          font-size: 42px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 28px;
          color: var(--color-text-primary);
          letter-spacing: -0.5px;
        }

        /* Responsive section-title */
        @media (max-width: 1024px) {
          .section-title {
            font-size: 36px;
            margin-bottom: 24px;
          }
        }

        @media (max-width: 768px) {
          .section-title {
            font-size: 32px;
            margin-bottom: 20px;
          }
        }

        @media (max-width: 640px) {
          .section-title {
            font-size: 26px;
            margin-bottom: 16px;
          }
        }

        .section-subtitle {
          font-size: 28px;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 48px;
          margin-bottom: 20px;
          color: var(--color-text-primary);
        }

        /* Responsive section-subtitle */
        @media (max-width: 1024px) {
          .section-subtitle {
            font-size: 24px;
            margin-top: 40px;
            margin-bottom: 18px;
          }
        }

        @media (max-width: 768px) {
          .section-subtitle {
            font-size: 22px;
            margin-top: 32px;
            margin-bottom: 16px;
          }
        }

        @media (max-width: 640px) {
          .section-subtitle {
            font-size: 20px;
            margin-top: 24px;
            margin-bottom: 14px;
          }
        }

        .section-text {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-secondary);
          margin-bottom: 20px;
        }

        /* Responsive section-text */
        @media (max-width: 1024px) {
          .section-text {
            font-size: 16px;
            margin-bottom: 18px;
          }
        }

        @media (max-width: 768px) {
          .section-text {
            font-size: 15px;
            margin-bottom: 16px;
          }
        }

        @media (max-width: 640px) {
          .section-text {
            font-size: 14px;
            margin-bottom: 14px;
          }
        }

        /* Wave Cards */
        .wave-card {
          background: linear-gradient(135deg, rgba(32, 96, 223, 0.08), rgba(116, 32, 223, 0.08));
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 32px;
          margin: 28px 0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
        }

        .wave-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
          transition: left 0.5s ease;
        }

        .wave-card:hover::before {
          left: 100%;
        }

        /* Responsive wave-card */
        @media (max-width: 1024px) {
          .wave-card {
            padding: 28px;
            margin: 24px 0;
            border-radius: 14px;
          }
        }

        @media (max-width: 768px) {
          .wave-card {
            padding: 24px;
            margin: 20px 0;
            border-radius: 12px;
          }
        }

        @media (max-width: 640px) {
          .wave-card {
            padding: 16px;
            margin: 16px 0;
            border-radius: 10px;
          }
        }

        .wave-card:hover {
          transform: translateY(-8px) scale(1.01);
          border-color: rgba(116, 32, 223, 0.4);
          box-shadow:
            0 20px 50px rgba(116, 32, 223, 0.2),
            0 0 30px rgba(32, 96, 223, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          background: linear-gradient(135deg, rgba(32, 96, 223, 0.12), rgba(116, 32, 223, 0.12));
        }

        .wave-card-title {
          font-size: 22px;
          font-weight: 600;
          color: var(--color-primary-blue);
          margin-bottom: 8px;
        }

        /* Responsive wave-card-title */
        @media (max-width: 1024px) {
          .wave-card-title {
            font-size: 20px;
          }
        }

        @media (max-width: 768px) {
          .wave-card-title {
            font-size: 18px;
          }
        }

        @media (max-width: 640px) {
          .wave-card-title {
            font-size: 16px;
          }
        }

        .wave-frequency {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-secondary-purple);
          margin-bottom: 16px;
          letter-spacing: 0.5px;
        }

        /* Responsive wave-frequency */
        @media (max-width: 768px) {
          .wave-frequency {
            font-size: 13px;
            margin-bottom: 12px;
          }
        }

        @media (max-width: 640px) {
          .wave-frequency {
            font-size: 12px;
            margin-bottom: 10px;
          }
        }

        .wave-card p {
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text-secondary);
          margin: 0;
        }

        /* Responsive wave-card p */
        @media (max-width: 768px) {
          .wave-card p {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .wave-card p {
            font-size: 14px;
          }
        }

        /* Highlight Box */
        .highlight-box {
          background: linear-gradient(135deg, rgba(32, 96, 223, 0.1), rgba(32, 96, 223, 0.05));
          border-left: 4px solid var(--color-primary-blue);
          border-radius: 12px;
          padding: 28px 32px;
          margin: 32px 0;
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .highlight-box::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: linear-gradient(180deg, var(--color-primary-blue), var(--color-secondary-purple));
          animation: borderGlow 3s ease-in-out infinite;
        }

        .highlight-box:hover {
          transform: translateX(5px);
          box-shadow: 0 10px 30px rgba(32, 96, 223, 0.15);
        }

        /* Responsive highlight-box */
        @media (max-width: 1024px) {
          .highlight-box {
            padding: 24px 28px;
            margin: 28px 0;
          }
        }

        @media (max-width: 768px) {
          .highlight-box {
            padding: 20px 24px;
            margin: 24px 0;
          }
        }

        @media (max-width: 640px) {
          .highlight-box {
            padding: 16px;
            margin: 16px 0;
            border-left-width: 3px;
          }
        }

        .highlight-box h3 {
          font-size: 20px;
          font-weight: 600;
          color: var(--color-text-primary);
          margin-top: 0;
          margin-bottom: 16px;
        }

        /* Responsive highlight-box h3 */
        @media (max-width: 768px) {
          .highlight-box h3 {
            font-size: 18px;
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .highlight-box h3 {
            font-size: 16px;
            margin-bottom: 12px;
          }
        }

        .highlight-box p {
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text-secondary);
          margin-bottom: 12px;
        }

        /* Responsive highlight-box p */
        @media (max-width: 768px) {
          .highlight-box p {
            font-size: 15px;
            margin-bottom: 10px;
          }
        }

        @media (max-width: 640px) {
          .highlight-box p {
            font-size: 14px;
            margin-bottom: 8px;
          }
        }

        .highlight-box ul {
          margin: 16px 0;
          padding-left: 24px;
        }

        /* Responsive highlight-box ul */
        @media (max-width: 640px) {
          .highlight-box ul {
            margin: 12px 0;
            padding-left: 16px;
          }
        }

        .highlight-box li {
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text-secondary);
          margin-bottom: 10px;
        }

        /* Responsive highlight-box li */
        @media (max-width: 768px) {
          .highlight-box li {
            font-size: 15px;
            margin-bottom: 8px;
          }
        }

        @media (max-width: 640px) {
          .highlight-box li {
            font-size: 14px;
            margin-bottom: 6px;
          }
        }

        /* Brain Lobes Grid */
        .brain-lobes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin: 32px 0;
        }

        /* Responsive brain-lobes-grid */
        @media (max-width: 1024px) {
          .brain-lobes-grid {
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 20px;
            margin: 28px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-lobes-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin: 24px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-lobes-grid {
            grid-template-columns: 1fr;
            gap: 16px;
            margin: 16px 0;
          }
        }

        /* Smooth Scroll */
        html {
          scroll-behavior: smooth;
        }

        /* Selection */
        ::selection {
          background: var(--color-primary-blue);
          color: white;
        }

        /* Expandable Wave Cards */
        .expandable-wave-card {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          border-radius: 20px;
          margin: 16px 0;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
        }

        .expandable-wave-card::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        }

        /* Responsive expandable-wave-card */
        @media (max-width: 768px) {
          .expandable-wave-card {
            border-radius: 16px;
            margin: 12px 0;
          }
        }

        @media (max-width: 640px) {
          .expandable-wave-card {
            border-radius: 12px;
            margin: 10px 0;
          }
        }

        .expandable-wave-card:hover {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
          border-color: rgba(116, 32, 223, 0.3);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 20px rgba(116, 32, 223, 0.1);
          transform: translateY(-2px);
        }

        .wave-card-header {
          padding: 28px 32px;
          display: flex;
          align-items: flex-start;
          gap: 24px;
          position: relative;
        }

        /* Responsive wave-card-header */
        @media (max-width: 1024px) {
          .wave-card-header {
            padding: 24px 28px;
            gap: 20px;
          }
        }

        @media (max-width: 768px) {
          .wave-card-header {
            flex-direction: column;
            padding: 20px 24px;
            gap: 16px;
          }
        }

        @media (max-width: 640px) {
          .wave-card-header {
            padding: 16px;
            gap: 12px;
          }
        }

        .wave-info {
          flex: 1;
        }

        .wave-title-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 8px;
        }

        /* Responsive wave-title-row */
        @media (max-width: 768px) {
          .wave-title-row {
            gap: 12px;
            flex-wrap: wrap;
          }
        }

        @media (max-width: 640px) {
          .wave-title-row {
            gap: 8px;
          }
        }

        .wave-name {
          font-size: 28px;
          font-weight: 700;
          margin: 0;
          transition: all 0.4s ease;
          display: inline-block;
        }

        .expandable-wave-card:hover .wave-name {
          animation: rubberBand 0.6s ease;
        }

        /* Responsive wave-name */
        @media (max-width: 1024px) {
          .wave-name {
            font-size: 24px;
          }
        }

        @media (max-width: 768px) {
          .wave-name {
            font-size: 22px;
          }
        }

        @media (max-width: 640px) {
          .wave-name {
            font-size: 20px;
          }
        }

        .wave-freq {
          font-size: 16px;
          color: var(--color-text-secondary);
          font-weight: 500;
        }

        /* Responsive wave-freq */
        @media (max-width: 768px) {
          .wave-freq {
            font-size: 14px;
          }
        }

        @media (max-width: 640px) {
          .wave-freq {
            font-size: 13px;
          }
        }

        .wave-short-desc {
          font-size: 16px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 12px 0 0 0;
        }

        /* Responsive wave-short-desc */
        @media (max-width: 768px) {
          .wave-short-desc {
            font-size: 15px;
            margin: 10px 0 0 0;
          }
        }

        @media (max-width: 640px) {
          .wave-short-desc {
            font-size: 14px;
            margin: 8px 0 0 0;
          }
        }

        .wave-visual {
          width: 500px;
          height: 80px;
          border-radius: 12px;
          overflow: hidden;
          flex-shrink: 0;
          position: relative;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wave-visual::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.03), transparent);
          animation: shimmer 3s infinite;
          background-size: 200% 100%;
        }

        /* Responsive wave-visual */
        @media (max-width: 1024px) {
          .wave-visual {
            width: 350px;
            height: 70px;
          }
        }

        @media (max-width: 768px) {
          .wave-visual {
            width: 100%;
            height: 60px;
            border-radius: 10px;
          }
        }

        @media (max-width: 640px) {
          .wave-visual {
            height: 50px;
            border-radius: 8px;
          }
        }

        .wave-visual img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          animation: waveMove 4s ease-in-out infinite;
        }

        .expand-icon {
          position: absolute;
          top: 32px;
          right: 32px;
          width: 24px;
          height: 24px;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          filter: drop-shadow(0 0 3px rgba(116, 32, 223, 0.3));
        }

        .expandable-wave-card:hover .expand-icon {
          animation: bounce 0.6s ease;
          filter: drop-shadow(0 0 8px rgba(116, 32, 223, 0.6));
        }

        /* Responsive expand-icon */
        @media (max-width: 1024px) {
          .expand-icon {
            top: 28px;
            right: 28px;
          }
        }

        @media (max-width: 768px) {
          .expand-icon {
            top: 24px;
            right: 24px;
            width: 20px;
            height: 20px;
          }
        }

        @media (max-width: 640px) {
          .expand-icon {
            top: 16px;
            right: 16px;
            width: 18px;
            height: 18px;
          }
        }

        .expand-icon.rotated {
          transform: rotate(270deg);
          filter: drop-shadow(0 0 10px rgba(32, 96, 223, 0.8));
        }

        .wave-expanded-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), padding 0.4s ease;
          padding: 0 32px;
        }

        /* Responsive wave-expanded-content */
        @media (max-width: 1024px) {
          .wave-expanded-content {
            padding: 0 28px;
          }
        }

        @media (max-width: 768px) {
          .wave-expanded-content {
            padding: 0 24px;
          }
        }

        @media (max-width: 640px) {
          .wave-expanded-content {
            padding: 0 16px;
          }
        }

        .wave-expanded-content.open {
          max-height: 600px;
          padding: 0 32px 32px 32px;
        }

        /* Responsive wave-expanded-content.open */
        @media (max-width: 1024px) {
          .wave-expanded-content.open {
            padding: 0 28px 28px 28px;
          }
        }

        @media (max-width: 768px) {
          .wave-expanded-content.open {
            padding: 0 24px 24px 24px;
          }
        }

        @media (max-width: 640px) {
          .wave-expanded-content.open {
            max-height: 800px;
            padding: 0 16px 16px 16px;
          }
        }

        .wave-expanded-text {
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text-secondary);
          margin-bottom: 16px;
        }

        /* Responsive wave-expanded-text */
        @media (max-width: 768px) {
          .wave-expanded-text {
            font-size: 15px;
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .wave-expanded-text {
            font-size: 14px;
            margin-bottom: 12px;
          }
        }

        /* Powered by Electricity Section */
        .powered-section {
          margin: 48px 0;
        }

        /* Responsive powered-section */
        @media (max-width: 1024px) {
          .powered-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 768px) {
          .powered-section {
            margin: 32px 0;
          }
        }

        @media (max-width: 640px) {
          .powered-section {
            margin: 24px 0;
          }
        }

        .powered-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          background: linear-gradient(80deg, rgb(69, 115, 102) 54%, rgb(138, 189, 177) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Responsive powered-title */
        @media (max-width: 1024px) {
          .powered-title {
            font-size: 40px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .powered-title {
            font-size: 32px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .powered-title {
            font-size: 26px;
            margin: 0 0 20px 0;
          }
        }

        .powered-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-bottom: 32px;
        }

        /* Responsive powered-description */
        @media (max-width: 1024px) {
          .powered-description {
            font-size: 16px;
            margin-bottom: 28px;
          }
        }

        @media (max-width: 768px) {
          .powered-description {
            font-size: 15px;
            margin-bottom: 24px;
          }
        }

        @media (max-width: 640px) {
          .powered-description {
            font-size: 14px;
            margin-bottom: 20px;
          }
        }

        .eeg-images-grid {
          display: flex;
          gap: 16px;
          margin: 32px 0;
          align-items: center;
        }

        /* Responsive eeg-images-grid */
        @media (max-width: 1024px) {
          .eeg-images-grid {
            gap: 14px;
            margin: 28px 0;
          }
        }

        @media (max-width: 768px) {
          .eeg-images-grid {
            flex-wrap: wrap;
            justify-content: center;
            gap: 12px;
            margin: 24px 0;
          }
        }

        @media (max-width: 640px) {
          .eeg-images-grid {
            flex-direction: column;
            gap: 12px;
            margin: 16px 0;
          }
        }

        .eeg-image {
          width: 200px;
          height: 200px;
          border-radius: 12px;
          overflow: hidden;
          flex-shrink: 0;
        }

        /* Responsive eeg-image */
        @media (max-width: 1024px) {
          .eeg-image {
            width: 180px;
            height: 180px;
          }
        }

        @media (max-width: 768px) {
          .eeg-image {
            width: calc(50% - 6px);
            height: 160px;
            flex-shrink: 1;
          }
        }

        @media (max-width: 640px) {
          .eeg-image {
            width: 100%;
            height: 180px;
          }
        }

        .eeg-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: left center;
        }

        .eeg-caption {
          font-size: 14px;
          line-height: 1.6;
          color: var(--color-text-secondary);
          text-align: center;
          margin: 16px 0 24px 0;
        }

        /* Responsive eeg-caption */
        @media (max-width: 768px) {
          .eeg-caption {
            font-size: 13px;
            margin: 14px 0 20px 0;
          }
        }

        @media (max-width: 640px) {
          .eeg-caption {
            font-size: 12px;
            margin: 12px 0 16px 0;
          }
        }

        .powered-text-bottom {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-bottom: 16px;
        }

        /* Responsive powered-text-bottom */
        @media (max-width: 768px) {
          .powered-text-bottom {
            font-size: 15px;
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .powered-text-bottom {
            font-size: 14px;
            margin-bottom: 12px;
          }
        }

        .powered-text-bottom .highlight-text {
          color: rgb(69, 115, 102);
          font-weight: 500;
        }

        /* Brainwaves Intro Section */
        .brainwaves-intro {
          margin: 48px 0 40px 0;
        }

        /* Responsive brainwaves-intro */
        @media (max-width: 1024px) {
          .brainwaves-intro {
            margin: 40px 0 36px 0;
          }
        }

        @media (max-width: 768px) {
          .brainwaves-intro {
            margin: 32px 0 28px 0;
          }
        }

        @media (max-width: 640px) {
          .brainwaves-intro {
            margin: 24px 0 20px 0;
          }
        }

        .intro-title-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }

        /* Responsive intro-title-wrapper */
        @media (max-width: 1024px) {
          .intro-title-wrapper {
            gap: 20px;
            margin-bottom: 28px;
          }
        }

        @media (max-width: 768px) {
          .intro-title-wrapper {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 24px;
          }
        }

        @media (max-width: 640px) {
          .intro-title-wrapper {
            gap: 8px;
            margin-bottom: 20px;
          }
        }

        .intro-title-left {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--color-text-primary);
          margin: 0;
        }

        /* Responsive intro-title-left */
        @media (max-width: 1024px) {
          .intro-title-left {
            font-size: 40px;
          }
        }

        @media (max-width: 768px) {
          .intro-title-left {
            font-size: 32px;
          }
        }

        @media (max-width: 640px) {
          .intro-title-left {
            font-size: 26px;
          }
        }

        .intro-title-left span {
          display: inline-block;
        }

        .intro-title-right {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0;
          background: linear-gradient(80deg, rgb(69, 115, 102) 2%, rgb(118, 179, 160) 79%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Responsive intro-title-right */
        @media (max-width: 1024px) {
          .intro-title-right {
            font-size: 40px;
          }
        }

        @media (max-width: 768px) {
          .intro-title-right {
            font-size: 32px;
            text-align: left;
          }
        }

        @media (max-width: 640px) {
          .intro-title-right {
            font-size: 26px;
          }
        }

        .intro-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-bottom: 16px;
        }

        /* Responsive intro-description */
        @media (max-width: 1024px) {
          .intro-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .intro-description {
            font-size: 15px;
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .intro-description {
            font-size: 14px;
            margin-bottom: 12px;
          }
        }

        .intro-description:last-child {
          margin-bottom: 0;
        }

        /* Brain Maps Section */
        .brain-maps-section {
          margin: 60px 0;
        }

        /* Responsive brain-maps-section */
        @media (max-width: 1024px) {
          .brain-maps-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-maps-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-section {
            margin: 32px 0;
          }
        }

        .brain-maps-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          background: linear-gradient(80deg, rgb(69, 115, 102) 61%, rgb(118, 179, 160) 104%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Responsive brain-maps-title */
        @media (max-width: 1024px) {
          .brain-maps-title {
            font-size: 40px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-maps-title {
            font-size: 32px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-title {
            font-size: 26px;
            margin: 0 0 20px 0;
          }
        }

        .brain-maps-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-bottom: 32px;
        }

        /* Responsive brain-maps-description */
        @media (max-width: 1024px) {
          .brain-maps-description {
            font-size: 16px;
            margin-bottom: 28px;
          }
        }

        @media (max-width: 768px) {
          .brain-maps-description {
            font-size: 15px;
            margin-bottom: 24px;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-description {
            font-size: 14px;
            margin-bottom: 20px;
          }
        }

        .brain-map-guide-container {
          position: relative;
          width: 466px;
          height: 394px;
          margin: 40px auto;
        }

        /* Responsive brain-map-guide-container */
        @media (max-width: 768px) {
          .brain-map-guide-container {
            width: 100%;
            max-width: 400px;
            height: auto;
            aspect-ratio: 466/394;
            margin: 32px auto;
          }
        }

        @media (max-width: 640px) {
          .brain-map-guide-container {
            max-width: 100%;
            margin: 24px auto;
          }
        }

        .brain-map-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .brain-map-layer img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
        }

        .brain-maps-interactive-title {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin: 48px 0 24px 0;
          text-align: center;
        }

        /* Responsive brain-maps-interactive-title */
        @media (max-width: 1024px) {
          .brain-maps-interactive-title {
            font-size: 16px;
            margin: 40px 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-maps-interactive-title {
            font-size: 15px;
            margin: 32px 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-interactive-title {
            font-size: 14px;
            margin: 24px 0 16px 0;
          }
        }

        .mental-states-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 32px;
        }

        /* Responsive mental-states-buttons */
        @media (max-width: 768px) {
          .mental-states-buttons {
            gap: 10px;
            margin-bottom: 24px;
          }
        }

        @media (max-width: 640px) {
          .mental-states-buttons {
            gap: 8px;
            margin-bottom: 20px;
          }
        }

        .state-button {
          padding: 12px 24px;
          border-radius: 26px;
          border: 1px solid rgb(99, 99, 99);
          background-color: transparent;
          color: rgb(99, 99, 99);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .state-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s ease;
        }

        .state-button:hover::before {
          left: 100%;
        }

        .state-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
        }

        /* Responsive state-button */
        @media (max-width: 768px) {
          .state-button {
            padding: 10px 20px;
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .state-button {
            padding: 8px 16px;
            font-size: 14px;
            border-radius: 20px;
          }
        }

        .state-button.active {
          background: linear-gradient(72deg, rgb(61, 82, 128) 0%, rgb(150, 133, 204) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          background-color: rgb(224, 243, 255);
          border-color: transparent;
          box-shadow: 0 5px 25px rgba(61, 82, 128, 0.3);
        }

        .state-button:hover {
          border-color: rgb(150, 150, 150);
        }

        .brain-maps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-bottom: 24px;
        }

        /* Responsive brain-maps-grid */
        @media (max-width: 1024px) {
          .brain-maps-grid {
            gap: 20px;
          }
        }

        @media (max-width: 768px) {
          .brain-maps-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }

        .brain-map-card {
          text-align: center;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 16px;
          border-radius: 16px;
        }

        .brain-map-card:hover {
          transform: translateY(-12px) scale(1.03) perspective(1000px) rotateX(5deg);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        }

        .brain-map-card:hover .brain-map-image {
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), 0 0 30px rgba(89, 148, 131, 0.2);
        }

        .brain-map-image {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 12px;
          margin-bottom: 16px;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Responsive brain-map-image */
        @media (max-width: 768px) {
          .brain-map-image {
            border-radius: 10px;
            margin-bottom: 12px;
          }
        }

        @media (max-width: 640px) {
          .brain-map-image {
            max-width: 280px;
            margin: 0 auto 12px auto;
          }
        }

        .brain-map-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
        }

        .brain-map-name {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        /* Responsive brain-map-name */
        @media (max-width: 768px) {
          .brain-map-name {
            font-size: 16px;
          }
        }

        @media (max-width: 640px) {
          .brain-map-name {
            font-size: 15px;
          }
        }

        .brain-map-frequency {
          font-size: 14px;
          color: var(--color-text-primary);
        }

        /* Responsive brain-map-frequency */
        @media (max-width: 640px) {
          .brain-map-frequency {
            font-size: 13px;
          }
        }

        .color-scale {
          width: 100%;
          max-width: 534px;
          margin: 0 auto 32px auto;
        }

        /* Responsive color-scale */
        @media (max-width: 768px) {
          .color-scale {
            margin: 0 auto 24px auto;
          }
        }

        @media (max-width: 640px) {
          .color-scale {
            margin: 0 auto 16px auto;
          }
        }

        .color-scale img {
          width: 100%;
          height: auto;
        }

        .brain-map-note {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 15px;
          padding: 24px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive brain-map-note */
        @media (max-width: 768px) {
          .brain-map-note {
            padding: 20px;
            border-radius: 12px;
            font-size: 13px;
          }
        }

        @media (max-width: 640px) {
          .brain-map-note {
            padding: 16px;
            border-radius: 10px;
            font-size: 12px;
          }
        }

        .gradient-text-green {
          background: linear-gradient(80deg, rgb(69, 115, 102) 61%, rgb(118, 179, 160) 104%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gradient-text-idle {
          background: linear-gradient(72deg, rgb(61, 82, 128) 0%, rgb(150, 133, 204) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .brain-map-base,
        .brain-map-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .brain-map-base img,
        .brain-map-overlay img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
        }

        .brain-map-overlay {
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .brain-map-guide-container:hover .brain-map-overlay {
          opacity: 1;
        }

        .mental-states-intro {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin: 48px 0 24px 0;
          text-align: left;
        }

        /* Responsive mental-states-intro */
        @media (max-width: 1024px) {
          .mental-states-intro {
            font-size: 16px;
            margin: 40px 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .mental-states-intro {
            font-size: 15px;
            margin: 32px 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .mental-states-intro {
            font-size: 14px;
            margin: 24px 0 16px 0;
          }
        }

        .mental-state-btn {
          padding: 12px 24px;
          border-radius: 26px;
          border: 1px solid rgb(99, 99, 99);
          background-color: transparent;
          color: rgb(99, 99, 99);
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .mental-state-btn.active {
          background-color: rgb(224, 243, 255);
          border-color: transparent;
        }

        .mental-state-btn.active span {
          background: linear-gradient(72deg, rgb(61, 82, 128) 0%, rgb(150, 133, 204) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .mental-state-btn:hover {
          border-color: rgb(150, 150, 150);
        }

        /* Responsive mental-state-btn */
        @media (max-width: 768px) {
          .mental-state-btn {
            padding: 10px 20px;
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .mental-state-btn {
            padding: 8px 16px;
            font-size: 14px;
            border-radius: 20px;
          }
        }

        .brain-map-item {
          text-align: center;
        }

        .brain-map-label {
          margin-top: 16px;
        }

        /* Responsive brain-map-label */
        @media (max-width: 768px) {
          .brain-map-label {
            margin-top: 12px;
          }
        }

        @media (max-width: 640px) {
          .brain-map-label {
            margin-top: 10px;
          }
        }

        .wave-label {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 4px 0;
        }

        /* Responsive wave-label */
        @media (max-width: 768px) {
          .wave-label {
            font-size: 16px;
          }
        }

        @media (max-width: 640px) {
          .wave-label {
            font-size: 15px;
          }
        }

        .wave-freq-label {
          font-size: 14px;
          color: var(--color-text-primary);
          margin: 0;
        }

        /* Responsive wave-freq-label */
        @media (max-width: 768px) {
          .wave-freq-label {
            font-size: 13px;
          }
        }

        @media (max-width: 640px) {
          .wave-freq-label {
            font-size: 12px;
          }
        }

        .brain-maps-info-box {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 15px;
          padding: 24px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-top: 32px;
        }

        /* Responsive brain-maps-info-box */
        @media (max-width: 768px) {
          .brain-maps-info-box {
            padding: 20px;
            border-radius: 12px;
            font-size: 13px;
            margin-top: 24px;
          }
        }

        @media (max-width: 640px) {
          .brain-maps-info-box {
            padding: 16px;
            border-radius: 10px;
            font-size: 12px;
            margin-top: 20px;
          }
        }

        .brain-maps-info-box p {
          margin: 0 0 12px 0;
        }

        /* Responsive brain-maps-info-box p */
        @media (max-width: 640px) {
          .brain-maps-info-box p {
            margin: 0 0 10px 0;
          }
        }

        .brain-maps-info-box p:last-child {
          margin-bottom: 0;
        }

        /* Female Brain Section */
        .female-brain-section {
          margin: 60px 0;
        }

        /* Responsive female-brain-section */
        @media (max-width: 1024px) {
          .female-brain-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .female-brain-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .female-brain-section {
            margin: 32px 0;
          }
        }

        .female-brain-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          color: var(--color-text-primary);
        }

        /* Responsive female-brain-title */
        @media (max-width: 1024px) {
          .female-brain-title {
            font-size: 40px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .female-brain-title {
            font-size: 32px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .female-brain-title {
            font-size: 26px;
            margin: 0 0 20px 0;
          }
        }

        .female-brain-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive female-brain-description */
        @media (max-width: 1024px) {
          .female-brain-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .female-brain-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .female-brain-description {
            font-size: 14px;
          }
        }

        .female-brain-description p {
          margin-bottom: 16px;
        }

        /* Responsive female-brain-description p */
        @media (max-width: 768px) {
          .female-brain-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .female-brain-description p {
            margin-bottom: 12px;
          }
        }

        .female-brain-description .large-text {
          font-family: 'Sofia Pro', sans-serif;
          font-size: 20px;
          letter-spacing: -0.04em;
          line-height: 1.6em;
        }

        /* Responsive large-text */
        @media (max-width: 1024px) {
          .female-brain-description .large-text {
            font-size: 18px;
          }
        }

        @media (max-width: 768px) {
          .female-brain-description .large-text {
            font-size: 17px;
          }
        }

        @media (max-width: 640px) {
          .female-brain-description .large-text {
            font-size: 15px;
          }
        }

        /* Wiring Differences Section */
        .wiring-differences-section {
          margin: 60px 0;
        }

        /* Responsive wiring-differences-section */
        @media (max-width: 1024px) {
          .wiring-differences-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .wiring-differences-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .wiring-differences-section {
            margin: 32px 0;
          }
        }

        .wiring-differences-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          color: var(--color-text-primary);
        }

        /* Responsive wiring-differences-title */
        @media (max-width: 1024px) {
          .wiring-differences-title {
            font-size: 40px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .wiring-differences-title {
            font-size: 32px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .wiring-differences-title {
            font-size: 26px;
            margin: 0 0 20px 0;
          }
        }

        .wiring-differences-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive wiring-differences-description */
        @media (max-width: 1024px) {
          .wiring-differences-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .wiring-differences-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .wiring-differences-description {
            font-size: 14px;
          }
        }

        .wiring-differences-description p {
          margin-bottom: 16px;
        }

        /* Responsive wiring-differences-description p */
        @media (max-width: 768px) {
          .wiring-differences-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .wiring-differences-description p {
            margin-bottom: 12px;
          }
        }

        .wiring-differences-description ul {
          list-style: none;
          padding-left: 0;
        }

        .wiring-differences-description li {
          margin-bottom: 20px;
          padding-left: 0;
        }

        /* Responsive wiring-differences-description li */
        @media (max-width: 768px) {
          .wiring-differences-description li {
            margin-bottom: 16px;
          }
        }

        @media (max-width: 640px) {
          .wiring-differences-description li {
            margin-bottom: 14px;
          }
        }

        .wiring-differences-description li p {
          margin-bottom: 8px;
        }

        .wiring-differences-description strong {
          font-weight: 600;
          color: var(--color-text-primary);
        }

        /* Alpha Peak Section */
        .alpha-peak-section {
          margin: 80px 0;
          padding: 60px 0;
          background-color: rgba(20, 20, 20, 0.5);
        }

        /* Responsive alpha-peak-section */
        @media (max-width: 1024px) {
          .alpha-peak-section {
            margin: 60px 0;
            padding: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-section {
            margin: 48px 0;
            padding: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-section {
            margin: 32px 0;
            padding: 32px 0;
          }
        }

        .alpha-peak-main-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 48px 0;
          color: rgb(148, 224, 200);
          text-align: center;
        }

        /* Responsive alpha-peak-main-title */
        @media (max-width: 1024px) {
          .alpha-peak-main-title {
            font-size: 40px;
            margin: 0 0 40px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-main-title {
            font-size: 32px;
            margin: 0 0 32px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-main-title {
            font-size: 26px;
            margin: 0 0 24px 0;
          }
        }

        .alpha-peak-intro {
          max-width: 800px;
          margin: 0 auto 60px auto;
        }

        /* Responsive alpha-peak-intro */
        @media (max-width: 1024px) {
          .alpha-peak-intro {
            margin: 0 auto 50px auto;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-intro {
            margin: 0 auto 40px auto;
            padding: 0 16px;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-intro {
            margin: 0 auto 32px auto;
          }
        }

        .alpha-peak-subtitle {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 24px 0;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-peak-subtitle */
        @media (max-width: 1024px) {
          .alpha-peak-subtitle {
            font-size: 32px;
            margin: 0 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-subtitle {
            font-size: 28px;
            margin: 0 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-subtitle {
            font-size: 22px;
            margin: 0 0 16px 0;
          }
        }

        .alpha-peak-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-peak-description */
        @media (max-width: 1024px) {
          .alpha-peak-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-description {
            font-size: 14px;
          }
        }

        .alpha-peak-description p {
          margin-bottom: 16px;
        }

        /* Responsive alpha-peak-description p */
        @media (max-width: 768px) {
          .alpha-peak-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-description p {
            margin-bottom: 12px;
          }
        }

        .alpha-peak-visual-section {
          display: grid;
          grid-template-columns: 1fr 2fr 1fr;
          gap: 40px;
          align-items: start;
          margin-top: 60px;
        }

        /* Responsive alpha-peak-visual-section */
        @media (max-width: 1024px) {
          .alpha-peak-visual-section {
            gap: 24px;
            margin-top: 48px;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-visual-section {
            grid-template-columns: 1fr;
            gap: 32px;
            margin-top: 32px;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-visual-section {
            gap: 24px;
            margin-top: 24px;
          }
        }

        .alpha-peak-left-descriptions,
        .alpha-peak-right-descriptions {
          display: flex;
          flex-direction: column;
          gap: 100px;
          padding-top: 80px;
        }

        /* Responsive alpha-peak descriptions */
        @media (max-width: 1024px) {
          .alpha-peak-left-descriptions,
          .alpha-peak-right-descriptions {
            gap: 60px;
            padding-top: 40px;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-left-descriptions,
          .alpha-peak-right-descriptions {
            gap: 24px;
            padding-top: 0;
            padding: 0 16px;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-left-descriptions,
          .alpha-peak-right-descriptions {
            gap: 16px;
          }
        }

        .alpha-description-item {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-description-item */
        @media (max-width: 1024px) {
          .alpha-description-item {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .alpha-description-item {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .alpha-description-item {
            font-size: 14px;
          }
        }

        .alpha-description-item p {
          margin: 0;
        }

        .highlight-green {
          color: rgb(99, 201, 172);
          font-weight: 600;
        }

        .alpha-peak-graph-container {
          text-align: center;
        }

        .graph-label {
          font-size: 14px;
          color: rgb(155, 161, 165);
          text-align: center;
          margin-bottom: 20px;
        }

        /* Responsive graph-label */
        @media (max-width: 768px) {
          .graph-label {
            font-size: 13px;
            margin-bottom: 16px;
          }
        }

        @media (max-width: 640px) {
          .graph-label {
            font-size: 12px;
            margin-bottom: 12px;
          }
        }

        .graph-image-stack {
          position: relative;
          width: 100%;
          aspect-ratio: 1235/971;
          margin: 0 auto;
        }

        .graph-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .graph-base {
          z-index: 1;
        }

        .graph-axes {
          z-index: 2;
        }

        .graph-ranges {
          z-index: 3;
        }

        .graph-alpha-range {
          z-index: 4;
        }

        .graph-alpha-point {
          z-index: 5;
        }

        /* Alpha Peak Trends Section */
        .alpha-peak-trends-section {
          margin: 60px 0;
        }

        /* Responsive alpha-peak-trends-section */
        @media (max-width: 1024px) {
          .alpha-peak-trends-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-trends-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-trends-section {
            margin: 32px 0;
          }
        }

        .alpha-trends-title {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-trends-title */
        @media (max-width: 1024px) {
          .alpha-trends-title {
            font-size: 32px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-trends-title {
            font-size: 28px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-trends-title {
            font-size: 22px;
            margin: 0 0 20px 0;
          }
        }

        .alpha-trends-graph {
          margin: 40px 0;
        }

        /* Responsive alpha-trends-graph */
        @media (max-width: 768px) {
          .alpha-trends-graph {
            margin: 32px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-trends-graph {
            margin: 24px 0;
          }
        }

        .alpha-trends-graph img {
          width: 100%;
          max-width: 800px;
          height: auto;
          display: block;
          margin: 0 auto;
        }

        .graph-caption {
          font-size: 14px;
          color: rgb(155, 161, 165);
          text-align: center;
          margin-top: 16px;
        }

        /* Responsive graph-caption */
        @media (max-width: 768px) {
          .graph-caption {
            font-size: 13px;
            margin-top: 14px;
          }
        }

        @media (max-width: 640px) {
          .graph-caption {
            font-size: 12px;
            margin-top: 12px;
          }
        }

        .alpha-trends-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-trends-description */
        @media (max-width: 1024px) {
          .alpha-trends-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .alpha-trends-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .alpha-trends-description {
            font-size: 14px;
          }
        }

        .alpha-trends-description p {
          margin-bottom: 16px;
        }

        /* Responsive alpha-trends-description p */
        @media (max-width: 768px) {
          .alpha-trends-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .alpha-trends-description p {
            margin-bottom: 12px;
          }
        }

        /* Alpha Peak Variations Section */
        .alpha-peak-variations-section {
          margin: 60px 0;
        }

        /* Responsive alpha-peak-variations-section */
        @media (max-width: 1024px) {
          .alpha-peak-variations-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-peak-variations-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-peak-variations-section {
            margin: 32px 0;
          }
        }

        .alpha-variations-title {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-variations-title */
        @media (max-width: 1024px) {
          .alpha-variations-title {
            font-size: 32px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .alpha-variations-title {
            font-size: 28px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .alpha-variations-title {
            font-size: 22px;
            margin: 0 0 20px 0;
          }
        }

        .alpha-variations-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive alpha-variations-description */
        @media (max-width: 1024px) {
          .alpha-variations-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .alpha-variations-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .alpha-variations-description {
            font-size: 14px;
          }
        }

        .alpha-variations-description p {
          margin-bottom: 16px;
        }

        /* Responsive alpha-variations-description p */
        @media (max-width: 768px) {
          .alpha-variations-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .alpha-variations-description p {
            margin-bottom: 12px;
          }
        }

        /* Aging Insights Section */
        .aging-insights-section {
          margin: 40px 0 0 0;
          padding: 40px 0 20px 0;
          background-color: rgba(245, 240, 230, 0.05);
        }

        /* Responsive aging-insights-section */
        @media (max-width: 1024px) {
          .aging-insights-section {
            margin: 32px 0 0 0;
            padding: 32px 0 16px 0;
          }
        }

        @media (max-width: 768px) {
          .aging-insights-section {
            margin: 24px 0 0 0;
            padding: 24px 0 12px 0;
          }
        }

        @media (max-width: 640px) {
          .aging-insights-section {
            margin: 16px 0 0 0;
            padding: 20px 0 10px 0;
          }
        }

        .aging-insights-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 24px 0;
          background: linear-gradient(135deg, rgb(69, 115, 102) 0%, rgb(89, 168, 141) 50%, rgb(69, 115, 102) 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-align: left;
          animation: textGradient 6s ease infinite;
        }

        /* Responsive aging-insights-title */
        @media (max-width: 1024px) {
          .aging-insights-title {
            font-size: 40px;
            margin: 0 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .aging-insights-title {
            font-size: 32px;
            margin: 0 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .aging-insights-title {
            font-size: 26px;
            margin: 0 0 16px 0;
          }
        }

        .aging-intro-text {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin-bottom: 24px;
        }

        /* Responsive aging-intro-text */
        @media (max-width: 1024px) {
          .aging-intro-text {
            font-size: 16px;
            margin-bottom: 20px;
          }
        }

        @media (max-width: 768px) {
          .aging-intro-text {
            font-size: 15px;
            margin-bottom: 18px;
          }
        }

        @media (max-width: 640px) {
          .aging-intro-text {
            font-size: 14px;
            margin-bottom: 16px;
          }
        }

        .aging-intro-text p {
          margin: 0;
        }

        .aging-graphs-container {
          margin: 30px 0;
        }

        /* Responsive aging-graphs-container */
        @media (max-width: 768px) {
          .aging-graphs-container {
            margin: 24px 0;
          }
        }

        @media (max-width: 640px) {
          .aging-graphs-container {
            margin: 20px 0;
          }
        }

        .aging-graphs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 16px;
        }

        /* Responsive aging-graphs-grid */
        @media (max-width: 1024px) {
          .aging-graphs-grid {
            gap: 20px;
          }
        }

        @media (max-width: 768px) {
          .aging-graphs-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }

        @media (max-width: 640px) {
          .aging-graphs-grid {
            gap: 20px;
          }
        }

        .aging-graph-left,
        .aging-graph-right {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Responsive aging-graph columns */
        @media (max-width: 768px) {
          .aging-graph-left,
          .aging-graph-right {
            gap: 20px;
          }
        }

        @media (max-width: 640px) {
          .aging-graph-left,
          .aging-graph-right {
            gap: 16px;
          }
        }

        .aging-graph-item {
          text-align: center;
        }

        .graph-wave-label {
          font-size: 18px;
          font-weight: 600;
          color: var(--color-text-primary);
          margin: 0 0 16px 0;
          text-align: center;
        }

        /* Responsive graph-wave-label */
        @media (max-width: 768px) {
          .graph-wave-label {
            font-size: 16px;
            margin: 0 0 12px 0;
          }
        }

        @media (max-width: 640px) {
          .graph-wave-label {
            font-size: 15px;
            margin: 0 0 10px 0;
          }
        }

        .graph-image-wrapper {
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .graph-image-wrapper::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(32, 96, 223, 0.1), transparent, rgba(116, 32, 223, 0.1));
          opacity: 0;
          transition: opacity 0.4s ease;
          z-index: 1;
          pointer-events: none;
        }

        .graph-image-wrapper:hover {
          transform: scale(1.02);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3), 0 0 20px rgba(32, 96, 223, 0.2);
          border-color: rgba(116, 32, 223, 0.3);
        }

        .graph-image-wrapper:hover::before {
          opacity: 1;
        }

        /* Responsive graph-image-wrapper */
        @media (max-width: 768px) {
          .graph-image-wrapper {
            border-radius: 10px;
          }
        }

        @media (max-width: 640px) {
          .graph-image-wrapper {
            border-radius: 8px;
          }
        }

        .graph-image-wrapper img {
          width: 100%;
          height: auto;
          display: block;
          transition: all 0.4s ease;
        }

        .graph-image-wrapper:hover img {
          animation: electricPulse 2s ease infinite;
        }

        .aging-caption {
          color: var(--color-text-secondary);
        }

        .aging-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin: 16px 0 0 0;
        }

        /* Responsive aging-description */
        @media (max-width: 1024px) {
          .aging-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .aging-description {
            font-size: 15px;
            margin: 14px 0 0 0;
          }
        }

        @media (max-width: 640px) {
          .aging-description {
            font-size: 14px;
            margin: 12px 0 0 0;
          }
        }

        .aging-description p {
          margin-bottom: 16px;
        }

        /* Responsive aging-description p */
        @media (max-width: 768px) {
          .aging-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .aging-description p {
            margin-bottom: 12px;
          }
        }

        .aging-compensation-section {
          margin-top: 20px;
        }

        /* Responsive aging-compensation-section */
        @media (max-width: 768px) {
          .aging-compensation-section {
            margin-top: 16px;
          }
        }

        @media (max-width: 640px) {
          .aging-compensation-section {
            margin-top: 12px;
          }
        }

        .aging-compensation-title {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 24px 0;
          color: var(--color-text-primary);
        }

        /* Responsive aging-compensation-title */
        @media (max-width: 1024px) {
          .aging-compensation-title {
            font-size: 32px;
            margin: 0 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .aging-compensation-title {
            font-size: 28px;
            margin: 0 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .aging-compensation-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }
        }

        .aging-compensation-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive aging-compensation-description */
        @media (max-width: 1024px) {
          .aging-compensation-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .aging-compensation-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .aging-compensation-description {
            font-size: 14px;
          }
        }

        .aging-compensation-description p {
          margin-bottom: 12px;
        }

        /* Responsive aging-compensation-description p */
        @media (max-width: 768px) {
          .aging-compensation-description p {
            margin-bottom: 10px;
          }
        }

        @media (max-width: 640px) {
          .aging-compensation-description p {
            margin-bottom: 8px;
          }
        }

        .aging-compensation-description p:last-child {
          margin-bottom: 0;
        }

        /* Final Remarks Section */
        .final-remarks-section {
          margin: 60px 0;
          padding: 60px 0;
        }

        /* Responsive final-remarks-section */
        @media (max-width: 1024px) {
          .final-remarks-section {
            margin: 50px 0;
            padding: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .final-remarks-section {
            margin: 40px 0;
            padding: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .final-remarks-section {
            margin: 32px 0;
            padding: 32px 0;
          }
        }

        .final-remarks-content {
          margin-bottom: 60px;
        }

        /* Responsive final-remarks-content */
        @media (max-width: 768px) {
          .final-remarks-content {
            margin-bottom: 48px;
          }
        }

        @media (max-width: 640px) {
          .final-remarks-content {
            margin-bottom: 36px;
          }
        }

        .final-remarks-title {
          font-size: 36px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 24px 0;
          background: linear-gradient(135deg, rgb(61, 166, 136) 0%, rgb(89, 200, 170) 50%, rgb(61, 166, 136) 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: textGradient 5s ease infinite;
        }

        /* Responsive final-remarks-title */
        @media (max-width: 1024px) {
          .final-remarks-title {
            font-size: 32px;
            margin: 0 0 20px 0;
          }
        }

        @media (max-width: 768px) {
          .final-remarks-title {
            font-size: 28px;
            margin: 0 0 18px 0;
          }
        }

        @media (max-width: 640px) {
          .final-remarks-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }
        }

        .final-remarks-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive final-remarks-description */
        @media (max-width: 1024px) {
          .final-remarks-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .final-remarks-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .final-remarks-description {
            font-size: 14px;
          }
        }

        .final-remarks-description p {
          margin-bottom: 16px;
        }

        /* Responsive final-remarks-description p */
        @media (max-width: 768px) {
          .final-remarks-description p {
            margin-bottom: 14px;
          }
        }

        @media (max-width: 640px) {
          .final-remarks-description p {
            margin-bottom: 12px;
          }
        }

        .final-remarks-description p:last-child {
          margin-bottom: 0;
        }

        .call-researchers-section {
          margin-top: 48px;
        }

        /* Responsive call-researchers-section */
        @media (max-width: 768px) {
          .call-researchers-section {
            margin-top: 40px;
          }
        }

        @media (max-width: 640px) {
          .call-researchers-section {
            margin-top: 32px;
          }
        }

        .call-researchers-title {
          font-size: 28px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 20px 0;
          color: var(--color-text-primary);
        }

        /* Responsive call-researchers-title */
        @media (max-width: 1024px) {
          .call-researchers-title {
            font-size: 26px;
            margin: 0 0 18px 0;
          }
        }

        @media (max-width: 768px) {
          .call-researchers-title {
            font-size: 24px;
            margin: 0 0 16px 0;
          }
        }

        @media (max-width: 640px) {
          .call-researchers-title {
            font-size: 20px;
            margin: 0 0 14px 0;
          }
        }

        .call-researchers-description {
          font-size: 17px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive call-researchers-description */
        @media (max-width: 1024px) {
          .call-researchers-description {
            font-size: 16px;
          }
        }

        @media (max-width: 768px) {
          .call-researchers-description {
            font-size: 15px;
          }
        }

        @media (max-width: 640px) {
          .call-researchers-description {
            font-size: 14px;
          }
        }

        .call-researchers-description p {
          margin-bottom: 12px;
        }

        /* Responsive call-researchers-description p */
        @media (max-width: 640px) {
          .call-researchers-description p {
            margin-bottom: 10px;
          }
        }

        .call-researchers-description a {
          color: rgb(61, 166, 136);
          text-decoration: none;
          font-weight: 500;
        }

        .call-researchers-description a:hover {
          text-decoration: underline;
        }

        /* References Section */
        .references-section {
          margin: 60px 0;
          padding: 40px 0;
        }

        /* Responsive references-section */
        @media (max-width: 1024px) {
          .references-section {
            margin: 50px 0;
            padding: 32px 0;
          }
        }

        @media (max-width: 768px) {
          .references-section {
            margin: 40px 0;
            padding: 28px 0;
          }
        }

        @media (max-width: 640px) {
          .references-section {
            margin: 32px 0;
            padding: 24px 0;
          }
        }

        .references-title {
          font-size: 28px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0 0 32px 0;
          color: var(--color-text-primary);
        }

        /* Responsive references-title */
        @media (max-width: 1024px) {
          .references-title {
            font-size: 26px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .references-title {
            font-size: 24px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .references-title {
            font-size: 20px;
            margin: 0 0 20px 0;
          }
        }

        .references-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Responsive references-list */
        @media (max-width: 768px) {
          .references-list {
            gap: 20px;
          }
        }

        @media (max-width: 640px) {
          .references-list {
            gap: 16px;
          }
        }

        .reference-item {
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-text-primary);
        }

        /* Responsive reference-item */
        @media (max-width: 768px) {
          .reference-item {
            font-size: 13px;
          }
        }

        @media (max-width: 640px) {
          .reference-item {
            font-size: 12px;
          }
        }

        .reference-item p {
          margin: 0 0 4px 0;
        }

        .reference-item a {
          color: rgb(61, 166, 136);
          text-decoration: none;
          word-break: break-all;
          transition: all 0.3s ease;
          position: relative;
        }

        .reference-item a::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          width: 0;
          height: 1px;
          background: linear-gradient(90deg, rgb(61, 166, 136), rgb(32, 96, 223));
          transition: width 0.3s ease;
        }

        .reference-item a:hover {
          color: rgb(89, 200, 170);
          text-shadow: 0 0 10px rgba(61, 166, 136, 0.5);
        }

        .reference-item a:hover::after {
          width: 100%;
        }

        /* Hero Section */
        .hero-section {
          text-align: center;
          padding: 80px 0 60px 0;
          max-width: 900px;
          margin: 0 auto;
          position: relative;
        }

        /* Responsive hero-section */
        @media (max-width: 1024px) {
          .hero-section {
            padding: 70px 16px 50px 16px;
          }
        }

        @media (max-width: 768px) {
          .hero-section {
            padding: 60px 16px 40px 16px;
          }
        }

        @media (max-width: 640px) {
          .hero-section {
            padding: 48px 12px 32px 12px;
          }
        }

        .hero-main-title {
          font-size: 72px;
          font-weight: 700;
          line-height: 1.1;
          color: rgb(247, 246, 242);
          margin: 0 0 32px 0;
          position: relative;
          z-index: 1;
          animation: fadeInUp 0.8s ease-out;
          letter-spacing: -0.02em;
        }

        /* Responsive hero-main-title */
        @media (max-width: 1024px) {
          .hero-main-title {
            font-size: 56px;
            margin: 0 0 28px 0;
          }
        }

        @media (max-width: 768px) {
          .hero-main-title {
            font-size: 42px;
            margin: 0 0 24px 0;
          }
        }

        @media (max-width: 640px) {
          .hero-main-title {
            font-size: 32px;
            margin: 0 0 20px 0;
          }
        }

        .hero-subtitle-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
          position: relative;
          z-index: 1;
          animation: fadeInUp 0.8s ease-out 0.3s both;
        }

        /* Responsive hero-subtitle-wrapper */
        @media (max-width: 768px) {
          .hero-subtitle-wrapper {
            gap: 8px;
            margin-bottom: 20px;
          }
        }

        @media (max-width: 640px) {
          .hero-subtitle-wrapper {
            gap: 6px;
            margin-bottom: 16px;
            flex-direction: column;
          }
        }

        .hero-subtitle-text {
          font-size: 24px;
          font-weight: 500;
          color: rgb(217, 215, 208);
          margin: 0;
        }

        /* Responsive hero-subtitle-text */
        @media (max-width: 1024px) {
          .hero-subtitle-text {
            font-size: 20px;
          }
        }

        @media (max-width: 768px) {
          .hero-subtitle-text {
            font-size: 18px;
          }
        }

        @media (max-width: 640px) {
          .hero-subtitle-text {
            font-size: 16px;
          }
        }

        .hero-number {
          font-size: 60px;
          font-weight: 600;
          line-height: 0.8;
          letter-spacing: -0.04em;
          background: linear-gradient(80deg, rgb(66, 189, 168) 0%, rgb(253, 222, 94) 23.8145%, rgb(245, 126, 71) 42.8957%, rgb(252, 53, 93) 63.5987%, rgb(130, 86, 152) 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0;
          display: inline-block;
          animation: textGradient 4s ease infinite, fadeInUp 0.8s ease-out 0.2s both;
          position: relative;
        }

        .hero-number::after {
          content: '';
          position: absolute;
          bottom: -5px;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(80deg, rgb(66, 189, 168) 0%, rgb(253, 222, 94) 23.8145%, rgb(245, 126, 71) 42.8957%, rgb(252, 53, 93) 63.5987%, rgb(130, 86, 152) 100%);
          background-size: 200% 200%;
          border-radius: 2px;
          animation: textGradient 4s ease infinite;
        }

        /* Responsive hero-number */
        @media (max-width: 1024px) {
          .hero-number {
            font-size: 48px;
          }
        }

        @media (max-width: 768px) {
          .hero-number {
            font-size: 36px;
          }
        }

        @media (max-width: 640px) {
          .hero-number {
            font-size: 28px;
          }
        }

        .hero-published {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 32px;
        }

        /* Responsive hero-published */
        @media (max-width: 768px) {
          .hero-published {
            margin-top: 24px;
          }
        }

        @media (max-width: 640px) {
          .hero-published {
            margin-top: 20px;
            flex-direction: column;
            gap: 4px;
          }
        }

        .published-label {
          font-size: 14px;
          color: var(--color-text-secondary);
          margin: 0;
        }

        /* Responsive published-label */
        @media (max-width: 640px) {
          .published-label {
            font-size: 13px;
          }
        }

        .published-date {
          font-size: 14px;
          color: var(--color-text-primary);
          margin: 0;
        }

        /* Responsive published-date */
        @media (max-width: 640px) {
          .published-date {
            font-size: 13px;
          }
        }

        /* Brain Regions Interactive Section */
        .brain-basics-section {
          margin: 60px 0;
        }

        /* Responsive brain-basics-section */
        @media (max-width: 1024px) {
          .brain-basics-section {
            margin: 50px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-basics-section {
            margin: 40px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-basics-section {
            margin: 32px 0;
          }
        }

        .basics-title-wrapper {
          text-align: center;
          margin-bottom: 60px;
        }

        /* Responsive basics-title-wrapper */
        @media (max-width: 1024px) {
          .basics-title-wrapper {
            margin-bottom: 48px;
          }
        }

        @media (max-width: 768px) {
          .basics-title-wrapper {
            margin-bottom: 40px;
          }
        }

        @media (max-width: 640px) {
          .basics-title-wrapper {
            margin-bottom: 32px;
          }
        }

        .basics-title {
          font-size: 48px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--color-text-primary);
          margin: 0;
        }

        /* Responsive basics-title */
        @media (max-width: 1024px) {
          .basics-title {
            font-size: 40px;
          }
        }

        @media (max-width: 768px) {
          .basics-title {
            font-size: 32px;
          }
        }

        @media (max-width: 640px) {
          .basics-title {
            font-size: 26px;
          }
        }

        .basics-title .highlight-basics {
          color: rgb(89, 148, 131);
        }

        .brain-content-wrapper {
          display: flex;
          gap: 40px;
          align-items: center;
          justify-content: space-between;
        }

        /* Responsive brain-content-wrapper */
        @media (max-width: 1024px) {
          .brain-content-wrapper {
            gap: 28px;
          }
        }

        @media (max-width: 768px) {
          .brain-content-wrapper {
            flex-direction: column;
            gap: 32px;
          }
        }

        @media (max-width: 640px) {
          .brain-content-wrapper {
            gap: 24px;
          }
        }

        .brain-descriptions-left,
        .brain-descriptions-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 80px;
        }

        /* Responsive brain-descriptions */
        @media (max-width: 1024px) {
          .brain-descriptions-left,
          .brain-descriptions-right {
            gap: 60px;
          }
        }

        @media (max-width: 768px) {
          .brain-descriptions-left,
          .brain-descriptions-right {
            gap: 32px;
            width: 100%;
          }

          .brain-descriptions-left {
            order: 1;
          }

          .brain-descriptions-right {
            order: 3;
          }
        }

        @media (max-width: 640px) {
          .brain-descriptions-left,
          .brain-descriptions-right {
            gap: 24px;
          }
        }

        .brain-image-container {
          flex-shrink: 0;
          width: 400px;
          height: 400px;
          position: relative;
        }

        /* Responsive brain-image-container */
        @media (max-width: 1024px) {
          .brain-image-container {
            width: 320px;
            height: 320px;
          }
        }

        @media (max-width: 768px) {
          .brain-image-container {
            width: 100%;
            max-width: 350px;
            height: 350px;
            order: 2;
          }
        }

        @media (max-width: 640px) {
          .brain-image-container {
            max-width: 280px;
            height: 280px;
          }
        }

        .brain-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .brain-layer img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .brain-region-desc {
          opacity: 1;
          transition: opacity 0.3s ease;
        }

        .brain-region-title {
          font-size: 22px;
          font-weight: 600;
          margin: 0 0 12px 0;
          line-height: 1.3;
          transition: all 0.3s ease;
          position: relative;
        }

        .brain-region-title:hover {
          transform: translateX(5px);
          text-shadow: 0 0 10px currentColor, 0 0 20px currentColor;
        }

        /* Responsive brain-region-title */
        @media (max-width: 1024px) {
          .brain-region-title {
            font-size: 20px;
            margin: 0 0 10px 0;
          }
        }

        @media (max-width: 768px) {
          .brain-region-title {
            font-size: 18px;
            margin: 0 0 8px 0;
          }
        }

        @media (max-width: 640px) {
          .brain-region-title {
            font-size: 16px;
            margin: 0 0 6px 0;
          }
        }

        .brain-region-text {
          font-size: 16px;
          line-height: 1.7;
          color: var(--color-text-primary);
          margin: 0;
        }

        /* Responsive brain-region-text */
        @media (max-width: 1024px) {
          .brain-region-text {
            font-size: 15px;
          }
        }

        @media (max-width: 768px) {
          .brain-region-text {
            font-size: 14px;
          }
        }

        @media (max-width: 640px) {
          .brain-region-text {
            font-size: 13px;
          }
        }

        /* ===== GLOBAL MOBILE OVERFLOW PREVENTION ===== */
        .brainwaves-page {
          overflow-x: hidden;
        }

        .guide-wrapper {
          overflow-x: hidden;
        }

        /* ===== EXTRA SMALL MOBILE (375px and below) ===== */
        @media (max-width: 480px) {
          /* Tighter wrapper padding for very small screens */
          .guide-wrapper {
            padding: 64px 12px 0 12px;
          }

          /* Hero section - scale down further for 375px */
          .hero-section {
            padding: 36px 8px 24px 8px;
          }

          .hero-main-title {
            font-size: 26px;
            margin: 0 0 16px 0;
            letter-spacing: -0.01em;
          }

          .hero-subtitle-text {
            font-size: 14px;
          }

          .hero-number {
            font-size: 24px;
          }

          .hero-subtitle-wrapper {
            gap: 4px;
            margin-bottom: 12px;
          }

          .hero-published {
            margin-top: 16px;
          }

          .published-label,
          .published-date {
            font-size: 12px;
          }

          /* Basics section */
          .basics-title {
            font-size: 22px;
          }

          .basics-title-wrapper {
            margin-bottom: 24px;
          }

          /* Brain image container - smaller on tiny screens */
          .brain-image-container {
            max-width: 240px;
            height: 240px;
          }

          /* Brain region descriptions */
          .brain-region-title {
            font-size: 15px;
          }

          .brain-region-text {
            font-size: 12px;
          }

          /* Section titles - smaller for 375px */
          .section-title {
            font-size: 22px;
            margin-bottom: 14px;
          }

          .section-subtitle {
            font-size: 18px;
            margin-top: 20px;
            margin-bottom: 12px;
          }

          .section-text {
            font-size: 13px;
          }

          /* Powered section */
          .powered-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }

          .powered-description {
            font-size: 13px;
            margin-bottom: 16px;
          }

          .powered-text-bottom {
            font-size: 13px;
          }

          /* EEG images */
          .eeg-image {
            height: 150px;
          }

          .eeg-caption {
            font-size: 11px;
          }

          /* Intro titles */
          .intro-title-left,
          .intro-title-right {
            font-size: 22px;
          }

          .intro-description {
            font-size: 13px;
          }

          /* Wave cards - expandable */
          .wave-card-header {
            padding: 14px 12px;
            gap: 10px;
          }

          .wave-name {
            font-size: 18px;
          }

          .wave-freq {
            font-size: 12px;
          }

          .wave-short-desc {
            font-size: 13px;
          }

          .wave-visual {
            height: 40px;
          }

          .expand-icon {
            top: 14px;
            right: 12px;
            width: 16px;
            height: 16px;
          }

          .wave-expanded-content {
            padding: 0 12px;
          }

          .wave-expanded-content.open {
            padding: 0 12px 12px 12px;
          }

          .wave-expanded-text {
            font-size: 13px;
          }

          /* Wave card base style */
          .wave-card {
            padding: 14px;
            margin: 12px 0;
          }

          .wave-card-title {
            font-size: 15px;
          }

          .wave-card p {
            font-size: 13px;
          }

          /* Highlight box */
          .highlight-box {
            padding: 14px;
            margin: 12px 0;
          }

          .highlight-box h3 {
            font-size: 15px;
          }

          .highlight-box p {
            font-size: 13px;
          }

          .highlight-box li {
            font-size: 13px;
          }

          /* Brain maps section */
          .brain-maps-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }

          .brain-maps-description {
            font-size: 13px;
          }

          .brain-map-guide-container {
            max-width: 100%;
            margin: 20px auto;
          }

          .brain-maps-interactive-title {
            font-size: 13px;
          }

          .mental-states-intro {
            font-size: 13px;
          }

          /* Mental state buttons - smaller */
          .mental-state-btn {
            padding: 7px 14px;
            font-size: 13px;
            border-radius: 18px;
          }

          .state-button {
            padding: 7px 14px;
            font-size: 13px;
            border-radius: 18px;
          }

          /* Brain map cards */
          .brain-map-image {
            max-width: 100%;
          }

          .brain-map-name {
            font-size: 14px;
          }

          .brain-map-frequency {
            font-size: 12px;
          }

          .brain-map-note {
            padding: 14px;
            font-size: 11px;
          }

          .brain-maps-info-box {
            padding: 14px;
            font-size: 11px;
          }

          /* Female brain section */
          .female-brain-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }

          .female-brain-description {
            font-size: 13px;
          }

          .female-brain-description .large-text {
            font-size: 14px;
          }

          /* Wiring differences */
          .wiring-differences-title {
            font-size: 22px;
            margin: 0 0 16px 0;
          }

          .wiring-differences-description {
            font-size: 13px;
          }

          /* Alpha peak section */
          .alpha-peak-section {
            margin: 24px 0;
            padding: 24px 0;
          }

          .alpha-peak-main-title {
            font-size: 22px;
            margin: 0 0 20px 0;
          }

          .alpha-peak-subtitle {
            font-size: 20px;
            margin: 0 0 14px 0;
          }

          .alpha-peak-description {
            font-size: 13px;
          }

          .alpha-description-item {
            font-size: 13px;
          }

          .graph-label {
            font-size: 11px;
          }

          /* Alpha peak trends */
          .alpha-trends-title {
            font-size: 20px;
            margin: 0 0 16px 0;
          }

          .alpha-trends-description {
            font-size: 13px;
          }

          .graph-caption {
            font-size: 11px;
          }

          /* Alpha peak variations */
          .alpha-variations-title {
            font-size: 20px;
            margin: 0 0 16px 0;
          }

          .alpha-variations-description {
            font-size: 13px;
          }

          /* Aging insights */
          .aging-insights-title {
            font-size: 22px;
            margin: 0 0 14px 0;
          }

          .aging-intro-text {
            font-size: 13px;
          }

          .graph-wave-label {
            font-size: 14px;
            margin: 0 0 8px 0;
          }

          .aging-description {
            font-size: 13px;
          }

          .aging-compensation-title {
            font-size: 20px;
            margin: 0 0 14px 0;
          }

          .aging-compensation-description {
            font-size: 13px;
          }

          /* Final remarks */
          .final-remarks-section {
            margin: 24px 0;
            padding: 24px 0;
          }

          .final-remarks-title {
            font-size: 20px;
            margin: 0 0 14px 0;
          }

          .final-remarks-description {
            font-size: 13px;
          }

          .call-researchers-title {
            font-size: 18px;
            margin: 0 0 12px 0;
          }

          .call-researchers-description {
            font-size: 13px;
          }

          /* References */
          .references-title {
            font-size: 18px;
            margin: 0 0 16px 0;
          }

          .reference-item {
            font-size: 11px;
          }

          .references-list {
            gap: 14px;
          }

          /* Main content bottom padding */
          .main-content {
            padding-bottom: 36px;
          }

          .content-section {
            margin-bottom: 36px;
          }

          /* Disable hover transforms on mobile (touch devices) */
          .wave-card:hover {
            transform: none;
          }

          .expandable-wave-card:hover {
            transform: none;
          }

          .brain-map-card:hover {
            transform: none;
          }

          .graph-image-wrapper:hover {
            transform: none;
          }
        }

        /* ===== ENSURE ALL IMAGES SCALE ===== */
        @media (max-width: 768px) {
          .brainwaves-page img {
            max-width: 100%;
            height: auto;
          }
        }

        /* ===== PREVENT TEXT OVERFLOW ON SMALL SCREENS ===== */
        @media (max-width: 640px) {
          .brainwaves-page {
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* Ensure long URLs in references break properly */
          .reference-item a {
            word-break: break-all;
          }
        }
      `}</style>

      <div className="brainwaves-page">
        <NavBar />

        <div className="guide-wrapper">
          {/* Main Content */}
          <main className="main-content">
            {/* Hero Section */}
            <div className="hero-section">
              <h1 className="hero-main-title scroll-animate scroll-animate-zoom">
                Comprehensive guide to brainwaves
              </h1>
              <div className="hero-subtitle-wrapper scroll-animate scroll-delay-2">
                <h4 className="hero-subtitle-text">+ Insights from</h4>
                <h4 className="hero-subtitle-text">over</h4>
                <h1 className="hero-number">1,000,000</h1>
              </div>
              <h4 className="hero-subtitle-text scroll-animate scroll-delay-3">neurotherapy sessions</h4>
            </div>

            <section id="brain-regions" className="content-section">
              <div className="brain-basics-section">
                <div className="basics-title-wrapper scroll-animate scroll-animate-bounce">
                  <h4 className="basics-title">
                    But first, let's cover the <span className="highlight-basics">basics</span>
                  </h4>
                </div>

                <div className="brain-content-wrapper">
                  {/* Left Descriptions */}
                  <div className="brain-descriptions-left">
                    <div className="brain-region-desc scroll-animate scroll-animate-left scroll-delay-1">
                      <h5 className="brain-region-title" style={{ color: 'rgb(247, 204, 95)' }}>
                        Frontal lobe
                      </h5>
                      <p className="brain-region-text">
                        Involved in reasoning, planning, problem-solving, emotional regulation, and motor function.
                      </p>
                    </div>

                    <div className="brain-region-desc scroll-animate scroll-animate-left scroll-delay-3">
                      <h5 className="brain-region-title" style={{ color: 'rgb(250, 167, 57)' }}>
                        Cerebellum
                      </h5>
                      <p className="brain-region-text">
                        Coordinates voluntary movements, balance, and posture. It also plays a role in motor
                        learning and fine-tuning movements.
                      </p>
                    </div>
                  </div>

                  {/* Brain Image */}
                  <div className="brain-image-container scroll-animate scroll-animate-scale scroll-delay-2">
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/oY8in0Fak5L48x6pEFsP1CjcoAI.png"
                        alt="Brain base"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/umrkgsOb2Ao8DRD6IszOp8X0ww.png"
                        alt="Frontal lobe"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/4oSC9PsLrqiCoeImYDeReB5wc.png"
                        alt="Temporal lobe"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/en1jQTt670WxoNE3bGhWF6nfaVw.png"
                        alt="Occipital lobe"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/CugOMAv91LfnmQdOdNjbmkN63t4.png"
                        alt="Parietal lobe"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/mRITFcEnrxWOO7l1tLHRWQrhec.png"
                        alt="Cerebellum"
                      />
                    </div>
                    <div className="brain-layer">
                      <img
                        src="https://framerusercontent.com/images/QNZTimbgGGp5NJH8yXZNJdzz0.png"
                        alt="Brain stem"
                      />
                    </div>
                  </div>

                  {/* Right Descriptions */}
                  <div className="brain-descriptions-right">
                    <div className="brain-region-desc scroll-animate scroll-animate-right scroll-delay-1">
                      <h5 className="brain-region-title" style={{ color: 'rgb(220, 175, 217)' }}>
                        Temporal lobe
                      </h5>
                      <p className="brain-region-text">
                        Responsible for auditory processing, memory, and language comprehension.
                      </p>
                    </div>

                    <div className="brain-region-desc scroll-animate scroll-animate-right scroll-delay-2">
                      <h5 className="brain-region-title" style={{ color: 'rgb(124, 184, 177)' }}>
                        Occipital lobe
                      </h5>
                      <p className="brain-region-text">
                        Primarily responsible for visual processing.
                      </p>
                    </div>

                    <div className="brain-region-desc scroll-animate scroll-animate-right scroll-delay-3">
                      <h5 className="brain-region-title" style={{ color: 'rgb(247, 52, 104)' }}>
                        Parietal lobe
                      </h5>
                      <p className="brain-region-text">
                        Processes sensory information, spatial awareness, and body orientation.
                      </p>
                    </div>

                    <div className="brain-region-desc">
                      <h5 className="brain-region-title" style={{ color: 'rgb(255, 84, 135)' }}>
                        Brain stem
                      </h5>
                      <p className="brain-region-text">
                        Controls basic life functions such as heart rate, breathing, and blood pressure.
                        It also regulates sleep and wakefulness.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="brainwaves-explained" className="content-section">
              <h2 className="section-title scroll-animate scroll-animate-bounce">Brainwaves Explained</h2>
              <p className="section-text scroll-animate scroll-delay-1">
                Brainwaves are categorized into different frequency bands, each associated with specific
                mental states and levels of consciousness. Understanding these different types helps us
                interpret what the brain is doing at any given moment.
              </p>

              {/* Powered by Electricity Section */}
              <div className="powered-section scroll-animate scroll-animate-scale scroll-delay-2">
                <h4 className="powered-title">Powered by electricity</h4>
                <p className="powered-description">
                  One way to understand how the brain functions is by measuring its electrical activity.
                  This is done using EEG—short for electroencephalography.
                </p>

                <div className="eeg-images-grid">
                  <div className="eeg-image">
                    <img
                      src="https://framerusercontent.com/images/LaUIRy9LL4rqfsJqBJJjmwUmrsI.png"
                      alt="Traditional EEG cap"
                    />
                  </div>
                  <div className="eeg-image">
                    <img
                      src="https://framerusercontent.com/images/Jwe0WKibMWIK57zx3oklug3ssQ.jpg"
                      alt="EEG monitoring"
                    />
                  </div>
                  <div className="eeg-image">
                    <img
                      src="https://framerusercontent.com/images/s5eJpeWVN2d9xfGvhReBAa0qN80.png"
                      alt="Consumer EEG wearable"
                    />
                  </div>
                </div>

                <p className="eeg-caption">
                  Different ways to measure EEG brain activity. From the more traditional EEG caps to
                  the more consumer friendly EEG wearables.
                </p>

                <div>
                  <p className="powered-text-bottom">
                    By placing sensors on the head, we can capture neural activity in real time, down
                    to the millisecond.
                  </p>
                  <p className="powered-text-bottom">
                    Analyzing this data reveals patterns known as <span className="highlight-text">brainwaves</span>.
                  </p>
                </div>
              </div>

              {/* Intro Section with Gradient Title */}
              <div className="brainwaves-intro">
                <div className="intro-title-wrapper">
                  <h4 className="intro-title-left">
                    <span>From</span> <span>alpha</span> <span>to</span> <span>gamma:</span>
                  </h4>
                  <h4 className="intro-title-right">
                    What are brainwaves?
                  </h4>
                </div>
                <div>
                  <p className="intro-description">
                    Brainwaves are patterns of electrical activity in the brain, each occurring at different
                    frequencies: delta, theta, alpha, beta, and gamma.
                  </p>
                  <p className="intro-description">
                    Frequency refers to how fast a brainwave oscillates. For example, alpha waves cycle 8 to
                    12 times per second, or 8–12 Hz.
                  </p>
                  <p className="intro-description">
                    Research on brain activity shows that each brainwave is associated with specific cognitive
                    functions, as outlined below.
                  </p>
                </div>
              </div>

              {/* Gamma Waves */}
              <div className="expandable-wave-card scroll-animate scroll-animate-flip scroll-delay-1" onClick={() => toggleWave('gamma')}>
                <div className="wave-card-header">
                  <div className="wave-info">
                    <div className="wave-title-row">
                      <h3 className="wave-name" style={{ color: 'rgb(67, 166, 215)' }}>Gamma</h3>
                      <span className="wave-freq">30-100 Hz</span>
                    </div>
                    <p className="wave-short-desc">Intense focus and problem-solving.</p>
                  </div>
                  <div className="wave-visual">
                    <img src="https://framerusercontent.com/images/3b6cDJfMER15fedm6jQa9Erf5Lg.png" alt="Gamma waves" />
                  </div>
                  <div className={`expand-icon ${expandedWave === 'gamma' ? 'rotated' : ''}`}>
                    <img src="https://framerusercontent.com/images/47q1zuXLMZFu9c5tLynggEp4.png" alt="expand" />
                  </div>
                </div>
                <div className={`wave-expanded-content ${expandedWave === 'gamma' ? 'open' : ''}`}>
                  <p className="wave-expanded-text">
                    Gamma waves are associated with intense focus, problem-solving, and emotion regulation.
                    These fast brainwaves help you process complex information and facilitate connections
                    across different areas of the brain. For example, when you're solving a difficult puzzle,
                    your brain integrates past knowledge, logic, and creativity to find the solution.
                  </p>
                  <p className="wave-expanded-text">
                    If gamma activity is low, it often correlates with difficulty concentrating, slower
                    decision-making, and mood imbalances.
                  </p>
                </div>
              </div>

              {/* Beta Waves */}
              <div className="expandable-wave-card scroll-animate scroll-animate-flip scroll-delay-2" onClick={() => toggleWave('beta')}>
                <div className="wave-card-header">
                  <div className="wave-info">
                    <div className="wave-title-row">
                      <h3 className="wave-name" style={{ color: 'rgb(164, 135, 192)' }}>Beta</h3>
                      <span className="wave-freq">13-30 Hz</span>
                    </div>
                    <p className="wave-short-desc">Alertness, focus, and active problem-solving.</p>
                  </div>
                  <div className="wave-visual">
                    <img src="https://framerusercontent.com/images/TEQqNAJz4kVd1Lx37OFZRvlpY.png" alt="Beta waves" />
                  </div>
                  <div className={`expand-icon ${expandedWave === 'beta' ? 'rotated' : ''}`}>
                    <img src="https://framerusercontent.com/images/47q1zuXLMZFu9c5tLynggEp4.png" alt="expand" />
                  </div>
                </div>
                <div className={`wave-expanded-content ${expandedWave === 'beta' ? 'open' : ''}`}>
                  <p className="wave-expanded-text">
                    Beta waves dominate during active thinking, problem-solving, and focused attention.
                    They are present during normal waking consciousness when you're alert and engaged with tasks.
                  </p>
                  <p className="wave-expanded-text">
                    High beta activity can indicate stress, anxiety, or overthinking. Balancing beta waves
                    is important for maintaining optimal cognitive function without excessive mental tension.
                  </p>
                </div>
              </div>

              {/* Alpha Waves */}
              <div className="expandable-wave-card scroll-animate scroll-animate-flip scroll-delay-3" onClick={() => toggleWave('alpha')}>
                <div className="wave-card-header">
                  <div className="wave-info">
                    <div className="wave-title-row">
                      <h3 className="wave-name" style={{ color: 'rgb(69, 115, 102)' }}>Alpha</h3>
                      <span className="wave-freq">8-12 Hz</span>
                    </div>
                    <p className="wave-short-desc">Relaxation, learning, and passive attention.</p>
                  </div>
                  <div className="wave-visual">
                    <img src="https://framerusercontent.com/images/D3Sohjy2uLXjpaKWuuezOrCHxek.png" alt="Alpha waves" />
                  </div>
                  <div className={`expand-icon ${expandedWave === 'alpha' ? 'rotated' : ''}`}>
                    <img src="https://framerusercontent.com/images/47q1zuXLMZFu9c5tLynggEp4.png" alt="expand" />
                  </div>
                </div>
                <div className={`wave-expanded-content ${expandedWave === 'alpha' ? 'open' : ''}`}>
                  <p className="wave-expanded-text">
                    Alpha waves are characteristic of relaxed, calm alertness. They increase when you close
                    your eyes and relax, making them ideal for stress reduction and creative thinking. Alpha
                    waves represent a bridge between conscious and subconscious mind.
                  </p>
                  <p className="wave-expanded-text">
                    Strong alpha activity is associated with reduced stress, improved learning capacity, and
                    enhanced creativity. Meditation and relaxation techniques often aim to increase alpha wave production.
                  </p>
                </div>
              </div>

              {/* Theta Waves */}
              <div className="expandable-wave-card scroll-animate scroll-animate-flip scroll-delay-4" onClick={() => toggleWave('theta')}>
                <div className="wave-card-header">
                  <div className="wave-info">
                    <div className="wave-title-row">
                      <h3 className="wave-name" style={{ color: 'rgb(250, 203, 97)' }}>Theta</h3>
                      <span className="wave-freq">4-7 Hz</span>
                    </div>
                    <p className="wave-short-desc">Dreamy, free-flowing states, from autopilot to deep meditation.</p>
                  </div>
                  <div className="wave-visual">
                    <img src="https://framerusercontent.com/images/RAIMshdo3cBKYxufhElZ46fRZQ.png" alt="Theta waves" />
                  </div>
                  <div className={`expand-icon ${expandedWave === 'theta' ? 'rotated' : ''}`}>
                    <img src="https://framerusercontent.com/images/47q1zuXLMZFu9c5tLynggEp4.png" alt="expand" />
                  </div>
                </div>
                <div className={`wave-expanded-content ${expandedWave === 'theta' ? 'open' : ''}`}>
                  <p className="wave-expanded-text">
                    Theta waves are present during light sleep, deep meditation, and creative states. They are
                    linked to intuition, memory consolidation, and subconscious processing. Theta appears during
                    the twilight state between waking and sleeping.
                  </p>
                  <p className="wave-expanded-text">
                    Enhanced theta activity is associated with improved memory, increased creativity, and deeper
                    meditative states. However, excessive theta during waking hours can indicate inattention or drowsiness.
                  </p>
                </div>
              </div>

              {/* Delta Waves */}
              <div className="expandable-wave-card scroll-animate scroll-animate-flip scroll-delay-5" onClick={() => toggleWave('delta')}>
                <div className="wave-card-header">
                  <div className="wave-info">
                    <div className="wave-title-row">
                      <h3 className="wave-name" style={{ color: 'rgb(185, 45, 69)' }}>Delta</h3>
                      <span className="wave-freq">0.5-3 Hz</span>
                    </div>
                    <p className="wave-short-desc">Amplified in deep meditation and dreamless sleep.</p>
                  </div>
                  <div className="wave-visual">
                    <img src="https://framerusercontent.com/images/W31aaNKuryDwByXzJpurTOx8DCM.png" alt="Delta waves" />
                  </div>
                  <div className={`expand-icon ${expandedWave === 'delta' ? 'rotated' : ''}`}>
                    <img src="https://framerusercontent.com/images/47q1zuXLMZFu9c5tLynggEp4.png" alt="expand" />
                  </div>
                </div>
                <div className={`wave-expanded-content ${expandedWave === 'delta' ? 'open' : ''}`}>
                  <p className="wave-expanded-text">
                    Delta waves are the slowest brainwaves, dominant during deep, dreamless sleep. They are
                    associated with healing, regeneration, and unconscious bodily functions. Delta activity
                    is crucial for physical restoration and immune function.
                  </p>
                  <p className="wave-expanded-text">
                    High delta activity during waking hours can indicate brain injury or learning disabilities,
                    while insufficient delta during sleep may affect recovery and overall health.
                  </p>
                </div>
              </div>

              {/* Brain Maps Section */}
              <section className="brain-maps-section" id="brainmaps-section">
                <div className="brain-maps-content">
                  <div className="brain-maps-header">
                    <h4 className="brain-maps-title">
                      <span className="gradient-text-green">Brain maps</span>
                    </h4>
                  </div>

                  <div className="brain-maps-description">
                    <p>
                      A brainwave strength in a certain region of the brain can tell us about the current mental state, or if seen over time, indicate health issues.
                    </p>
                    <p>
                      To visualize this, clinicians and researchers use brain maps. These maps can compare a person's data to a population norm or their own baseline.
                    </p>
                    <p>
                      Here's how to read them:
                    </p>
                  </div>

                  {/* Brain Map Guide */}
                  <div className="brain-map-guide-container">
                    <div className="brain-map-base">
                      <img
                        src="https://framerusercontent.com/images/QWlF3rPIjFf1xiSByiBbnMS2eDg.png?width=1559&height=1319"
                        alt="Brain map base"
                      />
                    </div>
                    <div className="brain-map-overlay">
                      <img
                        src="https://framerusercontent.com/images/1zFbxyILrsPeRuD0TXrrmvvcB2w.png?width=1559&height=1319"
                        alt="Brain map guide overlay"
                      />
                    </div>
                  </div>

                  {/* Mental States Examples */}
                  <div className="mental-states-section">
                    <p className="mental-states-intro">
                      To illustrate this further, here are brain map examples of 4 different mental states. Browse and notice the difference!
                    </p>

                    {/* Mental State Buttons */}
                    <div className="mental-states-buttons">
                      <button
                        className={`mental-state-btn ${mentalState === 'idle' ? 'active' : ''}`}
                        onClick={() => setMentalState('idle')}
                      >
                        <span className="gradient-text-idle">Idle</span>
                      </button>
                      <button
                        className={`mental-state-btn ${mentalState === 'focus' ? 'active' : ''}`}
                        onClick={() => setMentalState('focus')}
                      >
                        Focus
                      </button>
                      <button
                        className={`mental-state-btn ${mentalState === 'fatigue' ? 'active' : ''}`}
                        onClick={() => setMentalState('fatigue')}
                      >
                        Fatigue
                      </button>
                      <button
                        className={`mental-state-btn ${mentalState === 'relaxed' ? 'active' : ''}`}
                        onClick={() => setMentalState('relaxed')}
                      >
                        Relaxed
                      </button>
                    </div>

                    {/* Brain Maps Grid */}
                    <div className="brain-maps-grid">
                      {/* Alpha Brain Map */}
                      <div className="brain-map-item">
                        <div className="brain-map-image">
                          <img
                            src="https://framerusercontent.com/images/QgcTEK5ZdMGMks3SafteIsYU.png"
                            alt="Alpha brain map"
                          />
                        </div>
                        <div className="brain-map-label">
                          <p className="wave-label" style={{ color: 'rgb(89, 148, 131)' }}>Alpha</p>
                          <p className="wave-freq-label">8-12 Hz</p>
                        </div>
                      </div>

                      {/* Beta Brain Map */}
                      <div className="brain-map-item">
                        <div className="brain-map-image">
                          <img
                            src="https://framerusercontent.com/images/WL7D3G2XPohIY4CYxrMGCV4Vfhw.png"
                            alt="Beta brain map"
                          />
                        </div>
                        <div className="brain-map-label">
                          <p className="wave-label" style={{ color: 'rgb(185, 128, 255)' }}>Beta</p>
                          <p className="wave-freq-label">13-32 Hz</p>
                        </div>
                      </div>

                      {/* Theta Brain Map */}
                      <div className="brain-map-item">
                        <div className="brain-map-image">
                          <img
                            src="https://framerusercontent.com/images/hF4d1yei4uiHuRkb3uF3mlqEUyY.png"
                            alt="Theta brain map"
                          />
                        </div>
                        <div className="brain-map-label">
                          <p className="wave-label" style={{ color: 'rgb(224, 175, 67)' }}>Theta</p>
                          <p className="wave-freq-label">4-8 Hz</p>
                        </div>
                      </div>
                    </div>

                    {/* Color Scale */}
                    <div className="color-scale">
                      <img
                        src="https://framerusercontent.com/images/m2OoV15BXecBdwShs2AENxFvGL8.png"
                        alt="Color scale legend"
                      />
                    </div>

                    {/* Info Box */}
                    <div className="brain-maps-info-box">
                      <p>
                        💡 Remember! This map compares your brainwaves to your baseline.
                      </p>
                      <p>
                        In a normal state, your brainwaves fall within the typical range (i.e., within baseline), which is why it appears green. Click through the other states to see how they differ.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </section>

            <section id="female-brain" className="female-brain-section">
              <div className="female-brain-content">
                <div className="female-brain-header">
                  <h4 className="female-brain-title scroll-animate scroll-animate-bounce">
                    The female brain shows more activity at faster frequencies
                  </h4>
                  <div className="female-brain-description scroll-animate scroll-delay-1">
                    <p className="large-text">
                      In both male and female brains, brainwaves create a unique current. Think of them as the flow of water.
                    </p>
                    <p>
                      When the flow is slow and steady, like a calm river, it represents lower-frequency brainwaves linked to relaxation and sleep. Faster, more vigorous currents, like a rushing stream, reflect higher-frequency brainwaves tied to focus and alertness.
                    </p>
                    <p className="large-text">
                      Female brains often show more activity at these faster frequencies, making it easier to stay centered and alert. For example, while analyzing complex information, this heightened activity supports clear thinking and quick responses.
                    </p>
                    <p className="large-text">
                      This pattern of lower theta and alpha frequencies, combined with higher alpha and beta waves, may provide an advantage in managing emotions during stress, blocking distractions, and smoothly transitioning from work mode to relaxation—especially under pressure.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="wiring-differences" className="wiring-differences-section">
              <div className="wiring-differences-content">
                <div className="wiring-differences-header">
                  <h4 className="wiring-differences-title">
                    The difference in how our brains are wired
                  </h4>
                  <div className="wiring-differences-description">
                    <p>
                      Male and female brainwaves do oscillate differently, but what does that mean and why does it happen?
                    </p>
                    <p>
                      Here are some reasons why these distinctions occur:
                    </p>
                    <ul>
                      <li>
                        <p>
                          <strong>Brain structure, connectivity, and blood flow:</strong> Females tend to have stronger connections between brain regions, which leads to more coordinated brain activity. This is paired with increased blood flow throughout the brain, particularly in areas like the frontal lobe (linked to decision-making), parietal lobe (for sensory and spatial processing), and occipital lobe (responsible for vision). These factors together suggest that females have higher energy consumption and brain activity, even when resting.
                        </p>
                      </li>
                      <li>
                        <p>
                          <strong>Hormonal Influence:</strong> Changes in sex hormones, such as estrogen and progesterone, affect brain connectivity and function. These hormones play a role in brain plasticity, meaning they help the brain adapt and reorganize. They particularly impact areas related to emotion and memory, like the hippocampus and amygdala, by influencing the density of connections between brain cells. This means that hormonal fluctuations can directly affect how the brain processes emotions and stores memories.
                        </p>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section id="alpha-peak" className="alpha-peak-section">
              <div className="alpha-peak-header">
                <h3 className="alpha-peak-main-title">
                  The brain health indicator, Alpha Peak, differs by sex
                </h3>
              </div>

              <div className="alpha-peak-intro">
                <h4 className="alpha-peak-subtitle">What exactly is Alpha Peak?</h4>
                <div className="alpha-peak-description">
                  <p>
                    Try to imagine your brain as a radio, with different channels playing at different frequencies. "Alpha" is a group of channels that play at frequencies between 8 to 12 Hz. The channel that's loudest in that range is what we call Alpha Peak.
                  </p>
                  <p>
                    A higher Alpha Peak is associated with better cognitive health, processing speed, memory, emotional balance, and the brain's ability to adapt to different mental tasks and challenges.
                  </p>
                </div>
              </div>

              <div className="alpha-peak-visual-section">
                <div className="alpha-peak-left-descriptions">
                  <div className="alpha-description-item">
                    <p>These are your different brainwave frequencies</p>
                  </div>
                  <div className="alpha-description-item">
                    <p>This peak between 8 and 12 Hz is the <span className="highlight-green">Alpha Peak</span></p>
                  </div>
                  <div className="alpha-description-item">
                    <p>The higher it is, the higher your cognitive functioning is</p>
                  </div>
                  <div className="alpha-description-item">
                    <p>A peak performer can have it as high as 12!</p>
                  </div>
                </div>

                <div className="alpha-peak-graph-container">
                  <p className="graph-label">Brain Frequencies Graph</p>
                  <div className="graph-image-stack">
                    <img
                      src="https://framerusercontent.com/images/dWrFXY6Hh42SLYXI6dRNTclWZFA.png?width=1235&height=971"
                      alt="Brain frequencies graph"
                      className="graph-layer graph-base"
                    />
                    <img
                      src="https://framerusercontent.com/images/0XVU99kOJ1U4mUOtHlTbzjlmY.png?width=1235&height=971"
                      alt="Graph axes"
                      className="graph-layer graph-axes"
                    />
                    <img
                      src="https://framerusercontent.com/images/VvV3JnJ0v2E6Zt0i0sYCE50y0.png?width=1235&height=971"
                      alt="Frequency ranges"
                      className="graph-layer graph-ranges"
                    />
                    <img
                      src="https://framerusercontent.com/images/skBbVvv8GWpHukm6gfvtLTqAfM.png?width=1235&height=971"
                      alt="Alpha range highlight"
                      className="graph-layer graph-alpha-range"
                    />
                    <img
                      src="https://framerusercontent.com/images/SU5PtLGUjWv4S2SSHutQJi1ALMs.png?width=1235&height=971"
                      alt="Alpha peak point"
                      className="graph-layer graph-alpha-point"
                    />
                  </div>
                </div>

                <div className="alpha-peak-right-descriptions">
                  <div className="alpha-description-item">
                    <p>Let's zoom in on alpha</p>
                  </div>
                </div>
              </div>
            </section>

            <section id="alpha-peak-trends" className="alpha-peak-trends-section">
              <div className="alpha-trends-header">
                <h4 className="alpha-trends-title">How does Alpha Peak change with age?</h4>
              </div>

              <div className="alpha-trends-graph">
                <img
                  src="https://framerusercontent.com/images/k6OxoAyb2MCbwYLG37QnWFB1Rc.png?width=1255&height=926"
                  alt="Alpha peak changes with age"
                />
                <p className="graph-caption">
                  Data recorded from AF7, AF8, TP9, TP10 channels. Total N = 9,644 (Females: N = 4,163; Males: N = 5,481)
                </p>
              </div>

              <div className="alpha-trends-description">
                <p>
                  Females tend to exhibit higher Alpha Peak values, which appear to reach their maximum later in life, around the age of 38. While this could suggest a potential link to reaching the peak of cognitive function at that age, further research is needed to fully understand its significance.
                </p>
                <p>
                  On the other hand, males peak around the age of 30. So, what explains this difference?
                </p>
              </div>
            </section>

            <section id="alpha-peak-variations" className="alpha-peak-variations-section">
              <div className="alpha-variations-header">
                <h4 className="alpha-variations-title">
                  Understanding Alpha Peak differences between sexes
                </h4>
              </div>

              <div className="alpha-variations-description">
                <p>
                  Recent studies reveal intriguing connections between the brain's Default Mode Network (DMN) and alpha brainwaves, shedding light on potential sex-related variations.
                </p>
                <p>
                  The brain's Default Mode Network (DMN) plays a crucial role in memory consolidation, introspection, and understanding one's thoughts and emotions.
                </p>
                <p>
                  It has been suggested that the DMN interacts with alpha brainwaves, which are key to mental states like relaxation and focus.
                </p>
                <p>
                  Hormonal changes can influence the development and function of the DMN, potentially creating sex differences in Alpha Peak Frequency (APF).
                </p>
                <p>
                  These differences aren't just structural or functional: they can also be linked to hormonal effects on brain development. For example, androgens (like testosterone) influence brain development differently than estrogen.
                </p>
                <p>
                  Prenatal exposure to androgens can impact the DMN's formation, which in turn affects alpha peak frequency.
                </p>
                <p>
                  Generally, exposure to androgens is associated with lower alpha peak frequencies or altered alpha activity patterns compared to females.
                </p>
              </div>
            </section>

            <section id="aging-insights" className="aging-insights-section">
              <div className="aging-insights-header">
                <h3 className="aging-insights-title scroll-animate scroll-animate-zoom">
                  Our brains help us cope with aging
                </h3>
              </div>

              <div className="aging-insights-content">
                <div className="aging-intro-text scroll-animate scroll-delay-1">
                  <p>
                    Despite the differences, female and male brains have one great thing in common: as we age, our brains adapt in ways that help maintain cognitive abilities. Here we see how brainwaves fluctuate over time to support our brain's cognitive functions.
                  </p>
                </div>

                <div className="aging-graphs-container">
                  <div className="aging-graphs-grid">
                    <div className="aging-graph-left scroll-animate scroll-animate-left scroll-delay-2">
                      <div className="aging-graph-item">
                        <p className="graph-wave-label">Delta</p>
                        <div className="graph-image-wrapper">
                          <img
                            src="https://framerusercontent.com/images/PNjESlc17Iwd4bxiyH4OTjJPrQ.png?width=1228&height=769"
                            alt="Delta wave aging graph"
                          />
                        </div>
                      </div>
                      <div className="aging-graph-item">
                        <p className="graph-wave-label">Theta</p>
                        <div className="graph-image-wrapper">
                          <img
                            src="https://framerusercontent.com/images/69QgkyfMjxBvR11eLJJvZMs2TM.png?width=1228&height=769"
                            alt="Theta wave aging graph"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="aging-graph-right scroll-animate scroll-animate-right scroll-delay-3">
                      <div className="aging-graph-item">
                        <p className="graph-wave-label">Alpha</p>
                        <div className="graph-image-wrapper">
                          <img
                            src="https://framerusercontent.com/images/2HIs2C3wj1CyGGPekzAuzkfSNI.png?width=1228&height=769"
                            alt="Alpha wave aging graph"
                          />
                        </div>
                      </div>
                      <div className="aging-graph-item">
                        <p className="graph-wave-label">Beta</p>
                        <div className="graph-image-wrapper">
                          <img
                            src="https://framerusercontent.com/images/ZHa32Ek94SKx8SKUj48t1SZF1qc.png?width=1228&height=769"
                            alt="Beta wave aging graph"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="graph-caption aging-caption">
                    Data recorded from AF7, AF8, TP9, TP10 channels. Total N = 9,644 (Females: N = 4,163; Males: N = 5,481)
                  </p>
                </div>

                <div className="aging-description">
                  <p>
                    Low frequency brainwaves (delta and theta) tend to decrease in strength, and their reduction is often linked<sup>17 18</sup> to memory problems, especially in conditions like Alzheimer's.
                  </p>
                  <p>
                    On the other hand, relatively higher-frequency waves, like alpha and beta, seem to increase with age.
                  </p>
                  <p>
                    This increase could be<sup>19</sup> the brain's way of compensating for the loss of lower-frequency waves.
                  </p>
                  <p>
                    For example, stronger alpha waves might help<sup>20</sup> maintain the brain's memory and thinking skills sharp despite the natural aging process.
                  </p>
                </div>

                <div className="aging-compensation-section">
                  <h4 className="aging-compensation-title">
                    The aging brain compensates for structural changes
                  </h4>
                  <div className="aging-compensation-description">
                    <p>
                      Even though the brain undergoes physical changes with age, such as shrinkage in certain areas, reduced connectivity between brain cells, and thinning of the outer layer, cognitive abilities don't always decline<sup>21 22</sup> significantly because the brain can adapt.
                    </p>
                    <p>
                      These adaptations can involve the brain using different regions more effectively or creating new connections to compensate for any decline.
                    </p>
                    <p>
                      For example, older adults often recruit additional brain regions or show increased activations, which helps<sup>23</sup> them perform tasks like memory recall or problem-solving, aiding in the maintenance of cognitive performance despite age-related changes.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Final Remarks Section */}
            <section id="final-remarks" className="final-remarks-section">
              <div className="final-remarks-content scroll-animate scroll-animate-bounce">
                <h3 className="final-remarks-title">
                  Rethinking how we approach brain health
                </h3>
                <div className="final-remarks-description">
                  <p>
                    Understanding how our brains stay functional as we age reveals new ways to support cognitive resilience and mental performance. Meanwhile, recognizing the differences between male and female brains opens the door to more tailored approaches to stress management, emotional regulation, and mental health.
                  </p>
                  <p>
                    By combining these insights, we can create refined solutions that benefit everyone in ways we're just beginning to explore.
                  </p>
                </div>
              </div>

              <div className="call-researchers-section scroll-animate scroll-animate-left scroll-delay-2">
                <h4 className="call-researchers-title">
                  Call for researchers
                </h4>
                <div className="call-researchers-description">
                  <p>
                    We invite researchers to collaborate with us in uncovering new insights and deepening our understanding of the brain.
                  </p>
                  <p>
                    Interested in contributing? Send your proposal to <a href="mailto:limitlessbrainlab@gmail.com" target="_blank" rel="noopener noreferrer">limitlessbrainlab@gmail.com</a>.
                  </p>
                </div>
              </div>
            </section>

            {/* References Section */}
            <section id="references" className="references-section">
              <h5 className="references-title scroll-animate scroll-animate-bounce">References</h5>
              <div className="references-list scroll-animate scroll-delay-1">
                <div className="reference-item" id="ref-1-2">
                  <p>1) Scheeringa, R., Bastiaansen, M. C. M., Petersson, K. M., Oostenveld, R., Norris, D. G., & Hagoort, P. (2008). Frontal theta EEG activity correlates negatively with the default mode network in resting state. International Journal of Psychophysiology, 67(3), 242–251.</p>
                  <a href="https://doi.org/10.1016/j.ijpsycho.2007.05.017" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.ijpsycho.2007.05.017</a>
                  <br /><br />
                  <p>2) Kim, Y.-W., Kim, S., Jin, M. J., Im, C.-H., & Lee, S.-H. (2024). The Importance of Low-frequency Alpha (8−10 Hz) Waves and Default Mode Network in Behavioral Inhibition. Clinical Psychopharmacology and Neuroscience, 22(1), 53–66.</p>
                  <a href="https://doi.org/10.9758/cpn.22.1035" target="_blank" rel="noopener noreferrer">https://doi.org/10.9758/cpn.22.1035</a>
                </div>

                <div className="reference-item" id="ref-3-4">
                  <p>3) Benchenane, K., Tiesinga, P. H., & Battaglia, F. P. (2011). Oscillations in the prefrontal cortex: A gateway to memory and attention. Current Opinion in Neurobiology, 21(3), 475–485. <a href="https://doi.org/10.1016/j.conb.2011.01.004" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.conb.2011.01.004</a></p>
                  <br />
                  <p>4) Picazio, S., Veniero, D., Ponzo, V., Caltagirone, C., Gross, J., Thut, G., & Koch, G. (2014). Prefrontal Control over Motor Cortex Cycles at Beta Frequency during Movement Inhibition. Current Biology, 24(24), 2940–2945.</p>
                  <a href="https://doi.org/10.1016/j.cub.2014.10.043" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.cub.2014.10.043</a>
                </div>

                <div className="reference-item" id="ref-5-6-7">
                  <p>5) Serio, B., Hettwer, M. D., Wiersch, L., Bignardi, G., Sacher, J., Weis, S., Eickhoff, S. B., & Valk, S. L. (2024). Sex differences in functional cortical organization reflect differences in network topology rather than cortical morphometry. Nature Communications, 15(1), 7714.</p>
                  <a href="https://doi.org/10.1038/s41467-024-51942-1" target="_blank" rel="noopener noreferrer">https://doi.org/10.1038/s41467-024-51942-1</a>
                  <br /><br />
                  <p>6) Makwana, B., Tart-Zelvin, A., Xu, X., Gunstad, J. J., Cote, D. M., Poppas, A., Cohen, R. A., & Sweet, L. H. (2020). Cerebrovascular Perfusion Among Older Adults with and without Cardiovascular Disease. Journal of Neuroimaging, 30(6), 851–856. <a href="https://doi.org/10.1111/jon.12757" target="_blank" rel="noopener noreferrer">https://doi.org/10.1111/jon.12757</a></p>
                  <br />
                  <p>7) Gong, G., He, Y., & Evans, A. C. (2011). Brain Connectivity: Gender Makes a Difference. The Neuroscientist, 17(5), 575–591.</p>
                  <a href="https://doi.org/10.1177/1073858410386492" target="_blank" rel="noopener noreferrer">https://doi.org/10.1177/1073858410386492</a>
                </div>

                <div className="reference-item" id="ref-8">
                  <p>8) Weissman‐Fogel, I., Moayedi, M., Taylor, K. S., Pope, G., & Davis, K. D. (2010). Cognitive and default‐mode resting state networks: Do male and female brains "rest" differently? Human Brain Mapping, 31(11), 1713–1726.</p>
                  <a href="https://doi.org/10.1002/hbm.20968" target="_blank" rel="noopener noreferrer">https://doi.org/10.1002/hbm.20968</a>
                </div>

                <div className="reference-item" id="ref-9">
                  <p>9) Styne, D., Grumbach, M., Dennis, M., Styne, J., & Melvin, M. (1998). Puberty: Ontogeny, neuroendocrinology, physiology, and disorders.</p>
                  <a href="https://www.semanticscholar.org/paper/Puberty-%3A-ontogeny%2C-neuroendocrinology%2C-physiology%2C-Styne-Grumbach/1a6e6d4bfbbc4c598f1303f0ebaf518aea682182" target="_blank" rel="noopener noreferrer">https://www.semanticscholar.org/paper/Puberty-ontogeny-neuroendocrinology-physiology-Styne-Grumbach</a>
                </div>

                <div className="reference-item" id="ref-10">
                  <p>10) Woolley, C. S., & McEwen, B. S. (1994). Estradiol regulates hippocampal dendritic spine density via an N-methyl-D-aspartate receptor-dependent mechanism. The Journal of Neuroscience, 14(12), 7680–7687.</p>
                  <a href="https://doi.org/10.1523/JNEUROSCI.14-12-07680.1994" target="_blank" rel="noopener noreferrer">https://doi.org/10.1523/JNEUROSCI.14-12-07680.1994</a>
                </div>

                <div className="reference-item" id="ref-11">
                  <p>11) Lombardo, M., Auyeung, B., Pramparo, T., Quartier, A., Courraud, J., Holt, R & Baron‐Cohen, S. (2018). Sex-specific impact of prenatal androgens on social brain default mode subsystems. Molecular Psychiatry, 25(9), 2175-2188.</p>
                  <a href="https://doi.org/10.1038/s41380-018-0198-y" target="_blank" rel="noopener noreferrer">https://doi.org/10.1038/s41380-018-0198-y</a>
                </div>

                <div className="reference-item" id="ref-12">
                  <p>12) Lombardo, M., Auyeung, B., Pramparo, T., Quartier, A., Courraud, J., Holt, R & Baron‐Cohen, S. (2018). Sex-specific impact of prenatal androgens on social brain default mode subsystems. Molecular Psychiatry, 25(9), 2175-2188.</p>
                  <a href="https://doi.org/10.1038/s41380-018-0198-y" target="_blank" rel="noopener noreferrer">https://doi.org/10.1038/s41380-018-0198-y</a>
                </div>

                <div className="reference-item" id="ref-13-14">
                  <p>13) Lombardo, M., Auyeung, B., Pramparo, T., Quartier, A., Courraud, J., Holt, R & Baron‐Cohen, S. (2018). Sex-specific impact of prenatal androgens on social brain default mode subsystems. Molecular Psychiatry, 25(9), 2175-2188.</p>
                  <a href="https://doi.org/10.1038/s41380-018-0198-y" target="_blank" rel="noopener noreferrer">https://doi.org/10.1038/s41380-018-0198-y</a>
                  <br /><br />
                  <p>14) T. De Bondt, et al. Stability of resting state networks in the female brain during hormonal changes and their relation to premenstrual symptoms. Brain Res., 1624 (2015), pp. 275-285</p>
                </div>

                <div className="reference-item" id="ref-15-16">
                  <p>15) Andreano, J. M., Touroutoglou, A., Dickerson, B., & Barrett, L. F. (2018). Hormonal Cycles, Brain Network Connectivity, and Windows of Vulnerability to Affective Disorder. Trends in Neurosciences, 41(10), 660–676.</p>
                  <a href="https://doi.org/10.1016/j.tins.2018.08.007" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.tins.2018.08.007</a>
                  <br /><br />
                  <p>16) J. Engman, et al. Hormonal cycle and contraceptive effects on amygdala and salience resting-state networks in women with previous affective side effects on the pill. Neuropsychopharmacology, 43 (2018), pp. 555-563</p>
                </div>

                <div className="reference-item" id="ref-17-18">
                  <p>17) Karakaş, S. (2020). A review of theta oscillation and its functional correlates. International Journal of Psychophysiology, 157, 82–99.</p>
                  <a href="https://doi.org/10.1016/j.ijpsycho.2020.04.008" target="_blank" rel="noopener noreferrer">https://doi.org/10.1016/j.ijpsycho.2020.04.008</a>
                  <br /><br />
                  <p>18) Siwek, M. E., Müller, R., Henseler, C., Trog, A., Lundt, A., Wormuth, C., Broich, K., Ehninger, D., Weiergräber, M., & Papazoglou, A. (2015). Altered Theta Oscillations and Aberrant Cortical Excitatory Activity in the 5XFAD Model of Alzheimer's Disease. Neural Plasticity, 2015(1), 781731. <a href="https://doi.org/10.1155/2015/781731" target="_blank" rel="noopener noreferrer">https://doi.org/10.1155/2015/781731</a></p>
                </div>

                <div className="reference-item" id="ref-19">
                  <p>19) Penhale, S. H., Arif, Y., Schantell, M., Johnson, H. J., Willett, M. P., Okelberry, H. J., Meehan, C. E., Heinrichs‐Graham, E., & Wilson, T. W. (2024). Healthy aging alters the oscillatory dynamics and fronto‐parietal connectivity serving fluid intelligence. Human Brain Mapping, 45(3). <a href="https://doi.org/10.1002/hbm.26591" target="_blank" rel="noopener noreferrer">https://doi.org/10.1002/hbm.26591</a></p>
                </div>

                <div className="reference-item" id="ref-20">
                  <p>20) Springer, S. D., Okelberry, H. J., Willett, M. P., Johnson, H. J., Meehan, C. E., Schantell, M., Embury, C. M., Rempe, M. P., & Wilson, T. W. (2023). Age-related alterations in the oscillatory dynamics serving verbal working memory processing. Aging, 15(24), 14574–14590.</p>
                  <a href="https://doi.org/10.18632/aging.205403" target="_blank" rel="noopener noreferrer">https://doi.org/10.18632/aging.205403</a>
                </div>

                <div className="reference-item" id="ref-21-22">
                  <p>21) Martins, R., Joanette, Y., & Monchi, O. (2015). The implications of age-related neurofunctional compensatory mechanisms in executive function and language processing including the new Temporal Hypothesis for Compensation. Frontiers in Human Neuroscience, 9. <a href="https://doi.org/10.3389/fnhum.2015.00221" target="_blank" rel="noopener noreferrer">https://doi.org/10.3389/fnhum.2015.00221</a></p>
                  <br />
                  <p>22) Behfar, Q., Behfar, S. K., von Reutern, B., Richter, N., Dronse, J., Fassbender, R., Fink, G. R., & Onur, O. A. (2020). Graph Theory Analysis Reveals Resting-State Compensatory Mechanisms in Healthy Aging and Prodromal Alzheimer's Disease. Frontiers in Aging Neuroscience, 12. <a href="https://doi.org/10.3389/fnagi.2020.576627" target="_blank" rel="noopener noreferrer">https://doi.org/10.3389/fnagi.2020.576627</a></p>
                </div>

                <div className="reference-item" id="ref-23">
                  <p>23) Behfar, Q., Behfar, S. K., von Reutern, B., Richter, N., Dronse, J., Fassbender, R., Fink, G. R., & Onur, O. A. (2020). Graph Theory Analysis Reveals Resting-State Compensatory Mechanisms in Healthy Aging and Prodromal Alzheimer's Disease. Frontiers in Aging Neuroscience, 12. <a href="https://doi.org/10.3389/fnagi.2020.576627" target="_blank" rel="noopener noreferrer">https://doi.org/10.3389/fnagi.2020.576627</a></p>
                </div>
              </div>
            </section>

          </main>
        </div>

        <Footer />
      </div>
    </>
  );
};

export default GuideToBrainwaves;
