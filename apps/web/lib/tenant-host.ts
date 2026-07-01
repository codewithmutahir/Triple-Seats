/** Request header set by middleware when the host is a tenant subdomain. */
export const TENANT_HEADER = "x-tenant-slug";

const RESERVED = new Set(["www", "api", "app", "admin", "mail", "smtp"]);

/** Root domain without protocol, e.g. `caterpro.com` or `localhost` for dev subdomains. */
export function getRootDomain(): string | null {
  const env = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (env) return env.split(":")[0]!;
  if (process.env.NODE_ENV !== "production") return "localhost";
  return null;
}

/**
 * Extracts tenant slug from host.
 * `royaltaj.caterpro.com` → `royaltaj`
 * `caterpro.com` / `www.caterpro.com` → null (apex)
 * `royaltaj.localhost:3000` → `royaltaj` (local dev)
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

/** Builds public URLs for a caterer on their subdomain. */
export function tenantUrls(slug: string) {
  const root = getRootDomain();
  if (!root) {
    return { bookUrl: null as string | null, dashboardUrl: null as string | null, origin: null as string | null };
  }

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const port =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_PORT
      ? `:${process.env.NEXT_PUBLIC_DEV_PORT}`
      : process.env.NODE_ENV !== "production" && root === "localhost"
        ? ":3000"
        : "";

  const origin = `${protocol}://${slug}.${root}${port}`;
  return {
    origin,
    bookUrl: `${origin}/book`,
    dashboardUrl: `${origin}/dashboard`
  };
}
