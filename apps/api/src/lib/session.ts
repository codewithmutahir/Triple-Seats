import type { Request } from "express";
import * as Sentry from "@sentry/node";

import { auth } from "./auth";
import { prisma, type Prisma, type TeamRole } from "@tripeseats/database";
import { timer } from "./perf";
import { seedMenuItemsForCaterer } from "./seed-menu-items";
import { seedPackagesForCaterer } from "./seed-packages";
import { ensureCatererSlug, uniqueSlugForName } from "./slug";

type Caterer = Prisma.CatererGetPayload<Record<string, never>>;

const catererCache = new Map<string, { caterer: Caterer; ts: number }>();
const CATERER_TTL = 30_000;

type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export class SessionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/** Build Fetch API `Headers` from Express (cookies + auth headers). */
export function requestToHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const part of value) headers.append(key, part);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/** Extract Better Auth session token from cookies (supports chunked + secure prefix). */
export function extractSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie ?? "";

  let token = cookieHeader.match(/better-auth\.session_token=([^;]+)/)?.[1];
  if (token) return decodeURIComponent(token);

  const chunks: string[] = [];
  let i = 0;
  while (true) {
    const chunk = cookieHeader.match(
      new RegExp(`better-auth\\.session_token\\.${i}=([^;]+)`)
    )?.[1];
    if (!chunk) break;
    chunks.push(decodeURIComponent(chunk));
    i++;
  }
  if (chunks.length > 0) return chunks.join("");

  token = cookieHeader.match(/__Secure-better-auth\.session_token=([^;]+)/)?.[1];
  if (token) return decodeURIComponent(token);

  const secureChunks: string[] = [];
  i = 0;
  while (true) {
    const chunk = cookieHeader.match(
      new RegExp(`__Secure-better-auth\\.session_token\\.${i}=([^;]+)`)
    )?.[1];
    if (!chunk) break;
    secureChunks.push(decodeURIComponent(chunk));
    i++;
  }
  if (secureChunks.length > 0) return secureChunks.join("");

  return null;
}

type AuthUser = { id: string; email: string | null; name: string | null };

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

/**
 * Public lead form writes to `LEAD_INTAKE_CATERER_ID`. When that caterer matches the
 * signed-in user's email, always use it so the dashboard shows submitted leads.
 */
async function linkIntakeCatererForUser(user: AuthUser): Promise<Caterer | null> {
  const intakeId = process.env.LEAD_INTAKE_CATERER_ID?.trim();
  if (!intakeId) return null;

  const intake = await prisma.caterer.findUnique({ where: { id: intakeId } });
  if (!intake) return null;

  if (intake.userId === user.id) return intake;

  const userEmail = normalizeEmail(user.email);
  const intakeEmail = normalizeEmail(intake.email);
  if (!userEmail || userEmail !== intakeEmail) return null;

  if (intake.userId && intake.userId !== user.id) {
    throw new SessionError(
      "This email is already linked to another caterer account. Contact support if you need access.",
      409
    );
  }

  return prisma.caterer.update({
    where: { id: intakeId },
    data: { userId: user.id }
  });
}

/**
 * Ensures every signed-in user has a caterer row:
 * 1. Configured intake caterer (same email) → link and return
 * 2. Already linked by `userId` → return
 * 3. Row exists with same email and `userId` is null → link
 * 4. Row exists with same email and different `userId` → conflict
 * 5. Otherwise → create a new caterer (onboarding)
 */
export async function ensureCatererForAuthUser(user: AuthUser) {
  const cached = catererCache.get(user.id);
  if (cached && Date.now() - cached.ts < CATERER_TTL && cached.caterer.slug?.trim()) {
    return cached.caterer;
  }

  const intakeCaterer = await linkIntakeCatererForUser(user);
  if (intakeCaterer) {
    catererCache.set(user.id, { caterer: intakeCaterer, ts: Date.now() });
    return intakeCaterer;
  }

  let caterer = await prisma.caterer.findFirst({
    where: { userId: user.id }
  });

  if (caterer) {
    const intakeId = process.env.LEAD_INTAKE_CATERER_ID?.trim();
    if (intakeId && caterer.id !== intakeId) {
      const intake = await prisma.caterer.findUnique({ where: { id: intakeId } });
      const userEmail = normalizeEmail(user.email);
      if (
        intake &&
        normalizeEmail(intake.email) === userEmail &&
        intake.userId === user.id
      ) {
        caterer = intake;
      }
    }
  }

  if (!caterer) {
    if (!user.email?.trim()) {
      throw new SessionError("Add an email to your account to use the caterer dashboard.", 403);
    }

    const email = user.email.trim();

    const byEmail = await prisma.caterer.findFirst({
      where: { email }
    });

    if (byEmail) {
      if (!byEmail.userId) {
        caterer = await prisma.caterer.update({
          where: { id: byEmail.id },
          data: { userId: user.id }
        });
      } else if (byEmail.userId === user.id) {
        caterer = byEmail;
      } else {
        throw new SessionError(
          "This email is already linked to another caterer account. Contact support if you need access.",
          409
        );
      }
    } else {
      const displayName = user.name?.trim() || email.split("@")[0] || "My catering business";

      try {
        const slug = await uniqueSlugForName(displayName);
        caterer = await prisma.caterer.create({
          data: {
            userId: user.id,
            name: displayName,
            slug,
            email
          }
        });
        await seedMenuItemsForCaterer(caterer.id);
        await seedPackagesForCaterer(caterer.id);
      } catch (e: unknown) {
        const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
        if (code === "P2002") {
          const again = await prisma.caterer.findFirst({
            where: { OR: [{ userId: user.id }, { email }] }
          });
          if (again) {
            caterer = again;
          } else {
            console.error("Failed to provision caterer profile:", e);
            throw new SessionError("Unable to create caterer profile. Try again or contact support.", 500);
          }
        } else {
          console.error("Failed to provision caterer profile:", e);
          throw new SessionError("Unable to create caterer profile. Try again or contact support.", 500);
        }
      }
    }
  }

  if (caterer.slug?.trim()) {
    catererCache.set(user.id, { caterer, ts: Date.now() });
    return caterer;
  }

  const withSlug = await ensureCatererSlug(caterer);
  catererCache.set(user.id, { caterer: withSlug, ts: Date.now() });
  return withSlug;
}

const sessionCache = new Map<string, { data: SessionData; ts: number }>();
const SESSION_TTL = 30_000;

async function resolveAuthSession(req: Request): Promise<SessionData> {
  const token = extractSessionToken(req);
  if (token) {
    const cached = sessionCache.get(token);
    if (cached && Date.now() - cached.ts < SESSION_TTL) {
      const exp = cached.data.session?.expiresAt;
      if (!exp || (exp instanceof Date ? exp.getTime() : new Date(exp as unknown as string).getTime()) > Date.now()) {
        return cached.data;
      }
      sessionCache.delete(token);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[session] Fetching session from Better Auth");
  }

  const data = await auth.api.getSession({ headers: requestToHeaders(req) });
  if (!data?.user || !data?.session) {
    throw new SessionError("Unauthorized", 401);
  }

  if (token) {
    sessionCache.set(token, { data, ts: Date.now() });
  }
  return data;
}

/**
 * Validates Better Auth session and resolves (or creates) the caterer for this user.
 * Session is revalidated with Better Auth on every request; caterer lookup is cached by user id.
 */
export async function getSession(req: Request) {
  const perf = timer("session");

  const data = await resolveAuthSession(req);
  perf.step("auth.api.getSession");

  const caterer = await ensureCatererForAuthUser({
    id: data.user.id,
    email: data.user.email ?? null,
    name: data.user.name ?? null
  });
  perf.step("ensureCaterer");

  if (process.env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
    Sentry.setUser({
      id: data.user.id,
      email: data.user.email ?? undefined
    });
    Sentry.setTag("catererId", caterer.id);
  }

  perf.step("team:role");

  perf.end();
  const member = await prisma.teamMember.findFirst({
    where: {
      catererId: caterer.id,
      userId: data.user.id,
      inviteStatus: "accepted"
    },
    select: { role: true }
  });

  const role: TeamRole = member?.role ?? "owner";

  return { session: data.session, user: data.user, caterer, role };
}
