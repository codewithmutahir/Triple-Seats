/**
 * Blocks until the local API responds (avoids Next proxy ECONNREFUSED when turbo starts tasks in parallel).
 */
const url = process.env.API_HEALTH_URL ?? "http://127.0.0.1:4000/health/live";
const maxMs = Number(process.env.API_WAIT_MAX_MS ?? 180_000);
const pollMs = 300;
const logEveryMs = 15_000;
const start = Date.now();
let lastLog = start;

let ready = false;

while (Date.now() - start < maxMs) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (res.ok) {
      await res.arrayBuffer().catch(() => {});
      ready = true;
      break;
    }
    await res.arrayBuffer().catch(() => {});
  } catch {
    /* retry */
  }

  const now = Date.now();
  if (now - lastLog >= logEveryMs) {
    const elapsed = Math.round((now - start) / 1000);
    console.log(`[wait-for-api] Still waiting for ${url} (${elapsed}s)…`);
    lastLog = now;
  }

  await new Promise((r) => setTimeout(r, pollMs));
}

if (ready) {
  process.exitCode = 0;
} else {
  console.error(`[wait-for-api] Timed out after ${maxMs}ms waiting for ${url}`);
  process.exitCode = 1;
}
