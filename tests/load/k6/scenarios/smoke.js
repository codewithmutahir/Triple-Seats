/**
 * Step 1 smoke test — localhost only.
 *
 * Run: pnpm load:smoke
 */

import http from "k6/http";
import { check, sleep } from "k6";

import { signIn } from "../lib/auth.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_WEB_ORIGIN,
  jsonHeaders,
  loadUsersData,
  resolveThresholds,
  summarizePass
} from "../lib/config.js";

const data = loadUsersData();
const baseUrl = __ENV.BASE_URL || data.baseUrl || DEFAULT_BASE_URL;
const webOrigin = __ENV.WEB_ORIGIN || data.webOrigin || DEFAULT_WEB_ORIGIN;
const password = data.password;

export const options = {
  scenarios: {
    smoke: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "20s", target: 5 },
        { duration: "10s", target: 0 }
      ],
      gracefulRampDown: "5s"
    }
  },
  thresholds: resolveThresholds()
};

export default function smoke() {
  const user = data.users[__VU % data.users.length];
  const jar = http.cookieJar();

  signIn(jar, baseUrl, webOrigin, user.email, password);
  sleep(0.3);

  const health = http.get(`${baseUrl}/health/ready`, {
    tags: { name: "health_ready" }
  });
  check(health, {
    "health ready 200": (r) => r.status === 200
  });

  const dashboard = http.get(`${baseUrl}/api/dashboard/all`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "dashboard_all" }
  });
  check(dashboard, {
    "dashboard 200": (r) => r.status === 200,
    "dashboard has stats": (r) => {
      try {
        const body = r.json();
        return body && typeof body.stats === "object";
      } catch {
        return false;
      }
    }
  });

  sleep(0.5);

  const builder = http.get(`${baseUrl}/api/quotes/builder/${user.eventId}`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "quote_builder" }
  });
  check(builder, {
    "quote builder 200": (r) => r.status === 200
  });

  sleep(1);
}

export function handleSummary(summary) {
  const passed = summarizePass(summary, 10000);
  const p95 = summary.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  console.log(
    passed
      ? `\n✅ Smoke test passed — p95 ${Math.round(p95)}ms\n`
      : `\n❌ Smoke test failed — p95 ${Math.round(p95)}ms (limit 10000ms)\n`
  );
  return {
    stdout: JSON.stringify(summary, null, 2)
  };
}
