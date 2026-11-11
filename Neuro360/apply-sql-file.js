/**
 * apply-sql-file.js — run any SQL file against staging/prod/all
 * via the Supabase Management API (SUPABASE_ACCESS_TOKEN in .env).
 *
 * Usage:
 *   node apply-sql-file.js staging  supabase/migrations/056_credential_rpcs.sql
 *   node apply-sql-file.js prod     supabase/migrations/057_lockdown_credential_columns.sql
 *   node apply-sql-file.js all      <file.sql>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: false });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECTS = {
  staging: 'ukmggjcvjvjodksopngs',
  prod: 'puzdgwtprcpaaxxwkwtk',
};

async function runSql(projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}

const [, , targetArg, fileArg] = process.argv;
if (!TOKEN) { console.error('❌ SUPABASE_ACCESS_TOKEN missing'); process.exit(1); }
if (!targetArg || !fileArg || !PROJECTS[targetArg] && targetArg !== 'all') {
  console.error('Usage: node apply-sql-file.js <staging|prod|all> <file.sql>');
  process.exit(1);
}
const sql = fs.readFileSync(path.resolve(fileArg), 'utf8');
const targets = targetArg === 'all' ? Object.keys(PROJECTS) : [targetArg];

let ok = true;
for (const t of targets) {
  console.log(`\n🚀 Applying ${path.basename(fileArg)} → ${t} (${PROJECTS[t]})`);
  try {
    const result = await runSql(PROJECTS[t], sql);
    if (Array.isArray(result) && result.length === 0) console.log('   ✅ executed (no result rows)');
    else console.log('   result:', JSON.stringify(result).slice(0, 2000));
  } catch (err) {
    ok = false;
    console.error(`   ❌ ${t} failed: ${err.message}`);
  }
}
console.log(ok ? '\n✅ All done.' : '\n⚠️  Completed with errors.');
process.exit(ok ? 0 : 1);
