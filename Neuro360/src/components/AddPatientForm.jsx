import React, { useState, useRef } from 'react';
import axios from 'axios';
import { getFriendlyErrorMessage } from '../utils/friendlyError';

const AddPatientForm = ({ userType = 'clinic', clinicId, onSuccess }) => {
  // userType: 'clinic' OR 'partner'

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: ''
  });

  const [emailStatus, setEmailStatus] = useState({
    checking: false,
    exists: false,
    message: ''
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const emailCheckTimeout = useRef(null);

  // EMAIL CHECK
  const checkEmailExists = (email) => {
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    if (!email || email.length < 5) {
      setEmailStatus({ checking: false, exists: false, message: '' });
      return;
    }

    setEmailStatus(prev => ({ ...prev, checking: true }));

    emailCheckTimeout.current = setTimeout(async () => {
      try {
        const response = await axios.post('/api/check-email-exists', { email });
        const { exists, message } = response.data;

        setEmailStatus({
          checking: false,
          exists,
          message
        });

        if (exists) {
          setErrors(prev => ({ ...prev, email: message }));
        } else {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.email;
            return newErrors;
          });
        }
      } catch (error) {
        console.error('Email check error:', error);
        setEmailStatus({
          checking: false,
          exists: false,
          message: '❌ Error checking email'
        });
      }
    }, 500);
  };

  // FORM SUBMIT
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if email status is still being checked
    if (emailStatus.checking) {
      alert('⏳ Please wait, checking email availability...');
      return;
    }

    if (emailStatus.exists) {
      alert(getFriendlyErrorMessage(emailStatus.message, 'This email address is already registered. Please use a different email.'));
      return;
    }

    // Don't allow submit if email is empty
    if (!formData.email || formData.email.trim() === '') {
      alert('❌ Email is required');
      return;
    }

    setLoading(true);

    try {
      const endpoint = userType === 'clinic'
        ? '/api/clinic/add-patient'
        : '/api/partner/add-patient';

      const response = await axios.post(endpoint, {
        clinicId,
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        address: formData.address
      });

      if (response.data.success) {
        alert('✅ Patient added successfully!');
        setFormData({
          fullName: '',
          email: '',
          password: '',
          confirmPassword: '',
          phone: '',
          dateOfBirth: '',
          gender: '',
          address: ''
        });
        setEmailStatus({ checking: false, exists: false, message: '' });
        if (onSuccess) onSuccess();
      } else {
        // Handle non-success response from backend
        alert('❌ ' + getFriendlyErrorMessage(response.data?.message, 'Failed to add the patient. Please try again.'));
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add patient';
      alert('❌ ' + getFriendlyErrorMessage(error, 'Failed to add the patient. Please try again.'));

      // If backend returned email already exists error, update email status
      if (errorMessage.includes('already registered')) {
        setEmailStatus({
          checking: false,
          exists: true,
          message: errorMessage
        });
        setErrors(prev => ({ ...prev, email: errorMessage }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="add-patient-form">
      <h2>Add New Patient</h2>
      <p className="form-subtitle">{userType === 'clinic' ? 'Clinic' : 'Partner'} Admin</p>

      {/* Full Name */}
      <div className="form-group">
        <label>Full Name *</label>
        <input
          type="text"
          placeholder="Enter patient name"
          value={formData.fullName}
          onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
          required
        />
      </div>

      {/* EMAIL WITH CHECK */}
      <div className="form-group email-group">
        <label>
          Email *
          {emailStatus.checking && <span className="checking-label">Checking...</span>}
        </label>

        <div className="email-input-wrapper">
          <input
            type="email"
            placeholder="patient@example.com"
            value={formData.email}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, email: e.target.value }));
              checkEmailExists(e.target.value);
            }}
            className={emailStatus.exists ? 'error' : ''}
            required
          />

          {!emailStatus.checking && emailStatus.exists && <span className="status-icon error">❌</span>}
          {!emailStatus.checking && !emailStatus.exists && formData.email && <span className="status-icon success">✅</span>}
          {emailStatus.checking && <span className="status-icon checking">⟳</span>}
        </div>

        {emailStatus.message && (
          <p className={`status-message ${emailStatus.exists ? 'error' : 'success'}`}>
            {emailStatus.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="form-group">
        <label>Password *</label>
        <input
          type="password"
          placeholder="Enter password"
          value={formData.password}
          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
          required
        />
      </div>

      {/* Confirm Password */}
      <div className="form-group">
        <label>Confirm Password *</label>
        <input
          type="password"
          placeholder="Re-enter password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
          required
        />
      </div>

      {/* Phone */}
      <div className="form-group">
        <label>Phone *</label>
        <input
          type="tel"
          placeholder="10 digits"
          value={formData.phone}
          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          required
        />
      </div>

      {/* Date of Birth */}
      <div className="form-group">
        <label>Date of Birth *</label>
        <input
          type="date"
          value={formData.dateOfBirth}
          onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
          required
        />
      </div>

      {/* Gender */}
      <div className="form-group">
        <label>Gender *</label>
        <select
          value={formData.gender}
          onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
          required
        >
          <option value="">Select...</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Address */}
      <div className="form-group">
        <label>Address *</label>
        <input
          type="text"
          placeholder="Enter address"
          value={formData.address}
          onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
          required
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        className="submit-btn"
        disabled={emailStatus.exists || emailStatus.checking || loading}
      >
        {loading ? 'Adding Patient...' : 'Add Patient'}
      </button>
    </form>
  );
};

export default AddPatientForm;
