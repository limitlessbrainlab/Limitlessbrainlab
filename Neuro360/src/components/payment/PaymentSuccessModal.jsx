import React from 'react';
import {
  CheckCircle,
  Download,
  FileText,
  Calendar,
  CreditCard,
  X,
  Receipt,
  ArrowRight,
  Brain
} from 'lucide-react';

const PaymentSuccessModal = ({
  isOpen = true,
  paymentData,
  packageInfo,
  onClose,
  onDownloadInvoice
}) => {
  if (!isOpen || !paymentData) return null;

  const handleDownloadInvoice = () => {
    if (onDownloadInvoice) {
      onDownloadInvoice(paymentData);
    } else {
      // Default invoice download
      const invoiceData = {
        paymentId: paymentData.paymentId,
        orderId: paymentData.orderId,
        amount: paymentData.amount,
        packageName: paymentData.packageName,
        reports: packageInfo?.reports || 0,
        date: new Date(paymentData.createdAt).toLocaleDateString(),
        timestamp: new Date(paymentData.createdAt).toLocaleString()
      };

      const invoiceContent = `
INVOICE - NeuroSense360
========================

Payment ID: ${invoiceData.paymentId}
Order ID: ${invoiceData.orderId}
Date: ${invoiceData.timestamp}

Package: ${invoiceData.packageName}
Reports: ${invoiceData.reports}
Amount: ₹${invoiceData.amount.toLocaleString()}

Payment Method: Stripe
Status: Completed

Thank you for your business!
      `;

      const dataBlob = new Blob([invoiceContent], { type: 'text/plain' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${invoiceData.paymentId}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()} style={{ animation: 'slideUp 0.3s ease-out' }}>
        {/* Header - Navy gradient with CheckCircle icon */}
        <div className="bg-gradient-to-r from-[#323956] to-[#4a5578] px-6 py-6 text-center">
          <div className="w-14 h-14 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-2">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Thank You! Payment Successful</h2>
        </div>

        {/* Body */}
        <div className="p-6 text-center">
          {/* Payment Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Payment ID</span>
              <span className="text-sm font-medium text-gray-900 font-mono">
                {paymentData.paymentId || 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Package</span>
              <span className="text-sm font-medium text-gray-900">
                {paymentData.packageName || 'N/A'}
              </span>
            </div>

            {packageInfo?.reports !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Reports Added</span>
                <span className="text-sm font-medium text-green-600">
                  +{packageInfo.reports} reports
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Amount Paid</span>
              <span className="text-lg font-bold text-gray-900">
                ₹{paymentData.amount?.toLocaleString() || 'N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Date & Time</span>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {paymentData.createdAt ? new Date(paymentData.createdAt).toLocaleDateString() : 'N/A'}
                </div>
                <div className="text-xs text-gray-500">
                  {paymentData.createdAt ? new Date(paymentData.createdAt).toLocaleTimeString() : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <Brain className="h-5 w-5 text-[#323956] mt-0.5 mr-3" />
              <div className="text-left">
                <h4 className="text-sm font-medium text-[#323956]">Payment Confirmed</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Your purchase has been successfully processed. {packageInfo?.reports ? `Your ${packageInfo.reports} reports are now available in your dashboard.` : 'You can access your purchase from your dashboard.'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleDownloadInvoice}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Invoice
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-gradient-to-r from-[#323956] to-[#4a5578] text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </button>
          </div>

          {/* Footer Message */}
          <div className="mt-4">
            <p className="text-xs text-gray-500">
              A confirmation email has been sent to your registered email address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccessModal;