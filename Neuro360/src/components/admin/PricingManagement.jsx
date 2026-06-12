import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Zap, Loader2, Star } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const PricingManagement = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');

  const [formData, setFormData] = useState({
    clinic_type: 'lbl_partner',
    package_id: '',
    label: '',
    reports: 5,
    price_inr: 0,
    price_usd: 0,
    popular: false,
    is_active: true,
    sort_order: 0
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('*')
        .order('clinic_type', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setPackages(data || []);
    } catch (err) {
      console.error('Error loading pricing:', err);
      toast.error('Failed to load pricing packages');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingPackage(null);
    setFormData({
      clinic_type: 'lbl_partner',
      package_id: '',
      label: '',
      reports: 5,
      price_inr: 0,
      price_usd: 0,
      popular: false,
      is_active: true,
      sort_order: packages.length + 1
    });
    setShowModal(true);
  };

  const handleEdit = (pkg) => {
    setEditingPackage(pkg);
    setFormData({
      clinic_type: pkg.clinic_type,
      package_id: pkg.package_id,
      label: pkg.label,
      reports: pkg.reports,
      price_inr: pkg.price_inr,
      price_usd: pkg.price_usd,
      popular: pkg.popular,
      is_active: pkg.is_active,
      sort_order: pkg.sort_order || 0
    });
    setShowModal(true);
  };

  const handleDelete = async (pkg) => {
    if (!window.confirm(`Delete "${pkg.label}" package for ${pkg.clinic_type === 'lbl_clinic' ? 'LBL Clinic' : 'LBL Partner'}?`)) return;

    try {
      const { error } = await supabase
        .from('pricing_config')
        .delete()
        .eq('id', pkg.id);

      if (error) throw error;
      toast.success('Package deleted');
      loadPackages();
    } catch (err) {
      console.error('Error deleting package:', err);
      toast.error('Failed to delete package');
    }
  };

  const handleSave = async () => {
    if (!formData.label || !formData.reports || !formData.price_inr) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Auto-generate package_id if not set
    const packageId = formData.package_id || `${formData.clinic_type === 'lbl_partner' ? 'partner' : 'clinic'}-${formData.reports}`;

    setSaving(true);
    try {
      const saveData = {
        clinic_type: formData.clinic_type,
        package_id: packageId,
        label: formData.label,
        reports: parseInt(formData.reports),
        price_inr: parseFloat(formData.price_inr),
        price_usd: parseFloat(formData.price_usd) || 0,
        popular: formData.popular,
        is_active: formData.is_active,
        sort_order: parseInt(formData.sort_order) || 0,
        updated_at: new Date().toISOString()
      };

      if (editingPackage) {
        const { error } = await supabase
          .from('pricing_config')
          .update(saveData)
          .eq('id', editingPackage.id);
        if (error) throw error;
        toast.success('Package updated');
      } else {
        saveData.created_at = new Date().toISOString();
        const { error } = await supabase
          .from('pricing_config')
          .insert(saveData);
        if (error) throw error;
        toast.success('Package created');
      }

      setShowModal(false);
      loadPackages();
    } catch (err) {
      console.error('Error saving package:', err);
      toast.error(getFriendlyErrorMessage(err, 'Failed to save the package. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg) => {
    try {
      const { error } = await supabase
        .from('pricing_config')
        .update({ is_active: !pkg.is_active, updated_at: new Date().toISOString() })
        .eq('id', pkg.id);
      if (error) throw error;
      toast.success(`Package ${!pkg.is_active ? 'activated' : 'deactivated'}`);
      loadPackages();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const filteredPackages = filterType === 'all'
    ? packages
    : packages.filter(p => p.clinic_type === filterType);

  const partnerPackages = filteredPackages.filter(p => p.clinic_type === 'lbl_partner');
  const clinicPackages = filteredPackages.filter(p => p.clinic_type === 'lbl_clinic');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#323956]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pricing Management</h2>
          <p className="text-gray-600">Manage credit packages for LBL Partners and LBL Clinics</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#252a42] transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Package
        </button>
      </div>

      {/* Filter */}
      <div className="flex space-x-2">
        {[
          { value: 'all', label: 'All' },
          { value: 'lbl_partner', label: 'LBL Partner' },
          { value: 'lbl_clinic', label: 'LBL Clinic' }
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilterType(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterType === f.value
                ? 'bg-[#323956] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* LBL Partner Packages */}
      {(filterType === 'all' || filterType === 'lbl_partner') && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100">
            <h3 className="text-lg font-semibold text-indigo-900 flex items-center">
              <Zap className="h-5 w-5 mr-2" />
              LBL Partner Packages
            </h3>
          </div>
          {partnerPackages.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No packages configured</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {partnerPackages.map(pkg => (
                <PackageRow key={pkg.id} pkg={pkg} onEdit={handleEdit} onDelete={handleDelete} onToggle={toggleActive} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* LBL Clinic Packages */}
      {(filterType === 'all' || filterType === 'lbl_clinic') && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
            <h3 className="text-lg font-semibold text-purple-900 flex items-center">
              <Zap className="h-5 w-5 mr-2" />
              LBL Clinic Packages
            </h3>
          </div>
          {clinicPackages.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No packages configured</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {clinicPackages.map(pkg => (
                <PackageRow key={pkg.id} pkg={pkg} onEdit={handleEdit} onDelete={handleDelete} onToggle={toggleActive} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingPackage ? 'Edit Package' : 'Add New Package'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Type *</label>
                <select
                  value={formData.clinic_type}
                  onChange={e => setFormData(prev => ({ ...prev, clinic_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                >
                  <option value="lbl_partner">LBL Partner</option>
                  <option value="lbl_clinic">LBL Clinic</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Label *</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={e => setFormData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g. 5 Reports"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package ID</label>
                <input
                  type="text"
                  value={formData.package_id}
                  onChange={e => setFormData(prev => ({ ...prev, package_id: e.target.value }))}
                  placeholder="Auto-generated if empty"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reports *</label>
                  <input
                    type="number"
                    value={formData.reports}
                    onChange={e => setFormData(prev => ({ ...prev, reports: e.target.value }))}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={e => setFormData(prev => ({ ...prev, sort_order: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price INR *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{'\u20b9'}</span>
                    <input
                      type="number"
                      value={formData.price_inr}
                      onChange={e => setFormData(prev => ({ ...prev, price_inr: e.target.value }))}
                      min="0"
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price USD</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={formData.price_usd}
                      onChange={e => setFormData(prev => ({ ...prev, price_usd: e.target.value }))}
                      min="0"
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#323956] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Per-report price preview */}
              {formData.reports > 0 && formData.price_inr > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">Per Report Cost</p>
                  <p className="text-lg font-bold text-[#323956]">
                    {'\u20b9'}{Math.round(formData.price_inr / formData.reports).toLocaleString()}
                    {formData.price_usd > 0 && (
                      <span className="text-sm text-gray-500 ml-2">
                        (${Math.round(formData.price_usd / formData.reports)})
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.popular}
                    onChange={e => setFormData(prev => ({ ...prev, popular: e.target.checked }))}
                    className="rounded border-gray-300 text-[#323956] focus:ring-[#323956]"
                  />
                  <span className="text-sm text-gray-700">Best Value badge</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-[#323956] focus:ring-[#323956]"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-[#323956] rounded-lg hover:bg-[#252a42] disabled:opacity-50"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />{editingPackage ? 'Update' : 'Create'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Package Row Component
const PackageRow = ({ pkg, onEdit, onDelete, onToggle }) => (
  <div className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors ${!pkg.is_active ? 'opacity-50' : ''}`}>
    <div className="flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${pkg.popular ? 'bg-[#323956]' : 'bg-gray-100'}`}>
        <Zap className={`h-5 w-5 ${pkg.popular ? 'text-white' : 'text-gray-600'}`} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{pkg.label}</span>
          {pkg.popular && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <Star className="h-3 w-3 mr-0.5" />Best Value
            </span>
          )}
          {!pkg.is_active && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              Inactive
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {pkg.reports} reports | ID: {pkg.package_id}
        </p>
      </div>
    </div>

    <div className="flex items-center gap-6">
      <div className="text-right">
        <p className="font-bold text-gray-900">{'\u20b9'}{Number(pkg.price_inr).toLocaleString()}</p>
        {pkg.price_usd > 0 && (
          <p className="text-xs text-gray-500">${Number(pkg.price_usd).toLocaleString()}</p>
        )}
        <p className="text-xs text-gray-400">
          {'\u20b9'}{Math.round(pkg.price_inr / pkg.reports).toLocaleString()}/report
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(pkg)}
          className={`p-2 rounded-lg transition-colors ${pkg.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
          title={pkg.is_active ? 'Deactivate' : 'Activate'}
        >
          <div className={`w-8 h-4 rounded-full relative transition-colors ${pkg.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${pkg.is_active ? 'right-0.5' : 'left-0.5'}`} />
          </div>
        </button>
        <button
          onClick={() => onEdit(pkg)}
          className="p-2 text-gray-500 hover:text-[#323956] hover:bg-blue-50 rounded-lg transition-colors"
          title="Edit"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(pkg)}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
);

export default PricingManagement;
