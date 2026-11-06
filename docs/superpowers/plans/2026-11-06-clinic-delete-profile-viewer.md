# Clinic account deletion and profile picture viewer — implementation plan

> For agentic workers: use superpowers:executing-plans for this approved implementation.

**Goal:** Add a Super Admin account-deletion action for clinics/partners and let clinic/partner users view their whole profile picture, then close it and return to the same profile screen.

**Architecture:** Extend existing ClinicManagement and shared ProfileModal. Keep picture viewing local to the modal. Account deletion must enforce authorization on the server and handle account access and related records consistently.

**Tech stack:** Existing React, Tailwind, lucide-react, backend and database services. No new dependencies planned.

**Spec:** User screenshots and request in this conversation; implementation was authorized after proposing account removal with retained history.

## Constraints and findings

- Implement locally. Do not remove real accounts or deploy as part of verification.
- ClinicManagement.jsx already has two deletion handlers, but neither is connected to the visible row actions. They directly delete a clinics row; that is not verified complete account deletion.
- Repository migrations contain cascading references to clinics. Actual deployed constraints and login/account relationships must be checked before enabling deletion.
- ProfileModal.jsx currently renders an avatar with object-cover at 96 by 96 pixels; DashboardLayout.jsx hosts the shared modal.
- Preserve the pending QEEG changes. No changes to report scoring or generation are part of this work.

## Selected deletion policy

Remove access and hide the account while preserving patient/report/billing history, as recommended and stated when implementation began. Existing deactivation remains a temporary suspension; removal adds a permanent marker and cannot be reversed through activation.

## Task 1: Account removal

**Files:** Neuro360/src/components/admin/ClinicManagement.jsx; Neuro360/src/services/databaseService.js for tracing existing behavior. Select the existing authenticated backend route/service and any migration only after confirming the chosen deletion policy and actual account relationships.

- [ ] Trace clinic/partner identity, sign-in/session validation, memberships, patient/report/payment ownership and storage dependencies. Confirm deployed constraints read-only.
- [ ] Add a red Delete Account action alongside View, Edit and Activate/Deactivate in both desktop rows and mobile cards, visible only to Super Admin.
- [ ] Show confirmation identifying the clinic/partner and explaining exactly what will be removed or retained. Require explicit confirmation, allow Cancel, and disable repeated submission while pending.
- [ ] Write failing tests for unauthorized deletion, successful selected-policy removal, failure without a misleading success state, repeat requests, and preservation/deletion of related records according to the selected policy.
- [ ] Implement server-enforced Super Admin authorization using the existing authentication mechanism. A hidden frontend button is insufficient. Ensure removed accounts cannot continue signing in or using existing sessions.
- [ ] Route the UI through this operation; consolidate the unused duplicate deletion handlers when replacing them. Refresh list/counts only on confirmed success, preserving search and filters. Show a useful error on failure.
- [ ] Run the new deletion tests against disposable fixtures only. Never use a real clinic for a destructive test.

## Task 2: Full profile picture viewer

**Files:** Neuro360/src/components/layout/ProfileModal.jsx. Inspect DashboardLayout.jsx for integration; change it only if needed.

- [ ] Add a View profile picture button when an avatar exists; optionally make the thumbnail the same accessible button.
- [ ] Display the same avatar URL or current upload preview in a larger overlay using object-contain, constrained to the viewport so the complete picture is visible without cropping.
- [ ] Add an accessible Close (X) button and Escape dismissal. Closing the viewer must not close Profile Settings, navigate, reset edits or change the page underneath.
- [ ] Keep keyboard focus within the viewer and return it to its opening button on close. Reset viewer state when Profile Settings closes.
- [ ] Handle missing and broken images without displaying an empty viewer; preserve existing upload/save behavior.
- [ ] Add one focused interaction check covering clinic and partner access, opening/closing, Escape and focus restoration, retained edits, portrait/landscape images and missing image behavior.

## Verification and review focus

- [ ] Confirm clinic and partner row actions on desktop and mobile.
- [ ] Verify authorization from a direct backend request, including an already-authenticated deleted account attempting access.
- [ ] Verify cancellation makes no change and an interrupted/failed operation does not claim success or leave inconsistent access.
- [ ] Verify picture fitting and closing on narrow screens, including while editing an unsaved profile.
- [ ] Run focused tests, npm run build from Neuro360, and git diff --check. Record any failures separately.
- [ ] Review the final diff against these two features. Do not deploy until the completed changes have been reviewed.

No live database inspection or implementation was performed when preparing this draft.

## Execution record — 2026-11-06

- Implemented the authenticated removal route, desktop/mobile actions, retained-record marker and database guard, login checks, list and approval-queue filtering, and full picture viewer.
- Ruling: removed the legacy demo/test cleanup and duplicate unused hard-delete handlers because refreshing the list must not physically delete retained clinic records.
- Ruling: use the native dialog for image fitting, focus trapping/restoration and Escape; existing Profile Settings is view-only, so no editing controls were added.
- Existing sessions use the current 60-second session-validity poll; inactive accounts are rejected on its next successful check. This is not immediate token revocation or a redesign of the existing clinic authentication system.
- Read-only schema inspection completed for the locally configured database. Connected Supabase tools do not expose this project, so the configured REST schema was used. No live data or schema changes made.
- Verification: 10 backend tests passed; fixture browser checks passed for clinic/partner viewers and mobile/desktop account removal; migration passed against a disposable local PostgreSQL database; production build passed with existing bundle-size/browser-data warnings.
- Deployment prerequisite: apply migration 20261106154107_clinic_account_removal.sql to the target environment, then deploy backend and frontend. No migration has been applied to a live database.

- Independent review found one removed-clinic/shared-admin-email login issue; fixed with a failing-then-passing regression test. Other account identities remain usable with their own credentials.

## Deployment preparation — 2026-11-06

- Integrated onto origin/main at 9a4aaa8, preserving the newer course-payment routes.
- 23 integrated backend tests and the fixture browser checks passed.
- Applied and recorded migration 20261106154107 on puzdgwtprcpaaxxwkwtk, verified against the deployed Vercel frontend and Render staging routing. No accounts removed.
- Repaired the existing missing @sparticuz/chromium lockfile entry without changing its declared version.
