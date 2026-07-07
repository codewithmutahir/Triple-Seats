import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    sentryDsnConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    posthogKeyConfigured: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
  });
}

export async function POST() {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json(
      { ok: false, error: "Observability test route is production-only." },
      { status: 404 }
    );
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SENTRY_DSN is not configured. Add it in Vercel and redeploy." },
      { status: 503 }
    );
  }

  Sentry.captureException(new Error("Tripeseats server Sentry observability test"), {
    tags: { observability_test: "true", runtime: "nextjs-server" }
  });

  await Sentry.flush(2000);

  return NextResponse.json({ ok: true });
}
