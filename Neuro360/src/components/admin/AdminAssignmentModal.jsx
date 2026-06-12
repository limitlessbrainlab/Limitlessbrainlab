import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  Shield,
  Crown,
  Settings,
  Mail,
  Phone,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Plus,
  Edit3,
  Trash2,
  Key,
  Send,
  RefreshCw,
  X
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabaseClient';

const AdminAssignmentModal = ({ clinic, isOpen, onClose, onUpdate }) => {
  const [admins, setAdmins] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: '',
      fullName: '',
      role: 'admin',
      permissions: []
    }
  });

  useEffect(() => {
    if (isOpen && clinic) {
      loadClinicAdmins();
      loadAvailableUsers();
    }
  }, [isOpen, clinic]);

  const loadClinicAdmins = async () => {
    try {
      setLoading(true);
      if (!clinic?.id) { setAdmins([]); return; }
      const { data, error } = await supabase
        .from('clinics')
        .select('id, email, contact_person, is_active, created_at')
        .eq('id', clinic.id)
        .single();
      if (error) throw error;
      const primaryAdmin = data ? [{
        id: data.id,
        email: data.email,
        fullName: data.contact_person || data.email,
        role: 'primary_admin',
        status: data.is_active ? 'active' : 'inactive',
        lastLogin: null,
        permissions: ['manage_patients', 'view_reports', 'manage_staff', 'billing'],
        assignedAt: data.created_at,
      }] : [];
      setAdmins(primaryAdmin);
    } catch (error) {
      console.error('Error loading clinic admins:', error);
      toast.error('Failed to load clinic administrators');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('role', 'clinic_admin')
        .order('email');
      if (error) throw error;
      setAvailableUsers((data || []).map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name || u.email,
        department: 'Clinic Admin',
      })));
    } catch (error) {
      console.error('Error loading available users:', error);
      setAvailableUsers([]);
    }
  };

  const getPermissionOptions = () => {
    const isPartner = clinic?.clinic_type === 'lbl_partner' || clinic?.clinicType === 'lbl_partner';
    const typeLabel = isPartner ? 'Partner' : 'Clinic';

    return [
      { id: 'manage_patients', label: 'Manage Patients', description: 'Add, edit, and manage patient records' },
      { id: 'view_reports', label: 'View Reports', description: 'Access patient reports and analytics' },
      { id: 'manage_staff', label: 'Manage Staff', description: `Add and manage ${typeLabel.toLowerCase()} staff` },
      { id: 'billing', label: 'Billing Access', description: 'View and manage billing information' },
      { id: 'settings', label: `${typeLabel} Settings`, description: `Modify ${typeLabel.toLowerCase()} settings and preferences` },
      { id: 'export_data', label: 'Export Data', description: 'Export patient data and reports' }
    ];
  };

  const onSubmitAdmin = async (data) => {
    try {
      setLoading(true);

      // Create new admin assignment
      const newAdmin = {
        ...data,
        id: `admin-${Date.now()}`,
        status: 'pending',
        assignedAt: new Date().toISOString(),
        clinicId: clinic.id
      };

      // In production, this would be an API call

      // Send invitation email
      await sendInvitationEmail(newAdmin);

      toast.success(`Invitation sent to ${data.email}`);
      setShowAddForm(false);
      reset();
      loadClinicAdmins();

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error adding admin:', error);
      toast.error('Failed to add administrator');
    } finally {
      setLoading(false);
    }
  };

  const sendInvitationEmail = async (admin) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    await fetch(`${apiUrl}/email/clinic-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, fullName: admin.fullName, clinicName: clinic?.name }),
    });
  };

  const removeAdmin = async (adminId) => {
    const admin = admins.find(a => a.id === adminId);

    if (admin?.role === 'primary_admin') {
      toast.error('Cannot remove primary administrator');
      return;
    }

    if (!window.confirm('Are you sure you want to remove this administrator?')) {
      return;
    }

    try {
      setLoading(true);

      // In production, this would be an API call

      toast.success('Administrator removed successfully');
      loadClinicAdmins();

      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error('Failed to remove administrator');
    } finally {
      setLoading(false);
    }
  };

  const resendInvitation = async (admin) => {
    try {
      await sendInvitationEmail(admin);
      toast.success(`Invitation resent to ${admin.email}`);
    } catch (error) {
      toast.error('Failed to resend invitation');
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'primary_admin':
        return <Crown className="w-4 h-4 text-yellow-600" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-[#323956]" />;
      case 'limited_admin':
        return <Users className="w-4 h-4 text-gray-600" />;
      default:
        return <Users className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Inactive
          </span>
        );
      default:
        return status;
    }
  };

  const filteredAdmins = admins.filter(admin =>
    admin.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2 text-[#323956]" />
                Manage Administrators - {clinic?.name}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Assign and manage clinic administrators and their permissions
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Controls */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search administrators..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-[#323956] text-white px-4 py-2 rounded-md hover:bg-[#232D3C] flex items-center"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Administrator
            </button>
          </div>

          {/* Add Admin Form */}
          {showAddForm && (
            <div className="bg-[#E4EFFF] rounded-lg p-6 mb-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">Add New Administrator</h4>
              <form onSubmit={handleSubmit(onSubmitAdmin)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Email Address
                    </label>
                    <input
                      type="email"
                      {...register('email', { required: 'Email is required' })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Full Name
                    </label>
                    <input
                      type="text"
                      {...register('fullName', { required: 'Full name is required' })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Administrator Role
                  </label>
                  <select
                    {...register('role')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="admin">Administrator</option>
                    <option value="limited_admin">Limited Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permissions
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {getPermissionOptions().map(permission => (
                      <label key={permission.id} className="flex items-start">
                        <input
                          type="checkbox"
                          value={permission.id}
                          {...register('permissions')}
                          className="mt-1 rounded border-gray-300 text-[#323956] shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        <div className="ml-2">
                          <span className="text-sm font-medium text-gray-900">{permission.label}</span>
                          <p className="text-xs text-gray-500">{permission.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      reset();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#323956] hover:bg-[#232D3C] disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Administrators List */}
          <div className="space-y-4">
            {filteredAdmins.map(admin => (
              <div key={admin.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-[#CAE0FF] rounded-full flex items-center justify-center">
                      {getRoleIcon(admin.role)}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{admin.fullName}</h4>
                      <p className="text-sm text-gray-600">{admin.email}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusBadge(admin.status)}
                        <span className="text-xs text-gray-500 capitalize">
                          {admin.role.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {admin.status === 'pending' && (
                      <button
                        onClick={() => resendInvitation(admin)}
                        className="p-2 text-gray-400 hover:text-[#323956]"
                        title="Resend Invitation"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}

                    {admin.role !== 'primary_admin' && (
                      <button
                        onClick={() => removeAdmin(admin.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                        title="Remove Administrator"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex flex-wrap gap-2">
                    {admin.permissions.map(permission => (
                      <span
                        key={permission}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800"
                      >
                        {getPermissionOptions().find(p => p.id === permission)?.label || permission}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Last Login */}
                <div className="mt-2 text-xs text-gray-500">
                  {admin.lastLogin
                    ? `Last login: ${new Date(admin.lastLogin).toLocaleDateString()}`
                    : 'Never logged in'
                  }
                  {' • '}
                  Assigned: {new Date(admin.assignedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>

          {filteredAdmins.length === 0 && (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Administrators Found
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'No administrators match your search.' : 'No administrators have been assigned to this clinic yet.'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-[#323956] text-white px-4 py-2 rounded-md hover:bg-[#232D3C] inline-flex items-center"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add First Administrator
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminAssignmentModal;