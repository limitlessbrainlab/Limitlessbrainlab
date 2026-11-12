import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
assert.match(source, /app\.use\('\/api\/ensure-patient-auth', rateLimiters\.loginLimiter, createPatientAuthRouter\(\)\)/);
console.log('ensurePatientAuth.test.mjs: ok');
