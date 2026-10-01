const assert = require('node:assert/strict');
const fs = require('node:fs');

const auth = fs.readFileSync('src/services/authService.js', 'utf8');
const subscriptions = fs.readFileSync('src/components/admin/PatientSubscriptions.jsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261001174838_track_patient_logins.sql', 'utf8');

assert.match(auth, /last_login_at/, 'a successful patient login must record last_login_at');
assert.match(subscriptions, /Last login/, 'the admin table must show real login activity');
assert.match(subscriptions, /useRealtimeRefetch/, 'the admin table must refresh when a patient changes');
assert.match(migration, /ADD COLUMN IF NOT EXISTS last_login_at/, 'the database must persist login activity');
assert.match(migration, /supabase_realtime/, 'patient updates must reach realtime subscribers');

console.log('patient login activity checks passed');
