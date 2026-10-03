# Staging Brain Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a staging-only Brain Courses catalogue, purchase entitlement flow, and Super Admin course management page.

**Architecture:** The React patient and admin screens call the existing Vercel `/api` proxy, which routes to the staging Render backend. A server-side route module owns validation, authentication, Stripe Checkout, and idempotent fulfilment; the staging database holds catalogue and entitlement state behind RLS.

**Tech Stack:** React/Vite, Express, Supabase Postgres/Auth/RLS, Stripe Checkout test mode, React Hot Toast, Node assert tests.

**Spec:** `docs/superpowers/specs/2026-10-03-staging-brain-courses-design.md`

## Global Constraints

- Use the staging Supabase project, staging Stripe test keys/webhook, and `https://limitlessbrainlab-eight.vercel.app` only; do not use production data or secrets.
- Never expose the service-role key or Stripe secret to the browser.
- Keep `/api` routed through the existing staging Vercel proxy.
- Do not authenticate through the shared service-role client; request token verification uses a request-scoped auth client.
- No new dependency unless an installed package cannot serve the requirement.
- Free courses clear `sale_price`; paid courses require an HTTPS URL, three-letter currency, and positive sale price.

## Review Focus

- Duplicate `checkout.session.completed` webhook and verify-session calls must create exactly one entitlement; test the same Stripe session twice in Task 3.
- A hidden course must be unavailable for normal catalogue and checkout queries; test visibility in Tasks 1 and 2.
- An access endpoint failure must leave the patient session in place; test `Promise.allSettled` fallback in Task 4.
- Blank price fields must become `null`, never `NaN` or empty strings; test validation normalization in Task 2.
- Saving after Super Admin login must write with the service role still usable; test route auth client separation in Task 2.

## File Structure

- `supabase/migrations/<timestamp>_create_brain_courses.sql` — staging schema, indexes, grants, RLS policies, seed catalogue.
- `supabase/tests/brain_courses_rls.test.sql` — database access allow/deny assertions.
- `server/routes/brainCoursesRoutes.js` — course catalogue, ownership, checkout, and Super Admin CRUD API.
- `server/services/brainCoursePurchases.js` — validation/normalization plus idempotent Stripe fulfilment helper shared by webhook and verify-session.
- `server/__tests__/brainCoursePurchases.test.mjs` — validation and duplicate-entitlement assertions.
- `server/index.js` — route mount and calls to the shared fulfilment helper in existing Stripe paths.
- `src/pages/BrainCourses.jsx` — API-backed patient catalogue and resilient ownership/checkout UX.
- `src/components/admin/BrainCoursesManagement.jsx` — Super Admin list/create/edit UI.
- `src/components/admin/SuperAdminPanel.jsx`, `src/components/layout/Sidebar.jsx`, `src/App.jsx` — lazy load, sidebar entry, and `/admin/advanced-setup` route.
- `src/pages/BrainCourses.test.mjs` and `src/components/admin/BrainCoursesManagement.test.mjs` — minimal pure helper/assertion checks where the existing app has no component test runner.
- `vercel.json`, deployment configuration documentation — retain the staging proxy and record required non-secret variables only.

### Task 1: Staging schema and RLS

**Files:**
- Create: `supabase/migrations/<generated>_create_brain_courses.sql`
- Create: `supabase/tests/brain_courses_rls.test.sql`

**Interfaces:**
- Produces `public.brain_courses` and `public.brain_course_purchases` for Tasks 2–5.
- `brain_courses`: `id`, `slug`, `title`, `author`, `category`, `thumbnail_url`, `course_url`, `original_price`, `sale_price`, `currency`, `sort_order`, `is_free`, `is_visible`, timestamps.
- `brain_course_purchases`: `id`, `patient_id`, `course_id`, `stripe_session_id`, `stripe_payment_intent`, `amount_paid`, `currency`, `purchased_at`.

- [ ] **Step 1: Create the failing RLS test**

Assert anonymous users cannot write either table, authenticated patients can read only visible courses and their own purchases, and cannot read another patient’s purchase.

- [ ] **Step 2: Run the database test to verify it fails**

Run: `supabase test db --file supabase/tests/brain_courses_rls.test.sql`

Expected: FAIL because the tables/policies do not exist.

- [ ] **Step 3: Generate and implement the migration**

Run `supabase migration new create_brain_courses`; define the schema, unique `(patient_id, course_id)` and unique non-null session index, practical catalogue indexes, explicit client grants/revokes, RLS policies, and the approved initial catalogue records. Use database constraints for non-negative prices and free/paid consistency where expressible.

- [ ] **Step 4: Apply only to the linked staging project and verify schema**

Run the migration through the staging Supabase connection. Query `information_schema`, `pg_indexes`, and `pg_policies`; confirm RLS is enabled for both tables.

- [ ] **Step 5: Re-run the database test**

Run: `supabase test db --file supabase/tests/brain_courses_rls.test.sql`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/brain_courses_rls.test.sql
git commit -m "feat(staging): add brain course schema"
```

### Task 2: Course API, validation, and checkout

**Files:**
- Create: `server/routes/brainCoursesRoutes.js`
- Create: `server/services/brainCoursePurchases.js`
- Create: `server/__tests__/brainCoursePurchases.test.mjs`
- Modify: `server/index.js`

**Interfaces:**
- Produces `brainCoursesRoutes` mounted at `/api/brain-courses`.
- Produces `normalizeCoursePayload(payload)` and `applyBrainCoursePurchase(session, databaseClient)`.
- Consumes the Task 1 tables and existing request token/role middleware patterns.

- [ ] **Step 1: Write failing helper tests**

Test `normalizeCoursePayload` rejects `http:` URLs, invalid currency, and paid zero-price input; converts blank prices to `null`; and clears sale price for a free course. Test `applyBrainCoursePurchase` returns the pre-existing entitlement on a repeated `(patient_id, course_id)` session grant.

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `node server/__tests__/brainCoursePurchases.test.mjs`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement minimal helpers and route module**

Implement the exact endpoints from the spec. Use the request token to identify the patient; use trusted application role data for Super Admin authorization. `POST /:id/checkout` must retrieve a visible paid course server-side and create a Stripe test Checkout session with `type=brain_course`, `course_id`, `patient_id`, and email metadata. Success/cancel URLs point to staging `/patient?tab=brain-courses`.

- [ ] **Step 4: Mount and verify API routing**

Mount the module after body parsing and before the general error handler. Verify unauthenticated `/access` returns 401, public catalogue returns only visible courses, and admin endpoints reject a patient token.

- [ ] **Step 5: Run helper test**

Run: `node server/__tests__/brainCoursePurchases.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/brainCoursesRoutes.js server/services/brainCoursePurchases.js server/__tests__/brainCoursePurchases.test.mjs server/index.js
git commit -m "feat(staging): add brain courses API"
```

### Task 3: Shared Stripe fulfilment

**Files:**
- Modify: `server/index.js`
- Modify: `server/__tests__/brainCoursePurchases.test.mjs`

**Interfaces:**
- Consumes `applyBrainCoursePurchase(session, databaseClient)` from Task 2.
- Webhook and `GET /api/stripe/verify-session/:sessionId` both call the helper only for `metadata.type === 'brain_course'` and a paid Stripe session.

- [ ] **Step 1: Extend the failing test**

Add a test that invokes fulfilment twice for one completed `brain_course` session and asserts only one purchase insert/upsert occurs and both calls report access granted.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node server/__tests__/brainCoursePurchases.test.mjs`

Expected: FAIL because neither Stripe completion path delegates to the helper.

- [ ] **Step 3: Add the two guarded branches**

In existing verify-session and signed raw-body webhook paths, route only paid `brain_course` sessions to the shared helper. Preserve all existing payment-type behavior and webhook signature verification.

- [ ] **Step 4: Run test and one Stripe test-mode verification**

Run: `node server/__tests__/brainCoursePurchases.test.mjs`

Expected: PASS. Then complete one Stripe test checkout and verify one staging `brain_course_purchases` row after both webhook and redirect verification.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/__tests__/brainCoursePurchases.test.mjs
git commit -m "fix(staging): make course fulfilment idempotent"
```

### Task 4: Patient catalogue and ownership UX

**Files:**
- Modify: `src/pages/BrainCourses.jsx`
- Create: `src/pages/BrainCourses.test.mjs`

**Interfaces:**
- Consumes `GET /api/brain-courses`, `GET /api/brain-courses/access`, and checkout response `{ url }`.
- Produces free/owned `Open Course` and unowned paid `Buy Now` UI.

- [ ] **Step 1: Write the failing resilience test**

Test the pure catalogue state helper with a fulfilled catalogue request and rejected access request. Assert the catalogue remains available, owned IDs are empty/unknown, and no logout callback is called.

- [ ] **Step 2: Run it to verify it fails**

Run: `node src/pages/BrainCourses.test.mjs`

Expected: FAIL because the helper/API-backed behavior is absent.

- [ ] **Step 3: Replace static runtime data with API state**

Use `Promise.allSettled`; retain category filtering, thumbnail/title/author/pricing, and a local error state. Send the patient token for access/checkout. Do not use generic auth redirect logic for access or checkout failure. Opening a course requires `is_free || ownedCourseIds.has(course.id)`.

- [ ] **Step 4: Run test and manually verify logged-in patient behavior**

Run: `node src/pages/BrainCourses.test.mjs`

Expected: PASS. Verify a visible free course opens and an unowned paid course begins test Checkout.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BrainCourses.jsx src/pages/BrainCourses.test.mjs
git commit -m "feat(staging): load patient brain courses from API"
```

### Task 5: Super Admin course management

**Files:**
- Create: `src/components/admin/BrainCoursesManagement.jsx`
- Create: `src/components/admin/BrainCoursesManagement.test.mjs`
- Modify: `src/components/admin/SuperAdminPanel.jsx`
- Modify: `src/components/layout/Sidebar.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes `GET/POST/PATCH /api/brain-courses/admin`.
- Produces `/admin/advanced-setup` and the `Patient Brain Courses` sidebar item.

- [ ] **Step 1: Write the failing form-normalization test**

Test client form serialization sends blank numeric inputs as `null`, sends `is_free`/`is_visible` booleans, and never leaves a loading state after a rejected list response.

- [ ] **Step 2: Run it to verify it fails**

Run: `node src/components/admin/BrainCoursesManagement.test.mjs`

Expected: FAIL because the component helper does not exist.

- [ ] **Step 3: Implement the management page and route wiring**

Follow existing Super Admin lazy-tab and sidebar patterns. List courses, create/edit with the exact required fields, present validation errors inline, and refetch after a successful save. Use the approved loading/error/empty states.

- [ ] **Step 4: Run the test and manually verify admin actions**

Run: `node src/components/admin/BrainCoursesManagement.test.mjs`

Expected: PASS. In staging, create/edit a visible free HTTPS course, reload patient Brain Courses, then hide it and confirm it disappears.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/BrainCoursesManagement.jsx src/components/admin/BrainCoursesManagement.test.mjs src/components/admin/SuperAdminPanel.jsx src/components/layout/Sidebar.jsx src/App.jsx
git commit -m "feat(staging): manage patient brain courses"
```

### Task 6: Staging deployment configuration and end-to-end validation

**Files:**
- Modify: `render.yaml` only if it documents/declares the new required staging values without values.
- Modify: `docs/DEPLOYMENT_GUIDE.md` or create `docs/staging-brain-courses.md` with non-secret staging setup instructions.

**Interfaces:**
- Consumes completed Tasks 1–5 and staging deployment controls.
- Produces a documented staging deployment and acceptance evidence.

- [ ] **Step 1: Verify required staging configuration exists without reading/printing secrets**

Check names only: `FRONTEND_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, and `VITE_API_URL`.

- [ ] **Step 2: Deploy staging only and register the Stripe test webhook**

Set success/cancel URLs to the staging patient Brain Courses page. Register only the staging Render webhook URL. Do not touch production environment variables, database, or Stripe webhooks.

- [ ] **Step 3: Execute acceptance checklist**

Run all Task 1–5 tests plus the manual eight-point checklist from the spec. Record test command/results and the migration query evidence.

- [ ] **Step 4: Commit documentation**

```bash
git add render.yaml docs
git commit -m "docs: configure staging brain courses"
```

## Plan Self-Review

- Spec coverage: Tasks 1–6 map respectively to schema/RLS, backend API/validation, idempotent checkout fulfilment, patient portal, Super Admin portal, and staging configuration/verification.
- Input coverage: all five Review Focus risks have a named test in Tasks 1–5.
- Interfaces: task outputs are consumed by the following task without alternate names.
- Scope: no production deployment, course hosting, refunds, or unrelated admin redesign is included.
