import { cookies, headers } from "next/headers";

/** Same default as `scripts/wait-for-api.mjs` — Express API, not the Next rewrite. */
function internalApiOrigin(): string {
  return process.env.INTERNAL_API_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4000";
}

export type ServerAuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type ServerAuthSession = {
  user: ServerAuthUser;
};

/**
 * Resolves the current Better Auth session on the server by forwarding cookies to the API.
 * Avoids relying on the browser + Next rewrite for the initial dashboard gate (fewer false "logged out" states).
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
  } catch {
    return null;
  }
}
