import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_COLUMNS, publicColumns } from './src/services/publicColumns.js';

// Model the column grants at the HTTP boundary for reads and mutation returns.
const client = createClient('https://projection-test.supabase.co', 'test-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (url) => {
    const columns = new URL(url).searchParams.get('select').split(',');
    assert.ok(columns.includes('id'));
    assert.ok(columns.includes('email'));
    for (const secret of ['*', 'password', 'plain_password', 'smtp_password']) {
      assert.ok(!columns.includes(secret), `Restricted column requested: ${secret}`);
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } },
});
for (const table of Object.keys(PUBLIC_COLUMNS)) {
  assert.equal((await client.from(table).select(publicColumns(table))).error, null);
  assert.equal((await client.from(table).insert({ id: 'test' }).select(publicColumns(table))).error, null);
  assert.equal((await client.from(table).update({ email: 'test@example.com' }).eq('id', 'test').select(publicColumns(table))).error, null);
  assert.equal((await client.from(table).delete().eq('id', 'test').select(publicColumns(table))).error, null);
}
assert.equal(publicColumns('reports'), '*');
assert.ok(PUBLIC_COLUMNS.clinics.split(',').includes('deleted_at'));
assert.ok(PUBLIC_COLUMNS.patients.split(',').includes('medical_history'));
console.log('Public read and mutation-return projections passed.');
