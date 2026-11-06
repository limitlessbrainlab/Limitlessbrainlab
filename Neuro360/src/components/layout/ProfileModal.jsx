import React, { useState, useRef } from 'react';
import { X, Camera, User, Mail, Building, Shield, Save, CheckCircle, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

const ProfileModal = ({ isOpen, onClose, onProfileUpdate }) => {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    clinicName: user?.clinicName || '',
    phone: user?.phone || '',
    address: user?.address || '',
    avatar: user?.avatar || ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const pictureViewerRef = useRef(null);
  const [avatarUnavailable, setAvatarUnavailable] = useState(false);

  React.useEffect(() => { setAvatarUnavailable(false); }, [formData.avatar, isOpen]);

  React.useEffect(() => {
    setIsEditing(false);
    setSelectedFile(null);
    setShowSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);

  // Update form data when user changes or modal opens.
  React.useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        clinicName: user.clinicName || '',
        phone: user.phone || '',
        address: user.address || '',
        avatar: user.avatar || ''
      });
    }
  }, [user, isOpen]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        alert('Choose a JPG, PNG, WebP, or GIF image smaller than 5 MB.');
        e.target.value = '';
        return;
      }
      try {
        setUploadingAvatar(true);

        const preview = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setSelectedFile(file);
        setFormData(prev => ({ ...prev, avatar: preview }));

      } catch (error) {
        console.error('AVATAR: Error selecting file:', error);
        alert(getFriendlyErrorMessage(error, 'Could not read the selected image. Please try a different file.'));
      } finally {
        setUploadingAvatar(false);
      }
    }
  };

  const handleSave = async () => {
    if (isLoading || uploadingAvatar) return;
    if (!formData.name.trim() || !formData.clinicName.trim()) {
      alert('Enter your name and clinic/partner name.');
      return;
    }
    try {
      setIsLoading(true);

      // Upload avatar via backend API (bypasses Supabase RLS)
      let avatarUrl = formData.avatar;
      if (selectedFile) {
        try {

          // Convert file to base64
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });

          const response = await fetch(`${API_URL}/upload-avatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64,
              fileName: selectedFile.name,
              userId: user.id,
              userRole: user.role || 'user',
              contentType: selectedFile.type
            })
          });

          const result = await response.json();

          if (result.success) {
            avatarUrl = result.url;
          } else {
            throw new Error(result.message || 'Avatar upload failed');
          }
        } catch (uploadError) {
          console.error('AVATAR: Upload error:', uploadError);
          alert(getFriendlyErrorMessage(uploadError, 'Failed to upload your profile photo. Please try again.'));
          setIsLoading(false);
          return;
        }
      }

      const { email, ...dataToSave } = { ...formData, avatar: avatarUrl };

      // Persist the profile before reporting success.
      const result = await updateUser(dataToSave);

      if (result.success) {
        setShowSuccess(true);
        setSelectedFile(null); // Clear selected file after successful save

        // Call the callback to update parent component with new profile data
        if (onProfileUpdate) {
          onProfileUpdate({ ...dataToSave });
        } else {
          console.warn('WARNING: onProfileUpdate callback not provided');
        }

        setTimeout(() => {
          setIsEditing(false);
          setShowSuccess(false);
          onClose();
        }, 1500);
      } else {
        console.error('=== PROFILE SAVE FAILED ===');
        console.error('ERROR: Failed to save profile:', result.error);
        alert(getFriendlyErrorMessage(result.error, 'Failed to save your profile. Please try again.'));
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(getFriendlyErrorMessage(error, 'Failed to update your profile. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleColor = () => {
    switch (user?.role) {
      case 'super_admin': return 'bg-gradient-to-r from-red-500 to-pink-500';
      case 'clinic_admin': return 'bg-gradient-to-r from-[#E4EFFF]0 to-indigo-500';
      default: return 'bg-gradient-to-r from-green-500 to-emerald-500';
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'super_admin': return 'Super Admin';
      case 'clinic_admin': return 'Clinic Admin';
      default: return 'User';
    }
  };

  const getProfileInitial = () => {
    try {
      if (user?.role === 'super_admin' && user?.clinicName) {
        return user.clinicName.charAt(0).toUpperCase();
      }
      if (user?.role === 'clinic_admin' && user?.clinicName) {
        return user.clinicName.charAt(0).toUpperCase();
      }
      if (user?.role === 'super_admin' && user?.name) {
        return user.name.charAt(0).toUpperCase();
      }
      if (user?.name && typeof user.name === 'string' && user.name.length > 0) {
        return user.name.charAt(0).toUpperCase();
      }
      return 'U';
    } catch (error) {
      return 'U';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Profile Settings</h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              aria-label="Close profile settings"
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Profile Picture Section */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg ${getRoleColor()}`}>
                {formData.avatar && !avatarUnavailable ? (
                  <img
                    src={formData.avatar}
                    alt="Profile"
                    onError={() => setAvatarUnavailable(true)}
                    className="w-24 h-24 rounded-2xl object-cover"
                  />
                ) : (
                  getProfileInitial()
                )}
              </div>
              {isEditing && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Change profile picture"
                  disabled={uploadingAvatar || isLoading}
                  className="absolute -bottom-2 -right-2 p-2 bg-[#323956] dark:bg-blue-600 text-white rounded-full shadow-lg hover:bg-[#323956] dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
            {formData.avatar && !avatarUnavailable && (
              <button
                type="button"
                onClick={() => pictureViewerRef.current?.showModal()}
                className="text-sm font-medium text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                View profile picture
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name || 'User'}</h3>
              <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full text-black dark:text-white ${getRoleColor()}`}>
                {getRoleLabel()}
              </span>
            </div>
          </div>
        </div>

        {/* Profile Information */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <User className="h-4 w-4 inline mr-2" />
              Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={!isEditing || isLoading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Mail className="h-4 w-4 inline mr-2" />
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              readOnly
              disabled
              title="Email is used to sign in and cannot be changed here"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-not-allowed"
            />
          </div>

          {(user?.role === 'clinic_admin' || (user?.role === 'super_admin' && user?.clinicName)) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Building className="h-4 w-4 inline mr-2" />
                Clinic Name
              </label>
              <input
                type="text"
                name="clinicName"
                value={formData.clinicName}
                onChange={handleInputChange}
                disabled={!isEditing || isLoading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Phone className="h-4 w-4 inline mr-2" />
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              disabled={!isEditing || isLoading}
              placeholder="Enter phone number"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <MapPin className="h-4 w-4 inline mr-2" />
              Address
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={!isEditing || isLoading}
              placeholder="Enter clinic address"
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-gray-800 resize-none"
            />
          </div>


          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Shield className="h-4 w-4 inline mr-2" />
              Role
            </label>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
              <span className={`inline-block px-2 py-1 text-xs font-semibold rounded text-black dark:text-white ${getRoleColor()}`}>
                {getRoleLabel()}
              </span>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {showSuccess && (
          <div className="p-4 mx-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-400">
                  Profile saved successfully!
                </p>
              </div>
            </div>
          </div>
        )}

        {user?.role === 'clinic_admin' && (
        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex space-x-3">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 flex items-center justify-center px-4 py-2 bg-[#323956] dark:bg-blue-600 text-white rounded-lg hover:bg-[#323956] dark:hover:bg-blue-700 transition-colors"
            >
              <User className="h-4 w-4 mr-2" />
              Edit Profile
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedFile(null);
                  setFormData({ name: user.name || '', email: user.email || '', clinicName: user.clinicName || '', phone: user.phone || '', address: user.address || '', avatar: user.avatar || '' });
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading || uploadingAvatar || showSuccess}
                className="flex-1 flex items-center justify-center px-4 py-2 bg-[#323956] dark:bg-blue-600 text-white rounded-lg hover:bg-[#323956] dark:hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </>
          )}
        </div>
        )}
      </div>
      <dialog
        ref={pictureViewerRef}
        aria-label="Profile picture"
        className="m-auto w-[92vw] max-w-4xl max-h-[90vh] rounded-xl bg-white dark:bg-gray-800 p-4 shadow-2xl backdrop:bg-black/80"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Profile picture</h3>
          <button
            type="button"
            autoFocus
            aria-label="Close profile picture"
            onClick={() => pictureViewerRef.current?.close()}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {avatarUnavailable ? (
          <p role="status" className="text-gray-700 dark:text-gray-200">Unable to load the profile picture.</p>
        ) : formData.avatar && (
          <img src={formData.avatar} alt={`${user?.name || 'User'}'s full profile picture`}
            onError={() => setAvatarUnavailable(true)}
            className="w-full h-[70vh] object-contain" />
        )}
      </dialog>
    </div>
  );
};

export default ProfileModal;
