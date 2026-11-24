# Tripleseats

**A multi-tenant operations platform for caterers.** From the first inquiry to the final payment, Tripleseats gives each catering business one place to manage leads, quotes, bookings, events, tasks and calendars, with every tenant's data kept separate.

Currently live with a catering client.

<!-- Add 2-3 screenshots here: dashboard, quote builder, vendor calendar
![Dashboard](docs/screenshots/dashboard.png)
-->

## Features

**Lead to booking**
- Public booking page for every caterer at `/book/[slug]`, plus an embeddable inquiry form
- Each inquiry creates a guest, a lead and an event in a single transaction and sends a confirmation email
- Event pipeline with statuses, discussions, tasks and a full event history

**Quotes**
- Quote builder with packages, price tiers and line items
- Pricing by head, tray, flat rate, piece or tier, with tax, deposit and balance calculated automatically
- PDF export for quotes, kitchen sheets and labor sheets, and quote emailing with send-status tracking
- Batched edits with client request IDs, so retries never add duplicate items

**Payments**
- Clover Hosted Checkout links with idempotency keys
- Signed Clover webhooks update payment status
- Manual recording for cash, card, bank transfer and other payments

**Calendars**
- Event calendar and a separate vendor availability calendar
- Recurring entries (daily, weekly, monthly, yearly), sharing, attendee invitations and reminders
- iCal/webcal feeds and Google Calendar sync

**Team and security**
- Seven roles: `owner`, `admin`, `manager`, `sales`, `ops`, `viewer`, `calendar_only`
- Email/password, magic link and TOTP two-factor authentication (Better Auth)
- Team invitations and audit logs
- Reports for revenue, conversions, event timelines and recent activity

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Web | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, FullCalendar, Recharts |
| API | Node.js 20, Express 4, Zod |
| Database | PostgreSQL (Supabase), Prisma 5 |
| Auth | Better Auth |
| Email | Resend |
| Payments | Clover |
| Monitoring | Sentry, PostHog |
| Tooling | pnpm 9, Turborepo, Vitest, k6 |
| Hosting | Vercel (web), Hostinger (API) |

## Architecture

```
apps/
  web/         Next.js frontend (dashboard + public booking pages)
  api/         Express API (routes, auth, quotes, payments, calendar sync)
packages/
  database/    Prisma schema, migrations, client
  auth/        Shared auth configuration
```

### Multi-tenancy

- Every caterer is a `Caterer` row, and business tables carry a `catererId`.
- On each request the API validates the session, resolves the user's tenant and role, and scopes every Prisma query with that tenant's ID.
- Permissions are checked per role before a route runs.
- Public booking links resolve a slug to a tenant. Legacy subdomain URLs redirect to the slug-based path.
- Row Level Security is enabled on the core tables to block direct access through the Supabase Data API. Tenant filtering itself is enforced in the application layer.

### Data model

28 Prisma models covering tenants, team members, guests, leads, events, quotes, packages, payments, tasks, messages, vendor calendar entries and audit logs.

## Getting started

**Prerequisites:** Node.js 20+, pnpm 9+, a PostgreSQL database (a Supabase project works well).

```bash
# 1. Install dependencies
pnpm install

# 2. Create environment files
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# 3. Generate the Prisma client and apply migrations
pnpm db:generate
pnpm db:migrate

# 4. Start the web and API servers
pnpm dev
```

The web app runs at `http://localhost:3000`. Open `/book/<your-slug>` to see a caterer's public booking page.

## Environment variables

**API (`apps/api/.env`)**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled PostgreSQL connection string |
| `DIRECT_URL` | Direct connection string used for migrations |
| `WEB_ORIGIN` | Public URL of the web app |
| `PUBLIC_ROOT_DOMAIN` | Root domain, must match the web app |
| `BETTER_AUTH_URL` | Base URL used by Better Auth |
| `BETTER_AUTH_SECRET` | Random secret, 32+ characters, unique per environment |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Sender address on a verified domain |
| `LEAD_INTAKE_CATERER_ID` | Optional. Tenant ID for the apex marketing form |

**Web (`apps/web/.env.local`)**

| Variable | Purpose |
|---|---|
| `INTERNAL_API_URL` | Base URL of the Express API, no trailing slash |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Root domain, without `https://` |

Clover and Google Calendar credentials are configured per the comments in `apps/api/.env.example`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run all apps in development |
| `pnpm build` | Build all apps and packages |
| `pnpm test` | Run the Vitest suite |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create and apply migrations in development |
| `pnpm db:migrate:deploy` | Apply migrations in production |

## Testing

- **Unit and integration:** Vitest, covering quote totals, quote operations and route behavior.
- **Load testing:** k6 scripts in `tests/load/k6/` for smoke, quote journey and ramp-up scenarios.

## Deployment

- **Web:** Vercel with the root directory set to `apps/web`. Do not set `NODE_ENV` on Vercel, as it skips dev dependencies and breaks the build.
- **API:** Node.js 20 on Hostinger, started with `node apps/api/dist/index.js`.
- **Database:** Supabase PostgreSQL, migrations applied with `pnpm db:migrate:deploy`.

Step-by-step instructions, environment checklists and troubleshooting are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Author

Built by [Mutahir Hussain](https://github.com/codewithmutahir) at Elitesolution USA.
