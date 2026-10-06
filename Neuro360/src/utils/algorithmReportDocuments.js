const readInputData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

export const buildAlgorithmDocuments = (report) => {
  const inputData = readInputData(report.inputData || report.input_data);
  const patientName = report.patientName || report.patient_name || 'Patient';
  const reportId = report.id;
  const baseUrl = report.pdfUrl || report.pdf_url || report.fileUrl || report.file_url || report.filePath || report.file_path;
  const isAlgorithmResult = report.reportData?.source === 'algorithm_results' || report.report_data?.source === 'algorithm_results';
  const isWNeuro = report.reportData?.reportType === 'W Neuro Report' || report.report_data?.reportType === 'W Neuro Report';
  const documents = [
    { key: 'neurosense', label: isAlgorithmResult ? `${isWNeuro ? 'W Neuro Report' : 'NeuroSense Report'} - ${patientName}` : report.fileName, url: baseUrl },
    { key: 'eyes-open', label: `Eyes Open Report - ${patientName}`, url: inputData.eyesOpenUrl || inputData.eyes_open_url },
    { key: 'eyes-closed', label: `Eyes Closed Report - ${patientName}`, url: inputData.eyesClosedUrl || inputData.eyes_closed_url },
    { key: 'performance', label: `NeuroSense Performance Report - ${patientName}`, url: report.claudeReportUrl || report.claude_report_url }
  ];

  return documents
    .filter(({ url }) => Boolean(url))
    .map(({ key, label, url }) => ({
      ...report,
      id: `${reportId}-${key}`,
      label,
      url,
      fileName: label,
      title: label,
      fileUrl: url,
      filePath: url,
      storedInCloud: true,
      createdAt: report.createdAt || report.created_at || report.uploadedAt
  }));
};

export const buildQeegStorageDocuments = (files, patientName) => [
  ...(files?.eyesOpen || []).map((file, index) => ({
    id: `eyes-open-${file.path || file.name || index}`,
    label: `Eyes Open Report - ${patientName}`,
    title: 'Eyes Open Report',
    fileName: `Eyes Open Report - ${patientName}`,
    url: file.url,
    fileUrl: file.url,
    filePath: file.path,
    storedInCloud: true,
    createdAt: file.createdAt
  })),
  ...(files?.eyesClosed || []).map((file, index) => ({
    id: `eyes-closed-${file.path || file.name || index}`,
    label: `Eyes Closed Report - ${patientName}`,
    title: 'Eyes Closed Report',
    fileName: `Eyes Closed Report - ${patientName}`,
    url: file.url,
    fileUrl: file.url,
    filePath: file.path,
    storedInCloud: true,
    createdAt: file.createdAt
  }))
].filter(({ url }) => Boolean(url));

export const uniqueDocumentsByUrl = (documents) => {
  const seen = new Set();
  return documents.filter((document) => {
    const key = document.url || document.fileUrl || document.filePath;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
