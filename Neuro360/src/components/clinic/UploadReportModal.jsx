import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, UploadCloud, FileText, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import StorageService from '../../services/storageService';
import ReportWorkflowService from '../../services/reportWorkflowService';
import { useAuth } from '../../contexts/AuthContext';
import { logUploadAttempt, logUploadError } from '../../utils/uploadErrorChecker';
import SubscriptionPopup from '../admin/SubscriptionPopup';
import { supabase } from '../../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const UploadReportModal = ({ clinicId, patient, onUpload, onClose }) => {
  const { user } = useAuth();
  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm({
    defaultValues: {
      title: '',
      reportType: '',
      notes: '',
      reportFile: null,
      reportFile2: null
    }
  });

  // All state declarations MUST be at the top (React Rules of Hooks)
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSubscriptionPopup, setShowSubscriptionPopup] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [currentReports, setCurrentReports] = useState(0);
  const selectedFile = watch('reportFile');
  const selectedFile2 = watch('reportFile2');
  const selectedReportType = watch('reportType');

  // Load subscription and usage data
  useEffect(() => {
    const loadUsageData = async () => {
      if (!clinicId) return; // Guard clause

      try {
        // Load current reports count
        const reports = await DatabaseService.getReportsByClinic(clinicId);
        setCurrentReports(reports.length);

        // Load subscription data
        const subscriptions = await DatabaseService.get('subscriptions') || [];
        const clinicSubscription = subscriptions.find(sub => sub.clinicId === clinicId);
        setSubscription(clinicSubscription);
      } catch (error) {
        console.error('Error loading usage data:', error);
      }
    };

    loadUsageData();
  }, [clinicId]);

  // Debug logging when modal opens
  useEffect(() => {
    console.log('FOLDER: UploadReportModal opened with:', {
      clinicId,
      patient: patient ? { id: patient.id, name: patient.name, fullObject: patient } : null,
      user: user ? { name: user.name, role: user.role } : null
    });

    // Validate required props
    if (!clinicId) {
      console.error('ERROR: UploadReportModal: clinicId is required');
      toast.error('Clinic ID is missing');
    }
    if (!patient) {
      console.error('ERROR: UploadReportModal: patient is required');
      toast.error('Patient information is missing. Please try again.');
    }
    if (!user) {
      console.warn('WARNING: UploadReportModal: user not loaded yet');
    }
  }, [clinicId, patient, user]);

  // Early return if patient is not provided (AFTER all hooks)
  if (!patient) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Upload Data</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X size={24} />
            </button>
          </div>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 font-medium">Patient information is missing</p>
            <p className="text-gray-500 text-sm mt-2">Please close this dialog and try again</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check if clinic has reached report limit
  const checkReportLimit = async () => {
    // Check trial expiry first
    if (clinicId) {
      try {
        const clinic = await DatabaseService.findById('clinics', clinicId);
        if (clinic && clinic.trialEndDate) {
          const trialEndDate = new Date(clinic.trialEndDate);
          const now = new Date();
          if (now > trialEndDate && clinic.subscriptionStatus === 'trial') {
            // Trial expired - update status
            await DatabaseService.update('clinics', clinicId, {
              subscriptionStatus: 'expired',
              isActive: false
            });
            return { limitReached: true, reason: 'trial_expired' };
          }
        }
      } catch (error) {
        console.error('Error checking trial expiry:', error);
      }
    }

    // Check report quota
    if (subscription && subscription.status === 'active') {
      // Paid subscription - check against plan limit
      if (currentReports >= subscription.reportsAllowed) {
        return { limitReached: true, reason: 'quota_exceeded' };
      }
    } else {
      // Trial subscription - 10 report limit
      if (currentReports >= 10) {
        return { limitReached: true, reason: 'quota_exceeded' };
      }
    }

    return { limitReached: false, reason: null };
  };

  const handleSubscription = async (subscriptionData) => {
    try {
      // Save subscription to database
      await DatabaseService.add('subscriptions', subscriptionData);
      
      // Update clinic's subscription status
      await DatabaseService.update('clinics', subscriptionData.clinicId, {
        subscriptionStatus: 'active',
        reportsAllowed: subscriptionData.reportsAllowed
      });
      
      // Reload usage data
      const reports = await DatabaseService.getReportsByClinic(clinicId);
      setCurrentReports(reports.length);
      
      const subscriptions = await DatabaseService.get('subscriptions') || [];
      const clinicSubscription = subscriptions.find(sub => sub.clinicId === clinicId);
      setSubscription(clinicSubscription);
      
      toast.success('Subscription updated successfully!');
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Failed to update subscription');
    }
  };

  const onSubmit = async (data) => {
    // Check if clinic has reached report limit
    const limitCheck = await checkReportLimit();
    if (limitCheck.limitReached) {
      setShowSubscriptionPopup(true);
      if (limitCheck.reason === 'trial_expired') {
        toast.error('Your trial has expired. Please upgrade to continue uploading.');
      } else {
        toast.error('Report limit reached. Please upgrade your plan to continue uploading.');
      }
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const file = data.reportFile[0];

      // Validation: Allow medical report formats
      const validFormats = [
        '.edf', '.eeg', '.bdf',          // EEG/qEEG formats
        '.pdf',                           // PDF documents
        '.jpg', '.jpeg', '.png',          // Images
        '.doc', '.docx',                  // Word documents
        '.csv', '.txt',                   // Data files
        '.xml', '.json',                  // Structured data
        '.xlsx', '.xls',                  // Excel files
        '.dcm'                            // DICOM medical imaging
      ];
      const fileExt = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

      if (!validFormats.includes(fileExt)) {
        toast.error(`Invalid file format! Allowed formats: PDF, EDF, EEG, BDF, JPEG, PNG, DOC, DOCX, CSV, TXT, XML, JSON, XLSX, DICOM. You uploaded: ${fileExt}`);
        return;
      }

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`File too large! Maximum size is 50MB. Your file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        return;
      }

      setUploadProgress(10);

      // Fetch clinic name from database for folder naming
      let clinicName = 'unknown_clinic';
      try {
        const clinicData = await DatabaseService.findById('clinics', clinicId);
        if (clinicData?.name) {
          clinicName = clinicData.name;
        } else if (clinicData?.contact_person) {
          clinicName = clinicData.contact_person;
        }
      } catch (e) {
        clinicName = user?.clinicName || user?.name || 'unknown_clinic';
      }

      // Sanitize names for folder path
      const sanitizedClinic = clinicName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const patientName = patient?.name || patient?.full_name || patient?.fullName || 'unknown_patient';
      const sanitizedPatient = patientName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const docType = data.reportType || 'Other';
      const filePath = `${sanitizedClinic}/${sanitizedPatient}/${docType}_${sanitizedFileName}`;


      setUploadProgress(30);

      // Upload file to patients_documents bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('patients_documents')
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      setUploadProgress(60);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('patients_documents')
        .getPublicUrl(uploadData.path);


      setUploadProgress(80);

      // Handle second file upload for EEG type
      let uploadData2 = null;
      let urlData2 = null;
      if (data.reportType === 'EEG' && data.reportFile2 && data.reportFile2[0]) {
        const file2 = data.reportFile2[0];
        const sanitizedFileName2 = file2.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath2 = `${sanitizedClinic}/${sanitizedPatient}/${docType}_EyesClosed_${sanitizedFileName2}`;

        const { data: upload2, error: uploadError2 } = await supabase.storage
          .from('patients_documents')
          .upload(filePath2, file2, {
            contentType: file2.type || 'application/octet-stream',
            upsert: true
          });

        if (uploadError2) {
          throw new Error(`EEG Report file upload failed: ${uploadError2.message}`);
        }

        uploadData2 = upload2;
        const { data: url2 } = supabase.storage
          .from('patients_documents')
          .getPublicUrl(upload2.path);
        urlData2 = url2;
      }

      setUploadProgress(70);

      // Save document metadata to clinical_documentation table
      const documentTitle = data.reportType === 'Other' ? (data.title || 'Other Document') : `${docType} Report`;

      // Check if patient already has a clinical_documentation record
      const { data: existingDoc } = await supabase
        .from('clinical_documentation')
        .select('id, file_urls')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const newFileEntry = {
        path: uploadData.path,
        url: urlData.publicUrl,
        fileName: sanitizedFileName,
        originalName: file.name,
        size: file.size,
        type: file.type,
        documentType: docType,
        documentTitle: data.reportType === 'EEG' ? 'Eyes Open EEG' : documentTitle,
        notes: data.notes || '',
        uploadedBy: user?.name || user?.clinicName || user?.email || 'Unknown',
        uploadedAt: new Date().toISOString()
      };

      // Build file entries object
      const fileEntries = {};
      const fileKey1 = `uploaded_${docType}_${Date.now()}`;
      fileEntries[fileKey1] = newFileEntry;

      // Add second file entry for EEG
      if (uploadData2 && urlData2) {
        const file2 = data.reportFile2[0];
        const fileKey2 = `uploaded_${docType}_report_${Date.now() + 1}`;
        fileEntries[fileKey2] = {
          path: uploadData2.path,
          url: urlData2.publicUrl,
          fileName: file2.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
          originalName: file2.name,
          size: file2.size,
          type: file2.type,
          documentType: docType,
          documentTitle: 'Eyes Closed EEG',
          notes: data.notes || '',
          uploadedBy: user?.name || user?.clinicName || user?.email || 'Unknown',
          uploadedAt: new Date().toISOString()
        };
      }

      if (existingDoc && existingDoc.id) {
        // Add to existing record's file_urls
        const existingFileUrls = existingDoc.file_urls || {};
        Object.assign(existingFileUrls, fileEntries);

        await supabase
          .from('clinical_documentation')
          .update({
            file_urls: existingFileUrls,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDoc.id);
      } else {
        // Create new clinical_documentation record
        await supabase
          .from('clinical_documentation')
          .insert({
            patient_id: patient.id,
            clinic_id: clinicId,
            patient_name: patientName,
            file_urls: fileEntries,
            created_at: new Date().toISOString()
          });
      }

      setUploadProgress(100);

      // Send notification email to admin about EDF report upload
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const baseUrl = apiUrl.replace(/\/api\/?$/, '');
        fetch(`${baseUrl}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: user?.name || 'Clinic',
            email: user?.email || 'noreply@neurosense360.com',
            subject: `New EDF Report Uploaded - ${patientName}`,
            message: `A new report has been uploaded.\n\nClinic: ${clinicId}\nPatient: ${patientName}\nReport Type: ${data.reportType}\nUploaded at: ${new Date().toLocaleString()}`
          })
        }).catch(() => {});
      } catch (emailErr) {
        // Non-blocking — don't fail upload if email fails
      }

      toast.success(`Document uploaded successfully! Stored in: ${sanitizedClinic}/${sanitizedPatient}/`);

      onUpload();
      onClose();
      reset();
    } catch (error) {
      logUploadError(error, { clinicId, patient, user, file: data.reportFile?.[0] });
      toast.error(getFriendlyErrorMessage(error, 'Upload failed. Please try again.'));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Don't render if required props are missing
  if (!clinicId || !patient) {
    console.error('UploadReportModal: Missing required props', { clinicId, patient });
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Upload Patient Document - {patient?.name || 'Patient'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {/* Usage Warning */}
        {(() => {
          const usageInfo = subscription && subscription.status === 'active' 
            ? { used: currentReports, allowed: subscription.reportsAllowed, remaining: subscription.reportsAllowed - currentReports, isTrial: false }
            : { used: currentReports, allowed: 10, remaining: 10 - currentReports, isTrial: true };
          
          if (usageInfo.remaining <= 2) {
            return (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-orange-800 font-medium">
                      {usageInfo.remaining === 0 ? 'Report limit reached!' : 'Approaching report limit'}
                    </p>
                    <p className="text-orange-700 text-sm">
                      You've used {usageInfo.used}/{usageInfo.allowed} reports. 
                      {usageInfo.remaining === 0 ? ' Upgrade your plan to continue uploading.' : ` ${usageInfo.remaining} reports remaining.`}
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}
        
        {isUploading && (
          <div className="mb-4 p-4 bg-[#E4EFFF] border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-[#323956]" />
              <span className="text-blue-800 font-medium">Uploading file...</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-[#323956] h-2 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-[#323956] mt-1">{uploadProgress}% complete</p>
          </div>
        )}
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-2">
              Patient
            </label>
            <input
              id="patientName"
              type="text"
              disabled
              value={patient?.name || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
            />
          </div>

          <div>
            <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 mb-2">
              Document Type
            </label>
            <select
              id="reportType"
              {...register('reportType', { required: 'Document type is required' })}
              className={`w-full px-3 py-2 border ${errors.reportType ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
            >
              <option value="">Select document type</option>
              <option value="EEG">EEG Report</option>
              <option value="Lab">Lab Test Report</option>
              <option value="Prescription">Prescription</option>
              <option value="Clinical">Clinical Report</option>
              <option value="Other">Other Document</option>
            </select>
            {errors.reportType && <p className="text-red-500 text-sm mt-1">{errors.reportType.message}</p>}
          </div>

          {selectedReportType === 'Other' && (
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Document Name
              </label>
              <input
                id="title"
                type="text"
                {...register('title', { required: selectedReportType === 'Other' ? 'Document name is required' : false })}
                className={`w-full px-3 py-2 border ${errors.title ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500`}
                placeholder="Enter document name"
              />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              {...register('notes')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Add any additional notes about this report..."
            />
          </div>

          {selectedReportType === 'EEG' ? (
            <>
              {/* EEG File 1: Eyes Open */}
              <div>
                <label htmlFor="reportFile" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Eyes Open EEG
                </label>
                <label htmlFor="reportFile" className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <span className="font-medium text-primary-600 hover:text-primary-500">Upload Eyes Open EEG file</span>
                      <input
                        id="reportFile"
                        {...register('reportFile', { required: 'Eyes Open EEG file is required' })}
                        type="file"
                        accept=".edf,.eeg,.bdf,.csv,.txt,.json,.xml,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                        className="sr-only"
                        disabled={isUploading}
                      />
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">EDF, EEG, BDF, PDF, Images, Documents up to 50MB</p>
                  </div>
                </label>
                {selectedFile && selectedFile[0] && (
                  <div className="mt-2 flex items-center text-sm text-gray-500">
                    <FileText className="h-5 w-5 text-gray-400 mr-2" />
                    {selectedFile[0].name} ({((selectedFile[0].size || 0) / (1024 * 1024)).toFixed(2)} MB)
                  </div>
                )}
                {errors.reportFile && <p className="text-red-500 text-sm mt-1">{errors.reportFile.message}</p>}
              </div>

              {/* EEG File 2: Eyes Closed */}
              <div>
                <label htmlFor="reportFile2" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Eyes Closed EEG
                </label>
                <label htmlFor="reportFile2" className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <span className="font-medium text-primary-600 hover:text-primary-500">Upload Eyes Closed EEG file</span>
                      <input
                        id="reportFile2"
                        {...register('reportFile2', { required: 'Eyes Closed EEG file is required' })}
                        type="file"
                        accept=".edf,.eeg,.bdf,.csv,.txt,.json,.xml,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                        className="sr-only"
                        disabled={isUploading}
                      />
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">EDF, EEG, BDF, PDF, Images, Documents up to 50MB</p>
                  </div>
                </label>
                {selectedFile2 && selectedFile2[0] && (
                  <div className="mt-2 flex items-center text-sm text-gray-500">
                    <FileText className="h-5 w-5 text-gray-400 mr-2" />
                    {selectedFile2[0].name} ({((selectedFile2[0].size || 0) / (1024 * 1024)).toFixed(2)} MB)
                  </div>
                )}
                {errors.reportFile2 && <p className="text-red-500 text-sm mt-1">{errors.reportFile2.message}</p>}
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="reportFile" className="block text-sm font-medium text-gray-700 mb-2">
                Upload File
              </label>
              <label htmlFor="reportFile" className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-400 transition-colors">
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <span className="font-medium text-primary-600 hover:text-primary-500">Upload a file</span>
                    <input
                      id="reportFile"
                      {...register('reportFile', { required: 'File is required' })}
                      type="file"
                      accept=".pdf,.edf,.eeg,.bdf,.jpg,.jpeg,.png,.doc,.docx,.csv,.txt,.xlsx,.xls,.dcm"
                      className="sr-only"
                      disabled={isUploading}
                    />
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PDF, EDF, EEG, Images, Documents up to 50MB</p>
                  <p className="text-xs text-[#323956]">Files will be stored securely in cloud storage</p>
                </div>
              </label>
              {selectedFile && selectedFile[0] && (
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <FileText className="h-5 w-5 text-gray-400 mr-2" />
                  {selectedFile[0].name} ({((selectedFile[0].size || 0) / (1024 * 1024)).toFixed(2)} MB)
                </div>
              )}
              {errors.reportFile && <p className="text-red-500 text-sm mt-1">{errors.reportFile.message}</p>}
            </div>
          )}

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-4 py-2 bg-[#323956] text-white rounded-md hover:bg-[#232D3C] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  <span>Upload Data</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Subscription Popup */}
      <SubscriptionPopup
        isOpen={showSubscriptionPopup}
        onClose={() => setShowSubscriptionPopup(false)}
        clinicId={clinicId}
        currentUsage={currentReports}
        onSubscribe={handleSubscription}
        clinicInfo={{
          name: user?.clinicName || user?.name || 'Clinic',
          email: user?.email || '',
          phone: user?.phone || ''
        }}
      />
    </div>
  );
};

export default UploadReportModal;