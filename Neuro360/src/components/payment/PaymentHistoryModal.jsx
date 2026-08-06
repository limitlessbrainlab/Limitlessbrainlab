import React from 'react';
import { X, Calendar, CreditCard, FileText, Clock, CheckCircle, Download, Package, IndianRupee, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

const PaymentHistoryModal = ({ isOpen, payment, onClose }) => {
  if (!isOpen || !payment) return null;

  const packageInfo = payment.planDetails || {};
  const subscriptionInfo = payment.subscription || {};
  const paymentDetails = payment.paymentDetails || {};
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN'),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const purchaseDate = formatDate(payment.createdAt);
  const expiryDate = subscriptionInfo.expiryDate ? formatDate(subscriptionInfo.expiryDate) : null;
  const isExpired = subscriptionInfo.expiryDate ? new Date(subscriptionInfo.expiryDate) < new Date() : false;
  const daysUntilExpiry = subscriptionInfo.expiryDate ? 
    Math.ceil((new Date(subscriptionInfo.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;

  const generateInvoiceHTML = () => {
    const invoiceNumber = `INV-${(payment.paymentId || '').slice(-8).toUpperCase()}`;
    const txnId = `TXN-${(payment.paymentId || '').slice(-12).toUpperCase()}`;
    const ordId = `ORD-${(payment.orderId || '').slice(-12).toUpperCase()}`;
    const pkgName = packageInfo.name || payment.packageName || 'EEG Reports';
    const reportsCount = packageInfo.reportsIncluded || payment.reports || 0;
    const amount = payment.amount || 0;
    const currency = payment.currency === 'USD' ? 'USD ' : '\u20b9';
    const logoUrl = window.location.origin + '/IBW%20Logo.png';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Invoice - ${invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #333; font-size: 13px; }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 40px; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 3px solid #323956; margin-bottom: 24px; }
  .logo-area { display: flex; align-items: center; gap: 14px; }
  .logo-area img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #E4EFFF; }
  .logo-area .company { font-size: 20px; font-weight: 800; color: #323956; }
  .logo-area .tagline { font-size: 11px; color: #888; margin-top: 2px; }
  .inv-badge { text-align: right; }
  .inv-badge .title { font-size: 28px; font-weight: 800; color: #323956; letter-spacing: 2px; }
  .inv-badge .meta { font-size: 11px; color: #666; margin-top: 3px; }

  /* Two-column row */
  .row { display: flex; gap: 32px; margin-bottom: 22px; }
  .col { flex: 1; }

  /* Section title */
  .sec { font-size: 10px; font-weight: 700; color: #323956; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #E4EFFF; }

  /* Field rows */
  table.fields { width: 100%; border-collapse: collapse; }
  table.fields td { padding: 4px 0; font-size: 12px; vertical-align: top; }
  table.fields td.lbl { color: #888; width: 110px; }
  table.fields td.val { font-weight: 600; color: #333; text-align: right; }
  .badge { display: inline-block; padding: 2px 12px; border-radius: 10px; font-size: 10px; font-weight: 700; background: #dcfce7; color: #166534; }

  /* Package box */
  .pkg { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px 22px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; }
  .pkg .name { font-size: 17px; font-weight: 700; color: #323956; }
  .pkg .desc { font-size: 11px; color: #888; margin-top: 3px; }
  .pkg .price { font-size: 24px; font-weight: 800; color: #323956; text-align: right; }
  .pkg .per { font-size: 11px; color: #999; text-align: right; margin-top: 2px; }

  /* Summary box */
  .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 22px; margin-bottom: 22px; }
  .summary .srow { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #555; }
  .summary .srow.total { border-top: 2px solid #323956; margin-top: 8px; padding-top: 10px; font-size: 15px; font-weight: 800; color: #323956; }

  /* Footer */
  .footer { text-align: center; padding-top: 18px; border-top: 1px solid #e5e7eb; margin-top: 20px; }
  .footer p { font-size: 10px; color: #aaa; line-height: 1.7; }
  .footer strong { color: #323956; font-size: 11px; }

  @media print {
    body { padding: 0; }
    .page { max-width: 100%; padding: 20px 32px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="logo-area">
      <img src="${logoUrl}" alt="Logo" />
      <div>
        <div class="company">Limitless Brain Lab</div>
        <div class="tagline">EEG Management Platform</div>
      </div>
    </div>
    <div class="inv-badge">
      <div class="title">INVOICE</div>
      <div class="meta">${invoiceNumber}</div>
      <div class="meta">${purchaseDate.date}</div>
    </div>
  </div>

  <!-- DETAILS -->
  <div class="row">
    <div class="col">
      <div class="sec">Invoice Details</div>
      <table class="fields">
        <tr><td class="lbl">Invoice No</td><td class="val">${invoiceNumber}</td></tr>
        <tr><td class="lbl">Transaction ID</td><td class="val">${txnId}</td></tr>
        <tr><td class="lbl">Order ID</td><td class="val">${ordId}</td></tr>
        <tr><td class="lbl">Date</td><td class="val">${purchaseDate.date}, ${purchaseDate.time}</td></tr>
      </table>
    </div>
    <div class="col">
      <div class="sec">Billed To</div>
      <table class="fields">
        <tr><td class="lbl">Clinic</td><td class="val">${payment.clinicName || 'Clinic'}</td></tr>
        <tr><td class="lbl">Email</td><td class="val">${payment.clinicEmail || ''}</td></tr>
        <tr><td class="lbl">Status</td><td class="val"><span class="badge">PAID</span></td></tr>
      </table>
    </div>
  </div>

  <!-- PACKAGE -->
  <div class="sec">Package</div>
  <div class="pkg">
    <div>
      <div class="name">${pkgName}</div>
      <div class="desc">${reportsCount} EEG Report Credits</div>
    </div>
    <div>
      <div class="price">${currency}${amount.toLocaleString()}</div>
      <div class="per">${currency}${reportsCount ? Math.round(amount / reportsCount).toLocaleString() : 0}/report</div>
    </div>
  </div>

  <!-- PAYMENT SUMMARY -->
  <div class="sec">Payment Summary</div>
  <div class="summary">
    <div class="srow"><span>Package Amount</span><span>${currency}${amount.toLocaleString()}</span></div>
    <div class="srow"><span>Payment Method</span><span>Online Payment</span></div>
    <div class="srow total"><span>Total Paid</span><span>${currency}${amount.toLocaleString()}</span></div>
  </div>

  <!-- VALIDITY & INCLUDES -->
  <div class="row">
    <div class="col">
      <div class="sec">Validity</div>
      <table class="fields">
        <tr><td class="lbl">Valid From</td><td class="val">${purchaseDate.date}</td></tr>
        <tr><td class="lbl">Valid Until</td><td class="val">${expiryDate ? expiryDate.date : '1 Year from purchase'}</td></tr>
        <tr><td class="lbl">Status</td><td class="val" style="color:${isExpired ? '#dc2626' : '#16a34a'};font-weight:700">${isExpired ? 'Expired' : 'Active'}</td></tr>
      </table>
    </div>
    <div class="col">
      <div class="sec">Includes</div>
      <table class="fields">
        <tr><td class="lbl">EEG Reports</td><td class="val">${reportsCount}</td></tr>
        <tr><td class="lbl">PDF Export</td><td class="val">Yes</td></tr>
        <tr><td class="lbl">Support</td><td class="val">Email &amp; Chat</td></tr>
      </table>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <p><strong>Thank you for choosing Limitless Brain Lab!</strong></p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
    <p>Generated: ${new Date().toLocaleString('en-IN')} &nbsp;|&nbsp; ${invoiceNumber}</p>
  </div>

</div>
</body>
</html>`;
  };

  const downloadInvoice = () => {
    const htmlContent = generateInvoiceHTML();
    const dataBlob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${payment.paymentId.slice(-8).toUpperCase()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Professional invoice downloaded successfully!');
  };

  const printInvoice = () => {
    const htmlContent = generateInvoiceHTML();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };
    
    toast.success('Invoice sent to printer!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
            <p className="text-sm text-gray-600">Complete payment and subscription details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Transaction Overview */}
          <div className="bg-gradient-to-r from-[#E4EFFF] to-indigo-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center mb-3">
              <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Payment Successful</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Transaction ID:</span>
                <div
                  className="font-mono text-gray-900 bg-white px-2 py-1 rounded mt-1 cursor-pointer hover:bg-gray-50 truncate text-xs"
                  title={payment.paymentId}
                  onClick={() => {
                    navigator.clipboard.writeText(payment.paymentId || '');
                    toast.success('Transaction ID copied!');
                  }}
                >
                  TXN-{(payment.paymentId || '').slice(-12).toUpperCase()}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Order ID:</span>
                <div
                  className="font-mono text-gray-900 bg-white px-2 py-1 rounded mt-1 cursor-pointer hover:bg-gray-50 truncate text-xs"
                  title={payment.orderId}
                  onClick={() => {
                    navigator.clipboard.writeText(payment.orderId || '');
                    toast.success('Order ID copied!');
                  }}
                >
                  ORD-{(payment.orderId || '').slice(-12).toUpperCase()}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Click to copy full ID</p>
          </div>

          {/* Package Details */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <Package className="h-5 w-5 text-blue-600 mr-2" />
              <h4 className="font-semibold text-gray-900">Package Details</h4>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="font-medium text-gray-900">{packageInfo.name || payment.packageName}</h5>
                  <p className="text-sm text-gray-600 mt-1">
                    {packageInfo.description || `${packageInfo.reportsIncluded || payment.reports} EEG reports`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    ₹{payment.amount?.toLocaleString()}
                  </div>
                  {packageInfo.originalPrice && packageInfo.originalPrice !== payment.amount && (
                    <div className="text-sm text-gray-500 line-through">
                      ₹{packageInfo.originalPrice.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-blue-600 mr-1" />
                  <span className="text-sm font-medium">{packageInfo.reportsIncluded || payment.reports} Reports Included</span>
                </div>
                {packageInfo.savings && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {packageInfo.savings}
                  </span>
                )}
              </div>
              
              {packageInfo.features && packageInfo.features.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-sm text-gray-600 mb-2">Features included:</div>
                  <div className="space-y-1">
                    {packageInfo.features.map((feature, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-700">
                        <CheckCircle className="h-3 w-3 text-green-500 mr-2" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Timeline */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <Calendar className="h-5 w-5 text-blue-600 mr-2" />
              <h4 className="font-semibold text-gray-900">Timeline & Status</h4>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">Purchase Date</div>
                  <div className="text-sm text-gray-600">
                    {purchaseDate.date} at {purchaseDate.time}
                  </div>
                </div>
                <div className="flex items-center text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Completed</span>
                </div>
              </div>
              
              {expiryDate && (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">Expiry Date</div>
                    <div className="text-sm text-gray-600">
                      {expiryDate.date} at {expiryDate.time}
                    </div>
                  </div>
                  <div className={`flex items-center ${
                    isExpired ? 'text-red-600' : 
                    daysUntilExpiry <= 30 ? 'text-yellow-600' : 
                    'text-green-600'
                  }`}>
                    <Clock className="h-4 w-4 mr-1" />
                    <span className="text-sm font-medium">
                      {isExpired ? 'Expired' : 
                       daysUntilExpiry <= 0 ? 'Expires today' :
                       daysUntilExpiry === 1 ? 'Expires tomorrow' :
                       daysUntilExpiry <= 30 ? `${daysUntilExpiry} days left` :
                       'Active'}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div>
                  <div className="font-medium text-gray-900">Validity Period</div>
                  <div className="text-sm text-gray-600">
                    {subscriptionInfo.validityPeriod || '1 year from purchase'}
                  </div>
                </div>
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  isExpired ? 'bg-red-100 text-red-800' :
                  daysUntilExpiry <= 30 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {subscriptionInfo.isActive !== false ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Details */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-4">
              <CreditCard className="h-5 w-5 text-blue-600 mr-2" />
              <h4 className="font-semibold text-gray-900">Payment Details</h4>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Payment Method:</span>
                <div className="font-medium text-gray-900 mt-1 capitalize">
                  Online Payment
                </div>
              </div>
              <div>
                <span className="text-gray-600">Transaction Fee:</span>
                <div className="font-medium text-gray-900 mt-1">
                  ₹{paymentDetails.transactionFee || Math.round((payment.amount || 0) * 0.02)}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Verification:</span>
                <div className={`font-medium mt-1 ${payment.status === 'completed' || payment.status === 'captured' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {payment.status === 'completed' || payment.status === 'captured' ? 'Verified' : 'Pending'}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={downloadInvoice}
              className="flex-1 flex items-center justify-center py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Details
            </button>
            <button
              onClick={printInvoice}
              className="flex-1 flex items-center justify-center py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistoryModal;