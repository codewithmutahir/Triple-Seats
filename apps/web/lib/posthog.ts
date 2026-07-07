import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (process.env.NODE_ENV !== "production") return;

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    ui_host: "https://us.posthog.com",
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,
      recordCrossOriginIframes: false,
      maskInputOptions: {
        password: true,
        email: false
      }
    },
    autocapture: true,
    capture_pageview: false,
    respect_dnt: true,
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") {
        ph.opt_out_capturing();
        return;
      }

      // Only start replay after the application has obtained explicit user consent.
    },
  });
}

/** Capture a product analytics event (production only). */
export function captureAnalytics(event: string, properties?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined") return;
  posthog.capture(event, properties);
}

export { posthog };
