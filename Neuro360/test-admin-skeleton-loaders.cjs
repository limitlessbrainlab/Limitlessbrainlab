const assert = require('node:assert/strict');
const fs = require('node:fs');

const skeleton = fs.readFileSync('src/components/admin/AdminPageSkeleton.jsx', 'utf8');
assert.doesNotMatch(skeleton, /animate-(pulse|spin)/, 'admin skeletons must stay static');

[
  'AlertDashboard', 'AdvancedAnalytics', 'AssessmentManagement', 'CoachManagement',
  'DataAccess', 'NotificationCenter', 'PatientSubscriptions', 'PaymentHistory',
  'PricingManagement', 'StaticPageManagement', 'SuperAdminPanel', 'WebsiteInquiries',
  'WebsitePayments', 'AssessmentResults'
].forEach((name) => {
  const source = fs.readFileSync(`src/components/admin/${name}.jsx`, 'utf8');
  assert.match(source, /AdminPageSkeleton/, `${name} must use the shared admin skeleton`);
});

const settings = fs.readFileSync('src/components/admin/SystemSettings.jsx', 'utf8');
assert.doesNotMatch(settings, /locationsLoading \? \(\s*<div className="flex justify-center py-8">/, 'location list loading must use a skeleton');
assert.doesNotMatch(settings, /clinicLocationsLoading \? \(\s*<div className="flex justify-center py-8">/, 'clinic location list loading must use a skeleton');

console.log('admin skeleton loader checks passed');
