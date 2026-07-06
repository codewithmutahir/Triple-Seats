/**
 * Ramp-up — 10 → 25 → 50 concurrent users (localhost).
 *
 * Run: pnpm load:ramp-up
 */

import http from "k6/http";
import { sleep } from "k6";

import { signIn } from "../lib/auth.js";
import { loadUsersData, rampUpThresholds, summarizePass } from "../lib/config.js";
import { runQuoteJourney } from "../lib/journey.js";

const data = loadUsersData();
const baseUrl = __ENV.BASE_URL || data.baseUrl;
const webOrigin = __ENV.WEB_ORIGIN || data.webOrigin;
const password = data.password;

export const options = {
  scenarios: {
    ramp_dashboard: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "45s", target: 25 },
        { duration: "60s", target: 50 },
        { duration: "30s", target: 0 }
      ],
      gracefulRampDown: "10s",
      exec: "dashboardOnly"
    },
    ramp_quote: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "45s", target: 10 },
        { duration: "60s", target: 15 },
        { duration: "30s", target: 0 }
      ],
      gracefulRampDown: "10s",
      exec: "quoteJourney",
      startTime: "30s"
    }
  },
  thresholds: rampUpThresholds
};

export function dashboardOnly() {
  const user = data.users[__VU % data.users.length];
  const jar = http.cookieJar();

  signIn(jar, baseUrl, webOrigin, user.email, password);

  http.get(`${baseUrl}/api/dashboard/all`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "dashboard_all" }
  });

  http.get(`${baseUrl}/api/calendar/init`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "calendar_init" }
  });

  sleep(0.5);
}

export function quoteJourney() {
  const user = data.users[__VU % data.users.length];
  const jar = http.cookieJar();

  runQuoteJourney(jar, baseUrl, webOrigin, user, password);
  sleep(1);
}

export function handleSummary(summary) {
  const passed = summarizePass(summary, 30000, 0.15);
  const p95 = summary.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  const rate = summary.metrics.http_req_failed?.values?.rate ?? 1;
  console.log(
    passed
      ? `\n✅ Ramp-up passed — p95 ${Math.round(p95)}ms, error rate ${(rate * 100).toFixed(2)}%\n`
      : `\n❌ Ramp-up failed — p95 ${Math.round(p95)}ms, error rate ${(rate * 100).toFixed(2)}%\n`
  );
  return { stdout: JSON.stringify(summary, null, 2) };
}
