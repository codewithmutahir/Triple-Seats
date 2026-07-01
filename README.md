# Tripeseats Monorepo

Turborepo workspace with:

- `apps/web`: Next.js 14 + Tailwind + shadcn/ui
- `apps/api`: Express API server
- `packages/database`: Prisma + PostgreSQL (you can use Supabase Postgres connection URL)

## Lead Intake + Email

- Public lead form is available at `apps/web` home page.
- Web app posts to `/api/leads` (rewritten to Express API in dev).
- API stores guest, lead, and event rows **directly on the caterer** identified by `LEAD_INTAKE_CATERER_ID`, then sends a confirmation email via Resend when configured.
- Configure in `apps/api/.env`:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
  - `LEAD_INTAKE_CATERER_ID` — **required**. Set this to the **real caterer account id** from the `caterers` table (not a separate intake placeholder). Example: `SELECT id FROM caterers WHERE email = 'your@email.com';`

## Quick start

1. Install deps:
   - `pnpm install`
2. Configure env files:
   - copy `.env.example` to `.env`
   - copy `apps/web/.env.example` to `apps/web/.env.local`
   - copy `apps/api/.env.example` to `apps/api/.env`
   - set `DATABASE_URL` to your Supabase Postgres connection string (or any PostgreSQL URL)
3. Generate Prisma client:
   - `pnpm db:generate`
4. Run all apps:
   - `pnpm dev`

## Multi-tenant subdomains

Each caterer gets a **subdomain booking page** (not a path like `/c/slug`):

- Apex (marketing + auth): `https://caterpro.com`
- Caterer booking: `https://royaltaj.caterpro.com/book`
- Caterer dashboard: `https://royaltaj.caterpro.com/dashboard`

### Local dev

1. Set in `apps/web/.env.local`:
   - `NEXT_PUBLIC_ROOT_DOMAIN=localhost`
2. Set in `apps/api/.env`:
   - `PUBLIC_ROOT_DOMAIN=localhost`
3. Apply DB column (once, if dashboard errors on `caterers.slug`):
   - `pnpm db:patch-slug`
4. Open `http://royaltaj.localhost:3000/book` (replace `royaltaj` with your caterer slug from the database).

Browsers resolve `*.localhost` automatically — no hosts file needed.

### Production (manual)

1. DNS wildcard: `*.caterpro.com` → Vercel
2. Vercel project → Domains: add `caterpro.com` and `*.caterpro.com`
3. Env vars:
   - Web: `NEXT_PUBLIC_ROOT_DOMAIN=caterpro.com`
   - API: `PUBLIC_ROOT_DOMAIN=caterpro.com`, `WEB_ORIGIN=https://caterpro.com`, `BETTER_AUTH_URL=https://caterpro.com`

## Useful scripts

- `pnpm dev`: Run all dev servers through Turbo
- `pnpm build`: Build all packages/apps
- `pnpm db:migrate`: Run Prisma migrate in `packages/database`

## Pre-deployment checklist

Complete this before pointing production traffic at the app.

### Environment — Web (Vercel)

- `INTERNAL_API_URL` — production Express API URL (no trailing slash)
- `NEXT_PUBLIC_ROOT_DOMAIN` — e.g. `caterpro.com`

### Environment — API (Render or similar)

- `DATABASE_URL` — transaction pooler URL (`?pgbouncer=true`)
- `DIRECT_URL` — session/direct URL for migrations
- `PUBLIC_ROOT_DOMAIN` — must match `NEXT_PUBLIC_ROOT_DOMAIN` on web
- `WEB_ORIGIN` — `https://caterpro.com`
- `BETTER_AUTH_URL` — `https://caterpro.com`
- `BETTER_AUTH_SECRET` — 32+ character random secret, unique per environment
- `BETTER_AUTH_API_KEY` — from Better Auth dashboard
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — verified sending domain (not `onboarding@resend.dev`)
- `LEAD_INTAKE_CATERER_ID` — only if the apex marketing form submits leads without a caterer slug

### Infrastructure

- DNS wildcard: `*.caterpro.com` → Vercel
- Vercel project domains: add `caterpro.com` and `*.caterpro.com`
- Run `pnpm db:migrate` against the production database

### Smoke tests before go-live

- Register a new account → dashboard loads with no developer instructions visible
- Dashboard booking link shows the real subdomain URL with Copy and Open working
- Submit a test inquiry at `{slug}.caterpro.com/book` → appears in Leads
- Sign in and out on both apex and tenant subdomain (cross-subdomain cookies)
- Generate a quote PDF and send a quote email
- API `GET /health` returns `{ ok: true, database: "ok" }`
- With the API temporarily unreachable, dashboard shows a friendly error (not raw gateway text)

### Final grep gate (manual or CI)

Search the codebase for user-visible strings that should never ship:

- `LEAD_INTAKE`
- `PUBLIC_ROOT`
- `apps/api/.env`
- `` Set ` `` (env-var setup instructions in UI copy)

