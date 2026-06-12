import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../utils/friendlyError';
import FeatureGate from '../components/access/FeatureGate';
import {
  Music,
  Play,
  Pause,
  Moon,
  Waves,
  ChevronLeft,
  Sparkles,
  Zap,
  Lightbulb,
  Eye,
  Headphones,
  Heart,
  Clock,
  Volume2,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  TrendingUp,
  Lock,
  ShoppingCart,
  ExternalLink,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const FrequenciesMusic = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [expandedPack, setExpandedPack] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [listeningStats, setListeningStats] = useState({
    totalSessions: 0,
    thisWeek: 0,
    favoriteFrequency: null
  });
  const [playingTrack, setPlayingTrack] = useState(null);
  const [purchasedPacks, setPurchasedPacks] = useState([]);
  const [isProcessingPayment, setIsProcessingPayment] = useState(null);
  const [userLocation, setUserLocation] = useState({ country: 'IN', currency: 'INR', symbol: '₹', packPrice: 399, originalPrice: 699 });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPack, setSelectedPack] = useState(null);
  const [paymentName, setPaymentName] = useState('');
  const [paymentEmail, setPaymentEmail] = useState('');
  const [showPaymentSuccessPopup, setShowPaymentSuccessPopup] = useState(false);
  const [paymentSuccessDetails, setPaymentSuccessDetails] = useState(null);
  const [purchasedPackId, setPurchasedPackId] = useState(null);

  // Currency and pricing configuration by country
  const currencyConfig = {
    IN: { currency: 'INR', symbol: '₹', packPrice: 399, originalPrice: 699 },
    US: { currency: 'USD', symbol: '$', packPrice: 29, originalPrice: 49 },
    GB: { currency: 'GBP', symbol: '£', packPrice: 24, originalPrice: 39 },
    AE: { currency: 'AED', symbol: 'AED ', packPrice: 99, originalPrice: 179 },
    EU: { currency: 'EUR', symbol: '€', packPrice: 27, originalPrice: 45 },
  };

  // Detect user location
  useEffect(() => {
    const detectLocation = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const countryCode = data.country_code;
        const euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR'];
        let configKey = 'US';
        if (currencyConfig[countryCode]) {
          configKey = countryCode;
        } else if (euCountries.includes(countryCode)) {
          configKey = 'EU';
        }
        setUserLocation({ country: configKey, ...currencyConfig[configKey] });
      } catch (error) {
      }
    };
    detectLocation();
  }, []);

  // Fetch purchased packs from frequency_purchases and patient_payments
  const fetchPurchasedPacks = async () => {
    if (!user?.email) return;
    try {
      const allPackIds = [];

      // Try pack_id column first
      const { data: d1, error: e1 } = await supabase
        .from('frequency_purchases')
        .select('pack_id')
        .eq('patient_email', user.email.toLowerCase());
      if (!e1 && d1) {
        allPackIds.push(...d1.map(p => p.pack_id).filter(Boolean));
      }

      // Also try frequency_id column (alternate schema)
      if (!d1 || d1.length === 0) {
        const { data: d2, error: e2 } = await supabase
          .from('frequency_purchases')
          .select('frequency_id')
          .eq('patient_email', user.email.toLowerCase());
        if (!e2 && d2) {
          allPackIds.push(...d2.map(p => p.frequency_id).filter(Boolean));
        }
      }

      // Also check patient_payments for frequency type purchases
      const { data: d3 } = await supabase
        .from('patient_payments')
        .select('assessment_id')
        .eq('patient_email', user.email.toLowerCase())
        .eq('type', 'frequency');
      if (d3) {
        allPackIds.push(...d3.map(p => p.assessment_id).filter(Boolean));
      }

      setPurchasedPacks([...new Set(allPackIds)]);
    } catch (error) {
      console.error('Error fetching purchases:', error);
    }
  };

  useEffect(() => {
    if (user?.email) {
      fetchPurchasedPacks();
    }
  }, [user?.email]);

  // Open payment modal
  const handlePurchase = (packId, packName, packPrice) => {
    if (!user?.email) {
      toast.error('Please log in to make a purchase');
      return;
    }
    const pack = frequencyPacks.find(p => p.id === packId);
    setSelectedPack(pack);
    setPaymentEmail(user.email || '');
    setPaymentName('');
    setShowPaymentModal(true);
  };

  // Process Stripe payment from modal
  const handleStripePayment = async () => {
    if (!paymentEmail) {
      toast.error('Please enter your email address');
      return;
    }
    if (!selectedPack) return;
    setIsProcessingPayment(selectedPack.id);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      // Save return URL so auth can redirect back after Stripe
      localStorage.setItem('paymentReturnUrl', `/dashboard/frequencies?payment=success&pack=${selectedPack.id}`);

      const response = await fetch(`${API_URL}/create-frequency-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packId: selectedPack.id,
          packName: selectedPack.name,
          customerEmail: paymentEmail,
          customerName: paymentName.toUpperCase(),
          currency: 'USD',
          amount: selectedPack.price,
          successUrl: `${window.location.origin}/dashboard/frequencies?payment=success&pack=${selectedPack.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/dashboard/frequencies?payment=cancelled`
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
      setIsProcessingPayment(null);
    }
  };

  // Check for successful payment on mount
  useEffect(() => {
    if (!user?.email) return;

    // Check URL params first
    const urlParams = new URLSearchParams(window.location.search);
    let paymentPackId = urlParams.get('pack');
    let paymentSessionId = urlParams.get('session_id');
    const paymentStatus = urlParams.get('payment');

    // If URL has payment params, save to localStorage and clear URL
    if (paymentStatus === 'success' && paymentPackId) {
      localStorage.setItem('pendingFreqPayment', JSON.stringify({ packId: paymentPackId, sessionId: paymentSessionId }));
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem('paymentReturnUrl');
    }

    // Check localStorage for pending payment
    const pending = localStorage.getItem('pendingFreqPayment');
    if (!pending) return;

    const { packId: pId, sessionId: sId } = JSON.parse(pending);
    localStorage.removeItem('pendingFreqPayment');

    const packNames = {
      delta: 'Delta Binaural Beats', theta: 'Theta Binaural Beats',
      alpha: 'Alpha Binaural Beats', beta: 'Beta Binaural Beats',
      '285hz': '285Hz Tissue Healing', '396hz': '396Hz Release Fear',
      '417hz': '417Hz Facilitating Change', '528hz': '528Hz Love Frequency',
      '639hz': '639Hz Connecting Relationships', '741hz': '741Hz Awakening Intuition'
    };
    const packPrices = {
      delta: 22, theta: 29, alpha: 29, beta: 29,
      '285hz': 29, '396hz': 29, '417hz': 29, '528hz': 29, '639hz': 29, '741hz': 29
    };

    const amount = packPrices[pId] || 29;
    const packName = packNames[pId] || 'Frequency Pack';

    // Show success popup immediately and optimistically unlock the pack
    setPurchasedPackId(pId);
    setPurchasedPacks(prev => [...new Set([...prev, pId])]);
    setPaymentSuccessDetails({
      name: packName, amount: `$${amount} USD`, email: user?.email || '',
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      transactionId: sId || 'N/A'
    });
    setShowPaymentSuccessPopup(true);

    // Save payment data in background
    const saveFrequencyPayment = async () => {
      try {
        // Check duplicate
        if (sId) {
          const { data: existing } = await supabase
            .from('patient_payments')
            .select('id')
            .eq('stripe_session_id', sId)
            .limit(1);
          if (existing && existing.length > 0) {
            return;
          }
        }

          // Get clinic_id from patients table
          let clinicIdForPayment = null;
          let clinicNameForEmail = '';
          let patientRecord = null;

          if (user?.id) {
            const { data: p } = await supabase.from('patients').select('*').eq('id', user.id).limit(1).single();
            if (p) {
              patientRecord = p;
              clinicIdForPayment = p.clinic_id || p.org_id || null;
            }
          }
          if (!patientRecord && user?.email) {
            const { data: ps } = await supabase.from('patients').select('*').eq('email', user.email.toLowerCase()).order('created_at', { ascending: false }).limit(1);
            if (ps && ps.length > 0) {
              patientRecord = ps[0];
              clinicIdForPayment = ps[0].clinic_id || ps[0].org_id || null;
            }
          }
          if (clinicIdForPayment) {
            const { data: clinicRow } = await supabase.from('clinics').select('name').eq('id', clinicIdForPayment).single();
            clinicNameForEmail = clinicRow?.name || '';
          }

          const amt = packPrices[pId] || 29;
          const packName = packNames[pId] || 'Frequency Pack';

          // Save to patient_payments
          await supabase.from('patient_payments').insert({
            clinic_id: clinicIdForPayment,
            patient_id: user.id || null,
            patient_email: user.email.toLowerCase(),
            patient_name: patientRecord?.full_name || patientRecord?.name || user.name || '',
            amount: amt,
            currency: 'USD',
            status: 'completed',
            type: 'frequency',
            item_name: packName,
            assessment_id: pId,
            stripe_session_id: sId || null,
            source: 'Frequencies',
            created_at: new Date().toISOString()
          }).then(({ error }) => {
            if (error) console.warn('patient_payments save error:', error.message);
            else console.log('SUCCESS: Frequency payment saved to patient_payments');
          });

          // Save to frequency_purchases
          await supabase.from('frequency_purchases').insert({
            patient_email: user.email.toLowerCase(),
            pack_id: pId,
            stripe_session_id: sId || null,
            amount_paid: amt,
            currency: 'USD',
            payment_status: 'completed',
            purchased_at: new Date().toISOString()
          }).catch(err => console.warn('frequency_purchases save:', err.message));

          // Send emails (patient + admin)
          try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            await fetch(`${API_URL}/send-assessment-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerEmail: user.email,
                customerName: patientRecord?.full_name || patientRecord?.name || user.name || '',
                assessmentName: packName,
                assessmentLink: 'no_link',
                amountPaid: amt.toFixed(2),
                currency: 'USD',
                transactionId: sId || '',
                source: 'patient_dashboard',
                clinicName: clinicNameForEmail,
                clinicId: clinicIdForPayment || '',
                patientPhone: patientRecord?.phone || '',
                patientDob: patientRecord?.date_of_birth || '',
                patientGender: patientRecord?.gender || '',
                patientUid: patientRecord?.external_id || ''
              })
            });
          } catch (emailErr) {
            console.warn('Email sending failed:', emailErr.message);
          }

          // Re-fetch to confirm from DB
          fetchPurchasedPacks();
        } catch (err) {
          console.error('Error saving frequency payment:', err);
        }
      };

      saveFrequencyPayment();
  }, [user?.id, user?.email]);

  // Handle cancelled payment
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('payment') === 'cancelled') {
      toast.error('Payment was cancelled');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Audio player state for Google Drive tracks
  const [currentAudio, setCurrentAudio] = useState({ packId: null, trackIndex: 0 });
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTrackName, setCurrentTrackName] = useState('');
  const [currentDriveId, setCurrentDriveId] = useState('');
  const [currentTrackImage, setCurrentTrackImage] = useState('');
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef(null);

  
  // Brainwave Frequency Packs with detailed info and sample links
  // Google Drive audio tracks configuration
  // To add your audio: Upload to Google Drive -> Right click -> Share -> Anyone with link -> Copy link
  // Extract the FILE_ID from URL: https://drive.google.com/file/d/FILE_ID/view
  // Format for playback: https://drive.google.com/uc?export=download&id=FILE_ID

  const frequencyPacks = [
    {
      id: 'delta',
      name: 'Delta',
      frequency: '0.5–4 Hz',
      category: 'Good Sleep and Deep Relaxation',
      color: 'from-indigo-600 to-purple-700',
      driveId: '13C0mos5wHHi1zuYFyPM8XEiv83CCax0i',
      image: '/frequency/delta.jpg',
      price: 22,
      originalPrice: 49
    },
    {
      id: 'theta',
      name: 'Theta',
      frequency: '4–8 Hz',
      category: 'Deep Relaxation, Creativity & Subconscious',
      color: 'from-purple-500 to-violet-600',
      driveId: '1vEFc2wuiSkRANWkTozTcH7-Wnni8KkQo',
      image: '/frequency/theta.png',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'alpha',
      name: 'Alpha',
      frequency: '10 Hz',
      category: 'Boost Creativity, Clarity & Flow Zone',
      color: 'from-cyan-500 to-blue-600',
      driveId: '14hDaC2Ud7YwDlmX7JEHMVkLNKKmDogP7',
      image: '/frequency/alpha.png',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'beta',
      name: 'Beta',
      frequency: '13–30 Hz',
      category: 'Focus, Quick Learning & Productivity',
      color: 'from-red-500 to-red-600',
      driveId: '1x6gj-41wpTNVv-Ng76zse1CWUoAN60N8',
      image: '/frequency/beta.png',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_285',
      name: '285Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '285 Hz',
      category: 'Tissue Healing & Energy Fields Restoration',
      color: 'from-amber-500 to-yellow-600',
      driveId: '13C0mos5wHHi1zuYFyPM8XEiv83CCax0i',
      image: '/meditation/285 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_396',
      name: '396Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '396 Hz',
      category: 'Release Fear & Guilt',
      color: 'from-slate-500 to-gray-600',
      driveId: '1vEFc2wuiSkRANWkTozTcH7-Wnni8KkQo',
      image: '/meditation/396 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_417',
      name: '417Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '417 Hz',
      category: 'Initiate Positive Change',
      color: 'from-cyan-500 to-blue-600',
      driveId: '14hDaC2Ud7YwDlmX7JEHMVkLNKKmDogP7',
      image: '/meditation/417 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_528',
      name: '528Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '528 Hz',
      category: 'Activate DNA & Love Frequency',
      color: 'from-rose-500 to-orange-500',
      driveId: '1x6gj-41wpTNVv-Ng76zse1CWUoAN60N8',
      image: '/meditation/528 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_639',
      name: '639Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '639 Hz',
      category: 'Harmonize Relationships',
      color: 'from-blue-500 to-purple-600',
      driveId: '13zc55FIM9zThAi06BKy4NC_6nVNFX1Bn',
      image: '/meditation/639 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_741',
      name: '741Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '741 Hz',
      category: 'Cleanse Toxins & Awaken Intuition',
      color: 'from-teal-500 to-emerald-600',
      driveId: '13C0mos5wHHi1zuYFyPM8XEiv83CCax0i',
      image: '/meditation/741 Hz_page-0001.jpg',
      price: 29,
      originalPrice: 49
    },
    {
      id: 'solfeggio_852',
      name: '852Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '852 Hz',
      category: 'Awaken Spiritual Insight',
      color: 'from-indigo-600 to-purple-700',
      driveId: '1vEFc2wuiSkRANWkTozTcH7-Wnni8KkQo',
      image: '/meditation/852 Hz_page-0001.jpg',
      price: 25,
      originalPrice: 49
    },
    {
      id: 'solfeggio_963',
      name: '963Hz Solfeggio',
      suffix: 'Binaural Beats',
      frequency: '963 Hz',
      category: 'Pineal Gland & Divine Consciousness',
      color: 'from-orange-500 to-red-600',
      driveId: '14hDaC2Ud7YwDlmX7JEHMVkLNKKmDogP7',
      image: '/meditation/963 Hz_page-0001.jpg',
      price: 25,
      originalPrice: 49
    },
    {
      id: 'gamma',
      name: 'Gamma',
      suffix: 'Brainwave Music',
      frequency: '30-100 Hz',
      category: 'Focus, Sharp Memory & Great Intellect',
      color: 'from-yellow-600 to-yellow-700',
      driveId: '13zc55FIM9zThAi06BKy4NC_6nVNFX1Bn',
      image: '/frequency/gamma.png',
      price: 22,
      originalPrice: 49
    },
  ];

  
  
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Deep-link: scroll to specific frequency pack from care program card click
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const freqId = params.get('freq');
    if (!freqId) return;
    setTimeout(() => {
      const el = document.getElementById(`freq-pack-${freqId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2'), 3000);
      }
    }, 500);
  }, []);

  // Toggle favorite (local state only)
  const toggleFavorite = (packId) => {
    const isFavorite = favorites.includes(packId);
    if (isFavorite) {
      setFavorites(prev => prev.filter(id => id !== packId));
    } else {
      setFavorites(prev => [...prev, packId]);
    }
  };

  // Log listening session (local only - no database)
  const logListeningSession = (packId, duration) => {
    // Update local stats
    setListeningStats(prev => ({
      ...prev,
      totalSessions: prev.totalSessions + 1,
      thisWeek: prev.thisWeek + 1
    }));
    toast.success('Session logged!');
  };

  // Google Drive Audio Player Functions - Using backend proxy to bypass CORS
  const getGoogleDriveAudioUrl = (driveId) => {
    if (!driveId) return null;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    return `${API_URL}/audio/stream/${driveId}`;
  };

  const playAudioTrack = (packId, trackIndex, tracks) => {
    const track = tracks[trackIndex];
    if (!track?.driveId) {
      toast.error('Audio track not available yet');
      return;
    }

    setCurrentAudio({ packId, trackIndex });
    setCurrentTrackName(track.name || 'Frequency Audio');
    setCurrentDriveId(track.driveId);
    setCurrentTrackImage(track.image || '');
    setAudioError(false);
    setIsAudioPlaying(true);

    const audioUrl = getGoogleDriveAudioUrl(track.driveId);

    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(err => {
        console.error('Audio play error:', err);
        setAudioError(true);
      });
    }

    // Log session after 5 minutes
    setTimeout(() => {
      logListeningSession(packId, 5);
    }, 5 * 60 * 1000);
  };

  // Open in Google Drive as fallback
  const openInGoogleDrive = () => {
    if (currentDriveId) {
      window.open(`https://drive.google.com/file/d/${currentDriveId}/view`, '_blank');
      // Close the player
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsAudioPlaying(false);
      setCurrentTrackName('');
      setCurrentDriveId('');
      setCurrentTrackImage('');
      setAudioProgress(0);
      setAudioDuration(0);
      setAudioError(false);
    }
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    }
  };

  const resumeAudio = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => {
        console.error('Audio resume error:', err);
      });
      setIsAudioPlaying(true);
    }
  };

  const playNextTrack = (packId, tracks) => {
    const nextIndex = (currentAudio.trackIndex + 1) % tracks.length;
    playAudioTrack(packId, nextIndex, tracks);
  };

  const playPrevTrack = (packId, tracks) => {
    const prevIndex = currentAudio.trackIndex === 0 ? tracks.length - 1 : currentAudio.trackIndex - 1;
    playAudioTrack(packId, prevIndex, tracks);
  };

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setAudioProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setAudioError(false);
    };

    const handleEnded = () => {
      setIsAudioPlaying(false);
      // Auto-log session when track ends
      if (currentAudio.packId) {
        logListeningSession(currentAudio.packId, Math.round(audio.duration / 60));
      }
    };

    const handlePlay = () => {
      setAudioError(false);
    };

    const handleError = () => {
      console.error('Audio loading error');
      setAudioError(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handleError);
    };
  }, [currentAudio.packId]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressChange = (e) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setAudioProgress(newTime);
    }
  };

  // Toggle play state for sample
  const togglePlay = (packId) => {
    if (playingTrack === packId) {
      setPlayingTrack(null);
    } else {
      setPlayingTrack(packId);
      // Log a short sample session
      logListeningSession(packId, 5);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-purple-50/30 to-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hidden Audio Element for Google Drive tracks */}
      <audio ref={audioRef} preload="metadata" className="hidden" />

      {/* Header */}
      <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] text-white">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          <button
            onClick={() => navigate('/dashboard/welcome')}
            className="flex items-center space-x-1.5 sm:space-x-2 text-blue-200 hover:text-white mb-3 sm:mb-4 transition-colors text-xs sm:text-base"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center space-x-2.5 sm:space-x-4">
            <div className="bg-white/20 rounded-lg sm:rounded-xl p-2 sm:p-3 flex-shrink-0">
              <Music className="h-5 w-5 sm:h-8 sm:w-8" />
            </div>
            <div>
              <h1 className="text-lg sm:text-3xl font-bold">Frequencies</h1>
              <p className="text-blue-200 text-xs sm:text-base">
                Harness the power of sound for brain optimization
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {/* Info Banner */}
        <div className="bg-gradient-to-r from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-purple-200 dark:border-purple-700">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-md flex-shrink-0">
              <Headphones className="h-5 w-5 sm:h-8 sm:w-8 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
                Sound Healing Collection
              </h2>
              <p className="text-gray-700 dark:text-gray-300 text-xs sm:text-base leading-relaxed">
                Frequency-based audio designed to support relaxation, focus, and overall well-being.
                Use headphones for best results. Listen 15-30 minutes daily.
              </p>
            </div>
          </div>
        </div>

        
        {/* Frequency Packs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-6 auto-rows-fr">
          {frequencyPacks.map((pack, index) => {
            const isFirstCard = index === 0;
            const isPurchased = purchasedPacks.includes(pack.id);
            const isUnlocked = isFirstCard || isPurchased;
            const isLocked = !isUnlocked;
            return (
              <div
                key={pack.id}
                id={`freq-pack-${pack.id}`}
                className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all flex flex-col h-full"
              >
                {/* Card Image */}
                <div
                  onClick={() => {
                    if (isUnlocked && pack.driveId) {
                      playAudioTrack(pack.id, 0, [{ driveId: pack.driveId, name: pack.name, image: pack.image }]);
                    }
                  }}
                  className={`block relative aspect-video overflow-hidden ${isUnlocked ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} transition-opacity`}
                >
                  {pack.image ? (
                    <img
                      src={pack.image}
                      alt={pack.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full bg-gradient-to-r ${pack.color} ${pack.image ? 'hidden' : 'flex'} items-center justify-center`}>
                    <span className="text-white text-4xl font-bold">{pack.frequency}</span>
                  </div>
                  {/* Lock icon for locked */}
                  {isLocked && (
                    <div className="absolute top-2 right-2 bg-white/90 dark:bg-gray-800/90 rounded-full p-2 shadow-md">
                      <Lock className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </div>
                  )}
                  {/* Free badge for first card */}
                  {isFirstCard && !isPurchased && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>Free</span>
                    </div>
                  )}
                  {/* Purchased badge */}
                  {isPurchased && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3" />
                      <span>Purchased</span>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-2.5 sm:p-4 flex flex-col flex-grow">
                  <h3 className="text-[11px] sm:text-sm font-semibold text-gray-900 dark:text-white mb-1 min-h-[32px] sm:min-h-[40px] leading-tight">
                    {pack.name} {pack.suffix || 'Binaural Beats'} <span className="text-[9px] sm:text-xs font-normal text-gray-500 dark:text-gray-400">(Headphones)</span>
                  </h3>
                  <div className="mt-auto">
                    {isUnlocked ? (
                      <>
                        {isFirstCard && !isPurchased && (
                          <div className="mb-1.5 sm:mb-2">
                            <span className="text-sm sm:text-lg font-bold text-green-600">Free</span>
                          </div>
                        )}
                      <button
                        onClick={() => {
                          if (pack.driveId) {
                            playAudioTrack(pack.id, 0, [{ driveId: pack.driveId, name: pack.name, image: pack.image }]);
                          }
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium text-[11px] sm:text-sm flex items-center justify-center space-x-1.5 sm:space-x-2 transition-colors"
                      >
                        <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span>Listen Now</span>
                      </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                          <span className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">${pack.price}</span>
                          <span className="text-[10px] sm:text-sm text-gray-400 line-through">${pack.originalPrice}</span>
                        </div>
                        <button
                          onClick={() => handlePurchase(pack.id, pack.name, pack.price)}
                          disabled={isProcessingPayment === pack.id}
                          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg font-medium text-[11px] sm:text-sm flex items-center justify-center space-x-1.5 sm:space-x-2 transition-colors"
                        >
                          {isProcessingPayment === pack.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="h-4 w-4" />
                              <span>Buy Now</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Usage Tips */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">How to Use Frequency Music</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Headphones className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Use Headphones</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Required for binaural effects</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Volume2 className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Low Volume</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Keep comfortable level</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">15-30 Minutes</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Optimal session length</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Daily Practice</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Consistency is key</p>
              </div>
            </div>
          </div>
        </div>

        {/* Frequency Guide */}
        <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">When to Use Each Frequency</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Frequency</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Best For</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Time of Day</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-indigo-600">Delta (0.5–4 Hz)</td>
                  <td className="py-2 px-3">Deep sleep, healing</td>
                  <td className="py-2 px-3">Night / Before sleep</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-purple-600">Theta (4–8 Hz)</td>
                  <td className="py-2 px-3">Meditation, creativity</td>
                  <td className="py-2 px-3">Morning / Evening</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-cyan-600">Alpha (10 Hz)</td>
                  <td className="py-2 px-3">Study, relaxation</td>
                  <td className="py-2 px-3">Afternoon</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-red-600">Beta (13–30 Hz)</td>
                  <td className="py-2 px-3">Work, focus</td>
                  <td className="py-2 px-3">Morning / Work hours</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-amber-600">285 Hz Solfeggio</td>
                  <td className="py-2 px-3">Tissue healing & energy restoration</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-gray-600">396 Hz Solfeggio</td>
                  <td className="py-2 px-3">Release fear & guilt</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-cyan-600">417 Hz Solfeggio</td>
                  <td className="py-2 px-3">Initiate positive change</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-rose-600">528 Hz Solfeggio</td>
                  <td className="py-2 px-3">Activate DNA & love frequency</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-3 font-medium text-blue-600">639 Hz Solfeggio</td>
                  <td className="py-2 px-3">Harmonize relationships</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-teal-600">741 Hz Solfeggio</td>
                  <td className="py-2 px-3">Cleanse toxins & awaken intuition</td>
                  <td className="py-2 px-3">Anytime</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200 text-center font-medium">
            <span className="font-semibold">Disclaimer:</span> All frequencies presented here are safe to use and highly effective as tested by the Limitless Brain Lab.
          </p>
        </div>

        {/* Add bottom padding when player is visible */}
        {isAudioPlaying && <div className="h-24"></div>}
      </div>

      {/* Popup Modal Audio Player */}
      {isAudioPlaying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-purple-500/30 w-full max-w-md overflow-hidden">
            {/* Full Width Image */}
            <div className="relative w-full aspect-video">
              {currentTrackImage ? (
                <img
                  src={currentTrackImage}
                  alt={currentTrackName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className={`w-full h-full bg-gradient-to-br from-purple-600 to-indigo-700 ${currentTrackImage ? 'hidden' : 'flex'} items-center justify-center`}>
                <Music className="h-20 w-20 text-white/80" />
              </div>

              {/* Close Button - Top Right */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.src = '';
                  }
                  setIsAudioPlaying(false);
                  setCurrentTrackName('');
                  setCurrentDriveId('');
                  setCurrentTrackImage('');
                  setAudioProgress(0);
                  setAudioDuration(0);
                  setAudioError(false);
                }}
                className="absolute top-3 right-3 text-white bg-black/40 hover:bg-black/60 transition-colors p-2 rounded-full"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Track Info & Controls */}
            <div className="p-5">
              {/* Track Name */}
              <div className="text-center mb-4">
                <p className="text-white font-bold text-xl">{currentTrackName}</p>
                <p className="text-purple-300 text-sm">Binaural Beats</p>
              </div>

              {audioError ? (
                /* Error State - Show fallback button */
                <div className="text-center">
                  <p className="text-amber-400 text-sm mb-4">
                    Audio streaming unavailable. Click below to listen on Google Drive.
                  </p>
                  <button
                    onClick={openInGoogleDrive}
                    className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-medium flex items-center justify-center space-x-2 mx-auto transition-colors"
                  >
                    <ExternalLink className="h-5 w-5" />
                    <span>Open in Google Drive</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Play/Pause Button */}
                  <div className="flex justify-center mb-4">
                    <button
                      onClick={() => {
                        if (audioRef.current) {
                          if (audioRef.current.paused) {
                            audioRef.current.play().catch(() => setAudioError(true));
                          } else {
                            audioRef.current.pause();
                          }
                        }
                      }}
                      className="bg-purple-600 hover:bg-purple-700 rounded-full p-4 transition-colors shadow-lg shadow-purple-500/40"
                    >
                      {audioRef.current && !audioRef.current.paused ? (
                        <Pause className="h-8 w-8 text-white" />
                      ) : (
                        <Play className="h-8 w-8 text-white ml-1" />
                      )}
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-400 text-sm w-12 text-right">{formatTime(audioProgress)}</span>
                    <input
                      type="range"
                      min="0"
                      max={audioDuration || 100}
                      value={audioProgress}
                      onChange={handleProgressChange}
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #9333ea ${(audioProgress / (audioDuration || 100)) * 100}%, #374151 ${(audioProgress / (audioDuration || 100)) * 100}%)`
                      }}
                    />
                    <span className="text-gray-400 text-sm w-12">{formatTime(audioDuration)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Tip */}
            <div className="bg-purple-900/30 px-4 py-3 border-t border-purple-500/20">
              <p className="text-purple-300 text-xs text-center flex items-center justify-center space-x-2">
                <Headphones className="h-3 w-3" />
                <span>Use headphones for best experience</span>
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Stripe Payment Modal */}
      {showPaymentModal && selectedPack && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => { setShowPaymentModal(false); setSelectedPack(null); }}>
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-t-2xl px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Headphones className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-bold text-white">Secure Payment</h2>
                  <p className="text-purple-200 text-[10px] sm:text-xs">Powered by Stripe</p>
                </div>
              </div>
              <button onClick={() => { setShowPaymentModal(false); setSelectedPack(null); }} className="text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6">
              {/* Pack Info */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 flex items-center gap-3">
                {selectedPack.image && (
                  <img src={selectedPack.image} alt={selectedPack.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0" />
                )}
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">{selectedPack.name} Binaural Beats</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{selectedPack.frequency} · {selectedPack.category}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-gray-400 line-through text-xs">${selectedPack.originalPrice}</span>
                    <span className="text-lg sm:text-xl font-bold text-purple-600">${selectedPack.price}</span>
                  </div>
                </div>
              </div>

              {/* Name & Email Form */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={paymentName}
                    onChange={(e) => setPaymentName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={paymentEmail}
                    onChange={(e) => setPaymentEmail(e.target.value)}
                    placeholder="john@example.com"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
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
                onClick={handleStripePayment}
                disabled={isProcessingPayment === selectedPack.id || !paymentEmail}
                className="w-full mt-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessingPayment === selectedPack.id ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Pay ${selectedPack.price} & Unlock</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Success Popup */}
      {showPaymentSuccessPopup && paymentSuccessDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-center">
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-9 w-9 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
              <p className="text-green-100 text-sm mt-1">Your frequency pack has been unlocked</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Frequency Pack</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{paymentSuccessDetails.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Amount Paid</span>
                <span className="text-sm font-semibold text-green-600">{paymentSuccessDetails.amount}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate ml-2">{paymentSuccessDetails.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Date & Time</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{paymentSuccessDetails.date}, {paymentSuccessDetails.time}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Transaction ID</span>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate ml-2 max-w-[180px]">{paymentSuccessDetails.transactionId}</span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => {
                  setShowPaymentSuccessPopup(false);
                  // Auto-open music player for the purchased pack
                  if (purchasedPackId) {
                    const pack = frequencyPacks.find(p => p.id === purchasedPackId);
                    if (pack && pack.driveId) {
                      playAudioTrack(pack.id, 0, [{ driveId: pack.driveId, name: pack.name, image: pack.image }]);
                    }
                    setPurchasedPackId(null);
                  }
                }}
                className="w-full py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-semibold rounded-lg transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrequenciesMusic;
