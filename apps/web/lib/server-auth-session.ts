import { cookies, headers } from "next/headers";

import type { AuthSession, AuthUser } from "@tripeseats/auth";

/** @deprecated Use `AuthUser` from `@tripeseats/auth` */
export type ServerAuthUser = AuthUser;

/** @deprecated Use `AuthSession` from `@tripeseats/auth` */
export type ServerAuthSession = AuthSession;

/** Same default as `scripts/wait-for-api.mjs` — Express API, not the Next rewrite. */
function internalApiOrigin(): string {
  return process.env.INTERNAL_API_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4000";
}

/**
 * Resolves the current Better Auth session on the server by forwarding cookies to the API,
 * which calls `auth.api.getSession()` internally (`/api/auth/get-session`).
 * This is the split-monorepo equivalent of `auth.api.getSession({ headers })` in a single-app setup.
 */
export async function getServerAuthSession(): Promise<ServerAuthSession | null> {
  const forwarded = headers().get("cookie")?.trim();
  const fallback = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const cookieHeader = forwarded || fallback;
  if (!cookieHeader) return null;

  const url = `${internalApiOrigin()}/api/auth/get-session`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { cookie: cookieHeader },
      cache: "no-store"
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: ServerAuthUser } | null;
    if (!data?.user?.id) return null;
    return { user: data.user };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[getServerAuthSession] session lookup failed:", err);
    }
    return null;
  }
}
