/**
 * Quote journey — writes during quote editing.
 *
 * Run: pnpm load:quote-journey
 */

import http from "k6/http";
import { sleep } from "k6";

import { loadUsersData, resolveThresholds, summarizePass } from "../lib/config.js";
import { runQuoteJourney } from "../lib/journey.js";

const data = loadUsersData();
const baseUrl = __ENV.BASE_URL || data.baseUrl;
const webOrigin = __ENV.WEB_ORIGIN || data.webOrigin;
const password = data.password;

export const options = {
  scenarios: {
    quote_journey: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 3 },
        { duration: "30s", target: 3 },
        { duration: "10s", target: 0 }
      ],
      gracefulRampDown: "5s"
    }
  },
  thresholds: resolveThresholds()
};

export default function quoteJourney() {
  const user = data.users[__VU % data.users.length];
  const jar = http.cookieJar();

  runQuoteJourney(jar, baseUrl, webOrigin, user, password);
  sleep(1);
}

export function handleSummary(summary) {
  const passed = summarizePass(summary, 10000);
  console.log(passed ? "\n✅ Quote journey passed\n" : "\n❌ Quote journey failed\n");
  return { stdout: JSON.stringify(summary, null, 2) };
}
