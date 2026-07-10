import { getCookieCache, getSessionCookie } from "better-auth/cookies";

type CookieRequest = Parameters<typeof getSessionCookie>[0];

export type MiddlewareSessionCheck = {
  /** Session token cookie is present (optimistic). */
  hasSessionCookie: boolean;
  /** Cookie cache decoded a non-expired session (no DB). */
  hasValidCache: boolean;
  /** Cookie cache was present but explicitly expired. */
  isExpired: boolean;
};

const SESSION_DATA_COOKIE = "better-auth.session_data";
const SECURE_SESSION_DATA_COOKIE = "__Secure-better-auth.session_data";

function readCookieNames(request: CookieRequest): string[] {
  const maybeNext = request as { cookies?: { getAll: () => { name: string }[] } };
  if (maybeNext.cookies?.getAll) {
    return maybeNext.cookies.getAll().map((cookie) => cookie.name);
  }
  return [];
}

function hasSessionDataCookie(request: CookieRequest): boolean {
  return readCookieNames(request).some(
    (name) =>
      name === SESSION_DATA_COOKIE ||
      name === SECURE_SESSION_DATA_COOKIE ||
      name.startsWith(`${SESSION_DATA_COOKIE}.`) ||
      name.startsWith(`${SECURE_SESSION_DATA_COOKIE}.`)
  );
}

/**
 * Lightweight middleware session gate — cookie presence + optional cookie-cache decode.
 * Does NOT hit the database; full validation belongs in server layouts via `getServerAuthSession`.
 */
export async function checkMiddlewareSession(request: CookieRequest): Promise<MiddlewareSessionCheck> {
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie) {
    return { hasSessionCookie: false, hasValidCache: false, isExpired: false };
  }

  try {
    const cached = await getCookieCache(request);
    if (cached?.user) {
      return { hasSessionCookie: true, hasValidCache: true, isExpired: false };
    }
    // Stale session_data with a session token usually means the cached session expired.
    if (hasSessionDataCookie(request)) {
      return { hasSessionCookie: true, hasValidCache: false, isExpired: true };
    }
  } catch {
    // Cache decode failed — fall back to cookie presence only.
  }

  return { hasSessionCookie: true, hasValidCache: false, isExpired: false };
}
