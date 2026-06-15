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

## Useful scripts

- `pnpm dev`: Run all dev servers through Turbo
- `pnpm build`: Build all packages/apps
- `pnpm db:migrate`: Run Prisma migrate in `packages/database`
