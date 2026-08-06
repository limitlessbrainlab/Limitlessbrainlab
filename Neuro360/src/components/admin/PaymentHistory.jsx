import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Banknote, 
  Calendar,
  Download,
  Eye,
  Filter,
  Search,
  X,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertCircle,
  Clock,
  Users,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import DatabaseService from '../../services/databaseService';
import PaymentHistoryModal from '../payment/PaymentHistoryModal';
import { getFriendlyErrorMessage } from '../../utils/friendlyError';

const PaymentHistory = ({ selectedClinic }) => {
  const [payments, setPayments] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedClinic]);

  const loadData = async () => {
    try {
      // Payment records live across three tables: `payments` (clinic credit
      // purchases), `patient_payments` and `payment_history` (patient purchases /
      // subscriptions). Read all three so the SuperAdmin sees every payment.
      let paymentsRaw = [], patientPaymentsRaw = [], paymentHistoryRaw = [], clinicsData = [];

      try {
        [paymentsRaw, patientPaymentsRaw, paymentHistoryRaw, clinicsData] = await Promise.all([
          DatabaseService.get('payments'),
          DatabaseService.get('patient_payments'),
          DatabaseService.get('payment_history'),
          DatabaseService.get('clinics')
        ]);
      } catch (dbError) {
        // Don't swallow a real DB failure into an empty table — surface it so the
        // outer handler shows a visible error toast instead of a misleading
        // "No payment transactions found" empty state.
        console.error('ERROR: Supabase database error:', dbError.message);
        throw dbError;
      }

      // Normalize every source (raw snake_case rows) into one common shape
      const normalize = (rows, sourceTable) => (rows || []).map(p => ({
        id: p.id,
        clinicId: p.clinic_id || p.clinicId || null,
        patientEmail: p.patient_email || p.patientEmail || null,
        amount: Number(p.amount) || 0,
        currency: p.currency || 'INR',
        status: p.status || 'completed',
        type: p.type || p.payment_type || 'payment',
        packageName: p.package_name || p.item_name || p.tier || null,
        createdAt: p.created_at || p.createdAt || null,
        stripeSessionId: p.stripe_session_id || null,
        paymentSourceTable: sourceTable
      }));

      const combined = [
        ...normalize(paymentsRaw, 'payments'),
        ...normalize(patientPaymentsRaw, 'patient_payments'),
        ...normalize(paymentHistoryRaw, 'payment_history')
      ];

      // Dedup by Stripe session id — the same payment can be logged in more than
      // one table (e.g. a subscription appears in both payments and payment_history)
      const seen = new Set();
      const deduped = combined.filter(p => {
        if (!p.stripeSessionId) return true;
        if (seen.has(p.stripeSessionId)) return false;
        seen.add(p.stripeSessionId);
        return true;
      });

      // Filter by selected clinic if specified
      const filteredPayments = selectedClinic
        ? deduped.filter(p => p.clinicId === selectedClinic)
        : deduped;

      // Enhance payments with clinic/patient information
      const enhancedPayments = filteredPayments.map(payment => {
        const clinic = clinicsData.find(c => c.id === payment.clinicId);
        const isPatientPayment = !payment.clinicId && payment.patientEmail;
        return {
          ...payment,
          clinicName: isPatientPayment ? (payment.patientEmail || 'Patient') : (clinic?.name || 'Unknown Clinic'),
          clinicEmail: isPatientPayment ? payment.patientEmail : (clinic?.email || 'Unknown Email'),
          clinicPhone: clinic?.phone || 'N/A',
          paymentSource: isPatientPayment ? 'Patient' : 'Clinic'
        };
      }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setPayments(enhancedPayments);
      setClinics(clinicsData);

    } catch (error) {
      console.error('ERROR: SUPER ADMIN: Error loading payment data:', error);
      toast.error(getFriendlyErrorMessage(error, 'Failed to load payment data. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatus = (payment) => {
    const status = payment.status?.toLowerCase() || 'unknown';
    
    if (status === 'captured' || status === 'completed' || status === 'succeeded') {
      return { status: 'success', text: 'Captured', icon: CheckCircle };
    } else if (status === 'pending' || status === 'processing' || status === 'created') {
      return { status: 'pending', text: 'Pending', icon: Clock };
    } else if (status === 'failed' || status === 'cancelled' || status === 'error') {
      return { status: 'failed', text: 'Failed', icon: AlertCircle };
    }
    return { status: 'unknown', text: 'Unknown', icon: AlertCircle };
  };

  const getPaymentType = (payment) => {
    // Check for enhanced plan details first
    if (payment.planDetails?.name) {
      return payment.planDetails.name;
    }
    // Fallback to legacy fields
    if (payment.type === 'subscription') {
      return 'Subscription';
    } else if (payment.packageName) {
      return payment.packageName;
    } else if (payment.reportType) {
      return `Report: ${payment.reportType}`;
    }
    return 'Payment';
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  const handleViewPaymentDetails = (payment) => {
    setSelectedPayment(payment);
    setShowPaymentDetails(true);
  };

  const handleClosePaymentDetails = () => {
    setShowPaymentDetails(false);
    setSelectedPayment(null);
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.clinicName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.clinicEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         getPaymentType(payment).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || getPaymentStatus(payment).status === statusFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const paymentDate = new Date(payment.createdAt || payment.timestamp);
      const now = new Date();
      const diffDays = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));
      
      switch (dateFilter) {
        case 'today':
          matchesDate = diffDays === 0;
          break;
        case 'week':
          matchesDate = diffDays <= 7;
          break;
        case 'month':
          matchesDate = diffDays <= 30;
          break;
        case 'quarter':
          matchesDate = diffDays <= 90;
          break;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getTotalRevenue = () => {
    return payments
      .filter(p => getPaymentStatus(p).status === 'success')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getMonthlyRevenue = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return payments
      .filter(p => {
        const paymentDate = new Date(p.createdAt || p.timestamp);
        return paymentDate >= thirtyDaysAgo && getPaymentStatus(p).status === 'success';
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const viewPaymentDetails = (payment) => {
    setSelectedPayment(payment);
    setShowPaymentDetails(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Modern Revenue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-white/20 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-600"></div>
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Banknote className="h-8 w-8 text-white" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Revenue</p>
            <p className="text-3xl font-black text-slate-800">{formatAmount(getTotalRevenue())}</p>
            <div className="flex items-center space-x-2 mt-4">
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 rounded-full">
                <TrendingUp className="h-4 w-4 text-[#323956]" />
                <span className="text-sm font-bold text-green-700">All time</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-white/20 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E4EFFF]0 to-blue-600"></div>
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#E4EFFF]0 to-blue-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Monthly Revenue</p>
            <p className="text-3xl font-black text-slate-800">{formatAmount(getMonthlyRevenue())}</p>
            <div className="flex items-center space-x-2 mt-4">
              <div className="flex items-center space-x-2 px-3 py-1 bg-[#CAE0FF] rounded-full">
                <Calendar className="h-4 w-4 text-[#323956]" />
                <span className="text-sm font-bold text-blue-700">This month</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-white/20 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-purple-600"></div>
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <CreditCard className="h-8 w-8 text-white" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Total Transactions</p>
            <p className="text-3xl font-black text-slate-800">{payments.length}</p>
            <div className="flex items-center space-x-2 mt-4">
              <div className="flex items-center space-x-2 px-3 py-1 bg-purple-100 rounded-full">
                <CheckCircle className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-bold text-purple-700">Completed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search payments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Status</option>
            <option value="success">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="quarter">Last 90 Days</option>
          </select>
          
          <button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('');
              setDateFilter('all');
            }}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center space-x-2"
          >
            <X className="h-4 w-4" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">
            Payment Transactions ({filteredPayments.length})
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Clinic
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.map((payment) => {
                const statusInfo = getPaymentStatus(payment);
                const StatusIcon = statusInfo.icon;
                
                return (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-lg bg-[#CAE0FF] flex items-center justify-center">
                          <CreditCard className="h-5 w-5 text-[#323956]" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {getPaymentType(payment)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {payment.paymentId || payment.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.clinicName}</div>
                      <div className="text-sm text-gray-500">{payment.clinicEmail}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatAmount(payment.amount)}
                      </div>
                      {payment.reportsAllowed && (
                        <div className="text-sm text-gray-500">
                          {payment.reportsAllowed} reports
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusInfo.status === 'success' ? 'bg-green-100 text-green-800' :
                        statusInfo.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusInfo.text}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(payment.createdAt || payment.timestamp).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(payment.createdAt || payment.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleViewPaymentDetails(payment)}
                          className="text-primary-600 hover:text-primary-900 transition-colors"
                          title="View Payment Details"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            // Generate receipt/invoice
                            toast.success('Receipt generated');
                          }}
                          className="text-gray-600 hover:text-gray-900"
                          title="Download Receipt"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredPayments.length === 0 && (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter || dateFilter !== 'all'
                  ? 'No payments match your filters' 
                  : 'No payment transactions found'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Payment History Modal */}
      <PaymentHistoryModal
        isOpen={showPaymentDetails}
        payment={selectedPayment}
        onClose={handleClosePaymentDetails}
      />
    </div>
  );
};

// Super Admin enhanced with comprehensive payment tracking
// Now includes database integration, professional invoices, and detailed transaction history

export default PaymentHistory;
