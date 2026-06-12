import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  X,
  RefreshCw,
  FileText
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const StaticPageManagement = () => {
  const [pages, setPages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedPage, setSelectedPage] = useState(null);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm();

  // Watch the title field to auto-generate slug on create
  const watchTitle = watch('title', '');

  useEffect(() => {
    loadPages();
  }, []);

  /**
   * Generates a URL-friendly slug from a title string.
   * Converts to lowercase, replaces spaces/special chars with hyphens,
   * and removes consecutive or trailing hyphens.
   */
  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const loadPages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('static_pages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading pages:', error);
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          toast.error('Static pages table not found. Please run the SQL migration first.');
        } else {
          toast.error('Failed to load pages');
        }
        setPages([]);
        return;
      }
      setPages(data || []);
    } catch (error) {
      console.error('Error loading pages:', error);
      toast.error('Failed to load pages');
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePage = async (data) => {
    try {
      const pageData = {
        title: data.title?.toUpperCase(),
        slug: data.slug?.toLowerCase().trim(),
        content: data.content,
        is_active: data.is_active === true || data.is_active === 'true',
        updated_by: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('static_pages')
        .insert([pageData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Page created successfully');
      setShowModal(false);
      reset();
      loadPages();
    } catch (error) {
      console.error('Error creating page:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to create the page. Please try again.'));
    }
  };

  const handleUpdatePage = async (data) => {
    try {
      const updateData = {
        title: data.title?.toUpperCase(),
        slug: data.slug?.toLowerCase().trim(),
        content: data.content,
        is_active: data.is_active === true || data.is_active === 'true',
        updated_by: 'admin',
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('static_pages')
        .update(updateData)
        .eq('id', selectedPage.id);

      if (error) throw error;

      toast.success('Page updated successfully');
      setShowModal(false);
      setSelectedPage(null);
      reset();
      loadPages();
    } catch (error) {
      console.error('Error updating page:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to update the page. Please try again.'));
    }
  };

  const handleToggleStatus = async (page) => {
    try {
      const newStatus = !page.is_active;
      const { error } = await supabase
        .from('static_pages')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', page.id);

      if (error) throw error;

      toast.success(`Page ${newStatus ? 'activated' : 'deactivated'}`);
      loadPages();
    } catch (error) {
      console.error('Error toggling page status:', error);
      toast.error('Failed to update page status');
    }
  };

  const handleDeletePage = async (page) => {
    if (!window.confirm(`Delete page "${page.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('static_pages')
        .delete()
        .eq('id', page.id);

      if (error) throw error;

      toast.success('Page deleted successfully');
      loadPages();
    } catch (error) {
      console.error('Error deleting page:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to delete the page. Please try again.'));
    }
  };

  const openEditModal = (page) => {
    setSelectedPage(page);
    setValue('title', page.title);
    setValue('slug', page.slug);
    setValue('content', page.content);
    setValue('is_active', page.is_active);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setSelectedPage(null);
    reset({
      is_active: true,
      title: '',
      slug: '',
      content: ''
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Static Pages</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage static content pages (Privacy Policy, Terms of Service, etc.)</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors"
        >
          <Plus className="h-5 w-5" />
          <span>Add Page</span>
        </button>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={loadPages}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Pages Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Loading pages...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No static pages found</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-[#323956] hover:underline"
            >
              Add your first page
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Updated</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {pages.map((page) => (
                  <tr key={page.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#323956] flex items-center justify-center text-white font-semibold">
                          {page.title?.charAt(0) || 'P'}
                        </div>
                        <p className="font-medium text-gray-900 dark:text-white">{page.title}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">/{page.slug}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(page)}
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${
                          page.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {page.is_active ? (
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
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {page.updated_at ? new Date(page.updated_at).toLocaleString() : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => window.open(`/${page.slug}`, '_blank')}
                          className="p-2 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(page)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePage(page)}
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
                  {selectedPage ? 'Edit Page' : 'Add New Page'}
                </h3>
                <button
                  onClick={() => { setShowModal(false); setSelectedPage(null); reset(); }}
                  className="p-2 text-gray-400 hover:text-gray-600 bg-gray-100 dark:bg-gray-700 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(selectedPage ? handleUpdatePage : handleCreatePage)} className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    {...register('title', { required: 'Title is required' })}
                    onChange={(e) => {
                      // Let react-hook-form handle the value
                      register('title').onChange(e);
                      // Auto-generate slug only on create (not editing existing page)
                      if (!selectedPage) {
                        setValue('slug', generateSlug(e.target.value));
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] uppercase"
                    placeholder="Privacy Policy"
                  />
                  {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Slug *
                  </label>
                  <input
                    type="text"
                    {...register('slug', { required: 'Slug is required' })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] lowercase"
                    placeholder="privacy-policy"
                  />
                  {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug.message}</p>}
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Content *
                  </label>
                  <textarea
                    {...register('content', { required: 'Content is required' })}
                    rows={15}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#323956] resize-none"
                    placeholder="Enter page content with HTML formatting..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supports HTML formatting. Use &lt;h3&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt; tags for formatting.
                  </p>
                  {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content.message}</p>}
                </div>

                {/* Is Active Checkbox */}
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register('is_active')}
                      className="w-4 h-4 text-[#323956] border-gray-300 rounded focus:ring-[#323956]"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setSelectedPage(null); reset(); }}
                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-[#323956] text-white rounded-xl hover:bg-[#232D3C] transition-colors"
                  >
                    {selectedPage ? 'Update Page' : 'Add Page'}
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

export default StaticPageManagement;
