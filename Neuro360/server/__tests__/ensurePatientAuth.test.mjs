import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
assert.match(source, /\/api\/ensure-patient-auth/);
assert.match(source, /rateLimiters\.loginLimiter/);
assert.match(source, /bcrypt\.compare/);
console.log('ensurePatientAuth.test.mjs: ok');
