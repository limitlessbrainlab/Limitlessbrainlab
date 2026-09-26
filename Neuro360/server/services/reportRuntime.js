const path = require('path');

function getReportUploadDir(env = process.env) {
  return env.VERCEL ? '/tmp/neuro360-uploads' : path.join(__dirname, '../uploads');
}

function needsInstanceReportLock(env = process.env) {
  return !env.VERCEL;
}

module.exports = { getReportUploadDir, needsInstanceReportLock };
