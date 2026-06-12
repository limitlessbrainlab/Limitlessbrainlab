import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Users,
  Star,
  Calendar,
  MapPin,
  Mail,
  Phone,
  MessageCircle,
  X,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Globe,
  Award,
  DollarSign,
  Link as LinkIcon
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const CoachManagement = ({ onUpdate }) => {
  const [coaches, setCoaches] = useState([]);
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [activeTab, setActiveTab] = useState('coaches');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const specialtyOptions = [
    'Stress Management',
    'Cognitive Enhancement',
    'Focus & Attention',
    'Emotional Regulation',
    'Sleep Optimization',
    'Memory & Learning',
    'Executive Function',
    'Mindfulness',
    'Performance Optimization',
    'Anxiety Management',
    'ADHD Coaching',
    'Brain Health'
  ];

  const modalityOptions = [
    'CBT (Cognitive Behavioral)',
    'Mindfulness-Based',
    'Neurofeedback',
    'Biofeedback',
    'Coaching',
    'Meditation',
    'Breathwork',
    'Executive Coaching',
    'Life Coaching'
  ];

  const languageOptions = ['English', 'Hindi', 'Arabic', 'Spanish', 'French', 'German', 'Mandarin'];

  useEffect(() => {
    loadCoaches();
    loadConnectionRequests();
    loadBookings();
  }, []);

  const loadBookings = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_payments')
        .select('*')
        .eq('type', 'coaching')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error loading coaching bookings:', error);
    }
  };

  const loadCoaches = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('coaches')
        .select('*')
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setCoaches(data || []);
    } catch (error) {
      console.error('Error loading coaches:', error);
      toast.error('Failed to load coaches');
    } finally {
      setLoading(false);
    }
  };

  const loadConnectionRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_connection_requests')
        .select(`
          *,
          coaches:coach_id (name, email, photo)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConnectionRequests(data || []);
    } catch (error) {
      console.error('Error loading connection requests:', error);
    }
  };

  const handleCreateCoach = async (data) => {
    try {
      const coachData = {
        name: data.name?.toUpperCase(),
        credentials: data.credentials?.toUpperCase(),
        bio: data.bio?.toUpperCase(),
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp,
        calendly_url: data.calendly_url?.toUpperCase() || null,
        booking_preference: data.booking_preference || 'whatsapp',
        price: parseFloat(data.price) || 0,
        price_display: data.price_display ? data.price_display.toUpperCase() : `₹${data.price}/session`,
        specialties: data.specialties ? data.specialties.toUpperCase().split(',').map(s => s.trim()) : [],
        modalities: data.modalities ? data.modalities.toUpperCase().split(',').map(s => s.trim()) : [],
        languages: data.languages ? data.languages.toUpperCase().split(',').map(s => s.trim()) : ['English'],
        city: data.city?.toUpperCase() || '',
        experience: data.experience?.toUpperCase() || '',
        is_online: data.is_online === true || data.is_online === 'true',
        is_in_person: data.is_in_person === true || data.is_in_person === 'true',
        role_category: data.role_category || null,
        is_active: true,
        rating: 5.0,
        reviews_count: 0,
        clinic_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newCoach, error } = await supabase
        .from('coaches')
        .insert([coachData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Coach created successfully');
      setShowModal(false);
      reset();
      loadCoaches();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error creating coach:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to create the coach. Please try again.'));
    }
  };

  const handleUpdateCoach = async (data) => {
    try {
      const updateData = {
        name: data.name?.toUpperCase(),
        credentials: data.credentials?.toUpperCase(),
        bio: data.bio?.toUpperCase(),
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp,
        calendly_url: data.calendly_url?.toUpperCase() || null,
        booking_preference: data.booking_preference || 'whatsapp',
        price: parseFloat(data.price) || 0,
        price_display: data.price_display ? data.price_display.toUpperCase() : `₹${data.price}/session`,
        specialties: data.specialties ? data.specialties.toUpperCase().split(',').map(s => s.trim()) : [],
        modalities: data.modalities ? data.modalities.toUpperCase().split(',').map(s => s.trim()) : [],
        languages: data.languages ? data.languages.toUpperCase().split(',').map(s => s.trim()) : ['English'],
        city: data.city?.toUpperCase() || '',
        experience: data.experience?.toUpperCase() || '',
        role_category: data.role_category || null,
        is_online: data.is_online === true || data.is_online === 'true',
        is_in_person: data.is_in_person === true || data.is_in_person === 'true',
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('coaches')
        .update(updateData)
        .eq('id', selectedCoach.id);

      if (error) throw error;

      toast.success('Coach updated successfully');
      setShowModal(false);
      setSelectedCoach(null);
      reset();
      loadCoaches();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating coach:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to update the coach. Please try again.'));
    }
  };

  const handleToggleStatus = async (coach) => {
    try {
      const newStatus = !coach.is_active;
      const { error } = await supabase
        .from('coaches')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', coach.id);

      if (error) throw error;

      toast.success(`Coach ${newStatus ? 'activated' : 'deactivated'}`);
      loadCoaches();
    } catch (error) {
      console.error('Error toggling coach status:', error);
      toast.error('Failed to update coach status');
    }
  };

  const handleDeleteCoach = async (coach) => {
    if (!window.confirm(`Delete coach "${coach.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('coaches')
        .delete()
        .eq('id', coach.id);

      if (error) throw error;

      toast.success('Coach deleted successfully');
      loadCoaches();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error deleting coach:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to delete the coach. Please try again.'));
    }
  };

  const handleUpdateRequestStatus = async (requestId, status) => {
    try {
      const { error } = await supabase
        .from('coach_connection_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (error) throw error;

      toast.success(`Request marked as ${status}`);
      loadConnectionRequests();
    } catch (error) {
      console.error('Error updating request status:', error);
      toast.error('Failed to update request status');
    }
  };

  const openEditModal = (coach) => {
    setSelectedCoach(coach);
    setValue('name', coach.name);
    setValue('credentials', coach.credentials);
    setValue('bio', coach.bio);
    setValue('email', coach.email);
    setValue('phone', coach.phone);
    setValue('whatsapp', coach.whatsapp);
    setValue('calendly_url', coach.calendly_url || '');
    setValue('booking_preference', coach.booking_preference || 'whatsapp');
    setValue('price', coach.price);
    setValue('price_display', coach.price_display);
    setValue('specialties', coach.specialties?.join(', ') || '');
    setValue('modalities', coach.modalities?.join(', ') || '');
    setValue('languages', coach.languages?.join(', ') || '');
    setValue('city', coach.city || '');
    setValue('experience', coach.experience || '');
    setValue('is_online', coach.is_online);
    setValue('is_in_person', coach.is_in_person);
    setValue('role_category', coach.role_category || '');
    setShowModal(true);
  };

  const openCreateModal = () => {
    setSelectedCoach(null);
    reset();
    setShowModal(true);
  };

  const filteredCoaches = coaches.filter(coach => {
    const matchesSearch = coach.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         coach.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         coach.city?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && coach.is_active) ||
                         (statusFilter === 'inactive' && !coach.is_active);
    return matchesSearch && matchesStatus;
  });

  const filteredRequests = connectionRequests.filter(req => {
    if (statusFilter === 'all') return true;
    return req.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Coach Management</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage brain coaches and connection requests</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Add Coach</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('coaches')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'coaches'
                ? 'border-[#323956] text-[#323956] dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Coaches ({coaches.length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'requests'
                ? 'border-[#323956] text-[#323956] dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <div className="flex items-center space-x-2">
              <MessageCircle className="h-4 w-4" />
              <span>Connection Requests ({connectionRequests.filter(r => r.status === 'pending').length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'bookings'
                ? 'border-[#323956] text-[#323956] dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Paid Bookings ({bookings.length})</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === 'coaches' ? "Search coaches..." : "Search requests..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
        >
          <option value="all">All Status</option>
          {activeTab === 'coaches' ? (
            <>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </>
          ) : (
            <>
              <option value="pending">Pending</option>
              <option value="contacted">Contacted</option>
              <option value="completed">Completed</option>
            </>
          )}
        </select>
        <button
          onClick={() => { loadCoaches(); loadConnectionRequests(); }}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Coaches Tab Content */}
      {activeTab === 'coaches' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Loading coaches...</p>
            </div>
          ) : filteredCoaches.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No coaches found</p>
              <button
                onClick={openCreateModal}
                className="mt-4 text-[#323956] hover:underline"
              >
                Add your first coach
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coach</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Specialties</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Booking</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCoaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-[#323956] flex items-center justify-center text-white font-semibold">
                            {coach.name?.charAt(0) || 'C'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{coach.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{coach.credentials}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {coach.specialties?.slice(0, 2).map((specialty, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded-full">
                              {specialty}
                            </span>
                          ))}
                          {coach.specialties?.length > 2 && (
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full">
                              +{coach.specialties.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{coach.email}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
                            <Phone className="h-3 w-3" />
                            <span>{coach.phone}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          {coach.whatsapp && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs rounded-full flex items-center space-x-1">
                              <MessageCircle className="h-3 w-3" />
                              <span>WhatsApp</span>
                            </span>
                          )}
                          {coach.calendly_url && (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs rounded-full flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>Calendly</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleStatus(coach)}
                          className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
                            coach.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}
                        >
                          {coach.is_active ? (
                            <>
                              <Eye className="h-3 w-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3" />
                              <span>Inactive</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(coach)}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCoach(coach)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Connection Requests Tab Content */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {filteredRequests.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No connection requests found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRequests.map((request) => (
                <div key={request.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                          <Users className="h-5 w-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{request.patient_name}</p>
                          <p className="text-sm text-gray-500">{request.patient_email}</p>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Coach:</span> {request.coaches?.name || 'Unknown'}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Type:</span> {request.request_type}
                      </div>
                      {request.message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                          {request.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(request.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        request.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : request.status === 'contacted'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      }`}>
                        {request.status}
                      </span>
                      {request.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateRequestStatus(request.id, 'contacted')}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                        >
                          Mark Contacted
                        </button>
                      )}
                      {request.status === 'contacted' && (
                        <button
                          onClick={() => handleUpdateRequestStatus(request.id, 'completed')}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
                        >
                          Mark Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Paid Bookings Tab */}
      {activeTab === 'bookings' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {bookings.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No paid coaching bookings yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Bookings appear here after a patient completes payment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coach</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transaction ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {bookings
                    .filter(b => {
                      const term = searchTerm.toLowerCase();
                      if (!term) return true;
                      return (
                        (b.patient_name || '').toLowerCase().includes(term) ||
                        (b.patient_email || '').toLowerCase().includes(term) ||
                        (b.item_name || '').toLowerCase().includes(term)
                      );
                    })
                    .map((booking) => {
                      const coachName = (booking.item_name || '').replace('Brain Coaching - ', '').replace('Brain Coach Session - ', '').trim() || 'Unknown Coach';
                      const amount = booking.currency === 'INR' ? `₹${(booking.amount || 0).toLocaleString()}` : `$${(booking.amount || 0).toLocaleString()}`;
                      return (
                        <tr key={booking.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white text-sm">{booking.patient_name || '—'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{booking.patient_email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{coachName}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{amount}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {new Date(booking.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              {booking.status || 'completed'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                            {booking.stripe_session_id ? booking.stripe_session_id.slice(0, 20) + '…' : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowModal(false)} />

            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedCoach ? 'Edit Coach' : 'Add New Coach'}
                </h3>
                <button
                  onClick={() => { setShowModal(false); setSelectedCoach(null); reset(); }}
                  className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 dark:bg-gray-700 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(selectedCoach ? handleUpdateCoach : handleCreateCoach)} className="p-6 space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      {...register('name', { required: 'Name is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="Dr. John Smith"
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Credentials *
                    </label>
                    <input
                      type="text"
                      {...register('credentials', { required: 'Credentials required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="PhD Psychology, Certified Coach"
                    />
                    {errors.credentials && <p className="text-red-500 text-xs mt-1">{errors.credentials.message}</p>}
                  </div>
                </div>

                {/* Role Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role Category *
                  </label>
                  <select
                    {...register('role_category', { required: 'Role category is required' })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                  >
                    <option value="">Select a category</option>
                    <option value="Neurologist">Neurologist</option>
                    <option value="Brain Concierge">Brain Concierge</option>
                    <option value="Concierge Care">Concierge Care</option>
                    <option value="Counselling Psychologist">Counselling Psychologist</option>
                    <option value="NLP & Counselling">NLP & Counselling</option>
                    <option value="Clinical Psychology & Music Therapy">Clinical Psychology & Music Therapy</option>
                    <option value="Mantra Therapist">Mantra Therapist</option>
                  </select>
                  {errors.role_category && <p className="text-red-500 text-xs mt-1">{errors.role_category.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Bio *
                  </label>
                  <textarea
                    {...register('bio', { required: 'Bio is required' })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] resize-none uppercase"
                    placeholder="Brief description of the coach's background and expertise..."
                  />
                  {errors.bio && <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>}
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      {...register('email', { required: 'Email is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="coach@example.com"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone *
                    </label>
                    <input
                      type="tel"
                      {...register('phone', { required: 'Phone is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="+971 50 123 4567"
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                  </div>
                </div>

                {/* Booking Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      WhatsApp Number *
                    </label>
                    <input
                      type="tel"
                      {...register('whatsapp', { required: 'WhatsApp is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="+971501234567"
                    />
                    {errors.whatsapp && <p className="text-red-500 text-xs mt-1">{errors.whatsapp.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Calendly URL (Optional)
                    </label>
                    <input
                      type="text"
                      {...register('calendly_url')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="https://calendly.com/coach"
                    />
                  </div>
                </div>

                {/* Booking Preference & Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Booking Preference
                    </label>
                    <select
                      {...register('booking_preference')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                    >
                      <option value="whatsapp">WhatsApp Only</option>
                      <option value="calendly">Calendly Only</option>
                      <option value="both">Both WhatsApp & Calendly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Session Price (₹) *
                    </label>
                    <input
                      type="number"
                      {...register('price', { required: 'Price is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="2500"
                    />
                    {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
                  </div>
                </div>

                {/* Price Display & Specialties */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Price Display Text
                    </label>
                    <input
                      type="text"
                      {...register('price_display')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="₹2,500/session"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Experience
                    </label>
                    <input
                      type="text"
                      {...register('experience')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="10+ years"
                    />
                  </div>
                </div>

                {/* Specialties & Modalities */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Specialties (comma separated)
                    </label>
                    <input
                      type="text"
                      {...register('specialties')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="Stress Management, Focus & Attention"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Modalities (comma separated)
                    </label>
                    <input
                      type="text"
                      {...register('modalities')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="CBT, Mindfulness, Coaching"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 -mt-2">Specialty options: {specialtyOptions.slice(0, 5).join(', ')}...</p>

                {/* Location & Languages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      {...register('city')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="Dubai"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Languages (comma separated)
                    </label>
                    <input
                      type="text"
                      {...register('languages')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                      placeholder="English, Hindi, Arabic"
                    />
                  </div>
                </div>

                {/* Session Types */}
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_online')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Offers Online Sessions</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_in_person')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Offers In-Person Sessions</span>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setSelectedCoach(null); reset(); }}
                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#323956] text-white rounded-xl hover:bg-[#232D3C] transition-colors"
                  >
                    {selectedCoach ? 'Update Coach' : 'Add Coach'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoachManagement;
