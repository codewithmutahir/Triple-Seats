import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NODE_ENV !== "production") return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 0.2,
    profilesSampleRate: 0.1,
    environment: process.env.NODE_ENV,

    ignoreErrors: ["Unauthorized", "Not found"],

    beforeSend(event) {
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      return event;
    }
  });
}
