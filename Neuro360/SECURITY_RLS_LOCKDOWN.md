# Supabase access remediation — 12 Nov 2026

## Current state

**Staging remediation is applied. Production has the independent bcrypt compatibility fix, eight backend-only RPC grants, and six backend-only reporting views. Production still has unsafe table/credential access and public medical buckets; the matching application rollout and restrictive migrations remain pending. Advisor ERROR 0 is not evidence that those access paths are fixed. Do not describe either project as fully fixed.**

- Staging: `ukmggjcvjvjodksopngs`.
- Production: `puzdgwtprcpaaxxwkwtk`.
- The existing `limitlessbrainlab-eight.vercel.app` site uses production data. It is not an isolated database test environment. Tests use a local frontend and synthetic accounts in the staging project.
- The production backend uses production directly. The other Render backend defaults to staging but routes the `-eight` origin to production through its `STAGING_SUPABASE_URL`. Preserve these existing settings; the variable names do not identify the actual database.
- The last read-only production check still found six anonymous credential-column SELECT grants. Production remains exposed until the coordinated rollout completes.
- The bcrypt compatibility fix was applied separately. `20261111185808_restrict_backend_maintenance_rpc_access.sql` restricts five internal RPCs to backend/service access: `increment_clinic_report_credits`, `revoke_consent`, `expire_old_consents`, `update_setting`, and `generate_monthly_statement`. The three lookup RPC grants (`check_permission`, `get_user_org_id`, and `is_org_member`) were restricted separately using `/tmp/neuro-db-only-lookup-permissions.sql`.
- Six unused reporting views are `security_invoker=true` and backend-only in both projects: `download_summary_by_clinic`, `suspicious_access_summary`, `patient_consent_status`, `consent_compliance_summary`, `clinic_team_overview`, and `statement_status_overview`. Production service-role result fingerprints were unchanged by this change.
- Those independent database changes did not change user records, report files, table policies, or bucket settings. The current live Advisor reports zero ERROR findings in both projects; production still has six credential-column SELECT grants, permissive table policies, four public medical buckets, and public legacy credential mutation functions. Treat these as unresolved access risks regardless of Advisor status.

## Changes

Native Supabase sessions now authorize clinic, patient, and administrator requests. Live session IDs and server-owned account mappings determine permissions; editable metadata and browser-stored role labels do not. Credential changes invalidate business identity bindings.

Core and related tables use scoped policies. Browsers cannot read passwords or SMTP secrets, change identity/role ownership, grant paid access, or update clinic quotas. Catalog reads and public form submission remain available; inquiries, payments, and personal records are protected. Credential RPCs retain their authorized workflows.

Payment creators use trusted prices and identity. Verified fulfillment writes entitlements; booking creation atomically consumes credits or deduplicates a verified payment. Wallet status controls retain their existing display behavior.

Medical storage references have immutable ownership, including historical clinic-only records. Uploads register ownership before returning. Downloads use authenticated authorization and signed URLs. Legacy local report downloads have a separate immutable ownership registry. Report email recipients come from the authorized patient record; download links expire after seven days, with portal access still available.

Report algorithms and rendering implementations were not redesigned. Existing report quota metering is preserved through a narrowly privileged trigger. A trusted organization trigger preserves creation of clinics and their first patients. Patient signup now supplies the DOB and gender required by the existing database schema.

## Verified

- 160 automated tests passed, including report validation, identity, ownership, credentials, pricing, booking, document and SSO checks.
- Production frontend build passed; existing chunk-size warnings remain.
- Real staging Auth: clinic, patient, administrator login and browser reload passed.
- Real staging access: own records/reports work; cross-account reads and anonymous/authenticated credential reads fail.
- Real upload, signing, download-content verification, deletion, anonymous denial, and forged-patient denial passed with synthetic files in both `patients_documents` and `neurosense-reports`. Raw public URLs were denied. All five medical buckets are private in staging.
- Transactional SQL tests cover wallet permissions, mismatched ownership, report saves/quota trigger, audit identity, notifications, booking rollback/idempotency, and document ownership. Synthetic fixtures roll back.
- Staging audit: zero public tables with RLS disabled, zero historical `zero_change_full_access` policies, zero anonymous credential-column SELECT grants.

No production patients were used for tests. No test emails, Stripe charges, or paid AI report-generation requests were sent.

## Production compatibility check

Both deployed backends returned 404 for an empty POST to `/api/clinic-session` (no account was submitted or modified). The native-session implementation is not deployed, so applying the full restrictive table migration now would break existing clinic access. The independent backend-maintenance RPC patch is unrelated to that application rollout. `supabase/tests/backend_maintenance_access.sql` passes on both projects and preserves service-role execution.

## Deployment blockers and scope

The essential account/table/document rollout is blocked because the live backend still returns 404 for `/api/clinic-session`; the matching native-session application is not deployed. Applying restrictive table policies before deploying the matching frontend/backend would break existing clinic access. The production credential grants, broad table policies, and public medical buckets also remain unresolved until the coordinated rollout below.

Webhook hardening is deferred from the essential account/table release in the isolated candidate at `/tmp/neuro-security-candidate`. The candidate restores the exact deployed Calendly and JotForm route handlers from production commit `e9b53d5a4dec577047f1fc1db52e1b3f0942e7d0`; the mixed-router backend at `14a13a21ec0f794319f53e667424ce13a5c51f4c` has matching handler bodies. It preserves all other application changes, including the exact-email JotForm lookup helper, and does not add a toggle or fallback. This is a compatibility release only: Calendly signature verification and trusted JotForm API retrieval are not active in these deployed handlers. Treat their unauthenticated webhook behavior and posted JotForm answers as a residual risk; review and deploy webhook hardening separately after provider credentials are configured. Do not describe the essential release as resolving that risk.

Both live Render environments lack the webhook verification configuration below. If using the combined backend release, configure provider credentials securely in Render, never in source or chat:

1. `CALENDLY_WEBHOOK_SIGNING_KEY` (or `CALENDLY_WEBHOOK_SECRET`), matching the existing Calendly subscription signing key. The protected webhook rejects unsigned requests and returns 503 when unconfigured.
2. `JOTFORM_API_KEY`, with read access to the expected forms/submissions. The webhook must retrieve trusted answers from JotForm rather than trusting a posted answer payload. The existing email-ingestion path remains.

These are compatibility prerequisites for the combined backend release. They do not resolve or replace the independent native-session/table/document rollout prerequisites above.

## Release manifest

This manifest describes the existing uncommitted remediation; it is not authorization to deploy. Parent review must approve the complete diff and the actual deployment plan. Do not deploy a partial selection of the interdependent application changes.

### Application release contents

Deploy the complete reviewed `Neuro360` application diff together: server identity/session and trusted registration routes; authorization middleware and protected routes; browser native-session restore and auth changes; safe database projections, credential RPC and ownership-aware document/report services; checkout/booking authority; and the Vercel API handlers. This is the complete existing working-tree change set under `Neuro360/api/`, `Neuro360/server/`, and `Neuro360/src/`, including added files. Preserve unrelated `CLAUDE.md` and do not include local audit snapshots or credentials.

### Database and storage release contents

Use the existing ordered migrations, after reviewing their full SQL and dependencies:

1. `20261111174015_secure_account_access.sql` (additive identity helpers and `reports_unlocked` prerequisite).
2. `20261111182500_atomic_coach_booking.sql` and `20261111182801_ensure_clinic_organization.sql` (trusted booking and organization provisioning prerequisites).
3. `20261111190000_document_ownership.sql` and `20261111193000_local_report_ownership.sql` (additive ownership registry prerequisites; the document migration does not activate guards).
4. Deploy the matching application and verify native role access, uploads, report writes, and downloads.
5. `20261111194909_document_ownership_guard_catchup.sql`, then `20261111180256_enforce_private_account_access.sql`, then `20261111182157_restrict_public_catalog_writes.sql`. The catch-up migration briefly locks the three document metadata tables, registers uniquely attributable gap-period references, and activates all three guards atomically.
6. `20261111200000_restrict_medical_storage.sql`, then use the Storage API to make only `patients_documents`, `neurosense-reports`, `patient-reports`, `edf-files`, and `qeeg-uploads` private. Keep public nonmedical assets unchanged.

The bcrypt compatibility migration `20261111140231_fix_bcrypt_login_compatibility.sql`, backend maintenance RPC migration `20261111185808_restrict_backend_maintenance_rpc_access.sql`, and separate lookup-RPC grants have already been applied to production. The six reporting-view protections are also already applied to both projects. Do not blindly reapply old historical lockdown/rollback migrations or the staging-only `privatize-medical-storage.cjs`.

### Prerequisites, order, and verification

1. Resolve the backend release coupling above; confirm production Render/Vercel project routing and required environment configuration without printing secrets.
2. Retain a private production snapshot, apply identity, booking, organization, document ownership registry, and local-report ownership registry prerequisites in order.
3. Deploy the matching backend, frontend, and Vercel handlers. Verify native login/reload for all three roles, uploads, report writes, and downloads. Existing browser-only clinic sessions must log in again.
4. Activate document guards with `20261111194909_document_ownership_guard_catchup.sql`, then apply restrictive account/catalog policies and private medical-storage policies/settings in the order above.
5. Run role, ownership, document signed-download, report, and payment checks against the deployed application; then run the read-only policy audit and Security Advisor. Advisor results supplement authorization checks.

Rollback boundary: do not reopen access with `055`/`058` or restore broad public policies. If rollout fails, stop subsequent migrations and fix forward or restore a reviewed private snapshot together with the matching application version. Do not roll back ownership data independently of storage objects or application handlers.

## Reproducible checks

Run from `Neuro360`:

```sh
node --experimental-vm-modules --test server/__tests__/*.test.js server/__tests__/*.test.mjs src/contexts/restoreSessionUser.test.mjs src/services/credentialRpc.test.mjs src/utils/documentLocation.test.mjs
npm run build
node apply-rls-lockdown.js --verify staging
node apply-sql-file.js staging supabase/tests/private_access.sql
node apply-sql-file.js staging supabase/tests/atomic_coach_booking.sql
node apply-sql-file.js staging supabase/tests/document_ownership.sql
node supabase/tests/document_ownership_rollout_check.cjs
```

`document_ownership_rollout_check.cjs` is hard-coded to staging. It drops the three document-reference triggers inside a transaction, applies the additive registry SQL, inserts synthetic object/metadata during the gap, then applies the cutover catch-up and asserts that the owner is registered and the active guard permits an authorized use. It also asserts the triggers are absent before activation and all three exist afterward, then rolls back.

`STAGING_SECURITY_TEST_CONFIG` points to a private JSON file containing `{url,service,anon}`. The integration refuses a production URL. Add `STAGING_SECURITY_BROWSER=1` for the local browser check and `STAGING_DOCUMENT_BUCKET=neurosense-reports` to test that report bucket after privatization:

```sh
node --test server/__tests__/stagingAccess.integration.cjs
```

The historical `apply-rls-lockdown.js --apply` allow-all path is retired. Do not use `055`/`058` to reopen public access as a routine rollback. Fix forward or restore a reviewed snapshot in coordination with the matching application version.

## Limits

Live Calendly/JotForm synchronization and a paid AI report generation were not exercised. Public Google Drive music/media access is unchanged; protecting that media is a separate hosting/entitlement task. Existing historical reports without a patient are mapped only when a unique valid clinic owner is supported by database metadata; names are never used as authorization evidence.

Storage settings are changed through the [Supabase Storage API](https://supabase.com/docs/reference/javascript/storage-updatebucket), consistent with the [storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).
