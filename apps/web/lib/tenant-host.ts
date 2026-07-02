/** Request header set by middleware when the host is a tenant subdomain (legacy redirect). */
export const TENANT_HEADER = "x-tenant-slug";

const RESERVED = new Set(["www", "api", "app", "admin", "mail", "smtp"]);

/** Root domain without protocol, e.g. `tripleseat.example.com` or `localhost` for dev. */
export function getRootDomain(): string | null {
  const env = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (env) return env.split(":")[0]!;
  if (process.env.NODE_ENV !== "production") return "localhost";
  return null;
}

/** Public web app origin (apex) — not per-caterer subdomains. */
export function getAppOrigin(): string | null {
  const root = getRootDomain();
  if (!root) return null;

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const port =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_PORT
      ? `:${process.env.NEXT_PUBLIC_DEV_PORT}`
      : process.env.NODE_ENV !== "production" && root === "localhost"
        ? ":3000"
        : "";

  return `${protocol}://${root}${port}`;
}

/** Slug segment for `/book/[slug]` — mirrors API reserved slugs. */
export function isPublicBookSlug(slug: string): boolean {
  if (!slug || slug.length < 2 || slug.length > 48) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  const reserved = new Set([
    "admin",
    "api",
    "app",
    "auth",
    "book",
    "c",
    "dashboard",
    "health",
    "login",
    "register",
    "www"
  ]);
  return !reserved.has(slug);
}

/**
 * Extracts tenant slug from host (legacy subdomain URLs).
 * `royaltaj.caterpro.com` → `royaltaj`
 */
export function getTenantSlugFromHost(host: string): string | null {
  const rootHost = getRootDomain();
  if (!rootHost) return null;

  const hostname = host.split(":")[0]!.toLowerCase();

  if (hostname === rootHost || hostname === `www.${rootHost}`) {
    return null;
  }

  if (!hostname.endsWith(`.${rootHost}`)) {
    return null;
  }

  const sub = hostname.slice(0, -(rootHost.length + 1));
  if (!sub || sub.includes(".") || RESERVED.has(sub)) {
    return null;
  }

  return sub;
}

/** Builds public URLs for a caterer (path-based booking on the app host). */
export function tenantUrls(slug: string) {
  const origin = getAppOrigin();
  if (!origin) {
    return { bookUrl: null as string | null, dashboardUrl: null as string | null, origin: null as string | null };
  }

  const encoded = encodeURIComponent(slug);
  return {
    origin,
    bookUrl: `${origin}/book/${encoded}`,
    dashboardUrl: `${origin}/dashboard`
  };
}
