import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  X,
  RefreshCw,
  Search,
  DollarSign,
  Tag,
  Package,
  FileText,
  Link as LinkIcon,
  Hash,
  CheckCircle
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const AssessmentManagement = () => {
  const [assessments, setAssessments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm();

  // Watch the category field to conditionally show bundle_includes
  const watchCategory = watch('category', 'individual');

  useEffect(() => {
    loadAssessments();
  }, []);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('neurosense_assessments')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading assessments:', error);
        // Table might not exist yet - show empty state instead of crashing
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          toast.error('Assessments table not found. Please run the SQL migration first.');
        } else {
          toast.error('Failed to load assessments');
        }
        setAssessments([]);
        return;
      }
      setAssessments(data || []);
    } catch (error) {
      console.error('Error loading assessments:', error);
      toast.error('Failed to load assessments');
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssessment = async (data) => {
    try {
      const assessmentData = {
        title: data.title?.toUpperCase(),
        description: data.description?.toUpperCase(),
        link: data.link || null,
        is_free: data.is_free === true || data.is_free === 'true',
        is_inquire: data.is_inquire === true || data.is_inquire === 'true',
        original_price_usd: parseFloat(data.original_price_usd) || 0,
        sale_price_usd: parseFloat(data.sale_price_usd) || 0,
        original_price_aed: data.original_price_aed ? parseFloat(data.original_price_aed) : null,
        sale_price_aed: data.sale_price_aed ? parseFloat(data.sale_price_aed) : null,
        original_price_inr: data.original_price_inr ? parseFloat(data.original_price_inr) : null,
        sale_price_inr: data.sale_price_inr ? parseFloat(data.sale_price_inr) : null,
        display_order: parseInt(data.display_order) || 0,
        is_active: data.is_active === true || data.is_active === 'true',
        category: data.category || 'individual',
        bundle_includes: data.category === 'bundle' && data.bundle_includes
          ? data.bundle_includes.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('neurosense_assessments')
        .insert([assessmentData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Assessment created successfully');
      setShowModal(false);
      reset();
      loadAssessments();
    } catch (error) {
      console.error('Error creating assessment:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to create the assessment. Please try again.'));
    }
  };

  const handleUpdateAssessment = async (data) => {
    try {
      const updateData = {
        title: data.title?.toUpperCase(),
        description: data.description?.toUpperCase(),
        link: data.link || null,
        is_free: data.is_free === true || data.is_free === 'true',
        is_inquire: data.is_inquire === true || data.is_inquire === 'true',
        original_price_usd: parseFloat(data.original_price_usd) || 0,
        sale_price_usd: parseFloat(data.sale_price_usd) || 0,
        original_price_aed: data.original_price_aed ? parseFloat(data.original_price_aed) : null,
        sale_price_aed: data.sale_price_aed ? parseFloat(data.sale_price_aed) : null,
        original_price_inr: data.original_price_inr ? parseFloat(data.original_price_inr) : null,
        sale_price_inr: data.sale_price_inr ? parseFloat(data.sale_price_inr) : null,
        display_order: parseInt(data.display_order) || 0,
        is_active: data.is_active === true || data.is_active === 'true',
        category: data.category || 'individual',
        bundle_includes: data.category === 'bundle' && data.bundle_includes
          ? data.bundle_includes.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
          : null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('neurosense_assessments')
        .update(updateData)
        .eq('id', selectedAssessment.id);

      if (error) throw error;

      toast.success('Assessment updated successfully');
      setShowModal(false);
      setSelectedAssessment(null);
      reset();
      loadAssessments();
    } catch (error) {
      console.error('Error updating assessment:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to update the assessment. Please try again.'));
    }
  };

  const handleToggleStatus = async (assessment) => {
    try {
      const newStatus = !assessment.is_active;
      const { error } = await supabase
        .from('neurosense_assessments')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', assessment.id);

      if (error) throw error;

      toast.success(`Assessment ${newStatus ? 'activated' : 'deactivated'}`);
      loadAssessments();
    } catch (error) {
      console.error('Error toggling assessment status:', error);
      toast.error('Failed to update assessment status');
    }
  };

  const handleDeleteAssessment = async (assessment) => {
    if (!window.confirm(`Delete assessment "${assessment.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('neurosense_assessments')
        .delete()
        .eq('id', assessment.id);

      if (error) throw error;

      toast.success('Assessment deleted successfully');
      loadAssessments();
    } catch (error) {
      console.error('Error deleting assessment:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to delete the assessment. Please try again.'));
    }
  };

  const openEditModal = (assessment) => {
    setSelectedAssessment(assessment);
    setValue('title', assessment.title);
    setValue('description', assessment.description);
    setValue('link', assessment.link || '');
    setValue('is_free', assessment.is_free);
    setValue('is_inquire', assessment.is_inquire);
    setValue('original_price_usd', assessment.original_price_usd);
    setValue('sale_price_usd', assessment.sale_price_usd);
    setValue('original_price_aed', assessment.original_price_aed || '');
    setValue('sale_price_aed', assessment.sale_price_aed || '');
    setValue('original_price_inr', assessment.original_price_inr || '');
    setValue('sale_price_inr', assessment.sale_price_inr || '');
    setValue('display_order', assessment.display_order || 0);
    setValue('is_active', assessment.is_active);
    setValue('category', assessment.category || 'individual');
    setValue('bundle_includes', assessment.bundle_includes?.join(', ') || '');
    setShowModal(true);
  };

  const openCreateModal = () => {
    setSelectedAssessment(null);
    reset({
      is_active: true,
      is_free: false,
      is_inquire: false,
      category: 'individual',
      display_order: 0,
      original_price_usd: '',
      sale_price_usd: '',
      original_price_aed: '',
      sale_price_aed: '',
      original_price_inr: '',
      sale_price_inr: '',
      bundle_includes: ''
    });
    setShowModal(true);
  };

  /**
   * Returns a display label for the assessment type:
   * Free, Inquire, or Paid
   */
  const getTypeLabel = (assessment) => {
    if (assessment.is_free) return 'Free';
    if (assessment.is_inquire) return 'Inquire';
    return 'Paid';
  };

  /**
   * Returns tailwind badge classes based on assessment type
   */
  const getTypeBadgeClasses = (assessment) => {
    if (assessment.is_free) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    }
    if (assessment.is_inquire) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    }
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  };

  // Filter assessments based on search term, status, and category
  const filteredAssessments = assessments.filter(assessment => {
    const matchesSearch = assessment.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
                         (statusFilter === 'active' && assessment.is_active) ||
                         (statusFilter === 'inactive' && !assessment.is_active);
    const matchesCategory = categoryFilter === 'all' ||
                           assessment.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Assessment Management</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage assessment cards for the booking page</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Add Assessment</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search assessments by title..."
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
        >
          <option value="all">All Categories</option>
          <option value="individual">Individual</option>
          <option value="bundle">Bundle</option>
        </select>
        <button
          onClick={loadAssessments}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Assessments Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Loading assessments...</p>
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No assessments found</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-[#323956] hover:underline"
            >
              Add your first assessment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prices (USD)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAssessments.map((assessment) => (
                  <tr key={assessment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#323956] flex items-center justify-center text-white font-semibold">
                          {assessment.title?.charAt(0) || 'A'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{assessment.title}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[250px]">{assessment.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center space-x-1 text-gray-600 dark:text-gray-400">
                          <DollarSign className="h-3 w-3" />
                          <span className="line-through text-gray-400">${assessment.original_price_usd}</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">${assessment.sale_price_usd}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadgeClasses(assessment)}`}>
                        {getTypeLabel(assessment)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        assessment.category === 'bundle'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        <span className="flex items-center space-x-1">
                          {assessment.category === 'bundle' ? (
                            <><Package className="h-3 w-3 inline" /> <span>Bundle</span></>
                          ) : (
                            <><FileText className="h-3 w-3 inline" /> <span>Individual</span></>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(assessment)}
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
                          assessment.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {assessment.is_active ? (
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
                          onClick={() => openEditModal(assessment)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAssessment(assessment)}
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowModal(false)} />

            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedAssessment ? 'Edit Assessment' : 'Add New Assessment'}
                </h3>
                <button
                  onClick={() => { setShowModal(false); setSelectedAssessment(null); reset(); }}
                  className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 dark:bg-gray-700 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(selectedAssessment ? handleUpdateAssessment : handleCreateAssessment)} className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    {...register('title', { required: 'Title is required' })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                    placeholder="Neuro Age Estimator"
                  />
                  {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description *
                  </label>
                  <textarea
                    {...register('description', { required: 'Description is required' })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] resize-none uppercase"
                    placeholder="Brief description of the assessment..."
                  />
                  {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
                </div>

                {/* Assessment Link */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Assessment Link (Optional)
                  </label>
                  <input
                    type="url"
                    {...register('link')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                    placeholder="https://form.jotform.com/..."
                  />
                </div>

                {/* Category & Display Order */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <select
                      {...register('category')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                    >
                      <option value="individual">Individual</option>
                      <option value="bundle">Bundle</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Order
                    </label>
                    <input
                      type="number"
                      {...register('display_order')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Bundle Includes - only shown when category is 'bundle' */}
                {watchCategory === 'bundle' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bundle Includes (comma-separated assessment names)
                    </label>
                    <textarea
                      {...register('bundle_includes')}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] resize-none uppercase"
                      placeholder="Neuro Age Estimator, ADHD Screener, Anxiety Screener"
                    />
                  </div>
                )}

                {/* Checkboxes: Is Free, Is Inquire Only, Is Active */}
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_free')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Is Free</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_inquire')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Inquire Only</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_active')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                </div>

                {/* USD Prices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Original Price (USD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('original_price_usd', { required: 'Original price USD is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="19.99"
                    />
                    {errors.original_price_usd && <p className="text-red-500 text-xs mt-1">{errors.original_price_usd.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sale Price (USD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('sale_price_usd', { required: 'Sale price USD is required' })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="9.99"
                    />
                    {errors.sale_price_usd && <p className="text-red-500 text-xs mt-1">{errors.sale_price_usd.message}</p>}
                  </div>
                </div>

                {/* AED Prices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Original Price (AED)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('original_price_aed')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="73.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sale Price (AED)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('sale_price_aed')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="36.50"
                    />
                  </div>
                </div>

                {/* INR Prices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Original Price (INR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('original_price_inr')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="1699.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sale Price (INR)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('sale_price_inr')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956]"
                      placeholder="849.00"
                    />
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setSelectedAssessment(null); reset(); }}
                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#323956] text-white rounded-xl hover:bg-[#232D3C] transition-colors"
                  >
                    {selectedAssessment ? 'Update Assessment' : 'Add Assessment'}
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

export default AssessmentManagement;
