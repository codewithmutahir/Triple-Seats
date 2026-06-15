/**
 * Origins allowed for CORS and Better Auth `trustedOrigins`.
 * When testing through Cloudflare Tunnel / ngrok, set `WEB_ORIGIN` and `BETTER_AUTH_URL`
 * to the same public https origin (e.g. https://xxx.trycloudflare.com) and optionally
 * list extra origins in `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated).
 */
export function allowedWebOrigins(): string[] {
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const web = process.env.WEB_ORIGIN?.trim();
  const extras =
    process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) ?? [];
  return [...new Set([...defaults, ...(web ? [web] : []), ...extras])];
}
