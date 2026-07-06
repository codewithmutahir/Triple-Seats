# CaterPro / Tripeseats — Cursor Agent Rules
# READ THIS BEFORE TOUCHING ANY FILE

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| Product name (UI) | Tripleseats |
| Repo name | Tripeseats |
| Type | Multi-tenant catering operations SaaS |
| Stack | pnpm monorepo + Turborepo |
| Primary color | Navy `#1B2A4A` |
| Currency | USD ($) |
| Default tax rate | 8.75% |
| Default deposit | 50% |

---

## 2. Monorepo Structure

```
tripeseats-monorepo/
  apps/
    web/          ← Next.js 14 (App Router) — port 3000
    api/          ← Express + Better Auth — port 4000
  packages/
    database/     ← Prisma schema + PrismaClient singleton
```

**Rules:**
- Never create files outside these directories without asking
- Shared types go in `packages/database` or `apps/web/lib/`
- Never import from `apps/api` into `apps/web` directly — use API calls only
- Never import from `apps/web` into `apps/api`

---

## 3. Package Manager

**Always use pnpm. Never use npm or yarn.**

```bash
pnpm add <package>           # add to specific app
pnpm add <package> -w        # add to root
pnpm db:migrate              # run migrations
pnpm db:generate             # generate Prisma client
pnpm dev                     # start all services
pnpm build                   # production build
pnpm typecheck               # TypeScript check
```

---

## 4. Tech Stack — Do Not Change Without Asking

### Frontend (apps/web)
- **Framework:** Next.js 14 App Router
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui ONLY — never install other UI libraries
- **Icons:** lucide-react ONLY — never use heroicons, fontawesome, etc.
- **Data fetching:** TanStack Query (React Query v5) — never raw useEffect+fetch for server data
- **State (UI only):** Zustand — only for UI state, NOT for server data
- **Forms:** React state + shadcn inputs — no react-hook-form unless explicitly asked
- **Toasts:** sonner — never use react-toastify or other toast libraries
- **Calendar:** FullCalendar with Zustand cache
- **Charts:** recharts
- **Fonts:** Inter (body) + Playfair Display (headings) via next/font/google

### Backend (apps/api)
- **Framework:** Express
- **Auth:** Better Auth with Prisma adapter
- **Email:** Resend
- **ORM:** Prisma — never write raw SQL unless absolutely necessary
- **Security:** helmet + express-rate-limit

### Database
- **DB:** PostgreSQL via Supabase (Neon DB also supported)
- **ORM:** Prisma
- **Migrations:** Always use `pnpm db:migrate`, never manually edit migration files

---

## 5. Architecture Rules

### Multi-tenancy
- Every DB table that stores business data has `catererId String` column
- Every authenticated API query MUST filter by `caterer.id` from session
- NEVER query data without scoping to `catererId` — this is a security requirement
- Row Level Security (RLS) is enabled on Supabase — API uses Prisma with service role

### Request Flow
```
Browser → Next.js (port 3000) → rewrite /api/* → Express (port 4000) → Supabase
```

- In dev: Next.js rewrites `/api/*` → `http://localhost:4000/api/*`
- In production: direct API calls via `INTERNAL_API_URL`
- Dashboard pages use server-side session fetch via `INTERNAL_API_URL`

### Authentication
- Better Auth handles all auth at `/api/auth/*`
- Session cookie: `better-auth.session_token` (may be chunked)
- Every protected API route calls `getSession(req)` from `apps/api/src/lib/session.ts`
- `getSession` has in-memory cache (30s TTL) — never bypass it
- Dashboard protected by: middleware (cookie check) + server layout (API session check)

---

## 6. Data Fetching Rules (CRITICAL)

### ALWAYS Use TanStack Query for Server Data

```typescript
// ✅ CORRECT
const { data, isLoading } = useQuery({
  queryKey: queryKeys.events.detail(eventId),
  queryFn: () => api.events.detail(eventId),
  staleTime: 60_000,
})

// ❌ WRONG — never do this for server data
const [data, setData] = useState(null)
useEffect(() => {
  fetch('/api/events/' + eventId).then(...)
}, [])
```

### Query Keys — Always Use Centralized Keys
```typescript
// ✅ CORRECT
import { queryKeys } from '@/lib/query-keys'
queryKeys.events.detail(eventId)
queryKeys.quotes.builder(eventId)
queryKeys.dashboard.stats()

// ❌ WRONG — never hardcode query keys inline
useQuery({ queryKey: ['event', eventId], ... })
```

### API Calls — Always Use api.ts
```typescript
// ✅ CORRECT
import { api } from '@/lib/api'
const data = await api.events.detail(eventId)

// ❌ WRONG — never call fetch directly in components
const res = await fetch('/api/events/' + id, { credentials: 'include' })
```

### staleTime Rules
| Data type | staleTime |
|-----------|-----------|
| Dashboard stats | 60s |
| Leads/Events list | 60s |
| Event detail | 60s |
| Quote builder | 120s |
| Calendar | 300s |
| Reports | 300s |
| Packages/Menu items | 300s |

---

## 7. Optimistic UI Rules (CRITICAL)

**Every mutation that changes visible data MUST be optimistic.**
User should NEVER wait for API response to see UI change.

### Correct Optimistic Pattern
```typescript
const mutation = useMutation({
  mutationFn: (data) => api.someAction(data),

  onMutate: async (newData) => {
    // 1. Cancel in-flight queries
    await qc.cancelQueries({ queryKey: theQueryKey })

    // 2. Snapshot for rollback
    const snapshot = qc.getQueryData(theQueryKey)

    // 3. Update cache IMMEDIATELY — user sees change now
    qc.setQueryData(theQueryKey, (old) => ({
      ...old,
      // apply the change optimistically
    }))

    return { snapshot }
  },

  onSuccess: (serverData) => {
    // ONLY update temp IDs with real server IDs
    // NEVER replace entire cache with server response
    qc.setQueryData(theQueryKey, (old) => ({
      ...old,
      // replace temp_xxx id with serverData.id only
    }))
  },

  onError: (err, _, ctx) => {
    // Revert to snapshot
    qc.setQueryData(theQueryKey, ctx.snapshot)
    toast.error('Action failed — changes reverted')
  }
})
```

### Rules for Optimistic Updates
1. **Never replace entire cache from server response** — only update IDs
2. **Never use opacity changes** for pending states on interactive elements
3. **Never disable buttons** during mutations unless absolutely necessary
4. **Use temp IDs** (`temp_${Date.now()}`) for optimistic items
5. **Replace temp IDs** with real server IDs on success
6. **Only revert on error** — not on success

### Visual Feedback During Mutations
```typescript
// ✅ CORRECT — subtle non-blocking indicator
<SaveIndicator 
  isPending={mutation.isPending}
  isSuccess={mutation.isSuccess}
  isError={mutation.isError}
/>

// ❌ WRONG — blocks user interaction
<div style={{ opacity: mutation.isPending ? 0.5 : 1 }}>
<button disabled={mutation.isPending}>

// ❌ WRONG — full page spinner
{mutation.isPending && <Spinner />}
```

---

## 8. Prefetching Rules

**Prefetch data on hover — before user clicks.**

```typescript
// On table row hover → prefetch detail pages
onMouseEnter={() => {
  qc.prefetchQuery({
    queryKey: queryKeys.events.detail(lead.id),
    queryFn: () => api.events.detail(lead.id),
    staleTime: 60_000,
  })
  qc.prefetchQuery({
    queryKey: queryKeys.quotes.builder(lead.id),
    queryFn: () => api.quotes.builder(lead.id),
    staleTime: 60_000,
  })
}}
```

**Always prefetch on:**
- Table row hover (leads, bookings, events)
- Sidebar nav link hover
- Any link that goes to a detail page

---

## 9. API Route Rules

### Every Authenticated Route Must:
```typescript
import { getSession } from '../lib/session'
import { timer } from '../lib/perf'

router.get('/some-route', async (req, res, next) => {
  try {
    const perf = timer('route-name')
    const { caterer } = await getSession(req)
    perf.step('session')

    // ALL queries must include catererId filter
    const data = await prisma.something.findMany({
      where: { catererId: caterer.id },
    })
    perf.step('db:query')
    perf.end()

    return res.json(data)
  } catch (err) {
    next(err)
  }
})
```

### Prisma Query Rules
```typescript
// ✅ CORRECT — select only needed fields
const events = await prisma.event.findMany({
  where: { catererId: caterer.id },
  select: {
    id: true,
    title: true,
    status: true,
    eventDate: true,
    primaryGuest: {
      select: { name: true, email: true }
    }
  }
})

// ❌ WRONG — fetches ALL columns (slow)
const events = await prisma.event.findMany({
  where: { catererId: caterer.id },
  include: { primaryGuest: true }
})
```

### Parallel Queries — Always Use Promise.all
```typescript
// ✅ CORRECT — parallel
const [total, events] = await Promise.all([
  prisma.event.count({ where }),
  prisma.event.findMany({ where, ...options })
])

// ❌ WRONG — sequential (2x slower)
const total = await prisma.event.count({ where })
const events = await prisma.event.findMany({ where })
```

### Batch Endpoints
For pages that need multiple data sources, create a single batch endpoint:
- `/api/dashboard/all` — stats + recent + upcoming
- `/api/quotes/builder/:eventId` — quote + packages + menuItems + event

Never make the frontend call 3-7 endpoints separately when one batch endpoint can do it.

---

## 10. Performance Rules

### Session Cache
`getSession()` has 30s in-memory cache. Never bypass it.
If adding a new authenticated route, always use `getSession(req)` — never call `auth.api.getSession()` directly.

### Rate Limiter — Do NOT Rate Limit These:
```typescript
// These must NEVER be rate limited:
'/api/auth/get-session'
'/api/auth/session'
'/api/health'
'/api/health/live'

// Only rate limit write operations:
'/api/auth/sign-in'    → 20 req/15min
'/api/auth/sign-up'    → 20 req/15min
'/api/leads' (POST)    → 5 req/hour per IP
'/api/*' (general)     → 200 req/15min
```

### Dev-only Logging
All performance logging is gated by `NODE_ENV`:
```typescript
// perf.ts and browserTimer already handle this
// Never add console.log without NODE_ENV check in production paths
if (process.env.NODE_ENV !== 'production') {
  console.log(...)
}
```

---

## 11. Frontend Component Rules

### File Structure
```
apps/web/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
    dashboard/
      layout.tsx          ← server component, session check
      page.tsx            ← dashboard home
      leads/page.tsx
      events/page.tsx
      quotes/page.tsx
      bookings/page.tsx
      discussions/page.tsx
      tasks/page.tsx
      calendar/
        page.tsx          ← server component
        calendar-client.tsx ← client component
      reports/page.tsx
    page.tsx              ← public lead form
  components/
    ui/                   ← shadcn components only
    providers.tsx         ← QueryClient + Toaster
    save-indicator.tsx
    dashboard-shell.tsx
  hooks/
    use-dashboard-query.ts
    use-event-detail.ts
    use-quote-builder.ts
    use-tasks-query.ts
    use-discussions-query.ts
    use-list-queries.ts
    use-reports-query.ts
    use-prefetch.ts
  lib/
    api.ts               ← ALL API calls go here
    query-keys.ts        ← ALL query keys go here
    stores/
      calendar-store.ts  ← Zustand (calendar only)
      app-store.ts       ← Zustand (UI state only)
    perf.ts              ← browser performance timer
    event-types.ts       ← shared TypeScript types
```

### Zustand — UI State Only
```typescript
// ✅ Zustand for UI state
const { sidebarOpen, setSidebarOpen } = useAppStore()

// ✅ Zustand for calendar (special case with FullCalendar)
const { setMonthEvents, getMonthEvents } = useCalendarStore()

// ❌ NEVER use Zustand for server data — use React Query
const { leads, setLeads } = useAppStore() // WRONG
```

### Skeleton Rules
```typescript
// ✅ CORRECT — show skeleton only on first load
if (isLoading && !data) return <PageSkeleton />
// Show data immediately even if stale

// ❌ WRONG — shows skeleton on every refetch
if (isLoading) return <PageSkeleton />
```

### No Invalid HTML Nesting
```tsx
// ✅ CORRECT
<div><Skeleton /></div>
<span><Skeleton /></span>

// ❌ WRONG — causes React hydration errors
<p><Skeleton /></p>  // div inside p is invalid HTML
<p><div>...</div></p>
```

---

## 12. Quote Builder Specific Rules

### Totals — Always Client-Side
```typescript
// ✅ CORRECT — calculate from cache, never wait for server
const totals = useMemo(() =>
  calculateQuoteTotals(
    lineItems,
    quote?.taxRate ?? 0.0875,
    quote?.depositPct ?? 0.5,
    event?.guestCount ?? 0
  ),
  [lineItems, quote?.taxRate, quote?.depositPct, event?.guestCount]
)

// ❌ WRONG — server totals for display
const totals = serverResponse.totals
```

### Package Selection State
```typescript
// ✅ CORRECT — track intent separately
const [selectedPkgId, setSelectedPkgId] = useState(
  () => quote?.lineItems.find(
    i => i.unitType === 'tiered_per_head'
  )?.packageId ?? null
)

// When selecting package:
setSelectedPkgId(pkg.id)  // instant
// Then fire mutation in background
```

### Package Mutation — Never Replace Full Cache
```typescript
onSuccess: (serverData) => {
  // Only update the temp ID → real ID
  qc.setQueryData(key, (old) => ({
    ...old,
    quote: {
      ...old.quote,
      lineItems: old.quote.lineItems.map(item =>
        item.id.startsWith('temp_pkg_') 
          ? { ...item, id: serverData.id }  // only update ID
          : item
      )
    }
  }))
  // NEVER: qc.setQueryData(key, serverData) — this breaks everything
}
```

### No Serial Queue for Independent Mutations
Package changes and guest count changes are **independent** — fire them in parallel. Never serialize them.

---

## 13. Database Schema Rules

### Every New Table Must Have
```prisma
model NewTable {
  id        String   @id @default(cuid())
  catererId String                         // REQUIRED for all business data
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  caterer   Caterer  @relation(fields: [catererId], references: [id])
  
  @@index([catererId])                     // REQUIRED index
}
```

### Required Indexes (Always Add These)
```prisma
// Event model must have:
@@index([catererId])
@@index([catererId, status])
@@index([catererId, eventDate])
@@index([catererId, createdAt])

// Guest model must have:
@@index([catererId])

// Lead model must have:
@@index([catererId])
@@index([contactEmail])
```

### Migration Rules
- Always run `pnpm db:migrate` after schema changes
- Never edit migration files after they're applied
- For production: use `prisma migrate deploy`

---

## 14. Security Rules

### Never Expose in Production
- Stack traces in API error responses
- Internal DB error messages
- Session tokens in logs
- API keys or secrets

### Auth Protection Layers
1. `middleware.ts` — checks session cookie for `/dashboard/*`
2. `dashboard/layout.tsx` — server-side session verification via API
3. `getSession(req)` — every API route verifies session + caterer

### Rate Limiting
Applied in `apps/api/src/index.ts`. Never remove or bypass.

---

## 15. Environment Variables

### API (apps/api/.env) — Required
```
DATABASE_URL=
DIRECT_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=           # browser origin (e.g. http://localhost:3000)
WEB_ORIGIN=                # same as BETTER_AUTH_URL
LEAD_INTAKE_CATERER_ID=    # real caterer ID from DB
API_PORT=4000
```

### API — Optional but Recommended
```
RESEND_API_KEY=
RESEND_FROM_EMAIL=
BETTER_AUTH_API_KEY=
BETTER_AUTH_TRUSTED_ORIGINS=
```

### Web (apps/web/.env.local)
```
INTERNAL_API_URL=http://127.0.0.1:4000  # server-side session fetch
```

### Rules
- `BETTER_AUTH_URL` must match the browser origin — NOT the API port
- `LEAD_INTAKE_CATERER_ID` must be a real caterer ID from the database
- Never commit `.env` files
- Always update `.env.example` when adding new variables

---

## 16. Error Handling

### API Routes — Always Use Try/Catch + next(err)
```typescript
router.get('/route', async (req, res, next) => {
  try {
    // ... logic
  } catch (err) {
    next(err)  // passes to global error handler
  }
})
```

### Frontend — Always Handle Errors
```typescript
const { data, isError, error } = useQuery(...)

if (isError) {
  return (
    <div>
      <p>Failed to load data</p>
      <button onClick={() => refetch()}>Retry</button>
    </div>
  )
}
```

---

## 17. Styling Rules

### Always Use
- Tailwind utility classes
- shadcn/ui components
- CSS variables for colors (`var(--color-*)`)
- Navy `#1B2A4A` for sidebar and primary brand elements
- `font-heading` class for Playfair Display headings
- `font-sans` class for Inter body text

### Never Use
- Inline style for colors that should be in Tailwind
- Hardcoded color hex values in JSX (use Tailwind classes)
- Other UI libraries without explicit approval

### Responsive
- Mobile: stack columns vertically, bottom nav
- Desktop: sidebar + main content
- Always test both breakpoints

---

## 18. What NEVER To Do

```
❌ Never use npm or yarn — always pnpm
❌ Never fetch data with useEffect+useState — use React Query
❌ Never store server data in Zustand — use React Query
❌ Never replace full cache on mutation success
❌ Never add opacity to interactive elements during loading
❌ Never disable buttons during background saves
❌ Never use include: { model: true } when select suffices
❌ Never query DB without catererId filter
❌ Never call auth.api.getSession() directly — use getSession(req)
❌ Never rate limit /api/auth/get-session
❌ Never add console.log without NODE_ENV production check
❌ Never hardcode query keys — always use queryKeys from lib/query-keys.ts
❌ Never call fetch() directly in components — use api.ts functions
❌ Never put <div> or <Skeleton> inside <p> tags
❌ Never serialize independent mutations with a queue
❌ Never commit secrets or .env files
❌ Never skip pnpm typecheck before saying "done"
❌ Never trust req.body without schema validation (Zod)
❌ Never mutate/delete a record by ID without re-checking catererId ownership
❌ Never run heavy/slow work (PDF gen, bulk email) inline in the request — use a queue
❌ Never call external services (Resend, payment gateway) without retry/backoff
❌ Never merge to main without CI (lint + typecheck + tests) passing
❌ Never log full request/response bodies containing PII
❌ Never expose internal error stacks or Prisma error messages to the client
```

---

## 19. Before Saying "Done" — Always Check

```
[ ] pnpm typecheck passes with zero errors
[ ] No console.log without NODE_ENV check in production paths
[ ] New API routes have getSession() + catererId filter
[ ] New Prisma models have catererId + @@index([catererId])
[ ] Mutations use optimistic updates (not await-then-show)
[ ] New query keys added to lib/query-keys.ts
[ ] New API functions added to lib/api.ts
[ ] Environment variables documented in .env.example
[ ] No new UI libraries installed without approval
[ ] No breaking changes to existing API response shapes
[ ] New API inputs validated with a Zod schema (body, query, params)
[ ] Update/delete routes verify record ownership before mutating
[ ] New external calls (email, payment, webhook) have error handling + retry
[ ] Unit/integration tests added or updated for new logic
[ ] No secrets, tokens, or PII written to logs
[ ] Accessibility basics checked (labels, keyboard nav, focus) for new UI
```

---

## 20. Key File Reference

| Purpose | File |
|---------|------|
| Auth config | `apps/api/src/lib/auth.ts` |
| Session + caterer | `apps/api/src/lib/session.ts` |
| Performance timer | `apps/api/src/lib/perf.ts` |
| Email helper | `apps/api/src/lib/mail.ts` |
| CORS + origins | `apps/api/src/lib/origins.ts` |
| Intake caterer | `apps/api/src/lib/intake-caterer.ts` |
| Package seeding | `apps/api/src/lib/seed-packages.ts` |
| Menu item seeding | `apps/api/src/lib/seed-menu-items.ts` |
| Quote totals calc | `apps/api/src/lib/quote-totals.ts` |
| PDF generation | `apps/api/src/lib/quote-pdf.ts` |
| API entry | `apps/api/src/index.ts` |
| Prisma schema | `packages/database/prisma/schema.prisma` |
| DB client | `packages/database/src/index.ts` |
| All API functions | `apps/web/lib/api.ts` |
| All query keys | `apps/web/lib/query-keys.ts` |
| Browser perf timer | `apps/web/lib/perf.ts` |
| Providers (QC+Toast) | `apps/web/components/providers.tsx` |
| Dashboard shell | `apps/web/app/dashboard/dashboard-shell.tsx` |
| Server layout | `apps/web/app/dashboard/layout.tsx` |
| Prefetch hooks | `apps/web/hooks/use-prefetch.ts` |
| Quote builder hook | `apps/web/hooks/use-quote-builder.ts` |
| Calendar store | `apps/web/lib/stores/calendar-store.ts` |
| App store (UI) | `apps/web/lib/stores/app-store.ts` |
| Save indicator | `apps/web/components/save-indicator.tsx` |
| Deployment guide | `DEPLOYMENT.md` |

---

## 21. Production Hardening Rules (Security, Scaling, Reliability)

### 21.1 Input Validation (CRITICAL — currently missing)
Every API route that accepts `body`, `query`, or `params` MUST validate with a schema (Zod recommended) before touching Prisma.

```typescript
// ✅ CORRECT
import { z } from 'zod'

const createLeadSchema = z.object({
  contactEmail: z.string().email(),
  guestCount: z.number().int().positive().max(10000),
  eventDate: z.coerce.date(),
})

router.post('/leads', async (req, res, next) => {
  try {
    const parsed = createLeadSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' })
    }
    // use parsed.data, never raw req.body
  } catch (err) {
    next(err)
  }
})

// ❌ WRONG — trusting raw body
const { guestCount } = req.body
await prisma.lead.create({ data: { guestCount } })
```

### 21.2 Ownership Check on Mutations (CRITICAL — currently missing)
`catererId` filtering on reads is not enough. Every update/delete MUST re-verify the record belongs to the session's caterer before mutating — never trust an ID from the client alone.

```typescript
// ✅ CORRECT
const event = await prisma.event.findFirst({
  where: { id: eventId, catererId: caterer.id },
})
if (!event) return res.status(404).json({ error: 'Not found' })
await prisma.event.update({ where: { id: eventId }, data: { ...changes } })

// ❌ WRONG — no ownership re-check, relies only on the ID
await prisma.event.update({ where: { id: eventId }, data: { ...changes } })
```

### 21.3 Background Jobs for Slow Work
PDF generation, bulk emails, and other slow/non-critical work must NOT block the request-response cycle. Use a queue (BullMQ + Redis, or similar).

```typescript
// ✅ CORRECT
router.post('/quotes/:id/send', async (req, res, next) => {
  await quotePdfQueue.add('generate-and-send', { quoteId: req.params.id })
  return res.status(202).json({ status: 'queued' })
})

// ❌ WRONG — generating PDF + sending email inline, blocking the request
const pdf = await generateQuotePdf(quoteId)
await resend.emails.send({ attachments: [pdf] })
```

### 21.4 Idempotency for Critical Mutations
Payment, booking-confirmation, and deposit-charge endpoints must accept an `Idempotency-Key` header to avoid duplicate creation on retry/double-click/network hiccup.

```typescript
// ✅ CORRECT
const key = req.headers['idempotency-key']
const existing = await prisma.paymentIntent.findUnique({ where: { idempotencyKey: key } })
if (existing) return res.json(existing)
```

### 21.5 Retry/Backoff for External Services
Any call to Resend, Supabase, or a future payment gateway must handle transient failures with retry + exponential backoff — never fire-and-forget.

```typescript
// ✅ CORRECT (simplified)
async function sendWithRetry(fn: () => Promise<any>, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } 
    catch (err) {
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, 2 ** i * 200))
    }
  }
}
```

### 21.6 Session Cache Does Not Scale Horizontally
The 30s in-memory `getSession()` cache is per-instance. If `apps/api` ever runs as more than one process/container behind a load balancer, cache state will be inconsistent across instances. Before scaling horizontally, move session cache to Redis (shared) instead of in-memory.

### 21.7 DB Connection Pooling
Supabase/Postgres has a hard connection limit. Use PgBouncer (Supabase provides this via the pooled connection string) or Prisma's `connection_limit` param — never let each Express instance open unbounded raw connections.

```
# .env — use the pooled port for the app, direct port only for migrations
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"
```

### 21.8 Pagination on All List Endpoints
Every list endpoint (leads, events, bookings) MUST paginate — never return unbounded result sets.

```typescript
// ✅ CORRECT
const { cursor, limit = 25 } = req.query
const events = await prisma.event.findMany({
  where: { catererId: caterer.id },
  take: limit,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  orderBy: { createdAt: 'desc' },
})
```

### 21.9 CSRF & Cookie Hardening
Better Auth session cookies must be set with `SameSite=Lax` (or `Strict` where possible) and `Secure` in production. State-changing routes accessed cross-site should be rejected by the `WEB_ORIGIN` check in `origins.ts` — verify this on every new route that accepts non-GET requests.

### 21.10 Dependency & Secret Scanning
- Run `pnpm audit` (or Snyk/Dependabot) in CI on every PR
- Never store secrets in code or `.env` committed to git — use the hosting platform's secret manager in production
- Rotate `BETTER_AUTH_SECRET` and API keys on any suspected leak

### 21.11 Audit Logging for Sensitive Actions
Log (to a dedicated `AuditLog` table, not console) who did what for: deletions, refunds/deposit changes, role/permission changes, and login from a new device. Never log full PII payloads or tokens.

### 21.12 Testing Requirements
- **Unit tests** (Vitest/Jest) for: `quote-totals.ts`, `session.ts`, any pure business logic
- **Integration tests** for API routes that touch money (quotes, deposits, payments)
- **E2E smoke test** (Playwright) for: login → create lead → build quote → send quote
- CI must run `pnpm typecheck && pnpm test` before merge — never merge on a red pipeline

### 21.13 Observability
- Add an APM/error tracker (Sentry or equivalent) in production — `console.log` alone is not sufficient once deployed
- `/api/health` should check DB connectivity, not just return 200
- Handle `SIGTERM` gracefully in `apps/api/src/index.ts` — finish in-flight requests before exiting (needed for zero-downtime deploys)

### 21.14 Accessibility Baseline
- All interactive elements (buttons, inputs) need visible focus states and proper `aria-label` where text isn't self-descriptive
- Forms must associate `<label>` with inputs (via `htmlFor`/`id`), not placeholder-only labels
- Modals/dialogs must trap focus and be closable via `Escape`

---

## 22. Production Hardening Checklist — Before Scaling Past MVP

```
[ ] All mutation routes validate input with Zod
[ ] All update/delete routes re-check catererId ownership, not just reads
[ ] Slow operations (PDF, bulk email) moved to a job queue
[ ] Payment/booking endpoints support idempotency keys
[ ] External API calls (Resend, etc.) wrapped in retry/backoff
[ ] Session cache plan exists for horizontal scaling (Redis)
[ ] DB uses pooled connection string (PgBouncer) in production
[ ] All list endpoints are paginated
[ ] Cookies set with SameSite + Secure in production
[ ] CI runs pnpm audit, typecheck, and tests on every PR
[ ] Sensitive actions write to an audit log
[ ] Error tracking (Sentry or similar) wired up in production
[ ] Health check verifies DB connectivity, not just process liveness
[ ] Graceful shutdown (SIGTERM) implemented for zero-downtime deploys
```

---

*Last updated: July 2026 — CaterPro v1.0*
*Always read this file before making changes to the codebase.*