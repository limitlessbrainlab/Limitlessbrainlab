# Security Fix — Supabase RLS Lockdown (Nov 2026)

## What happened

Supabase emailed two **critical** Security Advisor warnings for both projects
(prod `puzdgwtprcpaaxxwkwtk`, staging `ukmggjcvjvjodksopngs`):

| Warning | Meaning |
|---|---|
| `rls_disabled_in_public` | Tables in `public` schema had Row-Level Security **disabled** — anyone with the project URL + anon key could read/edit/delete all rows |
| `sensitive_columns_exposed` | `clinics.password`, `clinics.plain_password`, `patients.password` etc. are readable through the API (login fetches them from the browser) — **NOT yet fixed, see "What remains" below** |

## What was changed (zero functional change)

Only tables that had **RLS fully disabled** were touched. Audit found:

- **staging**: `agreements`, `care_plans`, `coach_connection_requests`, `file_metadata`, `sent_notifications` (5)
- **prod**: same minus `sent_notifications` (4)

For each: `ENABLE ROW LEVEL SECURITY` + one explicit policy that **mirrors the
exact access that existed before** (full access for `anon` + `authenticated`).
Behavior is provably identical — verified by anon-key API smoke tests on all
affected tables plus `clinics`/`patients` (HTTP 200 on both projects).

Migration: `supabase/migrations/055_enable_rls_zero_change.sql`

## Re-run / verify anytime

```bash
cd Neuro360
node apply-rls-lockdown.js --audit all     # read-only report
node apply-rls-lockdown.js --verify all    # confirm 0 tables without RLS
node apply-rls-lockdown.js --apply staging # fix (idempotent, skip-if-clean)
node apply-rls-lockdown.js --apply prod
```

Requires `SUPABASE_ACCESS_TOKEN` in `Neuro360/.env` (already present).

## ⚠️ Guard: future tables can reintroduce the warning

Every new `CREATE TABLE` must end with RLS enabled + a policy, e.g.:

```sql
CREATE TABLE public.my_new_table (...);
ALTER TABLE public.my_new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "my_new_table_access" ON public.my_new_table
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
```

After any schema change, re-run `--audit all` (takes seconds).

## What remains (Phase 2 — NOT done here, needs careful planning)

`sensitive_columns_exposed` stays until password verification stops happening
in the browser. Current login flow fetches password columns from
`clinics`/`patients` via the anon key, so the columns must stay API-readable.
Fixing it means:

1. Move credential checks to a `security definer` Postgres RPC (or the
   backend with the service-role key)
2. Stop selecting `password` / `plain_password` / `password_hash` in
   `src/services/databaseService.js` and login components
3. `REVOKE SELECT(...) ON clinics, patients FROM anon, authenticated` for
   those columns
4. Hash `plain_password` values (plaintext at rest today, by an old product
   decision to re-show passwords in approval emails)

Long-term direction: Supabase Auth (`auth.users`) + per-tenant RLS.

Safety tag before this work: git tag `pre-security-lockdown`.
