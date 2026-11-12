# Safe Supabase Access Implementation Plan

> Execute in the current session with independent code review before rollout.

**Goal:** Restrict unauthorized database/credential access without breaking existing user flows or reports.

**Architecture:** Keep the existing Supabase clients and backend. Establish verified identities before enforcing ownership. Deploy compatibility changes before restrictive grants. Do not treat enabling RLS with allow-all policies as protection.

**Tech stack:** React, Supabase/Postgres, Express, existing Node test runner.

**Spec:** User-approved staging-first rollout; current evidence and constraints in `Neuro360/SECURITY_RLS_LOCKDOWN.md`.

## Constraints

- Preserve existing data, credentials, intended features, and report behavior.
- No production permission changes before staging flow tests pass.
- No credential emails to real users during testing.
- No new dependencies; leave unrelated changes alone.

## Tasks

- [x] Inspect live schema/policies without reading patient records or credentials.
- [x] Review credential/login/email access paths independently.
- [x] Fix `src/services/credentialRpc.js` successful-void versus missing-function handling; prove failure then success using `credentialRpc.test.mjs`.
- [x] Add authentication/admin-ID checks to partner credential email; test denial and preserved authorized behavior with mail delivery stubbed.
- [x] Make `apply-rls-lockdown.js --verify` fail when anonymous credential-column grants remain; verify it fails on both live projects.
- [x] Build frontend and check backend syntax.
- [ ] Confirm isolated staging target; screenshot site currently references production.
- [ ] Establish genuine clinic/patient sessions and protect admin identity/role authority. Inspect all callers before finalizing implementation.
- [ ] Bind password writes, registration, report/document APIs to verified ownership.
- [ ] Verify explicit column projections and SMTP/credential email compatibility.
- [ ] Prepare restrictive migration and reviewed rollback; test on staging with synthetic identities only.
- [ ] Prove own-account flows succeed and anonymous/cross-account access fails, including report generation and downloads.
- [ ] Deploy verified application changes, then restrictions, then repeat production smoke checks.

## Review focus

SQL void responses, duplicate emails across roles, failed session repair, stale browser sessions, editable role claims, wildcard selects, credential-email recipients, shared report tokens, and environment routing. None may be silently treated as safe because an advisor alert disappeared.


## Verification status — 12 Nov 2026

Staging identity, table restrictions, trusted fulfillment, document/local ownership, and medical bucket privacy are applied. 160 automated checks and the build pass. Actual native staging clinic/patient/admin browser login+reload and private document upload/sign/download/delete pass; raw public report URLs and cross-account reads fail. SQL regression fixtures rolled back.

Production application/restrictive migrations remain unapplied. Read-only recheck still finds six anonymous credential grants. Live Render environments lack Calendly webhook signing key and JotForm API key; user configuration/confirmation questions are pending so webhook functionality is not silently broken. See Neuro360/SECURITY_RLS_LOCKDOWN.md for rollout order and exact verification commands. No real emails, charges, or paid AI reports generated.


## Production follow-up — 12 Nov 2026

User explicitly authorized production fixes where safe. Live compatibility probes confirmed neither backend has `/api/clinic-session` yet (404). Applied only independent backend-maintenance RPC hardening (`20261111185808`) to production after staging test: five functions no longer executable by anon/authenticated, service_role retained. Permission tests pass. Core table/credential restrictions remain blocked on matching application deployment; six credential SELECT grants remain. This partial production fix must not be reported as full remediation.
