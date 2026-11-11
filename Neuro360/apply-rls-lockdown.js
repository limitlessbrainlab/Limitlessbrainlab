/**
 * apply-rls-lockdown.js
 * ---------------------
 * Safely resolves Supabase Security Advisor warning `rls_disabled_in_public`
 * on BOTH projects, with ZERO behavior change:
 *   - Enables RLS on every public table that lacks it
 *   - Adds an explicit allow-all policy mirroring today's effective access
 *
 * Executes SQL through the Supabase Management API using SUPABASE_ACCESS_TOKEN
 * (no service-role key or exec_sql RPC needed).
 *
 * Usage (run from the Neuro360 folder):
 *   node apply-rls-lockdown.js --audit  staging     # read-only report
 *   node apply-rls-lockdown.js --audit  prod
 *   node apply-rls-lockdown.js --apply  staging     # the fix
 *   node apply-rls-lockdown.js --apply  prod
 *   node apply-rls-lockdown.js --verify staging     # post-apply check
 *   node apply-rls-lockdown.js --audit all          # both projects
 *
 * Zero-behavior-change guarantee: tables with RLS already enabled are
 * never touched; no columns are revoked; no policies are tightened.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); // loads .env from the current working directory
// Always also load this script's own folder .env / .env.local (token lives in Neuro360/.env)
dotenv.config({ path: path.join(__dirname, '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: false });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECTS = {
  staging: 'ukmggjcvjvjodksopngs', // Limitless-staging
  prod: 'puzdgwtprcpaaxxwkwtk',    // limitlessbrainlab's Project
};

const MIGRATION_PATH = path.join(__dirname, 'supabase', 'migrations', '055_enable_rls_zero_change.sql');
const AUDIT_SQL = `
SELECT
  c.relname                AS table_name,
  c.relrowsecurity         AS rls_enabled,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY rls_enabled ASC, c.relname;
`;

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function runSql(projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json; // array of row objects
}

async function audit(ref, label) {
  console.log(`\n🔍 Auditing RLS status — ${label} (${ref})`);
  const rows = await runSql(ref, AUDIT_SQL);
  const disabled = rows.filter((r) => !r.rls_enabled);
  console.log(`   Tables in public schema: ${rows.length}`);
  console.log(`   ❌ RLS DISABLED: ${disabled.length}`);
  disabled.forEach((r) => console.log(`      • ${r.table_name} (policies: ${r.policy_count})`));
  console.log(`   ✅ RLS enabled:  ${rows.length - disabled.length}`);
  return disabled;
}

async function verify(ref, label) {
  console.log(`\n🧪 Verifying — ${label} (${ref})`);
  const rows = await runSql(ref, AUDIT_SQL);
  const disabled = rows.filter((r) => !r.rls_enabled);
  const pol = await runSql(ref, `
    SELECT count(*)::int AS n
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND p.polname='zero_change_full_access';
  `);
  console.log(`   Tables with RLS disabled : ${disabled.length} ${disabled.length === 0 ? '✅' : '❌ ' + disabled.map((d) => d.table_name).join(', ')}`);
  console.log(`   zero_change_full_access policies installed: ${pol[0]?.n ?? 0}`);
  return disabled.length === 0;
}

async function apply(ref, label, dryRun) {
  console.log(`\n🚀 Applying zero-change RLS lockdown — ${label} (${ref})${dryRun ? ' (DRY RUN)' : ''}`);
  const disabled = await audit(ref, label);

  if (disabled.length === 0) {
    console.log('   Nothing to do — every public table already has RLS enabled. ✅');
    return true;
  }

  if (dryRun) {
    console.log('\n   Would run migration: 055_enable_rls_zero_change.sql');
    console.log('   (enables RLS + mirrors current access with explicit policy on the tables above)');
    return false;
  }

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const result = await runSql(ref, sql);

  // The DO block emits NOTICE lines that the API returns as messages
  if (Array.isArray(result)) {
    result.forEach((r) => {
      if (r && typeof r === 'object') console.log('   ' + (r.status ?? JSON.stringify(r)));
    });
  }

  return verify(ref, label);
}

// ----------------------------- main -----------------------------
const [, , mode, targetArg] = process.argv;
const HELP = `Usage: node apply-rls-lockdown.js --audit|--apply|--verify <staging|prod|all> [--dry-run]`;

if (!TOKEN) die('SUPABASE_ACCESS_TOKEN not found. Add it to Neuro360/.env (sbp_... token from Supabase Account → Access Tokens).');
if (!mode || !targetArg) die(HELP);

const dryRun = process.argv.includes('--dry-run');
const targets = targetArg === 'all' ? Object.keys(PROJECTS) : [targetArg];
targets.forEach((t) => { if (!PROJECTS[t]) die(`Unknown target "${t}". Use staging | prod | all.\n${HELP}`); });

(async () => {
  let ok = true;
  for (const t of targets) {
    const ref = PROJECTS[t];
    try {
      if (mode === '--audit') await audit(ref, t);
      else if (mode === '--verify') ok = (await verify(ref, t)) && ok;
      else if (mode === '--apply') ok = (await apply(ref, t, dryRun)) && ok;
      else die(HELP);
    } catch (err) {
      ok = false;
      console.error(`❌ ${t} failed: ${err.message}`);
    }
  }
  console.log(ok ? '\n✅ All done.' : '\n⚠️  Completed with issues — review output above.');
  process.exit(ok ? 0 : 1);
})();

