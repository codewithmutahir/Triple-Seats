import * as Sentry from "@sentry/node";

export async function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NODE_ENV !== "production") return;

  const { nodeProfilingIntegration } = await import("@sentry/profiling-node");

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
