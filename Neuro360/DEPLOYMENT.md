# Neuro360 — Manual Deployment Document

**Version:** 1.0 | **Date:** May 2026 | **Project:** Neuro360 / Limitless Brain Lab

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    NEURO360 STACK                       │
│                                                         │
│  Frontend (Vercel)  ──→  Backend (Render)  ──→  VPS    │
│  www.limitlessbrainlab.com   neuro360-backend   Claude  │
│                              .onrender.com     Gateway  │
│                    ──→  Database (Supabase)             │
│                         wqykofpjpaytjuqsessf            │
└─────────────────────────────────────────────────────────┘
```

| Component | Platform | URL |
|---|---|---|
| Frontend | Vercel | www.limitlessbrainlab.com |
| Backend API | Render | neuro360-backend.onrender.com |
| Claude AI Gateway | Hostinger VPS | 76.13.244.21:8787 |
| Database | Supabase | wqykofpjpaytjuqsessf.supabase.co |

---

## Prerequisites — Accounts Required

Before deploying, you must have active accounts on:

- [ ] **GitHub** — Source code repository (chatgptnotes/Neuro360)
- [ ] **Vercel** — Frontend hosting (free tier)
- [ ] **Render** — Backend hosting (free tier)
- [ ] **Supabase** — Database + file storage (free tier)
- [ ] **Hostinger VPS** — Claude AI Gateway (VPS plan)
- [ ] **Stripe** — Payment processing (test + live keys)
- [ ] **Google Gmail** — Transactional email (App Password required)
- [ ] **Anthropic** — Claude API (for VPS gateway)

---

## Part 1 — Database (Supabase)

### 1.1 Create Project
1. Go to supabase.com → New Project
2. Name: `neuro360`
3. Region: Southeast Asia (Singapore)
4. Save the following values:
   - Project URL: `https://<ref>.supabase.co`
   - Anon Key (public)
   - Service Role Key (secret — never expose to frontend)

### 1.2 Required Tables
Run these in Supabase SQL Editor:

```sql
-- Core tables (run in order)
-- patients, clinics, organizations, reports, payments,
-- algorithmResults, clinical_reports, users
-- (Full schema available in /supabase/migrations/)
```

### 1.3 Storage Buckets
Create these buckets in Supabase Storage:
- `patient-reports` — patient PDF reports (public read)
- `neurosense-reports` — generated Claude reports
- `edf-files` — uploaded EEG files (private)

### 1.4 Row Level Security
Enable RLS on all tables. Patients can only read their own records.

---

## Part 2 — VPS Claude Gateway (Hostinger)

The VPS runs the Nexaproc AI Gateway — it wraps the Claude CLI and provides PDF rendering via headless Chromium.

### 2.1 VPS Requirements
- Ubuntu 22.04 LTS
- Min 2GB RAM (4GB recommended)
- Node.js 20+
- PM2 (process manager)
- Chromium browser

### 2.2 Install Dependencies
```bash
# On the VPS (SSH in first)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
sudo apt-get install -y chromium-browser
```

### 2.3 Install Claude CLI
```bash
npm install -g @anthropic-ai/claude-code
# Login with your Anthropic account
claude login
```

### 2.4 Deploy Gateway Code
```bash
mkdir -p /opt/nexaproc-ai-gateway
cd /opt/nexaproc-ai-gateway
# Copy gateway source files (bridge.ts, server.ts, templates.ts, middleware/)
npm install
npm run build
```

### 2.5 Create .env on VPS
```bash
cat > /opt/nexaproc-ai-gateway/.env << 'EOF'
PORT=8787
NEXAPROC_MASTER_KEY=<generate_a_strong_random_key_min_32_chars>
CLAUDE_BIN=claude
CLAUDE_TIMEOUT_MS=45000
CHROMIUM_BIN=chromium-browser
EOF
```

### 2.6 Create CLAUDE.md (AI Learning Memory)
```bash
cat > /opt/nexaproc-ai-gateway/CLAUDE.md << 'EOF'
# Report Generation Lessons

## Lesson: Blank pages in PDF
Lesson: HTML report templates must include `@page { size: A4 portrait; margin: 0 }` in CSS.

## Lesson: Number extraction accuracy
Lesson: Copy values EXACTLY as printed. Never compute, round, or infer. Return null if absent.

## Lesson: Narrative tone
Lesson: Use wellness/educational language only. Never write medical diagnoses.
EOF
```

### 2.7 Start with PM2
```bash
cd /opt/nexaproc-ai-gateway
pm2 start dist/server.js --name nexaproc-aiinmail
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

### 2.8 Verify
```bash
curl http://localhost:8787/health
# Expected: {"status":"online","engine":"Claude CLI","busy":false}
```

### 2.9 Firewall — Open Port 8787
```bash
sudo ufw allow 8787/tcp
```

---

## Part 3 — Backend API (Render)

### 3.1 Connect GitHub
1. Go to render.com → New Web Service
2. Connect GitHub → select `chatgptnotes/Neuro360`
3. Render will detect `render.yaml` and auto-configure both services

### 3.2 Backend Service Settings
| Setting | Value |
|---|---|
| Name | neuro360-backend |
| Region | Singapore |
| Plan | Free (or Starter for $7/mo — recommended) |
| Build Command | `cd server && npm install && npx puppeteer browsers install chrome` |
| Start Command | `cd server && npm start` |
| Health Check Path | `/api/health` |

### 3.3 Backend Environment Variables (Render Dashboard)

Set these in **Render Dashboard → neuro360-backend → Environment**:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | From Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | From Supabase (secret) |
| `NEXAPROC_GATEWAY_URL` | `http://<vps-ip>:8787` | Your VPS IP |
| `NEXAPROC_MASTER_KEY` | `<your_vps_master_key>` | Must match VPS .env |
| `PERFORMANCE_REPORT_TOKEN` | `<generate_random_32+_chars>` | Static auth token |
| `GEMINI_API_KEY` | `AIza...` | From Google AI Studio |
| `GEMINI_REQUEST_DELAY_MS` | `2000` | |
| `GEMINI_DAILY_LIMIT` | `50` | |
| `STRIPE_SECRET_KEY` | `sk_live_...` | From Stripe Dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | From Stripe Webhooks |
| `EMAIL_USER` | `noreply@yourdomain.com` | Gmail address |
| `EMAIL_PASS` | `xxxx xxxx xxxx xxxx` | Gmail App Password |
| `EMAIL_FROM` | `noreply@yourdomain.com` | |
| `EMAIL_TO` | `admin@yourdomain.com` | Admin notification email |
| `FRONTEND_URL` | `https://www.limitlessbrainlab.com` | Your Vercel URL |
| `SHARED_SSO_SECRET` | `<generate_random_64_chars>` | |
| `PUPPETEER_CACHE_DIR` | `/opt/render/project/src/.cache/puppeteer` | |

### 3.4 Disk Storage
Add a disk to the backend service:
- Name: `uploads-storage`
- Mount Path: `/opt/render/project/src/server/uploads`
- Size: 1 GB

### 3.5 Deploy
Click **Manual Deploy → Deploy Latest Commit**

### 3.6 Verify Backend
```bash
curl https://neuro360-backend.onrender.com/api/health
# Expected: {"success":true,"message":"Server is running"}
```

---

## Part 4 — Frontend (Vercel)

### 4.1 Import Project
1. Go to vercel.com → Add New Project
2. Import from GitHub → `chatgptnotes/Neuro360`
3. Framework: Vite (auto-detected)

### 4.2 Build Settings
| Setting | Value |
|---|---|
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### 4.3 Frontend Environment Variables (Vercel Dashboard)

Set these in **Vercel → Project Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (anon key from Supabase) |
| `VITE_API_URL` | `https://neuro360-backend.onrender.com/api` |
| `VITE_PERFORMANCE_REPORT_TOKEN` | Same value as `PERFORMANCE_REPORT_TOKEN` on Render |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` from Stripe |
| `VITE_APP_NAME` | `Neuro360` |
| `VITE_SUPABASE_STORAGE_BUCKET` | `patient-reports` |

### 4.4 Custom Domain
1. Vercel → Project → Settings → Domains
2. Add `www.limitlessbrainlab.com`
3. Update DNS at your domain registrar:
   - CNAME `www` → `cname.vercel-dns.com`

### 4.5 Deploy
Push to `main` branch — Vercel auto-deploys on every push.

### 4.6 Verify Frontend
Open `https://www.limitlessbrainlab.com` — login page should load.

---

## Part 5 — Stripe Webhooks

### 5.1 Create Webhook
1. Stripe Dashboard → Developers → Webhooks → Add Endpoint
2. URL: `https://neuro360-backend.onrender.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `payment_intent.succeeded`

### 5.2 Copy Webhook Secret
Copy the `whsec_...` secret and add it to Render as `STRIPE_WEBHOOK_SECRET`.

---

## Part 6 — Gmail App Password (Email)

1. Google Account → Security → 2-Step Verification → App Passwords
2. App: Mail | Device: Other → name it "Neuro360"
3. Copy the 16-character password
4. Add to Render as `EMAIL_PASS` (format: `xxxx xxxx xxxx xxxx`)

---

## Part 7 — Post-Deployment Checklist

Run through this after every deployment:

### Infrastructure
- [ ] VPS gateway responds: `curl http://<vps-ip>:8787/health` → `{"status":"online"}`
- [ ] Backend healthy: `curl https://neuro360-backend.onrender.com/api/health` → `{"success":true}`
- [ ] Frontend loads: open `https://www.limitlessbrainlab.com`

### Authentication
- [ ] Can create a new account (Register)
- [ ] Can login with existing account
- [ ] Admin login works
- [ ] Clinic login works

### Report Generation
- [ ] Upload EEG files → QEEG report generates
- [ ] "Upload to Claude" → sidecar health check shows `✅ Sidecar online`
- [ ] Claude report generates (12 pages, no blank pages)
- [ ] Report appears in patient portal under "Neurosense Reports"

### Payments
- [ ] Stripe checkout opens (test mode)
- [ ] Webhook receives `checkout.session.completed`
- [ ] Credits update in `clinics` and `organizations` tables

### Email
- [ ] Test email sends from admin panel

---

## Part 8 — Environment Variables Quick Reference

### Critical — Must Set Manually in Render Dashboard

```
NEXAPROC_MASTER_KEY        ← Must match VPS .env exactly
PERFORMANCE_REPORT_TOKEN        ← Must match VITE_PERFORMANCE_REPORT_TOKEN in Vercel
SUPABASE_SERVICE_ROLE_KEY  ← Never expose to frontend
STRIPE_SECRET_KEY          ← Use sk_live_ for production
```

### Critical — Must Set Manually in Vercel Dashboard

```
VITE_PERFORMANCE_REPORT_TOKEN   ← Must match PERFORMANCE_REPORT_TOKEN on Render
VITE_SUPABASE_ANON_KEY     ← Public key (safe for frontend)
VITE_API_URL               ← Must point to Render backend URL
```

---

## Part 9 — Common Deployment Issues

| Problem | Cause | Fix |
|---|---|---|
| Blank pages in PDF | Chromium paper size mismatch | Already fixed via `@page { size: A4 }` in template |
| "Sidecar offline" error | VPS gateway not running | `pm2 restart nexaproc-aiinmail` on VPS |
| "NEXAPROC_MASTER_KEY not set" | Missing in Render dashboard | Add secret in Render → Environment |
| Backend cold start slow | Render free tier spins down | Upgrade to Starter ($7/mo) or keep-warm cron |
| Report credits not updating | `clinics` and `organizations` out of sync | Update both tables in Supabase |
| Checkout fails | Stripe key missing or wrong | Verify `STRIPE_SECRET_KEY` in Render dashboard |

---

## Part 10 — Keeping the VPS Alive (Keep-Warm)

Render free tier spins down after 15 min idle. Add a keep-warm cron on the VPS:

```bash
# Add to crontab (runs every 10 minutes)
crontab -e

# Add this line:
*/10 * * * * curl -s https://neuro360-backend.onrender.com/api/health > /dev/null
```

---

*Document generated: May 2026 | Neuro360 v2.0*
