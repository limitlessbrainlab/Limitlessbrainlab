import React, { useState, useEffect } from 'react';
import {
  Database,
  Users,
  FileText,
  Download,
  Search,
  Filter,
  Eye,
  Calendar,
  Brain,
  Activity,
  Heart,
  ChevronRight,
  FolderOpen,
  File,
  User,
  Building2,
  MapPin,
  Mail,
  Phone,
  Clock,
  CheckCircle,
  AlertTriangle,
  Star,
  Archive,
  Trash2,
  Shield,
  Lock,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import QEEGFileViewer from './QEEGFileViewer';
import PersonalizedCarePlan from './PersonalizedCarePlan';
import fileManagementService from '../../services/fileManagementService';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';
import { supabase } from '../../lib/supabaseClient';

const DataAccess = () => {
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [viewMode, setViewMode] = useState('clinics'); // 'clinics', 'patients', 'files'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [clinics, setClinics] = useState([]);
  const [patients, setPatients] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showQEEGViewer, setShowQEEGViewer] = useState(false);
  const [showCarePlan, setShowCarePlan] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(null);

  useEffect(() => {
    loadClinics();
  }, []);

  // Enhanced file download functionality
  const handleDownloadFile = async (fileId, fileType, patientId = null) => {
    try {

      const result = await fileManagementService.downloadReport(fileId, patientId, fileType);

      if (result.success) {
        toast.success(`Downloaded: ${result.filename}`);
      } else {
        toast.error(getFriendlyErrorMessage(result.error, 'Failed to download the file. Please try again.'));
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  };

  // Generate new report
  const handleGenerateReport = async (type, patientId) => {
    try {

      let reportData;
      switch (type) {
        case 'qeeg':
          reportData = await fileManagementService.generateQEEGReport(patientId);
          break;
        case 'careplan':
          reportData = await fileManagementService.generateCarePlan(patientId);
          break;
        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      // Download the generated report
      await fileManagementService.downloadReport(reportData.id, patientId, 'html');

      toast.success(`${type.toUpperCase()} report generated and downloaded`);

      // Refresh file list
      loadRealData();

    } catch (error) {
      console.error('Report generation error:', error);
      toast.error('Failed to generate report');
    }
  };

  const loadClinics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('id, name, email, phone, city, is_active, created_at')
        .order('name');
      if (error) throw error;
      setClinics(data || []);
    } catch (error) {
      console.error('Error loading clinics:', error);
      toast.error('Failed to load clinics');
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async (clinicId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, email, phone, gender, status, created_at, clinic_id')
        .eq('clinic_id', clinicId)
        .order('name');
      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (patientId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('algorithm_results')
        .select('id, algorithm_name, pdf_url, status, created_at, updated_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(r => ({
        id: r.id,
        name: r.algorithm_name || 'Report',
        type: 'neurosense_report',
        status: r.status || 'complete',
        created: r.created_at,
        modified: r.updated_at,
        pdf_url: r.pdf_url,
      }));
      setFiles(mapped);
    } catch (error) {
      console.error('Error loading files:', error);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handleClinicSelect = (clinic) => {
    setSelectedClinic(clinic);
    setSelectedPatient(null);
    setViewMode('patients');
    loadPatients(clinic.id);
  };

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setViewMode('files');
    loadFiles(patient.id);
  };

  const handleBackToClinics = () => {
    setSelectedClinic(null);
    setSelectedPatient(null);
    setViewMode('clinics');
    setSearchTerm('');
  };

  const handleBackToPatients = () => {
    setSelectedPatient(null);
    setViewMode('patients');
    setSearchTerm('');
  };

  const downloadFile = (file) => {
    toast.success(`Downloading ${file.name}...`);
    // Implement actual download logic here
  };

  const viewFile = (file) => {
    setSelectedFileId(file.id);

    switch (file.type) {
      case 'qeeg_profile':
        setShowQEEGViewer(true);
        break;
      case 'care_plan':
        setShowCarePlan(true);
        break;
      case 'patient_profile':
      case 'neurosense_report':
      default:
        toast.info(`Opening ${file.name} in viewer...`);
        // For other file types, implement generic viewer or download
        break;
    }
  };

  const getFileIcon = (type) => {
    switch (type) {
      case 'patient_profile':
        return <User className="w-5 h-5 text-[#323956]" />;
      case 'qeeg_profile':
        return <Brain className="w-5 h-5 text-purple-500" />;
      case 'neurosense_report':
        return <Activity className="w-5 h-5 text-[#323956]" />;
      case 'care_plan':
        return <Heart className="w-5 h-5 text-red-500" />;
      default:
        return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const getFileTypeLabel = (type) => {
    switch (type) {
      case 'patient_profile':
        return 'Patient Profile';
      case 'qeeg_profile':
        return 'qEEG Profile';
      case 'neurosense_report':
        return 'Brain Wellness Report';
      case 'care_plan':
        return 'Care Plan';
      default:
        return 'Unknown';
    }
  };

  const filteredData = () => {
    let data = [];

    if (viewMode === 'clinics') {
      data = clinics;
    } else if (viewMode === 'patients') {
      data = patients;
    } else if (viewMode === 'files') {
      data = files;
    }

    if (searchTerm) {
      data = data.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== 'all') {
      if (viewMode === 'files') {
        data = data.filter(file => file.type === filterType);
      } else if (viewMode === 'patients') {
        data = data.filter(patient => patient.status === filterType);
      }
    }

    return data;
  };

  const renderBreadcrumb = () => (
    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
      <button
        onClick={handleBackToClinics}
        className={`hover:text-[#323956] dark:hover:text-blue-400 transition-colors ${viewMode === 'clinics' ? 'text-[#323956] dark:text-blue-400 font-medium' : ''}`}
      >
        All Clinics
      </button>
      {selectedClinic && (
        <>
          <ChevronRight className="w-4 h-4" />
          <button
            onClick={handleBackToPatients}
            className={`hover:text-[#323956] dark:hover:text-blue-400 transition-colors ${viewMode === 'patients' ? 'text-[#323956] dark:text-blue-400 font-medium' : ''}`}
          >
            {selectedClinic.name}
          </button>
        </>
      )}
      {selectedPatient && (
        <>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#323956] dark:text-blue-400 font-medium">{selectedPatient.name}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Data Access Center</h2>
            <Shield className="w-5 h-5 text-[#323956] dark:text-blue-400" title="Super Admin Access" />
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <Lock className="w-4 h-4 text-[#323956] dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">Full Access Enabled</span>
          </div>
        </div>

        {renderBreadcrumb()}

        {/* Search and Filter */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${viewMode}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {viewMode === 'files' && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All File Types</option>
              <option value="patient_profile">Patient Profiles</option>
              <option value="qeeg_profile">qEEG Profiles</option>
              <option value="neurosense_report">Brain Wellness Reports</option>
              <option value="care_plan">Care Plans</option>
            </select>
          )}

          {viewMode === 'patients' && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Patients</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading data...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Clinics View */}
          {viewMode === 'clinics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData().map(clinic => (
                <div
                  key={clinic.id}
                  onClick={() => handleClinicSelect(clinic)}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-[#CAE0FF] dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-[#323956] dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{clinic.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{clinic.location}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>

                  <div className="space-y-2 text-sm text-gray-900 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{clinic.patientsCount} patients</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span>{clinic.reportsCount} reports</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>Last active: {new Date(clinic.lastActivity).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Patients View */}
          {viewMode === 'patients' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Patients at {selectedClinic?.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {filteredData().length} patients found
                </p>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData().map(patient => (
                  <div
                    key={patient.id}
                    onClick={() => handlePatientSelect(patient)}
                    className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">{patient.name}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{patient.email}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>{patient.age} years old</span>
                            <span>{patient.gender}</span>
                            <span>{patient.totalSessions} sessions</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-sm">
                          <p className="text-gray-500 dark:text-gray-400">Last session</p>
                          <p className="text-gray-900 dark:text-white">{new Date(patient.lastSession).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files View */}
          {viewMode === 'files' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Files for {selectedPatient?.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {filteredData().length} files available
                </p>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredData().map(file => (
                  <div key={file.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          {getFileIcon(file.type)}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">{file.name}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{getFileTypeLabel(file.type)}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>{file.size}</span>
                            <span>Created: {new Date(file.created).toLocaleDateString()}</span>
                            <span>Modified: {new Date(file.modified).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => viewFile(file)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#323956] dark:hover:text-blue-400 hover:bg-[#E4EFFF] dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="View file"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => downloadFile(file)}
                          className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#323956] dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredData().length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
              <FolderOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No data found</h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchTerm ? 'Try adjusting your search terms.' : 'No items to display.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#CAE0FF] dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#323956] dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Clinics</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{clinics.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Patients</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {clinics.reduce((sum, clinic) => sum + clinic.patientsCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#323956] dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Reports</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {clinics.reduce((sum, clinic) => sum + clinic.reportsCount, 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Data Access</p>
              <p className="text-xl font-bold text-[#323956] dark:text-blue-400">Full</p>
            </div>
          </div>
        </div>
      </div>

      {/* qEEG File Viewer Modal */}
      {showQEEGViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-7xl w-full max-h-[95vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">qEEG Analysis Viewer</h3>
              <button
                onClick={() => setShowQEEGViewer(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <QEEGFileViewer
                fileId={selectedFileId}
                patientId={selectedPatient?.id}
                onClose={() => setShowQEEGViewer(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Care Plan Modal */}
      {showCarePlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl w-full max-h-[95vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Personalized Care Plan</h3>
              <button
                onClick={() => setShowCarePlan(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <PersonalizedCarePlan
                patientId={selectedPatient?.id}
                clinicId={selectedClinic?.id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataAccess;