import { isLocalHostname } from "./is-local-hostname";

const LOCAL_WEB_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

function authUrlIsLocal(): boolean {
  const raw = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (!raw) return false;
  try {
    return isLocalHostname(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/**
 * Origins allowed for CORS and Better Auth `trustedOrigins`.
 * Set `WEB_ORIGIN` and `BETTER_AUTH_URL` to your production https origin.
 * For subdomain tenants, set `PUBLIC_ROOT_DOMAIN` (e.g. catepro.app) — subdomains are allowed automatically.
 * For Vercel preview deploys, set `ALLOW_VERCEL_PREVIEW_ORIGINS=true` or list URLs in `BETTER_AUTH_TRUSTED_ORIGINS`.
 */
export function allowedWebOrigins(): string[] {
  const origins: string[] = [];

  if (process.env.NODE_ENV !== "production" || authUrlIsLocal()) {
    origins.push(...LOCAL_WEB_ORIGINS);
  }

  for (const raw of [process.env.WEB_ORIGIN, process.env.BETTER_AUTH_URL]) {
    const trimmed = raw?.trim().replace(/\/+$/, "");
    if (trimmed) origins.push(trimmed);
  }

  const root = process.env.PUBLIC_ROOT_DOMAIN?.trim().toLowerCase().split(":")[0];
  if (root && process.env.NODE_ENV === "production") {
    origins.push(`https://${root}`, `https://www.${root}`);
  }

  const extras =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter((s) => s.length > 0) ?? [];

  if (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS === "true") {
    origins.push("https://*.vercel.app");
  }

  return [...new Set([...origins, ...extras])];
}

function isVercelPreviewOrigin(origin: string): boolean {
  if (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS !== "true") return false;
  try {
    const { protocol, hostname } = new URL(origin.replace(/\/+$/, ""));
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/** CORS origin check — includes tenant subdomains when PUBLIC_ROOT_DOMAIN is set. */
export function isAllowedWebOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, "");
  if (allowedWebOrigins().includes(normalized)) return true;
  if (isVercelPreviewOrigin(normalized)) return true;

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
