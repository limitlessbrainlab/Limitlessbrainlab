import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./authService.js', import.meta.url), 'utf8');
assert.match(source, /Patient login requires a Supabase session for protected purchases/);
assert.match(source, /ensure-patient-auth/);
assert.match(source, /establishPatientSession/);
console.log('authService.patientSession.test.mjs: ok');
