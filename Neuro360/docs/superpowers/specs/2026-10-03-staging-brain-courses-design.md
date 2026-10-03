# Staging Brain Courses

## Purpose and scope

Replace the staging patient's static Brain Courses catalogue with the same controlled catalogue and purchase-access flow used for Brain Courses: Super Admin manages courses; patients see only visible courses; paid access is granted once after Stripe test payment. This work is staging-only. It must not use production Supabase data, Stripe keys, webhook endpoint, or frontend URL.

The existing patient Brain Courses navigation and route remain. The existing static list is removed from the runtime data path. Clinical documents, reports, and other purchases are out of scope.

## Architecture

The browser calls the existing Vercel proxy at `/api/brain-courses`. Its configured upstream is the staging Render backend, `https://limitlessbrainlab-backend.onrender.com/api`. The browser receives only public course fields and its own ownership IDs. The backend alone uses the staging service-role client and staging Stripe secret key.

```text
Super Admin -> /admin/advanced-setup -> API -> brain_courses (staging)
Patient -> Brain Courses -> API -> visible courses + owned IDs
Patient -> Buy Now -> API -> Stripe test Checkout
Stripe test webhook / verify-session -> idempotent grant -> brain_course_purchases
Patient -> refresh access -> Open Course
```

## Database and security

Create `brain_courses` with a UUID primary key and unique `slug`; title, author, category, thumbnail URL, HTTPS course URL, nullable original/sale prices, ISO currency, sort order, `is_free`, `is_visible`, timestamps, and initial course data from the intended migration.

Create `brain_course_purchases` with UUID primary key, `patient_id`, `course_id`, Stripe checkout session/payment intent, amount/currency, completion timestamp, and unique indexes for `(patient_id, course_id)` and non-null `stripe_session_id`. The pair uniqueness is the durable idempotency anchor: retries from both the webhook and verify-session return the same ownership rather than a second grant.

Both public tables have RLS enabled. Client roles have no write grants. Patients may read visible courses and only their own purchases; the backend service role performs administration and fulfilment. Backend authorization verifies the request token with a request-scoped auth client and resolves the user role from trusted application data; it does not sign in via the shared service-role client. This preserves service-role write capability under RLS.

## Backend API and checkout

Mount one `brainCoursesRoutes` module at `/api/brain-courses`.

- `GET /`: visible courses, ordered by sort order then title; public catalogue fields only.
- `GET /access`: authenticated patient ownership IDs only.
- `POST /:id/checkout`: authenticated patient; reject hidden/free/invalid courses; create Stripe **test-mode** Checkout with `type=brain_course`, course ID, patient ID and email metadata. Success/cancel return to the staging Brain Courses page.
- `GET /admin`, `POST /admin`, and `PATCH /admin/:id`: authenticated Super Admin only.

Create one `applyBrainCoursePurchase(session)` helper. It verifies that the completed Stripe session is a `brain_course`, validates metadata, upserts the purchase using the unique key, and can be safely called by both `/api/stripe-webhook` and `/api/stripe/verify-session/:sessionId`. The session is always retrieved from Stripe server-side before a verify-session grant. The webhook continues raw-body signature verification.

Course validation is server-side: course URL must be HTTPS, currency exactly three ISO letters, paid courses need a positive sale price, blank prices become `null`, and saving a free course clears `sale_price`.

## Patient experience

`BrainCourses` loads the catalogue and ownership independently via `Promise.allSettled`. If access fails, the catalogue remains usable and the session stays intact; only ownership is treated as unavailable. Checkout failures show a local error and must not invoke generic authentication redirect handling.

Course cards retain category filtering, thumbnail, title, author, and price display. Free and owned paid courses use `Open Course`; unowned paid courses use `Buy Now` and show a locked state. Course links open only after ownership/free status is established.

## Super Admin experience

Add `Patient Brain Courses` in the admin sidebar and route it to `/admin/advanced-setup`. The list loads independently of the form and always exits loading state on success or failure. The create/edit form exposes exactly: slug, title, author, category, thumbnail URL, course URL, original price, sale price, currency, sort order, free/paid, and visible/hidden. A successful save refetches the list; patient catalogue refetch on next visit/refresh sees the change automatically.

## Staging configuration

Required staging backend configuration: `FRONTEND_URL=https://limitlessbrainlab-eight.vercel.app`, staging `SUPABASE_URL`, staging `SUPABASE_SERVICE_ROLE_KEY`, staging `STRIPE_SECRET_KEY`, and staging `STRIPE_WEBHOOK_SECRET` from a Stripe test-mode webhook registered for `https://limitlessbrainlab-backend.onrender.com/api/stripe-webhook`.

Required staging frontend configuration: staging `VITE_SUPABASE_URL`, staging `VITE_SUPABASE_ANON_KEY`, staging `VITE_STRIPE_PUBLISHABLE_KEY`, and `/api` (or the existing staging Render API URL) for `VITE_API_URL`. No service-role or Stripe secret is exposed to Vite.

## Verification

Automated checks cover validation and idempotent fulfilment. The staging migration is verified by querying both tables, indexes, RLS, and policies after application.

Manual staging acceptance:

1. Super Admin creates and edits a visible free HTTPS course.
2. It appears in a patient account and opens its link.
3. A hidden course is absent for that patient.
4. A paid course starts a Stripe test checkout.
5. Successful test payment creates exactly one ownership row despite webhook and verify-session retries.
6. The owned course changes to `Open Course`.
7. Simulated access endpoint failure does not log the patient out.
8. An admin course save succeeds after an admin login.

## Out of scope

Production deployment, production Stripe configuration, production database migration, refunds, entitlement revocation, and a separate course-content hosting system.
