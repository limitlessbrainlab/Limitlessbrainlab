const fs = require('fs');
const { renderReportHtmlToPdf } = require('./performanceReportService');
const { renderWNeuroHtml } = require('../templates/wNeuroReportHtml');

function markerValue(param) {
  const score = Number(param?.score);
  const maxScore = Number(param?.maxScore);
  return Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0
    ? Math.round((score / maxScore) * 100)
    : null;
}

async function generateWNeuroPdf(outputPath, patient, results, qeeg, inputPdfPaths = {}) {
  const html = await renderWNeuroHtml(patient, results, qeeg, inputPdfPaths);
  fs.writeFileSync(outputPath, await renderReportHtmlToPdf(html));
  return outputPath;
}

module.exports = { generateWNeuroPdf, markerValue };
