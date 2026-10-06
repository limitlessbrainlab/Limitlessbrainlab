const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const apiSource = fs.readFileSync(path.resolve(__dirname, '../../api/process-neurosense-report.js'), 'utf8');
const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/qeegRoutes.js'), 'utf8');
const generatorSource = fs.readFileSync(path.resolve(__dirname, '../services/geminiPdfGenerator.js'), 'utf8');
const vercelConfig = fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8');

test('Vercel NeuroSense endpoint statically includes the full report route', () => {
  assert.match(apiSource, /import router from ['"]\.\.\/server\/routes\/qeegRoutes\.js['"];/);
  assert.doesNotMatch(apiSource, /await import\(['"]\.\.\/server\/routes\/qeegRoutes\.js['"]\)/);
});

test('live NeuroSense processing never substitutes the short PDF fallback', () => {
  assert.match(routeSource, /Full NeuroSense PDF generator is unavailable/);
  assert.match(routeSource, /geminiPdfGeneratorLoadError/);
  assert.doesNotMatch(routeSource, /else if \(EnhancedAIPdfGenerator\) \{/);
});

test('Vercel report upload uses the authenticated request client and never returns a temporary URL', () => {
  assert.match(apiSource, /req\.supabaseClient = supabase;/);
  assert.match(routeSource, /req\.supabaseClient \|\| undefined/);
  assert.doesNotMatch(routeSource, /pdfUrl = `\/uploads\/\$\{pdfFilename\}`/);
});

test('full report loading does not require the unused native chart module', () => {
  assert.doesNotMatch(generatorSource.slice(0, generatorSource.indexOf('class GeminiPdfGenerator')), /ChartJSNodeCanvas/);
  assert.match(generatorSource, /async generateRadarChart\(\) \{\s*const \{ ChartJSNodeCanvas \} = require\('chartjs-node-canvas'\);/);
});

test('Vercel packages the PDF renderer and its runtime assets for brain maps', () => {
  assert.match(vercelConfig, /server\/node_modules\/pdf-to-img\/\*\*/);
  assert.match(vercelConfig, /server\/node_modules\/pdfjs-dist\/\*\*/);
  assert.match(vercelConfig, /server\/node_modules\/@napi-rs\/canvas\*\/\*\*/);
});
