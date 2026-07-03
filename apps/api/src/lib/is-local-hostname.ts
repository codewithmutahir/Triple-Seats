/** True for localhost-style hostnames (not real public tenant roots). */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().split(":")[0] ?? "";
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}
