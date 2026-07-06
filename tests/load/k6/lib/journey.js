import http from "k6/http";
import { check } from "k6";

import { signIn } from "./auth.js";
import { jsonHeaders } from "./config.js";

/**
 * Full quote editing journey — read + write paths used during wedding season.
 */
export function runQuoteJourney(jar, baseUrl, webOrigin, user, password) {
  signIn(jar, baseUrl, webOrigin, user.email, password);

  const dashboard = http.get(`${baseUrl}/api/dashboard/all`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "dashboard_all" }
  });
  check(dashboard, { "dashboard 200": (r) => r.status === 200 });

  const quoteId = user.quoteId;
  const eventId = user.eventId;

  const builder = http.get(`${baseUrl}/api/quotes/builder/${eventId}`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "quote_builder" }
  });
  check(builder, {
    "quote builder 200": (r) => r.status === 200,
    "quote builder has quote": (r) => {
      try {
        return Boolean(r.json("quote.id"));
      } catch {
        return false;
      }
    }
  });

  const resolvedQuoteId = quoteId || builder.json("quote.id");
  if (!resolvedQuoteId) {
    return;
  }

  const guestCount = 140 + (__VU % 40);
  const guestPatch = http.patch(
    `${baseUrl}/api/quotes/${resolvedQuoteId}/guest-count`,
    JSON.stringify({ guestCount }),
    {
      jar,
      headers: jsonHeaders(webOrigin),
      tags: { name: "quote_guest_count" }
    }
  );
  check(guestPatch, { "guest count 200": (r) => r.status === 200 });

  const addItem = http.post(
    `${baseUrl}/api/quotes/${resolvedQuoteId}/items`,
    JSON.stringify({
      category: "appetizer",
      name: `Load Test Item VU${__VU}`,
      quantity: 1,
      unitPrice: 12.5,
      unitType: "per_head"
    }),
    {
      jar,
      headers: jsonHeaders(webOrigin),
      tags: { name: "quote_add_item" }
    }
  );
  check(addItem, { "add item created": (r) => r.status === 201 || r.status === 200 });

  const builderRefresh = http.get(`${baseUrl}/api/quotes/builder/${eventId}`, {
    jar,
    headers: jsonHeaders(webOrigin),
    tags: { name: "quote_builder" }
  });
  check(builderRefresh, { "quote builder refresh 200": (r) => r.status === 200 });
}
