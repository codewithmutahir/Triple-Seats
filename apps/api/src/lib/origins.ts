/**
 * Origins allowed for CORS and Better Auth `trustedOrigins`.
 * Set `WEB_ORIGIN` and `BETTER_AUTH_URL` to your production https origin.
 * For subdomain tenants, set `PUBLIC_ROOT_DOMAIN` (e.g. catepro.app) — subdomains are allowed automatically.
 */
export function allowedWebOrigins(): string[] {
  const origins: string[] = [];

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  const web = process.env.WEB_ORIGIN?.trim();
  if (web) origins.push(web.replace(/\/+$/, ""));

  const extras =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter((s) => s.length > 0) ?? [];

  return [...new Set([...origins, ...extras])];
}

/** CORS origin check — includes tenant subdomains when PUBLIC_ROOT_DOMAIN is set. */
export function isAllowedWebOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, "");
  if (allowedWebOrigins().includes(normalized)) return true;

  const root = process.env.PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return false;

  try {
    const { protocol, hostname } = new URL(normalized);
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (hostname === root || hostname === `www.${root}`) return true;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      return sub.length > 0 && !sub.includes(".");
    }
  } catch {
    return false;
  }

  return false;
}
