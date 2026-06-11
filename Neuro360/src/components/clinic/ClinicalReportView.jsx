import React, { useState, useEffect } from 'react';
import { X, FileText, Users, Activity, Pill, Heart, Home, Download, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import toast from 'react-hot-toast';

const ClinicalReportView = ({ patient, onClose }) => {
  const [reportData, setReportData] = useState(null);
  const [allDocuments, setAllDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setIsLoading(true);

        const docs = [];

        // 1. Fetch from reports table (uploaded EDF/report files)
        const { data: reports, error: reportsError } = await supabase
          .from('reports')
          .select('*')
          .eq('patient_id', patient.id)
          .order('created_at', { ascending: false });

        if (reportsError) console.error('Error fetching reports:', reportsError);

        if (reports && reports.length > 0) {
          setReportData(reports[0]); // Keep first for header display
          reports.forEach(r => {
            docs.push({
              id: r.id,
              fileName: r.file_name || r.report_data?.title || 'Report',
              type: r.report_data?.reportType || 'Report',
              uploadedBy: r.report_data?.uploadedBy || 'Unknown',
              uploadedAt: r.created_at,
              url: r.report_data?.fileUrl || r.file_path || null,
              filePath: r.file_path,
              bucket: 'neurosense-reports',
              source: 'reports',
              status: r.status
            });
          });
        }

        // 2. Fetch from clinical_documentation table (clinic uploads)
        const { data: clinDocs, error: clinDocsError } = await supabase
          .from('clinical_documentation')
          .select('*')
          .eq('patient_id', patient.id)
          .order('created_at', { ascending: false });

        if (clinDocsError) console.error('Error fetching clinical_documentation:', clinDocsError);

        if (clinDocs && clinDocs.length > 0) {
          clinDocs.forEach(doc => {
            if (doc.file_urls && typeof doc.file_urls === 'object') {
              Object.entries(doc.file_urls).forEach(([key, fileInfo]) => {
                if (fileInfo && (fileInfo.url || fileInfo.path)) {
                  docs.push({
                    id: `${doc.id}_${key}`,
                    fileName: fileInfo.originalName || fileInfo.fileName || key,
                    type: fileInfo.documentType || fileInfo.type || key,
                    uploadedBy: fileInfo.uploadedBy || 'Clinic',
                    uploadedAt: fileInfo.uploadedAt || doc.created_at,
                    url: fileInfo.url,
                    filePath: fileInfo.path,
                    bucket: 'patients_documents',
                    source: 'clinical_documentation'
                  });
                }
              });
            }
          });
        }

        // 3. Fetch from clinical_reports table (clinical examination uploads)
        const { data: clinReports, error: clinRepError } = await supabase
          .from('clinical_reports')
          .select('*')
          .eq('patient_id', patient.id)
          .order('created_at', { ascending: false });

        if (clinRepError) console.error('Error fetching clinical_reports:', clinRepError);

        if (clinReports && clinReports.length > 0) {
          if (!reportData) setReportData(clinReports[0]);
          clinReports.forEach(report => {
            if (report.uploaded_documents && Array.isArray(report.uploaded_documents)) {
              report.uploaded_documents.forEach((doc, idx) => {
                docs.push({
                  id: `${report.id}_doc_${idx}`,
                  fileName: doc.fileName || 'Document',
                  type: doc.type || 'Clinical Document',
                  uploadedBy: doc.uploadedBy || 'Clinic',
                  uploadedAt: doc.uploadedAt || report.created_at,
                  url: doc.url,
                  filePath: doc.path,
                  bucket: doc.bucket || 'patients_documents',
                  source: 'clinical_reports'
                });
              });
            }
          });
        }

        setAllDocuments(docs);

        if (docs.length === 0 && !reportData) {
          toast.error('No documents found for this patient');
        }
      } catch (error) {
        console.error('Error:', error);
        toast.error('Failed to load patient documents');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [patient.id]);

  const handleDownload = async (doc) => {
    try {
      let downloadUrl = doc.url;

      // If no direct URL, try to get signed URL from bucket
      if (!downloadUrl && doc.filePath && doc.bucket) {
        const { data: signedData, error } = await supabase.storage
          .from(doc.bucket)
          .createSignedUrl(doc.filePath, 300);
        if (!error && signedData?.signedUrl) {
          downloadUrl = signedData.signedUrl;
        }
      }

      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      } else {
        toast.error('Unable to download file. File may not exist.');
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Download failed');
    }
  };

  const getAge = (dob) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: true });
  };

  const renderCheckboxList = (data, labelMap) => {
    if (!data) return <p className="text-gray-500 text-sm">No data available</p>;

    const items = Object.entries(data)
      .filter(([key, value]) => key !== 'other' && value === true)
      .map(([key]) => labelMap[key] || key);

    if (items.length === 0 && !data.other) {
      return <p className="text-gray-500 text-sm">None reported</p>;
    }

    return (
      <div className="space-y-1">
        {items.length > 0 && (
          <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
        {data.other && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
            <span className="font-semibold">Other:</span> {data.other}
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading clinical report...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Report Found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              No clinical report available for this patient yet.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const presentingComplaintsLabels = {
    headaches: 'Headaches / Migraines',
    seizures: 'Seizures / Epileptic Episodes',
    dizziness: 'Dizziness / Balance Problems',
    attention: 'Attention / Concentration Difficulties',
    memory: 'Memory Issues',
    sleep: 'Sleep Disturbances',
    anxiety: 'Anxiety / Panic Symptoms',
    depression: 'Depression / Low Mood',
    irritability: 'Irritability / Emotional Dysregulation',
    fatigue: 'Fatigue / Low Energy'
  };

  const symptomDurationLabels = {
    sudden: 'Sudden Onset',
    gradual: 'Gradual Onset',
    acute: 'Acute (<1 month)',
    subacute: 'Subacute (1–6 months)',
    chronic: 'Chronic (>6 months)'
  };

  const pastMedicalHistoryLabels = {
    neurological: 'Neurological Disorders',
    psychiatric: 'Psychiatric Disorders',
    cardiovascular: 'Cardiovascular Conditions',
    endocrine: 'Endocrine/Metabolic',
    chronicPain: 'Chronic Pain / Fibromyalgia'
  };

  const medicationsLabels = {
    antidepressants: 'Antidepressants',
    anxiolytics: 'Anxiolytics / Benzodiazepines',
    antipsychotics: 'Antipsychotics',
    moodStabilizers: 'Mood Stabilizers',
    antiepileptics: 'Antiepileptics / Anticonvulsants',
    stimulants: 'Stimulants (ADHD medications)',
    sleepAids: 'Sleep Aids / Sedatives'
  };

  const familyHistoryLabels = {
    epilepsy: 'Epilepsy / Seizures',
    dementia: 'Dementia / Cognitive Decline',
    adhd: 'ADHD / Learning Disorders',
    moodDisorders: 'Mood Disorders',
    anxiety: 'Anxiety / OCD',
    substanceAbuse: 'Substance Abuse'
  };

  // Check if this is an uploaded EDF file (from reports table) or clinical report
  const isUploadedEDF = reportData.file_name && reportData.file_path;
  const isProcessing = reportData.status === 'processing';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between ${isUploadedEDF ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-green-600 to-teal-600'}`}>
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-full">
              <Eye className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {isUploadedEDF ? 'Patient Documents' : 'Clinical Report - View Only'}
              </h2>
              <p className="text-sm text-green-100">Patient ID: {patient.external_id || patient.externalId || patient.patient_uid || reportData?.patient_uid || ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isUploadedEDF ? (
            /* Show All Patient Documents */
            <>
              {/* Patient Info */}
              <section className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Patient Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoField label="Full Name" value={patient.fullName || patient.full_name || patient.name || 'N/A'} />
                  <InfoField label="Patient ID" value={patient.external_id || patient.externalId || patient.patient_uid || 'N/A'} />
                  <InfoField label="Date of Birth" value={`${formatDate(patient.dateOfBirth || patient.date_of_birth)} (Age: ${getAge(patient.dateOfBirth || patient.date_of_birth)} years)`} />
                  <InfoField label="Gender" value={patient.gender || 'N/A'} />
                  <InfoField label="Email" value={patient.email || 'N/A'} />
                  <InfoField label="Phone" value={patient.phone || patient.contactNumber || patient.contact_number || 'N/A'} />
                  <InfoField label="Address" value={patient.address || 'N/A'} />
                  <InfoField label="Handedness" value={patient.handedness || 'N/A'} />
                  <InfoField label="Occupation" value={patient.occupation || 'N/A'} />
                  <InfoField label="Registered" value={formatDate(patient.created_at || patient.createdAt)} />
                </div>
              </section>

              {/* All Documents */}
              <section className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-5">
                <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-4 flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  All Documents ({allDocuments.length})
                </h3>
                {allDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {allDocuments.map((doc, idx) => {
                      const isFromAdmin = doc.source === 'reports';
                      return (
                      <div key={doc.id || idx} className={`flex items-center justify-between p-4 rounded-lg border hover:shadow-md transition-shadow ${
                        isFromAdmin
                          ? 'bg-[#f0f3f9] border-[#323956]/30'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}>
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isFromAdmin ? 'bg-[#323956]' : 'bg-[#CAE0FF]'
                          }`}>
                            <FileText className={`h-5 w-5 ${isFromAdmin ? 'text-white' : 'text-[#323956]'}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.fileName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Type: {doc.type} &bull; By: {doc.uploadedBy} &bull; {formatDate(doc.uploadedAt)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {doc.status && (
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                  doc.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>{doc.status}</span>
                              )}
                              {isFromAdmin && (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#323956] text-white">Neurosense Performance Report</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(doc)}
                          className="ml-3 p-2 text-[#323956] hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                          title="Download"
                        >
                          <Download className="h-5 w-5" />
                        </button>
                      </div>
                    );})}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">No documents found for this patient</p>
                )}
              </section>
            </>
          ) : (
            /* Show Full Clinical Report */
            <>
              {/* 1. Patient Information */}
              <section className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
                <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-4 flex items-center bg-blue-100 dark:bg-blue-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
                  <Users className="h-5 w-5 mr-2" />
                  1. Patient Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <InfoField label="Full Name" value={reportData.full_name} />
                  <InfoField label="Date of Birth" value={`${formatDate(reportData.date_of_birth)} (Age: ${getAge(reportData.date_of_birth)} years)`} />
                  <InfoField label="Gender" value={reportData.gender || 'N/A'} />
                  <InfoField label="Handedness" value={reportData.handedness || 'N/A'} />
                  <InfoField label="Occupation" value={reportData.occupation || 'N/A'} />
                  <InfoField label="Patient ID" value={reportData.patient_uid} />
                  <InfoField label="Date of Test" value={formatDate(reportData.date_of_test)} />
                  <InfoField label="Referring Physician" value={reportData.referring_physician || 'N/A'} />
                  <div className="md:col-span-2">
                    <InfoField label="Reason for Referral" value={reportData.referral_reason || 'N/A'} />
                  </div>
                </div>
              </section>

              {/* 2. Clinical & Medical History */}
              <section className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-5">
            <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-4 flex items-center bg-green-100 dark:bg-green-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
              <Activity className="h-5 w-5 mr-2" />
              2. Clinical & Medical History
            </h3>
            <div className="space-y-4 mt-4">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-2">Presenting Complaints:</p>
                {renderCheckboxList(reportData.presenting_complaints, presentingComplaintsLabels)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-2">Duration & Onset of Symptoms:</p>
                {renderCheckboxList(reportData.symptom_duration, symptomDurationLabels)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white mb-2">Past Medical History:</p>
                {renderCheckboxList(reportData.past_medical_history, pastMedicalHistoryLabels)}
              </div>
            </div>
          </section>

          {/* 3. Medication History */}
          <section className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-5">
            <h3 className="text-lg font-bold text-purple-900 dark:text-purple-100 mb-4 flex items-center bg-purple-100 dark:bg-purple-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
              <Pill className="h-5 w-5 mr-2" />
              3. Medication History
            </h3>
            <div className="space-y-3 mt-4">
              {renderCheckboxList(reportData.medications, medicationsLabels)}
              {reportData.medications?.otherMeds && (
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  <span className="font-semibold">Other Medications:</span> {reportData.medications.otherMeds}
                </p>
              )}
              {reportData.medications?.recentChanges && (
                <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                  ⚠️ Recent medication changes (last 6–8 weeks)
                </p>
              )}
            </div>
          </section>

          {/* 4. Family History */}
          <section className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-5">
            <h3 className="text-lg font-bold text-orange-900 dark:text-orange-100 mb-4 flex items-center bg-orange-100 dark:bg-orange-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
              <Heart className="h-5 w-5 mr-2" />
              4. Family History
            </h3>
            <div className="mt-4">
              {renderCheckboxList(reportData.family_history, familyHistoryLabels)}
            </div>
          </section>

          {/* 5. Lifestyle & Contributing Factors */}
          <section className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-5">
            <h3 className="text-lg font-bold text-teal-900 dark:text-teal-100 mb-4 flex items-center bg-teal-100 dark:bg-teal-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
              <Home className="h-5 w-5 mr-2" />
              5. Lifestyle & Contributing Factors
            </h3>
            <div className="space-y-3 mt-4">
              <InfoField label="Sleep Hours" value={reportData.lifestyle?.sleepHours || 'N/A'} />
              <InfoField label="Substance Use" value={reportData.lifestyle?.substanceUse || 'None reported'} />
              <InfoField label="Physical Activity" value={reportData.lifestyle?.physicalActivity || 'N/A'} />
              <InfoField label="Diet/Nutrition" value={reportData.lifestyle?.dietNutrition || 'N/A'} />

              <div className="flex flex-wrap gap-2 mt-2">
                {reportData.lifestyle?.chronicStress && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full text-sm">
                    Chronic Stress
                  </span>
                )}
                {reportData.lifestyle?.caffeineStimulants && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-sm">
                    Excessive Caffeine
                  </span>
                )}
                {reportData.lifestyle?.screenTime && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-sm">
                    Screen Time Overuse
                  </span>
                )}
                {reportData.lifestyle?.occupationalStress && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-sm">
                    Occupational Stress
                  </span>
                )}
              </div>

              {reportData.lifestyle?.other && (
                <InfoField label="Other Factors" value={reportData.lifestyle.other} />
              )}
            </div>
          </section>

          {/* 6. All Patient Documents */}
          <section className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-5">
            <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-4 flex items-center bg-green-100 dark:bg-green-900/40 -mx-5 -mt-5 px-5 py-3 rounded-t-lg">
              <FileText className="h-5 w-5 mr-2" />
              6. All Documents ({allDocuments.length})
            </h3>
            {allDocuments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {allDocuments.map((doc, idx) => {
                  const isFromAdmin = doc.source === 'reports';
                  return (
                    <div key={doc.id || idx} className={`flex items-center justify-between p-4 rounded-lg border hover:shadow-md transition-shadow ${
                      isFromAdmin
                        ? 'bg-[#f0f3f9] border-[#323956]/30'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                    }`}>
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isFromAdmin ? 'bg-[#323956]' : 'bg-[#CAE0FF]'
                        }`}>
                          <FileText className={`h-5 w-5 ${isFromAdmin ? 'text-white' : 'text-[#323956]'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.fileName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Type: {doc.type} &bull; By: {doc.uploadedBy} &bull; {formatDate(doc.uploadedAt)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {doc.status && (
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                doc.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>{doc.status}</span>
                            )}
                            {isFromAdmin && (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-[#323956] text-white">Neurosense Report</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="ml-3 p-2 text-[#323956] hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                        title="Download"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4 mt-4">No documents found for this patient</p>
            )}
          </section>

              {/* Report Metadata */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm text-gray-600 dark:text-gray-400">
                <p><span className="font-semibold">Report Created:</span> {formatDate(reportData.created_at)}</p>
                <p><span className="font-semibold">Last Updated:</span> {formatDate(reportData.updated_at)}</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper Component
const InfoField = ({ label, value }) => (
  <div>
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
    <p className="text-sm text-gray-900 dark:text-white font-medium">
      {value || 'N/A'}
    </p>
  </div>
);

export default ClinicalReportView;
