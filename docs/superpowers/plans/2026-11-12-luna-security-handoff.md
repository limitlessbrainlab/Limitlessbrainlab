# Luna Supabase Security Completion Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. User explicitly chose Luna implementation and parent final review; proceed without an extra plan-approval round. Do not spawn further agents.

**Goal:** Finish the existing Supabase remediation with minimal additional work, preserving login, report generation, payments, and historical report access.

**Architecture:** Reuse the substantial uncommitted implementation. Luna prepares and verifies remaining changes; the parent reviews the resulting diff and deployment readiness before any further production mutation. Never substitute cleared Advisor errors for actual authorization.

**Tech Stack:** React/Vite, Express, Supabase/Postgres/Auth/Storage, Render, Vercel.

**Spec:** User's requirements in this conversation; `Neuro360/SECURITY_RLS_LOCKDOWN.md` and `docs/superpowers/plans/2026-11-11-safe-supabase-access.md` (historical state, corrected below).

## Global constraints

- User now explicitly delegates necessary coding to Luna; preserve intended functionality and existing report algorithms. No broad refactors, dependencies, feature additions, or reimplementation of completed work.
- Preserve unrelated user modification `CLAUDE.md`. Do not reset, clean, broadly stage, commit, push, or deploy the shared dirty tree without parent review.
- No real emails, Stripe charges, paid AI report requests, real-user password changes, or production test fixtures.
- Secrets: load programmatically, never print. Do not print git remotes (one embeds a token). Local `.env` contains Supabase/Render/Vercel management credentials.
- Staging project `ukmggjcvjvjodksopngs`; production `puzdgwtprcpaaxxwkwtk`. The live `limitlessbrainlab-eight.vercel.app` uses PRODUCTION data. Never infer database from hostname or STAGING variable name.
- Production Render `srv-d97470d8nd3s73c3dah0` uses production. Other Render `srv-d8dd0bm8bjmc73a26ec0` defaults staging, routes -eight origin to production. Preserve routing.
- No further production writes by Luna. Return a concrete reviewed-ready result to parent first. This is the requested parent-review workflow, not a new user-approval requirement.
- Keep tool output short and report only decisions/results. No repeated full scans. Read narrow files as necessary.

## Authoritative current state

Completed local implementation: real clinic sessions; two-phase patient Auth binding and revocation; live session resolver; scoped RLS; credential column protection; safe projections; trusted registration; role/ownership guards; payment pricing/fulfillment; atomic booking; document ownership including clinic-only legacy docs; signed medical downloads; local report ownership; SSO; OTP fixes; protected admin endpoints; webhook verification.

Staging has the reviewed migrations and all five medical buckets private. Last verification: **160 Node tests pass, build passes**, real synthetic native clinic/patient/admin browser login+reload passes, actual private document upload/sign/download/delete passes in both patients_documents and neurosense-reports, raw public URLs and forged ownership denied. SQL regression fixtures roll back. Logs `/tmp/neuro-security-tests.log`, `/tmp/neuro-security-build.log`, `/tmp/neuro-staging-integration.log`.

Production has only safe independent database changes:
1. Bcrypt compatibility fix from earlier work.
2. Eight internal RPCs restricted to service access: increment_clinic_report_credits, revoke_consent, expire_old_consents, update_setting, generate_monthly_statement, check_permission, get_user_org_id, is_org_member.
3. Six unused internal reporting views set security_invoker=true and backend-only; service result fingerprints identical before/after. Names: download_summary_by_clinic, suspicious_access_summary, patient_consent_status, consent_compliance_summary, clinic_team_overview, statement_status_overview. Applied staging too.

Latest live Advisor: **ERROR 0 in both projects**, original rls_disabled_in_public/sensitive_columns_exposed absent. Production WARN 51, staging WARN 50. This does NOT mean production secure: six credential SELECT grants, allow-all patient/clinic/report table policies, four public medical buckets, and public legacy credential mutation functions remain.

Both live backends returned404 for empty POST /api/clinic-session. Full restrictive RLS cannot safely deploy before matching frontend/backend. Calendly signing key and JOTFORM_API_KEY were absent from live environments. Questions asking user to configure them or confirm unused remain unanswered. Do not silently deploy handlers that break active webhooks. Determine whether unrelated webhook hardening can be isolated from the essential original table-access release; report the choice and residual risk, do not silently weaken existing fixes.

Private local audit artifacts: `/tmp/neuro-prod-before-safe-rpc-hardening.json`, `/tmp/neuro-prod-db-only-review.json`, `/tmp/neuro-prod-views-before.json`, `/tmp/neuro-stage-views-before.json`. SQL for later DB-only changes: `/tmp/neuro-db-only-lookup-permissions.sql`, `/tmp/neuro-secure-reporting-views.sql`. Never commit snapshots/secrets.

## Review focus

1. Native account mapping/session revocation must preserve all three roles and deny forged identities.
2. New grants must not break safe projections or expose credentials through views/RPCs.
3. Historical clinic-only documents and local report URLs must remain available to their owners.
4. Pricing/booking grants must remain server-authoritative and idempotent.
5. Rollout ordering or absent webhook config must not interrupt existing user workflows.

## Task 1 — Reconcile release state (documentation, no fresh full audit)

**Files:** `Neuro360/SECURITY_RLS_LOCKDOWN.md`, existing migration directory, this plan.
- [x] Read current git status, current status doc and this handoff. Reuse existing implementation and evidence.
- [x] Correct stale status doc: production eight RPCs + six views protected; Advisor ERROR0 is separate from unresolved data access.
- [x] Prepare release manifest listing the reviewed application change set/migrations, prerequisites, ordering, verification, and rollback boundaries. Preserve current constraints and known secrets handling.
- [x] Identify concrete blockers to the essential login/table/document rollout, separating webhook hardening without pretending it is solved. Provider keys remain unconfigured; current backend release is coupled to the stricter handlers.

## Task 2 — Minimal remaining implementation

**Files:** Only existing implementation files implicated by a demonstrated missing requirement or failing check. No new parallel architecture.
- [ ] Inspect the existing diff narrowly for rollout dependencies: additive identity migration prepares private helpers and reports_unlocked; registry guards and scoped policies activate only when clients use trusted paths.
- [x] Narrow rollout dependency inspection found no additional demonstrated compatibility/security bug. No code or test was added.
- [ ] Do not modify algorithms/rendering. Do not disable signature verification as a shortcut or publish broad production changes without parent review.

## Task 3 — Verify and hand back for final review

Run from `Neuro360` only once after relevant changes:
```
node --experimental-vm-modules --test server/__tests__/*.test.js server/__tests__/*.test.mjs src/contexts/restoreSessionUser.test.mjs src/services/credentialRpc.test.mjs src/utils/documentLocation.test.mjs
npm run build
```
Expected all tests/build pass. Redirect lengthy output to /tmp; show summary/failures only. If only docs changed, reuse existing passing build/tests rather than rerunning needlessly.

Native staging integration (only if code changes justify):
```
NODE_OPTIONS=--dns-result-order=ipv4first STAGING_SECURITY_TEST_CONFIG=/tmp/neuro-security-staging.json STAGING_SECURITY_BROWSER=1 STAGING_DOCUMENT_BUCKET=neurosense-reports node --test server/__tests__/stagingAccess.integration.cjs
```
It refuses production and cleans synthetic fixtures. Do not run production fixture tests.

- [x] Reused existing evidence: 160 Node tests passed and build passed (existing chunk-size warnings). Documentation-only changes; did not rerun these checks. No new production/staging mutations. Release remains blocked pending matching app rollout and webhook release coupling resolution/provider configuration.
- [x] Return changed files, exact validation, release readiness, and any required user input. Do not claim a full production fix before deployment and live checks.
- [ ] Parent independently reviews the diff/readiness, requests corrections if needed, and carries out only safely authorized next steps. Existing no-functionality-regression requirement wins over rushing deployment.


## Parent final review

Reviewed Luna's migration split, release manifest, and rollback-only staging check. Required two corrections: registry RPCs must precede application deployment, and metadata saved between preparation and cutover must receive an atomic ownership catch-up before guards activate. Both are implemented in `20261111194909_document_ownership_guard_catchup.sql`; the staging check covers absence of premature guards, gap-period ownership registration, and an authorized post-activation write. `git diff --check` passes. Approved this rollout correction; production deployment is still not ready until the documented application/webhook compatibility prerequisites are resolved. No production changes in this delegated task.
