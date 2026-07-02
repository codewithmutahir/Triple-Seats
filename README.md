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

### Production (Hostinger MCP)

Use the **Hostinger** extension in Cursor (Websites + Domains tools enabled). After OAuth sign-in, ask the agent to deploy — no manual hPanel uploads or DNS copy-paste.

**1. Prepare archives locally**

```powershell
pnpm hostinger:archive          # API → tripeseats-api-hostinger.zip (~150 KB)
pnpm hostinger:archive:web      # Web → tripeseats-web-hostinger.zip (optional, separate site)
pnpm db:migrate:deploy          # apply migrations to production Postgres (Supabase)
```

**2. Deploy API via MCP** (agent runs these Hostinger tools)

| Tool | Purpose |
|------|---------|
| `hosting_listWebsitesV1` | Pick the target domain / username |
| `hosting_createNodeJSBuildFromArchiveV1` | Upload `tripeseats-api-hostinger.zip`, auto-detect build |
| `hosting_listNodeJSBuildsV1` | Poll build status until complete |

Recommended build overrides if auto-detect misses the monorepo layout:

- **Package manager:** `pnpm`
- **Build script:** `pnpm hostinger:build`
- **Start / entry:** `pnpm start` → `node apps/api/dist/index.js`
- **Node version:** `20`

Set env vars in hPanel (or via MCP if available): `DATABASE_URL`, `DIRECT_URL`, `PUBLIC_ROOT_DOMAIN`, `WEB_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

**3. Deploy web (Next.js) via MCP**

Same flow with `tripeseats-web-hostinger.zip` on your apex domain. Set `INTERNAL_API_URL` to the API URL from step 2 and `NEXT_PUBLIC_ROOT_DOMAIN` to your root domain.

**4. DNS (Domains MCP — not manual)**

| Tool | Purpose |
|------|---------|
| `domains_listDomainsV1` | List domains on the account |
| DNS tools under **Domains** | Add wildcard `*` → web host IP / CNAME as Hostinger instructs |

**5. Smoke tests** — see [Pre-deployment checklist](#pre-deployment-checklist) below.

### Web 403 after deploy (no custom start command in hPanel)

Hostinger Next.js runs `npm start` from `package.json` automatically — you cannot override the start command in the UI. If the site returns **403** after a successful build, the usual cause is a **missing `.next` folder** in the uploaded zip (Windows `Compress-Archive` skips hidden folders unless the archive script uses `Get-ChildItem -Force`). Without `.next`, `next start` exits immediately and Hostinger serves 403.

**Option A — redeploy the fixed archive (~128 MB, recommended):**

1. Locally run `pnpm hostinger:archive:web` → creates `tripeseats-web-hostinger-v2.zip` (verify it contains `.next/` — hundreds of entries)
2. hPanel → web domain → **Deployments → Deploy** (upload archive in browser)
3. Confirm env vars: `INTERNAL_API_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NODE_ENV=production`

**Option B — edit start script only (not enough if `.next` is missing):**

1. hPanel → **File Manager** → `domains/<your-web-domain>/public_html/.builds/last-source/`
2. Open `package.json` and set `"start": "next start"` under `scripts` (`last-source` is the running app; `source` is only the next build staging folder)
3. **Websites → your web domain → Deployments → Restart**

If `.next` is missing from `last-source`, you must redeploy (Option A).

**API site** should use the latest `tripeseats-api-hostinger-v2.zip` (includes root `app.js`). Do **not** set `API_PORT` — Hostinger injects `PORT`.

### Production — Web on Vercel (recommended)

Hostinger is fine for the Express API; **deploy Next.js to Vercel** instead of fighting Node.js zip deploys.

1. [vercel.com](https://vercel.com) → **Add project** → import this repo
2. **Root Directory:** `apps/web`
3. **Production branch:** `dev` (or `main` after merge)
4. **Environment variables** (Vercel project settings):

| Variable | Example |
|----------|---------|
| `INTERNAL_API_URL` | `https://lightcyan-kingfisher-777374.hostingersite.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `your-project.vercel.app` (or your custom domain, no `https://`) |

**Do not set `NODE_ENV` on Vercel** — it makes `pnpm install` skip devDependencies and breaks the build (missing `tailwindcss`). Vercel sets production mode automatically.

5. After the first deploy, update **API env on Hostinger** to match the Vercel URL:

| API variable | Value |
|--------------|--------|
| `WEB_ORIGIN` | `https://your-project.vercel.app` |
| `BETTER_AUTH_URL` | `https://your-project.vercel.app` |
| `PUBLIC_ROOT_DOMAIN` | `your-project.vercel.app` |

Restart the API app in hPanel. Public booking links use **`/book/[slug]`** on your app domain (e.g. `https://tripleseat.hussaincatering.com/book/royaltaj`) — no wildcard DNS required.


## Useful scripts

- `pnpm dev`: Run all dev servers through Turbo
- `pnpm build`: Build all packages/apps
- `pnpm db:migrate`: Run Prisma migrate in `packages/database`

## Pre-deployment checklist

Complete this before pointing production traffic at the app.

### Environment — Web (Hostinger Node.js or separate host)

- `INTERNAL_API_URL` — production Express API URL (no trailing slash)
- `NEXT_PUBLIC_ROOT_DOMAIN` — e.g. `yourdomain.com`

### Environment — API (Hostinger Node.js via MCP)

Deploy with `hosting_createNodeJSBuildFromArchiveV1` using `tripeseats-api-hostinger.zip` (run `pnpm hostinger:archive` first).

- `DATABASE_URL` — transaction pooler URL (`?pgbouncer=true`)
- `DIRECT_URL` — session/direct URL for migrations
- `PUBLIC_ROOT_DOMAIN` — must match `NEXT_PUBLIC_ROOT_DOMAIN` on web
- `WEB_ORIGIN` — `https://caterpro.com`
- `BETTER_AUTH_URL` — `https://caterpro.com`
- `BETTER_AUTH_SECRET` — 32+ character random secret, unique per environment
- `BETTER_AUTH_API_KEY` — from Better Auth dashboard
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — verified sending domain (not `onboarding@resend.dev`)
- `LEAD_INTAKE_CATERER_ID` — only if the apex marketing form submits leads without a caterer slug

### Infrastructure (Hostinger MCP)

- `hosting_listWebsitesV1` — confirm API and web sites exist (create with `hosting_createWebsiteV1` if needed)
- Domains MCP — apex + `tripleseat` CNAME to Vercel (wildcard not required for `/book/[slug]` links)
- `pnpm db:migrate:deploy` against production Postgres (Supabase)

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

