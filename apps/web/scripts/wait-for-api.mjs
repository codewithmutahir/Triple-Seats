/**
 * Blocks until the local API responds (avoids Next proxy ECONNREFUSED when turbo starts tasks in parallel).
 */
const url = process.env.API_HEALTH_URL ?? "http://127.0.0.1:4000/health/live";
const POLL_INTERVAL = 500;
const MAX_WAIT = Number(process.env.API_WAIT_MAX_MS ?? 30_000);

async function waitForApi() {
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        console.log("[wait-for-api] API ready!");
        return;
      }
    } catch {
      /* retry */
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed > 0 && elapsed % 5 === 0) {
      process.stdout.write(`\r[wait-for-api] Waiting... ${elapsed}s`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  console.error("[wait-for-api] Timeout — starting anyway");
}

await waitForApi();
