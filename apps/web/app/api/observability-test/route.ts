import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json(
      { ok: false, error: "Observability test route is production-only." },
      { status: 404 }
    );
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SENTRY_DSN is not configured." },
      { status: 503 }
    );
  }

  Sentry.captureException(new Error("Tripeseats server Sentry observability test"), {
    tags: { observability_test: "true", runtime: "nextjs-server" }
  });

  return NextResponse.json({ ok: true });
}
