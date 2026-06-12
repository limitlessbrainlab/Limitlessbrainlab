import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Database,
  Mail,
  Bell,
  Users,
  Key,
  Server,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Download,
  MapPin,
  Plus,
  Trash2,
  Edit3,
  GripVertical,
  Eye,
  EyeOff,
  X,
  Building2,
  Image as ImageIcon
} from 'lucide-react';
import toast from 'react-hot-toast';
import DatabaseBackupService from '../../services/databaseBackupService';
import LocationService from '../../services/locationService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const SystemSettings = () => {
  const [activeSection, setActiveSection] = useState('general');
  const [saving, setSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState(null);

  // Load last backup info on mount
  useEffect(() => {
    loadLastBackupInfo();
    // Initialize backup bucket
    DatabaseBackupService.initializeBackupBucket();
  }, []);

  const loadLastBackupInfo = async () => {
    try {
      const backupInfo = await DatabaseBackupService.getLastBackup();
      setLastBackup(backupInfo);
    } catch (error) {
      console.error('Error loading last backup info:', error);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    const loadingToast = toast.loading('Creating database backup...');

    try {
      const result = await DatabaseBackupService.createBackup();

      if (result.success) {
        toast.success(
          `Backup created successfully! ${result.totalRecords} records backed up.`,
          { id: loadingToast, duration: 5000 }
        );
        // Reload last backup info
        await loadLastBackupInfo();
      } else {
        toast.error(
          getFriendlyErrorMessage(result.error, 'The backup could not be completed. Please try again.'),
          { id: loadingToast }
        );
      }
    } catch (error) {
      console.error('Backup error:', error);
      toast.error(
        'Failed to create backup. Please try again.',
        { id: loadingToast }
      );
    } finally {
      setBackupLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success('Settings saved successfully');
    setSaving(false);
  };

  // Locations management state
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editingLocationName, setEditingLocationName] = useState('');

  const sections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'locations', label: 'Preferred Locations', icon: MapPin },
    { id: 'clinic-locations', label: 'Clinic Locations', icon: Building2 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'api', label: 'API Settings', icon: Key }
  ];

  // Clinic Locations management state
  const [clinicLocations, setClinicLocations] = useState([]);
  const [clinicLocationsLoading, setClinicLocationsLoading] = useState(false);
  const [clinicLocationForm, setClinicLocationForm] = useState(null); // null = hidden, {} = add mode, {id: ...} = edit mode
  const [clinicFormData, setClinicFormData] = useState({
    name: '', title: '', description: '', address: '', phone: '', image_url: '', status: 'active', sort_order: ''
  });

  // Load locations when section is active
  useEffect(() => {
    if (activeSection === 'locations') {
      loadLocations();
    }
    if (activeSection === 'clinic-locations') {
      loadClinicLocations();
    }
  }, [activeSection]);

  const loadLocations = async () => {
    setLocationsLoading(true);
    const data = await LocationService.getAllLocations();
    setLocations(data);
    setLocationsLoading(false);
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;
    const result = await LocationService.addLocation(newLocationName);
    if (result.success) {
      toast.success(`Location "${newLocationName.toUpperCase()}" added`);
      setNewLocationName('');
      loadLocations();
    } else {
      toast.error(getFriendlyErrorMessage(result.error, 'Failed to add the location. Please try again.'));
    }
  };

  const handleUpdateLocation = async (id) => {
    if (!editingLocationName.trim()) return;
    const result = await LocationService.updateLocation(id, { name: editingLocationName.toUpperCase().trim() });
    if (result.success) {
      toast.success('Location updated');
      setEditingLocationId(null);
      loadLocations();
    } else {
      toast.error(getFriendlyErrorMessage(result.error, 'Failed to update the location. Please try again.'));
    }
  };

  const handleDeleteLocation = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const result = await LocationService.deleteLocation(id);
    if (result.success) {
      toast.success(`"${name}" deleted`);
      loadLocations();
    } else {
      toast.error(getFriendlyErrorMessage(result.error, 'Failed to delete the location. Please try again.'));
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    const result = await LocationService.toggleActive(id, !currentStatus);
    if (result.success) {
      toast.success(currentStatus ? 'Location hidden' : 'Location visible');
      loadLocations();
    }
  };

  const handleSeedDefaults = async () => {
    const result = await LocationService.seedDefaults();
    if (result.success) {
      toast.success(result.message);
      loadLocations();
    } else {
      toast.error(getFriendlyErrorMessage(result.error, 'Failed to add the default locations. Please try again.'));
    }
  };

  // =============================================
  // Clinic Locations handlers
  // =============================================

  const loadClinicLocations = async () => {
    setClinicLocationsLoading(true);
    const data = await LocationService.getAllClinicLocations();
    setClinicLocations(data);
    setClinicLocationsLoading(false);
  };

  const resetClinicForm = () => {
    setClinicLocationForm(null);
    setClinicFormData({
      name: '', title: '', description: '', address: '', phone: '', image_url: '', status: 'active', sort_order: ''
    });
  };

  const handleOpenClinicAddForm = () => {
    setClinicFormData({
      name: '', title: '', description: '', address: '', phone: '', image_url: '', status: 'active', sort_order: ''
    });
    setClinicLocationForm({}); // empty object = add mode
  };

  const handleOpenClinicEditForm = (loc) => {
    setClinicFormData({
      name: loc.name || '',
      title: loc.title || '',
      description: loc.description || '',
      address: loc.address || '',
      phone: loc.phone || '',
      image_url: loc.image_url || '',
      status: loc.status || 'active',
      sort_order: loc.sort_order || ''
    });
    setClinicLocationForm({ id: loc.id }); // object with id = edit mode
  };

  const handleClinicFormChange = (field, value) => {
    setClinicFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClinicFormSubmit = async () => {
    if (!clinicFormData.name.trim()) {
      toast.error('Location name is required');
      return;
    }

    if (clinicLocationForm.id) {
      // Edit mode
      const result = await LocationService.updateClinicLocation(clinicLocationForm.id, {
        name: clinicFormData.name.trim(),
        title: clinicFormData.title.trim(),
        description: clinicFormData.description.trim(),
        address: clinicFormData.address.trim(),
        phone: clinicFormData.phone.trim(),
        image_url: clinicFormData.image_url.trim(),
        status: clinicFormData.status,
        sort_order: clinicFormData.sort_order ? parseInt(clinicFormData.sort_order) : undefined
      });
      if (result.success) {
        toast.success('Clinic location updated');
        resetClinicForm();
        loadClinicLocations();
      } else {
        toast.error(getFriendlyErrorMessage(result.error, 'Failed to update the clinic location. Please try again.'));
      }
    } else {
      // Add mode
      const result = await LocationService.addClinicLocation({
        name: clinicFormData.name.trim(),
        title: clinicFormData.title.trim(),
        description: clinicFormData.description.trim(),
        address: clinicFormData.address.trim(),
        phone: clinicFormData.phone.trim(),
        image_url: clinicFormData.image_url.trim(),
        status: clinicFormData.status,
        sort_order: clinicFormData.sort_order ? parseInt(clinicFormData.sort_order) : undefined
      });
      if (result.success) {
        toast.success(`Clinic location "${clinicFormData.name}" added`);
        resetClinicForm();
        loadClinicLocations();
      } else {
        toast.error(getFriendlyErrorMessage(result.error, 'Failed to add the clinic location. Please try again.'));
      }
    }
  };

  const [uploadingImage, setUploadingImage] = useState(false);

  const handleClinicImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    setUploadingImage(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          fileName: file.name,
          folder: 'locations',
          contentType: file.type
        })
      });

      const result = await response.json();
      if (result.success) {
        handleClinicFormChange('image_url', result.url);
        toast.success('Image uploaded!');
      } else {
        toast.error(getFriendlyErrorMessage(result.message, 'The image could not be uploaded. Please try again.'));
      }
    } catch (err) {
      console.error('Image upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleDeleteClinicLocation = async (id, name) => {
    if (!window.confirm(`Delete clinic location "${name}"? This cannot be undone.`)) return;
    const result = await LocationService.deleteClinicLocation(id);
    if (result.success) {
      toast.success(`"${name}" deleted`);
      loadClinicLocations();
    } else {
      toast.error(getFriendlyErrorMessage(result.error, 'Failed to delete the clinic location. Please try again.'));
    }
  };

  const renderLocationsSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Preferred Locations</h3>
        <p className="text-sm text-gray-500 mb-4">Manage locations shown in the "Preferred Location" dropdown across all contact forms.</p>
      </div>

      {/* Add New Location */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newLocationName}
          onChange={(e) => setNewLocationName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
          placeholder="Enter new location name..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
        />
        <button
          onClick={handleAddLocation}
          disabled={!newLocationName.trim()}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {/* Locations List */}
      {locationsLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <MapPin className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-3">No locations found in database</p>
          <button
            onClick={handleSeedDefaults}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Seed Default Locations
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((loc, index) => (
            <div
              key={loc.id}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                loc.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-gray-400 text-xs font-mono w-6 text-center">{index + 1}</span>
                {editingLocationId === loc.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editingLocationName}
                      onChange={(e) => setEditingLocationName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdateLocation(loc.id)}
                      className="flex-1 px-3 py-1.5 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button onClick={() => handleUpdateLocation(loc.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                      <CheckCircle className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditingLocationId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className={`font-medium text-sm ${loc.is_active ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                    {loc.name}
                  </span>
                )}
              </div>

              {editingLocationId !== loc.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleActive(loc.id, loc.is_active)}
                    className={`p-1.5 rounded-lg transition-colors ${loc.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={loc.is_active ? 'Hide location' : 'Show location'}
                  >
                    {loc.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => { setEditingLocationId(loc.id); setEditingLocationName(loc.name); }}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteLocation(loc.id, loc.name)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">Where locations appear:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-600">
              <li>Contact Form popup (Customer Inquiry)</li>
              <li>Limitless Brain Lab Booking page</li>
              <li>Any "Preferred Location" dropdown across the platform</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderClinicLocationsSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Clinic Locations</h3>
        <p className="text-sm text-gray-500 mb-4">Manage the full location cards shown on the "Our Locations" page and locations popup.</p>
      </div>

      {/* Add New Button */}
      {!clinicLocationForm && (
        <button
          onClick={handleOpenClinicAddForm}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add New Location
        </button>
      )}

      {/* Add / Edit Form */}
      {clinicLocationForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">
              {clinicLocationForm.id ? 'Edit Location' : 'Add New Location'}
            </h4>
            <button onClick={resetClinicForm} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={clinicFormData.name}
                onChange={(e) => handleClinicFormChange('name', e.target.value)}
                placeholder="e.g. Surat"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Display Title</label>
              <input
                type="text"
                value={clinicFormData.title}
                onChange={(e) => handleClinicFormChange('title', e.target.value)}
                placeholder="e.g. Surat, India"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={clinicFormData.description}
              onChange={(e) => handleClinicFormChange('description', e.target.value)}
              placeholder="Brief description of this location..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={clinicFormData.address}
                onChange={(e) => handleClinicFormChange('address', e.target.value)}
                placeholder="Full address"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={clinicFormData.phone}
                onChange={(e) => handleClinicFormChange('phone', e.target.value)}
                placeholder="+91 99999 00001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Location Image</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={clinicFormData.image_url}
                onChange={(e) => handleClinicFormChange('image_url', e.target.value)}
                placeholder="URL or upload an image"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <label className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1.5 ${uploadingImage ? 'bg-gray-200 text-gray-500' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
                {uploadingImage ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
                {uploadingImage ? 'Uploading...' : 'Upload'}
                <input type="file" accept="image/*" onChange={handleClinicImageUpload} className="hidden" disabled={uploadingImage} />
              </label>
            </div>
            {clinicFormData.image_url && (
              <div className="mt-2 relative w-24 h-16 rounded-lg overflow-hidden border border-gray-200">
                <img src={clinicFormData.image_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={clinicFormData.status}
                onChange={(e) => handleClinicFormChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="active">Active</option>
                <option value="comingSoon">Coming Soon</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                value={clinicFormData.sort_order}
                onChange={(e) => handleClinicFormChange('sort_order', e.target.value)}
                placeholder="Auto"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetClinicForm}
              className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleClinicFormSubmit}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {clinicLocationForm.id ? 'Update Location' : 'Add Location'}
            </button>
          </div>
        </div>
      )}

      {/* Clinic Locations List */}
      {clinicLocationsLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : clinicLocations.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">No clinic locations found</p>
          <p className="text-gray-400 text-sm">Add your first clinic location using the button above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clinicLocations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between p-3 rounded-xl border bg-white border-gray-200 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Image thumbnail */}
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {loc.image_url ? (
                    <img
                      src={loc.image_url}
                      alt={loc.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="h-5 w-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Name and status */}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{loc.title || loc.name}</p>
                  <p className="text-xs text-gray-500 truncate">{loc.address || 'No address'}</p>
                </div>

                {/* Status badge */}
                <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  loc.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {loc.status === 'active' ? 'Active' : 'Coming Soon'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 ml-3">
                <button
                  onClick={() => handleOpenClinicEditForm(loc)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                  title="Edit"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteClinicLocation(loc.id, loc.name)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">Where clinic locations appear:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-600">
              <li>"Our Locations" page (full-page layout)</li>
              <li>Locations popup (card grid overlay)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Platform Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Platform Name
            </label>
            <input
              type="text"
              defaultValue="Limitless Brain Lab"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Support Email
            </label>
            <input
              type="email"
              defaultValue="support@neurosense360.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Report Limit
            </label>
            <input
              type="number"
              defaultValue="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trial Period (Days)
            </label>
            <input
              type="number"
              defaultValue="30"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Feature Toggles</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Auto-generate Reports</h4>
              <p className="text-sm text-gray-500">Automatically generate reports when EDF files are uploaded</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Email Notifications</h4>
              <p className="text-sm text-gray-500">Send email notifications for important events</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Usage Alerts</h4>
              <p className="text-sm text-gray-500">Alert clinics when approaching usage limits</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Authentication Settings</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                defaultValue="60"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Login Attempts
              </label>
              <input
                type="number"
                defaultValue="5"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Password Policy</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Require Strong Passwords</h4>
              <p className="text-sm text-gray-500">Minimum 8 characters with numbers and special characters</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h4>
              <p className="text-sm text-gray-500">Require 2FA for admin accounts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-light rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-3" />
          <div>
            <h4 className="text-sm font-medium text-yellow-800">Security Notice</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Changes to security settings will be applied immediately and may require users to re-authenticate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDatabaseSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Database Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-[#323956] mr-2" />
              <span className="text-sm font-medium text-green-800">Connection Status</span>
            </div>
            <p className="text-lg font-semibold text-green-900 mt-2">Connected</p>
          </div>
          
          <div className="bg-[#E4EFFF] border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <Database className="h-5 w-5 text-[#323956] mr-2" />
              <span className="text-sm font-medium text-blue-800">Records</span>
            </div>
            <p className="text-lg font-semibold text-blue-900 mt-2">15,847</p>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center">
              <Server className="h-5 w-5 text-purple-500 mr-2" />
              <span className="text-sm font-medium text-purple-800">Storage Used</span>
            </div>
            <p className="text-lg font-semibold text-purple-900 mt-2">2.4 GB</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Maintenance</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Database Backup</h4>
              {lastBackup ? (
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">
                    Last backup: {DatabaseBackupService.formatTimestamp(lastBackup.timestamp)}
                  </p>
                  {lastBackup.fileSize && (
                    <p className="text-xs text-gray-400">
                      Size: {DatabaseBackupService.formatFileSize(lastBackup.fileSize)}
                      {lastBackup.totalRecords && ` • ${lastBackup.totalRecords.toLocaleString()} records`}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No backups yet</p>
              )}
            </div>
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {backupLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Backing up...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Backup Now
                </>
              )}
            </button>
          </div>
          
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Optimize Database</h4>
              <p className="text-sm text-gray-500">Improve query performance</p>
            </div>
            <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
              <RefreshCw className="h-4 w-4 mr-2 inline" />
              Optimize
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSettings();
      case 'locations':
        return renderLocationsSettings();
      case 'clinic-locations':
        return renderClinicLocationsSettings();
      case 'security':
        return renderSecuritySettings();
      case 'database':
        return renderDatabaseSettings();
      case 'notifications':
        return <div className="p-8 text-center text-gray-500">Notifications settings coming soon...</div>;
      case 'users':
        return <div className="p-8 text-center text-gray-500">User management settings coming soon...</div>;
      case 'api':
        return <div className="p-8 text-center text-gray-500">API settings coming soon...</div>;
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-100 p-6">
      {/* Modern Settings Header */}
      <div className="relative overflow-hidden bg-white/60 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/10 via-purple-600/10 to-blue-600/10"></div>
        <div className="relative p-8">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                System Settings
              </h1>
              <p className="text-xl text-slate-600 font-medium">
                Configure platform settings and preferences ️
              </p>
            </div>
            <div className="hidden md:block relative">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl">
                <Settings className="h-12 w-12 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
        <div className="flex">
          {/* Modern Sidebar */}
          <div className="w-80 bg-gradient-to-b from-slate-50 to-slate-100 border-r border-slate-200">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-800">Configuration</h2>
            </div>
            <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-none text-left transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary text-white border-r-4 border-primary-dark'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {section.label}
                </button>
              );
            })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="p-6">
            {renderContent()}
            
            {/* Save Button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2 inline" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2 inline" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;