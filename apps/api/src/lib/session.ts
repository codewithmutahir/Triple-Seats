import type { Request } from "express";

import { auth } from "./auth";
import { prisma, type Prisma } from "@tripeseats/database";

type Caterer = Prisma.CatererGetPayload<Record<string, never>>;

const catererCache = new Map<string, { caterer: Caterer; ts: number }>();
const CATERER_TTL = 30_000;

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

type AuthUser = { id: string; email: string | null; name: string | null };

/**
 * Ensures every signed-in user has a caterer row:
 * 1. Already linked by `userId` → return
 * 2. Row exists with same email and `userId` is null → link
 * 3. Row exists with same email and different `userId` → conflict
 * 4. Otherwise → create a new caterer (onboarding)
 */
export async function ensureCatererForAuthUser(user: AuthUser) {
  const cached = catererCache.get(user.id);
  if (cached && Date.now() - cached.ts < CATERER_TTL) {
    return cached.caterer;
  }

  let caterer = await prisma.caterer.findFirst({
    where: { userId: user.id }
  });

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
        caterer = await prisma.caterer.create({
          data: {
            userId: user.id,
            name: displayName,
            email
          }
        });
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

  catererCache.set(user.id, { caterer, ts: Date.now() });
  return caterer;
}

/**
 * Validates Better Auth session and resolves (or creates) the caterer for this user.
 */
export async function getSession(req: Request) {
  const data = await auth.api.getSession({ headers: requestToHeaders(req) });
  if (!data?.user || !data?.session) {
    throw new SessionError("Unauthorized", 401);
  }

  const caterer = await ensureCatererForAuthUser({
    id: data.user.id,
    email: data.user.email ?? null,
    name: data.user.name ?? null
  });

  return { session: data.session, user: data.user, caterer };
}
