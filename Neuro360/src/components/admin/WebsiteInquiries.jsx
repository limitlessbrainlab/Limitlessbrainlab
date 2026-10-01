import React, { useState, useEffect } from 'react';
import {
  Mail,
  HandMetal,
  UserPlus,
  GraduationCap,
  RefreshCw,
  Eye,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Phone,
  MapPin,
  MessageSquare,
  Briefcase,
  Calendar,
  Building2,
  Award,
  Users,
  Brain,
  Star,
  TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import useRealtimeRefetch from '../../hooks/useRealtimeRefetch';
import AdminPageSkeleton from './AdminPageSkeleton';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const TABS = [
  { id: 'contact', label: 'Contact Inquiries', icon: Mail },
  { id: 'partnership', label: 'Partnership Inquiries', icon: HandMetal },
  { id: 'investment', label: 'Investment Inquiries', icon: TrendingUp },
  { id: 'professional', label: 'Professional Inquiries', icon: UserPlus },
  { id: 'program', label: 'Program Inquiries', icon: GraduationCap },
  { id: 'feedback', label: 'Patient Feedback', icon: Star },
];

// Render a 1-5 star rating, or a muted "Not rated" when none was given.
const renderStars = (rating) => {
  const value = Number(rating) || 0;
  if (!value) return <span className="text-xs text-gray-400 dark:text-gray-500">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
        />
      ))}
    </span>
  );
};

const WebsiteInquiries = ({ subTab = 'contact' }) => {
  const [activeTab, setActiveTab] = useState(subTab);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setActiveTab(subTab);
  }, [subTab]);

  useEffect(() => {
    loadData();
    setCurrentPage(1);
    setSearchTerm('');
  }, [activeTab]);

  // Live updates for the tabs whose tables are realtime-enabled + anon-readable.
  // (Partnership/franchise_inquiries is RLS-locked to authenticated, so it stays
  // on manual Refresh.)
  const REALTIME_TABLE_BY_TAB = { contact: 'contact_inquiries', program: 'program_inquiries' };
  // Deferred arrow so `loadData` (declared below) isn't read during render (TDZ).
  useRealtimeRefetch(
    REALTIME_TABLE_BY_TAB[activeTab] ? [{ table: REALTIME_TABLE_BY_TAB[activeTab] }] : [],
    () => loadData(),
    [activeTab]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/inquiries/${activeTab}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data || []);
      } else {
        console.error('Error loading inquiries:', result.message);
        toast.error('Failed to load inquiries');
        setData([]);
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to load data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this inquiry?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/inquiries/${activeTab}/${id}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        toast.success('Inquiry deleted');
        setData(prev => prev.filter(item => item.id !== id));
        if (showModal && selectedItem?.id === id) {
          setShowModal(false);
          setSelectedItem(null);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Failed to delete inquiry');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Filter data based on search
  const filteredData = data.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(item).some(val =>
      val && String(val).toLowerCase().includes(term)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getName = (item) => {
    return item.name || item.full_name || item.email || 'N/A';
  };

  const getEmail = (item) => {
    if (activeTab === 'partnership' || activeTab === 'investment') return item.name || 'N/A'; // partnership/investment store email in name field
    return item.email || 'N/A';
  };

  const getPhone = (item) => {
    return item.phone || item.contact_number || 'N/A';
  };

  // When the contact_inquiries.source column is missing, ContactFormPopup folds
  // the source into the message as a leading `[source:xxx]` tag. Read the source
  // from the column when present, otherwise recover it from that tag.
  const extractSource = (item) => {
    if (item.source) return item.source;
    const m = /^\[source:([^\]]+)\]/i.exec(item.message || '');
    return m ? m[1].trim() : null;
  };

  // Strip the leading `[source:xxx]` tag so the admin sees the real message.
  const cleanMessage = (message) =>
    (message || '').replace(/^\[source:[^\]]+\]\s*/i, '') || null;

  // Plain-text label for a source value (used in the detail modal).
  const renderPackageLabel = (src) => {
    const labels = { 'treat-my-brain': 'Treat My Brain', 'protect-my-brain': 'Protect My Brain' };
    return labels[src] || 'General Inquiry';
  };

  // Map the contact-form button (source) to a labeled badge for the Contact tab.
  const renderPackage = (src) => {
    const map = {
      'treat-my-brain': ['Treat My Brain', 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'],
      'protect-my-brain': ['Protect My Brain', 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'],
    };
    const [text, cls] = map[src] || ['General Inquiry', 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'];
    return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>;
  };

  // Render table columns based on active tab
  const renderTableHeader = () => {
    switch (activeTab) {
      case 'contact':
        return (
          <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">City</th>
            <th className="px-4 py-3">Package</th>
            <th className="px-4 py-3">Inquiry Date &amp; Time</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        );
      case 'partnership':
      case 'investment':
        return (
          <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Contact Number</th>
            <th className="px-4 py-3">Inquiry Date &amp; Time</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        );
      case 'professional':
        return (
          <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">City/Country</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Inquiry Date &amp; Time</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        );
      case 'program':
        return (
          <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Profession</th>
            <th className="px-4 py-3">Program</th>
            <th className="px-4 py-3">Inquiry Date &amp; Time</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        );
      case 'feedback':
        return (
          <tr className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Rating</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Message</th>
            <th className="px-4 py-3">Submitted On</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        );
      default:
        return null;
    }
  };

  const renderTableRow = (item) => {
    switch (activeTab) {
      case 'contact':
        return (
          <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.email || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.phone || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.city || 'N/A'}</td>
            <td className="px-4 py-3 text-sm">{renderPackage(extractSource(item))}</td>
            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
            <td className="px-4 py-3 text-right">{renderActions(item)}</td>
          </tr>
        );
      case 'partnership':
      case 'investment':
        return (
          <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.contact_number || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
            <td className="px-4 py-3 text-right">{renderActions(item)}</td>
          </tr>
        );
      case 'professional':
        return (
          <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.full_name || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.email || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.phone || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.city_country || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
              {Array.isArray(item.professional_category) ? item.professional_category.join(', ') : item.professional_category || 'N/A'}
            </td>
            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
            <td className="px-4 py-3 text-right">{renderActions(item)}</td>
          </tr>
        );
      case 'program':
        return (
          <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.email || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.phone || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.profession || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.program_type || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
            <td className="px-4 py-3 text-right">{renderActions(item)}</td>
          </tr>
        );
      case 'feedback':
        return (
          <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.patient_name || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.patient_email || 'N/A'}</td>
            <td className="px-4 py-3 text-sm">{renderStars(item.rating)}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">{item.category || 'general'}</td>
            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate" title={item.message}>{item.message || 'N/A'}</td>
            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</td>
            <td className="px-4 py-3 text-right">{renderActions(item)}</td>
          </tr>
        );
      default:
        return null;
    }
  };

  const renderActions = (item) => (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => { setSelectedItem(item); setShowModal(true); }}
        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
        title="View Details"
      >
        <Eye className="w-4 h-4" />
      </button>
      {/* Delete button removed per request — inquiries must not be deletable by anyone.
      <button
        onClick={() => handleDelete(item.id)}
        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      */}
    </div>
  );

  // Detail modal content based on tab type
  const renderDetailModal = () => {
    if (!selectedItem) return null;

    const DetailRow = ({ icon: Icon, label, value }) => {
      if (!value || value === 'N/A') return null;
      return (
        <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm text-gray-900 dark:text-white mt-0.5">
              {Array.isArray(value) ? value.join(', ') : String(value)}
            </p>
          </div>
        </div>
      );
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Inquiry Details</h3>
            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="p-5 space-y-1">
            {activeTab === 'contact' && (
              <>
                <DetailRow icon={Users} label="Name" value={selectedItem.name} />
                <DetailRow icon={Mail} label="Email" value={selectedItem.email} />
                <DetailRow icon={Phone} label="Phone" value={selectedItem.phone} />
                <DetailRow icon={MapPin} label="City" value={selectedItem.city} />
                <DetailRow icon={Briefcase} label="Package" value={renderPackageLabel(extractSource(selectedItem))} />
                <DetailRow icon={MessageSquare} label="Message" value={cleanMessage(selectedItem.message)} />
                <DetailRow icon={Calendar} label="Submitted On" value={formatDate(selectedItem.created_at)} />
              </>
            )}
            {(activeTab === 'partnership' || activeTab === 'investment') && (
              <>
                <DetailRow icon={Mail} label="Email" value={selectedItem.name} />
                <DetailRow icon={Phone} label="Contact Number" value={selectedItem.contact_number} />
                <DetailRow icon={Calendar} label="Submitted On" value={formatDate(selectedItem.created_at)} />
              </>
            )}
            {activeTab === 'professional' && (
              <>
                <DetailRow icon={Users} label="Full Name" value={selectedItem.full_name} />
                <DetailRow icon={Mail} label="Email" value={selectedItem.email} />
                <DetailRow icon={Phone} label="Phone" value={selectedItem.phone} />
                <DetailRow icon={MapPin} label="City/Country" value={selectedItem.city_country} />
                <DetailRow icon={Building2} label="Organization" value={selectedItem.organization} />
                <DetailRow icon={Award} label="Certifications" value={selectedItem.certifications} />
                <DetailRow icon={Briefcase} label="Professional Category" value={selectedItem.professional_category} />
                <DetailRow icon={Calendar} label="Years of Experience" value={selectedItem.years_experience} />
                <DetailRow icon={Users} label="Client Segments" value={selectedItem.client_segments} />
                <DetailRow icon={Calendar} label="Submitted On" value={formatDate(selectedItem.created_at)} />
              </>
            )}
            {activeTab === 'program' && (
              <>
                <DetailRow icon={Users} label="Name" value={selectedItem.name} />
                <DetailRow icon={Mail} label="Email" value={selectedItem.email} />
                <DetailRow icon={Phone} label="Phone" value={selectedItem.phone} />
                <DetailRow icon={Briefcase} label="Profession" value={selectedItem.profession} />
                <DetailRow icon={Building2} label="Industry" value={selectedItem.industry} />
                <DetailRow icon={Brain} label="Brain Fitness Score" value={selectedItem.brain_fitness_score} />
                <DetailRow icon={Brain} label="Has Done Brain Scan" value={selectedItem.has_done_brain_scan ? 'Yes' : 'No'} />
                <DetailRow icon={GraduationCap} label="Program Type" value={selectedItem.program_type} />
                <DetailRow icon={MessageSquare} label="Message" value={selectedItem.message} />
                <DetailRow icon={Calendar} label="Submitted On" value={formatDate(selectedItem.created_at)} />
              </>
            )}
            {activeTab === 'feedback' && (
              <>
                <DetailRow icon={Users} label="Patient Name" value={selectedItem.patient_name} />
                <DetailRow icon={Mail} label="Email" value={selectedItem.patient_email} />
                <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                  <Star className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Rating</p>
                    <div className="mt-1">{renderStars(selectedItem.rating)}</div>
                  </div>
                </div>
                <DetailRow icon={Briefcase} label="Category" value={selectedItem.category} />
                <DetailRow icon={MessageSquare} label="Message" value={selectedItem.message} />
                <DetailRow icon={Calendar} label="Submitted On" value={formatDate(selectedItem.created_at)} />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const currentTabInfo = TABS.find(t => t.id === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Website Inquiries</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          View and manage inquiries submitted through website forms
        </p>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search & Refresh Bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search inquiries..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Count */}
      <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        {filteredData.length} {activeTab === 'feedback'
          ? (filteredData.length === 1 ? 'feedback entry' : 'feedback entries')
          : (filteredData.length === 1 ? 'inquiry' : 'inquiries')} found
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <AdminPageSkeleton rows={5} />
        ) : filteredData.length === 0 ? (
          <div className="text-center py-16">
            <currentTabInfo.icon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No inquiries found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  {renderTableHeader()}
                </thead>
                <tbody>
                  {paginatedData.map(item => renderTableRow(item))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {showModal && renderDetailModal()}
    </div>
  );
};

export default WebsiteInquiries;
