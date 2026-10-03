import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./BrainCoursesManagement.jsx', import.meta.url), 'utf8');
assert.match(source, /original_price:.*\? null/);
assert.match(source, /setLoading\(false\)/);
assert.match(source, /is_free:/);
assert.match(source, /SupabaseService\.supabase\.auth\.getSession/);
assert.match(source, /toast\.success\(editing \? 'Course updated successfully'/);
console.log('BrainCoursesManagement.test.mjs: ok');
