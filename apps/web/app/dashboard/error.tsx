"use client";

import { useEffect } from "react";

import { ErrorFallback } from "@/components/error-fallback";

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorFallback
      title="Couldn't load this page"
      message="Something went wrong in your dashboard. Your data is safe — try loading again."
      onRetry={reset}
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
