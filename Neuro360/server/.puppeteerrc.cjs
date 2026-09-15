const os = require('os');
const path = require('path');

// Pins the cache dir explicitly so the install step (build time) and
// puppeteer.executablePath() (runtime) always resolve the same location,
// regardless of whether PUPPETEER_CACHE_DIR is visible identically across
// the build process and the running server process. Falls back to
// Puppeteer's own real default so local dev (no env var set) is unaffected.
module.exports = {
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer'),
};
