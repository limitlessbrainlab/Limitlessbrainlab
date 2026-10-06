const parseReportPage = ({ page, pageSize } = {}) => {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(50, Math.max(10, Number.parseInt(pageSize, 10) || 15));
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
};

module.exports = { parseReportPage };
