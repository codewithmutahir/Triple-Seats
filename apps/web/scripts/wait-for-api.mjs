/**
 * Blocks until the local API responds (avoids Next proxy ECONNREFUSED when turbo starts tasks in parallel).
 */
const url = process.env.API_HEALTH_URL ?? "http://127.0.0.1:4000/health/live";
const maxMs = Number(process.env.API_WAIT_MAX_MS ?? 60_000);
const pollMs = 300;
const start = Date.now();

while (Date.now() - start < maxMs) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (res.ok) {
      process.exit(0);
    }
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, pollMs));
}

console.error(`[wait-for-api] Timed out after ${maxMs}ms waiting for ${url}`);
process.exit(1);
