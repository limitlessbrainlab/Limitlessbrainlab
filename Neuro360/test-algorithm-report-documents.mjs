import assert from 'node:assert/strict';
import { buildAlgorithmDocuments, buildQeegStorageDocuments, uniqueDocumentsByUrl } from './src/utils/algorithmReportDocuments.js';

const generated = buildAlgorithmDocuments({
  id: 'result-1',
  patient_name: 'TEST SONAM',
  reportData: { source: 'algorithm_results' },
  pdf_url: 'https://example.com/neurosense.pdf',
  input_data: { eyesOpenUrl: 'https://example.com/eyes-open.pdf', eyesClosedUrl: 'https://example.com/eyes-closed.pdf' },
  claude_report_url: 'https://example.com/performance.pdf'
});

const storage = buildQeegStorageDocuments({
  eyesOpen: [{ name: 'EyesOpen.pdf', path: 'patient/EyesOpen.pdf', url: 'https://example.com/eyes-open.pdf' }],
  eyesClosed: [{ name: 'EyesClosed.pdf', path: 'patient/EyesClosed.pdf', url: 'https://example.com/eyes-closed-2.pdf' }]
}, 'TEST SONAM');

assert.deepEqual(uniqueDocumentsByUrl([...generated, ...storage]).map(({ fileName }) => fileName), [
  'NeuroSense Report - TEST SONAM',
  'Eyes Open Report - TEST SONAM',
  'Eyes Closed Report - TEST SONAM',
  'NeuroSense Performance Report - TEST SONAM',
  'Eyes Closed Report - TEST SONAM'
]);

console.log('algorithm report document checks passed');
