import assert from 'node:assert/strict';
import {
  buildAlgorithmDocuments,
  buildQeegStorageDocuments,
  uniqueDocumentsByUrl
} from './src/utils/algorithmReportDocuments.js';

const documents = buildAlgorithmDocuments({
  id: 'result-1',
  patient_name: 'TEST SONAM',
  reportData: { source: 'algorithm_results' },
  pdf_url: 'https://example.com/neurosense.pdf',
  input_data: {
    eyesOpenUrl: 'https://example.com/eyes-open.pdf',
    eyesClosedUrl: 'https://example.com/eyes-closed.pdf'
  },
  claude_report_url: 'https://example.com/performance.pdf',
  created_at: '2026-10-03T00:00:00.000Z'
});

assert.deepEqual(documents.map(({ id, label, url }) => ({ id, label, url })), [
  { id: 'result-1-neurosense', label: 'NeuroSense Report - TEST SONAM', url: 'https://example.com/neurosense.pdf' },
  { id: 'result-1-eyes-open', label: 'Eyes Open Report - TEST SONAM', url: 'https://example.com/eyes-open.pdf' },
  { id: 'result-1-eyes-closed', label: 'Eyes Closed Report - TEST SONAM', url: 'https://example.com/eyes-closed.pdf' },
  { id: 'result-1-performance', label: 'NeuroSense Performance Report - TEST SONAM', url: 'https://example.com/performance.pdf' }
]);

const qeegFiles = buildQeegStorageDocuments({
  eyesOpen: [{ name: 'EyesOpen-TEST SONAM.pdf', path: 'patient-1/EyesOpen-TEST SONAM.pdf', url: 'https://example.com/eyes-open.pdf' }],
  eyesClosed: [{ name: 'EyesClosed-TEST SONAM.pdf', path: 'patient-1/EyesClosed-TEST SONAM.pdf', url: 'https://example.com/eyes-closed-bucket.pdf' }]
}, 'TEST SONAM');

assert.deepEqual(uniqueDocumentsByUrl([...documents, ...qeegFiles]).map(({ label, url }) => ({ label, url })), [
  { label: 'NeuroSense Report - TEST SONAM', url: 'https://example.com/neurosense.pdf' },
  { label: 'Eyes Open Report - TEST SONAM', url: 'https://example.com/eyes-open.pdf' },
  { label: 'Eyes Closed Report - TEST SONAM', url: 'https://example.com/eyes-closed.pdf' },
  { label: 'NeuroSense Performance Report - TEST SONAM', url: 'https://example.com/performance.pdf' },
  { label: 'Eyes Closed Report - TEST SONAM', url: 'https://example.com/eyes-closed-bucket.pdf' }
]);

console.log('algorithm report document checks passed');
