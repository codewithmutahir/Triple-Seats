/**
 * Seeds local load-test users via Better Auth + sample events in the DB.
 *
 * Prerequisites:
 *   - API running on localhost:4000 with LOAD_TEST_MODE=true
 *   - DATABASE_URL set in apps/api/.env (or .env.local)
 *
 * Usage:
 *   pnpm load:seed
 *   pnpm load:seed -- --count 20
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { connectDB, disconnectDB, prisma } from "@tripeseats/database";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(scriptDir, "../../..");

const API_BASE = (process.env.LOAD_TEST_API_URL ?? "http://127.0.0.1:4000").replace(
  /\/+$/,
  ""
);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const PASSWORD = process.env.LOAD_TEST_PASSWORD ?? "LoadTest123!";
const EMAIL_DOMAIN = process.env.LOAD_TEST_EMAIL_DOMAIN ?? "loadtest.local";
const OUTPUT_PATH = resolve(MONOREPO_ROOT, "tests/load/k6/data/users.json");

type SeedUser = {
  email: string;
  name: string;
  catererId: string;
  eventId: string;
  quoteId: string;
};

function loadApiEnv() {
  const apiRoot = resolve(MONOREPO_ROOT, "apps/api");
  config({ path: resolve(apiRoot, ".env") });
  const local = resolve(apiRoot, ".env.local");
  if (existsSync(local)) {
    config({ path: local, override: true });
  }
}

function parseCount(argv: string[]): number {
  const idx = argv.indexOf("--count");
  if (idx === -1) return 10;
  const raw = argv[idx + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    throw new Error("--count must be an integer between 1 and 500");
  }
  return n;
}

async function waitForApi(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE}/health/live`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `API not reachable at ${API_BASE}. Start dev server first: pnpm dev`
  );
}

async function authPost(path: string, body: Record<string, string>, cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: WEB_ORIGIN
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${API_BASE}/api/auth/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { ok: res.ok, status: res.status, json, setCookies };
}

function mergeCookies(existing: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const raw of setCookies) {
    const first = raw.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function signUpAndProvision(index: number): Promise<SeedUser> {
  const email = `loadtest+${index}@${EMAIL_DOMAIN}`;
  const name = `Load Test Caterer ${index}`;

  const signUp = await authPost("sign-up/email", { email, password: PASSWORD, name });
  if (!signUp.ok && signUp.status !== 400 && signUp.status !== 409 && signUp.status !== 422) {
    const msg =
      signUp.json && typeof signUp.json === "object" && "message" in signUp.json
        ? String((signUp.json as { message: string }).message)
        : JSON.stringify(signUp.json);
    throw new Error(`sign-up failed for ${email} (${signUp.status}): ${msg}`);
  }

  let cookie = mergeCookies("", signUp.setCookies);

  const signIn = await authPost("sign-in/email", { email, password: PASSWORD }, cookie);
  if (!signIn.ok) {
    throw new Error(`sign-in failed for ${email} (${signIn.status})`);
  }
  cookie = mergeCookies(cookie, signIn.setCookies);

  const bootstrap = await fetch(`${API_BASE}/api/dashboard/all`, {
    headers: { Cookie: cookie, Origin: WEB_ORIGIN }
  });
  if (!bootstrap.ok) {
    throw new Error(`dashboard bootstrap failed for ${email} (${bootstrap.status})`);
  }

  const caterer = await prisma.caterer.findFirst({
    where: { email },
    select: { id: true }
  });
  if (!caterer) {
    throw new Error(`caterer row missing after bootstrap for ${email}`);
  }

  const existingEvent = await prisma.event.findFirst({
    where: { catererId: caterer.id },
    select: { id: true },
    orderBy: { createdAt: "desc" }
  });

  let eventId: string;
  if (existingEvent) {
    eventId = existingEvent.id;
  } else {
    const guest = await prisma.guest.create({
      data: {
        catererId: caterer.id,
        firstName: "Load",
        lastName: `Guest ${index}`,
        email: `guest+${index}@${EMAIL_DOMAIN}`
      }
    });

    const eventDate = new Date();
    eventDate.setMonth(eventDate.getMonth() + 2);

    const event = await prisma.event.create({
      data: {
        catererId: caterer.id,
        primaryGuestId: guest.id,
        title: `Load Test Wedding ${index}`,
        eventType: "full_service",
        customerType: "b2c",
        status: "lead",
        eventDate,
        guestCountEstimate: 150 + index,
        venueName: "Load Test Venue"
      }
    });
    eventId = event.id;
  }

  let quote = await prisma.quote.findFirst({
    where: { eventId, catererId: caterer.id },
    select: { id: true },
    orderBy: { createdAt: "desc" }
  });
  if (!quote) {
    quote = await prisma.quote.create({
      data: {
        catererId: caterer.id,
        eventId,
        status: "draft",
        taxRate: 0.0875,
        depositPct: 0.5,
        totalAmount: 0
      },
      select: { id: true }
    });
  }

  return {
    email,
    name,
    catererId: caterer.id,
    eventId,
    quoteId: quote.id
  };
}

async function main() {
  loadApiEnv();
  const count = parseCount(process.argv.slice(2));

  console.log(`[load:seed] API: ${API_BASE}`);
  console.log(`[load:seed] Creating ${count} users…`);

  await waitForApi();
  await connectDB();

  const users: SeedUser[] = [];

  try {
    for (let i = 1; i <= count; i++) {
      const user = await signUpAndProvision(i);
      users.push(user);
      console.log(`  ✓ ${user.email} → event ${user.eventId}, quote ${user.quoteId}`);
    }
  } finally {
    await disconnectDB();
  }

  await mkdir(resolve(MONOREPO_ROOT, "tests/load/k6/data"), { recursive: true });
  const payload = {
    baseUrl: API_BASE,
    webOrigin: WEB_ORIGIN,
    password: PASSWORD,
    users
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`[load:seed] Wrote ${users.length} users → ${OUTPUT_PATH}`);
  console.log("[load:seed] Next: pnpm load:smoke");
}

main().catch((err) => {
  console.error("[load:seed] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
