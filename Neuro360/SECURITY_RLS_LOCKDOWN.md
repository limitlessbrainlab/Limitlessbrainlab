# Security Fix — Supabase RLS + Credential Lockdown (Nov 2026)

## Phase 1 (DONE — both projects) ✅

`rls_disabled_in_public` + `sensitive_columns_exposed` warnings: **both cleared**.
Supabase Security Advisor confirmed clean on 11 Nov 2026 (check:
`GET /v1/projects/{ref}/advisors/security`). Tables that had RLS fully disabled
(staging: agreements, care_plans, coach_connection_requests, file_metadata,
sent_notifications · prod: same minus sent_notifications) got
`ENABLE ROW LEVEL SECURITY` + a policy mirroring prior access — zero behavior
change, verified by anon-key smoke tests.

## Phase 2 (code done — staged rollout below) 🔐

Goal: close the **real** exposure — the anon key could still read
`password`/`plain_password` through the allow-all policies. The browser now
never touches credential columns:

- **056_credential_rpcs.sql** — security-definer RPCs (pgcrypto bcrypt,
  `$2a$/$2b$` verified live):
  - `verify_clinic_login` / `verify_patient_login` / `verify_admin_login`
  - `set_clinic_password` / `set_patient_password` (JWT self/admin gate)
  - `set_patient_password_by_clinic` (ownership gate — clinic users have no
    Supabase session)
  - `heal_patient_password` (JWT self gate — login self-heal)
  - `claim_credentials_for_new_account` (registration: passwordless row < 15 min old only)
  - Applied to BOTH projects (inert until frontend deploy). E2E-tested on
    staging: correct/wrong password, anon write-gate, claim guard. ✅
- **Frontend** — `credentialRpc.js` (RPC-first, legacy fallback → any deploy
  order is safe); `authService.js` logins/registrations; admin components;
  `databaseService.authenticateAdmin` unchanged (already auth-first).
- **Backend** — `/api/clinic-credentials` now `authMiddleware` + super-admin
  verified; resolves the plaintext itself via service-role key (browser never
  sends/reads it); `send-partner-email-update` / `send-email-update-notification`
  resolve stored plaintext server-side on email-only changes.

### Rollout gates (in order)

1. Commit + deploy (Vercel frontend, Render backend)
2. **Staging tests**: clinic login · patient login · admin login · approve
   clinic → credentials email · admin password reset · patient edit+email ·
   patient registration · clinic registration
3. `node apply-sql-file.js staging supabase/migrations/057_lockdown_credential_columns.sql`
4. Re-run ALL staging tests + prove `GET /rest/v1/clinics?select=password` fails
5. Same on prod: deploy-verify → apply 057 → verify
6. Advisor check: `sensitive_columns_exposed` stays false; expect +3
   `anon_security_definer_function_executable` WARNs (verify_* RPCs — the
   standard cost of custom-auth RPCs, not a critical)

### Rollback
- Column lockdown: `058_rollback_column_lockdown.sql` (one GRANT, instant)
- RPC layer: legacy browser path still works until 057 is applied

### Feature kept (per product decision)
Credentials emails still show the CURRENT password — plaintext stays in the DB
but is readable ONLY by the backend service-role key; the public API cannot
return it.

## Guard: future tables (unchanged)

Every `CREATE TABLE` must end with `ENABLE ROW LEVEL SECURITY` + policy; after
schema changes run `node apply-rls-lockdown.js --audit all`.

Remaining advisor WARN/INFO items (pre-existing, out of scope):
`function_search_path_mutable` (31), `security_definer_view` (6),
`rls_enabled_no_policy` (deny-all — secure by default), optional:
enable Auth → leaked-password protection.

Safety tag: git tag `pre-security-lockdown` (pre-Phase-1).
