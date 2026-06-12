import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Upload,
  Image,
  Save,
  Eye,
  AlertCircle,
  Check,
  Trash2,
  RefreshCw,
  CreditCard,
  Star,
  Building,
  Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import fileStorageService from '../../services/fileStorageService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const BrandingConfiguration = () => {
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState('');
  const [loading, setLoading] = useState(false);
  const [brandingData, setBrandingData] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm({
    defaultValues: {
      coBrandingEnabled: false,
      primaryLogo: '',
      secondaryLogo: '',
      logoPosition: 'header-left',
      coBrandingFee: 299,
      poweredByRequired: true,
      poweredByPosition: 'footer-right',
      poweredByText: 'Powered by Limitless Brain Lab',
      brandingNotes: ''
    }
  });

  const watchedValues = watch();

  // Load clinics on component mount
  useEffect(() => {
    loadClinics();
  }, []);

  // Load branding data when clinic is selected
  useEffect(() => {
    if (selectedClinic) {
      loadBrandingData(selectedClinic);
    }
  }, [selectedClinic]);

  const loadClinics = async () => {
    try {
      setLoading(true);
      const clinicsData = await DatabaseService.getAll('clinics');
      setClinics(clinicsData || []);
    } catch (error) {
      console.error('Error loading clinics:', error);
      toast.error('Failed to load clinics');
    } finally {
      setLoading(false);
    }
  };

  const loadBrandingData = async (clinicId) => {
    try {
      setLoading(true);
      const clinic = await DatabaseService.get('clinics', clinicId);

      if (clinic && clinic.branding) {
        setBrandingData(clinic.branding);

        // Populate form with existing data
        Object.keys(clinic.branding).forEach(key => {
          setValue(key, clinic.branding[key]);
        });
      } else {
        // Reset form for new branding setup
        reset();
        setBrandingData(null);
      }
    } catch (error) {
      console.error('Error loading branding data:', error);
      toast.error('Failed to load branding configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event, logoType) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!selectedClinic) {
      toast.error('Please select a clinic first');
      return;
    }

    setUploadingLogo(true);

    try {
      // Validate logo dimensions
      const dimensionValidation = await fileStorageService.validateLogoDimensions(file, 100, 50);
      if (!dimensionValidation.isValid) {
        toast.error(dimensionValidation.message);
        setUploadingLogo(false);
        return;
      }

      // Upload logo using file storage service
      const uploadResult = await fileStorageService.uploadLogo(file, selectedClinic, logoType);

      if (uploadResult.success) {
        setValue(logoType, uploadResult.url);
        setValue(`${logoType}Metadata`, uploadResult.data);
        toast.success(`${logoType === 'primaryLogo' ? 'Primary' : 'Secondary'} logo uploaded successfully`);

        console.log(`SUCCESS: Logo uploaded:`, {
          type: logoType,
          size: uploadResult.data.size,
          filename: uploadResult.data.filename,
          dimensions: dimensionValidation.dimensions
        });
      } else {
        toast.error(getFriendlyErrorMessage(uploadResult.error, 'Logo upload failed. Please try again.'));
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to upload the logo. Please try again.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const onSubmit = async (data) => {
    if (!selectedClinic) {
      toast.error('Please select a clinic first');
      return;
    }

    try {
      setLoading(true);

      // Calculate total co-branding cost
      const baseFee = data.coBrandingEnabled ? data.coBrandingFee : 0;
      const totalCost = baseFee;

      const brandingConfig = {
        ...data,
        totalCost,
        lastUpdated: new Date().toISOString(),
        updatedBy: 'super_admin' // In real app, use actual admin ID
      };

      // Update clinic with branding configuration
      const clinic = await DatabaseService.get('clinics', selectedClinic);
      const updatedClinic = {
        ...clinic,
        branding: brandingConfig
      };

      await DatabaseService.update('clinics', selectedClinic, updatedClinic);

      setBrandingData(brandingConfig);
      toast.success('Branding configuration saved successfully!');

      // If co-branding is enabled, create billing record
      if (data.coBrandingEnabled && baseFee > 0) {
        await createBillingRecord(selectedClinic, baseFee);
      }

    } catch (error) {
      console.error('Error saving branding configuration:', error);
      toast.error('Failed to save branding configuration');
    } finally {
      setLoading(false);
    }
  };

  const createBillingRecord = async (clinicId, amount) => {
    try {
      const billingRecord = {
        id: `billing-${Date.now()}`,
        clinicId,
        type: 'co-branding',
        amount,
        description: 'Co-branding Setup Fee',
        status: 'pending',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        createdAt: new Date().toISOString()
      };

      await DatabaseService.create('billing', billingRecord.id, billingRecord);
      toast.info(`Billing record created: $${amount} co-branding fee`);
    } catch (error) {
      console.error('Error creating billing record:', error);
      toast.error('Failed to create billing record');
    }
  };

  const removeLogo = (logoType) => {
    setValue(logoType, '');
    toast.success(`${logoType === 'primaryLogo' ? 'Primary' : 'Secondary'} logo removed`);
  };

  const renderLogoPreview = (logoData, logoType) => {
    if (!logoData) return null;

    return (
      <div className="relative group">
        <img
          src={logoData}
          alt={`${logoType === 'primaryLogo' ? 'Primary' : 'Secondary'} Logo`}
          className="w-32 h-20 object-contain border-2 border-gray-200 rounded-lg bg-white p-2"
        />
        <button
          type="button"
          onClick={() => removeLogo(logoType)}
          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const renderBrandingPreview = () => {
    if (!previewMode) return null;

    return (
      <div className="mt-8 p-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-[#323956]" />
          Branding Preview
        </h3>

        <div className="bg-white rounded-lg shadow-lg p-6 min-h-[200px]">
          {/* Header with logos */}
          <div className="flex items-center justify-between border-b pb-4 mb-6">
            <div className="flex items-center gap-4">
              {watchedValues.primaryLogo && (
                <img
                  src={watchedValues.primaryLogo}
                  alt="Primary Logo"
                  className="h-12 object-contain"
                />
              )}
              {watchedValues.secondaryLogo && (
                <img
                  src={watchedValues.secondaryLogo}
                  alt="Secondary Logo"
                  className="h-12 object-contain"
                />
              )}
            </div>
            <div className="text-2xl font-bold text-gray-800">Limitless Brain Lab</div>
          </div>

          {/* Sample content */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">EEG Report Dashboard</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#E4EFFF] p-4 rounded-lg">
                <div className="text-2xl font-bold text-[#323956]">25</div>
                <div className="text-sm text-gray-600">Total Reports</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-[#323956]">18</div>
                <div className="text-sm text-gray-600">Active Patients</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">7</div>
                <div className="text-sm text-gray-600">This Month</div>
              </div>
            </div>
          </div>

          {/* Footer with "Powered by" */}
          <div className="mt-8 pt-4 border-t text-center">
            <p className="text-sm text-gray-500">
              {watchedValues.poweredByText}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building className="w-6 h-6 text-[#323956]" />
              Branding Configuration
            </h2>
            <p className="text-gray-600 mt-1">
              Configure clinic logos and co-branding options with pricing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                previewMode
                  ? 'bg-[#323956] text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Eye className="w-4 h-4 mr-2 inline" />
              {previewMode ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>
        </div>
      </div>

      {/* Clinic Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Clinic</h3>
        <select
          value={selectedClinic}
          onChange={(e) => setSelectedClinic(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        >
          <option value="">Choose a clinic to configure branding...</option>
          {clinics.map((clinic) => (
            <option key={clinic.id} value={clinic.id}>
              {clinic.name} ({clinic.email})
            </option>
          ))}
        </select>
      </div>

      {/* Branding Configuration Form */}
      {selectedClinic && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Co-branding Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              Co-branding Settings
            </h3>

            <div className="space-y-4">
              {/* Enable Co-branding */}
              <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('coBrandingEnabled')}
                    className="h-4 w-4 text-[#323956] focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-3 text-sm font-medium text-gray-700">
                    Enable Co-branding (Premium Feature)
                  </label>
                </div>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <CreditCard className="w-4 h-4" />
                  <span className="font-semibold">${watchedValues.coBrandingFee}</span>
                </div>
              </div>

              {/* Co-branding Fee */}
              {watchedValues.coBrandingEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Co-branding Setup Fee ($)
                  </label>
                  <input
                    type="number"
                    {...register('coBrandingFee', {
                      required: 'Fee is required',
                      min: { value: 0, message: 'Fee must be positive' }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="299"
                  />
                  {errors.coBrandingFee && (
                    <p className="text-red-500 text-sm mt-1">{errors.coBrandingFee.message}</p>
                  )}
                </div>
              )}

              {/* Powered by NeuroSense (Always Required) */}
              <div className="p-4 bg-[#E4EFFF] rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-blue-800 mb-2">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Powered by Limitless Brain Lab (Required)</span>
                </div>
                <p className="text-sm text-[#323956]">
                  All co-branded interfaces must display "Powered by Limitless Brain Lab" attribution.
                </p>
              </div>
            </div>
          </div>

          {/* Logo Upload */}
          {watchedValues.coBrandingEnabled && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Image className="w-5 h-5 text-[#323956]" />
                Logo Configuration
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Primary Logo
                  </label>
                  <div className="space-y-3">
                    {watchedValues.primaryLogo ? (
                      renderLogoPreview(watchedValues.primaryLogo, 'primaryLogo')
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Upload primary logo</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'primaryLogo')}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E4EFFF] file:text-blue-700 hover:file:bg-[#CAE0FF]"
                      disabled={uploadingLogo}
                    />
                  </div>
                </div>

                {/* Secondary Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Secondary Logo (Optional)
                  </label>
                  <div className="space-y-3">
                    {watchedValues.secondaryLogo ? (
                      renderLogoPreview(watchedValues.secondaryLogo, 'secondaryLogo')
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Upload secondary logo</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload(e, 'secondaryLogo')}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#E4EFFF] file:text-blue-700 hover:file:bg-[#CAE0FF]"
                      disabled={uploadingLogo}
                    />
                  </div>
                </div>
              </div>

              {/* Logo Position */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo Position
                </label>
                <select
                  {...register('logoPosition')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="header-left">Header Left</option>
                  <option value="header-center">Header Center</option>
                  <option value="header-right">Header Right</option>
                  <option value="sidebar-top">Sidebar Top</option>
                </select>
              </div>
            </div>
          )}

          {/* Powered by Configuration */}
          {watchedValues.coBrandingEnabled && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-500" />
                Attribution Settings
              </h3>

              <div className="space-y-4">
                {/* Powered by Text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Attribution Text
                  </label>
                  <input
                    type="text"
                    {...register('poweredByText')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    readOnly
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This text cannot be modified and must be displayed on all co-branded interfaces.
                  </p>
                </div>

                {/* Attribution Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Attribution Position
                  </label>
                  <select
                    {...register('poweredByPosition')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="footer-left">Footer Left</option>
                    <option value="footer-center">Footer Center</option>
                    <option value="footer-right">Footer Right</option>
                    <option value="header-small">Header Small Text</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Additional Notes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Additional Notes</h3>
            <textarea
              {...register('brandingNotes')}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add any special branding requirements or notes..."
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-[#323956] text-white rounded-lg hover:bg-[#323956] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Branding Configuration
            </button>
          </div>
        </form>
      )}

      {/* Preview */}
      {renderBrandingPreview()}

      {/* Current Configuration Display */}
      {brandingData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Configuration</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-sm text-gray-600 whitespace-pre-wrap">
              {JSON.stringify(brandingData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandingConfiguration;