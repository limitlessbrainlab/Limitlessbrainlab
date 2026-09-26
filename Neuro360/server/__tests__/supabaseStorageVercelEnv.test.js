const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const originalLoad = Module._load;
const originalUrl = process.env.SUPABASE_URL;
const originalViteUrl = process.env.VITE_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let configuredUrl;

process.env.SUPABASE_URL = '';
process.env.VITE_SUPABASE_URL = 'https://vercel-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

Module._load = function (request, parent, isMain) {
  if (request !== '@supabase/supabase-js') return originalLoad.call(this, request, parent, isMain);
  return {
    createClient(url) {
      configuredUrl = url;
      return {
        storage: {
          from() {
            return {
              upload: async (_storagePath, bytes) => ({ data: { size: bytes.length }, error: null }),
              getPublicUrl: (storagePath) => ({ data: { publicUrl: `https://files.example/${storagePath}` } }),
            };
          },
        },
      };
    },
  };
};

(async () => {
  const file = path.join(os.tmpdir(), `supabase-storage-${process.pid}.pdf`);
  fs.writeFileSync(file, 'pdf');
  try {
    const SupabaseStorage = require('../services/supabaseStorage');
    const result = await SupabaseStorage.uploadFile(file, 'neurosense-reports', 'reports/test.pdf');
    assert.equal(configuredUrl, process.env.VITE_SUPABASE_URL);
    assert.equal(result.url, 'https://files.example/reports/test.pdf');
    console.log('supabaseStorageVercelEnv.test.js: ok');
  } finally {
    fs.unlinkSync(file);
    Module._load = originalLoad;
    process.env.SUPABASE_URL = originalUrl;
    process.env.VITE_SUPABASE_URL = originalViteUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
