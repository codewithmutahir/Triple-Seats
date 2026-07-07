"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { captureAnalytics, posthog } from "@/lib/posthog";

type Status = "idle" | "ok" | "error";

export default function ObservabilityTestPage() {
  const [posthogStatus, setPosthogStatus] = useState<Status>("idle");
  const [sentryClientStatus, setSentryClientStatus] = useState<Status>("idle");
  const [sentryServerStatus, setSentryServerStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const isProd = process.env.NODE_ENV === "production";
  const hasPosthogKey = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const hasSentryDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

  useEffect(() => {
    if (!isProd || !hasPosthogKey) return;
    captureAnalytics("observability_test_pageview", { source: "system/observability-test" });
  }, [isProd, hasPosthogKey]);

  function testPosthog() {
    setMessage(null);
    try {
      if (!isProd) {
        setMessage("PostHog only captures in production (NODE_ENV=production).");
        setPosthogStatus("error");
        return;
      }
      if (!hasPosthogKey) {
        setMessage("NEXT_PUBLIC_POSTHOG_KEY is missing on this deployment.");
        setPosthogStatus("error");
        return;
      }
      posthog.capture("observability_test", {
        source: "manual_button",
        page: "/system/observability-test"
      });
      setPosthogStatus("ok");
      setMessage("PostHog event sent — check Live events in PostHog within ~30s.");
    } catch (err) {
      setPosthogStatus("error");
      setMessage(err instanceof Error ? err.message : "PostHog test failed");
    }
  }

  function testSentryClient() {
    setMessage(null);
    try {
      if (!isProd) {
        setMessage("Sentry is disabled outside production.");
        setSentryClientStatus("error");
        return;
      }
      if (!hasSentryDsn) {
        setMessage("NEXT_PUBLIC_SENTRY_DSN is missing on this deployment.");
        setSentryClientStatus("error");
        return;
      }
      Sentry.captureException(new Error("Tripeseats client Sentry observability test"), {
        tags: { observability_test: "true" }
      });
      setSentryClientStatus("ok");
      setMessage("Sentry client error sent — check Issues in Sentry within ~1 min.");
    } catch (err) {
      setSentryClientStatus("error");
      setMessage(err instanceof Error ? err.message : "Sentry client test failed");
    }
  }

  async function testSentryServer() {
    setMessage(null);
    try {
      const res = await fetch("/api/observability-test", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setSentryServerStatus("error");
        setMessage(body?.error ?? `Server test failed (${res.status})`);
        return;
      }
      setSentryServerStatus("ok");
      setMessage("Sentry server error sent — check Issues in Sentry within ~1 min.");
    } catch (err) {
      setSentryServerStatus("error");
      setMessage(err instanceof Error ? err.message : "Sentry server test failed");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Observability test</CardTitle>
          <p className="text-sm text-muted-foreground">
            Production-only checks for PostHog and Sentry. Safe to delete this page after verification.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            <li>Environment: {process.env.NODE_ENV}</li>
            <li>PostHog key: {hasPosthogKey ? "configured" : "missing"}</li>
            <li>Sentry DSN: {hasSentryDsn ? "configured" : "missing"}</li>
          </ul>

          <div className="flex flex-col gap-2">
            <Button type="button" onClick={testPosthog}>
              Test PostHog event
              {posthogStatus === "ok" ? " ✓" : posthogStatus === "error" ? " ✗" : ""}
            </Button>
            <Button type="button" variant="secondary" onClick={testSentryClient}>
              Test Sentry (browser)
              {sentryClientStatus === "ok" ? " ✓" : sentryClientStatus === "error" ? " ✗" : ""}
            </Button>
            <Button type="button" variant="outline" onClick={() => void testSentryServer()}>
              Test Sentry (server)
              {sentryServerStatus === "ok" ? " ✓" : sentryServerStatus === "error" ? " ✗" : ""}
            </Button>
          </div>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
