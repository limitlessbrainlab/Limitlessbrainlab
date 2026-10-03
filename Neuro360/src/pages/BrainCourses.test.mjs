import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./BrainCourses.jsx', import.meta.url), 'utf8');
assert.match(source, /Promise\.allSettled/);
assert.match(source, /courseIds/);
assert.match(source, /Open Course/);
assert.match(source, /SupabaseService\.supabase\.auth\.getSession/);
console.log('BrainCourses.test.mjs: ok');
