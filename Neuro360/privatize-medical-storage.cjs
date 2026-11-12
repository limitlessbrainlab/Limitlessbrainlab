// Staging only: STAGING_SECURITY_TEST_CONFIG=/private/config.json node privatize-medical-storage.cjs --apply
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const BUCKETS = ['patients_documents', 'neurosense-reports', 'patient-reports', 'edf-files', 'qeeg-uploads'];

async function medicalBuckets(storage) {
  const { data, error } = await storage.listBuckets();
  if (error || !Array.isArray(data)) throw new Error('Could not inspect storage buckets');
  return BUCKETS.map(id => {
    const bucket = data.find(row => row.id === id);
    if (!bucket) throw new Error(`Required bucket is missing: ${id}`);
    return bucket;
  });
}
async function makePrivate(storage) {
  const existing = await medicalBuckets(storage);
  for (const bucket of existing) {
    if (!bucket.public) continue;
    const { error } = await storage.updateBucket(bucket.id, {
      public: false, fileSizeLimit: bucket.file_size_limit, allowedMimeTypes: bucket.allowed_mime_types
    });
    if (error) throw new Error(`Privacy update failed for ${bucket.id}; previous successful changes remain private`);
  }
  const result = await medicalBuckets(storage);
  if (result.some(bucket => bucket.public)) throw new Error('A medical bucket remains public');
  return result.map(({ id, public: isPublic }) => ({ id, public: isPublic }));
}
async function main() {
  if (!['--apply', '--dry-run'].includes(process.argv[2])) throw new Error('Use --dry-run or --apply');
  const config = JSON.parse(fs.readFileSync(process.env.STAGING_SECURITY_TEST_CONFIG, 'utf8'));
  if (config.url !== 'https://ukmggjcvjvjodksopngs.supabase.co' || !config.service) throw new Error('Refusing any project except staging');
  const client = createClient(config.url, config.service, { auth: { persistSession: false, autoRefreshToken: false } });
  // Validate every expected bucket before changing policies or flags.
  const before = await medicalBuckets(client.storage);
  if (process.argv[2] === '--dry-run') {
    console.log(JSON.stringify(before.map(({ id, public: isPublic }) => ({ id, public: isPublic })), null, 2));
    return;
  }
  execFileSync(process.execPath, ['apply-sql-file.js', 'staging', 'supabase/migrations/20261111200000_restrict_medical_storage.sql'], { cwd: __dirname, stdio: 'inherit' });
  console.log(JSON.stringify(await makePrivate(client.storage), null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { makePrivate, BUCKETS };
