# Staging Brain Courses setup

This feature is staging-only. Configure the staging frontend and backend with
separate values; never copy production database or Stripe secrets.

## Backend (staging Render service)

- `FRONTEND_URL=https://limitlessbrainlab-eight.vercel.app`
- `STAGING_FRONTEND_URL=https://limitlessbrainlab-eight.vercel.app`
- `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- staging Stripe test `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

The shared backend must also retain its existing routed Supabase configuration.
The Brain Courses webhook uses checkout metadata to select the staging
Supabase service-role client because Stripe does not send a browser Origin.

## Frontend (staging Vercel project)

- `VITE_API_URL=/api`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the staging project
- `VITE_STRIPE_PUBLISHABLE_KEY` for Stripe test mode

## Stripe test webhook

Register the staging backend URL with `checkout.session.completed` and its
staging `STRIPE_WEBHOOK_SECRET`. Stripe Checkout success and cancel return to
`https://limitlessbrainlab-eight.vercel.app/patient?tab=brain-courses`.

## Acceptance

1. Create a visible free HTTPS course in `/admin/advanced-setup`; verify it opens in the patient portal.
2. Hide it and verify it disappears after reload.
3. Create a paid course, complete a Stripe test payment, and confirm exactly one
   `brain_course_purchases` row exists after both webhook and return verification.
4. Confirm the paid course changes to **Open Course** and an access request failure
   leaves the patient session intact.
