import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';
import FeatureGate from '../components/access/FeatureGate';
import {
  User,
  MapPin,
  Search,
  Navigation,
  Monitor,
  Users,
  Star,
  Calendar,
  Clock,
  MessageCircle,
  Phone,
  Video,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Award,
  Brain,
  Heart,
  Sparkles,
  AlertCircle,
  Map as MapIcon,
  Filter,
  X,
  Loader2,
  Gift,
  Info,
  Building2,
  Mail,
  CreditCard,
  Shield,
  Lock,
  Unlock,
  CheckCircle,
  UserCheck
} from 'lucide-react';
import coachService from '../services/coachService';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Common Calendly scheduling link for all coaches
const CALENDLY_LINK = 'https://calendly.com/admin-bettroi/30min';

// Coaches hidden from the public directory
const HIDDEN_COACH_NAMES = ['sweta adatia'];
const excludeHiddenCoaches = (list) =>
  (list || []).filter(c => !HIDDEN_COACH_NAMES.some(h => (c?.name || '').toLowerCase().includes(h)));

const BrainCoach = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // Handle payment success callback
  // Payment success state
  const [showCoachPaymentSuccess, setShowCoachPaymentSuccess] = useState(false);
  const [coachPaymentDetails, setCoachPaymentDetails] = useState(null);
  const [paidCalendlyUrl, setPaidCalendlyUrl] = useState(null);

  // Calendly widget modal state
  const [showCalendlyModal, setShowCalendlyModal] = useState(false);
  const [calendlyIframeUrl, setCalendlyIframeUrl] = useState('');
  const calendlyContainerRef = useRef(null);

  const openCalendlyPopup = (url) => {
    if (!url) return;
    setCalendlyIframeUrl(url);
    setShowCalendlyModal(true);
  };

  // Initialize Calendly inline widget when modal opens
  // Using initInlineWidget (not plain iframe) so that calendly.event_scheduled postMessage fires
  useEffect(() => {
    if (!showCalendlyModal || !calendlyIframeUrl) return;

    const init = () => {
      if (!calendlyContainerRef.current) return;
      calendlyContainerRef.current.innerHTML = '';
      window.Calendly.initInlineWidget({
        url: calendlyIframeUrl,
        parentElement: calendlyContainerRef.current,
        prefill: { name: user?.name || '', email: user?.email || '' }
      });
    };

    if (window.Calendly) {
      init();
    } else {
      if (!document.querySelector('link[href*="calendly.com/assets/external/widget.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://assets.calendly.com/assets/external/widget.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://assets.calendly.com/assets/external/widget.js';
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }
  }, [showCalendlyModal, calendlyIframeUrl, user?.name, user?.email]);

  useEffect(() => {
    if (!user?.email) return;

    const payment = searchParams.get('payment');
    const coachName = searchParams.get('coach');
    const calendlyUrl = searchParams.get('calendly');
    const sessionId = searchParams.get('session_id');
    const coachEmail = searchParams.get('coachEmail');

    if (payment === 'success') {
      const decodedCalendly = calendlyUrl ? decodeURIComponent(calendlyUrl) : CALENDLY_LINK;
      setPaidCalendlyUrl(decodedCalendly);

      // Show success popup
      setCoachPaymentDetails({
        coachName: coachName ? decodeURIComponent(coachName) : 'Brain Coach',
        amount: '₹2,500',
        email: user?.email || '',
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        transactionId: sessionId || 'N/A'
      });
      setShowCoachPaymentSuccess(true);

      // Save to patient_payments
      const saveCoachPayment = async () => {
        try {
          // Check duplicate
          if (sessionId) {
            const { data: existing } = await supabase.from('patient_payments').select('id').eq('stripe_session_id', sessionId).limit(1);
            if (existing && existing.length > 0) return;
          }

          // Get clinic info
          let clinicId = null;
          let clinicName = '';
          let patientRecord = null;
          if (user?.id) {
            const { data: p } = await supabase.from('patients').select('*').eq('id', user.id).limit(1).single();
            if (p) { patientRecord = p; clinicId = p.clinic_id || p.org_id || null; }
          }
          if (!patientRecord && user?.email) {
            const { data: ps } = await supabase.from('patients').select('*').eq('email', user.email.toLowerCase()).order('created_at', { ascending: false }).limit(1);
            if (ps && ps.length > 0) { patientRecord = ps[0]; clinicId = ps[0].clinic_id || ps[0].org_id || null; }
          }
          if (clinicId) {
            const { data: c } = await supabase.from('clinics').select('name').eq('id', clinicId).single();
            clinicName = c?.name || '';
          }

          // Save to patient_payments
          await supabase.from('patient_payments').insert({
            clinic_id: clinicId, patient_id: user.id || null,
            patient_email: user.email.toLowerCase(),
            patient_name: patientRecord?.full_name || patientRecord?.name || user.name || '',
            amount: 2500, currency: 'INR', status: 'completed', type: 'coaching',
            item_name: `Brain Coaching - ${coachName ? decodeURIComponent(coachName) : 'Session'}`,
            assessment_id: coachName ? decodeURIComponent(coachName) : 'coaching',
            stripe_session_id: sessionId || null,
            source: 'Brain Coach',
            created_at: new Date().toISOString()
          });

          // Send admin notification
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
          await fetch(`${API_URL}/send-assessment-email`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerEmail: user.email,
              customerName: patientRecord?.full_name || patientRecord?.name || user.name || '',
              assessmentName: `Brain Coaching Session - ${coachName ? decodeURIComponent(coachName) : 'Coach'}`,
              assessmentLink: 'no_link', amountPaid: '2500.00', currency: 'INR',
              transactionId: sessionId || '', source: 'patient_dashboard',
              clinicName, clinicId: clinicId || '',
              patientPhone: patientRecord?.phone || '', patientDob: patientRecord?.date_of_birth || '',
              patientGender: patientRecord?.gender || '', patientUid: patientRecord?.external_id || ''
            })
          }).catch(() => {});

          // Send confirmation email to patient, and notify coach
          await fetch(`${API_URL}/send-coaching-link`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientName: user?.name || 'Patient', patientEmail: user?.email,
              coachName: coachName ? decodeURIComponent(coachName) : 'Brain Coach',
              calendlyUrl: decodedCalendly || '',
              coachEmail: coachEmail ? decodeURIComponent(coachEmail) : null
            })
          }).catch(() => {});

          fetchPaidCoaches();
        } catch (err) { console.error('Error saving coaching payment:', err); }
      };

      saveCoachPayment();
      setSearchParams({});
    } else if (payment === 'cancelled') {
      toast.error('Payment was cancelled. You can try again anytime.', { duration: 4000 });
      setSearchParams({});
    }
  }, [searchParams, user?.email]);

  // Location state
  const [locationInput, setLocationInput] = useState('');
  const [radius, setRadius] = useState(25);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Filter state
  const [formatFilter, setFormatFilter] = useState('all'); // show all coaches
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSpecialties, setSelectedSpecialties] = useState([]);
  const [selectedRoleCategory, setSelectedRoleCategory] = useState('All');

  const ROLE_CATEGORIES = [
    'All',
    'Neurologist',
    'Brain Concierge',
    'Concierge Care',
    'Counselling Psychologist',
    'NLP & Counselling',
    'Clinical Psychology & Music Therapy',
    'Mantra Therapist',
  ];

  // View state
  const [viewMode, setViewMode] = useState('list'); // list, map
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingData, setBookingData] = useState({
    date: '',
    time: '',
    format: 'online',
    message: ''
  });
  const [callbackData, setCallbackData] = useState({
    phone: '',
    preferredTime: '',
    message: ''
  });

  // Data state
  const [coaches, setCoaches] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [specialtyOptions, setSpecialtyOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paidCoachIds, setPaidCoachIds] = useState([]); // Track coaches user has paid for

  // New state for dynamic search
  const [searchTab, setSearchTab] = useState('coaches'); // 'coaches' | 'clinics'
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedCity, setGeocodedCity] = useState('');
  const geocodeTimeoutRef = useRef(null);
  const resultsRef = useRef(null);

  // Coaching credits state
  const [coachingCredits, setCoachingCredits] = useState(0);
  const [creditDetails, setCreditDetails] = useState([]);

  // Patient's clinic for filtering coaches (each clinic has independent coaches)
  const [patientClinicId, setPatientClinicId] = useState(null);
  const [patientCity, setPatientCity] = useState('');
  const [patientCountry, setPatientCountry] = useState('india'); // Default to India
  const [recommendedCoaches, setRecommendedCoaches] = useState([]);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(true);

  // Currency mapping based on country
  const getCurrencySymbol = (country) => {
    const currencyMap = {
      'india': '₹',
      'usa': '$',
      'us': '$',
      'united states': '$',
      'uae': 'AED ',
      'dubai': 'AED ',
      'united arab emirates': 'AED ',
      'uk': '£',
      'united kingdom': '£',
      'europe': '€',
      'germany': '€',
      'france': '€',
      'australia': 'A$',
      'canada': 'C$',
      'singapore': 'S$',
    };
    return currencyMap[country?.toLowerCase()] || '₹';
  };

  // Default specialties (fallback if no data from DB)
  const defaultSpecialties = [
    'Cognitive Enhancement', 'Stress Management', 'Focus Training',
    'Memory Improvement', 'Learning Optimization', 'ADHD Support',
    'Anxiety Management', 'Sleep Optimization', 'Emotional Regulation',
    'Burnout Recovery', 'Executive Function', 'Decision Making'
  ];


  // Fetch coaching credits
  const fetchCoachingCredits = async () => {
    if (user?.email) {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const response = await fetch(`${API_URL}/coaching-credits/${encodeURIComponent(user.email)}`);
        const data = await response.json();
        if (data.success) {
          setCoachingCredits(data.total);
          setCreditDetails(data.credits || []);
        }
      } catch (error) {
        console.error('Error fetching coaching credits:', error);
      }
    }
  };

  // Fetch patient's city for location-based recommendations
  const fetchPatientClinic = async () => {
    if (user?.email) {
      try {
        const { data: patient } = await supabase
          .from('patients')
          .select('clinic_id, address')
          .eq('email', user.email.toLowerCase())
          .single();

        // Get patient's address/city for auto-recommendations
        // Extract city name from address (handles formats like "koradi nagpur maharashtra india")
        const addressText = (patient?.address || '').toLowerCase();

        // Detect country from address for currency display
        const countryKeywords = {
          'india': ['india', 'maharashtra', 'karnataka', 'tamil nadu', 'delhi', 'gujarat', 'rajasthan', 'uttar pradesh', 'west bengal', 'kerala', 'telangana', 'andhra pradesh', 'madhya pradesh', 'punjab', 'haryana', 'bihar', 'odisha', 'goa'],
          'usa': ['usa', 'united states', 'america', 'california', 'texas', 'new york', 'florida', 'illinois'],
          'uae': ['uae', 'dubai', 'abu dhabi', 'sharjah', 'united arab emirates'],
          'uk': ['uk', 'united kingdom', 'england', 'london', 'scotland', 'wales'],
          'australia': ['australia', 'sydney', 'melbourne', 'brisbane'],
          'canada': ['canada', 'toronto', 'vancouver', 'montreal'],
          'singapore': ['singapore'],
        };

        let detectedCountry = 'india'; // Default
        for (const [country, keywords] of Object.entries(countryKeywords)) {
          if (keywords.some(keyword => addressText.includes(keyword))) {
            detectedCountry = country;
            break;
          }
        }
        setPatientCountry(detectedCountry);

        // Common Indian cities to detect from address
        const commonCities = ['mumbai', 'delhi', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad', 'jaipur', 'lucknow', 'nagpur', 'indore', 'bhopal', 'chandigarh', 'coimbatore', 'kochi', 'surat', 'vadodara', 'goa'];

        // Try to find a known city in the address
        let cityName = '';
        for (const city of commonCities) {
          if (addressText.includes(city)) {
            cityName = city.charAt(0).toUpperCase() + city.slice(1); // Capitalize
            break;
          }
        }

        // Fallback: use first word if no known city found
        if (!cityName && addressText) {
          cityName = addressText.split(/[\s,]+/)[0];
          cityName = cityName.charAt(0).toUpperCase() + cityName.slice(1);
        }

        if (cityName) {
          setPatientCity(cityName);
          // Auto-fetch recommended coaches based on patient's city
          fetchRecommendedCoaches(cityName);
        } else {
          setIsLoadingRecommended(false);
        }
      } catch (error) {
        console.error('Error fetching patient clinic:', error);
        setIsLoadingRecommended(false);
      }
    } else {
      setIsLoadingRecommended(false);
    }
  };

  // Fetch recommended coaches based on patient's registered city
  const fetchRecommendedCoaches = async (cityName) => {
    if (!cityName) {
      setIsLoadingRecommended(false);
      return;
    }

    setIsLoadingRecommended(true);
    try {
      const cityCoaches = await coachService.getCoachesByCity(cityName);

      // Transform coach data
      const transformedCoaches = excludeHiddenCoaches(cityCoaches).map(coach => ({
        id: coach.id,
        name: coach.name,
        photo: coach.photo,
        credentials: coach.credentials,
        specialties: coach.specialties || [],
        modalities: coach.modalities || [],
        rating: coach.rating || 5,
        reviews: coach.reviews_count || 0,
        distance: coach.distance || null,
        isOnline: coach.is_online,
        isInPerson: coach.is_in_person,
        price: coach.price_display || `₹${coach.price}/session`,
        nextSlots: coach.next_slots || ['Contact for availability'],
        bio: coach.bio,
        languages: coach.languages || ['English'],
        experience: coach.experience,
        phone: coach.phone,
        email: coach.email,
        whatsapp: coach.whatsapp,
        calendlyUrl: CALENDLY_LINK,
        city: coach.city || null
      }));

      setRecommendedCoaches(transformedCoaches);
    } catch (error) {
      console.error('Error fetching recommended coaches:', error);
      setRecommendedCoaches([]);
    } finally {
      setIsLoadingRecommended(false);
    }
  };

  // Fetch patient clinic and coaches on component mount
  // Fetch user's paid/booked coaches
  const fetchPaidCoaches = async () => {
    if (!user?.email) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/bookings/${encodeURIComponent(user.email)}`);
      const data = await response.json();
      if (data.success && data.bookings) {
        // Extract unique coach IDs from bookings
        const coachIds = [...new Set(data.bookings.map(b => b.coach_id).filter(Boolean))];
        // Also track by coach name for coaches without ID
        const coachNames = [...new Set(data.bookings.map(b => b.coach_name?.toLowerCase()).filter(Boolean))];
        setPaidCoachIds({ ids: coachIds, names: coachNames });
      }
    } catch (error) {
      console.error('Error fetching paid coaches:', error);
    }
  };

  // Check if user has paid for a coach
  const hasUserPaidForCoach = (coach) => {
    if (!paidCoachIds || (!paidCoachIds.ids?.length && !paidCoachIds.names?.length)) return false;
    return paidCoachIds.ids?.includes(coach.id) || paidCoachIds.names?.includes(coach.name?.toLowerCase());
  };

  useEffect(() => {
    const init = async () => {
      await fetchPatientClinic();
      fetchCoaches();
      fetchSpecialties();
      fetchCoachingCredits();
      fetchPaidCoaches();
    };
    init();
  }, [user]);

  // Fetch coaches when specialty or role category filters change
  useEffect(() => {
    fetchCoaches();
  }, [selectedSpecialties, selectedRoleCategory]);

  // Debounced geocoding when user types in location input
  useEffect(() => {
    // Clear any existing timeout
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    // Don't geocode if it's "Current Location" or too short
    if (locationInput.length < 3 || locationInput === 'Current Location') {
      return;
    }

    // Set up debounced geocoding (500ms delay)
    geocodeTimeoutRef.current = setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const result = await coachService.geocodeLocation(locationInput);
        if (result) {
          setUserLocation({ lat: result.lat, lng: result.lng });
          // Extract city name from geocoded result (first part before comma)
          // e.g., "Nagpur, Maharashtra, India" -> "Nagpur"
          const cityFromGeocode = result.displayName.split(',')[0].trim();
          setGeocodedCity(cityFromGeocode);
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      } finally {
        setIsGeocoding(false);
      }
    }, 500);

    // Cleanup timeout on unmount or when locationInput changes
    return () => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    };
  }, [locationInput]);

  const fetchCoaches = async () => {
    try {
      setIsLoading(true);
      const filters = {
        format: 'all',
        specialties: selectedSpecialties.length > 0 ? selectedSpecialties : null,
        roleCategory: selectedRoleCategory,
      };

      // Always fetch all coaches regardless of location
      const data = await coachService.getCoaches(filters) || [];

      // Transform data to match component expectations
      const transformedCoaches = excludeHiddenCoaches(data).map(coach => ({
        id: coach.id,
        name: coach.name,
        photo: coach.photo,
        credentials: coach.credentials,
        specialties: coach.specialties || [],
        modalities: coach.modalities || [],
        rating: coach.rating || 5,
        reviews: coach.reviews_count || 0,
        distance: coach.distance || null,
        isOnline: coach.is_online,
        isInPerson: coach.is_in_person,
        price: coach.price_display || `₹${coach.price}/session`,
        nextSlots: coach.next_slots || ['Contact for availability'],
        bio: coach.bio,
        languages: coach.languages || ['English'],
        experience: coach.experience,
        phone: coach.phone,
        email: coach.email,
        whatsapp: coach.whatsapp,
        calendlyUrl: CALENDLY_LINK,
        city: coach.city || null
      }));

      setCoaches(transformedCoaches);
    } catch (error) {
      console.error('Error fetching coaches:', error);
      setCoaches([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSpecialties = async () => {
    try {
      const data = await coachService.getSpecialties();
      if (data && data.length > 0) {
        setSpecialtyOptions(data);
      } else {
        setSpecialtyOptions(defaultSpecialties);
      }
    } catch (error) {
      console.error('Error fetching specialties:', error);
      setSpecialtyOptions(defaultSpecialties);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      setIsLoading(true);
      try {
        let data = await coachService.searchCoaches(searchQuery);
        if (!data) data = [];

        const transformedCoaches = excludeHiddenCoaches(data).map(coach => ({
          id: coach.id,
          name: coach.name,
          photo: coach.photo,
          credentials: coach.credentials,
          specialties: coach.specialties || [],
          modalities: coach.modalities || [],
          rating: coach.rating || 5,
          reviews: coach.reviews_count || 0,
          distance: coach.distance || null,
          isOnline: coach.is_online,
          isInPerson: coach.is_in_person,
          price: coach.price_display || `₹${coach.price}/session`,
          nextSlots: coach.next_slots || ['Contact for availability'],
          bio: coach.bio,
          languages: coach.languages || ['English'],
          experience: coach.experience,
          phone: coach.phone,
          email: coach.email,
          whatsapp: coach.whatsapp,
          calendlyUrl: CALENDLY_LINK,
          city: coach.city || null
        }));
        setCoaches(transformedCoaches);
      } catch (error) {
        console.error('Error searching coaches:', error);
        setCoaches([]);
      } finally {
        setIsLoading(false);
      }
    } else {
      fetchCoaches();
    }
  };

  // Combined search for both coaches and clinics
  const handleCombinedSearch = async () => {
    if (!userLocation && !geocodedCity) return;

    setIsLoading(true);
    try {
      // Fetch coaches by location (for in-person coaches with lat/lng)
      let locationCoaches = [];
      if (userLocation) {
        locationCoaches = await coachService.getCoachesNearLocation(
          userLocation.lat,
          userLocation.lng,
          radius
        );
      }

      // Also fetch coaches by city name text match (catches online coaches & those without lat/lng)
      let cityCoaches = [];
      if (geocodedCity) {
        cityCoaches = await coachService.getCoachesByCity(geocodedCity);
      }

      // Merge and deduplicate coaches (by id)
      const allCoachesMap = new Map();
      [...locationCoaches, ...cityCoaches].forEach(coach => {
        if (!allCoachesMap.has(coach.id)) {
          allCoachesMap.set(coach.id, coach);
        }
      });
      const mergedCoaches = Array.from(allCoachesMap.values());

      // Transform coach data
      const transformedCoaches = excludeHiddenCoaches(mergedCoaches).map(coach => ({
        id: coach.id,
        name: coach.name,
        photo: coach.photo,
        credentials: coach.credentials,
        specialties: coach.specialties || [],
        modalities: coach.modalities || [],
        rating: coach.rating || 5,
        reviews: coach.reviews_count || 0,
        distance: coach.distance || null,
        isOnline: coach.is_online,
        isInPerson: coach.is_in_person,
        price: coach.price_display || `₹${coach.price}/session`,
        nextSlots: coach.next_slots || ['Contact for availability'],
        bio: coach.bio,
        languages: coach.languages || ['English'],
        experience: coach.experience,
        phone: coach.phone,
        email: coach.email,
        whatsapp: coach.whatsapp,
        calendlyUrl: CALENDLY_LINK,
        city: coach.city || null
      }));

      setCoaches(transformedCoaches);

      // Fetch clinics by city name
      let clinicResults = [];
      if (geocodedCity) {
        clinicResults = await coachService.getClinicsByCity(geocodedCity);
        setClinics(clinicResults || []);
      }

      // Auto-scroll to results if any found
      if (transformedCoaches.length > 0 || clinicResults.length > 0) {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch (error) {
      console.error('Error in combined search:', error);
      setCoaches([]);
      setClinics([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate distance helper for demo data
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  const handleFindNearMe = async () => {
    if (userLocation) {
      setIsLoading(true);
      try {
        let data = await coachService.getCoachesNearLocation(
          userLocation.lat,
          userLocation.lng,
          radius
        );
        if (!data) data = [];

        const transformedCoaches = excludeHiddenCoaches(data).map(coach => ({
          id: coach.id,
          name: coach.name,
          photo: coach.photo,
          credentials: coach.credentials,
          specialties: coach.specialties || [],
          modalities: coach.modalities || [],
          rating: coach.rating || 5,
          reviews: coach.reviews_count || 0,
          distance: coach.distance || null,
          isOnline: coach.is_online,
          isInPerson: coach.is_in_person,
          price: coach.price_display || `₹${coach.price}/session`,
          nextSlots: coach.next_slots || ['Contact for availability'],
          bio: coach.bio,
          languages: coach.languages || ['English'],
          experience: coach.experience,
          phone: coach.phone,
          email: coach.email,
          whatsapp: coach.whatsapp,
          calendlyUrl: CALENDLY_LINK,
          city: coach.city || null
        }));
        setCoaches(transformedCoaches);
      } catch (error) {
        console.error('Error finding nearby coaches:', error);
        setCoaches([]);
      } finally {
        setIsLoading(false);
      }
    } else {
      toast.error('Please share your location first by clicking "Use my location"');
    }
  };

  // Handle WhatsApp click
  const handleWhatsApp = (coach) => {
    if (coach?.whatsapp || coach?.phone) {
      const phone = (coach.whatsapp || coach.phone).replace(/[^0-9]/g, '');
      const message = encodeURIComponent(
        `Hi ${coach.name}, I found you on NeuroSense Brain Coach directory. I'm interested in scheduling a consultation. My name is ${user?.name || 'Patient'}.`
      );
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
      toast.success('Opening WhatsApp...', { duration: 2000, icon: '💬' });
    } else {
      toast.error('WhatsApp number not available for this coach');
    }
    setShowConnectModal(false);
  };

  // Handle Booking submission
  const handleBookingSubmit = async () => {
    if (!bookingData.date || !bookingData.time) {
      toast.error('Please select a date and time');
      return;
    }

    setIsSubmitting(true);
    try {
      // For demo coaches, just show success
      if (selectedCoach.id.startsWith('demo-')) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
        toast.success(`Booking request sent to ${selectedCoach.name}! They will contact you shortly.`, {
          duration: 4000,
          icon: '📅'
        });
        setShowBookingModal(false);
        setShowConnectModal(false);
        setBookingData({ date: '', time: '', format: 'online', message: '' });
        setIsSubmitting(false);
        return;
      }

      const result = await coachService.submitConnectionRequest({
        coachId: selectedCoach.id,
        patientId: user?.id,
        patientName: user?.name || 'Patient',
        patientEmail: user?.email || '',
        patientPhone: user?.phone || '',
        message: `Booking Request:\nDate: ${bookingData.date}\nTime: ${bookingData.time}\nFormat: ${bookingData.format}\nNote: ${bookingData.message || 'N/A'}`,
        requestType: 'booking'
      });

      if (result.success) {
        toast.success(`Booking request sent to ${selectedCoach.name}! They will contact you shortly.`, {
          duration: 4000,
          icon: '📅'
        });
        setShowBookingModal(false);
        setShowConnectModal(false);
        setBookingData({ date: '', time: '', format: 'online', message: '' });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Booking error:', error);
      toast.error('Failed to send booking request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Callback request
  const handleCallbackSubmit = async () => {
    if (!callbackData.phone) {
      toast.error('Please enter your phone number');
      return;
    }

    setIsSubmitting(true);
    try {
      // For demo coaches, just show success
      if (selectedCoach.id.startsWith('demo-')) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
        toast.success(`Callback request sent! ${selectedCoach.name} will call you back.`, {
          duration: 4000,
          icon: '📞'
        });
        setShowCallbackModal(false);
        setShowConnectModal(false);
        setCallbackData({ phone: '', preferredTime: '', message: '' });
        setIsSubmitting(false);
        return;
      }

      const result = await coachService.submitConnectionRequest({
        coachId: selectedCoach.id,
        patientId: user?.id,
        patientName: user?.name || 'Patient',
        patientEmail: user?.email || '',
        patientPhone: callbackData.phone,
        message: `Callback Request:\nPreferred Time: ${callbackData.preferredTime || 'Any time'}\nNote: ${callbackData.message || 'N/A'}`,
        requestType: 'callback'
      });

      if (result.success) {
        toast.success(`Callback request sent! ${selectedCoach.name} will call you back.`, {
          duration: 4000,
          icon: '📞'
        });
        setShowCallbackModal(false);
        setShowConnectModal(false);
        setCallbackData({ phone: '', preferredTime: '', message: '' });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Callback error:', error);
      toast.error('Failed to send callback request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle direct book button via WhatsApp
  const handleDirectBook = (coach) => {
    if (coach?.whatsapp || coach?.phone) {
      const phone = (coach.whatsapp || coach.phone).replace(/[^0-9]/g, '');
      const message = encodeURIComponent(
        `Hi ${coach.name}, I found you on NeuroSense Brain Coach directory. I would like to book a consultation session. My name is ${user?.name || 'Patient'}. Please let me know your available slots.`
      );
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
      toast.success('Opening WhatsApp to book...', { duration: 2000, icon: '📅' });
    } else {
      toast.error('WhatsApp number not available for this coach');
    }
  };

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentCoach, setPaymentCoach] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Tracks which coach is waiting for Calendly → payment flow
  const [pendingCalendlyCoach, setPendingCalendlyCoach] = useState(null);

  // Listen for Calendly event_scheduled postMessage
  useEffect(() => {
    const onCalendlyMessage = (e) => {
      // Calendly may send data as object or JSON string
      let payload = e.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.event !== 'calendly.event_scheduled') return;
      setShowCalendlyModal(false);
      setCalendlyIframeUrl('');

      if (!pendingCalendlyCoach) return;

      if (pendingCalendlyCoach._useFreeCredit) {
        // Free credit: proceed directly (no payment)
        proceedToCalendly(pendingCalendlyCoach, true);
      } else {
        // New booking: show payment modal after Calendly
        setPaymentCoach(pendingCalendlyCoach);
        setShowPaymentModal(true);
      }
      setPendingCalendlyCoach(null);
    };

    window.addEventListener('message', onCalendlyMessage);
    return () => window.removeEventListener('message', onCalendlyMessage);
  }, [pendingCalendlyCoach]);

  // Handle Schedule button - opens Calendly first, payment after
  const handleScheduleBooking = (coach) => {
    if (hasUserPaidForCoach(coach)) {
      toast.success('You have already paid. Opening Calendly...', { icon: '✅' });
      if (true) {
        openCalendlyPopup(CALENDLY_LINK);
      } else {
        const phone = (coach.whatsapp || coach.phone || '').replace(/[^0-9]/g, '');
        if (phone) window.open(`https://wa.me/${phone}`, '_blank');
      }
      return;
    }

    // Open Calendly first; payment (or free credit) happens after booking confirmation
    const url = CALENDLY_LINK;
    if (coachingCredits > 0) {
      setPendingCalendlyCoach({ ...coach, _useFreeCredit: true });
    } else {
      setPendingCalendlyCoach(coach);
    }
    openCalendlyPopup(url);
  };

  // Process payment via Stripe
  const handlePayment = async () => {
    if (!paymentCoach) return;

    setIsProcessingPayment(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      // Get numeric price
      const priceStr = paymentCoach.price?.toString() || '2500';
      const numericPrice = parseInt(priceStr.replace(/[^0-9]/g, '')) || 2500;

      // Create Stripe checkout session
      const response = await fetch(`${API_URL}/create-coaching-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: paymentCoach.id,
          coachName: paymentCoach.name,
          coachEmail: paymentCoach.email,
          calendlyUrl: CALENDLY_LINK,
          price: numericPrice,
          patientEmail: user?.email,
          patientName: user?.name || 'Patient',
          currency: patientCountry === 'india' ? 'inr' : 'usd'
        })
      });

      const data = await response.json();

      if (data.success && data.url) {
        const returnParams = new URLSearchParams({
          payment: 'success',
          coach: paymentCoach.name,
          ...({ calendly: CALENDLY_LINK }),
          ...(paymentCoach.email ? { coachEmail: paymentCoach.email } : {})
        });
        localStorage.setItem('paymentReturnUrl', `/dashboard/brain-coach?${returnParams.toString()}`);
        window.location.href = data.url;
      } else {
        toast.error(getFriendlyErrorMessage(data.message, 'The payment could not be started. Please try again.'));
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Failed to initialize payment. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Proceed to Calendly after payment or using free credit
  const proceedToCalendly = async (coach, useFreeCredit = false) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

      // If using free credit, deduct it
      if (useFreeCredit && user?.email) {
        await fetch(`${API_URL}/coaching-credits/use`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            coachId: coach.id,
            coachName: coach.name
          })
        });
        setCoachingCredits(prev => Math.max(0, prev - 1));
        toast.success('Free coaching credit used!', { icon: '🎁' });
      }

      // Save booking entry to database
      // Only include coach_id if it's a valid UUID format
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coach.id);
      const bookingData = {
        patient_email: user?.email?.toLowerCase(),
        patient_name: user?.name || 'Patient',
        coach_name: coach.name,
        coach_email: coach.email || null,
        event_name: 'Brain Coaching Session - 30 min',
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
        duration_minutes: 30,
        status: 'scheduled',
        location: 'Online',
        notes: useFreeCredit ? 'Booked using free credit' : 'Booked via payment'
      };
      if (isValidUUID) {
        bookingData.coach_id = coach.id;
      }

      const bookingResponse = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      const bookingResult = await bookingResponse.json();
      if (!bookingResult.success) {
        console.error('Booking save failed:', bookingResult);
      }

      // Refresh paid coaches list
      fetchPaidCoaches();

      // Open Calendly popup
      if (true) {
        toast.success('Select your preferred time slot...', { duration: 3000, icon: '📅' });
        openCalendlyPopup(CALENDLY_LINK);
      } else {
        const phone = (coach.whatsapp || coach.phone || '').replace(/[^0-9]/g, '');
        if (phone) {
          const message = encodeURIComponent(
            `Hi ${coach.name}, I found you on NeuroSense. I would like to schedule a consultation session.`
          );
          window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      if (true) {
        openCalendlyPopup(CALENDLY_LINK);
      }
    }
  };

  // Filter coaches based on criteria
  const filteredCoaches = coaches.filter(coach => {
    // Specialty filter
    if (selectedSpecialties.length > 0) {
      const hasSpecialty = selectedSpecialties.some(s => coach.specialties.includes(s));
      if (!hasSpecialty) return false;
    }

    return true;
  });

  // Get user location using browser GPS (accurate location)
  const handleUseMyLocation = async () => {
    if (!navigator.geolocation) {
      toast.error('GPS not supported in your browser.');
      return;
    }

    // Check current permission status
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });

        if (permission.state === 'denied') {
          toast((t) => (
            <div className="flex flex-col gap-2">
              <p className="font-medium">Location access is blocked</p>
              <p className="text-sm text-gray-600">To enable:</p>
              <ol className="text-sm text-gray-600 list-decimal ml-4">
                <li>Click 🔒 icon in address bar</li>
                <li>Find "Location" setting</li>
                <li>Change to "Allow"</li>
                <li>Refresh the page</li>
              </ol>
              <button
                onClick={() => toast.dismiss(t.id)}
                className="mt-2 px-3 py-1 bg-gray-200 rounded text-sm"
              >
                Got it
              </button>
            </div>
          ), { duration: 10000 });
          return;
        }
      } catch (e) {
        // Permissions API not supported, continue anyway
      }
    }

    setIsLocating(true);

    // Request location - this will prompt user if not already allowed
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { lat: latitude, lng: longitude };
        setUserLocation(newLocation);

        // Reverse geocode to get city name
        let cityName = '';
        try {
          cityName = await coachService.reverseGeocode(latitude, longitude);
          if (cityName) {
            setGeocodedCity(cityName);
            setLocationInput(cityName);
          }
        } catch (error) {
          console.error('Reverse geocode error:', error);
        }

        setIsLocating(false);
        toast.success(`Location detected: ${cityName || 'Your location'}! Searching nearby...`, {
          duration: 3000,
          icon: '📍'
        });

        // Trigger search
        searchWithLocation(newLocation, cityName);
      },
      (error) => {
        console.error('GPS error:', error);
        setIsLocating(false);

        if (error.code === 1) {
          toast((t) => (
            <div className="flex flex-col gap-2">
              <p className="font-medium">Please allow location access</p>
              <p className="text-sm text-gray-600">Click "Allow" when browser asks for location permission.</p>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  handleUseMyLocation(); // Retry
                }}
                className="mt-2 px-3 py-1 bg-blue-500 text-white rounded text-sm"
              >
                Try Again
              </button>
            </div>
          ), { duration: 8000 });
        } else {
          toast.error('Unable to get location. Please enter city manually.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Search with specific location and city (used by "Use my location" button)
  const searchWithLocation = async (location, cityName) => {
    setIsLoading(true);
    try {
      // Fetch coaches by location (for in-person coaches with lat/lng)
      let locationCoaches = [];
      if (location) {
        locationCoaches = await coachService.getCoachesNearLocation(
          location.lat,
          location.lng,
          radius
        );
      }

      // Also fetch coaches by city name
      let cityCoaches = [];
      if (cityName) {
        cityCoaches = await coachService.getCoachesByCity(cityName);
      }

      // Merge and deduplicate coaches (by id)
      const allCoachesMap = new Map();
      [...locationCoaches, ...cityCoaches].forEach(coach => {
        if (!allCoachesMap.has(coach.id)) {
          allCoachesMap.set(coach.id, coach);
        }
      });
      const mergedCoaches = Array.from(allCoachesMap.values());

      // Transform coach data
      const transformedCoaches = excludeHiddenCoaches(mergedCoaches).map(coach => ({
        id: coach.id,
        name: coach.name,
        photo: coach.photo,
        credentials: coach.credentials,
        specialties: coach.specialties || [],
        modalities: coach.modalities || [],
        rating: coach.rating || 5,
        reviews: coach.reviews_count || 0,
        distance: coach.distance || null,
        isOnline: coach.is_online,
        isInPerson: coach.is_in_person,
        price: coach.price_display || `₹${coach.price}/session`,
        nextSlots: coach.next_slots || ['Contact for availability'],
        bio: coach.bio,
        languages: coach.languages || ['English'],
        experience: coach.experience,
        phone: coach.phone,
        email: coach.email,
        whatsapp: coach.whatsapp,
        calendlyUrl: CALENDLY_LINK,
        city: coach.city || null
      }));

      setCoaches(transformedCoaches);

      // Fetch clinics by city name
      let clinicResults = [];
      if (cityName) {
        clinicResults = await coachService.getClinicsByCity(cityName);
        setClinics(clinicResults || []);
      }

      // Auto-scroll to results if any found
      if (transformedCoaches.length > 0 || clinicResults.length > 0) {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch (error) {
      console.error('Error in location search:', error);
      setCoaches([]);
      setClinics([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Coach Card Component
  const CoachCard = ({ coach }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full">
      {/* Card Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start space-x-3 sm:space-x-4">
          {/* Photo */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#323956] to-[#4a5578] flex items-center justify-center flex-shrink-0">
            {coach.photo ? (
              <img
                src={coach.photo}
                alt={coach.name}
                className="w-full h-full object-cover rounded-lg sm:rounded-xl"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
              />
            ) : null}
            <User
              className="h-8 w-8 sm:h-10 sm:w-10 text-white"
              style={{ display: coach.photo ? 'none' : 'block' }}
            />
          </div>

          {/* Basic Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white truncate">{coach.name}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{coach.credentials}</p>
              </div>
              {/* Price with Lock/Unlock Icon */}
              <div className="text-right flex-shrink-0">
                <div className="flex items-center justify-end space-x-1">
                  {hasUserPaidForCoach(coach) ? (
                    <Unlock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
                  ) : (
                    <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
                  )}
                  <p className="font-bold text-sm sm:text-base text-[#323956] dark:text-blue-400">
                    {(() => {
                      const priceStr = coach.price?.toString() || '';
                      const numericPrice = priceStr.replace(/[^0-9.]/g, '');
                      const currencySymbol = getCurrencySymbol(patientCountry);
                      const suffix = priceStr.includes('/') ? priceStr.substring(priceStr.indexOf('/')) : '';
                      return `${currencySymbol}${numericPrice}${suffix}`;
                    })()}
                  </p>
                </div>
                <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">
                  {hasUserPaidForCoach(coach) ? 'Paid ✓' : 'per session'}
                </p>
              </div>
            </div>

            {/* Rating & Reviews */}
            <div className="flex items-center space-x-2 mt-1">
              <div className="flex items-center space-x-1">
                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 fill-yellow-500" />
                <span className="font-semibold text-sm text-gray-900 dark:text-white">{coach.rating}</span>
              </div>
              <span className="text-gray-400 text-xs">•</span>
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{coach.reviews} reviews</span>
            </div>

            {/* Format & Distance */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
              {coach.isInPerson && (
                <span className="flex items-center space-x-1 text-[10px] sm:text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span>{coach.distance ? `${coach.distance} km` : 'In-Person'}</span>
                </span>
              )}
              {coach.isOnline && (
                <span className="flex items-center space-x-1 text-[10px] sm:text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                  <Monitor className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span>Online</span>
                </span>
              )}
            </div>

            {/* Location */}
            {coach.city && (
              <div className="flex items-center mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 text-[#323956] dark:text-blue-400" />
                <span className="truncate">{coach.city}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Specialties */}
      <div className="px-4 sm:px-5 pb-2 sm:pb-3">
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          {coach.specialties.map((specialty, idx) => (
            <span
              key={idx}
              className="text-[10px] sm:text-xs bg-[#E4EFFF] dark:bg-blue-900/20 text-[#323956] dark:text-blue-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full"
            >
              {specialty}
            </span>
          ))}
        </div>
      </div>

      {/* Next Available Slots */}
      <div className="px-4 sm:px-5 pb-3 sm:pb-4 flex-grow">
        <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">Next available:</p>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {coach.nextSlots.slice(0, 3).map((slot, idx) => (
            <span
              key={idx}
              className="text-[10px] sm:text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg"
            >
              {slot}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex gap-2 sm:gap-3 mt-auto">
        <button
          onClick={() => setSelectedCoach(coach)}
          className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          View
        </button>
        <button
          onClick={() => {
            setPaymentCoach(coach);
            handlePayment();
          }}
          disabled={isProcessingPayment}
          className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-1.5"
        >
          <Calendar className="h-4 w-4" />
          <span>{isProcessingPayment ? 'Processing...' : 'Book Your Session'}</span>
        </button>
      </div>
    </div>
  );

  // Clinic Card Component
  const ClinicCard = ({ clinic }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full">
      {/* Card Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start space-x-3 sm:space-x-4">
          {/* Icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
            {clinic.logo ? (
              <img src={clinic.logo} alt={clinic.name} className="w-full h-full object-cover rounded-lg sm:rounded-xl" />
            ) : (
              <Building2 className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            )}
          </div>

          {/* Basic Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white line-clamp-2">{clinic.name}</h3>
          </div>
        </div>
      </div>

      {/* Address */}
      {clinic.address && (
        <div className="px-4 sm:px-5 pb-2">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {clinic.address}
          </p>
        </div>
      )}

      {/* Contact Info */}
      <div className="px-4 sm:px-5 pb-3 sm:pb-4 flex-grow">
        <div className="space-y-2">
          {clinic.phone && (
            <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              <Phone className="h-3.5 w-3.5" />
              <span>{clinic.phone}</span>
            </div>
          )}
          {clinic.email && (
            <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{clinic.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex gap-2 sm:gap-3 mt-auto">
        {clinic.phone && (
          <a
            href={`tel:${clinic.phone}`}
            className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-white bg-[#323956] rounded-lg hover:bg-[#232D3C] transition-colors flex items-center justify-center space-x-1.5"
          >
            <Phone className="h-4 w-4" />
            <span>Call</span>
          </a>
        )}
        {clinic.email && (
          <a
            href={`mailto:${clinic.email}`}
            className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center space-x-1.5"
          >
            <Mail className="h-4 w-4" />
            <span>Email</span>
          </a>
        )}
        {(clinic.whatsapp || clinic.phone) && (
          <button
            onClick={() => {
              const phone = (clinic.whatsapp || clinic.phone).replace(/[^0-9]/g, '');
              const message = encodeURIComponent(
                `Hi, I found your clinic on NeuroSense360. I would like to inquire about your services.`
              );
              window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
            }}
            className="flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-1.5"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </button>
        )}
      </div>
    </div>
  );

  // Connect Modal
  const ConnectModal = () => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Connect with {selectedCoach?.name?.split(' ')[0]}</h2>
            <button
              onClick={() => setShowConnectModal(false)}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

          {/* Connect Options */}
          <div className="space-y-2 sm:space-y-3">
            <button
              onClick={() => {
                setShowConnectModal(false);
                handleDirectBook(selectedCoach);
              }}
              className="w-full flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-lg sm:rounded-xl hover:bg-[#CAE0FF] dark:hover:bg-blue-900/50 transition-colors"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#323956] flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Book Consultation</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Book via WhatsApp</p>
              </div>
            </button>

            <button
              onClick={() => handleWhatsApp(selectedCoach)}
              className="w-full flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg sm:rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Message / WhatsApp</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Chat on WhatsApp</p>
              </div>
            </button>

            <button
              onClick={() => {
                handleScheduleBooking(selectedCoach);
                setShowConnectModal(false);
              }}
              className="w-full flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg sm:rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Schedule Meeting</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Book a time slot</p>
              </div>
            </button>

            <button
              onClick={() => {
                setShowConnectModal(false);
                setShowCallbackModal(true);
              }}
              className="w-full flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg sm:rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                <Phone className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">Request Callback</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Coach will call you back</p>
              </div>
            </button>
          </div>

          {/* Coach Quick Info */}
          {selectedCoach && (
            <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg sm:rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[#323956] to-[#4a5578] flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">{selectedCoach.name}</p>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    {(() => {
                      const priceStr = selectedCoach.price?.toString() || '';
                      const numericPrice = priceStr.replace(/[^0-9.]/g, '');
                      const currencySymbol = getCurrencySymbol(patientCountry);
                      const suffix = priceStr.includes('/') ? priceStr.substring(priceStr.indexOf('/')) : '';
                      return `${currencySymbol}${numericPrice}${suffix}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Payment Modal Component
  const PaymentModal = () => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60">
      <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header with Step Indicator */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] px-4 py-4 text-white relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-white/10 rounded-full"></div>
          <div className="absolute -bottom-5 -left-5 w-16 h-16 bg-white/5 rounded-full"></div>

          <div className="relative">
            {/* Step & Close */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-yellow-400 text-[#323956] rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold">1</span>
                </div>
                <span className="text-xs text-blue-200">Step 1 of 2</span>
              </div>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentCoach(null);
                }}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Title */}
            <div className="flex items-start space-x-2">
              <Sparkles className="w-4 h-4 text-yellow-300 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold leading-tight">
                  Complete this Step to Meet Your Coach
                </h2>
                <p className="text-blue-200 text-[11px] mt-0.5">Get your Coaching Bundle to schedule a session</p>
              </div>
            </div>
          </div>
        </div>

        {paymentCoach && (
          <div className="px-4 py-3 space-y-3">
            {/* Coach Info Card */}
            <div className="flex items-center p-2.5 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-700 dark:to-gray-700 rounded-lg border border-slate-200 dark:border-gray-600">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#323956] to-[#4a5578] flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0">
                {paymentCoach.name?.charAt(0) || 'C'}
              </div>
              <div className="flex-1 ml-2.5 min-w-0">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{paymentCoach.name}</h3>
                <p className="text-[10px] text-gray-500 truncate">{paymentCoach.credentials}</p>
                <div className="flex items-center mt-0.5">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="text-[10px] text-gray-600 dark:text-gray-400 ml-1">{paymentCoach.rating} rating</span>
                </div>
              </div>
              <div className="flex flex-col items-center ml-2 flex-shrink-0">
                <div className="w-7 h-7 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <Unlock className="w-3.5 h-3.5 text-green-500" />
                </div>
                <span className="text-[9px] text-green-600 font-semibold mt-0.5">Ready</span>
              </div>
            </div>

            {/* Coaching Bundle Box */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-amber-100 dark:bg-amber-800/30 rounded-md flex items-center justify-center">
                    <Gift className="w-3 h-3 text-amber-600" />
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">Coaching Bundle</h4>
                </div>
                <span className="bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-semibold uppercase">Recommended</span>
              </div>
              <ul className="space-y-1.5">
                <li className="flex items-center text-[11px] text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                  <span>30-minute 1-on-1 coaching session</span>
                </li>
                <li className="flex items-center text-[11px] text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                  <span>Online video call via Calendly</span>
                </li>
                <li className="flex items-center text-[11px] text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                  <span>Personalized brain health guidance</span>
                </li>
                <li className="flex items-center text-[11px] text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 mr-2 flex-shrink-0" />
                  <span>Follow-up action plan</span>
                </li>
              </ul>
            </div>

            {/* Price Section */}
            <div className="bg-slate-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">Bundle Price</span>
                  <p className="text-xl font-bold text-[#323956] dark:text-blue-400 leading-none mt-0.5">
                    {(() => {
                      const priceStr = paymentCoach.price?.toString() || '₹2500';
                      const numericPrice = priceStr.replace(/[^0-9]/g, '');
                      const currencySymbol = getCurrencySymbol(patientCountry);
                      return `${currencySymbol}${parseInt(numericPrice).toLocaleString('en-IN')}`;
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 line-through">₹3,500</span>
                  <p className="text-[10px] text-green-600 font-semibold">Save 33%</p>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex items-center justify-center space-x-4">
              <div className="flex items-center text-[9px] text-gray-500">
                <Shield className="w-3 h-3 mr-1 text-green-500" />
                <span>Secure</span>
              </div>
              <div className="flex items-center text-[9px] text-gray-500">
                <CreditCard className="w-3 h-3 mr-1 text-blue-500" />
                <span>Stripe</span>
              </div>
              <div className="flex items-center text-[9px] text-gray-500">
                <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                <span>Instant Access</span>
              </div>
            </div>

            {/* Buttons - Side by Side */}
            <div className="flex gap-2.5">
              {/* Cancel Button */}
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentCoach(null);
                }}
                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>

              {/* Payment Button */}
              <button
                onClick={handlePayment}
                disabled={isProcessingPayment}
                className="flex-[2] py-2.5 bg-gradient-to-r from-[#323956] to-[#4a5578] text-white font-semibold rounded-lg hover:from-[#232d3c] hover:to-[#3a4568] transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 shadow-md text-sm"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Pay & Continue</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Coach Profile Modal
  const ProfileModal = () => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto relative">
        {selectedCoach && (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] p-4 sm:p-6 text-white rounded-t-2xl relative">
              <button
                onClick={() => setSelectedCoach(null)}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 bg-white/20 rounded-lg hover:bg-white/30"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-lg sm:rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <User className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold truncate">{selectedCoach.name}</h2>
                  <p className="text-blue-200 text-xs sm:text-sm line-clamp-1">{selectedCoach.credentials}</p>
                  <div className="flex items-center space-x-2 mt-1 sm:mt-2">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-yellow-400" />
                    <span className="font-semibold text-sm sm:text-base">{selectedCoach.rating}</span>
                    <span className="text-blue-200 text-xs sm:text-sm">({selectedCoach.reviews} reviews)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Bio */}
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2">About</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{selectedCoach.bio}</p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Experience</p>
                  <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white">{selectedCoach.experience}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Languages</p>
                  <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white truncate">{selectedCoach.languages.join(', ')}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Session Fee</p>
                  <p className="font-semibold text-xs sm:text-sm text-[#323956] dark:text-blue-400">
                    {(() => {
                      const priceStr = selectedCoach.price?.toString() || '';
                      const numericPrice = priceStr.replace(/[^0-9.]/g, '');
                      const currencySymbol = getCurrencySymbol(patientCountry);
                      const suffix = priceStr.includes('/') ? priceStr.substring(priceStr.indexOf('/')) : '';
                      return `${currencySymbol}${numericPrice}${suffix}`;
                    })()}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 sm:p-3">
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Format</p>
                  <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white">
                    {[selectedCoach.isInPerson && 'In-Person', selectedCoach.isOnline && 'Online'].filter(Boolean).join(' / ')}
                  </p>
                </div>
                {selectedCoach.city && (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 sm:p-3 col-span-2">
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Location</p>
                    <p className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white flex items-center">
                      <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1 text-[#323956] dark:text-blue-400" />
                      {selectedCoach.city}
                    </p>
                  </div>
                )}
              </div>

              {/* Specialties */}
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2">Specialties</h3>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {selectedCoach.specialties.map((s, idx) => (
                    <span key={idx} className="px-2 sm:px-3 py-0.5 sm:py-1 bg-[#E4EFFF] dark:bg-blue-900/30 text-[#323956] dark:text-blue-300 rounded-full text-[10px] sm:text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Modalities */}
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2">Modalities</h3>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {selectedCoach.modalities.map((m, idx) => (
                    <span key={idx} className="px-2 sm:px-3 py-0.5 sm:py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-[10px] sm:text-sm">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Next Available */}
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white mb-1.5 sm:mb-2">Next Available Slots</h3>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {selectedCoach.nextSlots.map((slot, idx) => (
                    <button key={idx} className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-[#E4EFFF] dark:hover:bg-blue-900/30 transition-colors text-[10px] sm:text-sm">
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* External Programs Notice */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 sm:p-4">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <Info className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800 dark:text-amber-300 text-xs sm:text-sm">External Coaching Programs</h4>
                    <p className="text-amber-700 dark:text-amber-400 text-[10px] sm:text-xs mt-1">
                      Coach programs and packages are offered independently and are not part of the NeuroSense360 patient dashboard courses. Please discuss pricing and program details directly with your coach.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-600 space-y-2">
                <button
                  onClick={() => handleDirectBook(selectedCoach)}
                  className="w-full py-3 sm:py-4 font-medium text-sm sm:text-base text-white bg-green-500 rounded-lg sm:rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span>Book via WhatsApp</span>
                </button>
                <button
                  onClick={() => handleScheduleBooking(selectedCoach)}
                  className="w-full py-3 sm:py-4 font-medium text-sm sm:text-base text-white bg-blue-500 rounded-lg sm:rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Calendar className="h-5 w-5" />
                  <span>Schedule Meeting</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/30 to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <button
            onClick={() => navigate('/dashboard/goals')}
            className="flex items-center space-x-2 text-blue-200 hover:text-white mb-3 sm:mb-4 transition-colors text-sm sm:text-base"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Back</span>
          </button>

          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="bg-white/20 rounded-lg sm:rounded-xl p-2.5 sm:p-3">
              <Brain className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Book a Coach</h1>
              <p className="text-blue-200 mt-0.5 sm:mt-1 text-xs sm:text-sm md:text-base">
                Holistic development based on your NeuroSense results
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">

        {/* Free Coaching Credit Banner */}
        {coachingCredits > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 rounded-full p-2">
                  <Gift className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">You have {coachingCredits} free coaching session{coachingCredits > 1 ? 's' : ''}!</h3>
                  <p className="text-green-100 text-sm">Included with your assessment purchase. Book now via WhatsApp.</p>
                </div>
              </div>
              <Sparkles className="h-8 w-8 text-yellow-300" />
            </div>
          </div>
        )}

        {/* Complimentary Session Banner */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] rounded-xl p-4 sm:p-5 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 rounded-full p-2.5 flex-shrink-0">
                <Gift className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg">Complimentary Session Included!</h3>
                <p className="text-blue-200 text-xs sm:text-sm mt-0.5">
                  Every Neurosense purchase includes a free coaching session with our expert team.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
              <button
                onClick={() => window.open('https://w.app/protectmybrain', '_blank')}
                className="px-5 py-2.5 bg-white text-[#323956] font-semibold rounded-lg hover:bg-blue-50 transition-colors text-sm flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Inquire Now
              </button>
              <button
                onClick={() => window.open('https://wa.me/971501382897?text=' + encodeURIComponent('Hi, I would like to request a consultation with a Psychologist from Limitless Brain Lab. Please share the available slots.'), '_blank')}
                className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors text-sm flex items-center gap-2"
              >
                <UserCheck className="h-4 w-4" />
                Request Psychologist Consultation
              </button>
            </div>
          </div>
        </div>

        {/* Format Toggle & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          {/* All coaches shown */}
          <div></div>

          {/* View & Filter Controls */}
          <div className="flex items-center justify-between sm:justify-end space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 rounded-lg border transition-all text-xs sm:text-sm ${
                showFilters
                  ? 'bg-[#323956] text-white border-[#323956]'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}
            >
              <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Filters</span>
            </button>

            <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-[#E4EFFF] dark:bg-blue-900/30 text-[#323956]' : 'text-gray-400'}`}
              >
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-2 ${viewMode === 'map' ? 'bg-[#E4EFFF] dark:bg-blue-900/30 text-[#323956]' : 'text-gray-400'}`}
              >
                <MapIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Specialty Filters */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-md border border-gray-200 dark:border-gray-700">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">Specialties</h3>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {specialtyOptions.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => {
                    setSelectedSpecialties(prev =>
                      prev.includes(specialty)
                        ? prev.filter(s => s !== specialty)
                        : [...prev, specialty]
                    );
                  }}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-sm transition-all ${
                    selectedSpecialties.includes(specialty)
                      ? 'bg-[#323956] text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {specialty}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Role Category Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {ROLE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedRoleCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedRoleCategory === cat
                  ? 'bg-[#323956] text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results Header */}
        <div ref={resultsRef} className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">
                {filteredCoaches.length}
              </span> coaches found
            </p>
          </div>
        </div>

        {/* Coach List / Map View */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16">
            <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 text-[#323956] animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">Loading coaches...</p>
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 sm:p-12 text-center">
            <Brain className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">No coaches found</h3>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">
              Try adjusting your filters to find more coaches.
            </p>
            <button
              onClick={() => {
                setSelectedSpecialties([]);
                fetchCoaches();
              }}
              className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors text-sm sm:text-base"
            >
              Clear Filters
            </button>
          </div>
        ) : viewMode === 'list' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {filteredCoaches.map((coach) => (
              <CoachCard key={coach.id} coach={coach} />
            ))}
          </div>
        ) : (
          /* Map View Placeholder */
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="h-[300px] sm:h-[400px] lg:h-[500px] bg-gray-100 dark:bg-gray-700 flex items-center justify-center p-4">
              <div className="text-center">
                <MapIcon className="h-12 w-12 sm:h-16 sm:w-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
                <p className="text-base sm:text-lg font-medium text-gray-600 dark:text-gray-400">Map View</p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                  Interactive map with coach locations will appear here
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-2">
                  Click on pins to view coach details
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Nearby Clinics Section - Shows when GPS location detected clinics */}
        {geocodedCity && clinics.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
              <span>Nearby Clinics in {geocodedCity}</span>
              <span className="ml-2 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                {clinics.length} found
              </span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {clinics.map((clinic) => (
                <ClinicCard key={clinic.id} clinic={clinic} />
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg sm:rounded-xl p-3 sm:p-4 flex items-start space-x-2 sm:space-x-3">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
              <strong>Disclaimer:</strong> Brain coaching is educational and supportive in nature—it is not a substitute for medical care, therapy, or psychiatric treatment. If you have a medical or mental health condition, please consult a licensed healthcare provider.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedCoach && !showConnectModal && !showBookingModal && !showCallbackModal && <ProfileModal />}
      {showConnectModal && <ConnectModal />}

      {/* Payment Modal */}
      {/* Coaching Payment Success Popup */}
      {showCoachPaymentSuccess && coachPaymentDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-9 w-9 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
              <p className="text-green-100 text-sm mt-1">Your coaching session is ready to schedule</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500">Coach</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{coachPaymentDetails.coachName}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500">Amount Paid</span>
                <span className="text-sm font-semibold text-green-600">{coachPaymentDetails.amount}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate ml-2">{coachPaymentDetails.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500">Date & Time</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{coachPaymentDetails.date}, {coachPaymentDetails.time}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Transaction ID</span>
                <span className="text-xs font-mono text-gray-500 truncate ml-2 max-w-[180px]">{coachPaymentDetails.transactionId}</span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => {
                  setShowCoachPaymentSuccess(false);
                  if (paidCalendlyUrl) {
                    openCalendlyPopup(paidCalendlyUrl);
                  }
                }}
                className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Schedule Your Session
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && <PaymentModal />}

      {/* Calendly iframe Modal */}
      {showCalendlyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-[95vw] max-w-[960px] h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-gray-800 dark:text-white">Schedule Your Session</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Shown after user books — fallback if postMessage doesn't fire */}
                {pendingCalendlyCoach && (
                  <button
                    onClick={() => {
                      setShowCalendlyModal(false);
                      setCalendlyIframeUrl('');
                      if (pendingCalendlyCoach._useFreeCredit) {
                        proceedToCalendly(pendingCalendlyCoach, true);
                      } else {
                        setPaymentCoach(pendingCalendlyCoach);
                        setShowPaymentModal(true);
                      }
                      setPendingCalendlyCoach(null);
                    }}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Scheduled? Pay Now
                  </button>
                )}
                <button
                  onClick={() => { setShowCalendlyModal(false); setCalendlyIframeUrl(''); setPendingCalendlyCoach(null); }}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div
              ref={calendlyContainerRef}
              style={{ flex: 1, minHeight: 0, width: '100%', height: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && selectedCoach && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Book Consultation</h2>
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>

              {/* Coach Info */}
              <div className="flex items-center space-x-3 p-3 bg-[#E4EFFF] dark:bg-blue-900/30 rounded-xl mb-4">
                <div className="w-12 h-12 rounded-full bg-[#323956] flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedCoach.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {(() => {
                      const priceStr = selectedCoach.price?.toString() || '';
                      const numericPrice = priceStr.replace(/[^0-9.]/g, '');
                      const currencySymbol = getCurrencySymbol(patientCountry);
                      const suffix = priceStr.includes('/') ? priceStr.substring(priceStr.indexOf('/')) : '';
                      return `${currencySymbol}${numericPrice}${suffix}`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Booking Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    value={bookingData.date}
                    onChange={(e) => setBookingData({ ...bookingData, date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Preferred Time
                  </label>
                  <select
                    value={bookingData.time}
                    onChange={(e) => setBookingData({ ...bookingData, time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                  >
                    <option value="">Select time</option>
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="12:00 PM">12:00 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="03:00 PM">03:00 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                    <option value="05:00 PM">05:00 PM</option>
                    <option value="06:00 PM">06:00 PM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session Format
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBookingData({ ...bookingData, format: 'online' })}
                      className={`flex-1 py-2 rounded-lg border transition-all ${
                        bookingData.format === 'online'
                          ? 'bg-[#323956] text-white border-[#323956]'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <Monitor className="h-4 w-4 inline mr-1" /> Online
                    </button>
                    <button
                      onClick={() => setBookingData({ ...bookingData, format: 'in-person' })}
                      disabled={!selectedCoach.isInPerson}
                      className={`flex-1 py-2 rounded-lg border transition-all ${
                        bookingData.format === 'in-person'
                          ? 'bg-[#323956] text-white border-[#323956]'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      } ${!selectedCoach.isInPerson ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <MapPin className="h-4 w-4 inline mr-1" /> In-Person
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={bookingData.message}
                    onChange={(e) => setBookingData({ ...bookingData, message: e.target.value })}
                    placeholder="Any specific concerns or goals..."
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowBookingModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBookingSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Request Booking'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Callback Modal */}
      {showCallbackModal && selectedCoach && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Request Callback</h2>
                <button
                  onClick={() => setShowCallbackModal(false)}
                  className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              </div>

              {/* Coach Info */}
              <div className="flex items-center space-x-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl mb-4">
                <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedCoach.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Will call you back</p>
                </div>
              </div>

              {/* Callback Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Your Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={callbackData.phone}
                    onChange={(e) => setCallbackData({ ...callbackData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Preferred Time for Callback
                  </label>
                  <select
                    value={callbackData.preferredTime}
                    onChange={(e) => setCallbackData({ ...callbackData, preferredTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Any time</option>
                    <option value="Morning (9AM - 12PM)">Morning (9AM - 12PM)</option>
                    <option value="Afternoon (12PM - 4PM)">Afternoon (12PM - 4PM)</option>
                    <option value="Evening (4PM - 7PM)">Evening (4PM - 7PM)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Brief Note (Optional)
                  </label>
                  <textarea
                    value={callbackData.message}
                    onChange={(e) => setCallbackData({ ...callbackData, message: e.target.value })}
                    placeholder="What would you like to discuss?"
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCallbackModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCallbackSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    'Request Callback'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainCoach;
