import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Bell, ArrowLeft, Clock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import NotificationService from '../../services/notificationService';
import { hashPassword } from '../../utils/passwordUtils';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

// API Base URL for backend email
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const PendingClinicsNotification = ({ onUpdate, autoShow = true, variant = 'hidden' }) => {
  const [pendingClinics, setPendingClinics] = useState([]);
  const [pendingSuperAdmins, setPendingSuperAdmins] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hasAutoShown, setHasAutoShown] = useState(
    () => sessionStorage.getItem('pendingClinicsModalShown') === 'true'
  );

  // Detail view state
  const [detailClinic, setDetailClinic] = useState(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectRemark, setRejectRemark] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  useEffect(() => {
    loadPendingItems();

    // Refresh every 30 seconds
    const interval = setInterval(loadPendingItems, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-show modal when there are pending clinics (only once per page session)
  useEffect(() => {
    if (autoShow && !hasAutoShown && pendingClinics.length > 0) {
      setShowModal(true);
      setHasAutoShown(true);
      sessionStorage.setItem('pendingClinicsModalShown', 'true');
    }
  }, [pendingClinics, autoShow, hasAutoShown]);

  const loadPendingItems = async () => {
    try {
      // Load pending clinics
      const clinics = await DatabaseService.get('clinics') || [];
      const pendingClinics = clinics.filter(c =>
        (c.subscription_status === 'pending_approval' || c.subscriptionStatus === 'pending_approval') ||
        (c.subscription_status === 'pending' || c.subscriptionStatus === 'pending') ||
        (!c.is_active && !c.isActive)
      );
      setPendingClinics(pendingClinics);

      // Super admins are now active immediately, no pending approval needed
      setPendingSuperAdmins([]);
    } catch (error) {
      console.error('Error loading pending items:', error);
    }
  };

  const activateClinic = async (clinic, contractAgreed = false) => {
    try {
      setLoading(true);
      setSelectedItem(clinic);

      // Generate random password
      const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$';
        let password = '';
        for (let i = 0; i < 12; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
      };

      const newPassword = generatePassword();
      const hashedPassword = await hashPassword(newPassword);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Update clinic data
      const updatedClinic = {
        ...clinic,
        is_active: true,
        isActive: true,
        subscription_status: 'active',
        subscriptionStatus: 'active',
        password: hashedPassword,
        trial_start_date: new Date().toISOString(),
        trial_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days trial
        reports_allowed: 10,
        reports_used: 0,
        // contract_agreed not saved — column not yet in DB
        updated_at: new Date().toISOString()
      };

      // Save updated clinic
      await DatabaseService.update('clinics', clinic.id, updatedClinic);

      // Send approval email with credentials
      try {
        const emailResponse = await fetch(`${API_BASE_URL}/clinic-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicName: clinic.name || clinic.clinic_name,
            email: clinic.email,
            contactPerson: clinic.contact_person || clinic.name,
            password: newPassword,
            otp: otp
          })
        });
        const emailResult = await emailResponse.json();
        if (!emailResult.success) {
          console.error('Email API returned failure:', emailResult.message);
        }
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }

      toast.success(`${clinic.name} approved successfully! Credentials sent via email.`);

      // Create admin notification
      NotificationService.notifyClinicApproved({
        clinicId: clinic.id,
        clinicName: clinic.name || clinic.clinic_name
      }).catch((err) => console.error('Notification failed:', err));

      // Close detail view and refresh
      setDetailClinic(null);
      setShowRejectForm(false);
      setRejectRemark('');
      await loadPendingItems();
      if (onUpdate) onUpdate();

    } catch (error) {
      console.error('Activation error:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to approve the clinic. Please try again.'));
    } finally {
      setLoading(false);
      setSelectedItem(null);
    }
  };

  const rejectClinic = async (clinic) => {
    if (!rejectRemark.trim()) {
      toast.error('Please enter a reason for rejection.');
      return;
    }

    try {
      setRejectLoading(true);

      // Send rejection email first
      try {
        const emailResponse = await fetch(`${API_BASE_URL}/clinic-rejection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicName: clinic.name || clinic.clinic_name,
            email: clinic.email,
            contactPerson: clinic.contact_person || clinic.name,
            remark: rejectRemark.trim()
          })
        });
        const emailResult = await emailResponse.json();
        if (!emailResult.success) {
          console.error('Rejection email failed:', emailResult.message);
        }
      } catch (emailError) {
        console.error('Rejection email error:', emailError);
      }

      // Delete the clinic record
      await DatabaseService.delete('clinics', clinic.id);

      toast.success(`${clinic.name} registration rejected. Email sent to the clinic.`);

      // Close detail view and refresh
      setDetailClinic(null);
      setShowRejectForm(false);
      setRejectRemark('');
      await loadPendingItems();
      if (onUpdate) onUpdate();

    } catch (error) {
      console.error('Rejection error:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to reject the clinic. Please try again.'));
    } finally {
      setRejectLoading(false);
    }
  };

  const openDetail = (clinic, startRejecting = false) => {
    setDetailClinic(clinic);
    setShowRejectForm(startRejecting);
    setRejectRemark('');
  };

  const closeDetail = () => {
    setDetailClinic(null);
    setShowRejectForm(false);
    setRejectRemark('');
  };

  const pendingCount = pendingClinics.length + pendingSuperAdmins.length;

  // ── Detail Modal ────────────────────────────────────────────────────────────
  const DetailModal = ({ clinic }) => {
    const isLoading = loading && selectedItem?.id === clinic.id;
    const [contractAgreed, setContractAgreed] = useState(
      clinic?.contract_agreed || clinic?.contractAgreed || false
    );

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-[60] flex items-start justify-center pt-4 sm:pt-8 px-2">
        <div className="relative w-full max-w-md p-4 sm:p-5 border shadow-lg rounded-lg bg-white max-h-[85vh] overflow-y-auto mb-4">

          {/* Header — same style as ClinicManagement form */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">
              Pending Registration Details
            </h3>
            <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 p-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>

          {/* Form fields — same style as Add/Edit Clinic form */}
          <div className="space-y-3">

            {/* Registered On */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Registered On</label>
              <input
                readOnly
                value={clinic.created_at || clinic.createdAt ? new Date(clinic.created_at || clinic.createdAt).toLocaleString() : ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input
                readOnly
                value={
                  (() => {
                    const t = clinic.clinic_type || clinic.clinicType || '';
                    if (t === 'lbl_clinic') return 'Clinic';
                    if (t === 'lbl_partner') return 'Partner';
                    return '—';
                  })()
                }
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800"
              />
            </div>

            {/* Clinic/Partner Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {(clinic.clinic_type || clinic.clinicType) === 'lbl_partner' ? 'Partner Name' : 'Clinic Name'}
              </label>
              <input
                readOnly
                value={clinic.name || clinic.clinic_name || ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800 uppercase"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
              <input
                readOnly
                value={clinic.city || ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800 uppercase"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                readOnly
                value={clinic.email || ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800"
              />
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
              <input
                readOnly
                value={clinic.contact_person || clinic.contactPerson || ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800 uppercase"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                readOnly
                value={clinic.phone ? `${clinic.country_code || clinic.countryCode || ''} ${clinic.phone}`.trim() : ''}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
              <textarea
                readOnly
                value={clinic.address || ''}
                rows="2"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-800 uppercase resize-none"
              />
            </div>

            {/* Contract checkbox */}
            <div className="flex items-center gap-3 pt-1 pb-1 border-t border-gray-100 mt-2">
              <div className="h-4 w-4 rounded bg-blue-600 border-blue-600 border flex items-center justify-center flex-shrink-0">
                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <label className="text-sm text-gray-700 font-medium cursor-default select-none">
                Received Signed Contract &amp; Agreements
              </label>
            </div>

            {/* ── Reject remark area ── */}
            {showRejectForm && (
              <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <p className="text-red-700 font-semibold text-sm mb-2">
                  Reason for Rejection <span className="text-red-500">*</span>
                </p>
                <textarea
                  className="w-full border border-red-300 rounded-lg p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                  rows={3}
                  placeholder="Enter reason for rejecting this registration…"
                  value={rejectRemark}
                  onChange={(e) => setRejectRemark(e.target.value)}
                />
                <p className="text-xs text-red-500 mt-1">This reason will be included in the rejection email sent to the clinic.</p>
              </div>
            )}
          </div>

          {/* Footer action buttons */}
          <div className="flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-200">
            {!showRejectForm ? (
              <>
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={isLoading}
                  className="px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => activateClinic(clinic, contractAgreed)}
                  disabled={isLoading}
                  className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50"
                >
                  {isLoading ? 'Approving…' : 'Approve & Send Email'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setShowRejectForm(false); setRejectRemark(''); }}
                  disabled={rejectLoading}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => rejectClinic(clinic)}
                  disabled={rejectLoading || !rejectRemark.trim()}
                  className="px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rejectLoading ? 'Rejecting…' : 'Confirm Reject & Send Email'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Trigger — badge variant shown in page heading */}
      {variant === 'badge' && (
        <button
          onClick={() => setShowModal(true)}
          className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
            pendingCount > 0
              ? 'border-orange-400 text-orange-700 bg-orange-50 shadow-[0_0_8px_2px_rgba(251,146,60,0.4)] animate-pulse hover:animate-none hover:bg-orange-100'
              : 'border-green-300 text-green-700 bg-green-50'
          }`}
          title="Pending approvals"
        >
          <Bell className="h-4 w-4" />
          <span>Pending Approval</span>
          {pendingCount > 0 && (
            <span className="flex items-center justify-center min-w-[20px] h-5 bg-orange-500 text-white text-[11px] font-bold rounded-full px-1">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      )}

      {/* List Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="w-6 h-6" />
                  <div>
                    <h2 className="text-2xl font-bold">Pending Clinic Registrations</h2>
                    <p className="text-blue-100 text-sm mt-1">
                      {pendingCount} clinic{pendingCount !== 1 ? 's' : ''} awaiting approval
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
              {pendingCount === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                  <p className="text-gray-600">No pending clinic registrations at this time.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingClinics.map((clinic) => (
                    <div
                      key={clinic.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-gradient-to-r from-yellow-50 to-orange-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Clinic Info */}
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
                              {(clinic.name || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900 text-lg">{clinic.name || clinic.clinic_name}</h3>
                              <div className="flex items-center space-x-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                <span>Registered: {new Date(clinic.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center space-x-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-700">{clinic.email}</span>
                            </div>
                            {clinic.phone && (
                              <div className="flex items-center space-x-2">
                                <span className="text-gray-400">📞</span>
                                <span className="text-gray-700">
                                  {clinic.country_code} {clinic.phone}
                                </span>
                              </div>
                            )}
                            {clinic.address && (
                              <div className="flex items-start space-x-2 col-span-2">
                                <span className="text-gray-400">📍</span>
                                <span className="text-gray-700 text-xs">{clinic.address}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions — both open the detail view */}
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => openDetail(clinic)}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Approve &amp; Send Email</span>
                          </button>
                          <button
                            onClick={() => openDetail(clinic, true)}
                            className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal — rendered on top of list modal */}
      {detailClinic && <DetailModal clinic={detailClinic} />}
    </>
  );
};

export default PendingClinicsNotification;
