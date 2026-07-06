# Load testing (localhost only)

Production ko touch nahi karte — sirf local dev stack par tests chalate hain.

## Prerequisites

1. **K6 install** (ek baar):

   ```bash
   choco install k6 -y
   k6 version
   ```

2. **Dev servers chal rahe hon:**

   ```bash
   pnpm dev
   ```

3. **Load test mode** — `apps/api/.env.local`:

   ```env
   LOAD_TEST_MODE=true
   ```

   API restart karo after adding this.

---

## Quick start

```bash
pnpm load:seed              # 10 test users + events + quotes
pnpm load:smoke             # 5 VUs — baseline reads
pnpm load:quote-journey     # 3 VUs — guest count + menu item writes
pnpm load:ramp-up           # 10 → 25 → 50 VUs ramp
pnpm load:all               # teeno tests sequentially
```

Zyada users:

```bash
pnpm load:seed -- --count 25
```

---

## Test scenarios

| Command | VUs | Kya test hota hai |
|---------|-----|-------------------|
| `load:smoke` | 5 | Login, health, dashboard, quote builder (read) |
| `load:quote-journey` | 3 | Dashboard + builder + guest count PATCH + item POST |
| `load:ramp-up` | 50 peak | Dashboard/calendar reads + parallel quote writes |

---

## Thresholds (Option C)

**Localhost** (default) — remote Supabase ke liye relaxed:

| Metric | Target |
|--------|--------|
| Error rate | < 5% |
| p95 latency (reads) | < **10 sec** |
| p95 latency (ramp-up peak) | observe — 50 VU pe breaking point dhundhte hain |

**Production-like** staging:

```bash
k6 run -e THRESHOLD_PROFILE=production tests/load/k6/scenarios/smoke.js
```

| Metric | Target |
|--------|--------|
| Error rate | < 1% |
| p95 latency | < 2 sec |

---

## API optimizations (Option B)

Applied in codebase:

| Change | File | Effect |
|--------|------|--------|
| Quote builder `select` instead of `include` | `quotes.ts` | Less data over the wire |
| No duplicate event join on quote | `quote-serialize.ts` | One fewer nested query |
| Composite index `[catererId, eventId]` | `schema.prisma` | Faster quote lookup by event |
| Index `[catererId, usageCount]` | `schema.prisma` | Faster menu item sort |
| Session cache TTL 15s → 30s | `session.ts` | Fewer Better Auth round-trips |

After schema changes:

```bash
pnpm db:migrate
```

---

## Ramp-up schedule (`load:ramp-up`)

```
Dashboard reads:  0 → 10 → 25 → 50 VUs (2.5 min)
Quote writes:     0 → 5  → 10 → 15 VUs (parallel, starts at 30s)
```

Break point dhundhne ke liye output mein dekho:

- p95 > 5 sec kab shuru hota hai
- Error rate kab 0% se upar jata hai

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `API not reachable` | `pnpm dev` — port 4000 |
| `Too many requests` | `LOAD_TEST_MODE=true` + API restart |
| `users.json` missing | `pnpm load:seed` |
| `k6 not found` | `choco install k6 -y` |
| Sign-in 401 | `pnpm load:seed` dubara chalao |

---

## Safety rules

- ✅ Sirf `127.0.0.1:4000`
- ✅ Sirf local DB
- ❌ Production par kabhi mat chalao
- ❌ Production mein `LOAD_TEST_MODE=true` mat rakho
