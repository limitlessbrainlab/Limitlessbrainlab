const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const apiSource = fs.readFileSync(path.resolve(__dirname, '../../api/process-neurosense-report.js'), 'utf8');
const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/qeegRoutes.js'), 'utf8');

test('Vercel NeuroSense endpoint statically includes the full report route', () => {
  assert.match(apiSource, /import router from ['"]\.\.\/server\/routes\/qeegRoutes\.js['"];/);
  assert.doesNotMatch(apiSource, /await import\(['"]\.\.\/server\/routes\/qeegRoutes\.js['"]\)/);
});

test('live NeuroSense processing never substitutes the short PDF fallback', () => {
  assert.match(routeSource, /Full NeuroSense PDF generator is unavailable/);
  assert.doesNotMatch(routeSource, /else if \(EnhancedAIPdfGenerator\) \{/);
});

test('Vercel report upload uses the authenticated request client and never returns a temporary URL', () => {
  assert.match(apiSource, /req\.supabaseClient = supabase;/);
  assert.match(routeSource, /req\.supabaseClient \|\| undefined/);
  assert.doesNotMatch(routeSource, /pdfUrl = `\/uploads\/\$\{pdfFilename\}`/);
});
